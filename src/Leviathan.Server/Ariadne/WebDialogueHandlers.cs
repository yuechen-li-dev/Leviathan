using Ariadne.OptFlow.Commands;
using Dominatus.Core.Runtime;

namespace Leviathan.Server.Ariadne;

internal sealed class WebDialogueBridge
{
    private long _nextPromptId = 1;

    public List<AriadneTranscriptLineDto> Transcript { get; } = new();
    public PendingPrompt? Pending { get; private set; }

    public ActuatorHost.HandlerResult ShowLine(ActuatorHost host, AiCtx ctx, ActuationId id, DiagLineCommand cmd)
    {
        Transcript.Add(new AriadneTranscriptLineDto($"line-{Transcript.Count + 1}", cmd.Text, cmd.Speaker));
        Pending = new PendingPrompt(NewPromptId(), "line", cmd.Text, cmd.Speaker, Array.Empty<AriadneChoiceDto>(), host, ctx, id);
        return ActuatorHost.HandlerResult.DeferredAccepted();
    }

    public ActuatorHost.HandlerResult Ask(ActuatorHost host, AiCtx ctx, ActuationId id, DiagAskCommand cmd)
    {
        Pending = new PendingPrompt(NewPromptId(), "text-input", cmd.Prompt, null, Array.Empty<AriadneChoiceDto>(), host, ctx, id);
        return ActuatorHost.HandlerResult.DeferredAccepted();
    }

    public ActuatorHost.HandlerResult Choose(ActuatorHost host, AiCtx ctx, ActuationId id, DiagChooseCommand cmd)
    {
        var choices = cmd.Options.Select(o => new AriadneChoiceDto(o.Key, o.Text)).ToArray();
        Pending = new PendingPrompt(NewPromptId(), "choice", cmd.Prompt, null, choices, host, ctx, id);
        return ActuatorHost.HandlerResult.DeferredAccepted();
    }

    public void CompletePending(string? payload = null)
    {
        if (Pending is null) return;
        if (Pending.Kind == "line")
            Pending.Host.CompleteLater(Pending.Ctx, Pending.ActuationId, Pending.Ctx.World.Clock.Time, ok: true);
        else
            Pending.Host.CompleteLater<string>(Pending.Ctx, Pending.ActuationId, Pending.Ctx.World.Clock.Time, ok: true, payload: payload ?? "");
        Pending = null;
    }

    private string NewPromptId() => $"prompt-{_nextPromptId++}";
}

internal sealed record PendingPrompt(
    string Id,
    string Kind,
    string? Text,
    string? Speaker,
    IReadOnlyList<AriadneChoiceDto> Choices,
    ActuatorHost Host,
    AiCtx Ctx,
    ActuationId ActuationId)
{
    public AriadnePromptDto ToDto() => new(Id, Kind, Text, Choices);
}

internal sealed class WebDiagLineHandler(WebDialogueBridge bridge) : IActuationHandler<DiagLineCommand>
{
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, DiagLineCommand cmd) => bridge.ShowLine(host, ctx, id, cmd);
}

internal sealed class WebDiagAskHandler(WebDialogueBridge bridge) : IActuationHandler<DiagAskCommand>
{
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, DiagAskCommand cmd) => bridge.Ask(host, ctx, id, cmd);
}

internal sealed class WebDiagChooseHandler(WebDialogueBridge bridge) : IActuationHandler<DiagChooseCommand>
{
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, DiagChooseCommand cmd) => bridge.Choose(host, ctx, id, cmd);
}
