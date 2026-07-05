# Mrs Content Studio — Build Prompt

## Vision

Build a desktop app that is the in-house content studio for a fashion brand. It takes a teammate from "here are this week's photos and copy" to "here is a neatly named, correctly sized, approved set of exports for every platform" in one sitting — without them ever touching a font menu, a crop dialog, or an export settings panel.

The entire product has a foundation in **Swiss design principles**: modular grid, strong typographic hierarchy, generous whitespace, restraint. The app itself should look and feel that way too. It must be a **pleasure** to use — playful, fast, decision-light — and fully usable by non-technical people. Every control uses plain language ("Make it bigger", "Flourish", "Shuffle") — never design-tool jargon (no "tracking", "OpenType features", "raster").

## Users

- **Creators** (non-technical): compose layouts, manage copy, export.
- **Reviewers** (brand owner): comment on assets/comps, request changes, approve.

## Architecture: shared-folder, local-first

- **Deployment**: the app is a static web app hosted on GitHub Pages. Teammates open the URL in Chrome/Edge — no GitHub account, no login, no install. Data never touches GitHub.
- The app operates on a **project folder** the user picks — the brand's shared **Google Drive folder**, synced locally via Google Drive for Desktop (mirrored mode). Drive is the invisible sync engine for all collaboration. No accounts, no server, works offline.
- Folder access uses the File System Access API with persisted permission (grant once). First run asks for a display name, stored locally, stamped on all comments/approvals.
- All metadata — asset tags, statuses, comments, comps, copy decks — is stored as **sidecar JSON** files inside the project folder, human-safe and merge-tolerant (one file per asset/comp, never one giant database file, so sync conflicts are rare and small).
- A **`brand/` folder** inside the project is the locked source of truth (see Brand Kit below).
- Original images are never modified. Everything is non-destructive; edits live in metadata.

## Pillar 1 — Library: organization & review

- **Import**: drag in a batch of photos → they are auto-renamed to the brand convention (`YYYYMMDD_campaign_###`) with duplicate detection. Originals preserved.
- **Organize**: group into **collections** (e.g. "July drop", "BTS"), add quick tags, star favorites. Fast search across names, tags, and collections.
- **Review workflow**: every asset and comp has a status — `Draft → In Review → Changes Requested → Approved`. Reviewers can drop **pinned comments** directly on an image ("crop tighter", "not this logo"). Comments and status changes carry author + timestamp (author name set once per machine).
- **Approval gates**: the export queue can be set to "approved only" so nothing unfinished ships.

## Pillar 2 — Studio: guided layout composition

The canvas is a **modular grid** (Swiss-style columns/rows) and everything snaps to it. Users don't place things freely — they make small, guided choices.

