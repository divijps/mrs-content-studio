import * as React from "react";

import type { ActivityEvent, ReviewStatus } from "../data/types";

const first = (name: string): string => name.split(" ")[0] ?? name;

/**
 * Quiet one-line handoff context under the status/assignee selects, derived
 * from the entity's activity trail: who handed it to the current assignee,
 * and who approved it. Renders nothing when there's nothing to say — the
 * trail itself stays unexposed.
 */
export function HandoffTrail(props: {
  activity: ActivityEvent[] | undefined;
  assignee: string | null;
  status: ReviewStatus;
}): React.JSX.Element | null {
  const trail = props.activity ?? [];
  const parts: string[] = [];

  const lastAssign = [...trail].reverse().find((event) => event.kind === "assign" && event.to);
  if (
    props.assignee &&
    lastAssign?.by &&
    lastAssign.to === props.assignee &&
    lastAssign.by !== props.assignee
  ) {
    parts.push(`Handed to ${first(props.assignee)} by ${first(lastAssign.by)}`);
  }

  if (props.status === "approve") {
    const approval = [...trail]
      .reverse()
      .find((event) => event.kind === "status" && event.to === "approve");
    if (approval?.by) parts.push(`Approved by ${first(approval.by)}`);
  }

  if (parts.length === 0) return null;
  return (
    <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
      {parts.join(" · ")}
    </span>
  );
}
