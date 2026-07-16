/**
 * Planner downloads. A planner slot (and each carousel frame) holds either a
 * raw asset or a comp: assets download as their original file, comps are
 * rendered at the channel's format. Single media downloads directly; a carousel
 * or a whole channel is bundled into a ZIP.
 */

import { downloadBlob } from "../data/download";
import { getFormat } from "../data/formats";
import type { Asset, PlannerGridSlot, ProjectSnapshot, SlotCrop } from "../data/types";
import { renderCompToFile } from "../studio/save-to-library";
import { createZip, type ZipEntry } from "../studio/zip";

type PlannerProject = Pick<ProjectSnapshot, "assets" | "brand" | "comps">;
interface MediaRef {
  assetId: string | null;
  compId: string | null;
  /** The slot's cover reframe — frames export at their focal cover crop. */
  crop?: SlotCrop | null;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function extensionOf(filename: string): string {
  return filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
}

/** Cover + carousel frames, in post order. */
function slotRefs(slot: PlannerGridSlot): MediaRef[] {
  return [
    { assetId: slot.assetId, compId: slot.compId, crop: slot.crop ?? null },
    ...slot.frames.map((frame) => ({ assetId: frame.assetId, compId: frame.compId })),
  ];
}

/** Fetch bytes CORS-clean (Supabase storage sends ACAO:*), so canvases stay
 * readable and exports never taint. */
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * An asset's export file at the channel's format: the exact format pixels
 * (e.g. 1080×1350), rendered from the ORIGINAL file with the app's own crop
 * math (focal cover, or the slot's manual reframe). The original passes
 * through untouched when it is already exactly the format's size and hasn't
 * been zoomed — never double-process a file that needs no work. Videos always
 * pass through (no client-side video cropping).
 */
async function resolveAssetFile(
  asset: Asset,
  formatId: string,
  crop: SlotCrop | null | undefined,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const format = getFormat(formatId);
  const zoomed = crop != null && crop.scale > 1.005;
  const exactSize = asset.width === format.width && asset.height === format.height;
  if (asset.kind === "video" || (exactSize && !zoomed)) {
    const bytes = await fetchBytes(asset.url);
    return bytes ? { bytes, filename: `${asset.name}.${extensionOf(asset.filename)}` } : null;
  }

  const originalBytes = await fetchBytes(asset.url);
  if (!originalBytes) return null;
  const blobUrl = URL.createObjectURL(new Blob([originalBytes as BlobPart]));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not decode ${asset.name}`));
      element.src = blobUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = format.width;
    canvas.height = format.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    // Same object-position model the preview uses: cover base scale × the
    // reframe zoom, panned by x/y alignment (focal point when no reframe).
    const scale = crop?.scale ?? 1;
    const x = crop?.x ?? asset.focalPoint.x;
    const y = crop?.y ?? asset.focalPoint.y;
    const cover = Math.max(
      format.width / image.naturalWidth,
      format.height / image.naturalHeight,
    );
    const drawnWidth = image.naturalWidth * cover * scale;
    const drawnHeight = image.naturalHeight * cover * scale;
    context.drawImage(
      image,
      (format.width - drawnWidth) * x,
      (format.height - drawnHeight) * y,
      drawnWidth,
      drawnHeight,
    );
    const mime =
      format.encoding === "png"
        ? "image/png"
        : format.encoding === "webp"
          ? "image/webp"
          : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, format.jpegQuality);
    });
    if (!blob) return null;
    const ext = format.encoding === "jpeg" ? "jpg" : format.encoding;
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      filename: `${asset.name}_${format.width}x${format.height}.${ext}`,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Resolve a media ref to export bytes + a filename (null for placeholders). */
async function resolveFile(
  ref: MediaRef,
  project: PlannerProject,
  formatId: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  if (ref.assetId) {
    const asset = project.assets.find((candidate) => candidate.id === ref.assetId);
    if (!asset) return null;
    return resolveAssetFile(asset, formatId, ref.crop);
  }
  if (ref.compId) {
    const comp = project.comps.find((candidate) => candidate.id === ref.compId);
    if (!comp) return null;
    const file = await renderCompToFile({
      assets: project.assets,
      brand: project.brand,
      comp,
      formatId,
    });
    return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name };
  }
  return null;
}

/** Download a single slot/frame's media as its file. Returns false if empty. */
export async function downloadSlotMedia(
  ref: MediaRef,
  project: PlannerProject,
  formatId: string,
): Promise<boolean> {
  const file = await resolveFile(ref, project, formatId);
  if (!file) return false;
  downloadBlob(new Blob([file.bytes as BlobPart]), file.filename);
  return true;
}

/** Bundle every frame of one carousel post into a ZIP. Returns the file count. */
export async function downloadCarousel(
  slot: PlannerGridSlot,
  project: PlannerProject,
  formatId: string,
  zipBase: string,
): Promise<number> {
  const refs = slotRefs(slot);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < refs.length; index += 1) {
    const file = await resolveFile(refs[index]!, project, formatId);
    if (file) {
      entries.push({ bytes: file.bytes, path: `${String(index + 1).padStart(2, "0")}_${file.filename}` });
    }
  }
  if (entries.length === 0) return 0;
  downloadBlob(createZip(entries), `${slug(zipBase) || "carousel"}.zip`);
  return entries.length;
}

/**
 * Bundle every post in a channel into a ZIP. Carousels get a numbered
 * sub-folder; single posts are flat files, all prefixed by post order.
 */
export async function downloadPlannerChannel(
  slots: PlannerGridSlot[],
  project: PlannerProject,
  formatId: string,
  zipBase: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const entries: ZipEntry[] = [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex]!;
    const refs = slotRefs(slot);
    const prefix = `${String(slotIndex + 1).padStart(2, "0")}${slot.label ? `_${slug(slot.label)}` : ""}`;
    for (let frame = 0; frame < refs.length; frame += 1) {
      const file = await resolveFile(refs[frame]!, project, formatId);
      if (file) {
        const path =
          refs.length > 1
            ? `${prefix}/${String(frame + 1).padStart(2, "0")}_${file.filename}`
            : `${prefix}_${file.filename}`;
        entries.push({ bytes: file.bytes, path });
      }
    }
    onProgress?.(slotIndex + 1, slots.length);
  }
  if (entries.length === 0) return 0;
  downloadBlob(createZip(entries), `${slug(zipBase) || "planner"}.zip`);
  return entries.length;
}
