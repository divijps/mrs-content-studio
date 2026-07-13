/**
 * Studio panel actions: shuffle + matrix variations. Export lives in export.ts
 * and studio-multi-export.ts.
 */

import type { ToolcraftCommand, ToolcraftState } from "@/toolcraft/runtime";

import { createId, getProjectSnapshot, upsertComp } from "../data/project-store";
import type { Comp, CompElement } from "../data/types";
import { readStudioValues, SHUFFLE_SPACE, type StudioValues } from "./comp-layout";

function pickDifferent<T>(pool: readonly T[], current: T): T {
  const candidates = pool.filter((entry) => entry !== current);
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)] as T;
}

/**
 * Shuffle re-rolls the arrangement within brand rules: pattern, heading style,
 * and an approved background/text pairing. Every roll is on-brand by construction.
 */
export function shuffleStudio(
  state: ToolcraftState,
  dispatch: (command: ToolcraftCommand) => void,
): void {
  const values = readStudioValues(state.values);
  const nextStyle = pickDifferent(SHUFFLE_SPACE.headingStyles, values.headingStyleId);
  const nextAnchor = pickDifferent(SHUFFLE_SPACE.anchors, values.logoAnchor);
  const nextAnchorY = pickDifferent(
    ["top", "middle", "bottom"] as const,
    values.layoutAnchorY,
  );
  const pairing =
    SHUFFLE_SPACE.pairings[Math.floor(Math.random() * SHUFFLE_SPACE.pairings.length)]!;
  const nextOverlay =
    SHUFFLE_SPACE.overlays[Math.floor(Math.random() * SHUFFLE_SPACE.overlays.length)]!;

  // The Studio is full-bleed-only, so shuffle no longer rolls layout patterns.
  const updates: Array<[string, unknown]> = [
    ["overlay.style", nextOverlay],
    ["layout.anchorY", nextAnchorY],
    ["logo.anchor", nextAnchor],
    ["heading.style", nextStyle],
    ["appearance.background", { hex: pairing.background }],
    ["heading.color", pairing.text],
    ["subhead.color", pairing.text],
    ["body.color", pairing.text],
  ];

  // One undo entry per shuffle: merge the batch under a unique history group.
  const historyGroup = `shuffle-${Math.random().toString(36).slice(2, 8)}`;
  for (const [target, value] of updates) {
    dispatch({
      history: "merge",
      historyGroup,
      label: "Shuffle layout",
      target,
      type: "controls.setValue",
      value,
    });
  }
}

/** Convert the current Studio values into a project-store Comp. */
export function studioValuesToComp(values: StudioValues, existingId?: string): Comp {
  const now = new Date().toISOString();
  const elements: CompElement[] = [];

  if (values.imageInclude && values.imageAssetId) {
    elements.push({
      align: "center",
      assetId: values.imageAssetId,
      bleed: values.imageBleed,
      id: "el-image",
      kind: "image",
      locked: false,
      scaleStep: 2,
      span: 6,
    });
  }
  if (values.headingInclude) {
    elements.push({
      align: "start",
      colorId: values.headingColorId,
      deckId: null,
      deckIndex: 0,
      flourishRuns: values.headingFlourish.map((wordIndex) => ({
        end: wordIndex,
        start: wordIndex,
      })),
      id: "el-heading",
      kind: "heading",
      locked: false,
      scaleStep: 1,
      span: 5,
      styleId: values.headingStyleId,
      text: values.headingText,
    });
  }
  if (values.subheadInclude) {
    elements.push({
      align: "start",
      colorId: values.subheadColorId,
      deckId: null,
      deckIndex: 0,
      flourishRuns: [],
      id: "el-subhead",
      kind: "subhead",
      locked: false,
      scaleStep: 1,
      span: 4,
      styleId: "subhead",
      text: values.subheadText,
    });
  }
  if (values.bodyInclude) {
    elements.push({
      align: "start",
      colorId: values.bodyColorId,
      deckId: null,
      deckIndex: 0,
      flourishRuns: [],
      id: "el-body",
      kind: "body",
      locked: false,
      scaleStep: 1,
      span: 4,
      styleId: "body",
      text: values.bodyText,
    });
  }
  if (values.logoInclude) {
    elements.push({
      align: "start",
      colorId: null,
      id: "el-logo",
      kind: "logo",
      locked: true,
      logoId: values.logoVariantId,
      scaleStep: 0,
      span: 2,
    });
  }

  // Editing an existing artboard preserves its review state (status, comments,
  // creation time, target formats) — only the design snapshot is replaced.
  const existing = existingId
    ? getProjectSnapshot().comps.find((comp) => comp.id === existingId)
    : undefined;

  return {
    backgroundColorId: values.backgroundHex,
    comments: existing?.comments ?? [],
    createdAt: existing?.createdAt ?? now,
    elements,
    formats: existing?.formats ?? [values.formatId],
    id: existingId ?? createId("comp"),
    layoutId: values.layoutPattern,
    name: values.headingText || "Untitled comp",
    // Editing keeps the original owner; a new artboard belongs to the current
    // teammate so their Studio shows only their own work.
    ownerId: existing?.ownerId ?? getProjectSnapshot().settings.userId ?? null,
    overrides: {},
    // Flat snapshot so batch export can re-render this comp at any format.
    sourceValues: { ...values } as unknown as Record<string, unknown>,
    status: existing?.status ?? "draft",
    updatedAt: now,
  };
}

/**
 * Matrix generation: fan the current comp out across copy variants × images,
 * saved as new artboards. This is the "automated remixing" mode — a pasted
 * bullet list becomes a full set of on-brand artboards ready to open and export.
 */
export function generateVariations(options: {
  applyTo: "heading" | "subhead";
  assetIds: string[];
  base: StudioValues;
  variants: string[];
}): { comps: number } {
  const { applyTo, assetIds, base, variants } = options;
  const images = assetIds.length > 0 ? assetIds : [base.imageAssetId];
  const lines = variants.map((line) => line.trim()).filter(Boolean);

  let comps = 0;
  for (const line of lines) {
    for (const assetId of images) {
      const values: StudioValues = {
        ...base,
        imageAssetId: assetId,
        imageInclude: base.imageInclude || Boolean(assetId),
        ...(applyTo === "heading"
          ? { headingInclude: true, headingText: line }
          : { subheadInclude: true, subheadText: line }),
      };
      const comp = studioValuesToComp(values);
      // Name each comp by its copy line so the tray and exports are legible.
      comp.name = line;
      upsertComp(comp);
      comps += 1;
    }
  }
  return { comps };
}
