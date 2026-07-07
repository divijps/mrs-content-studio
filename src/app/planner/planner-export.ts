/**
 * Planner downloads. A planner slot (and each carousel frame) holds either a
 * raw asset or a comp: assets download as their original file, comps are
 * rendered at the channel's format. Single media downloads directly; a carousel
 * or a whole channel is bundled into a ZIP.
 */

import { downloadBlob, downloadFromUrl } from "../data/download";
import type { PlannerGridSlot, ProjectSnapshot } from "../data/types";
import { renderCompToFile } from "../studio/save-to-library";
import { createZip, type ZipEntry } from "../studio/zip";

type PlannerProject = Pick<ProjectSnapshot, "assets" | "brand" | "comps">;
interface MediaRef {
  assetId: string | null;
  compId: string | null;
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
    { assetId: slot.assetId, compId: slot.compId },
    ...slot.frames.map((frame) => ({ assetId: frame.assetId, compId: frame.compId })),
  ];
}

/** Resolve a media ref to raw bytes + a filename (null for empty placeholders). */
async function resolveFile(
  ref: MediaRef,
  project: PlannerProject,
  formatId: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  if (ref.assetId) {
    const asset = project.assets.find((candidate) => candidate.id === ref.assetId);
    if (!asset) return null;
    const response = await fetch(asset.url, { mode: "cors" });
    if (!response.ok) return null;
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      filename: `${asset.name}.${extensionOf(asset.filename)}`,
    };
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
  if (ref.assetId) {
    const asset = project.assets.find((candidate) => candidate.id === ref.assetId);
    if (!asset) return false;
    await downloadFromUrl(asset.url, `${asset.name}.${extensionOf(asset.filename)}`);
    return true;
  }
  if (ref.compId) {
    const comp = project.comps.find((candidate) => candidate.id === ref.compId);
    if (!comp) return false;
    const file = await renderCompToFile({
      assets: project.assets,
      brand: project.brand,
      comp,
      formatId,
    });
    downloadBlob(file, file.name);
    return true;
  }
  return false;
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
