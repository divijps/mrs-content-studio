import * as React from "react";

import { useProject } from "../data/project-store";

/** Seed teammates so @mentions aren't empty before a real team exists (demo). */
export const DEMO_TEAMMATES = ["Priya", "Marco", "Lena", "Sam"];

/**
 * People who can be @mentioned. Real participants (the current user + anyone
 * who has commented) always count; demo mode adds a few seed teammates so the
 * mention menu is populated in the client preview.
 */
export function useTeamRoster(): string[] {
  const project = useProject();
  return React.useMemo(() => {
    const names = new Set<string>();
    const me = project.settings.displayName;
    if (me) {
      names.add(me);
    }
    // Everyone with an account (hydrated from the shared profiles table), so new
    // teammates are suggested even before they've left their first comment.
    for (const member of project.teamMembers) {
      if (member.name) {
        names.add(member.name);
      }
    }
    for (const asset of project.assets) {
      for (const comment of asset.comments) {
        if (comment.author && comment.author !== "You") {
          names.add(comment.author);
        }
      }
    }
    if (project.source === "demo") {
      for (const name of DEMO_TEAMMATES) {
        names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [project.assets, project.teamMembers, project.settings.displayName, project.source]);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Roster names that appear as @mentions in the text (case-insensitive). */
export function findMentions(text: string, roster: string[]): string[] {
  if (!text.includes("@")) {
    return [];
  }
  const found: string[] = [];
  for (const name of roster) {
    const re = new RegExp(`@${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(text)) {
      found.push(name);
    }
  }
  return found;
}

/** True if the text @mentions the given person. */
export function mentions(text: string, name: string | null): boolean {
  if (!name) {
    return false;
  }
  return findMentions(text, [name]).length > 0;
}

/** Render comment text with @mentions highlighted as accent chips. */
export function renderWithMentions(
  text: string,
  roster: string[],
): React.ReactNode {
  if (!text.includes("@") || roster.length === 0) {
    return text;
  }
  const ranges: { end: number; start: number }[] = [];
  for (const name of roster) {
    const re = new RegExp(`@${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      ranges.push({ end: match.index + match[0].length, start: match.index });
    }
  }
  if (ranges.length === 0) {
    return text;
  }
  // Earliest first, longest wins on ties; then drop overlaps.
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const picked: { end: number; start: number }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start >= cursor) {
      picked.push(range);
      cursor = range.end;
    }
  }
  const nodes: React.ReactNode[] = [];
  let index = 0;
  picked.forEach((range, key) => {
    if (range.start > index) {
      nodes.push(text.slice(index, range.start));
    }
    nodes.push(
      <span
        className="rounded-sm bg-[color:color-mix(in_oklab,var(--accent)_22%,transparent)] px-0.5 font-medium text-[color:var(--foreground)]"
        key={key}
      >
        {text.slice(range.start, range.end)}
      </span>,
    );
    index = range.end;
  });
  if (index < text.length) {
    nodes.push(text.slice(index));
  }
  return nodes;
}
