import type { MachinaSlotProps } from "machinalayout/react";
import { MachinaTextView } from "machinalayout/text/react";
import type { DispatchFn } from "./types";
import type { LeviathanViewData } from "./layouts";
import { mapPrompt } from "./ariadneMapping";

type SlotProps = MachinaSlotProps<unknown, { dispatch: DispatchFn }>;
const dispatchOf = (props: SlotProps) => props.nodeData?.dispatch;

export function AppsHeader(props: SlotProps) {
  const data = props.viewData as LeviathanViewData["appsHeader"];
  return (
    <section className="panel hero">
      <MachinaTextView
        text={{
          kind: "text",
          variant: "title",
          source: { kind: "plain", text: data?.title ?? "Leviathan" },
        }}
      />
      <p>{data?.subtitle}</p>
    </section>
  );
}

export function AppListView(props: SlotProps) {
  const data = props.viewData as LeviathanViewData["appList"];
  const dispatch = dispatchOf(props);
  return (
    <section className="panel scroll">
      <h2>Available apps</h2>
      {data?.error && <p className="error">{data.error}</p>}
      {data?.status === "loading-apps" && <p>Loading apps…</p>}
      {data?.apps.map((app) => (
        <article className="card" key={app.id}>
          <h3>{app.title}</h3>
          <p>{app.description}</p>
          <small>{app.capabilities.join(", ")}</small>
          <br />
          <button
            onClick={() => dispatch?.({ type: "open-rust-simulator-app" })}
          >
            Open RustSimulator
          </button>
        </article>
      ))}
    </section>
  );
}

export function NavBarView(props: SlotProps) {
  const data = props.viewData as LeviathanViewData["navBar"];
  const dispatch = dispatchOf(props);
  return (
    <header className="panel nav">
      <button onClick={() => dispatch?.({ type: "open-apps-list" })}>
        ← Apps
      </button>
      <div>
        <h1>Rust Simulator</h1>
        <small>
          route={data?.route} status={data?.status}
        </small>
      </div>
    </header>
  );
}

export function TranscriptView(props: SlotProps) {
  const { screen } = (props.viewData as LeviathanViewData["transcript"]) ?? {};
  return (
    <section className="panel transcript">
      <h2>{screen?.title ?? "Starting RustSimulator…"}</h2>
      {screen?.transcript.map((line) => (
        <div className="line" key={line.id}>
          {line.speaker && <strong>{line.speaker}: </strong>}
          <MachinaTextView
            text={{
              kind: "text",
              variant: "body",
              source: { kind: "plain", text: line.text },
              overflow: "scroll",
            }}
          />
        </div>
      ))}
      {screen?.isComplete && <p className="complete">Adventure complete.</p>}
      {screen?.error && <p className="error">{screen.error}</p>}
    </section>
  );
}

export function PromptView(props: SlotProps) {
  const data = props.viewData as LeviathanViewData["prompt"];
  const dispatch = dispatchOf(props);
  const screen = data?.screen;
  if (!screen)
    return (
      <section className="panel">
        <h2>Starting session…</h2>
        {data?.error && <p className="error">{data.error}</p>}
      </section>
    );

  const prompt = mapPrompt(screen);
  return (
    <section className="panel prompt">
      <h2>{prompt.title}</h2>
      {prompt.actions.map((action) => {
        if (action.kind === "text-input") {
          return (
            <form
              key="text-input"
              onSubmit={(e) => {
                e.preventDefault();
                dispatch?.(action.eventForText(data?.textInput ?? ""));
              }}
            >
              <input
                value={data?.textInput ?? ""}
                onChange={(e) =>
                  dispatch?.({ type: "set-text-input", text: e.target.value })
                }
              />
              <button disabled={data?.status === "submitting"}>{action.label}</button>
            </form>
          );
        }
        return (
          <button
            disabled={data?.status === "submitting"}
            key={action.kind === "choice" ? action.key : action.kind}
            onClick={() => dispatch?.(action.event)}
          >
            {action.label}
          </button>
        );
      })}
      {data?.error && <p className="error">{data.error}</p>}
    </section>
  );
}

export function DebugPanelView(props: SlotProps) {
  const data = props.viewData as LeviathanViewData["debugPanel"];
  const screen = data?.screen;
  const debugText = [
    `status=${data?.status}`,
    `session=${screen?.sessionId ?? "none"}`,
    `revision=${screen?.revision ?? "none"}`,
    `prompt=${screen?.prompt?.id ?? "none"} kind=${screen?.prompt?.kind ?? "none"}`,
  ].join("\n");

  return <pre className="debug">{debugText}</pre>;
}

export const viewRegistry = {
  appsHeader: AppsHeader,
  appList: AppListView,
  navBar: NavBarView,
  transcript: TranscriptView,
  prompt: PromptView,
  debugPanel: DebugPanelView,
};
