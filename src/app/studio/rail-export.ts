/**
 * Batch export for the session rail: render a set of artboards and bundle them
 * into one ZIP, grouped into a folder per format. Mirrors the planner's
 * multi-comp export (renderCompToFile → createZip → downloadBlob) — the simplest
 * path that turns "select these artboards" into a single download and is the
 * scale lever for producing many assets at once.
 */

import { getFormat } from "../data/formats";
import type { Asset, BrandKit, Comp } from "../data/types";
import type { StudioValues } from "./comp-layout";
import { downloadBlob } from "./export";
import { renderCompToFile } from "./save-to-library";
import { createZip, type ZipEntry } from "./zip";

/** The format a saved comp was authored at (from its design snapshot). */
export function compFormatId(comp: Comp): string {
  return (
    (comp.sourceValues as Partial<StudioValues> | undefined)?.formatId ??
    comp.formats[0] ??
    "ig-post"
  );
}

function slug(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "comp"
  );
}

/**
 * Render each comp at its own format and download a ZIP with one folder per
 * format. `onProgress` reports completed/total for a progress toast.
 */
export async function exportCompsZip(options: {
  assets: readonly Asset[];
  brand: BrandKit;
  comps: Comp[];
  onProgress?: (done: number, total: number) => void;
}): Promise<{ count: number }> {
  const { assets, brand, comps, onProgress } = options;
  const entries: ZipEntry[] = [];
  const usedPaths = new Set<string>();
  let done = 0;
  for (const comp of comps) {
    const formatId = compFormatId(comp);
    const format = getFormat(formatId);
    const folder = `${format.platformLabel} ${format.label}`;
    const file = await renderCompToFile({ assets, brand, comp, formatId });
    let path = `${folder}/${slug(comp.name)}.png`;
    let n = 2;
    while (usedPaths.has(path)) {
      path = `${folder}/${slug(comp.name)}-${n}.png`;
      n += 1;
    }
    usedPaths.add(path);
    entries.push({ bytes: new Uint8Array(await file.arrayBuffer()), path });
    done += 1;
    onProgress?.(done, comps.length);
  }
  if (entries.length === 0) {
    return { count: 0 };
  }
  downloadBlob(createZip(entries), "studio-export.zip");
  return { count: entries.length };
}
