# Mrs Content Studio — Build Plan

Companion to `BRIEF.md`. This is the implementation roadmap: architecture, data model, Toolcraft mapping, phases with acceptance criteria, and the UX patterns that make it intuitive.

---

## Direction v2 (2026-07-03) — reverses the local-first/no-accounts decision

User feedback after Phases 0–5 shipped. Three changes, in this order:

1. **Unify on the Toolcraft UI kit.** Library / Planner / Queue were hand-styled React and drift from the system. Rebuild them on Toolcraft's own components (`@/toolcraft/ui`: Button, Input, Select, Sheet, Breadcrumb, Sidebar, Tabs, Card, Badge, Command, ContextMenu, Empty, …) and design tokens so the whole app reads as one tool. They stay app routes — the Toolcraft *canvas* runtime is for the single Studio design surface only, not a DAM grid/kanban.
2. **Air.inc-style Library.** Make the Library a robust DAM. v1 must-have (user pick): **boards + nested folders** (collections that nest, drag-between, breadcrumb nav, board tree sidebar). Parked for later: version stacking, AI auto-tag/smart search, custom metadata.
3. **Accounts + single source of truth, run in-house.** Replaces the GitHub-Pages-static + shared-Drive-folder plan. Backend = **Supabase** (cheapest path to auth + Postgres SSOT + file storage; free tier to start, self-hostable in-house later — same code). Frontend still deploys free (Pages) and calls Supabase from the browser. Sequenced **second**, after the two free frontend wins. Constraint: the agent cannot create/log into the user's Supabase project, so deliver integration code + SQL schema + setup guide behind a config seam; app stays in demo mode until the user adds project URL + anon key (2 env values). Storage cost note: hi-res photos are the cost driver → generate web-res derivatives for the app, keep originals separate.

Cost posture: start at $0 (Supabase free tier + Pages). Scale to ~$25/mo hosted or self-host storage (MinIO) when 1GB free storage fills.

---

## 1. Product architecture

Four surfaces, one shared data layer:

```
┌────────────────────────────────────────────────────────────┐
│  Top bar: project name · surface tabs · command palette ⌘K │
├──────────┬─────────────────────────────────────────────────┤
│ LIBRARY  │  assets grid · collections · review/comments    │
│ STUDIO   │  Toolcraft canvas · elements · formats · shuffle │
│ PLANNER  │  IG grid visualizer · story strip visualizer     │
│ QUEUE    │  export queue · naming preview · batch export    │
├──────────┴─────────────────────────────────────────────────┤
│  Data layer: project folder (File System Access API)       │
│  brand kit · assets + sidecars · comps · decks · queue     │
└────────────────────────────────────────────────────────────┘
```

- **Studio** is the Toolcraft runtime app (schema controls + `canvasContent` renderer + PNG export).
- **Library / Planner / Queue** are sibling routes sharing the app shell and data layer.
- Everything is keyboard-optional, plain-language, Swiss-styled.

## 2. Data layer (project folder on Drive)

```
ProjectFolder/
  brand/
    logos/*.svg|png
    fonts/*.woff2|otf          (Romie Regular, Romie Italic, …)
    brand.json                 (colors, text styles, spacing, naming convention)
  assets/
    originals/<renamed>.jpg    (never modified)
    .meta/<asset-id>.json      (tags, collection, status, focal point, comments[])
    .thumbs/<asset-id>.jpg     (generated thumbnails, regenerable cache)
  comps/<comp-id>.json         (elements, layout, formats, overrides, status, versions)
  decks/<deck-id>.json         (copy decks)
  planner/grid.json, stories.json
  queue.json
  exports/<batch>/<platform>/… (+ manifest.csv)
  studio.json                  (project-level settings, naming convention override)
```

**Sync-conflict strategy**: one small JSON per entity; writes are read-modify-write with `updatedAt` stamps; comments are append-keyed by `author+timestamp` so merges never lose data. Thumbnails/exports are regenerable and never fought over.

**Access layer** (`src/app/data/`): TypeScript module wrapping File System Access API — `openProject()`, persisted directory handle (IndexedDB), typed read/write per entity, in-memory store with change events, graceful "reconnect folder" flow. Browser support gate: Chrome/Edge; friendly page otherwise.

**Demo mode**: until a folder is opened, the app runs on an in-memory demo project (placeholder brand kit + sample images) so anyone can try it instantly — also our e2e test fixture.

## 3. Toolcraft mapping (Studio)

- `defineToolcraft` schema: format selector, grid controls, element inspector controls, Background section, Image Export section — per contract (`app-schema.ts`).
- `canvasContent`: the comp renderer — pure product output (DOM/SVG for text+images at canvas size; crisp text, exact font features).
- Canvas size = active format dimensions (e.g. 1080×1350); switching format issues canvas resize command.
- Sticky panel actions: `Add to queue`, `Export PNG`, `Shuffle`.
- Elements (heading/subhead/body/logo/image/divider) modeled in runtime state; selected element's controls appear in a contextual section (progressive disclosure — only 3–5 controls at once).
- Safe zones: per-format snap-region maps exclude platform UI areas; renderer shows safe-zone shading in preview only (never in export bytes).
- Renderer tech: DOM/CSS renderer inside canvas for live editing; export via SVG→canvas rasterization with embedded fonts (guarantees swash fidelity). Documented in `rendererPipeline`.

## 4. Typography engine

