import * as React from "react";

import {
  ArrowElbowDownRightIcon,
  ArrowElbowUpRightIcon,
  PlusIcon,
} from "@phosphor-icons/react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/toolcraft/ui";

import {
  DUPLICABLE_KINDS,
  EXTRA_SLOT_KEYS,
  FLOW_KINDS,
  slotKind,
  slotLabel,
  slotsOfKind,
  type FlowKind,
} from "./comp-layout";

/** A panel row is a SLOT id: a flow kind, an extra instance ("heading2"), or
 * the anchored "logo". */
type Row = string;

/** Canonical element order — the sequence a fresh comp and newly-added elements
 * follow (logo → subhead → headline → body → button → divider). Users can still
 * drag to reorder; this only drives defaults and where "Add element" inserts. */
const CANONICAL_ELEMENT_ORDER: (FlowKind | "logo")[] = [
  "logo",
  "masthead",
  "lockup",
  "subhead",
  "heading",
  "body",
  "cta",
  "divider",
];

/** Rank a SLOT: extra instances sit right after their kind's base slot. */
const canonicalRank = (slot: Row): number => {
  const index = CANONICAL_ELEMENT_ORDER.indexOf(slotKind(slot));
  const kindRank = index < 0 ? CANONICAL_ELEMENT_ORDER.length : index;
  const instance = /2$/.test(slot) ? 1 : /3$/.test(slot) ? 2 : 0;
  return kindRank * 10 + instance;
};

/** A valid Studio row: logo, a Studio flow kind, or an extra slot of one.
 * (Eyebrow/list are email-only and never rows here.) */
const isStudioRow = (entry: unknown): entry is Row => {
  if (typeof entry !== "string") {
    return false;
  }
  if (entry === "logo") {
    return true;
  }
  const kind = slotKind(entry);
  if (kind === "logo" || kind === "eyebrow" || kind === "list") {
    return false;
  }
  if (!(FLOW_KINDS as readonly string[]).includes(kind)) {
    return false;
  }
  return entry === kind || EXTRA_SLOT_KEYS.includes(entry);
};

/** Every element's settings section shares one generic title, "Content" — the
 * section's first field names the actual element (Headline/Subheading/…). */
const CONTENT_SECTION_TITLE = "Content";

/** The element settings section — only this is swapped by focus mode; the
 * top-level Format/Media/Layout/Export sections are left as the user set them.
 * (Only one element section mounts at a time via ui.selectedElement.) */
const ELEMENT_SECTION_TITLES = new Set([CONTENT_SECTION_TITLE]);

export const ROW_LABEL = (slot: Row): string => slotLabel(slot);

/**
 * The comp's element rows in display order (logo included), healed against the
 * include flags — the same list the Elements panel shows. Shared with the
 * Content menu's element browser so both step through an identical sequence.
 */
export function studioElementRowOrder(values: Record<string, unknown>): Row[] {
  const raw = values["elements.order"];
  const stored: Row[] = Array.isArray(raw) ? (raw as unknown[]).filter(isStudioRow) : [];
  const logoIncluded = values["logo.include"] !== false;
  const base = logoIncluded ? stored : stored.filter((slot) => slot !== "logo");
  const missing: Row[] = [];
  // Heal BASE kinds only from include flags (legacy snapshots / shuffles).
  // Extra slots live strictly by elements.order membership — an artboard
  // switch leaves the OLD comp's `${slot}.include` flags in runtime state, and
  // healing them back in would leak its duplicates onto the next comp.
  for (const kind of FLOW_KINDS) {
    if (!isStudioRow(kind) || base.includes(kind)) {
      continue;
    }
    if (values[`${kind}.include`] === true) {
      missing.push(kind);
    }
  }
  if (logoIncluded && !base.includes("logo")) {
    missing.push("logo");
  }
  return [...base, ...missing];
}

