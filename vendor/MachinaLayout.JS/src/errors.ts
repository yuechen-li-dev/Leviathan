export type MachinaLayoutErrorCode =
  | "EmptyRows"
  | "MissingRoot"
  | "MultipleRoots"
  | "DuplicateId"
  | "InvalidId"
  | "MissingParent"
  | "UnknownParent"
  | "SelfParent"
  | "Cycle"
  | "UnreachableNode"
  | "NonFiniteNumber"
  | "InvalidLengthUnit"
  | "InvalidZ"
  | "InvalidVariantCondition"
  | "NegativeSize"
  | "NegativeGap"
  | "NegativePadding"
  | "InvalidAnchorHorizontal"
  | "InvalidAnchorVertical"
  | "NegativeResolvedSize"
  | "FixedFrameWithoutArranger"
  | "FillFrameWithoutArranger"
  | "InvalidFillWeight"
  | "StackChildMustBeFixed"
  | "StackContentNegative"
  | "StackOverflow"
  | "CellFrameWithoutGrid"
  | "GridChildMustBeCell"
  | "InvalidGridTrack"
  | "InvalidGridCell"
  | "GridContentNegative"
  | "GridOverflow"
  | "RootFrameNotRoot"
  | "RootFrameWithoutRoot"
  | "IncompatibleLayouts"
  | "GuideTargetNotFound"
  | "GuideSelfReference"
  | "GuideReferenceCycle"
  | "GuideInvalidEdgeForAxis"
  | "GuideTooManyReferencesPerAxis"
  | "InvalidGuideFrame"
  | "GuideTargetUnresolved";

export class MachinaLayoutError extends Error {
  readonly code: MachinaLayoutErrorCode;

  constructor(code: MachinaLayoutErrorCode, message: string) {
    super(message);
    this.name = "MachinaLayoutError";
    this.code = code;
  }
}
