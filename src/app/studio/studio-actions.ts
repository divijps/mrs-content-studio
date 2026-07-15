/**
 * Studio panel actions: shuffle + matrix variations. Export lives in export.ts
 * and studio-multi-export.ts.
 */

import type { ToolcraftCommand, ToolcraftState } from "@/toolcraft/runtime";

import { createId, getProjectSnapshot, upsertComp } from "../data/project-store";
import type { Comp, CompElement } from "../data/types";
import {
  type FlourishStyle,
  readStudioValues,
  SHUFFLE_SPACE,
  type StudioValues,
} from "./comp-layout";

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
    // One content colour now drives every text element.
    ["content.color", pairing.text],
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

/** A headline option in the variations matrix — its text plus an optional
 * flourish preset (stored loosely on a CopySnippet). */
export interface VariationHeadline {
  flourish?: Record<string, unknown>;
  text: string;
}

/** Pull the three heading-flourish fields out of a loosely-typed preset. */
/** Parse a CopySnippet's loose flourish preset into StudioValues fields.
 * Shared with the Content menus' copy picker. */
export function flourishPatch(preset?: Record<string, unknown>): Partial<StudioValues> {
  if (!preset) {
    return {};
  }
  const patch: Partial<StudioValues> = {};
  if (Array.isArray(preset.words)) {
    patch.headingFlourish = preset.words.filter(
      (entry): entry is number => typeof entry === "number",
    );
  }
  if (typeof preset.style === "string") {
    patch.headingFlourishStyle = preset.style as FlourishStyle;
  }
  if (preset.styles && typeof preset.styles === "object") {
    patch.headingFlourishStyles = preset.styles as Record<number, FlourishStyle>;
  }
  return patch;
}

/**
 * Matrix generation: fan the artboard in view out across the chosen headlines ×
 * sub-heads × images (any empty dimension keeps the base's current value, so you
 * can vary just one axis), all rendered at `formatId` and saved as new artboards
 * that fill the session rail. Headline flourish presets ride along per option.
 */
export function generateVariations(options: {
  base: StudioValues;
  formatId: string;
  headlines: VariationHeadline[];
  imageIds: string[];
  subheads: string[];
}): { comps: number } {
  const { base, formatId } = options;
  const headlines: (VariationHeadline | null)[] =
    options.headlines.length > 0 ? options.headlines : [null];
  const subheads: (string | null)[] =
    options.subheads.length > 0 ? options.subheads : [null];
  const imageIds: (string | null)[] =
    options.imageIds.length > 0 ? options.imageIds : [null];

  let comps = 0;
  for (const headline of headlines) {
    for (const subhead of subheads) {
      for (const assetId of imageIds) {
        const values: StudioValues = { ...base, formatId };
        if (headline) {
          values.headingInclude = true;
          values.headingText = headline.text;
          Object.assign(values, flourishPatch(headline.flourish));
        }
        if (subhead !== null) {
          values.subheadInclude = true;
          values.subheadText = subhead;
        }
        if (assetId) {
          values.imageAssetId = assetId;
          values.imageInclude = true;
        }
        const comp = studioValuesToComp(values);
        // Name each comp by its copy so the rail + exports are legible.
        comp.name = headline?.text || subhead || base.headingText || "Variation";
        upsertComp(comp);
        comps += 1;
      }
    }
  }
  return { comps };
}
