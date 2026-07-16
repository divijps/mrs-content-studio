import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { DownloadSimpleIcon, FolderIcon, TrashIcon } from "@phosphor-icons/react";

import { Button, Input, ToggleGroup, ToggleGroupItem } from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
} from "@/toolcraft/ui/components/primitives";
import { toast } from "sonner";

import {
  downloadCarousel,
  downloadPlannerChannel,
  downloadSlotMedia,
} from "../planner/planner-export";
import {
  addPlannerComment,
  addPlannerFrame,
  addPlannerSlot,
  consumePlannerSlot,
  deletePlannerComment,
  PLANNER_SLOT_EVENT,
  removePlannerFrame,
  removePlannerSlot,
  reorderPlannerSlots,
  requestLibraryAsset,
  setActiveArtboard,
  updatePlannerSlot,
  useProject,
} from "../data/project-store";
import { getFormat } from "../data/formats";
import {
  PLANNER_CHANNEL_LABELS,
  type PlannerChannel,
  type PlannerGridSlot,
  type ReviewStatus,
  type SlotCrop,
} from "../data/types";
import { TagChip } from "../ui/inspector-kit";
import { cropGeometry, SlotVisual } from "../planner/slot-visual";
import { StoryPreview } from "../planner/story-preview";
import { StatusSelect } from "../library/status-select";
import { useTeamRoster } from "../library/mentions";

