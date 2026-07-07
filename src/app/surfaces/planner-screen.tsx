import * as React from "react";

import { Button, Input, Switch, ToggleGroup, ToggleGroupItem } from "@/toolcraft/ui";

import {
  addPlannerComment,
  addPlannerFrame,
  addPlannerPlaceholder,
  addPlannerSlot,
  consumePlannerSlot,
  deletePlannerComment,
  PLANNER_SLOT_EVENT,
  removePlannerFrame,
  removePlannerSlot,
  reorderPlannerSlots,
  updatePlannerSlot,
  useProject,
} from "../data/project-store";
import {
  PLANNER_CHANNEL_LABELS,
  type PlannerChannel,
  type PlannerGridSlot,
} from "../data/types";
import { SlotVisual } from "../planner/slot-visual";
import { StoryPreview } from "../planner/story-preview";
import { StatusDot } from "../library/status-dot";
import { StatusSelect } from "../library/status-select";

const CHANNELS: {
  aspect: string;
  cols: number;
  formatId: string;
  id: PlannerChannel;
  ratioClass: string;
}[] = [
  { aspect: "4 / 5", cols: 3, formatId: "ig-post", id: "grid", ratioClass: "aspect-[4/5]" },
  { aspect: "9 / 16", cols: 3, formatId: "ig-story", id: "story", ratioClass: "aspect-[9/16]" },
  { aspect: "2 / 3", cols: 2, formatId: "pin", id: "pinterest", ratioClass: "aspect-[2/3]" },
  { aspect: "9 / 16", cols: 3, formatId: "ig-story", id: "reel", ratioClass: "aspect-[9/16]" },
];

function channelConfig(id: PlannerChannel): (typeof CHANNELS)[number] {
  return CHANNELS.find((channel) => channel.id === id) ?? CHANNELS[0]!;
}

