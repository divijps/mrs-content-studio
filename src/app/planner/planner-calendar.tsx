import * as React from "react";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import { updatePlannerSlot } from "../data/project-store";
import {
  PLANNER_CHANNEL_LABELS,
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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayKey(): string {
  return dayKey(new Date());
}

/** Compact "10:00" → "10:00" passthrough with a graceful blank. */
function timeLabel(time: string | null | undefined): string {
  return time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "";
}

/** The 42 cells (6 weeks, Monday-start) covering a month. */
function monthCells(year: number, month: number): { inMonth: boolean; key: string; day: number }[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-start offset
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

/** Move a post to a day, keeping its time (default 10:00 so iOS pickers always
 * show a real value). The store update ripples to every other planner view. */
function moveToDay(entry: CalendarEntry, key: string): void {
  updatePlannerSlot(entry.channel, entry.slot.id, {
    scheduledDate: key,
    scheduledTime: entry.slot.scheduledTime || "10:00",
  });
}

/** A small draggable post chip: thumb + time + channel dot. */
function EntryChip(props: {
  draggable: boolean;
  entry: CalendarEntry;
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const { entry } = props;
  return (
    <button
      className="flex w-full items-center gap-1.5 rounded-md bg-[color:var(--surface-inactive)] px-1 py-1 text-left transition-colors hover:bg-[color:var(--surface-active)]"
      draggable={props.draggable}
      onClick={() => props.onOpen(entry)}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/calendar-entry", `${entry.channel}:${entry.slot.id}`);
        event.dataTransfer.effectAllowed = "move";
      }}
      type="button"
    >
      <span className="relative block h-7 w-[22px] shrink-0 overflow-hidden rounded-[3px]">
        <SlotVisual formatId="ig-post" slot={entry.slot} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] leading-tight text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
        {timeLabel(entry.slot.scheduledTime) || entry.slot.label || "Post"}
      </span>
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: CHANNEL_DOT[entry.channel] }}
        title={PLANNER_CHANNEL_LABELS[entry.channel]}
      />
    </button>
  );
}

/** Hidden native picker stretched over its parent — tapping the visible chip
 * opens the platform's own date+time wheel (the iOS-friendly path). */
