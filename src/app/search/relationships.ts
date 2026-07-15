/**
 * Relationship graph over the index. "Where is this used?" = every doc whose
 * outbound `refs` point at the target (inbound). "References" = the target's own
 * outbound refs resolved back to docs. Powers the palette's Related section and
 * the asset viewer's "Used in N places" — the answer to "if I replace this
 * version/asset, what changes?".
 */

import type { SearchDoc, SearchKind } from "./types";

export interface RelatedGroup {
  /** e.g. "Used in 3 artboards". */
  label: string;
  docs: SearchDoc[];
}

const KIND_NOUN: Record<SearchKind, [string, string]> = {
  asset: ["asset", "assets"],
  board: ["board", "boards"],
  comp: ["artboard", "artboards"],
  deck: ["copy deck", "copy decks"],
  email: ["email", "emails"],
  journal: ["copy entry", "copy entries"],
  link: ["link", "links"],
  planner: ["planner post", "planner posts"],
  snippet: ["snippet", "snippets"],
  task: ["task", "tasks"],
  template: ["template", "templates"],
};

function noun(kind: SearchKind, count: number): string {
  const [one, many] = KIND_NOUN[kind];
  return count === 1 ? one : many;
}

function groupByKind(docs: SearchDoc[], verb: string): RelatedGroup[] {
  const byKind = new Map<SearchKind, SearchDoc[]>();
  for (const doc of docs) {
    const list = byKind.get(doc.kind);
    if (list) list.push(doc);
    else byKind.set(doc.kind, [doc]);
  }
  return [...byKind.entries()].map(([kind, list]) => ({
    label: `${verb} ${list.length} ${noun(kind, list.length)}`,
    docs: list,
  }));
}

/** Total inbound references — for a compact "Used in N places" count. */
export function usageCount(target: SearchDoc, index: SearchDoc[]): number {
  return index.reduce(
    (n, doc) =>
      doc.id !== target.id &&
      (doc.refs ?? []).some((ref) => ref.kind === target.kind && ref.id === target.id)
        ? n + 1
        : n,
    0,
  );
}

/** Grouped relationships for a target doc. */
export function relatedTo(target: SearchDoc, index: SearchDoc[]): RelatedGroup[] {
  const byId = new Map(index.map((doc) => [`${doc.kind}:${doc.id}`, doc]));

  const inbound = index.filter(
    (doc) =>
      doc.id !== target.id &&
      (doc.refs ?? []).some((ref) => ref.kind === target.kind && ref.id === target.id),
  );

  const outbound: SearchDoc[] = [];
  for (const ref of target.refs ?? []) {
    const doc = byId.get(`${ref.kind}:${ref.id}`);
    if (doc && doc.id !== target.id) outbound.push(doc);
  }

  return [...groupByKind(inbound, "Used in"), ...groupByKind(outbound, "References")];
}
