using Dominatus.Core.Blackboard;
using Dominatus.Core.Hfsm;
using Dominatus.Core.Runtime;
using Dominatus.Core.Persistence;

namespace Leviathan.Server.Ariadne;

public sealed class AriadneSession
{
    private const int MaxTicksPerDrain = 500;
    private static readonly BbKey<bool> AdventureComplete = new("System.AdventureComplete");

    private readonly object _gate = new();
    private readonly WebDialogueBridge _bridge;
    private readonly AiWorld _world;
    private readonly AiAgent _agent;
    private readonly string _title;
    private int _revision;
    private string? _error;

    public AriadneSession(string id, AdventureDefinition adventure)
        : this(id, adventure, drain: true)
    {
    }

    private AriadneSession(string id, AdventureDefinition adventure, bool drain)
    {
        Id = id;
        AppId = adventure.Id;
        _title = adventure.Title;
        _bridge = new WebDialogueBridge();

        var host = new ActuatorHost();
        host.Register(new WebDiagLineHandler(_bridge));
        host.Register(new WebDiagAskHandler(_bridge));
        host.Register(new WebDiagChooseHandler(_bridge));

        _world = new AiWorld(host);
        var graph = new HfsmGraph { Root = "Root" };
        adventure.RegisterStates(graph);
        var brain = new HfsmInstance(graph, new HfsmOptions { KeepRootFrame = true });
        _agent = new AiAgent(brain);
        _world.Add(_agent);

        if (drain) DrainUntilBlocked();
    }

    public string Id { get; }
    public string AppId { get; }
    public bool WasRestored { get; private set; }

    public IReadOnlyList<SaveChunk> CreateCheckpointChunks()
    {
        lock (_gate)
        {
            var checkpoint = DominatusCheckpointBuilder.Capture(_world);
            var ui = new AriadneUiCheckpoint(1, _revision, _bridge.Transcript.ToArray(), _bridge.NextPromptNumber, WasRestored);
            return DominatusSave.CreateCheckpointChunks(checkpoint, extra: new AriadneUiChunkContributor(ui));
        }
    }

    public static AriadneSession Restore(string id, AdventureDefinition adventure, IReadOnlyList<SaveChunk> chunks)
    {
        var uiContributor = new AriadneUiChunkContributor();
        var (checkpoint, _) = DominatusSave.ReadCheckpointChunks(chunks, uiContributor);
        var session = new AriadneSession(id, adventure, drain: false);
        session.WasRestored = true;
        DominatusCheckpointBuilder.Restore(session._world, checkpoint);
        if (uiContributor.Read is { } ui)
        {
            session._revision = ui.Revision;
            session._bridge.RestoreUi(ui.Transcript, ui.NextPromptNumber);
        }
        session.DrainUntilBlocked();
        session.TrimDuplicateRestoredLine();
        return session;
    }

    public AriadneScreenDto Screen()
    {
        lock (_gate) return ToScreen();
    }

    public (bool Ok, string? Error, AriadneScreenDto? Screen) Advance(string promptId, int revision)
    {
        lock (_gate)
        {
            var validation = ValidatePrompt(promptId, revision, "line");
            if (validation is not null) return (false, validation, null);
            _bridge.CompletePending();
            _revision++;
            DrainUntilBlocked();
            return (true, null, ToScreen());
        }
    }

    public (bool Ok, string? Error, AriadneScreenDto? Screen) Choose(string promptId, int revision, string choiceKey)
    {
        lock (_gate)
        {
            var validation = ValidatePrompt(promptId, revision, "choice");
            if (validation is not null) return (false, validation, null);
            var pending = _bridge.Pending!;
            if (!pending.Choices.Any(c => c.Key == choiceKey)) return (false, $"Invalid choice key '{choiceKey}'.", null);
            _bridge.CompletePending(choiceKey);
            _revision++;
            DrainUntilBlocked();
            return (true, null, ToScreen());
        }
    }

    public (bool Ok, string? Error, AriadneScreenDto? Screen) Input(string promptId, int revision, string text)
    {
        lock (_gate)
        {
            var validation = ValidatePrompt(promptId, revision, "text-input");
            if (validation is not null) return (false, validation, null);
            _bridge.CompletePending(text);
            _revision++;
            DrainUntilBlocked();
            return (true, null, ToScreen());
        }
    }

    private string? ValidatePrompt(string promptId, int revision, string expectedKind)
    {
        if (revision != _revision) return $"Stale revision. Current revision is {_revision}.";
        if (_bridge.Pending is null) return "No prompt is pending.";
        if (_bridge.Pending.Id != promptId) return $"Unknown prompt '{promptId}'.";
        if (_bridge.Pending.Kind != expectedKind) return $"Wrong prompt kind. Expected '{expectedKind}' but current prompt is '{_bridge.Pending.Kind}'.";
        return null;
    }

    private void DrainUntilBlocked()
    {
        try
        {
            for (var i = 0; i < MaxTicksPerDrain; i++)
            {
                if (_bridge.Pending is not null || _agent.Bb.GetOrDefault(AdventureComplete, false)) return;
                _world.Tick(0.01f);
                if (_bridge.Pending is not null || _agent.Bb.GetOrDefault(AdventureComplete, false)) return;
            }
            _error = $"Max tick guard ({MaxTicksPerDrain}) reached before a prompt or completion.";
        }
        catch (Exception ex)
        {
            _error = ex.ToString();
        }
    }

    private void TrimDuplicateRestoredLine()
    {
        if (_bridge.Pending?.Kind != "line" || _bridge.Transcript.Count < 2) return;
        var last = _bridge.Transcript[^1];
        var previous = _bridge.Transcript[^2];
        if (last.Text == previous.Text && last.Speaker == previous.Speaker) _bridge.Transcript.RemoveAt(_bridge.Transcript.Count - 1);
    }

    private AriadneScreenDto ToScreen() => new(
        SessionId: Id,
        AppId: AppId,
        Title: _title,
        Revision: _revision,
        IsComplete: _agent.Bb.GetOrDefault(AdventureComplete, false),
        Error: _error,
        Transcript: _bridge.Transcript.ToArray(),
        Prompt: _bridge.Pending?.ToDto(),
        WasRestored: WasRestored);
}