- **Add elements from a fixed menu**: Heading, Subheading, Body copy, Logo (variant picker showing the brand's logo set), Image slot, Divider/rule, Spacer. Every element arrives **pre-styled with approved brand styles** — there is no way to pick an off-brand font, size, or color.
- **Arrange by dragging**: reorder elements like a list; drag between grid regions. Position/scale adjustments are stepped presets (grid-snapped nudges, S/M/L scale steps), not freeform numbers.
- **Layout suggestions**: a handful of built-in Swiss layout patterns (poster, split, banded, edge-caption) the user can start from or switch between with the content preserved.
- **Shuffle mode** 🎲: one button that re-rolls the layout within brand rules — new grid arrangement, scale rhythm, alignment — while respecting **locks** (pin the logo, shuffle the rest). Re-roll until it delights; every result is on-brand by construction.
- **Guardrails, not warnings**: text over an image automatically gets a legibility treatment (subtle scrim/panel or repositioning suggestion); minimum text sizes per format are enforced; brand colors only.

## Pillar 3 — Typography: Romie made effortless

- Text styles (2–3 heading styles, subhead, body) are **locked brand presets** loaded from the brand kit. Users pick a style, never a font.
- **Flourish**: select any characters inside a text element and tap one button — the app applies Romie Italic with swashes (the `swsh`/`ss05` moves) under the hood. What used to be "switch to Romie Italic → dig for the OpenType panel → enable swashes" is one tap on a button with a live preview. Tap again to remove.
- A small **special characters palette** (approved marks: ™, ®, №, arrows, asterisk-style ornaments) insertable with one click.
- All font features handled internally; correct rendering guaranteed in both canvas and export.

## Pillar 4 — Copy decks: handle copy at volume

- **Paste a bullet list** (or plain lines) → each line becomes a copy variant in a named **copy deck**. Or add lines one by one, hitting Enter between.
- Any text element can be **bound to a deck**: cycle through variants with arrows, or fan out.
- **Matrix generation**: pick a comp, a copy deck, N checked images, and M formats → the app generates the full set of variations automatically (copy × image × format), each landing in the queue as a reviewable comp. This is the "automated remixing" export mode.

## Pillar 5 — Multi-format: design once, ship everywhere

- A comp targets **all selected formats at once**. Canvas shows one format; a format switcher previews the others instantly.
- **v1 format set**:
  - Instagram post 1080×1350 (4:5) and 1080×1080 (1:1)
  - Instagram story 1080×1920 (9:16) — with platform **safe zones** rendered (top/bottom UI areas) and content kept inside them
  - Pinterest pin 1000×1500 (2:3)
  - Shopify/web: hero banner + product/collection sizes, retina 2× variants
- The layout **re-flows per format** using the grid system; users can make **per-format overrides** (nudge something only in the story version) without breaking the master.
- Every image has a **focal point** (set once, on import or in the library) so crops across aspect ratios keep the subject — critical for fashion (faces, garment details).
- **Safe zones are a hard guarantee, not a hint**: for each format, platform UI regions (IG story top bar + reply bar, pin overlay areas, feed UI) are baked into the grid itself — snap regions simply don't exist inside unsafe areas, so it is impossible to place content where a platform will cover it. Zero errors by construction.

## Pillar 5b — Planner: see it in situ before it ships

- **Instagram grid visualizer**: a pixel-faithful 3-column profile grid showing the current feed plus planned posts. Drag comps into slots, reorder to test sequencing, spot color/rhythm clashes across the grid. Placeholder slots for upcoming content.
- **Story sequence visualizer**: stories laid out as a horizontal strip and playable in a device frame with real IG chrome overlaid (progress bars, avatar row, reply bar) — preview exactly what followers see, safe zones proven visually.
- **Device-frame preview** anywhere: toggle any comp into an in-context phone mockup with platform chrome for the target format.

## Pillar 6 — Export queue: the payoff

- Check the comps/variations you like → **Add to queue**. Queue shows a thumbnail grid of everything pending, with format badges.
- One click exports the entire queue:
  - **Named** by convention: `campaign_asset_platform_dimensions_v#` (convention editable in settings)
  - **Grouped** into folders by platform (and optionally by campaign/collection)
  - **Encoded to industry standards per target**: sRGB color profile everywhere; JPEG at platform-appropriate quality for IG/Pinterest (within platform size limits); WebP + 2× retina for Shopify/web; PNG where transparency is needed
  - Plus a quality dial: "Highest quality" vs "Platform recommended"
- A **manifest file** (CSV) accompanies each export batch — filename, format, copy used, status — ready for scheduling tools or a VA.
- Optional gate: export only `Approved` items.

## Brand Kit (`brand/` folder) — user provides

- `logos/` — full logo set, SVG preferred (+ PNG fallback), each variant named
- `fonts/` — Romie Regular + Romie Italic files (+ any secondary face)
- `brand.json` — colors (named), text style definitions (which font/size/case/spacing per style), spacing scale, naming convention
- App validates the kit on load and shows a friendly checklist of anything missing. First run offers a guided setup that generates `brand.json` from simple questions.

## Cross-cutting quality bar

- **Autosave everything**, full undo/redo, comp **version snapshots** (restore or duplicate any earlier version; duplicate any comp as a starting template).
- Fast with hundreds of images (thumbnail caching, virtualized grids).
- Exports are pixel-accurate to canvas (fonts, swashes, scrims identical).
- Keyboard shortcuts exist but nothing requires them.
- Delightful micro-interactions (drag physics, shuffle animation, satisfying export completion) — playful, never slow.

## Non-goals for v1

- No video/motion exports (stills only)
- No accounts, server sync, or live multiplayer (shared folder covers collaboration)
- No freeform photo editing (retouch happens upstream; this tool crops/places only)
