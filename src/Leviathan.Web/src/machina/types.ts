export type AppManifest = {
  id: string;
  title: string;
  description: string;
  capabilities: string[];
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
  title: string;
  revision: number;
  isComplete: boolean;
  error: string | null;
  transcript: AriadneTranscriptLineDto[];
  prompt: AriadnePromptDto | null;
};

export type ShellRoute = "apps" | "rust-simulator";
export type ShellState = {
  route: ShellRoute;
  apps: AppManifest[];
  screen: AriadneScreenDto | null;
  status: "idle" | "loading-apps" | "starting-session" | "submitting" | "error";
  error: string | null;
  textInput: string;
};

export type LeviathanDispatch =
  | { type: "open-apps-list" }
  | { type: "open-rust-simulator-app" }
  | { type: "start-ariadne-session"; appId: "rust_simulator" }
  | { type: "open-ariadne-session"; screen: AriadneScreenDto }
  | { type: "advance-prompt"; promptId: string; revision: number }
  | {
      type: "choose-option";
      promptId: string;
      revision: number;
      choiceKey: string;
    }
  | { type: "set-text-input"; text: string }
  | {
      type: "submit-text-input";
      promptId: string;
      revision: number;
      text: string;
    };

export type DispatchFn = (event: LeviathanDispatch) => void;