- `brand.json` text styles → locked presets: `{ font, weight, size-scale, case, letterSpacing, features }`.
- **Flourish**: per-character-range style runs inside a text element. Applying Flourish to a selection sets run `{ fontStyle: italic, features: { swsh: on, ss05: on } }`. One tap on selection; tap again to clear. Live preview.
- Special characters palette (approved set) inserted at caret.
- Fonts loaded via `FontFace` from brand kit; `font-feature-settings` for canvas; export path embeds the same features.

## 5. Multi-format model

- A comp = master layout (grid placements) + per-format overrides diff.
- Format definitions: IG post 1080×1350 & 1080×1080, IG story 1080×1920 (safe zones: top 250px, bottom 310px, side gutters), Pinterest 1000×1500, Shopify hero 2400×1000 + square 2048×2048. Central `formats.ts` registry — adding a format is data, not code.
- Image slots crop via focal point: cover-fit rectangle solved per format around the focal point.
- Grid: 6-col modular grid scaled per format; elements occupy grid regions; reflow = re-solve placements region-by-region with Swiss layout templates per aspect family.

## 6. Export pipeline

- Queue entries: `{ compId, formatIds[], copyVariant?, assetIds }`.
- Render each at full resolution offscreen → encode per target: JPEG (quality 88, sRGB) for IG/Pinterest, WebP + 2x for Shopify/web, PNG when transparency. Quality dial: highest vs platform-recommended.
- Naming: template string from `brand.json` (`{date}_{campaign}_{comp}_{platform}_{w}x{h}_v{n}`), folders per platform, `manifest.csv` per batch.
- Batch writes into `exports/<batch>/` in the project folder + zip download fallback.

## 7. UX patterns (beyond the ask)

1. **Command palette (⌘K)** — "add heading", "shuffle", "export queue", search assets/comps. Non-tech users get a search box, power users get speed. (cmdk already in deps.)
2. **Contextual inspector** — nothing selected: canvas-level controls; element selected: only its 3–5 controls. No permanent wall of options.
3. **Shuffle with locks 🎲** — dice button re-rolls layout within brand rules; padlock on any element pins it. Undo-safe.
4. **Grid planner drop-slots** — planned-but-unmade posts hold labeled placeholders so the team sees the content calendar shape in the grid.
5. **Kanban review board** — Library has a board view by status; drag card = change status.
6. **Duplicate-as-template** — any comp forkable in one click; "Start from…" gallery of approved past comps.
7. **Physics drag + satisfying export** — dnd-kit reorder with spring settle (motion), export completion moment with per-file tick-off.
8. **Teach-by-empty-state** — every empty surface shows a one-line "do this next" with the action button inline. No manual.
9. **Status pills everywhere** — the same colored status pill follows an asset from Library → Studio → Queue; approval state is never ambiguous.
10. **Zero-error exports** — impossible-by-construction safe zones, auto-scrim legibility, min-size enforcement, approved colors only.

## 8. Phases & acceptance

### Phase 0 — Foundation (shell, data, brand)
App shell + routes (Library/Studio/Planner/Queue), Swiss UI system, command palette shell, data layer with demo mode, brand kit loader + validator, display-name onboarding.
✔ App runs; demo project loads; brand kit folder parsed & validated; all four surfaces navigable.

### Phase 1 — Studio core
Toolcraft schema + comp renderer, element system (add/drag-reorder/select), modular grid + snapping, brand text styles, logo variant picker, image slots with focal-point crop, format switcher + hard safe zones, Flourish + special characters, PNG export of active format.
✔ Compose a comp in <2 min; swash one tap; format switch reflows; export matches canvas.

### Phase 2 — Library & review
Import + auto-rename + dedupe, thumbnails, collections/tags/favorites/search, focal point editor, statuses + pinned comments, kanban board view.
✔ Batch import 50 photos → renamed, browsable, taggable; comment pinned to a spot; status flows work.

### Phase 3 — Queue & multi-format export
Per-format overrides, queue surface, batch renderer + encoders, naming engine, manifest.csv, approval gate, zip fallback.
✔ Check 6 comps × 4 formats → one click → correctly named, foldered, encoded files + manifest.

### Phase 4 — Copy decks & matrix
Paste-list → deck, element↔deck binding, variant cycling, matrix generation (copy × images × formats → queue).
✔ 10-line paste → 10 variants; matrix of 10×3×4 lands in queue grouped.

### Phase 5 — Planner
IG grid visualizer (real grid + planned slots + drag reorder), story strip + device-frame playback with IG chrome, planner persistence.
✔ Grid preview matches IG proportions; story preview proves safe zones visually.

### Phase 6 — Shuffle & delight
Shuffle engine with locks, layout template gallery, micro-interactions, empty states, onboarding polish.
✔ Shuffle always yields on-brand, legible layouts; locks respected.

### Phase 7 — Hardening & delivery
Toolcraft acceptance matrix + browser tests + perf scenarios, `verify:final`, browser perf checkpoint, GitHub Pages deploy workflow, README for the team.
✔ `pnpm verify:final` green; Pages URL live; two-machine Drive sync sanity-tested.

## 9. Risks & mitigations

- **File System Access API support** → Chrome/Edge gate + demo mode fallback; document for team.
- **Drive sync latency for review** → metadata files are tiny (sync in seconds); UI shows "last synced" timestamps; no locking assumptions.
- **Font rendering fidelity in export** → single render path (same DOM→SVG→raster for preview snapshots and export); visual regression test on a swash string.
- **Toolcraft contract scope** (multi-surface app on a single-canvas template) → Studio strictly follows the runtime contract; sibling surfaces live in routes as schema-backed screens; acceptance matrix covers all visible entities.
- **Large libraries** → virtualized grids, thumbnail cache in `.thumbs/`, lazy decode.
