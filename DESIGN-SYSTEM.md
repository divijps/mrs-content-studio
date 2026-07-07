# Mrs Content Studio — Design System

Adopted from a Paper canvas ("Playground") handoff. This governs **app UI / chrome**
(menus, panels, controls, cards, boards). It does **not** govern Studio comp output or
brand/marketing typography (Romie etc.), which stay as-is.

Tokens live in [`src/styles.css`](src/styles.css) `:root`. Use them — never hard-code a
gray hex.

## The rules (memorize)

1. **White-on-near-black via alpha, never solid gray.** Canvas `--background` `#070707`,
   panels `--panel`/`--card`/`--popover` `#121212` (the only solid surfaces). Every
   *control* surface is white at low alpha, stepping the ladder:
   - `--surface-inactive` `#FFFFFF08` → `--surface-active` `#FFFFFF12` → `--surface-raised` `#FFFFFF1A`
   - Tailwind: `bg-[color:var(--surface-active)]` etc.
2. **Text ladder:** `--text-muted` `#FBFBFB80` (inactive) → `--muted-foreground` `#FBFBFB99`
   (secondary/labels) → `--foreground` `#FBFBFB` (primary/active); headings `--text-heading` `#F0F0F0`.
3. **Weight is always 400.** Hierarchy comes from **size + alpha, not weight**. Do not use
   `font-medium`/`font-semibold` in chrome.
4. **Type scale: 11 / 12 / 13 / 16px only.** `text-2xs`(11) · `text-xs`(12) · `text-xs-plus`(13)
   · `text-base`/heading(16). Small UI text line-height ~14px.
5. **Active = brighter surface + hairline + full-strength text.** Inactive = dimmer surface,
   no shadow, 50% text. Change *only* those three things between states.
6. **Raised surfaces carry the hairline:** `class="ds-hairline"` or `box-shadow: var(--hairline)`.
   Never put it on inactive surfaces — its absence is what reads as recessed.
7. **Controls are 36px tall (`h-9`), 8px radius (`rounded-lg`/`--radius`).** Panels are 10px
   (`rounded-[var(--radius-panel)]`), 16px padding.
8. **Grouping unit:** `label (12px, --muted-foreground)` + `control row`, stacked `gap-[9px]`.
   Groups sit in a bottom-aligned row, `gap-[22px]`. Controls hug content (`px-3`), no fixed widths.
9. **Accent (`--accent`, blue) is for primary CTAs and focus/selection only** — not for
   segmented "active", which is the neutral white-alpha treatment (see the `.ds-seg` helper).
10. **Spacing steps:** 6 / 8 / 9 / 12 / 16 / 22 / 40px. Stay on them.

## Helpers

- **`.ds-seg`** (+ `data-active="true"`) — the segmented/toggle button. Neutral active state
  per rule 5; use for view toggles, filters, tabs.
- **`.ds-hairline`** — the raised-surface shadow.
- **`.ds-label`** — section/field label for **detail panels** (15px, sentence case, ~60% alpha).
  Use it instead of tiny all-caps labels wherever a metadata/detail sidebar lists grouped fields.

## Detail panels (metadata sidebars)

The asset viewer, Copy details, and similar right-hand metadata panels follow a friendlier
treatment than dense control chrome — it makes the separation between grouped fields legible:

- **Section labels use `.ds-label`** — sentence case ("Status", not "STATUS"), 15px, muted. This
  is a deliberate step up from the 11–12px all-caps chrome labels (rules 4/8); the shouty caps
  crowded the eye and blurred group boundaries.
- **A prominent title**, `text-xl font-semibold` — the one sanctioned exception to rule 3, because
  the item's name is the anchor of the panel.
- **Read the title from a schema, not the raw filename.** Show a human heading (the board path, or a
  prettified name) with the raw schema name reduced to a `#index` chip. See `assetHeading()` /
  `assetIndex()` in `src/app/library/asset-detail.tsx`.
- **Attribution over specs.** Lead with `#index` + `Added by {name}` (falls back to `Added {date}`).
  Keep technical specs (format · dimensions · size) only as a small, dim footer — not in the header.
- **Group spacing `gap-5`; label→control `gap-2`.** Comments take an inline `+ New note` field.

## Scope of adoption

Applied: shell, Tasks, Copy, Queue, Planner, Library, Brand menus/panels/controls.
Detail-panel treatment (`.ds-label` + schema heading + attribution): asset viewer, Copy details.
Untouched: Studio editor (`/`, ToolcraftApp + artboard tray) and comp rendering.
