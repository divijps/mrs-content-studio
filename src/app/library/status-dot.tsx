import * as React from "react";

import { REVIEW_STATUS_LABELS, type ReviewStatus } from "../data/types";

/**
 * Traffic-light status system: one colored circle per review state.
 * Simpler and sleeker than text pills — the color IS the status.
 */
export const STATUS_COLORS: Record<ReviewStatus, string> = {
  approved: "#4caf7d",
  "changes-requested": "#e0564a",
  draft: "#9a958c",
  "in-review": "#e5b452",
};

export function StatusDot(props: {
  /** Adds a subtle ring so the dot reads on top of photos. */
  onImage?: boolean;
  size?: number;
  status: ReviewStatus;
  /** Show the label text next to the dot. */
  withLabel?: boolean;
}): React.JSX.Element {
  const size = props.size ?? 8;
  const dot = (
    <span
      aria-label={REVIEW_STATUS_LABELS[props.status]}
      className="inline-block shrink-0 rounded-full"
      role="img"
      style={{
        backgroundColor: STATUS_COLORS[props.status],
        boxShadow: props.onImage
          ? "0 0 0 2px rgba(10,10,10,0.55)"
          : undefined,
        height: size,
        width: size,
      }}
      title={REVIEW_STATUS_LABELS[props.status]}
    />
  );
  if (!props.withLabel) {
    return dot;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
        {REVIEW_STATUS_LABELS[props.status]}
      </span>
    </span>
  );
}