function slotsFor(planner: ReturnType<typeof useProject>["planner"], channel: PlannerChannel): PlannerGridSlot[] {
  return channel === "grid"
    ? planner.gridSlots
    : channel === "story"
      ? planner.storySlots
      : channel === "pinterest"
        ? planner.pinSlots
        : planner.reelSlots;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Left rail: comps + library photos to place into the active channel. */
function SourceRail(props: {
  onAdd: (input: { assetId?: string; compId?: string }) => void;
}): React.JSX.Element {
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
    <div className="hidden w-52 shrink-0 flex-col border-r border-border bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] md:flex">
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
                    <SlotVisual
                      formatId="ig-square"
                      slot={{ assetId: null, compId: comp.id, label: null }}
                    />
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

/** Modal media picker for building a carousel: click sources to append frames. */
function FramePicker(props: {
  channel: PlannerChannel;
  onClose: () => void;
  slot: PlannerGridSlot;
}): React.JSX.Element {
  const project = useProject();
  const [tab, setTab] = React.useState<"comps" | "photos">("photos");
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();

  const comps = project.comps.filter(
    (comp) => !needle || comp.name.toLowerCase().includes(needle),
  );
  const photos = project.assets.filter(
    (asset) =>
      !needle ||
      asset.name.toLowerCase().includes(needle) ||
      asset.tags.some((tag) => tag.includes(needle)),
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-8"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[70vh] w-[560px] flex-col overflow-hidden rounded-lg border border-border bg-[color:var(--popover)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] p-3">
          <span className="text-xs-plus font-medium">
            Add carousel frames · {props.slot.frames.length + 1} in post
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ToggleGroup
              onValueChange={(value: string[]) => {
                const next = value[value.length - 1];
                if (next === "comps" || next === "photos") setTab(next);
              }}
              value={[tab]}
            >
              <ToggleGroupItem value="photos">Photos</ToggleGroupItem>
              <ToggleGroupItem value="comps">Comps</ToggleGroupItem>
            </ToggleGroup>
            <Button onClick={props.onClose} size="sm" type="button">
              Done
            </Button>
          </div>
        </div>
        <div className="p-3 pb-0">
          <Input
            className="h-7 text-xs-plus"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            value={query}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-5 gap-2">
            {(tab === "comps" ? comps : photos).map((item) =>
              tab === "comps" ? (
                <button
                  className="relative aspect-square overflow-hidden rounded-md border border-border transition-transform hover:scale-[1.03]"
                  key={item.id}
                  onClick={() => addPlannerFrame(props.channel, props.slot.id, { compId: item.id })}
                  title={item.name}
                  type="button"
                >
                  <SlotVisual
                    formatId="ig-square"
                    slot={{ assetId: null, compId: item.id, label: null }}
                  />
                </button>
              ) : (
                <button
                  className="relative aspect-square overflow-hidden rounded-md border border-border transition-transform hover:scale-[1.03]"
                  key={item.id}
                  onClick={() => addPlannerFrame(props.channel, props.slot.id, { assetId: item.id })}
                  title={item.name}
                  type="button"
                >
                  <img
                    alt={item.name}
                    className="h-full w-full object-cover"
                    decoding="async"
                    loading="lazy"
                    src={(item as (typeof photos)[number]).thumbUrl}
                  />
                </button>
              ),
            )}
          </div>
        </div>
        <p className="border-t border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] px-3 py-2 text-2xs text-muted-foreground">
          Click to add — each click appends the next frame.
        </p>
      </div>
    </div>
  );
}

/** IG-style lightbox: big media with carousel paging + review sidebar. */
function Lightbox(props: {
  channel: PlannerChannel;
  onClose: () => void;
  onNavigate: (slotId: string) => void;
  onOpenPicker: () => void;
  slots: PlannerGridSlot[];
  slot: PlannerGridSlot;
}): React.JSX.Element {
  const { channel, slot, slots } = props;
  const config = channelConfig(channel);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [commentDraft, setCommentDraft] = React.useState("");
  const frameCount = slot.frames.length + 1;
  const slotIndex = slots.findIndex((entry) => entry.id === slot.id);

  const clampedFrame = Math.min(frameIndex, frameCount - 1);
  const media =
    clampedFrame === 0
      ? slot
      : { assetId: slot.frames[clampedFrame - 1]!.assetId, compId: slot.frames[clampedFrame - 1]!.compId, label: null };

  const goPost = React.useCallback(
    (delta: number): void => {
      const next = slots[slotIndex + delta];
      if (next) {
        setFrameIndex(0);
        props.onNavigate(next.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotIndex, slots],
  );

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.onClose();
      if ((event.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (event.key === "ArrowRight") {
        if (frameCount > 1 && clampedFrame < frameCount - 1) setFrameIndex(clampedFrame + 1);
        else goPost(1);
      }
      if (event.key === "ArrowLeft") {
        if (frameCount > 1 && clampedFrame > 0) setFrameIndex(clampedFrame - 1);
        else goPost(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedFrame, frameCount, goPost]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
      onClick={props.onClose}
    >
      {/* Previous / next post — the flow of the grid */}
      {slotIndex > 0 ? (
        <button
          aria-label="Previous post"
          className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
          onClick={(event) => {
            event.stopPropagation();
            goPost(-1);
          }}
          type="button"
        >
          ‹
        </button>
      ) : null}
      {slotIndex < slots.length - 1 ? (
        <button
          aria-label="Next post"
          className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
          onClick={(event) => {
            event.stopPropagation();
            goPost(1);
          }}
          type="button"
        >
          ›
        </button>
      ) : null}

      <div
        className="flex max-h-[86vh] overflow-hidden rounded-lg border border-border bg-[color:var(--popover)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Media with carousel paging */}
        <div className="relative flex items-center justify-center bg-black">
          <div
            className="relative h-[76vh] max-w-[52vw]"
            style={{ aspectRatio: config.aspect }}
          >
            <SlotVisual formatId={config.formatId} slot={media} />
          </div>
          {frameCount > 1 ? (
            <>
              {clampedFrame > 0 ? (
                <button
                  aria-label="Previous frame"
                  className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  onClick={() => setFrameIndex(clampedFrame - 1)}
                  type="button"
                >
                  ‹
                </button>
              ) : null}
              {clampedFrame < frameCount - 1 ? (
                <button
                  aria-label="Next frame"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  onClick={() => setFrameIndex(clampedFrame + 1)}
                  type="button"
                >
                  ›
                </button>
              ) : null}
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                {clampedFrame + 1}/{frameCount}
              </span>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {Array.from({ length: frameCount }, (_, index) => (
                  <button
                    aria-label={`Frame ${index + 1}`}
                    className={`h-1.5 w-1.5 rounded-full ${index === clampedFrame ? "bg-white" : "bg-white/40"}`}
                    key={index}
                    onClick={() => setFrameIndex(index)}
                    type="button"
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Review sidebar */}
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              {PLANNER_CHANNEL_LABELS[channel]} · {slotIndex + 1}/{slots.length}
            </span>
            <button
              className="text-2xs text-muted-foreground hover:text-foreground"
              onClick={props.onClose}
              type="button"
            >
              Close ✕
            </button>
          </div>

          {channel === "grid" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                <button
                  className={`relative w-10 overflow-hidden rounded-sm ${config.ratioClass} ${clampedFrame === 0 ? "ring-1 ring-[color:var(--accent)]" : ""}`}
                  onClick={() => setFrameIndex(0)}
                  type="button"
                >
                  <SlotVisual formatId={config.formatId} slot={slot} />
                </button>
                {slot.frames.map((frame, index) => (
                  <div
                    className={`group relative w-10 overflow-hidden rounded-sm ${config.ratioClass} ${clampedFrame === index + 1 ? "ring-1 ring-[color:var(--accent)]" : ""}`}
                    key={frame.id}
                  >
                    <button
                      className="absolute inset-0"
                      onClick={() => setFrameIndex(index + 1)}
                      type="button"
                    >
                      <SlotVisual
                        formatId={config.formatId}
                        slot={{ assetId: frame.assetId, compId: frame.compId, label: null }}
                      />
                    </button>
                    <button
                      className="absolute right-0 top-0 hidden bg-black/70 px-1 text-[10px] text-white group-hover:block"
                      onClick={() => {
                        removePlannerFrame(channel, slot.id, frame.id);
                        setFrameIndex(0);
                      }}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  aria-label="Add carousel frames"
                  className={`flex w-10 items-center justify-center rounded-sm border border-dashed border-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] text-sm text-muted-foreground hover:border-[color:var(--accent)] hover:text-foreground ${config.ratioClass}`}
                  onClick={props.onOpenPicker}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Status
            </span>
            <StatusSelect
              onChange={(status) => updatePlannerSlot(channel, slot.id, { status })}
              status={slot.status}
              triggerClassName="h-7 w-full justify-between text-2xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Note
            </span>
            <Input
              className="h-7 text-xs-plus"
              defaultValue={slot.label ?? ""}
              key={slot.id}
              onChange={(event) =>
                updatePlannerSlot(channel, slot.id, { label: event.target.value || null })
              }
              placeholder="Caption idea, timing, links…"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] pt-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Comments {slot.comments.length > 0 ? `· ${slot.comments.length}` : ""}
            </span>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {slot.comments.map((comment) => (
                <div className="group mb-2 flex flex-col gap-0.5" key={comment.id}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xs font-medium">{comment.author}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {shortDate(comment.createdAt)}
                    </span>
                    <button
                      className="ml-auto text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
                      onClick={() => deletePlannerComment(channel, slot.id, comment.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="text-xs-plus leading-relaxed text-muted-foreground">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
            <input
              className="h-8 w-full shrink-0 rounded-md border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-transparent px-2 text-xs-plus outline-none placeholder:text-muted-foreground focus:border-[color:var(--accent)]"
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && commentDraft.trim()) {
                  addPlannerComment(channel, slot.id, commentDraft);
                  setCommentDraft("");
                }
              }}
              placeholder="Add a comment…"
              value={commentDraft}
            />
          </div>

          <button
            className="self-start rounded-md border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2.5 py-1 text-2xs text-muted-foreground hover:border-[color:var(--destructive)] hover:text-[color:var(--destructive)]"
            onClick={() => {
              removePlannerSlot(channel, slot.id);
              props.onClose();
            }}
            type="button"
          >
            Delete post
          </button>
        </div>
      </div>
    </div>
  );
}

/** A draggable slot tile used across all channel views. */
function SlotTile(props: {
  channel: PlannerChannel;
  formatId: string;
  onAddFrames?: () => void;
  onDrop: (fromId: string, toId: string) => void;
  onOpen: () => void;
  ratioClass: string;
  slot: PlannerGridSlot;
}): React.JSX.Element {
  const [over, setOver] = React.useState(false);
  return (
    <div
      className={`group relative cursor-pointer overflow-hidden ${props.ratioClass} ${
        over ? "ring-2 ring-accent" : ""
      }`}
      draggable
      onClick={props.onOpen}
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
      <span className="pointer-events-none absolute left-1 top-1">
        <StatusDot onImage size={7} status={props.slot.status} />
      </span>
      {props.slot.frames.length > 0 ? (
        <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-black/60 px-1 font-mono text-[10px] leading-4 text-white">
          ⧉ {props.slot.frames.length + 1}
        </span>
      ) : null}
      {props.slot.comments.length > 0 ? (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded-sm bg-black/60 px-1 text-[10px] leading-4 text-white">
          💬 {props.slot.comments.length}
        </span>
      ) : null}
      <div className="absolute right-1 top-6 hidden flex-col gap-1 group-hover:flex">
        <button
          aria-label="Remove from plan"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-2xs text-white hover:bg-black/80"
          onClick={(event) => {
            event.stopPropagation();
            removePlannerSlot(props.channel, props.slot.id);
          }}
          title="Remove from plan"
          type="button"
        >
          ✕
        </button>
        {props.onAddFrames ? (
          <button
            aria-label="Add carousel frames"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-2xs text-white hover:bg-black/80"
            onClick={(event) => {
              event.stopPropagation();
              props.onAddFrames?.();
            }}
            title="Make this a carousel — add frames"
            type="button"
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Feed grid width at 100% zoom — matches a phone profile column. */
const GRID_BASE_WIDTH = 360;
const ZOOM_MIN = 60;
const ZOOM_MAX = 300;

export function PlannerScreen(): React.JSX.Element {
  const project = useProject();
  const [view, setView] = React.useState<PlannerChannel>("grid");
  const [lightboxId, setLightboxId] = React.useState<string | null>(null);
  const [pickerId, setPickerId] = React.useState<string | null>(null);
  const [storyIndex, setStoryIndex] = React.useState(0);
  const [showSafeZones, setShowSafeZones] = React.useState(true);
  const [zoom, setZoom] = React.useState(100);
  const gridScrollRef = React.useRef<HTMLDivElement>(null);

  const slots = slotsFor(project.planner, view);
  const lightboxSlot = slots.find((slot) => slot.id === lightboxId) ?? null;
  const pickerSlot = slots.find((slot) => slot.id === pickerId) ?? null;
  const config = channelConfig(view);
  const { storySlots } = project.planner;

  // Cross-surface intent (task links): open a specific post's lightbox.
  React.useEffect(() => {
    const check = (): void => {
      const pending = consumePlannerSlot();
      if (pending) {
        setView(pending.channel);
        setLightboxId(pending.slotId);
        setPickerId(null);
      }
    };
    check();
    window.addEventListener(PLANNER_SLOT_EVENT, check);
    return () => window.removeEventListener(PLANNER_SLOT_EVENT, check);
  }, []);

  const switchView = (next: PlannerChannel): void => {
    setView(next);
    setLightboxId(null);
    setPickerId(null);
  };

  const handleAdd = (input: { assetId?: string; compId?: string }): void => {
    addPlannerSlot(view, input);
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
        <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-4 py-2">
          <ToggleGroup
            onValueChange={(value: string[]) => {
              const next = value[value.length - 1] as PlannerChannel | undefined;
              if (next && CHANNELS.some((channel) => channel.id === next)) {
                switchView(next);
              }
            }}
            value={[view]}
          >
            {CHANNELS.map((channel) => (
              <ToggleGroupItem key={channel.id} value={channel.id}>
                {PLANNER_CHANNEL_LABELS[channel.id]}
              </ToggleGroupItem>
            ))}
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
          ) : view === "story" ? (
            <div className="ml-2">
              <Switch
                checked={showSafeZones}
                name="Safe zones"
                onCheckedChange={(checked) => setShowSafeZones(Boolean(checked))}
              />
            </div>
          ) : null}
          <span className="ml-auto hidden text-2xs text-muted-foreground lg:block">
            Click a tile to open it · hover + for carousel · drag to reorder
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
                    {slots.length} posts planned
                  </div>
                </div>
              </div>
              {slots.length === 0 ? (
                <p className="px-1 py-10 text-center text-2xs text-muted-foreground">
                  Add comps or photos from the left to plan your grid.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-0.5">
                  {/* Instagram's profile grid is 4:5 portrait (since late 2024). */}
                  {slots.map((slot) => (
                    <SlotTile
                      channel="grid"
                      formatId="ig-post"
                      key={slot.id}
                      onAddFrames={() => setPickerId(slot.id)}
                      onDrop={(fromId, toId) => reorderPlannerSlots("grid", fromId, toId)}
                      onOpen={() => setLightboxId(slot.id)}
                      ratioClass="aspect-[4/5]"
                      slot={slot}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : view === "story" ? (
          <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto p-6">
            <StoryPreview
              index={Math.min(storyIndex, Math.max(0, storySlots.length - 1))}
              onStep={setStoryIndex}
              showSafeZones={showSafeZones}
              slots={storySlots}
            />
            <div className="flex w-full max-w-[560px] flex-wrap gap-1.5">
              {storySlots.map((slot, slotIndex) => (
                <div
                  className={`w-14 overflow-hidden rounded-md border ${slotIndex === storyIndex ? "border-accent" : "border-border"}`}
                  key={slot.id}
                  style={{ aspectRatio: "9 / 16" }}
                >
                  <div className="relative h-full w-full">
                    <SlotTile
                      channel="story"
                      formatId="ig-story"
                      onDrop={(fromId, toId) => reorderPlannerSlots("story", fromId, toId)}
                      onOpen={() => {
                        setStoryIndex(slotIndex);
                        setLightboxId(slot.id);
                      }}
                      ratioClass="h-full w-full"
                      slot={slot}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Pinterest board / Reels tab preview at phone width. */}
            <div className="mx-auto" style={{ width: GRID_BASE_WIDTH }}>
              <div className="mb-3 px-1">
                <div className="text-xs-plus font-semibold">
                  {PLANNER_CHANNEL_LABELS[view]}
                </div>
                <div className="text-2xs text-muted-foreground">
                  {slots.length} planned
                </div>
              </div>
              {slots.length === 0 ? (
                <p className="px-1 py-10 text-center text-2xs text-muted-foreground">
                  Add comps or photos from the left to plan{" "}
                  {view === "pinterest" ? "pins" : "reels"}.
                </p>
              ) : (
                <div
                  className={`grid gap-0.5 ${config.cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                >
                  {slots.map((slot) => (
                    <SlotTile
                      channel={view}
                      formatId={config.formatId}
                      key={slot.id}
                      onDrop={(fromId, toId) => reorderPlannerSlots(view, fromId, toId)}
                      onOpen={() => setLightboxId(slot.id)}
                      ratioClass={config.ratioClass}
                      slot={slot}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {lightboxSlot ? (
        <Lightbox
          channel={view}
          key={lightboxSlot.id}
          onClose={() => setLightboxId(null)}
          onNavigate={setLightboxId}
          onOpenPicker={() => setPickerId(lightboxSlot.id)}
          slot={lightboxSlot}
          slots={slots}
        />
      ) : null}
      {pickerSlot ? (
        <FramePicker
          channel={view}
          onClose={() => setPickerId(null)}
          slot={pickerSlot}
        />
      ) : null}
    </div>
  );
}
