using System.ComponentModel;
using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.SemanticKernel;

namespace Leviathan.Server.Platform.Projects;

public sealed record PartFilter(string ReferenceId, string Table, Dictionary<string, double> Minimums, Dictionary<string, double> Maximums, string Text = "");
public sealed record ParameterColumn(string Column, string Parameter, string Unit);
public sealed record ParameterBinding(string ReferenceId, string Table, ParameterColumn[] Columns);
public sealed record ReviewCitation(string ReferenceId, string Locator, string Requirement, string Comment);
public sealed record ReviewPlan(string Title, ReviewCitation[] Evidence, string[] OpenIssues);

/// <summary>SK supplies schema discovery and typed binding. These functions expose evidence,
/// not geometry authority, supplier certification or engineering approval.</summary>
public sealed class EngineeringTools(EngineeringReference[] references, string root, IReadOnlyDictionary<string, string> documentHashes, string requirements)
{
    private EngineeringReference Reference(string id) => references.SingleOrDefault(r => r.Id == id)
        ?? throw new InvalidOperationException("Reference is not attached to this workspace.");
    private (EngineeringReference Reference, ReferenceTable Table) Table(string id, string name)
    {
        var reference = Reference(id);
        return (reference, reference.Tables.SingleOrDefault(t => t.Name == name) ?? throw new InvalidOperationException("Unknown reference table. Read the reference manifest first."));
    }
    private static object Citation(EngineeringReference reference, string locator, string text) => new { referenceId = reference.Id, reference.Name, reference.Sha256, locator, text, status = "source-evidence-not-compiler-proof" };

