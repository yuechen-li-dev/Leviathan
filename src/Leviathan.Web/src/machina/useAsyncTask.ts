// React hook wrapper for machinalayout/async's AsyncTaskController. Doesn't
// exist upstream yet (checked all of src/react*, src/vue - genuinely
// missing, unlike useDeusMachine which turned out to already exist).
// Built here out of necessity for the scheduling app's M2 (reschedule
// port); platform-shared, not scheduling-specific, so it lives alongside
// useLeviathanInspector rather than inside apps/scheduling. Recommended for
// upstreaming into machinalayout/react once proven here.
//
// AsyncTaskController is pull-based (getSnapshot()/getBoard()), not
// subscription-based - `start()` transitions the board to "running"
// synchronously before any await, so this hook re-reads the snapshot right
// after calling start() (to catch that transition) and again when the
// returned promise settles.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createController,
  type AsyncTask,
  type AsyncTaskController,
  type AsyncTaskResult,
  type AsyncTaskSnapshot,
} from "machinalayout/async";

export type UseAsyncTaskResult<TEnv, TInput, TOutput, TError> = {
  snapshot: AsyncTaskSnapshot<TInput, TOutput, TError>;
  run: (input: TInput) => Promise<AsyncTaskResult<TOutput, TError>>;
  cancel: (reason?: string) => void;
};

/**
 * `task` should be a stable reference - define it once (module scope, or
 * memoized), the same convention `useDeusMachine` expects for its machine
 * argument. This hook creates exactly one controller for the lifetime of
 * the component and never re-creates it if `task` changes identity across
 * renders.
 */
export function useAsyncTask<TEnv, TInput, TOutput, TError>(
  task: AsyncTask<TEnv, TInput, TOutput, TError>,
): UseAsyncTaskResult<TEnv, TInput, TOutput, TError> {
  const controllerRef = useRef<AsyncTaskController<TEnv, TInput, TOutput, TError> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createController(task);
  }

  const [snapshot, setSnapshot] = useState(() => controllerRef.current!.getSnapshot());

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
      controllerRef.current?.cancel("unmounted");
    },
    [],
  );

  const run = useCallback((input: TInput) => {
    const controller = controllerRef.current!;
    const pending = controller.start(input);
    // Catches the synchronous idle -> running transition immediately, so a
    // caller reading `snapshot.board.status` right after calling `run`
    // already sees "running", not a stale "idle" until the next render.
    setSnapshot(controller.getSnapshot());
    void pending.then(() => {
      if (!mountedRef.current) return;
      setSnapshot(controller.getSnapshot());
    });
    return pending;
  }, []);

  const cancel = useCallback((reason?: string) => {
    const controller = controllerRef.current!;
    controller.cancel(reason);
    setSnapshot(controller.getSnapshot());
  }, []);

  return { snapshot, run, cancel };
}
