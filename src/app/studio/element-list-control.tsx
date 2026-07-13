import * as React from "react";

import { PlusIcon } from "@phosphor-icons/react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import {
  Button,
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

/** Element kind → its settings section title in the schema. */
const ELEMENT_SECTION_TITLE: Record<FlowKind | "logo", string> = {
  body: "Body",
  cta: "Button",
  divider: "Divider",
  eyebrow: "Eyebrow", // email-only; no Studio section
  heading: "Headline",
  list: "List", // email-only; no Studio section
  logo: "Logo",
  subhead: "Subheading",
};

/**
 * Focus mode for the panel: expand the clicked element's settings section and
 * collapse every other section (Elements itself stays open) so the user sees
 * exactly one menu. Section collapse lives in the panel's local React state —
 * its header (`data-slot="control-section-header"`, with `data-collapsed`) is
 * the toggle, so clicking it is the supported way in. Runs after a beat so the
 * newly-visible section has rendered.
 */
function focusSections(selectedTitle: string): void {
  window.setTimeout(() => {
    const headers = document.querySelectorAll<HTMLElement>(
      '[data-slot="control-section-header"]',
    );
    for (const header of headers) {
      const title = header
        .querySelector('[data-slot="panel-title"]')
        ?.textContent?.trim();
      if (!title || title === "Elements") {
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
 * Clicking a row publishes `ui.selectedElement`, and only that element's
 * settings section renders (directly below this list) — expanded, with every
 * other section collapsed. Nothing is selected by default: the settings are a
 * submenu of the element you click, hidden until then. Drag rows to reorder
 * the flow; remove with ✕. The Logo is anchored (not in the flow), so it
 * shows as a pinned row.
 *
 * Custom control (documented builtInFitCheck): the value model is an ordered,
 * heterogeneous element list whose rows toggle OTHER sections' visibility —
 * collectionActions owns homogeneous item lists and cannot drive sibling
 * section visibility or express pinned non-flow rows.
 */
export const ElementListControl: ToolcraftCustomControlRenderer = ({
  dispatch,
  setValue,
  state,
  value,
}) => {
  const [dragId, setDragId] = React.useState<FlowKind | null>(null);
  const [overId, setOverId] = React.useState<FlowKind | null>(null);

  const order: FlowKind[] = Array.isArray(value)
    ? (value as unknown[]).filter((entry): entry is FlowKind =>
        (FLOW_KINDS as readonly string[]).includes(entry as string),
      )
    : [];

  const logoIncluded = state.values["logo.include"] !== false;

  // The focused element — its settings section is the only one visible.
  const rawSelected = state.values["ui.selectedElement"];
  const selected: FlowKind | "logo" | "" =
    rawSelected === "logo" ||
    (typeof rawSelected === "string" &&
      (FLOW_KINDS as readonly string[]).includes(rawSelected))
      ? (rawSelected as FlowKind | "logo")
      : "";

  const select = (kind: FlowKind | "logo" | "", focus = false): void => {
    dispatch({
      history: "skip", // selection is UI focus, not a design edit
      target: "ui.selectedElement",
      type: "controls.setValue",
      value: kind,
    });
    // Explicit clicks force focus mode: the element's settings open, all other
    // sections close. The mount normalization skips this so a reload doesn't
    // rearrange sections the user laid out.
    if (focus && kind !== "") {
      focusSections(ELEMENT_SECTION_TITLE[kind]);
    }
  };

  // Include flags no longer have schema controls (this list owns them), so
  // materialize them once on mount for the default order + logo. History is
  // skipped: this is state normalization, not a user edit.
  const orderKey = order.join(",");
  React.useEffect(() => {
    for (const kind of order) {
      if (state.values[`${kind}.include`] === undefined) {
        dispatch({
          history: "skip",
          target: `${kind}.include`,
          type: "controls.setValue",
          value: true,
        });
      }
    }
    if (state.values["logo.include"] === undefined) {
      dispatch({
        history: "skip",
        target: "logo.include",
        type: "controls.setValue",
        value: true,
      });
    }
    // Element settings are hidden by default (a submenu of the clicked
    // element), so nothing is auto-selected. Only clear a stale selection that
    // points at an element no longer present, so no orphaned section lingers.
    const stale =
      selected !== "" &&
      (selected === "logo" ? !logoIncluded : !order.includes(selected));
    if (stale && rawSelected !== "") {
      select("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const setInclude = (kind: FlowKind | "logo", include: boolean): void => {
    dispatch({
      history: "merge",
      historyGroup: `element-${kind}-${include}`,
      target: `${kind === "heading" ? "heading" : kind === "subhead" ? "subhead" : kind === "body" ? "body" : kind}.include`,
      type: "controls.setValue",
      value: include,
    });
  };

  const addKind = (kind: FlowKind | "logo"): void => {
    if (kind !== "logo" && !order.includes(kind)) {
      setValue([...order, kind]);
    }
    setInclude(kind, true);
    // A just-added element is what the user wants to edit — focus it.
    select(kind, true);
  };

  const removeKind = (kind: FlowKind | "logo"): void => {
    const remaining = kind === "logo" ? order : order.filter((entry) => entry !== kind);
    if (kind !== "logo") {
      setValue(remaining);
    }
    setInclude(kind, false);
    // Removing the open element collapses back to the default hidden state
    // (settings are a submenu of a selected element; none is now selected).
    if (selected === kind) {
      select("");
    }
  };

  const reorder = (from: FlowKind, to: FlowKind): void => {
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

  // Eyebrow and List are email-only elements — the Studio has no control
  // sections for them, so keep them out of the designer's add menu.
  const studioKinds = FLOW_KINDS.filter(
    (kind) => kind !== "eyebrow" && kind !== "list",
  );
  const available: (FlowKind | "logo")[] = [
    ...studioKinds.filter((kind) => !order.includes(kind)),
    ...(logoIncluded ? [] : (["logo"] as const)),
  ];

  return (
    // The data attributes anchor styles.css's pairing rule: the section that
    // follows this one is the focused element's settings, and it gets the
    // matching accent treatment only while something is selected.
    <div
      className="flex flex-col gap-1"
      data-element-list=""
      data-element-selected={selected === "" ? "false" : "true"}
    >
      {order.map((kind) => (
        <div
          className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
            overId === kind && dragId !== kind
              ? "border-[color:var(--accent)]"
              : selected === kind
                ? "border-[color:color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]"
                : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)]"
          } ${dragId === kind ? "opacity-50" : ""}`}
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
            // Prefer the payload (state may not have flushed mid-drag).
            const carried = event.dataTransfer.getData("text/element-kind") as FlowKind;
            const from = (FLOW_KINDS as readonly string[]).includes(carried)
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
            title={`Edit ${FLOW_KIND_LABELS[kind]}`}
            type="button"
          >
            {FLOW_KIND_LABELS[kind]}
          </button>
          <button
            aria-label={`Remove ${FLOW_KIND_LABELS[kind]}`}
            className="text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)] transition-colors hover:text-[color:var(--foreground)]"
            onClick={() => removeKind(kind)}
            type="button"
          >
            ✕
          </button>
        </div>
      ))}

      {logoIncluded ? (
        <div
          className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
            selected === "logo"
              ? "border-[color:color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]"
              : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)]"
          }`}
        >
          <span
            aria-hidden
            className="select-none text-[color:color-mix(in_oklab,var(--foreground)_25%,transparent)]"
            title="Anchored — position it in the Logo settings"
          >
            ⌘
          </span>
          <button
            aria-expanded={selected === "logo"}
            className="flex-1 truncate text-left text-xs-plus transition-colors hover:text-[color:var(--link)]"
            onClick={() => select("logo", true)}
            title="Edit Logo"
            type="button"
          >
            Logo
          </button>
          <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_35%,transparent)]">
            anchored
          </span>
          <button
            aria-label="Remove Logo"
            className="text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)] transition-colors hover:text-[color:var(--foreground)]"
            onClick={() => removeKind("logo")}
            type="button"
          >
            ✕
          </button>
        </div>
      ) : null}

      {order.length === 0 && !logoIncluded ? (
        <p className="py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          Empty canvas — add your first element.
        </p>
      ) : null}

      {available.length > 0 ? (
        <div className="mt-0.5 flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button aria-label="Add element" size="icon-sm" variant="outline">
                  <PlusIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {available.map((kind) => (
                <DropdownMenuItem key={kind} onClick={() => addKind(kind)}>
                  {kind === "logo" ? "Logo" : FLOW_KIND_LABELS[kind]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
};
