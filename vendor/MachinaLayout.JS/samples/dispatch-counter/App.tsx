import { useMemo, useState } from "react";
import { type LayoutRow, resolveLayoutRows, type Rect } from "machinalayout";
import { defineDispatchTables, dispatchEvent } from "machinalayout/dispatch";
import { MachinaReactView, type MachinaSlotProps } from "machinalayout/react";

type CounterState = { count: number };

const ROOT_RECT: Rect = { x: 0, y: 0, width: 520, height: 280 };

const ROWS: LayoutRow[] = [
  { id: "root", frame: { kind: "root" } },
  {
    id: "panel",
    parent: "root",
    frame: { kind: "anchor", left: 60, right: 60, top: 36, bottom: 36 },
    view: "panel",
  },
  {
    id: "title",
    parent: "panel",
    order: 0,
    frame: { kind: "anchor", left: 20, right: 20, top: 20, height: 30 },
    view: "title",
  },
  {
    id: "count",
    parent: "panel",
    order: 1,
    frame: { kind: "anchor", left: 20, right: 20, top: 62, height: 42 },
    view: "count",
  },
  {
    id: "actions",
    parent: "panel",
    order: 2,
    frame: { kind: "anchor", left: 20, right: 20, top: 120, height: 44 },
    arrange: { kind: "stack", axis: "horizontal", justify: "center", align: "center", gap: 12 },
  },
  {
    id: "increment",
    parent: "actions",
    order: 0,
    frame: { kind: "fixed", width: 180, height: 40 },
    view: "incrementButton",
  },
  {
    id: "note",
    parent: "panel",
    order: 3,
    frame: { kind: "anchor", left: 20, right: 20, bottom: 16, height: 18 },
    view: "note",
  },
];

const DISPATCH = defineDispatchTables<CounterState>({
  increment: {
    events: ["counter.increment"],
    fields: ["count"],
    by: [1],
  },
});

function PanelView() {
  return <section className="panel" />;
}
function TitleView() {
  return <h1 className="title">MachinaDispatch Counter</h1>;
}
function CountView({ nodeData }: MachinaSlotProps) {
  const data = nodeData as CounterState | undefined;
  return <p className="count">Count: {data?.count ?? 0}</p>;
}
function IncrementButtonView({ viewData }: MachinaSlotProps) {
  const data = viewData as { send: (event: string) => void } | undefined;
  return (
    <button className="button" onClick={() => data?.send("counter.increment")}>
      Increment
    </button>
  );
}
function NoteView() {
  return (
    <p className="note">
      No router, no store, no custom hook: dispatch table + event = next state.
    </p>
  );
}

const VIEWS = {
  panel: PanelView,
  title: TitleView,
  count: CountView,
  incrementButton: IncrementButtonView,
  note: NoteView,
};

export function App() {
  const [state, setState] = useState<CounterState>({ count: 0 });
  const send = (event: string) => setState((current) => dispatchEvent(current, event, DISPATCH));
  const layout = useMemo(() => resolveLayoutRows(ROWS, ROOT_RECT), []);
  const viewData = useMemo(() => ({ incrementButton: { send } }), [send]);
  const nodeData = useMemo(() => ({ count: state }), [state]);

  return (
    <MachinaReactView
      layout={layout}
      views={VIEWS}
      viewData={viewData}
      nodeData={nodeData}
      className="app"
    />
  );
}
