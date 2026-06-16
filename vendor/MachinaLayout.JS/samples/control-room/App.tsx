import { useMemo, useState } from "react";
import {
  MachinaReactView,
  resolveLayoutRows,
  type ResolvedLayoutDocument,
} from "../../../src/index";
import { buildDemoRows } from "./demoLayout";
import { VIEWS } from "./views";

const ROOT_RECT = { x: 0, y: 0, width: 1100, height: 720 };
const FLOATING_Z_MIN = -5;
const FLOATING_Z_MAX = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function App() {
  const [sidebarLeft, setSidebarLeft] = useState(16);
  const [toolbarGap, setToolbarGap] = useState(8);
  const [floatingZ, setFloatingZ] = useState(3);
  const [debug, setDebug] = useState(false);

  const resolved: ResolvedLayoutDocument = useMemo(
    () =>
      resolveLayoutRows(
        buildDemoRows({
          sidebarLeft,
          toolbarGap,
          floatingZ: clamp(floatingZ, FLOATING_Z_MIN, FLOATING_Z_MAX),
        }),
        ROOT_RECT,
      ),
    [sidebarLeft, toolbarGap, floatingZ],
  );

  const reset = () => {
    setSidebarLeft(16);
    setToolbarGap(8);
    setFloatingZ(3);
    setDebug(false);
  };

  const viewData = useMemo(
    () => ({
      Inspector: {
        sidebarLeft,
        toolbarGap,
        floatingZ,
        debug,
        setSidebarLeft,
        setToolbarGap,
        setFloatingZ,
        setDebug,
        reset,
      },
      Preview: { layout: resolved },
      ResetButton: { reset },
    }),
    [sidebarLeft, toolbarGap, floatingZ, debug, resolved, reset],
  );

  const nodeData = useMemo(() => ({ "floating-action": { floatingZ } }), [floatingZ]);

  return (
    <div className="page-shell">
      <MachinaReactView
        layout={resolved}
        views={VIEWS}
        viewData={viewData}
        nodeData={nodeData}
        debug={debug}
        className="control-room"
        nodeContainment="layout-paint"
        nodeContentVisibility="none"
      />
    </div>
  );
}
