import * as React from "react";

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

/** Element kind → its control section's title, so clicking a row jumps to it. */
const ELEMENT_SECTION_TITLE: Partial<Record<FlowKind | "logo", string>> = {
  body: "Body",
  cta: "Button",
  divider: "Divider",
  heading: "Headline",
  logo: "Logo",
  subhead: "Subheading",
};

/** Open an element's control section and scroll to it. The section title is a
 * stable `data-slot="panel-title"`; its header (`data-slot="control-section-
 * header"`) carries `data-collapsed` and toggles on click. No-op if unmounted. */
function focusElementSection(kind: FlowKind | "logo"): void {
  const title = ELEMENT_SECTION_TITLE[kind];
  if (!title) {
    return;
  }
  const titleEl = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="panel-title"]'),
  ).find((node) => node.textContent?.trim() === title);
  if (!titleEl) {
    return;
  }
  const header = titleEl.closest<HTMLElement>('[data-slot="control-section-header"]');
  // Expand the section if it's collapsed. The header itself is the collapse
  // toggle (a div with role="button" + onClick), which fires reliably.
  if (header && header.dataset.collapsed === "true") {
    header.click();
  }
  // Scroll after the expand has a frame to lay out.
  const target = header ?? titleEl;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/**
 * Elements list — designer-mode composition.
 *
 * Add components from a menu (their control sections appear when added),
 * drag rows to reorder the flow stack like a to-do list, remove with ✕.
 * The Logo is anchored (not part of the flow), so it shows as a pinned row.
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
    if (kind === "logo") {
      setInclude("logo", true);
      return;
    }
    if (!order.includes(kind)) {
      setValue([...order, kind]);
    }
    setInclude(kind, true);
  };

  const removeKind = (kind: FlowKind | "logo"): void => {
    if (kind === "logo") {
      setInclude("logo", false);
      return;
    }
    setValue(order.filter((entry) => entry !== kind));
    setInclude(kind, false);
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
    <div className="flex flex-col gap-1">
      {order.map((kind) => (
        <div
          className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
            overId === kind && dragId !== kind
              ? "border-[color:var(--accent)]"
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
            className="flex-1 truncate text-left text-xs-plus transition-colors hover:text-[color:var(--link)]"
            onClick={() => focusElementSection(kind)}
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
        <div className="flex items-center gap-2 rounded-md border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] px-2 py-1.5">
          <span
            aria-hidden
            className="select-none text-[color:color-mix(in_oklab,var(--foreground)_25%,transparent)]"
            title="Anchored — position it in the Logo section"
          >
            ⌘
          </span>
          <button
            className="flex-1 truncate text-left text-xs-plus transition-colors hover:text-[color:var(--link)]"
            onClick={() => focusElementSection("logo")}
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="mt-0.5 w-full" size="sm" variant="outline">
                + Add element
              </Button>
            }
          />
          <DropdownMenuContent>
            {available.map((kind) => (
              <DropdownMenuItem key={kind} onClick={() => addKind(kind)}>
                {kind === "logo" ? "Logo" : FLOW_KIND_LABELS[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
};
