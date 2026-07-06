/**
 * In-memory demo project used until a real Drive folder is connected.
 * Also serves as the deterministic fixture for tests.
 */

import { MRS_BRAND } from "./brand-kit";
import type {
  Asset,
  BrandKit,
  BrandLink,
  Collection,
  Comp,
  CopyDeck,
  CopyFolder,
  JournalEntry,
  PlannerState,
  ProjectSnapshot,
  Task,
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
    kind: "image",
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

/** A demo artboard built from a partial Studio snapshot (merged with defaults
 * at render/load time). Kept as a plain record to avoid a data→studio cycle. */
function demoComp(
  id: string,
  name: string,
  status: Comp["status"],
  sourceValues: Record<string, unknown>,
): Comp {
  return {
    backgroundColorId: (sourceValues.backgroundHex as string | undefined) ?? "#f5f2ec",
    comments: [],
    createdAt: IMPORT_DATE,
    elements: [],
    formats: [(sourceValues.formatId as string | undefined) ?? "ig-post"],
    id,
    layoutId: (sourceValues.layoutPattern as string | undefined) ?? "poster",
    name,
    overrides: {},
    sourceValues,
    status,
    updatedAt: IMPORT_DATE,
  };
}

/** Three distinct artboards so the Studio's Buzz-style tray shows real work. */
export function createDemoComps(assets: Asset[]): Comp[] {
  const asset = (index: number): string =>
    assets[index]?.id ?? assets[0]?.id ?? "demo-asset-1";
  return [
    demoComp("demo-comp-1", "Summer arrives quietly", "approved", {
      elementsOrder: ["heading", "subhead"],
      formatId: "ig-post",
      headingFlourish: [2],
      headingText: "Summer arrives quietly",
      imageAssetId: asset(0),
      imageBleed: true,
      imageInclude: true,
      layoutPattern: "poster",
      overlayStyle: "shade-bottom",
      subheadText: "The July drop · linen & silk",
    }),
    demoComp("demo-comp-2", "Linen for the long light", "in-review", {
      elementsOrder: ["heading", "subhead"],
      formatId: "ig-post",
      headingFlourish: [4],
      headingText: "Linen for the long light",
      imageAssetId: asset(1),
      imageBleed: true,
      imageInclude: true,
      layoutPattern: "edge",
      overlayStyle: "vignette",
      subheadText: "Cut for warm evenings",
    }),
    demoComp("demo-comp-3", "The slow season edit", "draft", {
      backgroundHex: "#f5f2ec",
      elementsOrder: ["heading", "subhead"],
      formatId: "ig-story",
      headingColorId: "ink",
      headingText: "The slow season edit",
      imageAssetId: asset(2),
      imageBleed: false,
      imageInclude: true,
      layoutPattern: "banded",
      overlayStyle: "keyline",
      subheadColorId: "ink",
      subheadText: "New pieces, a quiet palette",
    }),
  ];
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

export const DEMO_LINKS: BrandLink[] = [
  { createdAt: IMPORT_DATE, id: "link-ig", label: "Instagram", url: "https://instagram.com/mrs" },
  { createdAt: IMPORT_DATE, id: "link-web", label: "Website", url: "https://mrs.example.com" },
  { createdAt: IMPORT_DATE, id: "link-shop", label: "Shopify admin", url: "https://mrs.myshopify.com/admin" },
];

export const DEMO_COPY_FOLDERS: CopyFolder[] = [
  { createdAt: IMPORT_DATE, id: "cfolder-captions", name: "Captions", parentId: null },
  { createdAt: IMPORT_DATE, id: "cfolder-launches", name: "Launches", parentId: "cfolder-captions" },
  { createdAt: IMPORT_DATE, id: "cfolder-journal", name: "Journal", parentId: null },
  { createdAt: IMPORT_DATE, id: "cfolder-product", name: "Product copy", parentId: null },
];

export const DEMO_JOURNAL: JournalEntry[] = [
  {
    body: "Summer arrives quietly. The July drop — linen & silk, cut for warm evenings.",
    comments: [],
    createdAt: IMPORT_DATE,
    folderId: "cfolder-captions",
    id: "note-1",
    kind: "copy",
    tags: ["instagram", "hero"],
    title: "July drop — hero caption",
    updatedAt: IMPORT_DATE,
  },
  {
    body: "New in: the linen shirt, reworked. Fewer seams, a softer collar, the same easy fit. Link in bio.",
    comments: [],
    createdAt: IMPORT_DATE,
    folderId: "cfolder-launches",
    id: "note-3",
    kind: "copy",
    tags: ["instagram", "launch"],
    title: "Linen shirt — launch caption",
    updatedAt: IMPORT_DATE,
  },
  {
    body: "This season we slowed down. Fewer pieces, natural fibres, a quieter palette — clothes made for the long light of late summer rather than the feed.",
    comments: [],
    createdAt: IMPORT_DATE,
    folderId: "cfolder-journal",
    id: "note-2",
    kind: "journal",
    tags: ["website"],
    title: "The slow season — editorial note",
    updatedAt: IMPORT_DATE,
  },
];

export const DEMO_TASKS: Task[] = [
  { assignee: "Priya", createdAt: IMPORT_DATE, id: "task-1", position: 1, status: "todo", tags: ["lookbook"], title: "Shortlist July drop hero shots", updatedAt: IMPORT_DATE },
  { assignee: null, createdAt: IMPORT_DATE, id: "task-2", position: 2, status: "todo", tags: ["copy"], title: "Write 5 caption variants", updatedAt: IMPORT_DATE },
  { assignee: "Marco", createdAt: IMPORT_DATE, id: "task-3", position: 1, status: "doing", tags: ["retouch"], title: "Retouch beach set", updatedAt: IMPORT_DATE },
  { assignee: "Lena", createdAt: IMPORT_DATE, id: "task-4", position: 1, status: "review", tags: ["lookbook"], title: "Approve grid layout", updatedAt: IMPORT_DATE },
  { assignee: null, createdAt: IMPORT_DATE, id: "task-5", position: 1, status: "done", tags: [], title: "Book studio for reshoot", updatedAt: IMPORT_DATE },
];

export function createDemoProject(): ProjectSnapshot {
  const assets = createDemoAssets();
  return {
    activeArtboardId: null,
    assets,
    brand: MRS_BRAND,
    collections: [...DEMO_COLLECTIONS],
    comps: createDemoComps(assets),
    copyFolders: [...DEMO_COPY_FOLDERS],
    decks: [DEMO_DECK],
    folderName: null,
    journal: [...DEMO_JOURNAL],
    links: [...DEMO_LINKS],
    planner: createDemoPlanner(),
    queue: [],
    settings: { displayName: null },
    source: "demo",
    tasks: [...DEMO_TASKS],
  };
}
