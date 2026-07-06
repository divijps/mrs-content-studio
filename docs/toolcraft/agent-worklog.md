# Implementation Worklog

This file records product decisions and the evidence behind them. Product: **Mrs Content Studio** — a fashion-brand content creation tool (see `docs/BRIEF.md` and `docs/BUILD_PLAN.md`).

## Status

Mode: product (in progress — Phase 0 of 7 complete; Studio schema still neutral starter until Phase 1)

Product name: Mrs Content Studio
Product summary: Compose on-brand social/web assets from a shared image library, with locked typography (Romie + one-tap swashes), multi-format layouts with hard safe zones, review/approval workflow, and batch export.
Requested behavior: See `docs/BRIEF.md` (user-approved brief) — four surfaces: Library, Studio (Toolcraft canvas), Planner, Queue.

## Required-skills note

This environment does not support Codex skills (`pnpm ai:check` routing). The required `brainstorming` and `writing-plans` outputs exist as user-approved equivalents: `docs/BRIEF.md` (product spec, user-refined via Q&A) and `docs/BUILD_PLAN.md` (deterministic implementation plan). `systematic-debugging` and browser verification are followed as process; browser checks use the agent-controlled preview browser.

## Decision Trail

### Iteration 1 — Phase 0 foundation: shell, routes, data layer, brand kit

- Request: Build the Mrs Content Studio per docs/BRIEF.md; Phase 0 of docs/BUILD_PLAN.md.
- Task type: App assembly / route structure.
- User-visible result: Four-surface app shell (Library / Studio / Planner / Queue) with top nav, queue badge, project + display-name chips. Library shows demo assets with status pills and collection filters. Studio renders the untouched neutral Toolcraft starter. Planner/Queue show teach-by-empty-state copy.
- Source/reference checked: `AGENTS.md`, `docs/toolcraft/workflow.md`, `assembly-workflow.md`, `schema-reference.md`, `component-rules.md`, `decision-contract.md`, `renderer-technique.md`.
- Reference inputs: none (no Figma/video references).
- Contract rules applied: `runtime-shell-required` (Studio route renders `ToolcraftApp` directly; sibling non-canvas surfaces are separate routes composing app screens, not runtime surfaces), starter stays neutral until product schema lands (Phase 1).
- Decision: Shared data layer in `src/app/data/` — `types.ts` (entities), `formats.ts` (platform registry with hard safe zones), `demo-project.ts` (deterministic in-memory fixture), `project-store.ts` (useSyncExternalStore-based store; folder persistence backend lands in Phase 2). Demo mode is also the future e2e fixture.
- Alternatives rejected: putting Library/Planner/Queue inside the Toolcraft controls panel (violates canvas/controls contract and product ergonomics); external state library (unneeded dependency).
- State/output mapping: store snapshot → all four surfaces via `useProject()`; Toolcraft runtime state untouched this phase.
- Files changed: `src/app/data/*`, `src/app/shell/app-shell.tsx`, `src/app/surfaces/*`, `src/routes/root.tsx`, `src/routes/index.tsx` (className only), `docs/BRIEF.md`, `docs/BUILD_PLAN.md`.
- Verification: Tier 2 — `pnpm typecheck` pass; agent-browser smoke on all four routes (Studio runtime app 1024px shell with canvas + Setup controls present; Library renders 6 demo assets with statuses; Planner/Queue empty states). Preview panel is narrower than Toolcraft's 1024px min-width, so structural DOM checks were used alongside screenshots.
- Skipped checks: `pnpm verify:quick`/browser acceptance suites — product schema and acceptance rows do not exist yet (Phase 1); acceptance file intentionally still `mode: "starter"` until the Studio schema becomes product.
- Risks: acceptance/perf matrices must be rewritten in Phase 1+; File System Access API backend still stubbed (demo mode only).

### Iteration 2 — Phase 1 Studio core: schema, SVG renderer, Flourish, formats, export

- Request: "keep going" — implement Phase 1 of docs/BUILD_PLAN.md (Studio core).
- Task type: Schema/controls + custom renderer + export.
- User-visible result: Studio composes a comp from guided sections (Format, Layout+Shuffle, Image, Heading with Flourish word chips, Subheading, Body, Logo picker, Background, Image Export) rendered live on canvas at platform-native size with hard safe-zone guides; Export PNG produces correctly named brand files (e.g. `20260703_studio_summer-arrives-quietly_instagram_3277x4096_v1.png`); Add to Queue snapshots the comp into the shared project queue.
- Source/reference checked: all local Toolcraft contract docs (workflow, assembly, schema-reference, component-rules, custom-controls, acceptance-testing, performance, renderer-technique, decision-contract); runtime source for `canvas.setSize`, `controls.setValue`, panel action context, custom control renderer API, export helpers.
- Reference inputs: None (brand assets from /brand are product inputs, not design references).
- Docs/contracts read: as above.
- Contract rules applied: `runtime-shell-required`, `canvas-no-app-ui` (renderer emits product SVG only; safe-zone shading is a textless preview-only overlay excluded from export), `controls-product-coverage` (sections by product entity; inventory pending with acceptance matrix), Background + Image Export section requirements, still-output `Export PNG` with `icon: "upload-simple"`, async panel action returns real Promise with `reportProgress`.
- Decision: **Pure-SVG comp architecture.** One `buildCompSvg` output is BOTH the live preview (inline SVG) and the export source (serialized with @font-face data URIs → Image → canvas). Line wrapping measured against hidden DOM with real fonts (`measureTextBlock`), so SVG breaks match browser text layout; flourish runs are `tspan`s with `swsh/ss05/salt` features.
- Alternatives rejected: (1) HTML + SVG foreignObject rasterization — **fails**: this environment's engine taints the canvas for ANY foreignObject content (verified empirically: plain-text foreignObject → tainted; see systematic-debugging note below). (2) Canvas 2D text export — cannot express OpenType swash features. (3) Separate DOM preview + SVG export — parity drift risk; rejected for single-artifact architecture.
- State/output mapping: schema targets (`format.*`, `layout.*`, `image.*`, `heading.*`, `subhead.*`, `body.*`, `logo.*`, `appearance.background`, `export.*`) → `readStudioValues(state.values)` → `buildCompSvg` → canvas slot innerHTML; `format.active` → `canvas.setSize` command (users can still override in Setup; comp scales to canvas); panel actions: `export-png` → renderStudioExport (SVG→raster→toBlob→download, progress reported), `add-to-queue` → project store comp+queue entry, `shuffle-layout` → batched `controls.setValue` within SHUFFLE_SPACE (approved pairings only).
- Files changed: `src/app/app-schema.ts`, `src/app/studio/{comp-layout.ts,comp-svg.ts,comp-renderer.tsx,flourish-control.tsx,export.ts,studio-actions.ts}`, `src/routes/index.tsx`, `src/app/shell/app-shell.tsx` (Toaster), `.claude/skills/*` (required workflow skills installed → `pnpm ai:check` passes).
- Verification: Tier 3 — `pnpm typecheck` pass; agent-browser: comp renders (texts/images/flourish tspans present), format switch IG Post→Story resizes canvas 1080×1920 with 4 safe-zone regions and reflowed layout inside them, Export PNG produced real decodable bytes 3277×4096 PNG with convention filename, screenshots confirm Romie swash rendering in preview.
- Skipped checks: acceptance matrix + performance scenarios + automated/browser test suites — scheduled as the immediate next pass (Phase 7 hardening pulls earlier if needed); `pnpm test` acceptance validator expected red until that matrix lands. Recorded intentionally; app is functional but NOT final-delivered.
- Risks: taint behavior differs per engine (foreignObject tainted here) — pure-SVG path is engine-independent, keep it; baseline ascent approximation (0.78em) is self-consistent between preview/export but should be replaced with measured baselines if a brand font misaligns; logo SVGs on 4096² canvases render with padding (tight-crop pass pending); duplicate panel DOM ("controls" + "properties") observed — investigate double action dispatch in browser test pass.

