import * as React from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import { REVIEW_STATUS_LABELS, REVIEW_STATUS_ORDER, type ReviewStatus } from "../data/types";
import { STATUS_COLORS } from "./status-dot";

const STATUS_ITEMS = REVIEW_STATUS_ORDER.map((status) => ({
  label: REVIEW_STATUS_LABELS[status],
  value: status,
}));

function Dot(props: { status: ReviewStatus }): React.JSX.Element {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_COLORS[props.status] }}
    />
  );
}

/**
 * Traffic-light review-status dropdown, reused wherever a review state is set
 * (asset viewer, queue cards, …). The color travels with the label so the
 * state reads at a glance whether the menu is open or closed.
 */
export function StatusSelect(props: {
  onChange: (status: ReviewStatus) => void;
  status: ReviewStatus;
  triggerClassName?: string;
}): React.JSX.Element {
  return (
    <Select
      items={STATUS_ITEMS}
      onValueChange={(next) => props.onChange(next as ReviewStatus)}
      value={props.status}
    >
      <SelectTrigger className={props.triggerClassName ?? "w-full justify-between"}>
        <SelectValue>
          {() => (
            <span className="flex items-center gap-2">
              <Dot status={props.status} />
              {REVIEW_STATUS_LABELS[props.status]}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {REVIEW_STATUS_ORDER.map((status) => (
            <SelectItem key={status} value={status}>
              <span className="flex items-center gap-2">
                <Dot status={status} />
                {REVIEW_STATUS_LABELS[status]}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