const CHANNELS: {
  aspect: string;
  cols: number;
  formatId: string;
  id: PlannerChannel;
  /** Lightbox media width on md+: the card is a fixed 86vh tall, so width =
   * 86vh × aspect as a STATIC class per channel — deriving it from h-full +
   * aspect-ratio hits flexbox's intrinsic-sizing pass (indefinite height) and
   * mis-sizes the stage, which showed as black bars / sideways overflow. */
  lightboxWidth: string;
  ratioClass: string;
}[] = [
  { aspect: "4 / 5", cols: 3, formatId: "ig-post", id: "grid", lightboxWidth: "md:w-[68.8vh]", ratioClass: "aspect-[4/5]" },
  { aspect: "9 / 16", cols: 3, formatId: "ig-story", id: "story", lightboxWidth: "md:w-[48.375vh]", ratioClass: "aspect-[9/16]" },
  { aspect: "2 / 3", cols: 2, formatId: "pin", id: "pinterest", lightboxWidth: "md:w-[57.33vh]", ratioClass: "aspect-[2/3]" },
  { aspect: "9 / 16", cols: 3, formatId: "ig-story", id: "reel", lightboxWidth: "md:w-[48.375vh]", ratioClass: "aspect-[9/16]" },
  { aspect: "9 / 16", cols: 3, formatId: "tiktok", id: "tiktok", lightboxWidth: "md:w-[48.375vh]", ratioClass: "aspect-[9/16]" },
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
        : channel === "tiktok"
          ? planner.tiktokSlots
          : planner.reelSlots;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Source rail page size — thumbnails mount per "Load more" click. */
const RAIL_PAGE = 12;

/** Comps + library media to place into the active channel. Used both as the
 * desktop left rail and inside the mobile "Add to plan" sheet. */
function SourceBrowser(props: {
  onAdd: (input: { assetId?: string; compId?: string }) => void;
}): React.JSX.Element {
  const project = useProject();
  const [tab, setTab] = React.useState<"comps" | "library">("comps");
  const [query, setQuery] = React.useState("");
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(RAIL_PAGE);
  const needle = query.trim().toLowerCase();

  const collectionsById = React.useMemo(
    () => new Map(project.collections.map((collection) => [collection.id, collection])),
    [project.collections],
  );
  const folderPath = React.useCallback(
    (collectionId: string | null): string => {
      const names: string[] = [];
      let cursor = collectionId;
      while (cursor) {
        const collection = collectionsById.get(cursor);
        if (!collection) break;
        names.unshift(collection.name);
        cursor = collection.parentId;
      }
      return names.join(" / ");
    },
    [collectionsById],
  );

  // Comps tab: designs SAVED OUT of the Studio — they're Library assets that
  // carry a `sourceValues` blob. Deliberately NOT `project.comps` (the live
  // session artboards), which shift as you edit and made this rail unstable.
  // Latest first; added as a static asset so the planned post never mutates.
  const comps = React.useMemo(
    () =>
      [...project.assets]
        .filter((asset) => asset.sourceValues != null)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .filter(
          (asset) =>
            !needle ||
            asset.name.toLowerCase().includes(needle) ||
            asset.filename.toLowerCase().includes(needle),
        ),
    [project.assets, needle],
  );

  // Library media: raw photos/videos (exclude saved comps — those live in the
  // Comps tab). Latest first, searchable by name / file / tag / folder path.
  const photos = React.useMemo(
    () =>
      [...project.assets]
        .filter((asset) => asset.sourceValues == null)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .filter((asset) => {
          if (activeTag && !asset.tags.includes(activeTag)) return false;
          if (!needle) return true;
          return (
            asset.name.toLowerCase().includes(needle) ||
            asset.filename.toLowerCase().includes(needle) ||
            asset.tags.some((tag) => tag.includes(needle)) ||
            folderPath(asset.collectionId).toLowerCase().includes(needle)
          );
        }),
    [project.assets, needle, activeTag, folderPath],
  );

  const recentTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of project.assets) {
      for (const tag of asset.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [project.assets]);

  const items = tab === "comps" ? comps : photos;
  const remaining = Math.max(0, items.length - limit);

  React.useEffect(() => {
    setLimit(RAIL_PAGE);
  }, [tab, needle, activeTag]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <ToggleGroup
          className="w-full"
          onValueChange={(value: string[]) => {
            const next = value[value.length - 1];
            if (next === "comps" || next === "library") setTab(next);
          }}
          value={[tab]}
        >
          <ToggleGroupItem className="flex-1" value="comps">
            Comps
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="library">
            Library
          </ToggleGroupItem>
        </ToggleGroup>
        <Input
          className="h-8 text-xs-plus"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === "comps" ? "Search comps…" : "Search name, tag, or folder…"}
          value={query}
        />
        {tab === "library" && recentTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {recentTags.map((tag) => (
              <TagChip
                active={activeTag === tag}
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                size="xs"
                tag={tag}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-2xs text-muted-foreground">
            {needle || activeTag
              ? "Nothing matches."
              : tab === "comps"
                ? "No saved comps yet — use Save to Library in the Studio."
                : "No media yet — import in the Library."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {items.slice(0, limit).map((asset) => (
                <button
                  className="relative aspect-square cursor-grab overflow-hidden rounded-md border border-border transition-transform hover:scale-[1.02] active:cursor-grabbing"
                  draggable
                  key={asset.id}
                  onClick={() => props.onAdd({ assetId: asset.id })}
                  onDragStart={(event) =>
                    event.dataTransfer.setData("text/plain", `add:asset:${asset.id}`)
                  }
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
                </button>
              ))}
            </div>
            {remaining > 0 ? (
              <button
                className="mt-2 w-full rounded-md border border-border py-1.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setLimit((current) => current + RAIL_PAGE)}
                type="button"
              >
                Load {Math.min(remaining, RAIL_PAGE)} more
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** Desktop left rail wrapping the source browser. */
function SourceRail(props: {
  onAdd: (input: { assetId?: string; compId?: string }) => void;
  /** Dropping a planned post (a bare slot id) here removes it from the plan. */
  onRemove: (payload: string) => void;
}): React.JSX.Element {
  const [over, setOver] = React.useState(false);
  return (
    <div
      className={`hidden w-72 shrink-0 flex-col border-r border-border bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] md:flex ${
        over ? "ring-2 ring-inset ring-[color:var(--destructive)]" : ""
      }`}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        props.onRemove(event.dataTransfer.getData("text/plain"));
      }}
    >
      <SourceBrowser onAdd={props.onAdd} />
    </div>
  );
}

/** Mobile bottom sheet for adding to the plan (the rail is desktop-only). */
function AddSourceSheet(props: {
  channelLabel: string;
  onAdd: (input: { assetId?: string; compId?: string }) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={props.onClose}>
      <div
        className="flex max-h-[80vh] flex-col overflow-hidden rounded-t-[var(--radius-panel)] border-t border-border bg-[color:var(--popover)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs-plus">Add to {props.channelLabel}</span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={props.onClose}
            type="button"
          >
            Done
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SourceBrowser onAdd={props.onAdd} />
        </div>
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
  /** Owner-only: false when viewing a teammate's planner (view + comment only). */
  editable: boolean;
  onClose: () => void;
  onNavigate: (slotId: string) => void;
  onOpenPicker: () => void;
  slots: PlannerGridSlot[];
  slot: PlannerGridSlot;
}): React.JSX.Element {
  const { channel, editable, slot, slots } = props;
  const project = useProject();
  const config = channelConfig(channel);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [busy, setBusy] = React.useState<null | "all" | "one">(null);
  // Staged handoff (the asset viewer's Notify pattern): status/assignee edits
  // queue here until confirmed, so a hand-off is a deliberate act.
  const [pendingHandoff, setPendingHandoff] = React.useState<{
    assignedTo: string | null;
    status: ReviewStatus;
  } | null>(null);
  // Cover reframe mid-gesture (drag / zoom slider) — committed on release.
  const [liveCrop, setLiveCrop] = React.useState<SlotCrop | null>(null);
  // Render-phase reset when the lightbox walks to another post, so staged
  // values never bleed a frame onto the next slot.
  const [stagedFor, setStagedFor] = React.useState(slot.id);
  if (stagedFor !== slot.id) {
    setStagedFor(slot.id);
    setPendingHandoff(null);
    setLiveCrop(null);
  }
  const frameCount = slot.frames.length + 1;
  const slotIndex = slots.findIndex((entry) => entry.id === slot.id);

  const clampedFrame = Math.min(frameIndex, frameCount - 1);
  const media =
    clampedFrame === 0
      ? slot
      : { assetId: slot.frames[clampedFrame - 1]!.assetId, compId: slot.frames[clampedFrame - 1]!.compId, label: null };

  // Reframe: the cover asset (not comps, not videos) can be zoomed + panned.
  const coverAsset =
    clampedFrame === 0 && slot.assetId && !slot.compId
      ? project.assets.find((candidate) => candidate.id === slot.assetId)
      : undefined;
  const reframable =
    editable &&
    coverAsset != null &&
    coverAsset.kind !== "video" &&
    coverAsset.width > 0 &&
    coverAsset.height > 0;
  const effCrop: SlotCrop | null = liveCrop ?? slot.crop ?? null;
  const baseCrop = (): SlotCrop =>
    effCrop ?? { scale: 1, x: coverAsset?.focalPoint.x ?? 0.5, y: coverAsset?.focalPoint.y ?? 0.5 };
  const commitCrop = (next: SlotCrop | null): void => {
    updatePlannerSlot(channel, slot.id, { crop: next });
    setLiveCrop(null);
  };
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
  const dragRef = React.useRef<{
    crop: SlotCrop;
    height: number;
    width: number;
    x0: number;
    y0: number;
  } | null>(null);
  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!reframable || !coverAsset) return;
    // Frame arrows / dots / the zoom slider own their pointers.
    if ((event.target as HTMLElement).closest("button, [data-slot='slider']")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      crop: baseCrop(),
      height: rect.height,
      width: rect.width,
      x0: event.clientX,
      y0: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || !coverAsset) return;
    const geometry = cropGeometry(
      drag.crop,
      coverAsset.width / coverAsset.height,
      drag.width / drag.height,
    );
    // left = (W - drawnW) · x, so a pixel drag maps back via the pan range
    // (negative when the media overflows — which is the only draggable case).
    const panX = (drag.width * (100 - geometry.widthPct)) / 100;
    const panY = (drag.height * (100 - geometry.heightPct)) / 100;
    setLiveCrop({
      scale: drag.crop.scale,
      x: panX ? clamp01(drag.crop.x + (event.clientX - drag.x0) / panX) : drag.crop.x,
      y: panY ? clamp01(drag.crop.y + (event.clientY - drag.y0) / panY) : drag.crop.y,
    });
  };
  const onStagePointerUp = (): void => {
    if (dragRef.current && liveCrop) commitCrop(liveCrop);
    dragRef.current = null;
  };

  const carouselName = slot.label ? slot.label : `carousel-${slotIndex + 1}`;

  const downloadOne = async (): Promise<void> => {
    setBusy("one");
    try {
      const ok = await downloadSlotMedia(media, project, config.formatId);
      if (!ok) toast.message("This frame is an empty placeholder.");
    } catch (error) {
      toast.error(`Download failed: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async (): Promise<void> => {
    setBusy("all");
    const toastId = toast.loading("Preparing carousel…");
    try {
      const count = await downloadCarousel(slot, project, config.formatId, carouselName);
      if (count > 0) {
        toast.success(`Downloaded ${count} file${count === 1 ? "" : "s"}`, { id: toastId });
      } else {
        toast.error("Nothing to download.", { id: toastId });
      }
    } catch (error) {
      toast.error(`Download failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setBusy(null);
    }
  };

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

  const navigate = useNavigate();
  const roster = useTeamRoster();

  // Staged handoff — effective (staged-or-current) values + commit actions.
  // `assignedTo` is undefined on never-assigned slots but staged values are
  // normalized to null; compare normalized so untouched ≠ dirty.
  const currentAssignee: string | null = slot.assignedTo ?? null;
  const effStatus = pendingHandoff?.status ?? slot.status;
  const effAssignee: string | null = pendingHandoff ? pendingHandoff.assignedTo : currentAssignee;
  const handoffDirty =
    pendingHandoff != null &&
    (pendingHandoff.status !== slot.status || pendingHandoff.assignedTo !== currentAssignee);
  const canGoLive = effStatus === "approve" && effAssignee != null;
  const commitHandoff = (): void => {
    if (pendingHandoff && handoffDirty) {
      updatePlannerSlot(channel, slot.id, {
        assignedTo: pendingHandoff.assignedTo,
        status: pendingHandoff.status,
      });
    }
    setPendingHandoff(null);
  };
  const goLive = (): void => {
    updatePlannerSlot(channel, slot.id, { assignedTo: null, status: "approve" });
    setPendingHandoff(null);
  };
  const format = getFormat(config.formatId);
  const POST_NOUN: Record<PlannerChannel, string> = {
    grid: "Post",
    pinterest: "Pin",
    reel: "Reel",
    story: "Story",
    tiktok: "Video",
  };
  const title = `${format.platformLabel} ${POST_NOUN[channel]}`;

  // Notes grouped by author, globally numbered — mirrors the asset viewer.
  const noteGroups: {
    author: string;
    items: { comment: (typeof slot.comments)[number]; number: number }[];
  }[] = [];
  slot.comments.forEach((comment, i) => {
    let group = noteGroups.find((entry) => entry.author === comment.author);
    if (!group) {
      group = { author: comment.author, items: [] };
      noteGroups.push(group);
    }
    group.items.push({ comment, number: i + 1 });
  });

  // View asset → the Library asset viewer (raw asset) or the Studio (a comp).
  const viewAsset = (): void => {
    if (media.assetId) {
      requestLibraryAsset(media.assetId);
      void navigate({ to: "/library" });
    } else if (media.compId) {
      setActiveArtboard(media.compId);
      void navigate({ to: "/" });
    }
  };
  const hasAsset = Boolean(media.assetId || media.compId);

  const UNASSIGNED = "__unassigned__";
  const FIELD =
    "h-auto w-full rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]";
  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] transition-transform hover:text-[color:var(--foreground)] active:scale-90 disabled:opacity-30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 md:p-6"
      onClick={props.onClose}
    >
      {/* Previous / next post — the flow of the grid */}
      {slotIndex > 0 ? (
        <button
          aria-label="Previous post"
          className="absolute left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20 md:flex"
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
          className="absolute right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20 md:flex"
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
        className="flex h-full w-full flex-col overflow-y-auto bg-[color:var(--popover)] shadow-2xl md:h-[86vh] md:w-auto md:flex-row md:overflow-hidden md:rounded-lg md:border md:border-border"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Mobile top bar — pinned over the single scroll (media + settings
         * flow underneath it); desktop keeps the sidebar's own header. */}
        <div className="sticky top-0 z-20 flex shrink-0 items-center gap-1 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:var(--popover)] px-2 py-2 md:hidden">
          <button
            aria-label="Previous post"
            className={iconBtn}
            disabled={slotIndex <= 0}
            onClick={() => goPost(-1)}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="Next post"
            className={iconBtn}
            disabled={slotIndex >= slots.length - 1}
            onClick={() => goPost(1)}
            type="button"
          >
            ›
          </button>
          <div className="ml-auto flex items-center gap-1">
            {editable ? (
              <button
                className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs-plus text-[color:color-mix(in_oklab,var(--foreground)_62%,transparent)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--destructive)_14%,transparent)] hover:text-[color:var(--destructive)]"
                onClick={() => {
                  removePlannerSlot(channel, slot.id);
                  props.onClose();
                }}
                title="Remove from plan"
                type="button"
              >
                <TrashIcon size={14} />
                Remove
              </button>
            ) : null}
            <button aria-label="Close" className={iconBtn} onClick={props.onClose} type="button">
              ✕
            </button>
          </div>
        </div>

        {/* Media with carousel paging + (cover) zoom/pan reframe */}
        <div className="group/stage relative flex shrink-0 items-center justify-center bg-black">
          <div
            className={`relative w-full md:h-full md:max-w-[52vw] ${config.lightboxWidth} ${
              reframable ? "cursor-grab touch-none active:cursor-grabbing" : ""
            }`}
            onPointerCancel={onStagePointerUp}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            style={{ aspectRatio: config.aspect }}
          >
            <SlotVisual
              formatId={config.formatId}
              playable
              slot={clampedFrame === 0 ? { ...slot, crop: effCrop } : media}
            />
            {reframable ? (
              <div className="absolute right-2 top-2 z-10 flex w-44 items-center gap-2.5 rounded-lg bg-black/60 px-3 py-2 opacity-0 backdrop-blur transition-opacity focus-within:opacity-100 group-hover/stage:opacity-100">
                <Slider
                  aria-label="Scale"
                  max={3}
                  min={1}
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (typeof next === "number") setLiveCrop({ ...baseCrop(), scale: next });
                  }}
                  onValueCommitted={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (typeof next === "number") commitCrop({ ...baseCrop(), scale: next });
                  }}
                  step={0.01}
                  value={effCrop?.scale ?? 1}
                />
                {slot.crop || liveCrop ? (
                  <button
                    className="text-2xs text-white/70 transition-colors hover:text-white"
                    onClick={() => commitCrop(null)}
                    type="button"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            ) : null}
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

        {/* Detail sidebar — asset-viewer style. On mobile it flows under the
         * full-width media in the card's single scroll. */}
        <div className="flex w-full flex-col md:min-h-0 md:w-[320px] md:flex-none">
          {/* Header — prev/next through the channel's posts + close (desktop;
           * mobile uses the pinned top bar). */}
          <div className="hidden items-center gap-1 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-2 py-2 md:flex">
            <button
              aria-label="Previous post"
              className={iconBtn}
              disabled={slotIndex <= 0}
              onClick={() => goPost(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="Next post"
              className={iconBtn}
              disabled={slotIndex >= slots.length - 1}
              onClick={() => goPost(1)}
              type="button"
            >
              ›
            </button>
            <div className="ml-auto flex items-center gap-1">
              {editable ? (
                // The tile's hover-✕ is unreachable on touch (iPad) — give the
                // open post a plain delete control right here.
                <button
                  className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs-plus text-[color:color-mix(in_oklab,var(--foreground)_62%,transparent)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--destructive)_14%,transparent)] hover:text-[color:var(--destructive)]"
                  onClick={() => {
                    removePlannerSlot(channel, slot.id);
                    props.onClose();
                  }}
                  title="Remove from plan"
                  type="button"
                >
                  <TrashIcon size={14} />
                  Remove
                </button>
              ) : null}
              <button aria-label="Close" className={iconBtn} onClick={props.onClose} type="button">
                ✕
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <p className="text-xl font-semibold leading-tight">{title}</p>

            {/* Content — cover + carousel frames (✕ on hover) + add */}
            <div className="flex flex-col gap-2">
              <span className="ds-label">Content</span>
              <div className="flex flex-wrap gap-2">
                <div
                  className={`group relative h-16 w-16 overflow-hidden rounded-lg border transition-colors ${
                    clampedFrame === 0
                      ? "border-[color:var(--accent)]"
                      : "border-[color:color-mix(in_oklab,var(--border)_16%,transparent)]"
                  }`}
                >
                  <button
                    aria-label="Cover"
                    className="absolute inset-0"
                    onClick={() => setFrameIndex(0)}
                    type="button"
                  >
                    <SlotVisual formatId={config.formatId} slot={slot} />
                  </button>
                  {editable ? (
                    <button
                      aria-label="Remove post"
                      className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-white group-hover:flex"
                      onClick={() => {
                        removePlannerSlot(channel, slot.id);
                        props.onClose();
                      }}
                      title="Remove this post"
                      type="button"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                {slot.frames.map((frame, index) => (
                  <div
                    className={`group relative h-16 w-16 overflow-hidden rounded-lg border transition-colors ${
                      clampedFrame === index + 1
                        ? "border-[color:var(--accent)]"
                        : "border-[color:color-mix(in_oklab,var(--border)_16%,transparent)]"
                    }`}
                    key={frame.id}
                  >
                    <button
                      aria-label={`Frame ${index + 2}`}
                      className="absolute inset-0"
                      onClick={() => setFrameIndex(index + 1)}
                      type="button"
                    >
                      <SlotVisual
                        formatId={config.formatId}
                        slot={{ assetId: frame.assetId, compId: frame.compId, label: null }}
                      />
                    </button>
                    {editable ? (
                      <button
                        aria-label="Remove frame"
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-white group-hover:flex"
                        onClick={() => {
                          removePlannerFrame(channel, slot.id, frame.id);
                          setFrameIndex(0);
                        }}
                        type="button"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ))}
                {editable ? (
                  <button
                    aria-label="Add content"
                    className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] text-lg text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
                    onClick={props.onOpenPicker}
                    type="button"
                  >
                    +
                  </button>
                ) : null}
              </div>
            </div>

            {/* Description */}
            <input
              className={FIELD}
              defaultValue={slot.label ?? ""}
              disabled={!editable}
              key={slot.id}
              onChange={(event) =>
                updatePlannerSlot(channel, slot.id, { label: event.target.value || null })
              }
              placeholder="Add description"
            />

            {/* Schedule — native inputs render blank when unset (esp. on iOS),
                so label the section and each field to explain the two blanks. */}
            <div className="flex flex-col gap-2">
              <span className="ds-label">Schedule</span>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                    Date
                  </span>
                  <input
                    aria-label="Publish date"
                    className={FIELD}
                    disabled={!editable}
                    onChange={(event) =>
                      updatePlannerSlot(channel, slot.id, {
                        scheduledDate: event.target.value || null,
                      })
                    }
                    type="date"
                    value={slot.scheduledDate ?? ""}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                    Time
                  </span>
                  <input
                    aria-label="Publish time"
                    className={FIELD}
                    disabled={!editable}
                    onChange={(event) =>
                      updatePlannerSlot(channel, slot.id, {
                        scheduledTime: event.target.value || null,
                      })
                    }
                    type="time"
                    value={slot.scheduledTime ?? ""}
                  />
                </label>
              </div>
            </div>

            {/* Handoff — status + assignee STAGE until "Notify" commits (the
             * asset viewer's pattern: handing off is a deliberate act), then
             * the note composer */}
            <div className="flex flex-col gap-2.5">
              <span className="ds-label">Handoff</span>
              <div className="grid grid-cols-2 gap-2">
                <StatusSelect
                  onChange={(status) => {
                    if (editable) setPendingHandoff({ assignedTo: effAssignee, status });
                  }}
                  status={effStatus}
                  triggerClassName={`${FIELD} justify-between`}
                />
                <Select
                  items={[
                    { label: "Unassigned", value: UNASSIGNED },
                    ...roster.map((name) => ({ label: name, value: name })),
                  ]}
                  onValueChange={(next) => {
                    if (editable) {
                      setPendingHandoff({
                        assignedTo: next === UNASSIGNED ? null : String(next),
                        status: effStatus,
                      });
                    }
                  }}
                  value={effAssignee ?? UNASSIGNED}
                >
                  <SelectTrigger className={`${FIELD} justify-between`}>
                    <SelectValue>{() => effAssignee ?? "Unassigned"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {roster.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {handoffDirty || canGoLive ? (
                <div className="flex items-center gap-2">
                  {handoffDirty ? (
                    <button
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--accent)] text-xs-plus font-medium text-[color:var(--accent-foreground)] transition-opacity hover:opacity-90"
                      onClick={commitHandoff}
                      type="button"
                    >
                      {effAssignee ? `Notify ${effAssignee.split(" ")[0]}` : "Apply"}
                    </button>
                  ) : null}
                  {canGoLive ? (
                    <button
                      className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs-plus font-medium transition-colors ${
                        handoffDirty
                          ? "border border-[color:color-mix(in_oklab,var(--border)_28%,transparent)] text-foreground hover:bg-[color:var(--surface-inactive)]"
                          : "flex-1 bg-[#3d7b53] text-white hover:opacity-90"
                      }`}
                      onClick={goLive}
                      type="button"
                    >
                      Go live
                    </button>
                  ) : null}
                  {handoffDirty ? (
                    <button
                      className="px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setPendingHandoff(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              ) : null}
              <input
                className={FIELD}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && commentDraft.trim()) {
                    addPlannerComment(channel, slot.id, commentDraft);
                    setCommentDraft("");
                  }
                }}
                placeholder="Add a note"
                value={commentDraft}
              />
            </div>

            {/* Notes — grouped by author, numbered */}
            {slot.comments.length > 0 ? (
              <div className="flex flex-col gap-4">
                {noteGroups.map((group) => (
                  <div className="flex flex-col gap-1.5" key={group.author}>
                    <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                      {group.author}
                    </span>
                    {group.items.map(({ comment, number }) => (
                      <div
                        className="group flex items-center gap-2.5 rounded-lg bg-[color:var(--surface-inactive)] px-2.5 py-2"
                        key={comment.id}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[color:var(--surface-raised)] text-2xs font-semibold tabular-nums text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]">
                          {number}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{comment.body}</span>
                        <button
                          aria-label="Delete note"
                          className="hidden shrink-0 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--destructive)] group-hover:block"
                          onClick={() => deletePlannerComment(channel, slot.id, comment.id)}
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Footer — View asset (Library viewer / Studio) + Download. Sticky
           * on mobile so Download stays reachable mid-scroll (safe-area aware). */}
          <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:var(--popover)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:pb-3">
            {hasAsset ? (
              <button
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-sm font-medium text-[color:color-mix(in_oklab,var(--foreground)_88%,transparent)] transition-colors hover:bg-[color:var(--surface-inactive)]"
                onClick={viewAsset}
                type="button"
              >
                <FolderIcon size={16} />
                View asset
              </button>
            ) : null}
            <button
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void (frameCount > 1 ? downloadAll() : downloadOne())}
              type="button"
            >
              <DownloadSimpleIcon size={17} weight="bold" />
              {busy ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A draggable slot tile used across all channel views. */
function SlotTile(props: {
  channel: PlannerChannel;
  editable: boolean;
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
      draggable={props.editable}
      onClick={props.onOpen}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", props.slot.id)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const fromId = event.dataTransfer.getData("text/plain");
        if (fromId && fromId !== props.slot.id) {
          props.onDrop(fromId, props.slot.id);
        }
      }}
    >
      <SlotVisual formatId={props.formatId} slot={props.slot} />
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
      <div
        className={`absolute right-1 top-6 hidden flex-col gap-1 group-hover:flex ${
          props.editable ? "" : "!hidden"
        }`}
      >
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
  const currentName = project.settings.displayName ?? "You";
  const roster = useTeamRoster();
  const [view, setView] = React.useState<PlannerChannel>("grid");
  // null = your own planner. Deriving from currentName (rather than snapshotting
  // it) means a late-resolving displayName can't strand your posts under a stale
  // "You" filter — a source of the "posts randomly disappear" glitch.
  const [ownerOverride, setOwnerOverride] = React.useState<string | null>(null);
  const [lightboxId, setLightboxId] = React.useState<string | null>(null);
  const [pickerId, setPickerId] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [storyIndex, setStoryIndex] = React.useState(0);
  const [zoom, setZoom] = React.useState(100);
  const [exporting, setExporting] = React.useState(false);
  const gridScrollRef = React.useRef<HTMLDivElement>(null);

  // Everyone maintains their own planner: posts filter by owner and are editable
  // only by their owner — everyone else gets view + comment access.
  const ownerOptions = React.useMemo(
    () => Array.from(new Set([currentName, ...roster])),
    [currentName, roster],
  );
  const viewedOwner = ownerOverride ?? currentName;
  const editable = viewedOwner === currentName;
  const ownedBy = (slot: PlannerGridSlot): boolean =>
    (slot.owner ?? currentName) === viewedOwner;

  const slots = slotsFor(project.planner, view).filter(ownedBy);
  const lightboxSlot = slots.find((slot) => slot.id === lightboxId) ?? null;
  const pickerSlot = slots.find((slot) => slot.id === pickerId) ?? null;
  const config = channelConfig(view);
  const storySlots = project.planner.storySlots.filter(ownedBy);

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
    if (!editable) return;
    addPlannerSlot(view, input);
  };

  // Drag payloads: "add:comp:<id>" / "add:asset:<id>" dragged from the rail add a
  // post; a bare slot id reorders within the channel.
  const handleSlotDrop = (fromId: string, toId: string): void => {
    if (!editable) return;
    if (fromId.startsWith("add:")) {
      const parts = fromId.split(":");
      if (parts[1] === "comp" && parts[2]) addPlannerSlot(view, { compId: parts[2] });
      else if (parts[1] === "asset" && parts[2]) addPlannerSlot(view, { assetId: parts[2] });
      return;
    }
    reorderPlannerSlots(view, fromId, toId);
  };

  // Dropping a planned post back onto the source rail removes it. Rail items
  // themselves carry "add:*" payloads, so dropping one back is a no-op.
  const handleRailRemove = (payload: string): void => {
    if (!editable) return;
    if (payload && !payload.startsWith("add:")) {
      removePlannerSlot(view, payload);
    }
  };

  /** Export every post in the current channel as one organized ZIP. */
  const exportChannel = async (): Promise<void> => {
    if (slots.length === 0) {
      toast.message("Nothing to export in this channel yet.");
      return;
    }
    setExporting(true);
    const toastId = toast.loading(`Exporting ${PLANNER_CHANNEL_LABELS[view]}…`);
    try {
      const count = await downloadPlannerChannel(
        slots,
        project,
        config.formatId,
        `planner-${view}`,
        (done, total) => toast.loading(`Exporting ${done}/${total} posts…`, { id: toastId }),
      );
      if (count > 0) {
        toast.success(`Exported ${count} file${count === 1 ? "" : "s"} → planner-${view}.zip`, {
          id: toastId,
        });
      } else {
        toast.error("Nothing to export — posts are empty placeholders.", { id: toastId });
      }
    } catch (error) {
      toast.error(`Export failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  /** Scale the grid up to fill the available planner width. */
  const fitToScreen = React.useCallback((): void => {
    const container = gridScrollRef.current;
    if (!container) {
      return;
    }
    const usable = container.clientWidth - 96; // p-6 padding + breathing room
    const next = Math.round((usable / GRID_BASE_WIDTH) * 100);
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {editable ? <SourceRail onAdd={handleAdd} onRemove={handleRailRemove} /> : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-4 py-2">
          <Select
            items={CHANNELS.map((channel) => ({
              label: PLANNER_CHANNEL_LABELS[channel.id],
              value: channel.id,
            }))}
            onValueChange={(next) => {
              if (CHANNELS.some((channel) => channel.id === next)) {
                switchView(next as PlannerChannel);
              }
            }}
            value={view}
          >
            <SelectTrigger className="h-8 w-40 shrink-0 justify-between rounded-lg border-0 bg-[color:var(--surface-inactive)] px-3 text-xs-plus text-foreground outline-none transition-colors hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]">
              <SelectValue>{() => PLANNER_CHANNEL_LABELS[view]}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {PLANNER_CHANNEL_LABELS[channel.id]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {/* Whose planner you're viewing — each teammate owns their own. */}
          <Select
            items={ownerOptions.map((name) => ({
              label: name === currentName ? `${name} (you)` : name,
              value: name,
            }))}
            onValueChange={(next) =>
              setOwnerOverride(next && next !== currentName ? next : null)
            }
            value={viewedOwner}
          >
            <SelectTrigger className="h-8 w-36 shrink-0 justify-between rounded-lg border-0 bg-[color:var(--surface-inactive)] px-3 text-xs-plus text-foreground outline-none transition-colors hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]">
              <SelectValue>
                {() => (viewedOwner === currentName ? `${viewedOwner} (you)` : viewedOwner)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {ownerOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name === currentName ? `${name} (you)` : name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {/* Desktop only — on mobile these move to the bottom action bar, and
           * Fit screen is dropped entirely (the mobile grid already fits). */}
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            {view === "grid" ? (
              <button
                className="flex h-8 shrink-0 items-center rounded-lg bg-[color:var(--surface-inactive)] px-3 text-xs-plus text-foreground transition-colors hover:bg-[color:var(--surface-active)]"
                onClick={() => (zoom === 100 ? fitToScreen() : setZoom(100))}
                type="button"
              >
                {zoom === 100 ? "Fit screen" : "Actual size"}
              </button>
            ) : null}
            <button
              className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              disabled={exporting || slots.length === 0}
              onClick={() => void exportChannel()}
              title={`Download every post in ${PLANNER_CHANNEL_LABELS[view]} as a ZIP`}
              type="button"
            >
              <DownloadSimpleIcon size={14} weight="bold" />
              {exporting ? "Exporting…" : "Export all"}
            </button>
          </div>
        </div>

        {!editable ? (
          <div className="shrink-0 border-b border-border bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)] px-4 py-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]">
            Viewing {viewedOwner}'s planner — you can comment, but only {viewedOwner} can
            edit it.
          </div>
        ) : null}

        {view === "grid" ? (
          <div
            className="flex-1 overflow-y-auto p-6"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const payload = event.dataTransfer.getData("text/plain");
              if (payload.startsWith("add:")) handleSlotDrop(payload, "");
            }}
            ref={gridScrollRef}
          >
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
                      editable={editable}
                      formatId="ig-post"
                      key={slot.id}
                      onAddFrames={() => setPickerId(slot.id)}
                      onDrop={handleSlotDrop}
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
              showSafeZones
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
                      editable={editable}
                      formatId="ig-story"
                      onDrop={handleSlotDrop}
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
                  {view === "pinterest"
                    ? "pins"
                    : view === "tiktok"
                      ? "videos"
                      : "reels"}
                  .
                </p>
              ) : (
                <div
                  className={`grid gap-0.5 ${config.cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                >
                  {slots.map((slot) => (
                    <SlotTile
                      channel={view}
                      editable={editable}
                      formatId={config.formatId}
                      key={slot.id}
                      onDrop={handleSlotDrop}
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

        {/* Mobile action bar — the source rail + toolbar actions are desktop-only,
         * so Add + Export all live here, splitting the width evenly. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-[color:var(--card)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          {editable ? (
            <button
              className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[color:var(--accent)] px-3 text-xs-plus font-semibold text-[color:var(--accent-foreground)] active:scale-[0.99]"
              onClick={() => setAddOpen(true)}
              type="button"
            >
              + Add
            </button>
          ) : null}
          <button
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs-plus font-semibold text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            disabled={exporting || slots.length === 0}
            onClick={() => void exportChannel()}
            type="button"
          >
            <DownloadSimpleIcon size={15} weight="bold" />
            {exporting ? "Exporting…" : "Export all"}
          </button>
        </div>
      </div>

      {lightboxSlot ? (
        <Lightbox
          channel={view}
          editable={editable}
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
      {addOpen ? (
        <AddSourceSheet
          channelLabel={PLANNER_CHANNEL_LABELS[view]}
          onAdd={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </div>
  );
}
