# M4 Dominatus Persistence API Inventory

## Canonical save API

Dominatus Core exposes a chunked checkpoint pipeline in `Dominatus.Core.Persistence`:

1. `DominatusCheckpointBuilder.Capture(AiWorld world)` captures the current world checkpoint.
2. `DominatusSave.CreateCheckpointChunks(DominatusCheckpoint checkpoint, ReplayLog? replayLog = null, ISaveChunkContributor? extra = null)` turns that checkpoint into logical chunks.
3. `SaveFile.Write(path, chunks)` writes the `DOM1` binary chunk container.

The built-in chunk ids include `dom.meta`, `dom.hfsm`, `dom.replay`, `dom.bb`, and `dom.evcur`. M4 uses `dom.meta`/`dom.hfsm` through the canonical API and contributes one Leviathan companion UI chunk named `leviathan.ariadne.ui`.

## Canonical restore API

The restore path is the inverse:

1. `SaveFile.Read(path)` validates and reads a `DOM1` save file into `SaveChunk` values.
2. `DominatusSave.ReadCheckpointChunks(chunks, extra)` validates `dom.meta`, reads `dom.hfsm`, optionally reads `dom.replay`, and lets host code read extra chunks.
3. The host reconstructs the runtime graph/agents first.
4. `DominatusCheckpointBuilder.Restore(AiWorld world, DominatusCheckpoint checkpoint)` restores world blackboard, agent blackboards, active HFSM state paths, and in-flight actuation ids.

## Data included

Dominatus checkpoint capture includes:

- logical Dominatus save metadata/version in `dom.meta`;
- a `DominatusCheckpoint` JSON payload in `dom.hfsm`;
- world blackboard snapshot bytes;
- each agent id;
- each agent active HFSM path;
- each agent blackboard snapshot bytes;
- each agent event cursor/in-flight pending actuation ids;
- optional replay log when a caller supplies one;
- optional app/host chunks through `ISaveChunkContributor`.

## Data not included

The current Dominatus checkpoint model does not serialize compiler-generated node enumerator objects, the full event bus bucket contents, app-owned UI transcript/render state, or arbitrary host fields. Restore expects the app to rebuild the same graph/runtime topology before applying the checkpoint.

`AiClock` time is captured as `WorldTimeSeconds`, but the reviewed vendored implementation documents that restore does not fully restore private clock setters. M4 does not depend on exact clock continuity.

## Required registration before restore

The Ariadne/RustSimulator host must register the same dialogue actuation handlers and RustSimulator HFSM graph states before calling `DominatusCheckpointBuilder.Restore`. Agents are matched by stable Dominatus agent id string; RustSimulator currently uses the first agent id (`1`) in the reconstructed single-agent world.

## Pending actuation limitations

Dominatus stores in-flight actuation ids so replay can re-inject completions, but it does not store enough web UI details to redraw the current browser prompt by itself. In Leviathan, restoring the HFSM path and ticking re-dispatches the current Ariadne dialogue command, which creates a fresh pending web prompt that can be completed normally.

## Can pending Ariadne prompts be restored directly?

Not directly as browser prompts. The runtime truth remains Dominatus HFSM/blackboard/pending-actuation state, but the browser transcript, prompt numbering, and displayed pending prompt are host UI concerns. Leviathan therefore stores a minimal companion UI chunk containing only transcript lines, revision, and next prompt number. After Dominatus restore, Leviathan drains until the restored graph blocks on a new web prompt.

## Does Ariadne web need companion metadata?

Yes. Dominatus persistence does not know about Leviathan's browser transcript or prompt revision contract, so M4 stores minimal metadata in `leviathan.ariadne.ui`. The manifest remains metadata only; the checkpoint file is the runtime truth.
