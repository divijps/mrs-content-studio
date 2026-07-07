/**
 * File-download helpers. Kept dependency-free (no fonts, no canvas) so any
 * surface can trigger a real download without pulling in the Studio export
 * pipeline.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download a remote file as a real file, not a browser navigation. The anchor
 * `download` attribute is ignored for cross-origin URLs (Supabase storage lives
 * on another origin), so the browser would just open the image in a tab. We
 * fetch the bytes and download a same-origin blob instead, falling back to a
 * new-tab open only if CORS blocks the fetch.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    const response = await fetch(url);
    downloadBlob(await response.blob(), filename);
    return;
  }
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}).`);
    }
    downloadBlob(await response.blob(), filename);
  } catch {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.target = "_blank";
    anchor.click();
  }
}
