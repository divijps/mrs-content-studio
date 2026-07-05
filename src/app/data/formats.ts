/**
 * Platform format registry. Adding a format is data, not code.
 *
 * Safe zones are hard guarantees: layout snapping excludes these regions so
 * content can never sit under platform UI. Values in px at native size.
 */

export interface SafeZones {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface PlatformFormat {
  /** Encoding target for export. */
  encoding: "jpeg" | "webp" | "png";
  height: number;
  id: string;
  jpegQuality: number;
  label: string;
  /** Grouping folder name used by the export pipeline. */
  platform: "instagram" | "pinterest" | "shopify";
  platformLabel: string;
  safeZones: SafeZones;
  /** Export a 2x retina variant alongside. */
  retina: boolean;
  width: number;
}

export const PLATFORM_FORMATS: readonly PlatformFormat[] = [
  {
    encoding: "jpeg",
    height: 1350,
    id: "ig-post",
    jpegQuality: 0.9,
    label: "Post 4:5",
    platform: "instagram",
    platformLabel: "Instagram",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 1080,
  },
  {
    encoding: "jpeg",
    height: 1080,
    id: "ig-square",
    jpegQuality: 0.9,
    label: "Post 1:1",
    platform: "instagram",
    platformLabel: "Instagram",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 1080,
  },
  {
    encoding: "jpeg",
    height: 1920,
    id: "ig-story",
    jpegQuality: 0.9,
    label: "Story 9:16",
    platform: "instagram",
    platformLabel: "Instagram",
    retina: false,
    // Top: avatar + progress bars. Bottom: reply bar + swipe affordance.
    safeZones: { bottom: 310, left: 60, right: 60, top: 250 },
    width: 1080,
  },
  {
    encoding: "jpeg",
    height: 1500,
    id: "pin",
    jpegQuality: 0.92,
    label: "Pin 2:3",
    platform: "pinterest",
    platformLabel: "Pinterest",
    retina: false,
    // Bottom-right save button overlay region kept clear of key content.
    safeZones: { bottom: 120, left: 0, right: 0, top: 0 },
    width: 1000,
  },
  {
    encoding: "webp",
    height: 1000,
    id: "web-hero",
    jpegQuality: 0.9,
    label: "Hero 12:5",
    platform: "shopify",
    platformLabel: "Shopify / Web",
    retina: true,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 2400,
  },
  {
    encoding: "webp",
    height: 2048,
    id: "web-square",
    jpegQuality: 0.9,
    label: "Square 1:1",
    platform: "shopify",
    platformLabel: "Shopify / Web",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 2048,
  },
];

export function getFormat(id: string): PlatformFormat {
  const format = PLATFORM_FORMATS.find((candidate) => candidate.id === id);
  if (!format) {
    throw new Error(`Unknown platform format: ${id}`);
  }
  return format;
}

export const DEFAULT_FORMAT_ID = "ig-post";
