/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { A } from "machinalayout/async";
import { useAsyncTask } from "./useAsyncTask";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncTask", () => {
  it("starts idle and transitions to running synchronously on run()", async () => {
    const gate = deferred<void>();
    const task = A.task({
      id: "test-task",
      env: {},
      run: async () => {
        await gate.promise;
        return A.ok("done");
      },
    });

    const { result } = renderHook(() => useAsyncTask(task));
    expect(result.current.snapshot.board.status).toBe("idle");

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(undefined);
    });
    // Running immediately, before the task's own promise resolves.
    expect(result.current.snapshot.board.status).toBe("running");

    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(result.current.snapshot.board.status).toBe("succeeded");
    expect(result.current.snapshot.board.result).toBe("done");
  });

  it("reflects a failed run", async () => {
    const task = A.task({
      id: "failing-task",
      env: {},
      run: async () => A.err({ message: "boom" }),
    });
    const { result } = renderHook(() => useAsyncTask(task));

    await act(async () => {
      await result.current.run(undefined);
    });
    expect(result.current.snapshot.board.status).toBe("failed");
    expect(result.current.snapshot.board.error).toEqual({ message: "boom" });
  });

  it("starting a new run cancels the previous one - the exact stale-completion protection this was adopted for", async () => {
    const first = deferred<void>();
    const calls: string[] = [];
    const task = A.task({
      id: "racy-task",
      env: {},
      run: async (_env, input: string, ctx) => {
        calls.push(`start:${input}`);
        if (input === "first") {
          await first.promise;
        }
        if (ctx.signal.aborted) {
          return A.cancelled("aborted");
        }
        return A.ok(input);
      },
    });

    const { result } = renderHook(() => useAsyncTask(task));

    let firstRun!: Promise<unknown>;
    act(() => {
      firstRun = result.current.run("first");
    });
    expect(result.current.snapshot.board.status).toBe("running");

    let secondRun!: Promise<unknown>;
    await act(async () => {
      secondRun = result.current.run("second");
      await secondRun;
    });

    // Second run wins - board reflects "second", not a stale "first".
    expect(result.current.snapshot.board.result).toBe("second");
    expect(result.current.snapshot.board.runId).toBe(2);

    await act(async () => {
      first.resolve();
      await firstRun;
    });
    // Resolving the first run's underlying promise late must NOT clobber
    // the board that the second (current) run already settled - this is
    // the actual regression this hook exists to prevent.
    expect(result.current.snapshot.board.result).toBe("second");
    expect(result.current.snapshot.board.runId).toBe(2);
  });

  it("cancel() stops a running task and reflects cancelled status", async () => {
    const gate = deferred<void>();
    const task = A.task({
      id: "cancellable-task",
      env: {},
      run: async (_env, _input: void, ctx) => {
        await gate.promise;
        if (ctx.signal.aborted) return A.cancelled("user cancelled");
        return A.ok("finished");
      },
    });

    const { result } = renderHook(() => useAsyncTask(task));
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(undefined);
    });

    act(() => {
      result.current.cancel("user cancelled");
    });
    expect(result.current.snapshot.board.status).toBe("cancelled");

    gate.resolve();
    await pending;
  });
});