/**
 * Content-menu element browser: a `‹ Element ›` row that steps
 * `ui.selectedElement` through the ordered element list, so one "Content"
 * section serves every element. Clicking a row in the Elements panel jumps here
 * too (both write `ui.selectedElement`). Hook-free — safe in the gated section.
 */
export const ElementContentNavControl: ToolcraftCustomControlRenderer = ({
  dispatch,
  state,
}) => {
  const order = studioElementRowOrder(state.values);
  const raw = state.values["ui.selectedElement"];
  const current =
    typeof raw === "string" && order.includes(raw as Row) ? (raw as Row) : order[0];
  if (!current || order.length === 0) {
    return <></>;
  }
  const index = order.indexOf(current);
  const step = (delta: number): void => {
    const next = order[(index + delta + order.length) % order.length];
    if (next) {
      dispatch({
        history: "skip",
        target: "ui.selectedElement",
        type: "controls.setValue",
        value: next,
      });
    }
  };
  const solo = order.length <= 1;
  const arrow =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg leading-none text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)] disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="-mt-0.5 mb-1.5 flex items-center gap-1 rounded-lg bg-[color:var(--surface-inactive)] px-1 py-0.5">
      <button
        aria-label="Previous element"
        className={arrow}
        disabled={solo}
        onClick={() => step(-1)}
        type="button"
      >
        ‹
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-xs-plus font-medium text-[color:var(--foreground)]">
        {ROW_LABEL(current)}
      </span>
      <button
        aria-label="Next element"
        className={arrow}
        disabled={solo}
        onClick={() => step(1)}
        type="button"
      >
        ›
      </button>
    </div>
  );
};

/**
 * Focus mode: expand the clicked element's settings section and collapse the
 * OTHER element settings sections (Format/Media/Layout stay put). Section
 * collapse lives in the panel's local state — the header
 * (`data-slot="control-section-header"`, with `data-collapsed`) is the toggle.
 */
function focusSections(selectedTitle: string): void {
  window.setTimeout(() => {
    for (const header of document.querySelectorAll<HTMLElement>(
      '[data-slot="control-section-header"]',
    )) {
      const title = header.querySelector('[data-slot="panel-title"]')?.textContent?.trim();
      if (!title || !ELEMENT_SECTION_TITLES.has(title)) {
        continue;
      }
      const collapsed = header.dataset.collapsed === "true";
      const shouldBeOpen = title === selectedTitle;
      if (shouldBeOpen === collapsed) {
        header.click();
      }
    }
  }, 30);
}

/**
 * Elements list — designer-mode composition.
 *
 * Rows are the comp's elements (flow text + the anchored Logo), drag-reorderable
 * like a to-do list. Clicking a row publishes `ui.selectedElement` and opens the
 * Content menu for that element (via focusSections). One element is selected by
 * default so Content always has something to edit; collapsing the Elements
 * section leaves Content alone — it's its own menu now, browsable with the
 * arrows in its header.
 *
 * The control is in the always-mounted Elements section, so hooks are safe here.
 *
 * Custom control (documented builtInFitCheck): the value model is an ordered,
 * heterogeneous element list whose rows toggle OTHER sections' visibility —
 * collectionActions owns homogeneous item lists and cannot express that.
 */