    [KernelFunction("search_references"), Description("Search attached engineering references by literal words. Returns exact excerpts with document hashes and page/paragraph/line locations. Empty query lists reference IDs, table names and columns. No external documents are fetched.")]
    public object SearchReferences(string query, CancellationToken cancellationToken)
    {
        var terms = query.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var matches = new List<object>();
        foreach (var reference in references)
        foreach (var section in reference.Sections)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (terms.Length == 0 || !terms.All(t => section.Text.Contains(t, StringComparison.OrdinalIgnoreCase))) continue;
            var first = section.Text.IndexOf(terms[0], StringComparison.OrdinalIgnoreCase); int start = Math.Max(0, first - 180);
            matches.Add(Citation(reference, section.Locator, section.Text.Substring(start, Math.Min(1200, section.Text.Length - start))));
            if (matches.Count == 20) break;
        }
        return new { references = references.Select(r => new { r.Id, r.Name, r.Sha256, sections = r.Sections.Select(s => s.Locator), tables = r.Tables.Select(t => new { t.Name, t.Columns, rows = t.Rows.Length }) }), matches };
    }

    [KernelFunction("read_reference"), Description("Read one attached reference section by exact locator, or a table by its name. Preserves cell addresses and flags formulas. Formula caches are not evaluated values.")]
    public object ReadReference(string referenceId, string locator)
    {
        var reference = Reference(referenceId);
        var section = reference.Sections.SingleOrDefault(s => s.Locator == locator);
        if (section is not null) return Citation(reference, section.Locator, section.Text);
        var table = reference.Tables.SingleOrDefault(t => t.Name == locator) ?? throw new InvalidOperationException("Unknown section or table locator.");
        return new { referenceId, reference.Name, reference.Sha256, table };
    }

    [KernelFunction("find_parts"), Description("Filter rows of an attached CSV/XLSX parts catalog by explicit numeric column bounds and optional text. Column units must be established by the document/user. Returns candidate rows with cell provenance, not a fit certification, price quote or purchase. Formula cells cannot satisfy numeric constraints.")]
    public object FindParts(PartFilter filter, CancellationToken cancellationToken)
    {
        var (reference, table) = Table(filter.ReferenceId, filter.Table);
        foreach (var column in filter.Minimums.Keys.Concat(filter.Maximums.Keys))
            if (!table.Columns.Contains(column, StringComparer.Ordinal)) throw new InvalidOperationException("Unknown catalog filter column: " + column);
        var matches = new List<object>();
        foreach (var row in table.Rows)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var values = table.Columns.Select((name, i) => (name, cell: row[i])).ToDictionary(x => x.name, x => x.cell);
            bool Bound(KeyValuePair<string, double> bound, bool minimum) => !values[bound.Key].Formula && double.IsFinite(bound.Value)
                && double.TryParse(values[bound.Key].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value)
                && (minimum ? value >= bound.Value : value <= bound.Value);
            if (filter.Minimums.All(b => Bound(b, true)) && filter.Maximums.All(b => Bound(b, false))
                && (string.IsNullOrWhiteSpace(filter.Text) || row.Any(c => c.Value.Contains(filter.Text, StringComparison.OrdinalIgnoreCase))))
                matches.Add(new { cells = values });
        }
        return new { referenceId = reference.Id, reference.Name, reference.Sha256, matches = matches.Take(100), totalMatches = matches.Count, status = "catalog-candidates-not-verified-fit" };
    }

    [KernelFunction("bind_parameters"), Description("Project literal numeric worksheet/CSV cells into proposed Firmament parameters with explicit units: mm, cm, m, in, deg, rad or scalar. The table's first row is its column header. Preserves each source cell/hash. Rejects formulas, invalid names and nonnumeric cells; does not edit or build source. Use edit_file and build to apply proposals.")]
    public object BindParameters(ParameterBinding binding, CancellationToken cancellationToken)
    {
        var (reference, table) = Table(binding.ReferenceId, binding.Table);
        if (binding.Columns.Length is 0 or > 64 || binding.Columns.Select(c => c.Parameter).Distinct(StringComparer.Ordinal).Count() != binding.Columns.Length)
            throw new InvalidOperationException("Supply 1–64 uniquely named parameter mappings.");
        foreach (var column in binding.Columns)
            if (!table.Columns.Contains(column.Column, StringComparer.Ordinal) || column.Parameter.Length == 0
                || !(char.IsAsciiLetter(column.Parameter[0]) || column.Parameter[0] == '_') || column.Parameter.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_')
                || column.Unit is not ("mm" or "cm" or "m" or "in" or "deg" or "rad" or "scalar"))
                throw new InvalidOperationException("Use existing columns, valid parameter identifiers and explicit supported units.");
        var rows = table.Rows.Select(row => {
            cancellationToken.ThrowIfCancellationRequested();
            return binding.Columns.Select(column => {
                var cell = row[Array.IndexOf(table.Columns, column.Column)];
                if (cell.Formula || !double.TryParse(cell.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
                    throw new InvalidOperationException("Parameter cell must be a literal finite number: " + cell.Address);
                return new { column.Parameter, authoredValue = value.ToString("R", CultureInfo.InvariantCulture) + (column.Unit == "scalar" ? "" : column.Unit),
                    dimension = column.Unit == "scalar" ? "Scalar" : column.Unit is "deg" or "rad" ? "Angle" : "Length", cell.Address, sourceValue = cell.Value };
            }).ToArray();
        }).ToArray();
        return new { referenceId = reference.Id, reference.Name, reference.Sha256, rows, status = "parameter-proposals-not-applied" };
    }

    [KernelFunction("prepare_review"), Description("Prepare a draft review manifest tied to current source hashes and requirements. Supply cited requirements/comments and open issues. Cited locations must exist in attached references. No approval, tolerance or manufacturability claim is created. After a successful current candidate build, use export_review to bundle this manifest with source and real compiler exports.")]
    public object PrepareReview(ReviewPlan plan)
    {
        if (string.IsNullOrWhiteSpace(plan.Title) || plan.Evidence.Length > 100 || plan.OpenIssues.Length > 100) throw new InvalidOperationException("Review needs a title and at most 100 citations/issues.");
        return new { plan.Title, root, documentHashes, requirements, status = "draft-for-human-review", approved = false,
            evidence = plan.Evidence.Select(e => new { e.Requirement, e.Comment, source = ReadReference(e.ReferenceId, e.Locator) }).ToArray(), plan.OpenIssues };
    }
}
