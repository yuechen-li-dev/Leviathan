using System.Text;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Dominatus.Actuators.SemanticKernel;
using Leviathan.Server.Platform.Projects;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class EngineeringToolsTests
{
    [Fact]
    public void PDF_and_DOCX_extraction_retains_real_document_locations()
    {
        var builder = new UglyToad.PdfPig.Writer.PdfDocumentBuilder();
        var font = builder.AddStandard14Font(UglyToad.PdfPig.Fonts.Standard14Fonts.Standard14Font.Helvetica);
        builder.AddPage(300, 300).AddText("Motor pitch 31 mm", 12, new UglyToad.PdfPig.Core.PdfPoint(20, 250), font);
        var pdf = EngineeringReferenceReader.Read("motor.pdf", builder.Build(), TestContext.Current.CancellationToken);
        Assert.Equal("page:1", pdf.Sections[0].Locator); Assert.Contains("31 mm", pdf.Sections[0].Text);
        using var stream = new MemoryStream();
        using (var docx = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document, true))
        {
            var part = docx.AddMainDocumentPart(); part.Document = new DocumentFormat.OpenXml.Wordprocessing.Document(new DocumentFormat.OpenXml.Wordprocessing.Body(
                new DocumentFormat.OpenXml.Wordprocessing.Paragraph(new DocumentFormat.OpenXml.Wordprocessing.Run(new DocumentFormat.OpenXml.Wordprocessing.Text("Use four holes")))));
        }
        var word = EngineeringReferenceReader.Read("requirements.docx", stream.ToArray(), TestContext.Current.CancellationToken);
        Assert.Equal("paragraph:1", word.Sections[0].Locator); Assert.Equal("Use four holes", word.Sections[0].Text);
    }
    [Fact]
    public async Task Real_SK_tools_find_catalog_rows_bind_typed_cells_and_prepare_cited_review()
    {
        var ct = TestContext.Current.CancellationToken;
        var reference = EngineeringReferenceReader.Read("motors.csv", Encoding.UTF8.GetBytes("sku,widthMm,boreMm\nM17,42,5\nM23,56,8\n"), ct);
        var document = EngineeringReferenceReader.Read("requirements.md", Encoding.UTF8.GetBytes("Motor plate width must be 56 mm.\nUse four mounting holes."), ct);
        var kernel = EngineeringToolEndpoints.KernelFor([reference, document], "plate.firmament", new Dictionary<string, string> { ["plate.firmament"] = "source-hash" }, "Preserve holes");
        var handler = new SemanticKernelActuationHandler(kernel, EngineeringToolEndpoints.Options);
        async Task<JsonElement> Invoke(string name, object args)
        {
            var result = await handler.HandleAsync(default, new("engineering", name, JsonSerializer.Serialize(args)), ct);
            Assert.True(result.Ok, result.Error); return JsonSerializer.Deserialize<JsonElement>(((SemanticKernelFunctionResult)result.Payload!).ResultText);
        }
        var search = await Invoke("search_references", new { query = "width" });
        Assert.Equal(document.Sha256, search.GetProperty("matches")[0].GetProperty("sha256").GetString());
        Assert.Equal("line:1", search.GetProperty("matches")[0].GetProperty("locator").GetString());
        var parts = await Invoke("find_parts", new { filter = new PartFilter(reference.Id, "CSV", new() { ["boreMm"] = 8 }, new() { ["widthMm"] = 60 }) });
        Assert.Equal(1, parts.GetProperty("totalMatches").GetInt32());
        Assert.Equal("M23", parts.GetProperty("matches")[0].GetProperty("cells").GetProperty("sku").GetProperty("value").GetString());
        var binding = await Invoke("bind_parameters", new { binding = new ParameterBinding(reference.Id, "CSV", [new("widthMm", "width", "mm")]) });
        Assert.Equal("56mm", binding.GetProperty("rows")[1][0].GetProperty("authoredValue").GetString());
        Assert.Equal("Length", binding.GetProperty("rows")[1][0].GetProperty("dimension").GetString());
        Assert.Equal("record:3:column:2", binding.GetProperty("rows")[1][0].GetProperty("address").GetString());
        var review = await Invoke("prepare_review", new { plan = new ReviewPlan("Plate review", [new(document.Id, "line:1", "Width", "Check against actual compiled bounds")], ["Tolerances require engineering review"]) });
        Assert.False(review.GetProperty("approved").GetBoolean());
        Assert.Equal("source-hash", review.GetProperty("documentHashes").GetProperty("plate.firmament").GetString());
        Assert.Contains("56 mm", review.GetProperty("evidence")[0].GetProperty("source").GetProperty("text").GetString());
    }

    [Fact]
    public void OpenXml_worksheet_preserves_real_cells_and_does_not_admit_cached_formula_values()
    {
        using var stream = new MemoryStream();
        using (var workbook = SpreadsheetDocument.Create(stream, SpreadsheetDocumentType.Workbook, true))
        {
            var part = workbook.AddWorkbookPart(); part.Workbook = new Workbook();
            var worksheet = part.AddNewPart<WorksheetPart>();
            worksheet.Worksheet = new Worksheet(new SheetData(
                new Row(new Cell { CellReference = "A1", DataType = CellValues.InlineString, InlineString = new InlineString(new Text("widthMm")) }) { RowIndex = 1 },
                new Row(new Cell { CellReference = "A2", CellValue = new CellValue("56") }) { RowIndex = 2 },
                new Row(new Cell { CellReference = "A3", CellFormula = new CellFormula("A2*2"), CellValue = new CellValue("112") }) { RowIndex = 3 }));
            part.Workbook.AppendChild(new Sheets(new Sheet { Id = part.GetIdOfPart(worksheet), SheetId = 1, Name = "Variants" }));
        }
        var reference = EngineeringReferenceReader.Read("variants.xlsx", stream.ToArray(), TestContext.Current.CancellationToken);
        Assert.Equal("Variants!A2", reference.Tables[0].Rows[0][0].Address);
        Assert.True(reference.Tables[0].Rows[1][0].Formula);
        var tools = new EngineeringTools([reference], "part", new Dictionary<string, string>(), "");
        Assert.Throws<InvalidOperationException>(() => tools.BindParameters(new(reference.Id, "Variants", [new("widthMm", "width", "mm")]), TestContext.Current.CancellationToken));
    }

    [Fact]
    public void Missing_sources_bad_units_and_ambiguous_headers_reject_instead_of_inventing_evidence()
    {
        var ct = TestContext.Current.CancellationToken;
        Assert.Throws<InvalidOperationException>(() => EngineeringReferenceReader.Read("bad.csv", Encoding.UTF8.GetBytes("width,width\n1,2"), ct));
        var reference = EngineeringReferenceReader.Read("good.csv", Encoding.UTF8.GetBytes("width\n56"), ct);
        var tools = new EngineeringTools([reference], "part", new Dictionary<string, string>(), "");
        Assert.Throws<InvalidOperationException>(() => tools.ReadReference("foreign", "line:1"));
        Assert.Throws<InvalidOperationException>(() => tools.BindParameters(new(reference.Id, "CSV", [new("width", "width", "guess")]), ct));
        Assert.Throws<InvalidOperationException>(() => tools.PrepareReview(new("Review", [new(reference.Id, "invented-page", "Width", "")], [])));
    }
}