export const ElementListControl: ToolcraftCustomControlRenderer = ({
  dispatch,
  setValue,
  state,
  value,
}) => {
  const [dragId, setDragId] = React.useState<Row | null>(null);
  const [overId, setOverId] = React.useState<Row | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const logoIncluded = state.values["logo.include"] !== false;

  // Stored row order (may include "logo"); email-only kinds never show here.
  const stored: Row[] = Array.isArray(value) ? (value as unknown[]).filter(isStudioRow) : [];
  // Display order = the stored order, healed against the include flags so no
  // element can render on the canvas without a row to edit it:
  //   • drop the logo row when the logo is off;
  //   • append any slot whose `${slot}.include` is true but isn't listed
  //     (e.g. a Body brought in by a shuffle or an older snapshot). Without
  //     this, an included Body has no row, so its settings are unreachable.
  const base = logoIncluded ? stored : stored.filter((slot) => slot !== "logo");
  const includedMissing: Row[] = [];
  // Base kinds only — extra slots are NEVER healed from include flags (an
  // artboard switch leaves the old comp's flags in runtime state; healing
  // would leak its duplicates onto this comp — see studioElementRowOrder).
  for (const kind of FLOW_KINDS) {
    if (!isStudioRow(kind) || base.includes(kind)) {
      continue;
    }
    if (state.values[`${kind}.include`] === true) {
      includedMissing.push(kind);
    }
  }
  if (logoIncluded && !base.includes("logo")) {
    includedMissing.push("logo");
  }
  const order: Row[] = [...base, ...includedMissing];

  const rawSelected = state.values["ui.selectedElement"];
  const selected: Row | "" =
    typeof rawSelected === "string" && order.includes(rawSelected as Row)
      ? (rawSelected as Row)
      : "";

  const select = (kind: Row | "", focus = false): void => {
    dispatch({
      history: "skip", // selection is UI focus, not a design edit
      target: "ui.selectedElement",
      type: "controls.setValue",
      value: kind,
    });
    if (focus && kind !== "") {
      focusSections(CONTENT_SECTION_TITLE);
    }
  };

  const setInclude = (kind: Row, include: boolean): void => {
    dispatch({
      history: "merge",
      historyGroup: `element-${kind}-${include}`,
      target: `${kind}.include`,
      type: "controls.setValue",
      value: include,
    });
  };

  // Normalize on mount / when the row set changes: keep include flags in lockstep
  // with the row list, persist the logo row into the stored order, and clear a
  // stale selection.
  const orderKey = order.join(",");
  React.useEffect(() => {
    // A listed flow row IS an included element, and vice versa. Enforcing this
    // both directions prevents a ghost row (in the order but include=false) whose
    // settings section mounts empty — the element can't be edited or rendered.
    const flowRows = new Set(order.filter((entry) => entry !== "logo"));
    for (const kind of FLOW_KINDS) {
      if (kind === "eyebrow" || kind === "list") {
        continue; // email-only kinds, never part of the Studio row list
      }
      const desired = flowRows.has(kind);
      if (state.values[`${kind}.include`] !== desired) {
        dispatch({
          history: "skip",
          target: `${kind}.include`,
          type: "controls.setValue",
          value: desired,
        });
      }
    }
    // Extra instance slots track their rows too — but never WRITE false onto a
    // slot that was never used (that would stamp extra keys onto every comp and
    // churn identity fingerprints). Only flip a set flag, or set true for a row.
    for (const slot of EXTRA_SLOT_KEYS) {
      const desired = flowRows.has(slot);
      const current = state.values[`${slot}.include`];
      if (desired ? current !== true : current === true) {
        dispatch({
          history: "skip",
          target: `${slot}.include`,
          type: "controls.setValue",
          value: desired,
        });
      }
    }
    // Logo include must track the logo row too (the FLOW_KINDS loop above skips
    // it). Without this a fresh comp leaves `logo.include` undefined, so every
    // logo control (gated on logo.include===true) hides → empty Logo submenu.
    const wantLogo = order.includes("logo");
    if ((state.values["logo.include"] === true) !== wantLogo) {
      dispatch({
        history: "skip",
        target: "logo.include",
        type: "controls.setValue",
        value: wantLogo,
      });
    }
    // Logo is included but not yet in the stored order → persist it so its row
    // position round-trips (the display already shows it appended).
    if (logoIncluded && !stored.includes("logo")) {
      dispatch({
        history: "skip",
        target: "elements.order",
        type: "controls.setValue",
        value: order,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  // Keep one element selected so the Content menu always has an element to edit
  // (defaults to the first). Collapsing the Elements section no longer clears the
  // selection — Content is its own menu now and stays open independently. Clicking
  // a row opens Content (via focusSections); the Content arrows browse elements.
  const currentSelected = state.values["ui.selectedElement"];
  const hasValidSelection =
    typeof currentSelected === "string" && order.includes(currentSelected as Row);
  React.useEffect(() => {
    if (!hasValidSelection && order.length > 0) {
      select(order[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, hasValidSelection]);

  // The runtime keys a fresh duplicate copies from its base element, so a new
  // instance lands coherent (same size/leading/width/style/content) and then
  // diverges as edited. Spacing is positional — it intentionally starts at 0.
  const COPY_KEYS: Partial<Record<FlowKind, string[]>> = {
    body: ["text", "size", "width", "leading"],
    cta: ["text", "style", "size"],
    divider: ["weight", "length"],
    heading: [
      "text",
      "size",
      "width",
      "leading",
      "style",
      "flourish",
      "flourishStyle",
      "flourishStyles",
    ],
    lockup: ["left", "right", "motifSize", "textSize"],
    masthead: [
      "logoVariant",
      "title",
      "caption",
      "size",
      "showLogo",
      "showTitle",
      "showCaption",
      "showDividers",
      "dividerCount",
    ],
    subhead: ["text", "size", "width", "leading"],
  };

  /** Copy the base element's current settings onto a fresh extra slot. */
  const seedSlotFromBase = (slot: Row): void => {
    const kind = slotKind(slot);
    if (kind === "logo" || slot === kind) {
      return;
    }
    for (const key of COPY_KEYS[kind] ?? []) {
      const baseValue = state.values[`${kind}.${key}`];
      if (baseValue !== undefined) {
        dispatch({
          history: "merge",
          historyGroup: `element-${slot}-seed`,
          target: `${slot}.${key}`,
          type: "controls.setValue",
          value: baseValue,
        });
      }
    }
  };

  const addKind = (slot: Row): void => {
    if (!stored.includes(slot)) {
      // Insert at its canonical rank so a new element lands in the standard
      // logo→subhead→headline→body→button→divider order (duplicates right
      // after their siblings), not just appended.
      const next = [...stored];
      const at = next.findIndex((entry) => canonicalRank(entry) > canonicalRank(slot));
      if (at < 0) {
        next.push(slot);
      } else {
        next.splice(at, 0, slot);
      }
      setValue(next);
    }
    seedSlotFromBase(slot);
    setInclude(slot, true);
    select(slot, true);
  };

  const removeKind = (kind: Row): void => {
    setValue(stored.filter((entry) => entry !== kind));
    setInclude(kind, false);
    if (selected === kind) {
      select("");
    }
  };

  const reorder = (from: Row, to: Row): void => {
    // Reorder within the full display order (logo included) and persist it.
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }
    const next = [...order];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, from);
    setValue(next);
  };

  // "Add element" offers every Studio kind that still has a free slot — the
  // base first, then instance 2, then 3 (max 3 of a kind). The menu row shows
  // the slot that WOULD be added ("Headline 2") so duplication is explicit.
  const studioKinds = FLOW_KINDS.filter(
    (kind) => kind !== "eyebrow" && kind !== "list",
  );
  const available: Row[] = [
    ...studioKinds
      .map((kind) =>
        DUPLICABLE_KINDS.includes(kind)
          ? slotsOfKind(kind).find((slot) => !order.includes(slot))
          : order.includes(kind)
            ? undefined
            : kind,
      )
      .filter((slot): slot is Row => slot !== undefined),
    ...(logoIncluded ? [] : (["logo"] as const)),
  ];

  // Grouping: a flow element can be "joined" to the flow element directly below
  // it. Grouped elements stay tight when the Layout distribution is "Grouped".
  const rawGroups = state.values["layout.groupWithNext"];
  const groupWithNext = new Set<Row>(
    Array.isArray(rawGroups)
      ? (rawGroups as unknown[]).filter((entry): entry is Row => typeof entry === "string")
      : [],
  );
  const toggleGroup = (kind: Row): void => {
    const next = new Set(groupWithNext);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    dispatch({
      history: "merge",
      historyGroup: `group-${kind}`,
      target: "layout.groupWithNext",
      type: "controls.setValue",
      value: [...next],
    });
  };

  const rowClass = (kind: Row, inGroup: boolean): string =>
    `flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
      overId === kind && dragId !== kind
        ? "border-[color:var(--accent)]"
        : selected === kind
          ? "border-[color:color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]"
          : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)]"
    } ${inGroup ? "border-l-2 border-l-[color:var(--accent)]" : ""} ${
      dragId === kind ? "opacity-50" : ""
    }`;

  return (
    // The data attributes anchor styles.css's pairing rule.
    <div
      className="flex flex-col gap-1"
      data-element-list=""
      data-element-selected={selected === "" ? "false" : "true"}
      ref={rootRef}
    >
      {order.map((kind, index) => {
        const belowKind = order[index + 1];
        // Any element (logo included) can be joined to the one directly below it.
        const canGroup = belowKind !== undefined;
        const groupedDown = canGroup && groupWithNext.has(kind);
        const previous = order[index - 1];
        const groupedFromAbove =
          previous !== undefined && groupWithNext.has(previous);
        const inGroup = groupedDown || groupedFromAbove;
        return (
        <div
          className={rowClass(kind, inGroup)}
          draggable
          key={kind}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setOverId(kind);
          }}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/element-kind", kind);
            setDragId(kind);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const carried = event.dataTransfer.getData("text/element-kind");
            const from = isStudioRow(carried) ? carried : dragId;
            if (from && from !== kind) {
              reorder(from, kind);
            }
            setDragId(null);
            setOverId(null);
          }}
        >
          <span
            aria-hidden
            className="cursor-grab select-none text-[color:color-mix(in_oklab,var(--foreground)_35%,transparent)]"
          >
            ⠿
          </span>
          <button
            aria-expanded={selected === kind}
            className="flex-1 truncate text-left text-xs-plus transition-colors hover:text-[color:var(--link)]"
            onClick={() => select(kind, true)}
            title={`Edit ${ROW_LABEL(kind)}`}
            type="button"
          >
            {ROW_LABEL(kind)}
          </button>
          {canGroup ? (
            <button
              aria-label={
                groupedDown
                  ? `Ungroup ${ROW_LABEL(kind)} from below`
                  : `Group ${ROW_LABEL(kind)} with the element below`
              }
              aria-pressed={groupedDown}
              className={`transition-colors ${
                groupedDown
                  ? "text-[color:var(--accent)]"
                  : "text-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] hover:text-[color:var(--foreground)]"
              }`}
              onClick={() => toggleGroup(kind)}
              title={
                groupedDown ? "Grouped with the element below" : "Group with the element below"
              }
              type="button"
            >
              {groupedDown ? (
                <ArrowElbowUpRightIcon weight="bold" />
              ) : (
                <ArrowElbowDownRightIcon />
              )}
            </button>
          ) : null}
          <button
            aria-label={`Remove ${ROW_LABEL(kind)}`}
            className="text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)] transition-colors hover:text-[color:var(--foreground)]"
            onClick={() => removeKind(kind)}
            type="button"
          >
            ✕
          </button>
        </div>
        );
      })}

      {order.length === 0 ? (
        <p className="py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          Empty canvas — add your first element.
        </p>
      ) : null}

      {available.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_35%,transparent)] px-2 py-1.5 text-xs-plus text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
                type="button"
              >
                <PlusIcon />
                Add element
              </button>
            }
          />
          <DropdownMenuContent align="start">
            {available.map((kind) => (
              <DropdownMenuItem key={kind} onClick={() => addKind(kind)}>
                {ROW_LABEL(kind)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
};
