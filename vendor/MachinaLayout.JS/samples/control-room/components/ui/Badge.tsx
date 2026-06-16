import type { HTMLAttributes } from "react";

export function Badge(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="ui-badge" {...props} />;
}
