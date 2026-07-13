import * as React from "react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import {
  ControlFieldLabel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/toolcraft/ui";

import { PLATFORM_FORMATS } from "../data/formats";
import { getProjectSnapshot } from "../data/project-store";
import { STUDIO_BOARD_NAME } from "./save-to-library";

const SOCIAL_FORMATS = PLATFORM_FORMATS.filter((format) => format.platform !== "email");

const TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between gap-1 rounded-lg bg-[color:var(--surface-inactive)] px-3 text-sm transition-colors hover:bg-[color:var(--surface-active)]";

/**
 * Export formats — the platform sizes to render, shown as a tap-to-select grid
 * so picking several is a single glance-and-tap. One format exports a bare
 * file; several bundle into a ZIP.
 *
 * Hook-free, so it stays safe even though custom controls flatten into
 * ControlsPanel's call list. An empty selection falls back to the live canvas
 * format (what's currently being viewed) — so a zero-config Export just outputs
 * the size on screen, and the grid highlights it as pre-selected.
 */
export const ExportFormatsControl: ToolcraftCustomControlRenderer = ({
  name,
  setValue,
  state,
  value,
}) => {
  const title = typeof name === "string" && name ? name : "Formats";
  const canvasFormat = String(state.values["format.active"] ?? "");
  const stored = Array.isArray(value)
    ? (value as unknown[]).filter((entry): entry is string => typeof entry === "string")
    : [];
  const selected = stored.length > 0 ? stored : canvasFormat ? [canvasFormat] : [];

  const toggle = (id: string): void => {
    const next = selected.includes(id)
      ? selected.filter((entry) => entry !== id)
      : [...selected, id];
    // Never persist an empty set — keep at least the canvas format selected.
    setValue(next.length > 0 ? next : canvasFormat ? [canvasFormat] : []);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {SOCIAL_FORMATS.map((format) => {
          const active = selected.includes(format.id);
          const isCurrent = format.id === canvasFormat;
          return (
            <button
              aria-pressed={active}
              className={`relative flex min-h-[3rem] flex-col items-start justify-center gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                active
                  ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_12%,transparent)] text-foreground"
                  : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-muted-foreground hover:border-[color:color-mix(in_oklab,var(--foreground)_25%,transparent)] hover:text-foreground"
              }`}
              key={format.id}
              onClick={() => toggle(format.id)}
              type="button"
            >
              <span className="text-2xs uppercase tracking-[0.1em] opacity-70">
                {format.platformLabel}
              </span>
              <span className="truncate text-xs-plus font-medium">{format.label}</span>
              {isCurrent ? (
                <span className="text-[10px] uppercase tracking-[0.12em] opacity-50">
                  On screen
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Save-to-Library destination board picker. Hook-free — reads top-level boards
 * from the store snapshot at render (the set rarely changes mid-export).
 */
export const ExportDestinationControl: ToolcraftCustomControlRenderer = ({
  name,
  setValue,
  value,
}) => {
  const title = typeof name === "string" && name ? name : "Save to";
  const boards = getProjectSnapshot().collections.filter((collection) => !collection.parentId);
  const current = typeof value === "string" && value ? value : STUDIO_BOARD_NAME;
  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className={TRIGGER_CLASS} type="button">
              <span className="truncate">{current}</span>
              <span aria-hidden className="text-muted-foreground">
                ⌄
              </span>
            </button>
          }
        />
        <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
          <DropdownMenuItem onClick={() => setValue(STUDIO_BOARD_NAME)}>
            {STUDIO_BOARD_NAME}
          </DropdownMenuItem>
          {boards.map((board) => (
            <DropdownMenuItem key={board.id} onClick={() => setValue(board.name)}>
              {board.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
