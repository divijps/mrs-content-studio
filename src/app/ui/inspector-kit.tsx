import * as React from "react";

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
  "w-full min-w-0 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--input)_5%,transparent)] bg-clip-padding text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--muted-foreground)] hover:border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_30%,transparent)]";

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
      className={`${FIELD_BASE} h-8 px-2.5 py-1 text-sm`}
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
      className={`${FIELD_BASE} min-h-[84px] resize-none px-2.5 py-2 text-sm leading-relaxed`}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
  return label ? <Field label={label}>{area}</Field> : area;
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
