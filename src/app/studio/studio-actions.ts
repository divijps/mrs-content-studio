/**
 * Studio panel actions: shuffle, add-to-queue. Export lives in export.ts.
 */

import type { ToolcraftCommand, ToolcraftState } from "@/toolcraft/runtime";

import {
  addToQueue,
  createId,
  getProjectSnapshot,
  setActiveArtboard,
  upsertComp,
} from "../data/project-store";
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
  const nextPattern = pickDifferent(SHUFFLE_SPACE.patterns, values.layoutPattern);
  const nextStyle = pickDifferent(SHUFFLE_SPACE.headingStyles, values.headingStyleId);
  const nextAnchor = pickDifferent(SHUFFLE_SPACE.anchors, values.logoAnchor);
  const nextTextPosition = pickDifferent(
    SHUFFLE_SPACE.textPositions,
    values.layoutTextPosition,
  );
  const pairing =
    SHUFFLE_SPACE.pairings[Math.floor(Math.random() * SHUFFLE_SPACE.pairings.length)]!;
  const nextOverlay =
    SHUFFLE_SPACE.overlays[Math.floor(Math.random() * SHUFFLE_SPACE.overlays.length)]!;

  const updates: Array<[string, unknown]> = [
    ["layout.pattern", nextPattern],
    ["overlay.style", nextOverlay],
    ["layout.textPosition", nextTextPosition],
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
    overrides: {},
    // Flat snapshot so batch export can re-render this comp at any format.
    sourceValues: { ...values } as unknown as Record<string, unknown>,
    status: existing?.status ?? "draft",
    updatedAt: now,
  };
}

/**
 * Queue the active artboard for export. Editing an artboard already keeps its
 * comp saved, so this updates that comp in place (no duplicate) and queues it;
 * with no active artboard it adopts the current canvas as a new one.
 */
export function addStudioCompToQueue(state: ToolcraftState): Comp {
  const values = readStudioValues(state.values);
  const activeId = getProjectSnapshot().activeArtboardId ?? undefined;
  const comp = studioValuesToComp(values, activeId);
  upsertComp(comp);
  if (!activeId) {
    setActiveArtboard(comp.id);
  }
  addToQueue(comp.id, [values.formatId]);
  return comp;
}

/**
 * Matrix generation: fan the current comp out across copy variants × images,
 * queued for a set of formats. This is the "automated remixing" export mode —
 * a pasted bullet list becomes a full set of on-brand, queued variations.
 */
export function generateVariations(options: {
  applyTo: "heading" | "subhead";
  assetIds: string[];
  base: StudioValues;
  formatIds: string[];
  variants: string[];
}): { comps: number; files: number } {
  const { applyTo, assetIds, base, formatIds, variants } = options;
  const images = assetIds.length > 0 ? assetIds : [base.imageAssetId];
  const lines = variants.map((line) => line.trim()).filter(Boolean);
  const formats = formatIds.length > 0 ? formatIds : [base.formatId];

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
      // Name each comp by its copy line so the queue and exports are legible.
      comp.name = line;
      upsertComp(comp);
      addToQueue(comp.id, formats);
      comps += 1;
    }
  }
  return { comps, files: comps * formats.length };
}
