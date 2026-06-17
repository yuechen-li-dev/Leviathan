export type AppManifest = {
  appId: string;
  displayName: string;
  kind: string;
  description: string;
  runtime: string;
  frontendRoute: string;
  persistenceScope: string;
  capabilities: string[];
  metadata: Record<string, string>;
};
export type AriadneChoiceDto = { key: string; text: string };
export type AriadnePromptDto = {
  id: string;
  kind: "line" | "choice" | "text-input";
  text: string | null;
  choices: AriadneChoiceDto[];
};
export type AriadneTranscriptLineDto = {
  id: string;
  text: string;
  speaker: string | null;
};
export type AriadneScreenDto = {
  sessionId: string;
  appId?: string;
  title: string;
  revision: number;
  isComplete: boolean;
  error: string | null;
  transcript: AriadneTranscriptLineDto[];
  prompt: AriadnePromptDto | null;
  wasRestored?: boolean;
};

export type { ShellRoute, ShellState, ShellStatus } from "./shellState";
export type { DispatchFn, LeviathanDispatch } from "./shellEvents";
