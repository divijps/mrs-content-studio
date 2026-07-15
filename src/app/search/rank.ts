/**
 * Ranking + facet gating. Replaces the old no-ranking substring search: free
 * text is scored by where it hits (title prefix > title word > title substring >
 * keywords), ALL tokens must match (AND), and structured filters gate the doc.
 */

import type { ParsedQuery, QueryFilter, SearchContext, SearchDoc, SearchKind } from "./types";

/** `type:` aliases → the SearchKind(s) they select. */
const TYPE_ALIASES: Record<string, SearchKind[]> = {
  artboard: ["comp"],
  asset: ["asset"],
  board: ["board"],
  comp: ["comp"],
  copy: ["snippet", "journal"],
  deck: ["deck"],
  design: ["comp"],
  email: ["email"],
  image: ["asset"],
  journal: ["journal"],
  library: ["asset"],
  link: ["link"],
  photo: ["asset"],
  planner: ["planner"],
  post: ["planner"],
  snippet: ["snippet"],
  task: ["task"],
  template: ["template"],
  video: ["asset"],
};

/** Person-facet equality: an empty needle matches nothing — otherwise `@me`
 * with no display name set would match every unassigned doc. */
function eq(a: string | null | undefined, b: string): boolean {
  return b !== "" && (a ?? "").toLowerCase() === b;
}

/** Whether a doc satisfies one structured filter. */
function matchesFilter(doc: SearchDoc, filter: QueryFilter, ctx: SearchContext): boolean {
  const { facets } = doc;
  const value = filter.value;
  const me = (ctx.currentUser ?? "").toLowerCase();
  const resolvePerson = (v: string): string => (v === "me" ? me : v);

  switch (filter.key) {
    case "type": {
      const kinds = TYPE_ALIASES[value];
      if (!kinds || !kinds.includes(doc.kind)) return false;
      if (value === "video" || value === "image") return facets.mediaKind === value;
      return true;
    }
    case "status":
      return eq(facets.status, value);
    case "assignee":
      return eq(facets.assignee, resolvePerson(value));
    case "author":
      return eq(facets.author, resolvePerson(value));
    case "owner":
      return eq(facets.owner, resolvePerson(value));
    case "tag":
      return (facets.tags ?? []).some((tag) => tag.toLowerCase() === value);
    case "channel":
      return facets.channel === value;
    case "board":
      return (facets.boardPath ?? "").toLowerCase().includes(value);
    case "is":
      return matchesIs(doc, value, ctx);
    default:
      return false;
  }
}

function matchesIs(doc: SearchDoc, value: string, ctx: SearchContext): boolean {
  const { facets } = doc;
  const me = (ctx.currentUser ?? "").toLowerCase();
  switch (value) {
    case "unscheduled":
      return doc.kind === "planner" && !facets.scheduledDate;
    case "scheduled":
      return doc.kind === "planner" && Boolean(facets.scheduledDate);
    case "this-week":
      return doc.kind === "planner" && withinDays(facets.scheduledDate, 7);
    case "favorite":
    case "favorited":
      return (facets.favoritedBy ?? []).includes(ctx.favoriteKey);
    case "video":
    case "image":
      return facets.mediaKind === value;
    case "mine":
      return eq(facets.author, me) || eq(facets.owner, me) || eq(facets.assignee, me);
    case "needs-review":
    case "review":
      return eq(facets.status, "review");
    case "approved":
    case "approve":
      return eq(facets.status, "approve");
    case "draft":
      return eq(facets.status, "draft");
    case "commented":
    case "has-comments":
      return Boolean(facets.hasComments);
    default:
      return false;
  }
}

/** Score a doc against free-text tokens. Returns null if any token is unmatched. */
export function scoreDoc(doc: SearchDoc, tokens: string[]): number | null {
  if (tokens.length === 0) return 0;
  const title = doc.title.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    let best = 0;
    if (title.startsWith(token)) best = 100;
    else if (new RegExp(`\\b${escapeRegExp(token)}`).test(title)) best = 60;
    else if (title.includes(token)) best = 40;
    else if (doc.keywords.includes(token)) best = 15;
    if (best === 0) return null; // AND: every token must land somewhere
    score += best;
  }
  return score;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether a YYYY-MM-DD date is today..today+`days` (inclusive). */
function withinDays(date: string | null | undefined, days: number): boolean {
  if (!date) return false;
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + days * 86_400_000;
  return target >= start && target <= end;
}

/** Filter + rank the index for a parsed query. */
export function runSearch(
  index: SearchDoc[],
  parsed: ParsedQuery,
  ctx: SearchContext,
): SearchDoc[] {
  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const doc of index) {
    if (!parsed.filters.every((filter) => matchesFilter(doc, filter, ctx))) continue;
    const score = scoreDoc(doc, parsed.tokens);
    if (score === null) continue;
    scored.push({ doc, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.doc.createdAt ?? "").localeCompare(a.doc.createdAt ?? "");
  });
  return scored.map((entry) => entry.doc);
}
