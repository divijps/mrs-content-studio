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
  platform: "instagram" | "pinterest" | "tiktok" | "landscape" | "email";
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
    encoding: "jpeg",
    height: 1920,
    id: "tiktok",
    jpegQuality: 0.9,
    label: "Video 9:16",
    platform: "tiktok",
    platformLabel: "TikTok",
    retina: false,
    // Right-rail action icons + bottom caption/CTA band kept clear of key copy.
    safeZones: { bottom: 400, left: 40, right: 150, top: 100 },
    width: 1080,
  },
  {
    encoding: "jpeg",
    height: 1080,
    id: "landscape",
    jpegQuality: 0.92,
    label: "16:9",
    platform: "landscape",
    platformLabel: "Landscape",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 1920,
  },
  // Email: 600px content width (the durable email standard). Rendered at 2×
  // (1200px) as JPEG — email clients don't render WebP reliably. Full bleed, so
  // no safe zones. Section heights follow common email aspect conventions.
  {
    encoding: "jpeg",
    height: 140,
    id: "email-header",
    jpegQuality: 0.9,
    label: "Header",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 750,
    id: "email-hero-portrait",
    jpegQuality: 0.9,
    label: "Hero 4:5",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 600,
    id: "email-hero-square",
    jpegQuality: 0.9,
    label: "Hero 1:1",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 338,
    id: "email-hero-landscape",
    jpegQuality: 0.9,
    label: "Hero 16:9",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 450,
    id: "email-editorial",
    jpegQuality: 0.9,
    label: "Editorial 4:3",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 380,
    id: "email-split",
    jpegQuality: 0.9,
    label: "Split",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 260,
    id: "email-text",
    jpegQuality: 0.9,
    label: "Text",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 270,
    id: "email-grid-3",
    jpegQuality: 0.9,
    label: "Grid 3-up",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 380,
    id: "email-grid-2",
    jpegQuality: 0.9,
    label: "Grid 2-up",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 220,
    id: "email-quote",
    jpegQuality: 0.9,
    label: "Quote",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 300,
    id: "email-footer",
    jpegQuality: 0.9,
    label: "Footer",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 120,
    id: "email-wordmark",
    jpegQuality: 0.9,
    label: "Wordmark",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 56,
    id: "email-banner",
    jpegQuality: 0.9,
    label: "Banner",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 640,
    id: "email-overlay",
    jpegQuality: 0.9,
    label: "Overlay 15:16",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 460,
    id: "email-lineup",
    jpegQuality: 0.9,
    label: "Lineup",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 340,
    id: "email-note",
    jpegQuality: 0.9,
    label: "Note",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 360,
    id: "email-list",
    jpegQuality: 0.9,
    label: "List",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
  {
    encoding: "jpeg",
    height: 120,
    id: "email-cta",
    jpegQuality: 0.9,
    label: "Button",
    platform: "email",
    platformLabel: "Email",
    retina: false,
    safeZones: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 600,
  },
];

export function getFormat(id: string): PlatformFormat {
  const format = PLATFORM_FORMATS.find((candidate) => candidate.id === id);
  if (!format) {
    throw new Error(`Unknown platform format: ${id}`);
  }
  return format;
}

export const DEFAULT_FORMAT_ID = "ig-story";
