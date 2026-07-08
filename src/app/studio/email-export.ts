/**
 * Email export: render each section as a 2× JPEG slice (email clients don't
 * render WebP), bundle the slices + a manifest into a ZIP ready to drop into an
 * email platform, optionally stitch them into one tall image, or file them into
 * the Library. Reuses the exact comp render pipeline the Studio/Queue use.
 */

import { downloadBlob } from "../data/download";
import { getFormat } from "../data/formats";
import type { Asset, BrandKit, EmailDraft, EmailSection } from "../data/types";
import { sectionRuntimeValues } from "./email-templates";
import { encodeCanvas, renderCompCanvas } from "./export";
import { saveImagesToLibrary } from "./save-to-library";
import { createZip } from "./zip";

const CONTENT_WIDTH = 600;
const EXPORT_SCALE = 2; // 600px content width shipped at 1200px for retina.

function slug(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "email"
  );
}

function sectionFilename(section: EmailSection, index: number): string {
  const n = String(index + 1).padStart(2, "0");
  return `${n}-${section.type}.jpg`;
}

/** Render one section to a canvas at 2× its email format (aspect preserved). */
async function renderSectionCanvas(
  section: EmailSection,
  assets: readonly Asset[],
  brand: BrandKit,
): Promise<HTMLCanvasElement> {
  const values = sectionRuntimeValues(section);
  const format = getFormat(values.formatId);
  return renderCompCanvas({
    assets,
    background: values.backgroundHex,
    brand,
    includeBackground: true,
    pixelHeight: format.height * EXPORT_SCALE,
    pixelWidth: format.width * EXPORT_SCALE,
    values,
  });
}

async function sectionJpeg(
  section: EmailSection,
  assets: readonly Asset[],
  brand: BrandKit,
): Promise<{ blob: Blob; height: number; width: number }> {
  const values = sectionRuntimeValues(section);
  const format = getFormat(values.formatId);
  const canvas = await renderSectionCanvas(section, assets, brand);
  const blob = await encodeCanvas(canvas, "image/jpeg", format.jpegQuality);
  return { blob, height: format.height * EXPORT_SCALE, width: format.width * EXPORT_SCALE };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Export every section as a numbered JPEG slice plus a manifest.csv, zipped and
 * downloaded. Returns the number of slices written.
 */
export async function exportEmailSlices(
  email: EmailDraft,
  assets: readonly Asset[],
  brand: BrandKit,
): Promise<number> {
  const entries: { bytes: Uint8Array; path: string }[] = [];
  const manifest: string[] = ["order,file,type,width,height,alt"];
  for (let index = 0; index < email.sections.length; index += 1) {
    const section = email.sections[index];
    const { blob, width, height } = await sectionJpeg(section, assets, brand);
    const path = sectionFilename(section, index);
    entries.push({ bytes: new Uint8Array(await blob.arrayBuffer()), path });
    manifest.push(
      [index + 1, path, section.type, width, height, csvCell(section.alt ?? "")].join(","),
    );
  }
  if (entries.length === 0) {
    return 0;
  }
  entries.push({
    bytes: new TextEncoder().encode(manifest.join("\n")),
    path: "manifest.csv",
  });
  downloadBlob(createZip(entries), `${slug(email.name)}-email.zip`);
  return email.sections.length;
}

/**
 * Stitch all sections into one tall JPEG (1200px wide) — handy for a quick
 * full-email preview or a single-image send. Returns the stacked pixel height.
 */
export async function exportEmailSingleImage(
  email: EmailDraft,
  assets: readonly Asset[],
  brand: BrandKit,
): Promise<number> {
  const canvases: HTMLCanvasElement[] = [];
  for (const section of email.sections) {
    canvases.push(await renderSectionCanvas(section, assets, brand));
  }
  if (canvases.length === 0) {
    return 0;
  }
  const width = CONTENT_WIDTH * EXPORT_SCALE;
  const totalHeight = canvases.reduce((sum, canvas) => sum + canvas.height, 0);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = Math.max(1, totalHeight);
  const context = out.getContext("2d");
  if (!context) {
    throw new Error("Email export requires a 2D canvas context.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const canvas of canvases) {
    context.drawImage(canvas, 0, y, width, canvas.height);
    y += canvas.height;
  }
  const blob = await encodeCanvas(out, "image/jpeg", 0.92);
  downloadBlob(blob, `${slug(email.name)}-email-full.jpg`);
  return out.height;
}

/**
 * Save every section slice into the Library under "Email exports / <name>" so
 * the team can reuse them. Returns the number of assets created.
 */
export async function saveEmailSlicesToLibrary(
  email: EmailDraft,
  assets: readonly Asset[],
  brand: BrandKit,
): Promise<number> {
  const files: File[] = [];
  for (let index = 0; index < email.sections.length; index += 1) {
    const section = email.sections[index];
    const { blob } = await sectionJpeg(section, assets, brand);
    files.push(new File([blob], sectionFilename(section, index), { type: "image/jpeg" }));
  }
  if (files.length === 0) {
    return 0;
  }
  const saved = await saveImagesToLibrary(files, {
    boardPath: ["Email exports", email.name],
    tags: ["email"],
  });
  return saved.length;
}
