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
  FLOW_KIND_LABELS,
  FLOW_KINDS,
  type FlowKind,
} from "./comp-layout";

type Row = FlowKind | "logo";

/** Canonical element order — the sequence a fresh comp and newly-added elements
 * follow (logo → subhead → headline → body → button → divider). Users can still
 * drag to reorder; this only drives defaults and where "Add element" inserts. */
const CANONICAL_ELEMENT_ORDER: Row[] = [
  "logo",
  "subhead",
  "heading",
  "body",
  "cta",
  "divider",
];

const canonicalRank = (kind: Row): number => {
  const index = CANONICAL_ELEMENT_ORDER.indexOf(kind);
  return index < 0 ? CANONICAL_ELEMENT_ORDER.length : index;
};

/** Every element's settings section shares one generic title, "Content" — the
 * section's first field names the actual element (Headline/Subheading/…). */
const CONTENT_SECTION_TITLE = "Content";
const ELEMENT_SECTION_TITLE: Record<Row, string> = {
  body: CONTENT_SECTION_TITLE,
  cta: CONTENT_SECTION_TITLE,
  divider: CONTENT_SECTION_TITLE,
  eyebrow: CONTENT_SECTION_TITLE, // email-only; no Studio section
  heading: CONTENT_SECTION_TITLE,
  list: CONTENT_SECTION_TITLE, // email-only; no Studio section
  logo: CONTENT_SECTION_TITLE,
  subhead: CONTENT_SECTION_TITLE,
};

/** The element settings section — only this is swapped by focus mode; the
 * top-level Format/Media/Layout/Export sections are left as the user set them.
 * (Only one element section mounts at a time via ui.selectedElement.) */
const ELEMENT_SECTION_TITLES = new Set([CONTENT_SECTION_TITLE]);

export const ROW_LABEL = (kind: Row): string =>
  kind === "logo" ? "Logo" : FLOW_KIND_LABELS[kind];

/**
 * The comp's element rows in display order (logo included), healed against the
 * include flags — the same list the Elements panel shows. Shared with the
 * Content menu's element browser so both step through an identical sequence.
 */
export function studioElementRowOrder(values: Record<string, unknown>): Row[] {
  const raw = values["elements.order"];
  const stored: Row[] = Array.isArray(raw)
    ? (raw as unknown[]).filter(
        (entry): entry is Row =>
          entry === "logo" ||
          ((FLOW_KINDS as readonly string[]).includes(entry as string) &&
            entry !== "eyebrow" &&
            entry !== "list"),
      )
    : [];
  const logoIncluded = values["logo.include"] !== false;
  const base = logoIncluded ? stored : stored.filter((kind) => kind !== "logo");
  const missing: Row[] = [];
  for (const kind of FLOW_KINDS) {
    if (kind === "eyebrow" || kind === "list" || base.includes(kind)) {
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
  const stored: Row[] = Array.isArray(value)
    ? (value as unknown[]).filter(
        (entry): entry is Row =>
          entry === "logo" ||
          ((FLOW_KINDS as readonly string[]).includes(entry as string) &&
            entry !== "eyebrow" &&
            entry !== "list"),
      )
    : [];
  // Display order = the stored order, healed against the include flags so no
  // element can render on the canvas without a row to edit it:
  //   • drop the logo row when the logo is off;
  //   • append any element whose `${kind}.include` is true but isn't listed
  //     (e.g. a Body brought in by a shuffle or an older snapshot). Without
  //     this, an included Body has no row, so its settings are unreachable.
  const base = logoIncluded ? stored : stored.filter((kind) => kind !== "logo");
  const includedMissing: Row[] = [];
  for (const kind of FLOW_KINDS) {
    if (kind === "eyebrow" || kind === "list" || base.includes(kind)) {
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
      focusSections(ELEMENT_SECTION_TITLE[kind]);
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

  const addKind = (kind: Row): void => {
    if (!stored.includes(kind)) {
      // Insert at its canonical rank so a new element lands in the standard
      // logo→subhead→headline→body→button→divider order, not just appended.
      const next = [...stored];
      const at = next.findIndex((entry) => canonicalRank(entry) > canonicalRank(kind));
      if (at < 0) {
        next.push(kind);
      } else {
        next.splice(at, 0, kind);
      }
      setValue(next);
    }
    setInclude(kind, true);
    select(kind, true);
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

  const studioKinds = FLOW_KINDS.filter(
    (kind) => kind !== "eyebrow" && kind !== "list",
  );
  const available: Row[] = [
    ...studioKinds.filter((kind) => !order.includes(kind)),
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
            const carried = event.dataTransfer.getData("text/element-kind") as Row;
            const from =
              carried === "logo" || (FLOW_KINDS as readonly string[]).includes(carried)
                ? carried
                : dragId;
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
