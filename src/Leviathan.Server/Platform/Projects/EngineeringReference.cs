using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.VisualBasic.FileIO;
using UglyToad.PdfPig;

namespace Leviathan.Server.Platform.Projects;

public sealed record ReferenceSection(string Locator, string Text);
public sealed record ReferenceCell(string Address, string Value, bool Formula = false);
public sealed record ReferenceTable(string Name, string[] Columns, ReferenceCell[][] Rows);
public sealed record EngineeringReference(string Id, string Name, string Sha256, ReferenceSection[] Sections, ReferenceTable[] Tables);

/// <summary>Extraction, not interpretation. Original bytes remain separately stored; no OCR,
/// formula evaluation or numeric/unit inference is claimed.</summary>
public static class EngineeringReferenceReader
{
    public const int MaxBytes = 4 * 1024 * 1024;
    public static EngineeringReference Read(string name, byte[] bytes, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200 || bytes.Length is 0 or > MaxBytes)
            throw new InvalidOperationException("Reference needs a filename and 1–4 MiB of content.");
        var sections = new List<ReferenceSection>(); var tables = new List<ReferenceTable>();
        var extension = Path.GetExtension(name).ToLowerInvariant();
        if (extension is ".xlsx" or ".docx")
        {
            using var zip = new ZipArchive(new MemoryStream(bytes));
            if (zip.Entries.Count > 2000 || zip.Entries.Sum(e => e.Length) > 32 * 1024 * 1024)
                throw new InvalidOperationException("Expanded Office document exceeds the reference budget.");
        }
        switch (extension)
        {
            case ".txt": case ".md":
                var lines = new UTF8Encoding(false, true).GetString(bytes).Replace("\r\n", "\n").Split('\n');
                for (int i = 0; i < lines.Length; i++) { ct.ThrowIfCancellationRequested(); if (!string.IsNullOrWhiteSpace(lines[i])) sections.Add(new($"line:{i + 1}", lines[i])); }
                break;
            case ".pdf":
                using (var document = PdfDocument.Open(bytes))
                {
                    if (document.NumberOfPages > 100) throw new InvalidOperationException("PDF reference is limited to 100 pages.");
                    foreach (var page in document.GetPages()) { ct.ThrowIfCancellationRequested(); sections.Add(new($"page:{page.Number}", string.Join(" ", page.GetWords().Select(w => w.Text)))); }
                }
                if (sections.Any(s => string.IsNullOrWhiteSpace(s.Text))) throw new InvalidOperationException("PDF contains a page without extractable text. OCR is not supported; supply a text-bearing document.");
                break;
            case ".docx":
                using (var document = WordprocessingDocument.Open(new MemoryStream(bytes), false))
                {
                    var paragraphs = document.MainDocumentPart?.Document.Body?.Descendants<DocumentFormat.OpenXml.Wordprocessing.Paragraph>().ToArray() ?? [];
                    for (int i = 0; i < paragraphs.Length; i++) { ct.ThrowIfCancellationRequested(); if (!string.IsNullOrWhiteSpace(paragraphs[i].InnerText)) sections.Add(new($"paragraph:{i + 1}", paragraphs[i].InnerText)); }
                }
                break;
            case ".csv":
                using (var parser = new TextFieldParser(new StringReader(new UTF8Encoding(false, true).GetString(bytes))) { HasFieldsEnclosedInQuotes = true, TrimWhiteSpace = false })
                {
                    parser.SetDelimiters(","); var rows = new List<ReferenceCell[]>();
                    while (!parser.EndOfData) { ct.ThrowIfCancellationRequested(); var values = parser.ReadFields()!; rows.Add(values.Select((v, i) => new ReferenceCell($"record:{rows.Count + 1}:column:{i + 1}", v)).ToArray()); if (rows.Count > 2001) throw new InvalidOperationException("Table exceeds 2000 data rows."); }
                    tables.Add(Table("CSV", rows));
                }
                break;
            case ".xlsx":
                using (var workbook = SpreadsheetDocument.Open(new MemoryStream(bytes), false))
                {
                    var part = workbook.WorkbookPart!;
                    var strings = part.SharedStringTablePart?.SharedStringTable.Elements<SharedStringItem>().Select(s => s.InnerText).ToArray() ?? [];
                    foreach (var sheet in part.Workbook.Sheets!.Elements<Sheet>())
                    {
                        ct.ThrowIfCancellationRequested(); var sheetPart = (WorksheetPart)part.GetPartById(sheet.Id!);
                        var sourceRows = sheetPart.Worksheet.Descendants<Row>().ToArray();
                        if (sourceRows.Length > 2001) throw new InvalidOperationException("Worksheet exceeds 2000 data rows.");
                        var rows = new List<ReferenceCell[]>(); int width = 0;
                        foreach (var row in sourceRows)
                        {
                            var cells = row.Elements<Cell>().ToArray();
                            int Column(Cell cell) { int n = 0; foreach (char c in cell.CellReference!.Value!) { if (!char.IsAsciiLetterUpper(c)) break; n = n * 26 + c - 'A' + 1; } return n; }
                            if (rows.Count == 0) width = cells.Length == 0 ? 0 : cells.Max(Column);
                            if (width is 0 or > 64 || cells.Any(c => Column(c) > width)) throw new InvalidOperationException("Worksheet needs headers in row 1 and at most 64 columns, with no data beyond its headers.");
                            var values = Enumerable.Range(1, width).Select(i => new ReferenceCell($"{sheet.Name}!{ColumnName(i)}{row.RowIndex}", "")).ToArray();
                            foreach (var cell in cells)
                            {
                                var value = cell.CellValue?.Text ?? cell.InlineString?.InnerText ?? "";
                                if (cell.DataType?.Value == CellValues.SharedString) value = strings[int.Parse(value, CultureInfo.InvariantCulture)];
                                // A cached formula result is not a recalculated engineering value.
                                values[Column(cell) - 1] = new($"{sheet.Name}!{cell.CellReference}", cell.CellFormula is null ? value : cell.CellFormula.Text, cell.CellFormula is not null);
                            }
                            rows.Add(values);
                        }
                        if (rows.Count > 0) tables.Add(Table(sheet.Name!, rows));
                    }
                }
                break;
            default: throw new InvalidOperationException("Use TXT, Markdown, text-bearing PDF, DOCX, CSV or XLSX references.");
        }
        if (sections.Sum(s => s.Text.Length) + tables.Sum(t => t.Rows.Sum(r => r.Sum(c => c.Value.Length))) > 1_000_000 || sections.Count > 20_000 || tables.Count > 20)
            throw new InvalidOperationException("Extracted reference exceeds the text/table budget.");
        if (sections.Count == 0 && tables.Count == 0) throw new InvalidOperationException("Reference has no readable content.");
        return new(Guid.NewGuid().ToString("N"), Path.GetFileName(name), Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), sections.ToArray(), tables.ToArray());
    }
    private static string ColumnName(int column) { var result = ""; while (column > 0) { column--; result = (char)('A' + column % 26) + result; column /= 26; } return result; }
    private static ReferenceTable Table(string name, List<ReferenceCell[]> rows)
    {
        if (rows.Count == 0 || rows[0].Length is 0 or > 64) throw new InvalidOperationException("Table needs a header row and at most 64 columns.");
        var headers = rows[0].Select(c => c.Value).ToArray();
        if (rows[0].Any(c => c.Formula) || headers.Any(string.IsNullOrWhiteSpace) || headers.Distinct(StringComparer.Ordinal).Count() != headers.Length || rows.Any(r => r.Length != headers.Length))
            throw new InvalidOperationException("Table headers must be literal, nonempty and unique; every row must match its header width.");
        return new(name, headers, rows.Skip(1).ToArray());
    }
}
