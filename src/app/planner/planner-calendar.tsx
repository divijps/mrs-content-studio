import * as React from "react";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import { updatePlannerSlot } from "../data/project-store";
import {
  PLANNER_CHANNEL_LABELS,
  type PlannerBoard,
  type PlannerChannel,
  type PlannerGridSlot,
} from "../data/types";
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
  grid: { aspect: "4 / 5", formatId: "ig-post", label: "4:5" },
  pinterest: { aspect: "2 / 3", formatId: "pin", label: "2:3" },
  reel: { aspect: "9 / 16", formatId: "ig-story", label: "9:16" },
  story: { aspect: "9 / 16", formatId: "ig-story", label: "9:16" },
  tiktok: { aspect: "9 / 16", formatId: "tiktok", label: "9:16" },
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

/** Month-cell chip: tiny aspect thumb + time + channel dot. */
function EntryChip(props: {
  draggable: boolean;
  entry: CalendarEntry;
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const { entry } = props;
  const format = CHANNEL_FORMAT[entry.channel];
  return (
    <button
      className="flex w-full items-center gap-1.5 rounded-md bg-[color:var(--surface-inactive)] px-1 py-1 text-left transition-colors hover:bg-[color:var(--surface-active)]"
      draggable={props.draggable}
      onClick={() => props.onOpen(entry)}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/calendar-entry", `${entry.channel}:${entry.slot.id}`);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${PLANNER_CHANNEL_LABELS[entry.channel]} · ${format.label}${entry.slot.label ? ` · ${entry.slot.label}` : ""}`}
      type="button"
    >
      <FormatThumb entry={entry} height={26} />
      <span className="min-w-0 flex-1 truncate text-[10px] leading-tight text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
        {timeLabel(entry.slot.scheduledTime) || entry.slot.label || "Post"}
      </span>
      <ChannelDot channel={entry.channel} />
    </button>
  );
}

/** Month-cell GROUP chip: several posts of one channel on one day, shown as
 * overlapping thumbs + a count. Clicking zooms into that day. */
function GroupChip(props: {
  channel: PlannerChannel;
  entries: CalendarEntry[];
  onZoom: () => void;
}): React.JSX.Element {
  const shown = props.entries.slice(0, 3);
  return (
    <button
      className="flex w-full items-center gap-1.5 rounded-md bg-[color:var(--surface-inactive)] px-1 py-1 text-left transition-colors hover:bg-[color:var(--surface-active)]"
      onClick={props.onZoom}
      title={`${props.entries.length} ${PLANNER_CHANNEL_LABELS[props.channel]} posts — open the day`}
      type="button"
    >
      <span className="flex shrink-0 items-center">
        {shown.map((entry, index) => (
          <span
            className={index > 0 ? "-ml-2" : ""}
            key={entryKey(entry)}
            style={{ zIndex: shown.length - index }}
          >
            <FormatThumb entry={entry} height={26} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] leading-tight text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
        ×{props.entries.length}
      </span>
      <ChannelDot channel={props.channel} />
    </button>
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
  const format = CHANNEL_FORMAT[entry.channel];
  const time = timeLabel(entry.slot.scheduledTime);
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
        <FormatThumb entry={entry} height={56} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs-plus">
            {entry.slot.label || PLANNER_CHANNEL_LABELS[entry.channel]}
          </span>
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
  boards: PlannerBoard[];
  desktop: boolean;
  editable: boolean;
  entries: CalendarEntry[];
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const now = new Date();
  const [zoom, setZoom] = React.useState<"month" | "week" | "day">("month");
  const [selectedDay, setSelectedDay] = React.useState<string>(todayKey());
  const [cursor, setCursor] = React.useState({ month: now.getMonth(), year: now.getFullYear() });
  const [channelFilter, setChannelFilter] = React.useState<PlannerChannel | "all">("all");
  const [dragOverDay, setDragOverDay] = React.useState<string | null>(null);

  const visible = React.useMemo(
    () =>
      channelFilter === "all"
        ? props.entries
        : props.entries.filter((entry) => entry.channel === channelFilter),
    [props.entries, channelFilter],
  );
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
  const usedChannels = React.useMemo(() => {
    const set = new Set(props.entries.map((entry) => entry.channel));
    return (Object.keys(PLANNER_CHANNEL_LABELS) as PlannerChannel[]).filter((channel) =>
      set.has(channel),
    );
  }, [props.entries]);

  const zoomToDay = (key: string): void => {
    setSelectedDay(key);
    setZoom("day");
  };

  const acceptDrop = (key: string) => (event: React.DragEvent): void => {
    if (!props.editable) return;
    event.preventDefault();
    setDragOverDay(null);
    const payload = event.dataTransfer.getData("text/calendar-entry");
    const [channel, slotId] = payload.split(":");
    const entry = props.entries.find(
      (candidate) => candidate.channel === channel && candidate.slot.id === slotId,
    );
    if (entry) moveToDay(entry, key);
  };

  const filterChips = (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
      {(["all", ...usedChannels] as const).map((channel) => (
        <button
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs transition-colors ${
            channelFilter === channel
              ? "bg-[color:var(--surface-active)] text-[color:var(--foreground)]"
              : "text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)] hover:bg-[color:var(--surface-inactive)]"
          }`}
          key={channel}
          onClick={() => setChannelFilter(channel as PlannerChannel | "all")}
          type="button"
        >
          {channel !== "all" ? <ChannelDot channel={channel as PlannerChannel} /> : null}
          {channel === "all" ? "All" : PLANNER_CHANNEL_LABELS[channel as PlannerChannel]}
        </button>
      ))}
    </div>
  );

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

  /* ---- Mobile: month label + week strip + day panel (reference layout). --- */
  if (!props.desktop) {
    const week = weekOf(selectedDay);
    const selectedDate = parseDay(selectedDay);
    const dayEntries = byDay.get(selectedDay) ?? [];
    const monthTitle = selectedDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    const channelCounts = new Map<PlannerChannel, number>();
    for (const entry of dayEntries) {
      channelCounts.set(entry.channel, (channelCounts.get(entry.channel) ?? 0) + 1);
    }
    return (
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="px-4 pt-3">{filterChips}</div>
        {/* Month + week stepper. */}
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-sm font-semibold">{monthTitle}</span>
          <div className="flex items-center gap-1">
            <button
              aria-label="Previous week"
              className={NAV_BTN}
              onClick={() => setSelectedDay(shiftDay(selectedDay, -7))}
              type="button"
            >
              <CaretLeftIcon size={14} />
            </button>
            <button
              className="rounded-md px-2 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-active)]"
              onClick={() => setSelectedDay(today)}
              type="button"
            >
              Today
            </button>
            <button
              aria-label="Next week"
              className={NAV_BTN}
              onClick={() => setSelectedDay(shiftDay(selectedDay, 7))}
              type="button"
            >
              <CaretRightIcon size={14} />
            </button>
          </div>
        </div>
        {/* Week strip: tappable days, post dots underneath. */}
        <div className="grid grid-cols-7 px-2 pt-2">
          {week.map((key, index) => {
            const date = parseDay(key);
            const selected = key === selectedDay;
            const hasPosts = (byDay.get(key) ?? []).length > 0;
            return (
              <button
                className="flex flex-col items-center gap-1 py-1"
                key={key}
                onClick={() => setSelectedDay(key)}
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
        {/* Day panel: summary eyebrow + big title + day steppers. */}
        <div className="px-4 pt-4">
          <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
            {dayEntries.length === 0
              ? "Nothing planned"
              : [...channelCounts.entries()]
                  .map(([channel, count]) => `${count} ${PLANNER_CHANNEL_LABELS[channel]}`)
                  .join(" · ")}
          </span>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xl font-semibold">
              {`${selectedDate.toLocaleDateString(undefined, { weekday: "long" })} ${selectedDate.getDate()}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous day"
                className={NAV_BTN}
                onClick={() => setSelectedDay(shiftDay(selectedDay, -1))}
                type="button"
              >
                <CaretLeftIcon size={14} />
              </button>
              <button
                aria-label="Next day"
                className={NAV_BTN}
                onClick={() => setSelectedDay(shiftDay(selectedDay, 1))}
                type="button"
              >
                <CaretRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>
        {unscheduled.length > 0 ? (
          <div className="px-4 pt-3">
            <div className="mb-1.5 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
              Unscheduled
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {unscheduled.map((entry) => (
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
        <div className="flex flex-col gap-1.5 px-4 pt-3">
          {dayEntries.map((entry) => (
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
      <div className="flex shrink-0 items-center gap-3 px-4 py-2">
        {headerNav}
        <button
          className="rounded-md px-2 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
          onClick={() => {
            setSelectedDay(today);
            setCursor({ month: now.getMonth(), year: now.getFullYear() });
          }}
          type="button"
        >
          Today
        </button>
        {/* Zoom: month → week → day, plain-text tabs. */}
        <div className="flex items-center gap-0.5">
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
        <div className="ml-auto">{filterChips}</div>
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
              const rows: React.ReactNode[] = [];
              for (const [channel, list] of grouped) {
                if (list.length > 1) {
                  rows.push(
                    <GroupChip
                      channel={channel}
                      entries={list}
                      key={`group-${channel}`}
                      onZoom={() => zoomToDay(cell.key)}
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
                      onClick={() => zoomToDay(cell.key)}
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
                      <FormatThumb entry={entry} height={44} />
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
    </div>
  );
}
