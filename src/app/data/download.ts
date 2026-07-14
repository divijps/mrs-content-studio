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
 * Deliver a rendered file. On touch devices (iPad) that can share files, open
 * the native share sheet — the user taps "Save Image"/"Save to Files" or sends
 * it straight to Instagram, which is the reliable mobile path and matches the
 * Copy-transparent dialog. Everywhere else — or if the share sheet isn't
 * offered, the user cancels a non-share path, or `share()` fails because the
 * click's activation expired during a long render — it falls back to a plain
 * download so the file always lands.
 *
 * Note: `navigator.share` needs a live user gesture, so a slow (video) render
 * can outlast the activation window; that case degrades to a download.
 */
export async function shareOrDownloadFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });
  const canShareFile =
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  if (navigator.maxTouchPoints > 0 && canShareFile) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // User dismissed the sheet — respect that, don't also download.
      if ((error as { name?: string })?.name === "AbortError") {
        return;
      }
      // Otherwise (activation expired, share unavailable) fall through.
    }
  }
  downloadBlob(blob, filename);
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
