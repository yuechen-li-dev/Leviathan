import type { AriadneScreenDto } from "./types";
import type { LeviathanDispatch } from "./shellEvents";

export type PromptAction =
  | { kind: "advance"; label: string; event: LeviathanDispatch }
  | { kind: "choice"; key: string; label: string; event: LeviathanDispatch }
  | { kind: "text-input"; label: string; eventForText: (text: string) => LeviathanDispatch };

export type AriadnePromptViewModel = {
  title: string;
  actions: PromptAction[];
  error: string | null;
};

export type AriadneScreenViewModel = {
  sessionId: string;
  title: string;
  revision: number;
  isComplete: boolean;
  transcript: AriadneScreenDto["transcript"];
  prompt: AriadnePromptViewModel;
};

export function mapAriadneScreen(screen: AriadneScreenDto): AriadneScreenViewModel {
  return {
    sessionId: screen.sessionId,
    title: screen.title,
    revision: screen.revision,
    isComplete: screen.isComplete,
    transcript: screen.transcript,
    prompt: mapPrompt(screen),
  };
}

export function mapPrompt(screen: AriadneScreenDto): AriadnePromptViewModel {
  const prompt = screen.prompt;
  if (!prompt) return { title: "Continue", actions: [], error: screen.error };
  if (prompt.kind === "line") {
    return {
      title: prompt.text ?? "Continue",
      error: screen.error,
      actions: [{ kind: "advance", label: "Advance", event: { type: "advance-prompt", promptId: prompt.id, revision: screen.revision } }],
    };
  }
  if (prompt.kind === "choice") {
    return {
      title: prompt.text ?? "Choose",
      error: screen.error,
      actions: prompt.choices
        .filter((choice) => choice.key.length > 0)
        .map((choice) => ({
          kind: "choice",
          key: choice.key,
          label: choice.text,
          event: { type: "choose-option", promptId: prompt.id, revision: screen.revision, choiceKey: choice.key },
        })),
    };
  }
  return {
    title: prompt.text ?? "Respond",
    error: screen.error,
    actions: [
      {
        kind: "text-input",
        label: "Submit",
        eventForText: (text: string) => ({ type: "submit-text-input", promptId: prompt.id, revision: screen.revision, text }),
      },
    ],
  };
}

export function actionEventForKey(screen: AriadneScreenDto, key: string): LeviathanDispatch | null {
  const action = mapPrompt(screen).actions.find((entry) =>
    entry.kind === "choice" ? entry.key === key : entry.kind === key,
  );
  if (!action || action.kind === "text-input") return null;
  return action.event;
}
