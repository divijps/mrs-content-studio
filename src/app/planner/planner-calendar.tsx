import * as React from "react";
import { createPortal } from "react-dom";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import { updatePlannerSlot, useProject } from "../data/project-store";
import {
  PLANNER_CHANNEL_LABELS,
  type PlannerChannel,
  type PlannerGridSlot,
} from "../data/types";
import { slotCode } from "./slot-code";
import { SlotVisual } from "./slot-visual";

/** One post on the calendar: the slot plus the channel it publishes to. */
export interface CalendarEntry {
  channel: PlannerChannel;
  slot: PlannerGridSlot;
}

/** Muted per-channel identity dots — desaturated so the calendar stays in the
 * grey design language while channels remain tellable at a glance. */
export const CHANNEL_DOT: Record<PlannerChannel, string> = {
  grid: "#9ba88d",
  pinterest: "#b07c7c",
  reel: "#7c93b0",
  story: "#c2a878",
  tiktok: "#9b86b0",
};

/** The publishing format each channel previews at — thumbnails render in the
 * REAL aspect so the format is legible right on the chip. */
export const CHANNEL_FORMAT: Record<
  PlannerChannel,
  { aspect: string; formatId: string; label: string }
> = {
  grid: { aspect: "4 / 5", formatId: "ig-post", label: "Portrait" },
  pinterest: { aspect: "2 / 3", formatId: "pin", label: "Tall" },
  reel: { aspect: "9 / 16", formatId: "ig-story", label: "Vertical" },
  story: { aspect: "9 / 16", formatId: "ig-story", label: "Vertical" },
  tiktok: { aspect: "9 / 16", formatId: "tiktok", label: "Vertical" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function shiftDay(key: string, days: number): string {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/** The Monday-started week containing a day. */
function weekOf(key: string): string[] {
  const date = parseDay(key);
  const lead = (date.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDay(key, index - lead));
}

/** Compact "10:00" → locale "10:00 AM"; blank-safe. */
function timeLabel(time: string | null | undefined): string {
  if (!time || !/^\d{2}:\d{2}/.test(time)) return "";
  const date = new Date(`2000-01-01T${time}`);
  return Number.isNaN(date.getTime())
    ? time
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The 42 cells (6 weeks, Monday-start) covering a month. */
export function monthCells(
  year: number,
  month: number,
): { inMonth: boolean; key: string; day: number }[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const cells: { inMonth: boolean; key: string; day: number }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, 1 - lead + index);
    cells.push({
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      key: dayKey(date),
    });
  }
  return cells;
}

/** Move a post to a day, keeping its time (default 10:00 so pickers always
 * show a real value). The store update ripples to every other planner view. */
function moveToDay(entry: CalendarEntry, key: string): void {
  updatePlannerSlot(entry.channel, entry.slot.id, {
    scheduledDate: key,
    scheduledTime: entry.slot.scheduledTime || "10:00",
  });
}

const entryKey = (entry: CalendarEntry): string => `${entry.channel}-${entry.slot.id}`;

function sortByTime(list: CalendarEntry[]): CalendarEntry[] {
  return [...list].sort((first, second) =>
    (first.slot.scheduledTime ?? "").localeCompare(second.slot.scheduledTime ?? ""),
  );
}

/** Format-true mini preview: the thumb renders in its channel's real aspect. */
function FormatThumb(props: { entry: CalendarEntry; height: number }): React.JSX.Element {
  const format = CHANNEL_FORMAT[props.entry.channel];
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-[4px]"
      style={{ aspectRatio: format.aspect, height: props.height }}
    >
      <SlotVisual formatId={format.formatId} slot={props.entry.slot} />
    </span>
  );
}

function ChannelDot(props: { channel: PlannerChannel }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: CHANNEL_DOT[props.channel] }}
      title={PLANNER_CHANNEL_LABELS[props.channel]}
    />
  );
}

/** Small outlined ratio tag ("4:5") — the format, readable on the chip. */
function FormatTag(props: { channel: PlannerChannel }): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-[3px] border border-[color:color-mix(in_oklab,var(--foreground)_22%,transparent)] px-1 text-[9px] leading-[13px] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
      {CHANNEL_FORMAT[props.channel].label}
    </span>
  );
}

