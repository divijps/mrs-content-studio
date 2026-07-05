/**
 * In-memory demo project used until a real Drive folder is connected.
 * Also serves as the deterministic fixture for tests.
 */

import { MRS_BRAND } from "./brand-kit";
import type {
  Asset,
  BrandKit,
  Collection,
  Comp,
  CopyDeck,
  PlannerState,
  ProjectSnapshot,
} from "./types";

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Muted editorial placeholder imagery so demo mode reads as a fashion library. */
function demoImage(width: number, height: number, tones: [string, string], seed: number): string {
  const bandY = Math.round(height * (0.35 + 0.2 * ((seed % 3) / 2)));
  const circleR = Math.round(Math.min(width, height) * 0.22);
  const circleX = Math.round(width * (0.3 + 0.4 * ((seed % 4) / 3)));
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${tones[0]}"/>` +
      `<rect y="${bandY}" width="${width}" height="${Math.round(height * 0.45)}" fill="${tones[1]}"/>` +
      `<circle cx="${circleX}" cy="${bandY}" r="${circleR}" fill="${tones[1]}" opacity="0.55"/>` +
      `</svg>`,
  );
}

const DEMO_TONES: [string, string][] = [
  ["#c9beac", "#9d9483"],
  ["#4a4540", "#2e2b28"],
  ["#d8cfc4", "#b3a893"],
  ["#8a8577", "#6b675c"],
  ["#e2ddd2", "#c4b8a3"],
  ["#3b3a36", "#57544c"],
];

const IMPORT_DATE = "2026-07-01T10:00:00.000Z";

function demoAsset(index: number, width: number, height: number): Asset {
  const tones = DEMO_TONES[index % DEMO_TONES.length];
  const url = demoImage(width, height, tones, index);
  const number = String(index + 1).padStart(3, "0");
  return {
    collectionId: index < 4 ? "july-drop" : "bts",
    comments: [],
    createdAt: IMPORT_DATE,
    favorite: index === 1,
    filename: `IMG_${4200 + index}.jpg`,
    focalPoint: { x: 0.5, y: 0.4 },
    height,
    id: `demo-asset-${index + 1}`,
    name: `20260701_julydrop_${number}`,
    status: index === 0 ? "approved" : index === 2 ? "in-review" : "draft",
    tags: index % 2 === 0 ? ["lookbook"] : ["detail"],
    thumbUrl: url,
    updatedAt: IMPORT_DATE,
    url,
    width,
  };
}

export const DEMO_COLLECTIONS: Collection[] = [
  { createdAt: IMPORT_DATE, id: "july-drop", name: "July drop", parentId: null },
  { createdAt: IMPORT_DATE, id: "bts", name: "BTS", parentId: "july-drop" },
];

export function createDemoAssets(): Asset[] {
  return [
    demoAsset(0, 1200, 1500),
    demoAsset(1, 1200, 1600),
    demoAsset(2, 1600, 1200),
    demoAsset(3, 1200, 1500),
    demoAsset(4, 1400, 1400),
    demoAsset(5, 1200, 1800),
  ];
}

export function createDemoComp(assets: Asset[]): Comp {
  return {
    backgroundColorId: "bone",
    comments: [],
    createdAt: IMPORT_DATE,
    elements: [
      {
        align: "center",
        assetId: assets[0]?.id ?? null,
        bleed: false,
        id: "el-image",
        kind: "image",
        locked: false,
        scaleStep: 2,
        span: 6,
      },
      {
        align: "start",
        colorId: "ink",
        deckId: null,
        deckIndex: 0,
        flourishRuns: [{ end: 6, start: 0 }],
        id: "el-heading",
        kind: "heading",
        locked: false,
        scaleStep: 1,
        span: 5,
        styleId: "display",
        text: "Summer arrives quietly",
      },
      {
        align: "start",
        colorId: "ink",
        deckId: null,
        deckIndex: 0,
        flourishRuns: [],
        id: "el-subhead",
        kind: "subhead",
        locked: false,
        scaleStep: 1,
        span: 4,
        styleId: "subhead",
        text: "The July drop · linen & silk",
      },
      {
        align: "start",
        colorId: null,
        id: "el-logo",
        kind: "logo",
        locked: true,
        logoId: "motif",
        scaleStep: 0,
        span: 2,
      },
    ],
    formats: ["ig-post", "ig-story", "pin"],
    id: "demo-comp-1",
    layoutId: "poster",
    name: "July drop teaser",
    overrides: {},
    status: "draft",
    updatedAt: IMPORT_DATE,
  };
}

export const DEMO_DECK: CopyDeck = {
  createdAt: IMPORT_DATE,
  id: "demo-deck-1",
  name: "July drop lines",
  variants: [
    "Summer arrives quietly",
    "Linen for the long light",
    "Cut for warm evenings",
    "The slow season edit",
  ],
};

export function createDemoPlanner(): PlannerState {
  return { gridSlots: [], storySlots: [] };
}

export function createDemoProject(): ProjectSnapshot {
  const assets = createDemoAssets();
  return {
    assets,
    brand: MRS_BRAND,
    collections: [...DEMO_COLLECTIONS],
    comps: [createDemoComp(assets)],
    decks: [DEMO_DECK],
    folderName: null,
    planner: createDemoPlanner(),
    queue: [],
    settings: { displayName: null },
    source: "demo",
  };
}
