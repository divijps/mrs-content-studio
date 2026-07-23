import * as React from "react";
import { createPortal } from "react-dom";

import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import { dayKey, monthCells, todayKey } from "./planner-calendar";

/**
 * Design-language replacements for the native date/time inputs (desktop): the
 * browser's picker popups are unstylable chrome that clashed with the app's
 * grey surfaces. Mobile keeps native pickers elsewhere (calendar agenda) —
 * these fields render in the desktop-only schedule section.
 */

const TRIGGER =
  "flex h-auto w-full items-center justify-between gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 py-2.5 text-sm outline-none transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)] disabled:opacity-50";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function formatDate(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Date field: grey trigger + a hand-rolled month-grid popover (portalled so
 * the lightbox sidebar's scroll can't clip it). */
export function DateField(props: {
  disabled?: boolean;
  onChange: (value: string | null) => void;
  value: string | null;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<{ left: number; top: number; width: number } | null>(
    null,
  );
  const anchor = React.useRef<HTMLButtonElement>(null);
  const seed = props.value ? new Date(`${props.value}T00:00:00`) : new Date();
  const [cursor, setCursor] = React.useState({
    month: seed.getMonth(),
    year: seed.getFullYear(),
  });

  const show = (): void => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const width = 252;
    setRect({
      left: Math.min(box.left, window.innerWidth - width - 12),
      top: box.bottom + 6,
      width,
    });
    const base = props.value ? new Date(`${props.value}T00:00:00`) : new Date();
    setCursor({ month: base.getMonth(), year: base.getFullYear() });
    setOpen(true);
  };

  const step = (delta: number): void => {
    setCursor(({ month, year }) => {
      const date = new Date(year, month + delta, 1);
      return { month: date.getMonth(), year: date.getFullYear() };
    });
  };

  const today = todayKey();
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <button
        aria-label="Publish date"
        className={TRIGGER}
        disabled={props.disabled}
        onClick={() => (open ? setOpen(false) : show())}
        ref={anchor}
        type="button"
      >
        <span className={props.value ? "" : "text-[color:var(--text-muted)]"}>
          {props.value ? formatDate(props.value) : "Set date"}
        </span>
        <CalendarBlankIcon
          className="shrink-0 text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]"
          size={15}
        />
      </button>
      {open && rect
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[80]"
                onMouseDown={() => setOpen(false)}
              />
              <div
                className="fixed z-[81] flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-[color:var(--popover)] p-3 shadow-2xl"
                style={{ left: rect.left, top: rect.top, width: rect.width }}
              >
                <div className="flex items-center justify-between">
                  <button
                    aria-label="Previous month"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
                    onClick={() => step(-1)}
                    type="button"
                  >
                    <CaretLeftIcon size={12} />
                  </button>
                  <span className="text-xs-plus font-medium">{monthLabel}</span>
                  <button
                    aria-label="Next month"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
                    onClick={() => step(1)}
                    type="button"
                  >
                    <CaretRightIcon size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {WEEKDAY_LETTERS.map((letter, index) => (
                    <span
                      className="py-0.5 text-center text-[10px] uppercase text-[color:color-mix(in_oklab,var(--foreground)_38%,transparent)]"
                      key={`${letter}-${index}`}
                    >
                      {letter}
                    </span>
                  ))}
                  {monthCells(cursor.year, cursor.month).map((cell) => (
                    <button
                      className={`flex h-7 items-center justify-center rounded-md text-2xs transition-colors ${
                        cell.key === props.value
                          ? "bg-[color:var(--surface-active)] font-semibold text-[color:var(--foreground)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--accent)_45%,transparent)]"
                          : cell.key === today
                            ? "font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-active)]"
                            : cell.inMonth
                              ? "text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)] hover:bg-[color:var(--surface-active)]"
                              : "text-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)] hover:bg-[color:var(--surface-inactive)]"
                      }`}
                      key={cell.key}
                      onClick={() => {
                        props.onChange(cell.key);
                        setOpen(false);
                      }}
                      type="button"
                    >
                      {cell.day}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    className="rounded-md px-1.5 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
                    onClick={() => {
                      props.onChange(null);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                  <button
                    className="rounded-md px-1.5 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
                    onClick={() => {
                      props.onChange(todayKey());
                      setOpen(false);
                    }}
                    type="button"
                  >
                    Today
                  </button>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** Half-hour steps 00:00–23:30, plus the stored value when it's off-grid. */
function timeOptions(current: string | null): string[] {
  const options: string[] = [];
  for (let index = 0; index < 48; index += 1) {
    options.push(
      `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
    );
  }
  if (current && !options.includes(current)) {
    options.push(current);
    options.sort();
  }
  return options;
}

function formatTime(value: string): string {
  const date = new Date(`2000-01-01T${value}`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Time field: the app's own Select over half-hour steps — no native popup. */
export function TimeField(props: {
  disabled?: boolean;
  onChange: (value: string | null) => void;
  value: string | null;
}): React.JSX.Element {
  const options = timeOptions(props.value);
  return (
    <Select
      items={options.map((option) => ({ label: formatTime(option), value: option }))}
      onValueChange={(next) => props.onChange(next || null)}
      value={props.value ?? ""}
    >
      <SelectTrigger aria-label="Publish time" className={TRIGGER} disabled={props.disabled}>
        <SelectValue>
          {() =>
            props.value ? (
              formatTime(props.value)
            ) : (
              <span className="text-[color:var(--text-muted)]">Set time</span>
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="max-h-64">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {formatTime(option)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