### Iteration 3 — Layout controls, locked formats, white logos, Swiss type tightening

- Request: User feedback — remove aspect-ratio controls (formats are locked to the registry), add advanced layout controls (alignment, positioning, ordering), render logo SVGs consistently white and bigger, tighten Rework tracking, give all texts 3 size options and line-spacing control under Swiss typographic rules.
- Task type: Schema/controls + renderer feature.
- User-visible result: Setup shows only settings transfer (no canvas size editing); Layout gains Order (image/text leads) + Text position (Auto/Top/Middle/Bottom); new Typography section with Leading (Tight/Normal/Airy); Heading/Subheading/Body each gain Size (S/M/L on a 0.78/1/1.28 modular scale) and Align (Left/Center/Right); Logo gains Size + 9-point anchor Position, renders always-white at 1.55× previous base size with top/bottom band reservation so text never collides; brand type styles tightened (display lh 0.98/ls −0.018em, caps lh 1.02/ls 0.045em, Rework subhead ls 0.16→0.05em lh 1.15, body lh 1.38).
- Source/reference checked: anchorGrid control source (`AnchorGridValue` strings), sizing modes in schema types.
- Reference inputs: None.
- Docs/contracts read: previously read set (component-rules segmented limits re-checked: all new segmented controls ≤4 options, ≤9 chars/label, ≤24 total).
- Contract rules applied: `controls-layout-heuristics` (segmented for compact modes), `visibleWhen` for element branches; **escape hatch**: `fixed-output` canvas sizing on a product app — explicit user request ("aspect ratio is not needed as we are going to stick to the set formats", 2026-07-03) overrides the editable-output default; Format select owns canvas size via `canvas.setSize`.
- Decision: Per-element Size/Align + global Leading (not per-element leading) keeps the guided feel; logo anchor replaces per-pattern logo placement, with band reservation (top/bottom anchors shrink the content region) to guarantee no overlap; `layout.order` hidden while Bleed is on (`visibleWhen image.bleed=false`) since bleed has no stacking.
- Alternatives rejected: free x/y positioning (vector pads) — breaks guided/on-brand-by-construction promise; per-element leading — too many decisions; fontPicker — typography must stay brand-locked, not free-font.
- State/output mapping: new targets `layout.order`, `layout.textPosition`, `type.leading`, `{heading,subhead,body}.{size,align}`, `logo.{size,anchor}` → readStudioValues → buildCompSvg zones (reserved logo bands → region → pattern zones → placeStackInZone); Shuffle now also rolls textPosition + logo anchor.
- Files changed: `src/app/studio/{comp-layout.ts,comp-svg.ts,studio-actions.ts}`, `src/app/app-schema.ts`, `src/app/data/brand-kit.ts`.
- Verification: Tier 3 — `pnpm typecheck` pass; agent-browser: aspect controls absent, all new controls render; Size M→L changes SVG font-size 113.4→145.2 (×1.28), Align center moves text-anchor to middle at x=540, anchor Top-Right places logo at (929,59); SVG line width exactly matches DOM measurement (952px = 952px); export re-verified — 3277×4096 PNG with pure-white (255,255,255) logo pixels proving the invert filter survives rasterization; adversarial multi-agent review workflow run over the change set.
- Skipped checks: acceptance matrix still pending (tracked); full perf suite not run (non-performance edit, first-working checkpoint still ahead).
- Risks: white logos are near-invisible on light backgrounds by design (user decision — flagged back); `fixed-output` will need the acceptance `canvasSizingCoverage` escape-hatch documentation in the matrix pass.

### Iteration 4 — Fit guardrails, white-logo rewrite, undo/format fixes (post-review)

- Request: continuation of Iteration 3 after an adversarial multi-agent review (23 agents) surfaced defects.
- Task type: renderer correctness + state fixes.
- Confirmed findings fixed:
  1. **Text overflow / overprint** (high): text stacks could exceed their zone at large formats (e.g. Shopify Hero 2400×1000 + heading L + airy), painting over the logo/image and past the canvas. Fix: `ensureTextFits` in comp-svg.ts — when a stack exceeds its budget, the whole type scale steps down together (hierarchy preserved, floor `MIN_TEXT_SCALE` 0.55), re-measuring wraps. Verified: hero+L case max text baseline 750 on a 1000px canvas (was 1039, off-canvas).
  2. **Edge pattern text over photo** (high): edge text zone ignored the corner image rect; top/middle positions painted dark text on the photo with no scrim. Fix: edge text zone now starts below the corner image.
  3. **Logo renders black in Safari** (high): CSS `filter:invert(1)` on SVG `<image>` is silently dropped by WebKit in SVG-as-image export (empirically confirmed by a verifier). Fix: `logo-white.ts` rewrites each logo's SVG source at startup — fills/strokes recolored white, viewBox tightened to the real content bbox (raw files were on 4096² canvases with margins) — so marks are genuinely white artwork, no filter. Wired via `getWhiteLogoBrand` in the app shell → `setBrand`.
  4. **Shuffle = 8 undo entries** (medium): shuffle dispatched 8 setValue without `history: "merge"`, so one shuffle took 8 undos to reverse. Fix: merge under a unique history group → one undo per shuffle.
  5. **Format/canvas undo desync** (medium): undoing a format change left canvas size stale. Fix: `useFormatCanvasSync` now continuously reconciles canvas size to the active format (reads canvas size in deps), so undo of the format select re-syncs the canvas.
  6. **Text-position ignored in banded/portrait-split** (medium): those branches used raw placeStack. Fix: both now route through `placeStackInZone(resolveTextPosition(...))`.
  7. **Banded/split ghost gaps with elements excluded** (medium): unconditional gap/offset math when heading or image absent. Fix: branches filter `includedKeys` (include AND non-empty text) and gate gaps on presence.
  8. **Bleed silently overrode text color** — kept intentionally (legibility) but now disclosed in the Bleed control description.
