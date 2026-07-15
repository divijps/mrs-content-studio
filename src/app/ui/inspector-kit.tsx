import * as React from "react";

import { CheckIcon } from "@phosphor-icons/react";

import {
  ControlFieldLabel,
  PanelSection,
  Segmented,
  Select,
  Slider,
  Switch,
} from "@/toolcraft/ui";

/**
 * Filled field styling — mirrors the Toolcraft shared input spec
 * (`SHARED_INPUT_CONTROL_BASE_CLASS_NAME` + the `lg` size) so it reads exactly
 * like a Studio field, but is applied to a PLAIN NATIVE element. React's own
 * controlled-input handling (caret position, selection, IME composition) is
 * the most reliable option; the Base UI `Input` wrapper caused flaky editing
 * in the email inspector, so the kit owns a native field instead.
 */
const FIELD_BASE =
  "w-full min-w-0 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] bg-clip-padding text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--muted-foreground)] hover:border-[color:color-mix(in_oklab,var(--border)_34%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]";

/**
 * Inspector kit — the shared control vocabulary for detail panels, distilled
 * from the Studio's Toolcraft controls panel so every surface reads the same.
 *
 * The Studio panel is a stack of `PanelSection`s (collapsible, uppercase
 * tracked title, chevron, hairline top divider, faint hover tint), one per
 * element — Headline, Subheading, Body, Logo, Button … — built from the
 * `Segmented` / `Slider` / `Select` / `Switch` controls. Each of those renders
 * its OWN sentence-case `ControlFieldLabel` from its `name`, which is what
 * gives the panel its consistent label-over-control rhythm.
 *
 * This module re-exports those primitives verbatim and adds the few field
 * types they don't cover — legible (non-monospace) prose text, and a brand
 * colour swatch row — styled to the same spec. Hand-built inspectors that
 * compose these match the Studio pixel for pixel instead of approximating it.
 */

export { Segmented, Slider, Select, Switch } from "@/toolcraft/ui";

/**
 * One collapsible titled group == one Studio panel section. `action` rides in
 * the header to the right of the title (left of the chevron) — pass an on/off
 * `Switch` there to make the whole element toggleable, the way the Studio puts
 * a reset button there. Sections self-divide: stack them with no gap and each
 * draws its own top hairline (the first omits it).
 */
export function InspectorSection({
  action,
  children,
  defaultCollapsed = false,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  title: React.ReactNode;
}): React.JSX.Element {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  return (
    <PanelSection
      action={action}
      collapsed={collapsed}
      collapsible
      onCollapsedChange={setCollapsed}
      title={title}
    >
      {children}
    </PanelSection>
  );
}

/**
 * Studio field label + control stack, for the controls that don't self-label
 * (swatch rows, pickers). `Segmented`/`Slider`/`Select`/`Switch` already draw
 * their own label from `name`, so they don't need this wrapper.
 */
export function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ControlFieldLabel>{label}</ControlFieldLabel>
      {children}
    </div>
  );
}

/**
 * Single-line prose input — the shared filled Input shape, but NOT monospace
 * (the Toolcraft `TextInput` control forces `font-mono`, which reads wrong for
 * copy). Omit `label` for a section's obvious primary field.
 */
export function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}): React.JSX.Element {
  const input = (
    <input
      className={`${FIELD_BASE} h-9 px-3 py-1 text-sm`}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="text"
      value={value}
    />
  );
  return label ? <Field label={label}>{input}</Field> : input;
}

