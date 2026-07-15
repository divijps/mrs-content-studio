/**
 * Shared search types. The whole app is indexed into a flat list of
 * {@link SearchDoc}s (one per entity across every ProjectSnapshot array); the
 * command palette ranks and filters that list, and each doc knows how to open
 * itself (the `requestX(id) + navigate` idiom).
 */

import type * as React from "react";

import type { AssetKind, PlannerChannel, ReviewStatus } from "../data/types";

/** Every searchable entity kind. */
export type SearchKind =
  | "asset"
  | "comp"
  | "board"
  | "task"
  | "journal"
  | "snippet"
  | "deck"
  | "template"
  | "email"
  | "planner"
  | "link";

/** An outbound foreign-key reference, used to build the relationship graph. */
export interface EntityRef {
  kind: SearchKind;
  id: string;
}

/** Facet values a doc can be filtered on. */
export interface SearchFacets {
  /** ReviewStatus (asset/comp/planner) or TaskStatus (task). */
  status?: string;
  assignee?: string | null;
  author?: string | null;
  owner?: string | null;
  tags?: string[];
  boardPath?: string;
  channel?: PlannerChannel;
  mediaKind?: AssetKind;
  format?: string;
  scheduledDate?: string | null;
  /** Per-person favorite keys (userIds or "me"). */
  favoritedBy?: string[];
  hasComments?: boolean;
}

/** One indexed entity. */
export interface SearchDoc {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  /** Lowercased haystack for free-text matching. */
  keywords: string;
  facets: SearchFacets;
  thumbUrl?: string;
  /** ReviewStatus for a leading status dot (asset/comp/planner). */
  status?: ReviewStatus;
  /** ISO date for recency tiebreak / empty-query ordering. */
  createdAt?: string;
  /** Navigate to and focus this entity. */
  open: () => void;
  /** Outbound FKs (for "where is this used?"). */
  refs?: EntityRef[];
}

/** Recognised filter operators. */
export type FilterKey =
  | "type"
  | "status"
  | "assignee"
  | "author"
  | "owner"
  | "tag"
  | "channel"
  | "board"
  | "is";

export interface QueryFilter {
  key: FilterKey;
  value: string;
  /** The exact raw token in the input, so a chip can rewrite the string to remove it. */
  token: string;
  /** Human label for the chip, e.g. "status: review". */
  label: string;
}

export interface ParsedQuery {
  /** Free-text remainder (operators stripped). */
  text: string;
  /** Lowercased free-text tokens. */
  tokens: string[];
  filters: QueryFilter[];
}

/** Everything a doc's `open()` (and command `run()`) needs from the host. */
export interface SearchContext {
  navigate: (opts: { to: string }) => void;
  /** Current viewer's display name (for `@me` / `is:mine`). */
  currentUser: string | null;
  /** Current viewer's favorite key (userId ?? "me"). */
  favoriteKey: string;
  /** Current route pathname (so context-only commands can gate themselves). */
  pathname: string;
  /** Close the palette. */
  close: () => void;
}

/** A runnable command (navigation, creation, entity action, Studio action). */
export interface PaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon?: React.ReactNode;
  /** Extra keywords for matching (aliases). */
  keywords?: string;
  run: () => void;
}
