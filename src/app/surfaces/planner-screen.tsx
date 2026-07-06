import * as React from "react";

import { Button, Input, Switch, ToggleGroup, ToggleGroupItem } from "@/toolcraft/ui";

import {
  addPlannerGridSlot,
  addPlannerPlaceholder,
  addPlannerStorySlot,
  removePlannerSlot,
  reorderPlannerSlots,
  useProject,
} from "../data/project-store";
import type { PlannerGridSlot } from "../data/types";
import { SlotVisual } from "../planner/slot-visual";
import { StoryPreview } from "../planner/story-preview";
import { StatusDot } from "../library/status-dot";

type PlannerView = "grid" | "story";

/** Left rail: comps + library photos to place into the grid or story. */
function SourceRail(props: { onAdd: (input: { assetId?: string; compId?: string }) => void }): React.JSX.Element {
  const project = useProject();
  const [tab, setTab] = React.useState<"comps" | "photos">("comps");
  const [query, setQuery] = React.useState("");
  const [approvedOnly, setApprovedOnly] = React.useState(false);

  const needle = query.trim().toLowerCase();
  const comps = React.useMemo(
    () =>
      project.comps.filter((comp) => !needle || comp.name.toLowerCase().includes(needle)),
    [project.comps, needle],
  );
  const photos = React.useMemo(
    () =>
      project.assets.filter((asset) => {
        if (approvedOnly && asset.status !== "approved") return false;
        if (!needle) return true;
        return (
          asset.name.toLowerCase().includes(needle) ||
          asset.filename.toLowerCase().includes(needle) ||
          asset.tags.some((tag) => tag.includes(needle))
        );
      }),
    [project.assets, needle, approvedOnly],
  );
  const items = tab === "comps" ? comps : photos;

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-border bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)]">
      <div className="flex flex-col gap-2 border-b border-border p-2">
        <ToggleGroup
          className="w-full"
          onValueChange={(value: string[]) => {
            const next = value[value.length - 1];
            if (next === "comps" || next === "photos") {
              setTab(next);
            }
          }}
          value={[tab]}
        >
          <ToggleGroupItem className="flex-1" value="comps">
            Comps ({comps.length})
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="photos">
            Photos ({photos.length})
          </ToggleGroupItem>
        </ToggleGroup>
        <Input
          className="h-7 text-xs-plus"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === "comps" ? "Search comps…" : "Search photos…"}
          value={query}
        />
        {tab === "photos" ? (
          <button
            className={`self-start rounded-full border px-2 py-0.5 text-2xs transition-colors ${approvedOnly ? "border-accent bg-[color:color-mix(in_oklab,var(--accent)_16%,transparent)] text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={() => setApprovedOnly((value) => !value)}
            type="button"
          >
            Approved only
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-2xs text-muted-foreground">
            {needle || approvedOnly
              ? "Nothing matches."
              : tab === "comps"
                ? "No comps yet — build one in the Studio."
                : "No photos yet — import in the Library."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tab === "comps"
              ? comps.map((comp) => (
                  <button
                    className="relative aspect-square overflow-hidden rounded-md border border-border"
                    key={comp.id}
                    onClick={() => props.onAdd({ compId: comp.id })}
                    title={comp.name}
                    type="button"
                  >
                    <SlotVisual formatId="ig-square" slot={{ assetId: null, compId: comp.id, id: comp.id, label: null }} />
                  </button>
                ))
              : photos.map((asset) => (
                  <button
                    className="relative aspect-square overflow-hidden rounded-md border border-border"
                    key={asset.id}
                    onClick={() => props.onAdd({ assetId: asset.id })}
                    title={asset.name}
                    type="button"
                  >
                    <img
                      alt={asset.name}
                      className="h-full w-full object-cover"
                      decoding="async"
                      loading="lazy"
                      src={asset.thumbUrl}
                    />
                    <span className="pointer-events-none absolute left-1 top-1">
                      <StatusDot onImage size={6} status={asset.status} />
                    </span>
                  </button>
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A draggable slot tile used in both grid and story strip. */
function SlotTile(props: {
  formatId: string;
  kind: "grid" | "story";
  ratioClass: string;
  slot: PlannerGridSlot;
  onDrop: (fromId: string, toId: string) => void;
}): React.JSX.Element {
  const [over, setOver] = React.useState(false);
  return (
    <div
      className={`group relative overflow-hidden ${props.ratioClass} ${over ? "ring-2 ring-accent" : ""}`}
      draggable
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", props.slot.id)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const fromId = event.dataTransfer.getData("text/plain");
        if (fromId && fromId !== props.slot.id) {
          props.onDrop(fromId, props.slot.id);
        }
      }}
    >
      <SlotVisual formatId={props.formatId} slot={props.slot} />
      <button
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-2xs text-white group-hover:flex"
        onClick={() => removePlannerSlot(props.kind, props.slot.id)}
        type="button"
      >
        ✕
      </button>
    </div>
  );
}

/** Feed grid width at 100% zoom — matches a phone profile column. */
const GRID_BASE_WIDTH = 360;
const ZOOM_MIN = 60;
const ZOOM_MAX = 300;

export function PlannerScreen(): React.JSX.Element {
  const project = useProject();
  const [view, setView] = React.useState<PlannerView>("grid");
  const [storyIndex, setStoryIndex] = React.useState(0);
  const [showSafeZones, setShowSafeZones] = React.useState(true);
  const [zoom, setZoom] = React.useState(100);
  const gridScrollRef = React.useRef<HTMLDivElement>(null);
  const { gridSlots, storySlots } = project.planner;

  const handleAdd = (input: { assetId?: string; compId?: string }): void => {
    if (view === "grid") {
      addPlannerGridSlot(input);
    } else {
      addPlannerStorySlot(input);
    }
  };

  const stepZoom = (delta: number): void => {
    setZoom((current) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current + delta)));
  };

  /** Fill the available planner area with the grid (screen-size reset). */
  const fitToScreen = (): void => {
    const container = gridScrollRef.current;
    if (!container) {
      return;
    }
    const usable = container.clientWidth - 96; // p-6 padding + breathing room
    const next = Math.round((usable / GRID_BASE_WIDTH) * 100);
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
  };

  return (
    <div className="flex h-full overflow-hidden">
      <SourceRail onAdd={handleAdd} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <ToggleGroup
            onValueChange={(value: string[]) => {
              const next = value[value.length - 1];
              if (next === "grid" || next === "story") {
                setView(next);
              }
            }}
            value={[view]}
          >
            <ToggleGroupItem value="grid">Feed grid</ToggleGroupItem>
            <ToggleGroupItem value="story">Stories</ToggleGroupItem>
          </ToggleGroup>
          <Button
            onClick={() => addPlannerPlaceholder(view, "Planned")}
            size="sm"
            type="button"
            variant="outline"
          >
            + Placeholder
          </Button>
          {view === "grid" ? (
            <div className="ml-1 flex items-center gap-1">
              <Button
                aria-label="Zoom out"
                onClick={() => stepZoom(-20)}
                size="sm"
                type="button"
                variant="outline"
              >
                −
              </Button>
              <span className="w-10 text-center font-mono text-2xs tabular-nums text-muted-foreground">
                {zoom}%
              </span>
              <Button
                aria-label="Zoom in"
                onClick={() => stepZoom(20)}
                size="sm"
                type="button"
                variant="outline"
              >
                +
              </Button>
              <Button onClick={fitToScreen} size="sm" type="button" variant="outline">
                Fit screen
              </Button>
              {zoom !== 100 ? (
                <Button
                  onClick={() => setZoom(100)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Actual size
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="ml-2">
              <Switch
                checked={showSafeZones}
                name="Safe zones"
                onCheckedChange={(checked) => setShowSafeZones(Boolean(checked))}
              />
            </div>
          )}
          <span className="ml-auto hidden text-2xs text-muted-foreground lg:block">
            Click a source to add · drag tiles to reorder
          </span>
        </div>

        {view === "grid" ? (
          <div className="flex-1 overflow-y-auto p-6" ref={gridScrollRef}>
            {/* Phone-width profile grid, three columns like Instagram. */}
            <div
              className="mx-auto"
              style={{ width: Math.round((GRID_BASE_WIDTH * zoom) / 100) }}
            >
              <div className="mb-3 flex items-center gap-3 px-1">
                <div className="h-12 w-12 rounded-full border border-border bg-[color:var(--card)]" />
                <div className="flex-1">
                  <div className="text-xs-plus font-semibold">mrs</div>
                  <div className="text-2xs text-muted-foreground">
                    {gridSlots.length} posts planned
                  </div>
                </div>
              </div>
              {gridSlots.length === 0 ? (
                <p className="px-1 py-10 text-center text-2xs text-muted-foreground">
                  Add comps or photos from the left to plan your grid.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-0.5">
                  {/* Instagram's profile grid is 4:5 portrait (since late 2024). */}
                  {gridSlots.map((slot) => (
                    <SlotTile
                      formatId="ig-post"
                      key={slot.id}
                      kind="grid"
                      onDrop={(fromId, toId) => reorderPlannerSlots("grid", fromId, toId)}
                      ratioClass="aspect-[4/5]"
                      slot={slot}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto p-6">
            <StoryPreview
              index={Math.min(storyIndex, Math.max(0, storySlots.length - 1))}
              onStep={setStoryIndex}
              showSafeZones={showSafeZones}
              slots={storySlots}
            />
            <div className="flex w-full max-w-[560px] flex-wrap gap-1.5">
              {storySlots.map((slot, slotIndex) => (
                <button
                  className={`w-14 overflow-hidden rounded-md border ${slotIndex === storyIndex ? "border-accent" : "border-border"}`}
                  key={slot.id}
                  onClick={() => setStoryIndex(slotIndex)}
                  style={{ aspectRatio: "9 / 16" }}
                  type="button"
                >
                  <div className="relative h-full w-full">
                    <SlotTile
                      formatId="ig-story"
                      kind="story"
                      onDrop={(fromId, toId) => reorderPlannerSlots("story", fromId, toId)}
                      ratioClass="h-full w-full"
                      slot={slot}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