/** Multi-line prose — the shared `Textarea` (default, non-code variant). */
export function TextAreaField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}): React.JSX.Element {
  const area = (
    <textarea
      className={`${FIELD_BASE} min-h-[84px] resize-none px-3 py-2.5 text-sm leading-relaxed`}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
  return label ? <Field label={label}>{area}</Field> : area;
}

/**
 * Pill — the one chip shape used for tags, roles, filters and reason badges, so
 * every rounded label across the app reads identically. Renders a `<button>`
 * when interactive (`onClick`), a `<span>` otherwise. `active` brightens it for
 * the selected state; `tone="accent"` tints it with the brand accent.
 */
export function Chip({
  active = false,
  children,
  icon,
  onClick,
  title,
  tone = "neutral",
}: {
  active?: boolean;
  children: React.ReactNode;
  /** Leading icon. A selected chip defaults to a check when none is given. */
  icon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  tone?: "accent" | "neutral";
}): React.JSX.Element {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs leading-tight transition-colors";
  const selected = active || tone === "accent";
  const look = selected
    ? "border-[color:color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)] text-[color:var(--foreground)]"
    : "border-[color:color-mix(in_oklab,var(--border)_26%,transparent)] bg-transparent text-[color:var(--muted-foreground)]";
  const leading = icon ?? (active ? <CheckIcon size={12} weight="bold" /> : null);
  const content = (
    <>
      {leading}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button
        className={`${base} ${look} ${selected ? "" : "hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] hover:text-[color:var(--foreground)]"}`}
        onClick={onClick}
        title={title}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <span className={`${base} ${look}`} title={title}>
      {content}
    </span>
  );
}

/**
 * Tag editor — removable `#tag` chips plus an inline add field with optional
 * roster/tag suggestions. The single home for the "chips + add a tag" pattern
 * that was hand-rolled in the copy details, snippet cards, and task detail.
 */
export function TagInput({
  onAdd,
  onRemove,
  placeholder = "# add tag",
  suggestions = [],
  tags,
}: {
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
  suggestions?: readonly string[];
  tags: readonly string[];
}): React.JSX.Element {
  const [draft, setDraft] = React.useState("");
  const commit = (): void => {
    const tag = draft.trim().replace(/^#/, "").toLowerCase();
    if (tag && !tags.includes(tag)) {
      onAdd(tag);
    }
    setDraft("");
  };
  const fragment = draft.trim().replace(/^#/, "").toLowerCase();
  const matches = fragment
    ? suggestions
        .filter((item) => item.toLowerCase().includes(fragment) && !tags.includes(item))
        .slice(0, 5)
    : [];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:color-mix(in_oklab,var(--border)_26%,transparent)] px-2.5 py-0.5 text-2xs text-[color:var(--muted-foreground)] transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] hover:text-[color:var(--foreground)]"
            key={tag}
            onClick={() => onRemove(tag)}
            title="Remove tag"
            type="button"
          >
            #{tag}
            <span aria-hidden className="opacity-50">
              ✕
            </span>
          </button>
        ))}
        <input
          className="w-20 min-w-0 flex-1 bg-transparent text-2xs text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted-foreground)]"
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          value={draft}
        />
      </div>
      {matches.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {matches.map((match) => (
            <button
              className="rounded-full border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] px-2 py-0.5 text-2xs text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              key={match}
              onClick={() => {
                onAdd(match);
                setDraft("");
              }}
              type="button"
            >
              #{match}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type SwatchColor = { hex: string; id: string; label: string };

/**
 * Brand-colour swatch row. Matches the active swatch by id OR hex, so it works
 * whether a value stores the colour's id (`ink`) or its literal hex.
 */
export function Swatches({
  colors,
  onChange,
  size = "md",
  value,
}: {
  colors: readonly SwatchColor[];
  onChange: (color: SwatchColor) => void;
  size?: "md" | "lg";
  value: string;
}): React.JSX.Element {
  const dimension = size === "lg" ? "h-7 w-7" : "h-6 w-6";
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => {
        const active = value === color.id || value === color.hex;
        return (
          <button
            aria-label={color.label}
            className={`${dimension} rounded-full border transition-transform ${
              active
                ? "scale-110 border-[color:var(--foreground)]"
                : "border-[color:color-mix(in_oklab,var(--border)_30%,transparent)] hover:scale-105"
            }`}
            key={color.id}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color.hex }}
            title={color.label}
            type="button"
          />
        );
      })}
    </div>
  );
}