- Findings refuted (no change): studioValuesToComp partial snapshot (not user-visible yet — queue render comes in Phase 3), measurement/emit precision mismatches (don't affect wrapping since SVG emits pre-measured lines), unescaped attributes (all values constrained: upload disabled, colors from fixed palette).
- Verification: Tier 3 — `pnpm typecheck` pass; agent-browser clean-room (cleared localStorage) confirms defaults (logo bottom-left M, Normal leading, Left align); hero+L text fits on-canvas; logo href is white tight-cropped data URI with no filter; Setup shows no aspect/size controls (fixed-output).
- Files changed: `src/app/studio/{comp-svg.ts,comp-renderer.tsx,studio-actions.ts,logo-white.ts}`, `src/app/data/project-store.ts` (setBrand), `src/app/shell/app-shell.tsx` (startup whitening), `src/app/app-schema.ts` (bleed description).
- Skipped checks: acceptance matrix + full perf still pending (tracked for Phase 7).
- Risks: `ensureTextFits` two-pass scaling can under-shoot on pathological wrap changes — floor prevents illegible output; revisit with a binary search if a real case misses.

### Iteration 5 — Phase 2 Library: import, organize, review workflow

- Request: "keep going" — Phase 2 of docs/BUILD_PLAN.md.
- Task type: App surface (route screen), not Toolcraft canvas — Library is a sibling route outside the runtime shell, so no schema/canvas contract applies here.
- User-visible result: Library gains drag-and-drop / picker **import** (auto-rename to `{date}_{campaign}_{###}`, dedupe by content fingerprint, dimension read, non-images skipped, toast summary); **collections** (filter chips + create); **search** across name/tags/filename; **favorites**; a **grid view** and a **review board** (kanban by status, drag card between columns to change status); an **asset detail drawer** with a click/drag **focal-point editor**, **pinned comments** (click image to drop a numbered pin, resolve/reopen, author + relative time), **status** control, **collection** reassignment, and **tag** editing.
- Source/reference checked: existing project store + types; kit `Button`, `Toaster`.
- Reference inputs: None.
- Docs/contracts read: n/a for the runtime contract (non-canvas route); followed the shared data-layer pattern from Phase 0.
- Decision: keep all state in the project store (new mutations: addAssets, toggleAssetFavorite, setAssetTags, setAssetCollection, setAssetFocalPoint, resolveAssetComment, addCollection); import reads files to object URLs (originals never modified) and dedupes on `name:size:lastModified`; native HTML5 drag for the kanban (lighter than dnd-kit for 4 fixed columns).
- Alternatives rejected: File System Access API folder backend — deferred (demo/in-memory still the source of truth until the Drive-folder connect flow lands); dnd-kit for kanban — overkill for status columns.
- State/output mapping: store → `useProject()` → Library grid/board/detail; focal point written here is consumed by `coverImageSvg` crops in the Studio, closing the loop.
- Files changed: `src/app/data/{types.ts,project-store.ts,import-assets.ts}`, `src/app/library/{status-pill.tsx,focal-point-editor.tsx,asset-detail.tsx,kanban-board.tsx}`, `src/app/surfaces/library-screen.tsx`.
- Verification: Tier 2 — `pnpm typecheck` pass; agent-browser: 6 demo assets render; opened detail, set focal point to 30%/25%, pinned a comment ("Crop tighter on the sleeve") and saw it listed, set status Approved (reflected on card); board groups 4/1/0/1 by status; imported 2 generated PNGs → renamed `20260703_import_001/002`, re-import deduped ("0 imported · 1 duplicate skipped").
- Skipped checks: acceptance matrix/perf (Phase 7); File System Access persistence (deferred).
- Risks: object URLs are session-scoped (lost on reload) — fine for demo mode; the Drive-folder backend will replace them. Focal point + comments are per-asset and already flow into Studio crops.

### Iteration 6 — Phase 3 Queue: multi-format batch export pipeline

- Request: "continue" — Phase 3 of docs/BUILD_PLAN.md (the export payoff).
- Task type: export pipeline + route screen (non-canvas surface).
- User-visible result: Queue shows each comp with a live SVG thumbnail, per-item **format toggle chips** (pick any of the 6 platform sizes per comp), a **campaign** field, a **Platform/Highest** quality dial, and an **Approved-only** gate. "Export all" renders every comp × format, encodes to each platform's spec, and downloads ONE ZIP: platform subfolders + convention filenames + `manifest.csv`, with a determinate progress bar.
- Source/reference checked: existing export.ts render path, formats registry.
- Reference inputs: None.
- Decision: (1) store a flat `sourceValues` snapshot on each Comp so any format re-renders via `buildCompSvg` (avoids Comp-elements↔StudioValues round-trip); (2) dependency-free ZIP writer (STORE + CRC32) since images are already compressed — folders + manifest with zero new deps; (3) export at platform-native pixel size (×2 for Shopify retina / everywhere on "Highest"), not Toolcraft 2K/4K/8K, because social platforms want native dimensions; (4) encode per `format.encoding` — JPEG for IG/Pinterest, WebP for Shopify.
- Alternatives rejected: adding jszip/file-saver (unnecessary deps); File System Access `showDirectoryPicker` to write real folders (Chromium-only, worse fallback than a universal ZIP); reusing `createToolcraftPngExportCanvas` for batch (tied to Toolcraft state resolution) — extracted a shared `renderCompCanvas`/`encodeCanvas` core instead.
- State/output mapping: store queue + comps → `runBatchExport` → per-job `renderCompCanvas`(SVG raster at native×scale) → `encodeCanvas`(mime+quality) → `createZip` entries under `platform/` + `manifest.csv` → download.
- Files changed: `src/app/data/{types.ts,project-store.ts}` (sourceValues, toggleQueueItemFormat), `src/app/studio/{export.ts (shared core + applyNamingTemplate),zip.ts,batch-export.ts}`, `src/app/studio/studio-actions.ts` (snapshot), `src/app/surfaces/queue-screen.tsx`.
- Bug found + fixed during verification: two queued comps with the same heading resolved to identical ZIP paths (second silently overwrote first). Fix: version counter keyed on the fully-resolved filename (index fixed at 1), so collisions get v1/v2/…. Re-verified: paths unique.
- Verification: Tier 2/3 — `pnpm typecheck` pass; agent-browser end-to-end: queued 2 comps, toggled Pinterest+Shopify onto item 1, exported → parsed the real ZIP central directory: 5 entries in `instagram/`, `pinterest/`, `shopify/` folders + `manifest.csv`; decoded each image blob to confirm true dimensions (IG 1080×1350 JPEG, Pinterest 1000×1500 JPEG, Shopify 2048×2048 WebP) and unique paths (`_v1`/`_v2`); manifest CSV has all 8 columns per row.
- Skipped checks: acceptance matrix/perf (Phase 7).
- Risks: STORE-method ZIP is uncompressed (fine — payload is already-compressed images); very large batches render sequentially on the main thread (acceptable for typical batch sizes; a worker/queue is a later optimization).

### Iteration 7 — Phase 4 Copy decks & matrix generation

- Request: "continue" — Phase 4 of docs/BUILD_PLAN.md.
- Task type: product feature (bulk action + modal) launched from a Toolcraft sticky panel action.
- User-visible result: a new **Variations** sticky action opens a matrix modal. Paste a bullet list (or pick a saved deck), choose whether the lines fill Heading or Subheading, multi-select library images, multi-select formats → live "N copy × M images × F formats = X files" count → **Generate & queue** fans out one comp per (copy × image), names each by its line, queues them across the chosen formats, optionally saves the pasted list as a reusable deck, and jumps to the Queue.
- Source/reference checked: Phase 3 queue/store, existing addDeck.
- Reference inputs: None.
- Contract rules applied: `panelActions` for the Generate action (3 actions now — Variations/Add to Queue/Export PNG; export stays primary). The modal is app-level UI opened by a panel action setting route state — not a canvas/control surface, so no `canvas-no-app-ui` conflict.
- Decision: reuse `studioValuesToComp` + the Phase 3 queue path so matrix output flows through the exact same batch export (copy decks are "just data" feeding the same pipeline); bullet markers (`-`, `•`, `*`) stripped on paste; empty selections fall back to the base comp's current image/format.
- Alternatives rejected: schema-driven deck/line selects (schema options are static; decks are user-created and dynamic — fragile); a separate decks route (the composer is where copy is applied, per the brief).
- State/output mapping: modal state → `generateVariations({base, variants, applyTo, assetIds, formatIds})` → per-combo `studioValuesToComp` → upsertComp + addToQueue → Queue surface → batch export.
- Files changed: `src/app/studio/{studio-actions.ts (generateVariations),variations-modal.tsx}`, `src/app/app-schema.ts` (Variations action), `src/routes/index.tsx` (modal state + navigate on generate).
- Verification: Tier 2 — `pnpm typecheck` pass; agent-browser: opened Variations, pasted 3 lines (2 with bullet markers, stripped), selected 2 images + IG/Pinterest → count read "12 files"; Generate produced 6 queue comps each named by its copy line ("Summer arrives quietly" ×2, "Linen for the long light" ×2, "Cut for warm evenings" ×2), toast "6 variations → 12 files queued", auto-navigated to Queue; screenshot confirms distinct copy rendered per thumbnail.
- Skipped checks: acceptance matrix/perf (Phase 7).
- Risks: same copy line on two different images resolves to the same filename base → distinguished only by v1/v2 version suffix (manifest doesn't record which image). Acceptable; a future naming token for image/index would make it explicit.

### Iteration 8 — Phase 5 Planner: IG grid + story visualizers

- Request: "continue" — Phase 5 of docs/BUILD_PLAN.md.
- Task type: product surface (non-canvas route).
- User-visible result: Planner has a source rail (Comps | Photos), a **Feed grid** view (IG profile header + 3-column square grid, comps/photos cover-cropped like IG center-crops posts, drag tiles to reorder, hover ✕ to remove, "+ Placeholder" for planned-but-unmade posts), and a **Stories** view (a phone frame with real IG chrome — segmented progress bar one-per-story, avatar + "mrs · now", "Send message" reply bar; tap edges to step; a reorderable story strip below). A "Safe zones" toggle shades the story's top/bottom/side UI regions, proving the export safe-zone guarantee visually.
- Source/reference checked: formats registry safe zones; existing SlotVisual/comp-svg.
- Reference inputs: None (IG chrome rebuilt from general platform knowledge, not a pixel reference).
- Decision: reuse `buildCompSvg` for tiles via a shared `SlotVisual` that injects the SVG with `preserveAspectRatio="xMidYMid slice"` + width/height 100% so it cover-crops to any tile ratio (square feed, 9:16 story) — matches IG's center-crop; assets render via `object-fit:cover` at their focal point; empty slots show a labelled placeholder.
- Alternatives rejected: transform-scale tile rendering (fragile, needs per-tile measurement) — replaced with viewBox+preserveAspectRatio which scales natively; dnd-kit (native HTML5 drag suffices for reorder).
- State/output mapping: planner store slots (gridSlots/storySlots with compId|assetId|label) → SlotVisual/StoryPreview; new store actions addPlannerGridSlot/addPlannerStorySlot/removePlannerSlot/reorderPlannerSlots/addPlannerPlaceholder.
- Files changed: `src/app/data/project-store.ts` (planner actions + PlannerGridSlot import), `src/app/planner/{slot-visual.tsx,story-preview.tsx}`, `src/app/surfaces/planner-screen.tsx`.
- Verification: Tier 2 — `pnpm typecheck` pass; agent-browser: added 6 grid tiles (1 comp + 5 photos, "6 posts planned", 7 visuals rendered), switched to Stories, added 3 → phone shows 3 progress segments, reply bar, handle, 2 safe-zone shade bands, 3-thumb strip; screenshots confirm both views with the comp cover-cropped into the square grid.
- Skipped checks: acceptance matrix/perf (Phase 7).
- Risks: planner slots reference comp/asset ids; if a referenced comp/asset is deleted the slot shows its placeholder (graceful). IG chrome is an approximation of the current app, not a locked visual reference.

### Iteration 9 — v2 Direction: Air-style Library on the Toolcraft kit (boards + nested folders)

- Request: user feedback — Library/Planner/Queue drift from Toolcraft standards; make the Library a robust Air.inc-style DAM; and (bigger) add accounts + single source of truth run in-house. Decisions locked via Q&A: unify on the Toolcraft UI kit + tokens (keep as routes, canvas runtime is Studio-only); Air v1 = boards + nested folders (version-stacking/AI-tag/metadata parked); backend = Supabase cloud free tier, sequenced second; frontend wins first. Recorded in docs/BUILD_PLAN.md "Direction v2".
- Task type: product surface rebuild on the kit + data-model change (nested boards).
- User-visible result (this pass): Library rebuilt as an Air-style DAM — left **board tree sidebar** (All assets, ★ Favorites, nested boards with descendant-inclusive counts, add board / add sub-board), **breadcrumb** ancestor nav, kit toolbar (Input search, ToggleGroup grid/board, Import), **masonry grid** (CSS columns, aspect-accurate cards with hover overlay + status Badge + favorite), **drag a card onto a board** to refile it, kit **Empty** states. Status pills now use the kit **Badge**.
- Contract note: sibling routes stay React (not canvas surfaces) per the decision; unify by consuming `@/toolcraft/ui` (Badge, Breadcrumb, Button, Empty, Input, ToggleGroup, Separator) + tokens.
- Decision: evolve `Collection` with `parentId` for nesting (least-invasive vs a new Board entity); board view is descendant-inclusive; delete reparents children to grandparent and unfiles assets; cycle-guard on move.
- Files changed: `src/app/data/{types.ts,demo-project.ts,project-store.ts}` (nested board CRUD: addCollection(parentId)/rename/move/delete), `src/app/library/{status-pill.tsx (Badge),boards-tree.tsx (new)}`, `src/app/surfaces/library-screen.tsx` (rebuilt).
- Verification: Tier 2 — `pnpm typecheck` pass; agent-browser: sidebar shows July drop(6)→BTS(2) nesting, breadcrumb builds "All assets › July drop › BTS", board scopes to 2 assets, Favorites filters to 1, masonry renders 6 aspect-varied cards, detail drawer opens; live DOM has 0 button-in-button (stale console errors were pre-rebuild).
- Skipped checks: acceptance matrix/perf (deferred); AssetDetail drawer still partly hand-styled (reskin folded into next pass); Planner/Queue kit reskin = next; Supabase = after.
- Risks: nested-board depth is unbounded (fine for a small team); drag-to-board has no visual drop feedback on the card side yet (sidebar rows do highlight).

### Iteration 10 — Air screenshots parity + bleed-first + live library→Studio pipeline

- Request: user shared Air (Blueland workspace) screenshots as the Library reference and two directives: (1) library assets must feed the Studio layout options; (2) bleed is the house style — keep non-bleed as a separate option.
- Task type: Studio schema/value change + custom control + Library viewer/toolbar rebuild.
- User-visible result:
  - **Bleed-first**: Image section now has a Style segmented (Bleed default / Framed). Bleed = photo fills the canvas with auto scrim; Framed keeps the pattern box. Order gated to Framed; Pattern stays visible (drives text-only comps too).
  - **Live library-fed picker**: `libraryImage` custom control replaces the static imagePicker for `image.assetId` — reads the project store live, focal-point-aware thumbs, approved-dot. Verified: importing a photo in the Library makes it appear in the Studio picker instantly (6→7).
  - **Air-style fullscreen asset viewer** (replaces the drawer): breadcrumb path, dark stage, bottom Focal point/Comment tool toggles, right Info/Comments Tabs panel (kit Tabs/Badge/Input/Button) with ext badge + dimensions + file size, status badges, board select (full path names), tags, provenance line, Esc to close.
  - **Air toolbar bits**: +Add DropdownMenu (File upload / Folder upload / Add board-or-sub-board), board header row (title + "N assets · X MB" via new `sizeBytes` captured on import), sort select (Newest/Oldest/Name).
- Reference inputs: 5 Air.inc screenshots (Blueland workspace: board view w/ banner+counts, +Add menu, video viewer w/ comments, kanban by status, image info panel w/ custom fields + smart tags).
- Decision: keep `StudioValues.imageBleed` boolean internally; new `image.style` target maps bleed/framed in `readStudioValues` (old snapshots with `image.bleed` still read correctly). Custom control justified: built-in imagePicker items are static schema data; the library is a living collection (builtInFitCheck to be recorded in the acceptance matrix).
- Parked from screenshots (per earlier scope call): version stacking (V1/V2 badges), custom fields (Rating/Usage rights), AI Summary & Smart Tags, Collect Content/Dropbox-Box-Drive import, board banner images, saved views.
- Files changed: `src/app/studio/{comp-layout.ts,library-image-control.tsx (new)}`, `src/app/app-schema.ts`, `src/routes/index.tsx`, `src/app/library/asset-detail.tsx` (fullscreen rebuild), `src/app/surfaces/library-screen.tsx` (+Add menu, header, sort), `src/app/data/{types.ts,import-assets.ts}` (sizeBytes).
- Verification: Tier 2/3 — `pnpm typecheck` pass; agent-browser clean-room: Bleed selected by default with scrim gradient in the SVG; Library import → Studio picker gained the new thumb (6→7); viewer opens with Info/Comments tabs, real metadata (PNG · 900×1200 · 25 KB), status/board/tags; board header shows count; screenshot matches the Air reference structure.
- Risks: folder upload uses non-standard `webkitdirectory` (fine in Chrome/Edge — our support target); bleed-first makes the bleed color-override guardrail the common path (colors switch to Bone over photos — disclosed in the control description).

### Iteration 11 — Air-competitive Library: bulk ops, cross-surface asset use, Studio persistence

- Request: "continue building until we have something that can compete with Air on library management + using assets across the platform."
- Task type: Library feature pass + store bulk ops + Studio persistence + cross-surface intent.
- User-visible result:
  - **Multi-select + bulk bar**: hover check on every card (always visible while a selection exists); floating bulk bar with count, Select-all, bulk Status, bulk Move-to-board (full nested paths), bulk Tag, bulk Favorite, single-select Use in Studio, bulk Send-to-Planner (feed grid / stories), bulk Delete (confirmed), Clear.
  - **Context menu on every card** (kit ContextMenu): Open, Use in Studio, Send to feed grid / stories, Move to board, Favorite, Delete.
  - **Cross-surface asset use**: "Use in Studio" from card menu, bulk bar, or the viewer — sets the image on the Studio canvas and navigates there (transient intent consumed by CompRenderer, merged undo entry).
  - **Viewer upgrades**: ← → navigation through the current filtered set (buttons + arrow keys), Download original, Use in Studio primary action.
  - **Filters**: status filter joins sort in the board header.
  - **Studio persistence**: schema `persistence` (localStorage, values/canvas/panels) — the comp finally survives tab switches and reloads; this is what makes cross-surface workflows viable.
  - Store: `deleteAssets` (also prunes planner slots), single-emit `bulkSetAssetStatus/Collection/Favorite`, `bulkAddAssetTag`, `requestStudioImage`/`consumeStudioImage`.
- Bug found + fixed during verification: Base UI requires Menu labels inside `Menu.Group` — bare `ContextMenuLabel`/`DropdownMenuLabel` crashed the whole Library route into the error boundary the first time a menu rendered. Wrapped in `ContextMenuGroup`/`DropdownMenuGroup`; verified both menus open with all items and the route survives.
- Verification: Tier 2/3 — `pnpm typecheck`; agent-browser end-to-end: selected 3 → bulk Approved (toast "3 → Approved"), bulk sent 3 to Planner grid (3 tiles confirmed on Planner), viewer arrow nav (_001→_002), Use in Studio navigated with the exact asset selected in the picker (julydrop_002), heading edit survived a Library round-trip ("Persistence survives tabs" re-rendered on canvas), context menu shows 9 items incl. nested board paths, +Add menu opens cleanly; screenshot shows the full DAM shell with active selection + bulk bar.
- Files changed: `src/app/data/project-store.ts`, `src/app/app-schema.ts` (persistence), `src/app/studio/comp-renderer.tsx` (intent consumer), `src/app/surfaces/library-screen.tsx`, `src/app/library/asset-detail.tsx`.
- Skipped checks: acceptance matrix/perf (Phase 7); persistence reload acceptance row to be added there (`persistenceCoverage: "reload"` now REQUIRED by contract since persistence is on).
- Risks: single-file deletes are irreversible (no trash/Recently-deleted yet — natural Supabase-era feature); synthetic right-click works, real right-click assumed equivalent.

### Iteration 12 — Designer-mode elements, traffic-light status, upload progress

- Request: (1) robust multi-upload; (2) traffic-light circle icons for asset status ("simpler/sleeker"); (3) designer-mode "add a component" flow — components (headline, subhead, …, plus divider and button/CTA) appear when added, their controls pop up, and they reorder like a to-do list by drag.
- Task type: schema/controls + custom control + renderer feature + Library polish.
- User-visible result:
  - **Elements section** (new, top of panel): draggable rows for the flow stack (⠿ handle, ✕ remove), a pinned "anchored" row for the Logo, and a "+ Add element" menu (Headline / Subheading / Body copy / Button / Divider / Logo). Adding a component makes its control section appear; removing hides it. The per-section Include switches are gone — the panel only shows what's on the canvas.
  - **New element kinds**: **Button/CTA** (Text, Style Outline/Filled/Underline, Size S/M/L, Align, Color — Rework Micro caps label, auto-contrast label on Filled) and **Divider** (Weight Hairline/Regular/Bold, Length Full/Short, Color). Both render in preview AND export (pure SVG), scale with the fit guardrail, and force Bone on bleed like text.
  - **Reorder** drives the canvas: `elements.order` is the flow stack order (verified: dragging Button above Headline puts the CTA box above the headline in the SVG).
  - **Traffic-light StatusDot** replaces text pills everywhere (library cards on-image with ring, viewer footer + label, queue + label): draft gray / in-review amber / changes-requested red / approved green. Old StatusPill deleted.
  - **Upload progress**: `importFiles` reports per-file progress; batches >4 files show a live "Importing N/M…" toast that resolves into the summary.
- Decision: element list is a custom control (`elementList`) — value model is an ordered heterogeneous list whose rows toggle sibling-section visibility; collectionActions owns homogeneous item lists and can't express that or pinned non-flow rows (builtInFitCheck for the matrix pass). Include targets lost their schema defaults with the switches removed → the control materializes them once on mount with `history: "skip"` (state normalization, not a user edit). Old snapshots without `elements.order` derive order from include flags (backward compatible).
- comp-svg: flow generalized from TextKey to FlowKind — `blockHeight`/`stackHeight` over ordered kinds, CTA measured via canvas measureText (letterSpacing-aware with fallback), banded = first element band + rest, portrait split = elements before body / body+after bookend.
- Bug found + fixed during verification: drop handler read the dragged id from React state which hasn't flushed for same-tick event sequences; now the id also rides in `dataTransfer` with a state fallback (robust for real drags AND automation).
- Verification: Tier 3 — `pnpm typecheck`; agent-browser clean room: default rows Headline+Subheading + anchored Logo; Button/Divider added via menu → sections popped up, "SHOP NOW" outline box rendered on canvas; drag Button above Headline → list AND canvas order changed (CTA y < headline y); ✕ removed Divider → section gone; Library shows 6 status dots in 3 colors; screenshot: bleed comp with reordered CTA above flourished headline.
- Files changed: `src/app/library/status-dot.tsx` (new; status-pill.tsx deleted), `src/app/data/import-assets.ts`, `src/app/surfaces/{library-screen.tsx,queue-screen.tsx}`, `src/app/library/asset-detail.tsx`, `src/app/studio/{comp-layout.ts,comp-svg.ts,element-list-control.tsx (new)}`, `src/app/app-schema.ts`, `src/routes/index.tsx`.
- Risks: element list add/remove writes both `elements.order` and include flags — undo restores them together only for the merged group; CTA width uses canvas measureText which may drift ~1px from SVG rendering (box padding absorbs it).

### Iteration 13 — Supabase team workspace (accounts + single source of truth)

- Request: "continue building" — v2 item 3: accounts, SSOT, run in-house.
- Task type: backend integration behind a config seam (non-canvas).
- User-visible result: with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set, the app gates behind a sign-in/sign-up card (name + email + password), hydrates the whole project from Postgres, uploads imports to storage (original + ≤1600px WebP derivative for the app), and live-syncs between teammates (debounced refetch on any table change). Header shows "Team workspace" + Sign out. Without the env values: demo mode, byte-for-byte the prior behavior.
- Deliverables for the user (agent cannot create their Supabase project): `supabase/schema.sql` (idempotent — tables, authenticated-team RLS, realtime publication, public-read/auth-write buckets) and `docs/SUPABASE_SETUP.md` (5-minute guide incl. GitHub Actions secrets step); `.env.example`; deploy workflow reads optional secrets.
- Decision: optimistic local writes + fire-and-forget backend calls via a narrow `ProjectBackend` interface registered on login; realtime = one channel, debounced full refetch per change (small team — no per-event merge logic to get wrong; own echoes are idempotent). Import in cloud mode returns id→File sources and routes through `uploadAssets` (storage paths → public URLs replace object URLs). Comp elements are snapshot-only in DB (`source_values` jsonb) since batch export renders from the snapshot.
- Alternatives rejected: File System Access + Drive folder (original v1 plan — superseded by user's accounts requirement); per-event realtime merging (complexity, conflict bugs); signed storage URLs (deferred — public-read buckets noted in guide with upgrade path).
- Verification: Tier 2/3 — `pnpm typecheck`; production build passes; agent-browser demo-mode regression: no login gate, Studio renders, Library 6 cards, zero console errors; deployed green (run 28751919037). **Not verified against a live Supabase project** — requires the user's project; the seam guarantees demo mode regardless, and cloud-path code is defensive (errors → console + toast).
- Files: `src/app/data/backend/{config.ts,supabase-backend.ts}`, `src/app/auth/auth-gate.tsx`, `src/app/data/{project-store.ts (ProjectBackend + wiring),types.ts (source: cloud),import-assets.ts (sources map)}`, `src/app/shell/app-shell.tsx`, `src/app/surfaces/library-screen.tsx`, `src/routes/root.tsx`, `supabase/schema.sql`, `docs/SUPABASE_SETUP.md`, `.env.example`, `.github/workflows/deploy.yml`.
- Risks: cloud path untested until the user provisions the project (first live session should exercise upload/comment/status sync); comps table stores flat snapshots — older elements[] shape not round-tripped (unused by any current surface); deleteCollection backend reparents children to root (FK set-null) vs local grandparent — realtime refetch reconciles to backend truth.

### Iteration 14 — Air-style annotations (click = pin, drag = region, inline composer)

- Request: user feedback — pinning a comment "doesn't intuitively show up" and they want "different kinds of annotation options simply".
- Root cause of the complaint: the old flow required toggling a Comment mode button, then clicking the image, and the composer input rendered in the right panel — usually behind the Info tab, so nothing visible happened at the click point.
- User-visible result: annotation is now the DEFAULT gesture on the viewer image — **click drops a pin, drag marks a region box** (gesture picks the kind; no mode buttons, no toolbar hunting). The **composer opens inline at the annotation** (autofocused, Enter posts, Esc cancels), the right panel auto-switches to Comments, and posted annotations render as numbered pins / outlined boxes. Clicking any marker (or its list row) opens a thread popover with author, time, and Resolve. Focal point remains an explicit toolbar toggle with its own hint.
- Data: `PinnedComment` gains optional `w`/`h` (normalized region; absent = point pin); Supabase `asset_comments` gains nullable `w`/`h` columns (schema.sql updated — idempotent, user hasn't provisioned yet); backend mapper + insert carry them.
- Verification: Tier 2 — `pnpm typecheck`; agent-browser end-to-end: click → composer appeared on-stage at the pin with Comments tab auto-selected; posted → numbered pin on image + list entry; drag → live box draft + "Note on this area…" composer; posted region rendered as outlined box with badge ②; badge click opened popover with text + Resolve; list rows show "· area" and highlight/cross-link markers. Screenshot matches Air's annotation pattern.
- Deploy note: GitHub Pages returned "Deployment failed, try again later" twice (backend throttle after several same-hour deploys); a fresh workflow_dispatch after a cooldown succeeded — new bundle hash confirmed live.
- Files: `src/app/data/types.ts`, `src/app/library/asset-detail.tsx`, `src/app/data/backend/supabase-backend.ts`, `supabase/schema.sql`.
- Risks: synthetic-drag threshold is 1.5% of image size — tiny accidental drags become pins (intended); region popover position clamps but can cover small regions near the bottom edge.

### Iteration 15 — Studio photo picker: stop decoding the whole library (crash fix)

- Request: user report — the app "crashes when surfacing the media in the design tool"; they asked for a selection UX that doesn't show everything at once.
- Root cause (two compounding): (1) local imports set `thumbUrl` to the **full-resolution** object URL (`import-assets.ts` had no downscale step — only the Supabase path made derivatives), and (2) the Studio's `libraryImage` control rendered **every** library asset inline in the panel. A batch of camera JPEGs meant dozens of multi-megapixel decodes (hundreds of MB of bitmaps) inside the controls panel → renderer OOM/tab crash. `VariationsModal`'s image grid had the same exposure.
- Fix at the source: `importFiles` now generates a real thumbnail per file — the already-decoded `Image` is drawn to a ≤480px canvas → WebP (browser png fallback accepted) → object URL; images already ≤480px reuse the original. Verified: 4000×5000 import → separate 384×480 blob thumb; 40-file batch imported with thumbs in 465ms, page stayed responsive.
- Picker redesign (custom control, documented builtInFitCheck): the panel now shows only a **compact selected-photo row** (thumb + name + status dot + dimensions + "Change") or a dashed "Choose from Library…" button. Browsing happens in a **portaled dialog** (fixed-position was trapped/clipped by the panel's transformed ancestors — rendered via `createPortal(document.body)`) with an autofocused search (name/file/tag), a lazy-loading 4-col grid paged 24-at-a-time ("Show N more"), Esc/backdrop close, and aria-pressed selection state. Large libraries never mount more than a page of ≤480px thumbs.
- Hardening: `loading="lazy" decoding="async"` added to the multi-image grids (library grid, kanban, variations modal, browse dialog).
- Verification: Tier 2 — `pnpm typecheck`; agent-browser: compact row renders selected demo asset; dialog opens centered (520px, portaled to body), 7 thumbs all lazy, search filters to "003" (2 matches), pick closes dialog + updates selection row and canvas; a synthetic 4000×5000 file imported through the real Library input appeared in the picker with its downscaled thumb.
- Files: `src/app/data/import-assets.ts`, `src/app/studio/library-image-control.tsx`, `src/app/studio/variations-modal.tsx`, `src/app/surfaces/library-screen.tsx`, `src/app/library/kanban-board.tsx`.
- Risks: thumbs are session-scoped object URLs (demo mode) — same lifetime as the originals, so no new leak class; cloud assets already ship 1600px WebP derivatives from Supabase, unaffected.

### Iteration 16 — Buzz-style collage, account menu, planner zoom, queue grid, type/spacing tune

- Request: five user asks — (1) Figma Buzz-style rows/columns of assets on the canvas ("is this supported by toolcraft?" — yes: our renderer is one SVG we fully control); (2) remove the "Demo project · Set your name" chips, wire account/settings/notifications behind an avatar menu; (3) planner bigger + reset to screen size, replace ad-hoc buttons with Toolcraft kit; (4) queue not "long lines of exports" — max width, 3-4 columns; (5) heading's three sizes all too big, plus a spacing control.
- Collage (Studio): new `collage` layout pattern — `image.assetIds` (multi, cap 6, selection order = cell order) + `layout.collageColumns` (Auto/1/2/3, auto solves from count). `collageCellsSvg` cover-crops each photo into grid cells (short last row stretches, focal points respected). Bleed = gutterless full-canvas grid + position-aware scrim + Bone text (house style); Framed = grid + text stack sharing the content region poster-style. Multi-picker reuses the paged/searchable browse dialog in toggle-select mode with numbered order badges; single Photo picker hides when pattern=collage (`visibleWhen notEquals`). Verified via module call: 4 photos → 4 cells both styles; via UI: pattern select → Columns + Photos controls swap in, canvas renders 2×2 grid.
- Type/spacing: `HEADING_SIZE_MULTIPLIERS` (S 0.6 / M 0.8 / L 1.02 vs the standard 0.78/1/1.28) — heading M drops 113.4→90.7px on IG post; `elements.spacing` slider (40–240%, live) scales every stack/image gap. Verified: text-block spread 54px @60% → 92px @200%.
- Account menu: avatar (initials) + kit DropdownMenu — identity header, workspace line, inline display-name editor (`closeOnClick={false}`), notifications = unresolved comment groups per asset (top 5, amber badge dot), click → `requestLibraryAsset` + navigate. Sign out shown only when Supabase configured. Two real bugs found in-browser and fixed: (a) notification click while ALREADY on /library did nothing — mount-consume never re-ran; intent now also fires `LIBRARY_ASSET_EVENT` the screen listens for; (b) `initializeSettings()` (localStorage display-name restore) was exported but never called — wired into AppShell startup.
- Planner: toolbar rebuilt on kit (ToggleGroup views, outline Buttons, kit Switch for safe zones, ToggleGroup source-rail tabs); zoom −/+ (60–300%), **Fit screen** (measures the scroll container and fills it; 100%→255%/918px on the test window), **Actual size** reset appears when zoomed.
- Queue: long rows → bounded card grid (`max-w-[1160px]`, auto-fill minmax 240px ⇒ 3-4 columns), card = full-width live SVG preview (viewBox scaling replaced the old fixed-64px transform hack), name + status dot, format chips, per-card **Export** (single-item ZIP via the same batch pipeline) and remove; toolbar on kit Input/ToggleGroup/Checkbox/Buttons.
- Kit gotcha logged: `@/toolcraft/ui`'s re-exported `Checkbox`/`Switch` are the CONTROL variants — `name` is required AND rendered as the visible label (screenshot caught literal "queue-approved-only" on screen). Use `name="Approved only"` as the label, no wrapper Label.
- Verification: Tier 2 — `pnpm tsc` clean; agent-browser walkthrough of all five features incl. screenshots (collage canvas, queue 3-card grid, planner fit at 255%); name persistence across reload confirmed ("D" avatar).
- Files: `src/app/studio/{comp-layout.ts, comp-svg.ts, library-image-control.tsx}`, `src/app/app-schema.ts`, `src/routes/index.tsx`, `src/app/shell/{app-shell.tsx, account-menu.tsx (new)}`, `src/app/data/project-store.ts`, `src/app/surfaces/{planner-screen.tsx, queue-screen.tsx, library-screen.tsx}`.
- Risks: collage cap of 6 photos is a product choice (log if clients ask for more); shuffle deliberately excludes collage (single-image pattern space); framed-collage + Text-leads order shows grid at bottom via the shared `layout.order` control.

### Iteration 17 — UI type discipline + Air-style separation

- Request: user feedback with Air screenshot — no serif in the app UI ("dont use serif like 'july drop' keep it san serif"), and adapt Air's visual separation of elements.
- Type rule established: **serif (Romie) is reserved for the canvas/comps; every UI surface is sans.** Replaced all five `font-serif` UI usages (library board title, queue empty state, variations modal title, photo-picker dialog title, login card heading) with sans weights.
- Air separation adapted to the dark theme: boards sidebar + planner source rail get a tinted panel background (`card 55%` mix) against the page; library board header became a separated bar (border-b) with the title + Air-style uppercase tracked count ("6 ASSETS · 1.2 MB"); new bottom status bar ("N items · N selected", border-t); queue summary restyled to the same uppercase label.
- Verification: Tier 2 — tsc clean; browser: zero `.font-serif` elements outside the canvas, board title computes to Inter, footer bar renders; screenshot matches the Air reference rhythm.
- Files: `src/app/surfaces/{library-screen,queue-screen,planner-screen}.tsx`, `src/app/library/boards-tree.tsx`, `src/app/studio/{variations-modal,library-image-control}.tsx`, `src/app/auth/auth-gate.tsx`.

### Iteration 18 — Overlay system: 10 finishing treatments + strength

- Request: "add some overlay features like gradient shadows top bottom and 8 other options like that into a setting" + continue building fidelity.
- New **Overlay** section (after Image): Style select — None, Shade bottom, Shade top, Shade top + bottom, Shade left, Shade right, Vignette, Ink wash, Bone wash, Keyline frame, Film grain — and a live Strength slider (10–100%, hidden when None).
- Renderer: `buildOverlaySvg` returns `{under, over}` layers — shades/washes/vignette paint UNDER the text (they double as legibility helpers), keyline + grain paint OVER everything. All SVG-native (linear/radial gradients, `feTurbulence` fractal noise for grain) so preview and export share bytes; keyline auto-picks Bone over photography/dark surfaces and Ink on light flats, inset at 0.55× the content margin so it never grazes the logo. Paint-only by design: overlays never move layout or trigger re-measures.
- Shuffle now rolls an overlay from a weighted space (none×3, shade-bottom, vignette, keyline) — most rolls stay clean.
- Export-fidelity harness (the critical check, given this environment's history of silently dropping effects in SVG-as-image): rasterized every style through the real export shape (SVG string → blob → Image → canvas → getImageData) — all 10 changed pixels vs baseline and none tainted the canvas, **including feTurbulence grain** (SVG-native filters survive where CSS filters died in iteration ~7).
- Verification: Tier 2 — tsc clean; browser: Overlay section renders all 11 options, Strength appears on selection, Shade bottom visibly darkens the collage canvas.
- Files: `src/app/studio/{comp-layout.ts, comp-svg.ts, studio-actions.ts}`, `src/app/app-schema.ts`.
- Risks: grain at 8K export multiplies filter raster cost (unmeasured — flag if 8K exports slow noticeably); wash styles at 100% strength approach flat-color territory by design.

### Iteration 19 — Go-live readiness: account flow completion + Vercel path

- Request: "have you configured the account side we will need with backend to make this live and real? will we have to do it through vercel idk figure it out."
- Assessment (read the actual backend, not memory): the account + backend **code** is complete and unstubbed — `supabase-backend.ts` does real storage uploads (original + WebP derivative), real row inserts, and full `ProjectBackend` CRUD; `auth-gate.tsx` handles session/signup/signin/signout + realtime hydrate; RLS + buckets + `schema.sql` are in place; deploy workflow already reads the two secrets. **What blocks "live and real" is provisioning only** — creating a Supabase project, running the schema, and setting the two keys — which requires the user's account (agent has no access). So this iteration hardened the parts I can and made the hosting decision turnkey.
- Architecture clarified for the user: there is **no separate server** — the app is a static SPA and Supabase IS the backend. "Hosting" = static files + two build-time env vars.
- Account-flow gaps found and fixed (both would bite a real team on day one):
  - **Signup lied under email confirmation** (Supabase default = Confirm email ON): old code always toasted "you're in", but `signUp` returns no session when confirmation is pending. Now checks `data.session` — if absent, tells them to confirm via email and flips to sign-in.
  - **No password reset** existed. Added a "Forgot password?" link → `resetPasswordForEmail` (redirect = `origin + BASE_URL`, works on Pages and Vercel), plus a `PASSWORD_RECOVERY` handler that shows a dedicated "set a new password" card (`updateUser`) when a teammate returns from the reset email.
- Hosting: recommended **Vercel** for launch (deploys private repos → repo can go back to private, fixing the Romie-font-exposure flag; dashboard env vars; custom domain; preview deploys), keeping Pages as the client-preview link. Added `vercel.json` (framework vite, `pnpm build`, `dist`, SPA rewrite — replaces the Pages 404.html hack). Vite base already defaults to `/` when `PAGES_BASE` is unset, so Vercel needs no base juggling.
- Docs: `docs/SUPABASE_SETUP.md` gets a "how the pieces fit" primer, a Pages-vs-Vercel comparison table + recommendation, the Vercel deploy path, and notes on email-confirmation default, forgot-password, and the auth redirect allow-list.
- Verification: Tier 2 — tsc + `pnpm build` both clean; browser: pointed a throwaway `.env.local` (dummy Supabase URL/key) to force the auth gate, confirmed sign-in / sign-up (name field) / forgot-password (password hidden, "Send reset link") all render and toggle; removed the temp env (gitignored, never committed) and confirmed demo mode renders the app with no login gate.
- Files: `src/app/auth/auth-gate.tsx`, `vercel.json` (new), `docs/SUPABASE_SETUP.md`.
- Still user-only (cannot be automated): create the Supabase project, run `schema.sql`, copy the URL + anon key into the host's env, add the live URL to Supabase's auth redirect allow-list, then a two-browser sync smoke test.

## Debugging notes

- Export taint root cause: this environment's embedded Chromium taints canvases for ALL SVG-image foreignObject content (empirical matrix: plain text/png-img/svg-img/font-face all TAINTED). Resolution: eliminate foreignObject entirely (pure SVG). Data-URI inlining of fonts/logos/photos retained (still required — http subresources in SVG images never load/taint regardless).

## Decisions

### Renderer

- Decision: Pure-SVG product renderer in `canvasContent` (DOM-measured text wrapping → SVG text/tspan/image), single artifact for preview and export; no `canvas.renderScale` (vector-native preview).
- Reason: Only path that guarantees Romie swash fidelity in exported bytes AND untainted canvas export across engines.
- Evidence: `src/app/studio/comp-svg.ts`; agent-browser export produced decodable 3277×4096 PNG; foreignObject taint matrix in Debugging notes.

### Timeline

- Decision: No timeline. Still-image product; no product animation, no video export.
- Reason: Export targets are still images per user decision in brief Q&A.
- Evidence: `panels.timeline` omitted.

### Layers

- Decision: No Layers panel for now; comp elements are managed by product controls (vertical flow reorder), not runtime layers. Revisit in Phase 1 if selection/reorder maps better to runtime layers.
- Reason: Element model is a guided vertical grid flow, not free z-ordered layers.
- Evidence: `panels.layers` omitted.

### Controls

- Decision: Guided sections by product entity: Format (mode select + Guides), Layout (pattern + Shuffle action), Image (Include/Bleed/Photo picker), Heading (Include/Text/Style/Color/Flourish custom control), Subheading, Body, Logo (Include/Mark picker), required Background row, required Image Export pair, sticky Export actions. Brand lock: colors and styles are approved-option selects, never free inputs (exception: contract-required `appearance.background` color control).
- Reason: Reduce decisions; layout patterns own placement so every choice is on-brand by construction (brief pillar 2).
- Evidence: `src/app/app-schema.ts`; agent-browser walkthrough of all sections.

### Export

- Decision: `Export PNG` (primary, upload-simple icon) + `Add to Queue` (secondary) sticky actions; PNG/JPG at 2K/4K/8K via `createToolcraftPngExportCanvas` with resolution passthrough; brand naming template drives filenames; batch multi-format pipeline lands in Phase 3 (Queue surface).
- Reason: Contract-required still-output delivery; queue is the product's batch path.
- Evidence: exported `20260703_studio_summer-arrives-quietly_instagram_3277x4096_v1.png` decoded at 3277×4096.

### Performance

- Decision: Vector-native SVG preview, no renderScale; workload scenarios (heaviest: long heading text at largest format 2400×1000 hero + 8K export) land with the acceptance matrix pass.
- Reason: Text+images at poster sizes are light for SVG; measurement work coalesces via React memo on values.
- Evidence: pending matrix pass; no interaction jank observed in agent-browser session.

## Evidence

- Source reviewed: local Toolcraft docs and runtime source (`toolcraft-app.tsx`, `toolcraft-root.tsx`, `theme-runtime.tsx`) for shell embedding.
- Contract applied: runtime shell invariant; canvas-no-app-ui reserved for Phase 1 renderer.

## Verification

- Phase 0: `pnpm typecheck` pass; agent-browser structural smoke of all four routes (2026-07-03).
- Final gate: `pnpm verify:final` + browser performance checkpoint scheduled for Phase 7.

## Risks

- Multi-surface app on a single-canvas template: only the Studio route is under the Toolcraft runtime contract; acceptance coverage for sibling surfaces will use dedicated browser tests (Phase 7).
- File System Access API requires Chrome/Edge; demo mode is the fallback.