function NativeSchedulePicker(props: { entry: CalendarEntry }): React.JSX.Element {
  const { slot } = props.entry;
  const value =
    slot.scheduledDate != null
      ? `${slot.scheduledDate}T${timeLabel(slot.scheduledTime) || "10:00"}`
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

/**
 * Calendar over every planned post of one person — all channels, all their
 * planners. Desktop: a Cron-style month grid with drag-to-reschedule and an
 * Unscheduled tray. Mobile: a single-scroll agenda grouped by day, each row
 * rescheduling through the native iOS/Android date-time picker. All edits go
 * through updatePlannerSlot, so the feed grids stay in sync automatically.
 */
export function PlannerCalendar(props: {
  desktop: boolean;
  editable: boolean;
  entries: CalendarEntry[];
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const now = new Date();
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
    for (const list of map.values()) {
      list.sort((first, second) =>
        (first.slot.scheduledTime ?? "").localeCompare(second.slot.scheduledTime ?? ""),
      );
    }
    return map;
  }, [visible]);
  const unscheduled = React.useMemo(
    () => visible.filter((entry) => !entry.slot.scheduledDate),
    [visible],
  );

  const today = todayKey();
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const step = (delta: number): void => {
    setCursor(({ month, year }) => {
      const date = new Date(year, month + delta, 1);
      return { month: date.getMonth(), year: date.getFullYear() };
    });
  };

  const usedChannels = React.useMemo(() => {
    const set = new Set(props.entries.map((entry) => entry.channel));
    return (Object.keys(PLANNER_CHANNEL_LABELS) as PlannerChannel[]).filter((channel) =>
      set.has(channel),
    );
  }, [props.entries]);

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
          {channel !== "all" ? (
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CHANNEL_DOT[channel as PlannerChannel] }}
            />
          ) : null}
          {channel === "all" ? "All" : PLANNER_CHANNEL_LABELS[channel as PlannerChannel]}
        </button>
      ))}
    </div>
  );

  /* ---- Mobile: agenda list. --------------------------------------------- */
  if (!props.desktop) {
    const dayKeys = [...byDay.keys()].sort();
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <div className="mb-3">{filterChips}</div>
        {unscheduled.length > 0 ? (
          <div className="mb-4">
            <div className="mb-1.5 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
              Unscheduled
            </div>
            <div className="flex flex-col gap-1">
              {unscheduled.map((entry) => (
                <AgendaRow
                  editable={props.editable}
                  entry={entry}
                  key={`${entry.channel}-${entry.slot.id}`}
                  onOpen={props.onOpen}
                />
              ))}
            </div>
          </div>
        ) : null}
        {dayKeys.length === 0 && unscheduled.length === 0 ? (
          <p className="py-10 text-center text-2xs text-muted-foreground">
            Nothing planned yet.
          </p>
        ) : null}
        {dayKeys.map((key) => {
          const date = new Date(`${key}T00:00:00`);
          const label = date.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            weekday: "short",
          });
          return (
            <div className="mb-4" key={key}>
              <div
                className={`mb-1.5 text-2xs uppercase tracking-[0.14em] ${
                  key === today
                    ? "text-[color:var(--foreground)]"
                    : "text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]"
                }`}
              >
                {key === today ? `Today · ${label}` : label}
              </div>
              <div className="flex flex-col gap-1">
                {(byDay.get(key) ?? []).map((entry) => (
                  <AgendaRow
                    editable={props.editable}
                    entry={entry}
                    key={`${entry.channel}-${entry.slot.id}`}
                    onOpen={props.onOpen}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---- Desktop: month grid. --------------------------------------------- */
  const cells = monthCells(cursor.year, cursor.month);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
            onClick={() => step(-1)}
            type="button"
          >
            <CaretLeftIcon size={14} />
          </button>
          <button
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
            onClick={() => step(1)}
            type="button"
          >
            <CaretRightIcon size={14} />
          </button>
        </div>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          className="rounded-md px-2 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
          onClick={() => setCursor({ month: now.getMonth(), year: now.getFullYear() })}
          type="button"
        >
          Today
        </button>
        <div className="ml-auto">{filterChips}</div>
      </div>

      {unscheduled.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] px-4 pb-2">
          <span className="shrink-0 text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
            Unscheduled
          </span>
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {unscheduled.map((entry) => (
              <div className="w-40 shrink-0" key={`${entry.channel}-${entry.slot.id}`}>
                <EntryChip draggable={props.editable} entry={entry} onOpen={props.onOpen} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
        {cells.map((cell) => {
          const entries = byDay.get(cell.key) ?? [];
          const shown = entries.slice(0, 3);
          const extra = entries.length - shown.length;
          return (
            <div
              className={`flex min-h-0 flex-col gap-1 overflow-hidden p-1.5 transition-colors ${
                cell.inMonth
                  ? "bg-[color:var(--card)]"
                  : "bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)]"
              } ${dragOverDay === cell.key ? "ring-1 ring-inset ring-[color:var(--accent)]" : ""}`}
              key={cell.key}
              onDragLeave={() => setDragOverDay((current) => (current === cell.key ? null : current))}
              onDragOver={(event) => {
                if (!props.editable) return;
                event.preventDefault();
                setDragOverDay(cell.key);
              }}
              onDrop={acceptDrop(cell.key)}
            >
              <span
                className={`text-2xs leading-none ${
                  cell.key === today
                    ? "font-semibold text-[color:var(--foreground)]"
                    : cell.inMonth
                      ? "text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]"
                      : "text-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
                }`}
              >
                {cell.key === today ? `${cell.day} · today` : cell.day}
              </span>
              {shown.map((entry) => (
                <EntryChip
                  draggable={props.editable}
                  entry={entry}
                  key={`${entry.channel}-${entry.slot.id}`}
                  onOpen={props.onOpen}
                />
              ))}
              {extra > 0 ? (
                <span className="text-[10px] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                  +{extra} more
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Mobile agenda row: open the post, or tap the schedule chip for the native
 * date-time picker. */
function AgendaRow(props: {
  editable: boolean;
  entry: CalendarEntry;
  onOpen: (entry: CalendarEntry) => void;
}): React.JSX.Element {
  const { entry } = props;
  const time = timeLabel(entry.slot.scheduledTime);
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-[color:var(--surface-inactive)] p-1.5">
      <button
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        onClick={() => props.onOpen(entry)}
        type="button"
      >
        <span className="relative block h-12 w-9 shrink-0 overflow-hidden rounded-md">
          <SlotVisual formatId="ig-post" slot={entry.slot} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs-plus">
            {entry.slot.label || PLANNER_CHANNEL_LABELS[entry.channel]}
          </span>
          <span className="flex items-center gap-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CHANNEL_DOT[entry.channel] }}
            />
            {PLANNER_CHANNEL_LABELS[entry.channel]}
          </span>
        </span>
      </button>
      <span className="relative shrink-0 rounded-md bg-[color:var(--surface-active)] px-2 py-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)]">
        {entry.slot.scheduledDate
          ? `${new Date(`${entry.slot.scheduledDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}${time ? ` · ${time}` : ""}`
          : "Schedule"}
        {props.editable ? <NativeSchedulePicker entry={entry} /> : null}
      </span>
    </div>
  );
}
