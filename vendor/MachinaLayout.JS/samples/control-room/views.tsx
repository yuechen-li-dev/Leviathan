import type { Dispatch, SetStateAction } from "react";

import {
  MachinaTextView,
  formatRect,
  type MachinaSlotProps,
  type ResolvedLayoutDocument,
} from "../../../src/index";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Input } from "./components/ui/Input";
import { Label } from "./components/ui/Label";
import { Separator } from "./components/ui/Separator";

export type InspectorViewData = {
  sidebarLeft: number;
  toolbarGap: number;
  floatingZ: number;
  debug: boolean;
  setSidebarLeft: Dispatch<SetStateAction<number>>;
  setToolbarGap: Dispatch<SetStateAction<number>>;
  setFloatingZ: Dispatch<SetStateAction<number>>;
  setDebug: Dispatch<SetStateAction<boolean>>;
  reset: () => void;
};

export type PreviewViewData = { layout: ResolvedLayoutDocument };

export type FloatingNodeData = { floatingZ: number };

function toIntegerOrPrevious(rawValue: string, previous: number): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return previous;
  }
  return Math.trunc(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const RootShell = () => <div className="slot-root" />;
const MainShell = () => <div className="slot-main" />;
const ToolbarShell = () => <div className="slot-toolbar" />;

const Header = () => (
  <Card>
    <div className="slot-header">
      <div>
        <h1>Machina Control Room</h1>
        <MachinaTextView
          text={{
            kind: "text",
            source: { kind: "machina-text", text: "Edit **rows**. Resolve `rects`. Render views." },
            variant: "caption",
            leading: "tight",
            valign: "center",
          }}
          style={{ height: "auto" }}
        />
      </div>
      <Badge>M0 Demo</Badge>
    </div>
  </Card>
);
const Sidebar = () => (
  <Card>
    <h3>Layout Nodes</h3>
    <ul className="mono">
      {[
        "root",
        "header",
        "sidebar",
        "main",
        "toolbar",
        "preview",
        "inspector",
        "floating-action",
      ].map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
    <Separator />
    <p className="mono">z -5 background · z 0 default · z 5 top</p>
  </Card>
);
const RunButton = () => <Button>Run</Button>;
const InspectButton = () => <Button>Inspect</Button>;
const ToolbarStatus = () => (
  <Card>
    <MachinaTextView
      text={{
        kind: "text",
        source: {
          kind: "machina-text",
          text: "Status: **FillFrame** consumes remaining toolbar width",
        },
        variant: "mono",
        wrap: "none",
        overflow: "ellipsis",
        leading: "tight",
        valign: "center",
      }}
      style={{ height: "auto" }}
    />
  </Card>
);

const ResetButton = ({ viewData }: MachinaSlotProps) => (
  <Button onClick={(viewData as InspectorViewData | undefined)?.reset}>Reset</Button>
);

const Preview = ({ viewData }: MachinaSlotProps) => (
  <Card>
    <h3>Resolved Rectangles</h3>
    <table className="mono">
      <thead>
        <tr>
          <th>id</th>
          <th>rect</th>
          <th>z</th>
        </tr>
      </thead>
      <tbody>
        {[
          "header",
          "sidebar",
          "main",
          "toolbar",
          "preview",
          "inspector",
          "floating-action",
          "debug-badge",
        ].map((id) => {
          const n = (viewData as PreviewViewData | undefined)?.layout.nodes[id];
          return (
            <tr key={id}>
              <td>{id}</td>
              <td>{n ? formatRect(n.rect) : "-"}</td>
              <td>{n?.z ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </Card>
);

const Inspector = ({ viewData }: MachinaSlotProps) => {
  const data = viewData as InspectorViewData | undefined;
  if (!data) return null;
  return (
    <Card>
      <h3>Inspector</h3>
      <div className="control">
        <Label>Sidebar left</Label>
        <div>
          <Button onClick={() => data.setSidebarLeft((v) => v - 2)}>-2</Button>
          <Input
            type="number"
            value={data.sidebarLeft}
            onChange={(e) =>
              data.setSidebarLeft(toIntegerOrPrevious(e.target.value, data.sidebarLeft))
            }
          />
          <Button onClick={() => data.setSidebarLeft((v) => v + 2)}>+2</Button>
        </div>
      </div>
      <div className="control">
        <Label>Toolbar gap</Label>
        <div>
          <Button onClick={() => data.setToolbarGap((v) => Math.max(0, v - 1))}>-1</Button>
          <Input
            type="number"
            min={0}
            value={data.toolbarGap}
            onChange={(e) =>
              data.setToolbarGap(Math.max(0, toIntegerOrPrevious(e.target.value, data.toolbarGap)))
            }
          />
          <Button onClick={() => data.setToolbarGap((v) => v + 1)}>+1</Button>
        </div>
      </div>
      <div className="control">
        <Label>Floating z (-5..5)</Label>
        <div>
          <Button onClick={() => data.setFloatingZ((v) => clamp(v - 1, -5, 5))}>-1</Button>
          <Input
            type="number"
            min={-5}
            max={5}
            value={data.floatingZ}
            onChange={(e) =>
              data.setFloatingZ(clamp(toIntegerOrPrevious(e.target.value, data.floatingZ), -5, 5))
            }
          />
          <Button onClick={() => data.setFloatingZ((v) => clamp(v + 1, -5, 5))}>+1</Button>
        </div>
      </div>
      <div className="control">
        <Label>Debug outlines</Label>
        <Button onClick={() => data.setDebug((v) => !v)}>{data.debug ? "On" : "Off"}</Button>
      </div>
    </Card>
  );
};

const FloatingAction = ({ nodeData }: MachinaSlotProps) => (
  <Card>
    <strong>Layer Probe</strong>{" "}
    <Badge>z={(nodeData as FloatingNodeData | undefined)?.floatingZ ?? 0}</Badge>
  </Card>
);
const DebugBadge = () => (
  <Card>
    <Badge>Debug Layer z=4</Badge>
  </Card>
);

export const VIEWS = {
  RootShell,
  MainShell,
  ToolbarShell,
  Header,
  Sidebar,
  RunButton,
  InspectButton,
  ToolbarStatus,
  ResetButton,
  Preview,
  Inspector,
  FloatingAction,
  DebugBadge,
};
