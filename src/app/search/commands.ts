/**
 * Runnable palette commands: navigate to any surface, and create entities. These
 * are all cleanly callable from the store — no Toolcraft runtime coupling. (Studio
 * canvas actions like export/variations stay on the Studio panel, where they have
 * the live render context.)
 */

import {
  addCollection,
  addJournalEntry,
  addTask,
  createEmail,
  requestCopyEntry,
  requestEmail,
  requestLibraryBoard,
  requestTask,
} from "../data/project-store";
import type { PaletteCommand, SearchContext } from "./types";

const SURFACES: { label: string; to: string }[] = [
  { label: "Library", to: "/library" },
  { label: "Studio", to: "/" },
  { label: "Planner", to: "/planner" },
  { label: "Email", to: "/email" },
  { label: "Copy", to: "/copy" },
  { label: "Brand", to: "/brand" },
  { label: "Tasks", to: "/tasks" },
];

export function buildCommands(ctx: SearchContext): PaletteCommand[] {
  const nav = SURFACES.map(
    (surface): PaletteCommand => ({
      id: `nav:${surface.to}`,
      group: "Go to",
      title: `Go to ${surface.label}`,
      keywords: `open navigate ${surface.label}`,
      run: () => {
        ctx.close();
        ctx.navigate({ to: surface.to });
      },
    }),
  );

  const create: PaletteCommand[] = [
    {
      id: "new:task",
      group: "Create",
      title: "New task",
      keywords: "add todo kanban create",
      run: () => {
        const id = addTask("New task", "todo");
        ctx.close();
        requestTask(id);
        ctx.navigate({ to: "/tasks" });
      },
    },
    {
      id: "new:board",
      group: "Create",
      title: "New board",
      keywords: "add collection folder library create",
      run: () => {
        const id = addCollection("New board");
        ctx.close();
        requestLibraryBoard(id);
        ctx.navigate({ to: "/library" });
      },
    },
    {
      id: "new:note",
      group: "Create",
      title: "New copy note",
      keywords: "add journal copy write create",
      run: () => {
        const id = addJournalEntry("copy", "Untitled", "");
        ctx.close();
        requestCopyEntry(id);
        ctx.navigate({ to: "/copy" });
      },
    },
    {
      id: "new:email",
      group: "Create",
      title: "New email",
      keywords: "add draft campaign create",
      run: () => {
        const email = createEmail("Untitled email");
        ctx.close();
        requestEmail(email.id);
        ctx.navigate({ to: "/email" });
      },
    },
  ];

  return [...nav, ...create];
}

/** Filter commands by free-text tokens (title + keywords). */
export function filterCommands(commands: PaletteCommand[], tokens: string[]): PaletteCommand[] {
  if (tokens.length === 0) return commands;
  return commands.filter((command) => {
    const hay = `${command.title} ${command.keywords ?? ""}`.toLowerCase();
    return tokens.every((token) => hay.includes(token));
  });
}
