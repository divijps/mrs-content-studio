/**
 * Query parser: turns a raw palette string into free text + structured filters.
 * Supports operators (`status:review`, `channel:tiktok`, `is:unscheduled`),
 * `@name` (assignee) and `#tag` shorthands — mirroring the tasks quick-add
 * `#`/`@` splitter — so power users type and everyone else clicks chips.
 */

import type { FilterKey, ParsedQuery, QueryFilter } from "./types";

/** Operator aliases → canonical FilterKey. */
const KEY_ALIASES: Record<string, FilterKey> = {
  assigned: "assignee",
  assignee: "assignee",
  author: "author",
  board: "board",
  by: "author",
  channel: "channel",
  folder: "board",
  in: "type",
  is: "is",
  kind: "type",
  owner: "owner",
  status: "status",
  tag: "tag",
  type: "type",
};

function labelFor(key: FilterKey, value: string): string {
  if (key === "assignee" && value === "me") return "assigned to me";
  if (key === "is") return value.replace(/-/g, " ");
  return `${key}: ${value}`;
}

/** Parse a raw input string into `{ text, tokens, filters }`. */
export function parseQuery(input: string): ParsedQuery {
  const filters: QueryFilter[] = [];
  const textParts: string[] = [];

  for (const raw of input.split(/\s+/)) {
    if (!raw) continue;

    // #tag
    if (raw.length > 1 && raw.startsWith("#")) {
      const value = raw.slice(1).toLowerCase();
      filters.push({ key: "tag", value, token: raw, label: labelFor("tag", value) });
      continue;
    }
    // @assignee
    if (raw.length > 1 && raw.startsWith("@")) {
      const value = raw.slice(1).toLowerCase();
      filters.push({ key: "assignee", value, token: raw, label: labelFor("assignee", value) });
      continue;
    }
    // key:value
    const match = /^([a-z]+):(.+)$/i.exec(raw);
    if (match) {
      const key = KEY_ALIASES[match[1]!.toLowerCase()];
      const value = match[2]!.toLowerCase();
      if (key) {
        filters.push({ key, value, token: raw, label: labelFor(key, value) });
        continue;
      }
    }
    textParts.push(raw);
  }

  const text = textParts.join(" ");
  return { text, tokens: text.toLowerCase().split(/\s+/).filter(Boolean), filters };
}

/** Remove one filter's token from a raw input string (for chip dismissal). */
export function removeToken(input: string, token: string): string {
  return input
    .split(/\s+/)
    .filter((part) => part !== token)
    .join(" ");
}

/** Append an operator token to a raw input string (for chip suggestions). */
export function appendToken(input: string, token: string): string {
  const trimmed = input.trim();
  if (trimmed.split(/\s+/).includes(token)) return trimmed;
  return trimmed ? `${trimmed} ${token}` : token;
}
