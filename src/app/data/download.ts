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

/** What happened when delivering a rendered file:
 * - "shared": the native share sheet handled it (or the user dismissed it).
 * - "downloaded": fell back to a plain download (desktop / no share sheet).
 * - "needs-tap": a touch device CAN share, but `share()` was refused because
 *   the click's activation expired during a long (video) render — the caller
 *   should offer a fresh-tap Share (see {@link shareRenderedFile}). */
export type ExportDelivery = "shared" | "downloaded" | "needs-tap";

function canShareFiles(file: File): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

/**
 * Deliver a rendered file. On touch devices (iPad) that can share files, open
 * the native share sheet — Save to Photos / send to Instagram, matching the
 * Copy-transparent dialog. If the share is refused because the render outlasted
 * the click's activation window, returns "needs-tap" so the caller can surface
 * a fresh-tap Share instead of silently downloading a big video. Desktop and
 * no-share environments download so the file always lands.
 */
export async function deliverExportFile(blob: Blob, filename: string): Promise<ExportDelivery> {
  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });
  if (navigator.maxTouchPoints > 0 && canShareFiles(file)) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      // User dismissed the sheet — respect that, treat as delivered.
      if ((error as { name?: string })?.name === "AbortError") {
        return "shared";
      }
      // Activation expired (long render) — let the caller offer a fresh tap.
      return "needs-tap";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

/**
 * Re-attempt the native share for an already-rendered file from a FRESH user
 * gesture (a toast "Share" tap) — the reliable path for long video exports,
 * whose render outlasted the original click. Downloads if sharing fails.
 */
export async function shareRenderedFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        return;
      }
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
