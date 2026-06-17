# M4 Dominatus Chunk Session Persistence

## Purpose

M4 makes Leviathan's Ariadne RustSimulator sessions survive browser refresh, in-memory session-manager misses, and server restarts by saving and restoring Dominatus chunk checkpoints.

## Why no database

Dominatus already ships a file-based chunk persistence model. M4 intentionally uses that model directly and does not add SQLite, EF Core, LiteDB, Postgres, Redis, or any other database.

## Dominatus persistence API used

- Save: `DominatusCheckpointBuilder.Capture` -> `DominatusSave.CreateCheckpointChunks` -> `SaveFile.Write`.
- Restore: `SaveFile.Read` -> `DominatusSave.ReadCheckpointChunks` -> reconstruct RustSimulator runtime -> `DominatusCheckpointBuilder.Restore` -> drain until the web prompt blocks.
- Companion chunk: `leviathan.ariadne.ui`, written through `ISaveChunkContributor`, contains only UI transcript/revision/prompt-number metadata.

## File layout

The storage root is `LEVIATHAN_DATA_DIR` when set; otherwise it defaults to `data` under the server content root.

```text
data/
  ariadne/
    rust_simulator/
      sessions/
        {sessionId}/
          manifest.json
          checkpoint.dom1
```

`manifest.json` contains session id, app id, created/updated timestamps, completion status, persistence format, and current checkpoint filename. Runtime truth remains in `checkpoint.dom1`.

## Session lifecycle

1. Creating a RustSimulator session drains to the first pending prompt.
2. Leviathan immediately writes a Dominatus checkpoint.
3. Successful advance/choice/input actions drain to the next prompt/completion.
4. Leviathan writes a replacement checkpoint and updates the manifest.
5. Failed submissions do not save.

## Restore flow

`GET /api/ariadne/sessions/{sessionId}/screen` first checks memory. If the session is not loaded, Leviathan reads the checkpoint file, rebuilds the RustSimulator HFSM runtime, applies the Dominatus checkpoint, restores the minimal UI chunk, drains to a pending prompt, and returns the screen with `wasRestored: true`.

Unknown sessions return 404. Corrupt or unrestorable sessions return a controlled problem response instead of crashing the server.

## Frontend resume behavior

The web shell stores the last RustSimulator session id in `localStorage` as `leviathan.rustSimulator.lastSessionId` after start/open/update. `/apps/rust-simulator` attempts to open that saved session id and starts a new session only when none is known. `/apps/rust-simulator/sessions/{sessionId}` opens that exact persisted session. History and popstate continue to dispatch route events.

The debug inspector summary includes the current session id and `wasRestored` flag.

## Known limitations

- Pending browser prompts are rehydrated by restoring Dominatus runtime state and re-dispatching the active dialogue command, not by directly deserializing a browser prompt object.
- The companion UI chunk is required for transcript/revision continuity.
- M4 is scoped to the single Ariadne RustSimulator app.

## Manual verification steps

1. Start backend with `LEVIATHAN_DATA_DIR=/tmp/leviathan-m4-data`.
2. Start frontend.
3. Open RustSimulator.
4. Advance or choose at least once.
5. Refresh and verify the same session resumes.
6. Stop and restart backend.
7. Open `/apps/rust-simulator/sessions/{sessionId}`.
8. Verify the session restores and can advance again.
9. Confirm `checkpoint.dom1` timestamp updates.

## Recommended M5

Add focused automated backend integration tests around restore-after-process-restart semantics, add a small debug screen listing local sessions, and evaluate replay-log use if Ariadne adds non-dialogue external actuations.