/** Month-cell chip: aspect thumb + code/time + format tag + channel dot. */
function EntryChip(props: {
  draggable: boolean;
  entry: CalendarEntry;
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const { entry } = props;
  const project = useProject();
  const format = CHANNEL_FORMAT[entry.channel];
  const code = slotCode(entry.slot, entry.channel, project.assets, project.collections);
  return (
    <button
      className="flex w-full items-center gap-1.5 rounded-md bg-[color:var(--surface-inactive)] px-1 py-1 text-left transition-colors hover:bg-[color:var(--surface-active)]"
      draggable={props.draggable}
      onClick={() => props.onOpen(entry)}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/calendar-entry", `${entry.channel}:${entry.slot.id}`);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${code} · ${PLANNER_CHANNEL_LABELS[entry.channel]} · ${format.label}${entry.slot.label ? ` · ${entry.slot.label}` : ""}`}
      type="button"
    >
      <FormatThumb entry={entry} height={34} />
      <span className="min-w-0 flex-1 truncate text-[10px] leading-tight text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
        {code}
        {entry.slot.scheduledTime ? ` · ${timeLabel(entry.slot.scheduledTime)}` : ""}
      </span>
      <FormatTag channel={entry.channel} />
      <ChannelDot channel={entry.channel} />
    </button>
  );
}

/** Month-cell GROUP chip: several posts of one channel on one day, shown as
 * overlapping thumbs + a count. Clicking peeks the group IN PLACE. */
function GroupChip(props: {
  channel: PlannerChannel;
  entries: CalendarEntry[];
  onPeek: (anchor: DOMRect) => void;
}): React.JSX.Element {
  const shown = props.entries.slice(0, 3);
  return (
    <button
      className="flex w-full items-center gap-1.5 rounded-md bg-[color:var(--surface-inactive)] px-1 py-1 text-left transition-colors hover:bg-[color:var(--surface-active)]"
      onClick={(event) => props.onPeek(event.currentTarget.getBoundingClientRect())}
      title={`${props.entries.length} ${PLANNER_CHANNEL_LABELS[props.channel]} posts — peek`}
      type="button"
    >
      <span className="flex shrink-0 items-center">
        {shown.map((entry, index) => (
          <span
            className={index > 0 ? "-ml-2" : ""}
            key={entryKey(entry)}
            style={{ zIndex: shown.length - index }}
          >
            <FormatThumb entry={entry} height={34} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] leading-tight text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
        ×{props.entries.length} {PLANNER_CHANNEL_LABELS[props.channel]}
      </span>
      <FormatTag channel={props.channel} />
      <ChannelDot channel={props.channel} />
    </button>
  );
}

/** In-place peek over a day's posts (group chips and "+n more") — a small
 * anchored popover, so browsing a stack never yanks you out of Month view.
 * Rows can be dragged straight out onto calendar days: the popover fades and
 * stops catching the pointer for the drag's duration (unmounting the drag
 * source mid-drag would abort it), then closes. */
function PeekPopover(props: {
  anchor: DOMRect;
  draggable: boolean;
  entries: CalendarEntry[];
  onClose: () => void;
  onOpen: (entry: CalendarEntry) => void;
  title: string;
}): React.JSX.Element {
  const [dragging, setDragging] = React.useState(false);
  const width = 300;
  const left = Math.min(props.anchor.left, window.innerWidth - width - 12);
  const below = props.anchor.bottom + 6;
  const top =
    below + 300 > window.innerHeight ? Math.max(12, props.anchor.top - 6 - 300) : below;
  const hidden = dragging ? "pointer-events-none opacity-0" : "";
  return createPortal(
    <>
      <div className={`fixed inset-0 z-[80] ${hidden}`} onMouseDown={props.onClose} />
      <div
        className={`fixed z-[81] flex max-h-[300px] w-[300px] flex-col gap-1 overflow-y-auto rounded-xl border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-[color:var(--popover)] p-2 shadow-2xl transition-opacity ${hidden}`}
        onDragEnd={() => {
          setDragging(false);
          props.onClose();
        }}
        onDragStartCapture={() => setDragging(true)}
        style={{ left, top }}
      >
        <span className="px-1 pb-0.5 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          {props.title}
        </span>
        {props.entries.map((entry) => (
          <EntryChip
            draggable={props.draggable}
            entry={entry}
            key={entryKey(entry)}
            onOpen={(target) => {
              props.onClose();
              props.onOpen(target);
            }}
          />
        ))}
      </div>
    </>,
    document.body,
  );
}

/** Day-view row — the richest card: time column, format-true thumb, label,
 * channel + format, status. Mobile adds the native reschedule chip. */
function DayRow(props: {
  editable: boolean;
  entry: CalendarEntry;
  onOpen: (entry: CalendarEntry) => void;
  withPicker: boolean;
}): React.JSX.Element {
  const { entry } = props;
  const project = useProject();
  const format = CHANNEL_FORMAT[entry.channel];
  const time = timeLabel(entry.slot.scheduledTime);
  const code = slotCode(entry.slot, entry.channel, project.assets, project.collections);
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[color:var(--surface-inactive)] p-2">
      <span className="w-16 shrink-0 text-2xs font-medium text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)]">
        {time || "—"}
      </span>
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => props.onOpen(entry)}
        type="button"
      >
        <FormatThumb entry={entry} height={72} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs-plus">{code}</span>
          <span className="flex items-center gap-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            <ChannelDot channel={entry.channel} />
            {PLANNER_CHANNEL_LABELS[entry.channel]} · {format.label}
            {entry.slot.status !== "draft" ? ` · ${entry.slot.status}` : ""}
          </span>
        </span>
      </button>
      {props.withPicker && props.editable ? (
        <span className="relative shrink-0 rounded-md bg-[color:var(--surface-active)] px-2 py-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)]">
          {entry.slot.scheduledDate
            ? `${parseDay(entry.slot.scheduledDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}${time ? ` · ${time}` : ""}`
            : "Schedule"}
          <NativeSchedulePicker entry={entry} />
        </span>
      ) : null}
    </div>
  );
}

/** Hidden native picker stretched over its parent — tapping the visible chip
 * opens the platform's own date+time wheel (the iOS-friendly path). */
function NativeSchedulePicker(props: { entry: CalendarEntry }): React.JSX.Element {
  const { slot } = props.entry;
  const value =
    slot.scheduledDate != null
      ? `${slot.scheduledDate}T${(slot.scheduledTime ?? "10:00").slice(0, 5)}`
      : "";
  return (
    <input
      aria-label="Reschedule"
      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      onChange={(event) => {
        const next = event.target.value; // YYYY-MM-DDTHH:MM
        if (!next) return;
        const [date, time] = next.split("T");
        if (date) {
          updatePlannerSlot(props.entry.channel, slot.id, {
            scheduledDate: date,
            scheduledTime: time?.slice(0, 5) || "10:00",
          });
        }
      }}
      type="datetime-local"
      value={value}
    />
  );
}

const NAV_BTN =
  "flex h-7 w-7 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]";

/**
 * Calendar over every planned post of one person — all channels, all their
 * planners — with three zoom levels: Month (compact chips, same-channel posts
 * grouped), Week (7 columns of medium cards), and Day (rich rows). Desktop
 * offers the zoom switcher and drag-to-reschedule; mobile follows the
 * week-strip + day pattern (month label, tappable day strip with post dots,
 * big day title, then the day's posts with native reschedule pickers). All
 * edits go through updatePlannerSlot, so every other view stays in sync.
 */
export function PlannerCalendar(props: {
  desktop: boolean;
  editable: boolean;
  entries: CalendarEntry[];
  /** A Library-rail payload ("add:asset:<id>" / "add:comp:<id>") dropped on a
   * day — the screen creates the post scheduled there. */
  onAddDrop?: (payload: string, day: string) => void;
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const now = new Date();
  const [zoom, setZoom] = React.useState<"month" | "week" | "day">("month");
  const [selectedDay, setSelectedDay] = React.useState<string>(todayKey());
  const [cursor, setCursor] = React.useState({ month: now.getMonth(), year: now.getFullYear() });
  const [dragOverDay, setDragOverDay] = React.useState<string | null>(null);
  const [peek, setPeek] = React.useState<{
    anchor: DOMRect;
    entries: CalendarEntry[];
    title: string;
  } | null>(null);

  // Scope (owner / channel / planner) is owned by the toolbar above — the
  // calendar just renders what it's given.
  const visible = props.entries;
  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of visible) {
      const key = entry.slot.scheduledDate;
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    for (const [key, list] of map) {
      map.set(key, sortByTime(list));
    }
    return map;
  }, [visible]);
  const unscheduled = React.useMemo(
    () => visible.filter((entry) => !entry.slot.scheduledDate),
    [visible],
  );

  const today = todayKey();

  const zoomToDay = (key: string): void => {
    setSelectedDay(key);
    setZoom("day");
  };

  const acceptDrop = (key: string) => (event: React.DragEvent): void => {
    if (!props.editable) return;
    event.preventDefault();
    setDragOverDay(null);
    const payload = event.dataTransfer.getData("text/calendar-entry");
    if (payload) {
      const [channel, slotId] = payload.split(":");
      const entry = props.entries.find(
        (candidate) => candidate.channel === channel && candidate.slot.id === slotId,
      );
      if (entry) moveToDay(entry, key);
      return;
    }
    // A Library-rail item ("add:asset:<id>") dropped straight onto a day.
    const railPayload = event.dataTransfer.getData("text/plain");
    if (railPayload.startsWith("add:")) {
      props.onAddDrop?.(railPayload, key);
    }
  };

  const unscheduledStrip =
    unscheduled.length > 0 ? (
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] px-4 pb-2">
        <span className="shrink-0 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          Unscheduled
        </span>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {unscheduled.map((entry) => (
            <div className="w-40 shrink-0" key={entryKey(entry)}>
              <EntryChip draggable={props.editable} entry={entry} onOpen={props.onOpen} />
            </div>
          ))}
        </div>
      </div>
    ) : null;

  /* ---- Mobile: month label + week strip + a CONTINUOUS agenda (scroll flows
   * day into day; the strip follows), with an optional compact Month layout
   * ("more like the desktop calendar") that jumps back into the agenda. --- */
  if (!props.desktop) {
    return (
      <MobileCalendar
        byDay={byDay}
        editable={props.editable}
        onOpen={props.onOpen}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        today={today}
        unscheduled={unscheduled}
      />
    );
  }

  /* ---- Desktop. ---------------------------------------------------------- */
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const stepMonth = (delta: number): void => {
    setCursor(({ month, year }) => {
      const date = new Date(year, month + delta, 1);
      return { month: date.getMonth(), year: date.getFullYear() };
    });
  };
  const headerNav =
    zoom === "month" ? (
      <>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" className={NAV_BTN} onClick={() => stepMonth(-1)} type="button">
            <CaretLeftIcon size={14} />
          </button>
          <button aria-label="Next month" className={NAV_BTN} onClick={() => stepMonth(1)} type="button">
            <CaretRightIcon size={14} />
          </button>
        </div>
        <span className="text-sm font-medium">{monthLabel}</span>
      </>
    ) : (
      <>
        <div className="flex items-center gap-1">
          <button
            aria-label={zoom === "week" ? "Previous week" : "Previous day"}
            className={NAV_BTN}
            onClick={() => setSelectedDay(shiftDay(selectedDay, zoom === "week" ? -7 : -1))}
            type="button"
          >
            <CaretLeftIcon size={14} />
          </button>
          <button
            aria-label={zoom === "week" ? "Next week" : "Next day"}
            className={NAV_BTN}
            onClick={() => setSelectedDay(shiftDay(selectedDay, zoom === "week" ? 7 : 1))}
            type="button"
          >
            <CaretRightIcon size={14} />
          </button>
        </div>
        <span className="text-sm font-medium">
          {zoom === "week"
            ? `${parseDay(weekOf(selectedDay)[0]!).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseDay(weekOf(selectedDay)[6]!).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
            : parseDay(selectedDay).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                weekday: "long",
              })}
        </span>
      </>
    );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2">
        {headerNav}
        {/* Today + the zoom tabs share one plain-text voice (uniform size). */}
        <div className="ml-1 flex items-center gap-0.5">
          <button
            className="rounded-md px-2 py-1 text-xs-plus text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] transition-colors hover:text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)]"
            onClick={() => {
              setSelectedDay(today);
              setCursor({ month: now.getMonth(), year: now.getFullYear() });
            }}
            type="button"
          >
            Today
          </button>
          <span
            aria-hidden
            className="mx-1 h-3.5 w-px bg-[color:color-mix(in_oklab,var(--border)_45%,transparent)]"
          />
          {(["month", "week", "day"] as const).map((level) => (
            <button
              className={`rounded-md px-2 py-1 text-xs-plus capitalize transition-colors ${
                zoom === level
                  ? "text-[color:var(--foreground)]"
                  : "text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)]"
              }`}
              key={level}
              onClick={() => setZoom(level)}
              type="button"
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {unscheduledStrip}

      {zoom === "month" ? (
        <>
          <div className="grid shrink-0 grid-cols-7 px-3 pt-2">
            {WEEKDAYS.map((weekday) => (
              <div
                className="px-1.5 pb-1 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]"
                key={weekday}
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px overflow-y-auto bg-[color:color-mix(in_oklab,var(--border)_25%,transparent)] px-3 pb-3">
            {monthCells(cursor.year, cursor.month).map((cell) => {
              const entries = byDay.get(cell.key) ?? [];
              // Group same-channel posts so a busy day stays readable; lone
              // posts keep their full chip. Clicking a group zooms to the day.
              const grouped = new Map<PlannerChannel, CalendarEntry[]>();
              for (const entry of entries) {
                const list = grouped.get(entry.channel) ?? [];
                list.push(entry);
                grouped.set(entry.channel, list);
              }
              const dayTitle = parseDay(cell.key).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                weekday: "short",
              });
              const rows: React.ReactNode[] = [];
              for (const [channel, list] of grouped) {
                if (list.length > 1) {
                  rows.push(
                    <GroupChip
                      channel={channel}
                      entries={list}
                      key={`group-${channel}`}
                      onPeek={(anchor) =>
                        setPeek({ anchor, entries: list, title: dayTitle })
                      }
                    />,
                  );
                } else {
                  rows.push(
                    <EntryChip
                      draggable={props.editable}
                      entry={list[0]!}
                      key={entryKey(list[0]!)}
                      onOpen={props.onOpen}
                    />,
                  );
                }
              }
              const shown = rows.slice(0, 3);
              const extra = rows.length - shown.length;
              return (
                <div
                  className={`flex min-h-0 flex-col gap-1 overflow-hidden p-1.5 transition-colors ${
                    cell.inMonth
                      ? "bg-[color:var(--card)]"
                      : "bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)]"
                  } ${dragOverDay === cell.key ? "ring-1 ring-inset ring-[color:var(--accent)]" : ""}`}
                  key={cell.key}
                  onDragLeave={() =>
                    setDragOverDay((current) => (current === cell.key ? null : current))
                  }
                  onDragOver={(event) => {
                    if (!props.editable) return;
                    event.preventDefault();
                    setDragOverDay(cell.key);
                  }}
                  onDrop={acceptDrop(cell.key)}
                >
                  <button
                    className={`self-start text-2xs leading-none transition-colors hover:text-[color:var(--foreground)] ${
                      cell.key === today
                        ? "font-semibold text-[color:var(--foreground)]"
                        : cell.inMonth
                          ? "text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]"
                          : "text-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
                    }`}
                    onClick={() => zoomToDay(cell.key)}
                    title="Open this day"
                    type="button"
                  >
                    {cell.key === today ? `${cell.day} · today` : cell.day}
                  </button>
                  {shown}
                  {extra > 0 ? (
                    <button
                      className="self-start text-[10px] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] transition-colors hover:text-[color:var(--foreground)]"
                      onClick={(event) =>
                        setPeek({
                          anchor: event.currentTarget.getBoundingClientRect(),
                          entries,
                          title: dayTitle,
                        })
                      }
                      type="button"
                    >
                      +{extra} more
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : zoom === "week" ? (
        <div className="grid min-h-0 flex-1 grid-cols-7 gap-px overflow-y-auto bg-[color:color-mix(in_oklab,var(--border)_25%,transparent)] px-3 pb-3 pt-2">
          {weekOf(selectedDay).map((key, index) => {
            const entries = byDay.get(key) ?? [];
            const date = parseDay(key);
            return (
              <div
                className={`flex min-h-0 flex-col gap-1.5 bg-[color:var(--card)] p-2 ${
                  dragOverDay === key ? "ring-1 ring-inset ring-[color:var(--accent)]" : ""
                }`}
                key={key}
                onDragLeave={() => setDragOverDay((current) => (current === key ? null : current))}
                onDragOver={(event) => {
                  if (!props.editable) return;
                  event.preventDefault();
                  setDragOverDay(key);
                }}
                onDrop={acceptDrop(key)}
              >
                <button
                  className={`self-start text-2xs uppercase tracking-[0.12em] transition-colors hover:text-[color:var(--foreground)] ${
                    key === today
                      ? "font-semibold text-[color:var(--foreground)]"
                      : "text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]"
                  }`}
                  onClick={() => zoomToDay(key)}
                  type="button"
                >
                  {WEEKDAYS[index]} {date.getDate()}
                </button>
                {entries.map((entry) => {
                  const format = CHANNEL_FORMAT[entry.channel];
                  return (
                    <button
                      className="flex w-full items-center gap-2 rounded-md bg-[color:var(--surface-inactive)] p-1.5 text-left transition-colors hover:bg-[color:var(--surface-active)]"
                      draggable={props.editable}
                      key={entryKey(entry)}
                      onClick={() => props.onOpen(entry)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "text/calendar-entry",
                          `${entry.channel}:${entry.slot.id}`,
                        );
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      type="button"
                    >
                      <FormatThumb entry={entry} height={56} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-2xs font-medium">
                          {timeLabel(entry.slot.scheduledTime) || "—"}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                          <ChannelDot channel={entry.channel} />
                          {format.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {(byDay.get(selectedDay) ?? []).length === 0 ? (
            <p className="py-10 text-center text-2xs text-muted-foreground">
              Nothing planned this day — drag posts here from Month or Week view.
            </p>
          ) : (
            <div className="mx-auto flex max-w-[680px] flex-col gap-1.5">
              {(byDay.get(selectedDay) ?? []).map((entry) => (
                <DayRow
                  editable={props.editable}
                  entry={entry}
                  key={entryKey(entry)}
                  onOpen={props.onOpen}
                  withPicker={props.editable}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {peek ? (
        <PeekPopover
          anchor={peek.anchor}
          draggable={props.editable}
          entries={peek.entries}
          onClose={() => setPeek(null)}
          onOpen={props.onOpen}
          title={peek.title}
        />
      ) : null}
    </div>
  );
}

/**
 * Mobile calendar: month title + week strip pinned over a CONTINUOUS agenda —
 * the PAGE scrolls and days flow one after another while the sticky strip
 * follows (scroll-spy); tapping a strip day scrolls to it. A compact "Month"
 * layout mirrors the desktop grid; tapping any day drops back into the agenda.
 */
function MobileCalendar(props: {
  byDay: Map<string, CalendarEntry[]>;
  editable: boolean;
  onOpen: (entry: CalendarEntry) => void;
  selectedDay: string;
  setSelectedDay: (key: string) => void;
  today: string;
  unscheduled: CalendarEntry[];
}): React.JSX.Element {
  const { byDay, selectedDay, setSelectedDay, today } = props;
  const [layout, setLayout] = React.useState<"agenda" | "month">("agenda");
  const listRef = React.useRef<HTMLDivElement>(null);
  const stickyRef = React.useRef<HTMLDivElement>(null);
  const spySuppressed = React.useRef(false);
  const selectedRef = React.useRef(selectedDay);
  selectedRef.current = selectedDay;

  const dayKeys = React.useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const week = weekOf(selectedDay);
  const selectedDate = parseDay(selectedDay);
  const monthTitle = selectedDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  /** Where content starts, just under the sticky header block. */
  const stickyBottom = (): number =>
    (stickyRef.current?.getBoundingClientRect().bottom ?? 0) + 6;

  /** Scroll the page to a day (or the nearest later one with content). */
  const scrollToDay = (key: string): void => {
    const target =
      dayKeys.find((candidate) => candidate >= key) ?? dayKeys[dayKeys.length - 1];
    if (!target) return;
    const section = listRef.current?.querySelector<HTMLElement>(`[data-day="${target}"]`);
    if (!section) return;
    spySuppressed.current = true;
    window.scrollTo({
      behavior: "smooth",
      top: section.getBoundingClientRect().top + window.scrollY - stickyBottom(),
    });
    window.setTimeout(() => {
      spySuppressed.current = false;
    }, 800);
  };

  const goToDay = (key: string): void => {
    setSelectedDay(key);
    if (layout === "month") setLayout("agenda");
    // Let the agenda mount before scrolling (layout switch case).
    window.setTimeout(() => scrollToDay(key), 30);
  };

  // Scroll-spy on the PAGE: the topmost day section under the sticky strip
  // drives the selected day (mobile lets the document scroll, so the agenda
  // container itself never scrolls).
  React.useEffect(() => {
    if (layout !== "agenda") return;
    const onScroll = (): void => {
      if (spySuppressed.current) return;
      const sections = listRef.current?.querySelectorAll<HTMLElement>("[data-day]");
      if (!sections) return;
      const threshold = stickyBottom() + 60;
      let current: string | null = null;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= threshold) {
          current = section.dataset.day ?? null;
        } else {
          break;
        }
      }
      if (current && current !== selectedRef.current) setSelectedDay(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, dayKeys.join(",")]);

  const summaryOf = (entries: CalendarEntry[]): string => {
    const counts = new Map<PlannerChannel, number>();
    for (const entry of entries) {
      counts.set(entry.channel, (counts.get(entry.channel) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([channel, count]) => `${count} ${PLANNER_CHANNEL_LABELS[channel]}`)
      .join(" · ");
  };

  return (
    <div className="flex flex-col">
      {/* Sticky header block: month title · layout tabs · stepper, and (in
       * agenda) the week strip — pinned while the page scrolls beneath. */}
      <div
        className="sticky top-0 z-10 bg-[color:var(--background)] pb-1"
        ref={stickyRef}
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="text-sm font-semibold">{monthTitle}</span>
          <div className="ml-1 flex items-center gap-0.5">
            {(["agenda", "month"] as const).map((option) => (
              <button
                className={`rounded-md px-1.5 py-0.5 text-2xs capitalize transition-colors ${
                  layout === option
                    ? "text-[color:var(--foreground)]"
                    : "text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]"
                }`}
                key={option}
                onClick={() => setLayout(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              aria-label={layout === "month" ? "Previous month" : "Previous week"}
              className={NAV_BTN}
              onClick={() =>
                layout === "month"
                  ? setSelectedDay(
                      dayKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1)),
                    )
                  : goToDay(shiftDay(selectedDay, -7))
              }
              type="button"
            >
              <CaretLeftIcon size={14} />
            </button>
            <button
              className="rounded-md px-1.5 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-active)]"
              onClick={() => goToDay(today)}
              type="button"
            >
              Today
            </button>
            <button
              aria-label={layout === "month" ? "Next month" : "Next week"}
              className={NAV_BTN}
              onClick={() =>
                layout === "month"
                  ? setSelectedDay(
                      dayKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1)),
                    )
                  : goToDay(shiftDay(selectedDay, 7))
              }
              type="button"
            >
              <CaretRightIcon size={14} />
            </button>
          </div>
        </div>
        {layout === "agenda" ? (
          <div className="grid grid-cols-7 px-2 pt-1">
            {week.map((key, index) => {
              const date = parseDay(key);
              const selected = key === selectedDay;
              const hasPosts = (byDay.get(key) ?? []).length > 0;
              return (
                <button
                  className="flex flex-col items-center gap-1 py-1"
                  key={key}
                  onClick={() => goToDay(key)}
                  type="button"
                >
                  <span className="text-[10px] uppercase text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]">
                    {WEEKDAY_LETTERS[index]}
                  </span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                      selected
                        ? "bg-[color:var(--accent)] font-semibold text-[color:var(--accent-foreground)]"
                        : key === today
                          ? "font-semibold text-[color:var(--foreground)]"
                          : "text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <span
                    aria-hidden
                    className={`h-1 w-1 rounded-full ${hasPosts ? "" : "opacity-0"}`}
                    style={{
                      backgroundColor: selected ? "var(--foreground)" : "var(--accent)",
                    }}
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {layout === "month" ? (
        /* Compact month grid — the desktop calendar's shape at phone width.
         * Tapping a day drops into the agenda scrolled to that date. */
        <div className="px-3 pb-6 pt-2">
          <div className="grid grid-cols-7">
            {WEEKDAY_LETTERS.map((letter, index) => (
              <span
                className="pb-1 text-center text-[10px] uppercase text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]"
                key={`${letter}-${index}`}
              >
                {letter}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-[color:color-mix(in_oklab,var(--border)_25%,transparent)]">
            {monthCells(selectedDate.getFullYear(), selectedDate.getMonth()).map((cell) => {
              const entries = byDay.get(cell.key) ?? [];
              const shown = entries.slice(0, 2);
              return (
                <button
                  className={`flex min-h-[64px] flex-col items-start gap-1 p-1 text-left transition-colors ${
                    cell.inMonth
                      ? "bg-[color:var(--card)]"
                      : "bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)]"
                  }`}
                  key={cell.key}
                  onClick={() => goToDay(cell.key)}
                  type="button"
                >
                  <span
                    className={`text-[10px] leading-none ${
                      cell.key === today
                        ? "font-semibold text-[color:var(--foreground)]"
                        : cell.inMonth
                          ? "text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]"
                          : "text-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {shown.length > 0 ? (
                    <span className="flex items-center gap-0.5">
                      {shown.map((entry) => (
                        <FormatThumb entry={entry} height={26} key={entryKey(entry)} />
                      ))}
                      {entries.length > shown.length ? (
                        <span className="text-[9px] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                          +{entries.length - shown.length}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Continuous agenda: every day with content, one flowing page scroll. */
        <div className="px-4 pb-8" ref={listRef}>
          {props.unscheduled.length > 0 ? (
            <div className="pt-3">
              <div className="mb-1.5 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                Unscheduled
              </div>
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {props.unscheduled.map((entry) => (
                  <button
                    className="shrink-0"
                    key={entryKey(entry)}
                    onClick={() => props.onOpen(entry)}
                    type="button"
                  >
                    <FormatThumb entry={entry} height={64} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {dayKeys.length === 0 && props.unscheduled.length === 0 ? (
            <p className="py-10 text-center text-2xs text-muted-foreground">
              Nothing planned yet.
            </p>
          ) : null}
          {dayKeys.map((key) => {
            const date = parseDay(key);
            const entries = byDay.get(key) ?? [];
            return (
              <div className="pt-4" data-day={key} key={key}>
                <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                  {key === today ? "Today · " : ""}
                  {summaryOf(entries)}
                </span>
                <div className="pb-1.5 pt-0.5 text-lg font-semibold">
                  {`${date.toLocaleDateString(undefined, { weekday: "long" })} ${date.getDate()}`}
                </div>
                <div className="flex flex-col gap-1.5">
                  {entries.map((entry) => (
                    <DayRow
                      editable={props.editable}
                      entry={entry}
                      key={entryKey(entry)}
                      onOpen={props.onOpen}
                      withPicker
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
