import type { HTMLAttributes } from "react";

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="ui-card" {...props} />;
}
