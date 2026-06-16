namespace Leviathan.Server.Ariadne;

public sealed record LeviathanAppDto(
    string Id,
    string Kind,
    string Title,
    string Description,
    IReadOnlyList<string> Capabilities);

public sealed record CreateAriadneSessionRequest(string AppId);
public sealed record CreateAriadneSessionResponse(string SessionId, AriadneScreenDto Screen);
public sealed record AdvancePromptRequest(string PromptId, int Revision);
public sealed record ChoosePromptRequest(string PromptId, int Revision, string ChoiceKey);
public sealed record InputPromptRequest(string PromptId, int Revision, string Text);

public sealed record AriadneScreenDto(
    string SessionId,
    string AppId,
    string Title,
    int Revision,
    bool IsComplete,
    string? Error,
    IReadOnlyList<AriadneTranscriptLineDto> Transcript,
    AriadnePromptDto? Prompt);

public sealed record AriadneTranscriptLineDto(string Id, string Text, string? Speaker);

public sealed record AriadnePromptDto(
    string Id,
    string Kind,
    string? Text,
    IReadOnlyList<AriadneChoiceDto> Choices);

public sealed record AriadneChoiceDto(string Key, string Text);
