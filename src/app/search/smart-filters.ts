/**
 * Cross-surface smart filters — one-tap canned queries surfaced as chips in the
 * palette's empty state. Each is just a query string dropped into the input, so
 * they compose with everything else (ranking, operators, other chips).
 */

export interface SmartFilter {
  id: string;
  label: string;
  query: string;
}

export const SMART_FILTERS: SmartFilter[] = [
  { id: "mine", label: "Assigned to me", query: "@me" },
  { id: "needs-review", label: "Needs review", query: "is:needs-review" },
  { id: "approved", label: "Approved", query: "is:approved" },
  { id: "drafts", label: "Drafts", query: "is:draft" },
  { id: "this-week", label: "Going out this week", query: "type:planner is:this-week" },
  { id: "unscheduled", label: "Unscheduled posts", query: "type:planner is:unscheduled" },
  { id: "favorites", label: "My favorites", query: "is:favorite" },
];
