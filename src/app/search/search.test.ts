import { describe, expect, it } from "vitest";

import { createDemoProject } from "../data/demo-project";
import { parseQuery, removeToken } from "./query";
import { runSearch, scoreDoc } from "./rank";
import { buildSearchIndex } from "./search-index";
import type { SearchContext, SearchDoc } from "./types";

const ctx: SearchContext = {
  navigate: () => undefined,
  currentUser: "Priya",
  favoriteKey: "me",
  pathname: "/",
  close: () => undefined,
};

function doc(partial: Partial<SearchDoc> & Pick<SearchDoc, "id" | "kind" | "title">): SearchDoc {
  return {
    subtitle: "",
    keywords: partial.title.toLowerCase(),
    facets: {},
    open: () => undefined,
    ...partial,
  };
}

describe("parseQuery", () => {
  it("splits operators, @assignee, and #tag from free text", () => {
    const parsed = parseQuery("linen status:review @me #lookbook channel:tiktok");
    expect(parsed.text).toBe("linen");
    expect(parsed.tokens).toEqual(["linen"]);
    const keys = parsed.filters.map((f) => `${f.key}:${f.value}`);
    expect(keys).toContain("status:review");
    expect(keys).toContain("assignee:me");
    expect(keys).toContain("tag:lookbook");
    expect(keys).toContain("channel:tiktok");
  });

  it("treats bare words as free text", () => {
    const parsed = parseQuery("summer dress");
    expect(parsed.text).toBe("summer dress");
    expect(parsed.filters).toHaveLength(0);
  });

  it("removeToken drops a chip's token from the raw string", () => {
    expect(removeToken("linen status:review @me", "status:review")).toBe("linen @me");
  });
});

describe("scoreDoc", () => {
  it("ranks title prefix above keyword-only hits", () => {
    const prefix = doc({ id: "1", kind: "asset", title: "Linen shirt" });
    const keywordOnly = doc({ id: "2", kind: "asset", title: "Silk dress", keywords: "linen blend" });
    expect(scoreDoc(prefix, ["linen"])!).toBeGreaterThan(scoreDoc(keywordOnly, ["linen"])!);
  });

  it("requires every token to match (AND)", () => {
    const d = doc({ id: "1", kind: "asset", title: "Linen shirt", keywords: "linen shirt" });
    expect(scoreDoc(d, ["linen", "velvet"])).toBeNull();
  });
});

describe("runSearch filters", () => {
  const index: SearchDoc[] = [
    doc({ id: "a", kind: "asset", title: "In review", facets: { status: "review" } }),
    doc({ id: "b", kind: "asset", title: "A draft", facets: { status: "draft" } }),
    doc({ id: "c", kind: "planner", title: "Unscheduled post", facets: { channel: "tiktok" } }),
    doc({
      id: "d",
      kind: "planner",
      title: "Scheduled post",
      facets: { channel: "tiktok", scheduledDate: "2099-01-01" },
    }),
  ];

  it("gates by status", () => {
    const hits = runSearch(index, parseQuery("status:review"), ctx);
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });

  it("gates by channel + is:unscheduled", () => {
    const hits = runSearch(index, parseQuery("channel:tiktok is:unscheduled"), ctx);
    expect(hits.map((h) => h.id)).toEqual(["c"]);
  });
});

describe("buildSearchIndex", () => {
  it("indexes every content array with stable, openable docs", () => {
    const project = createDemoProject();
    const index = buildSearchIndex(project, ctx);
    const kinds = new Set(index.map((d) => d.kind));
    // Core content types the demo seeds must appear.
    expect(kinds).toContain("asset");
    expect(kinds).toContain("board");
    expect(kinds).toContain("comp");
    // Every asset yields exactly one doc, and each doc is openable.
    expect(index.filter((d) => d.kind === "asset")).toHaveLength(project.assets.length);
    expect(index.every((d) => typeof d.open === "function")).toBe(true);
  });
});
