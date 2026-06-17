import type { LayoutRow, Rect } from "machinalayout";
export const buildSchedulingLayout = (rootRect: Rect): { rows: LayoutRow[]; viewData: { schedulingHome: { title: string } } } => ({
  rows: [
    { id: "root", frame: { kind: "root" }, arrange: { kind: "stack", axis: "vertical" }, debugLabel: "Scheduling shell" },
    { id: "scheduling-home", parent: "root", frame: { kind: "fill", weight: 1, cross: "fill" }, view: "schedulingHome", debugLabel: "Scheduling MVP flow" },
  ],
  viewData: { schedulingHome: { title: "Scheduling" } },
});
