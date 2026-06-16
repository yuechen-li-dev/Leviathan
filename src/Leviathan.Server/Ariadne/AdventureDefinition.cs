using Dominatus.Core.Hfsm;

namespace Leviathan.Server.Ariadne;

public sealed record AdventureDefinition(
    string Id,
    string Title,
    string Description,
    Action<HfsmGraph> RegisterStates);
