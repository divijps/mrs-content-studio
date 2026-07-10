import * as React from "react";
import { createPortal } from "react-dom";

import { useToolcraft } from "@/toolcraft/runtime/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/toolcraft/ui";
import { toast } from "sonner";

import { getFormat } from "../data/formats";
import { useProject } from "../data/project-store";
import {
  beginUpload,
  failUpload,
  finishUpload,
  updateUpload,
} from "../data/upload-store";
import { readStudioValues } from "./comp-layout";
import { downloadBlob } from "./export";
import { exportDestination, saveImagesToLibrary } from "./save-to-library";
import { isVideoExportSupported, renderStudioVideo } from "./video-export";

/**
 * Contextual export affordance: appears only when the comp's background is a
 * video. Renders a branded video (overlays burned onto the live frames) and
 * either downloads it or saves it back to the Library. The render + save run
 * through the shared upload panel, so there's a live progress bar and a
 * don't-refresh guard (refreshing mid-render kills it).
 *
 * Lives inside the Toolcraft canvas to read live Studio values, but portals to
 * <body> so `position: fixed` escapes the canvas's zoom/pan transform.
 */
export function StudioVideoExportButton(): React.JSX.Element | null {
  const { state } = useToolcraft();
  const project = useProject();
  const [busy, setBusy] = React.useState(false);

  const values = readStudioValues(state.values);
  const asset = values.imageInclude
    ? project.assets.find((candidate) => candidate.id === values.imageAssetId)
    : undefined;
  if (!asset || asset.kind !== "video") {
    return null;
  }

  const runExport = async (mode: "download" | "library"): Promise<void> => {
    if (busy) return;
    if (!isVideoExportSupported()) {
      toast.error("This browser can’t record video. Try Chrome, Edge, or Safari.");
      return;
    }
    setBusy(true);
    const uploadId = beginUpload({ kind: "video", label: `${asset.name} (video)` });
    try {
      const rendered = await renderStudioVideo({
        asset,
        assets: project.assets,
        brand: project.brand,
        // Rendering is real-time; for the library path leave headroom for the upload.
        onProgress: (fraction) =>
          updateUpload(uploadId, {
            fraction: mode === "library" ? fraction * 0.8 : fraction,
            phase: "rendering",
          }),
        values,
      });
      if (mode === "download") {
        downloadBlob(rendered.blob, rendered.filename);
        finishUpload(uploadId);
        toast.success(`Exported ${rendered.filename}`);
        return;
      }
      updateUpload(uploadId, {
        detail: "Saving to Library…",
        fraction: 0.85,
        phase: "uploading",
      });
      // Use a clean base MIME (MediaRecorder tags codecs onto the type, which
      // the importer's exact video/* match would otherwise reject).
      const baseMime = rendered.extension === "mp4" ? "video/mp4" : "video/webm";
      const file = new File([rendered.blob], rendered.filename, { type: baseMime });
      const destination = exportDestination(getFormat(values.formatId));
      const [saved] = await saveImagesToLibrary([file], destination);
      finishUpload(uploadId);
      toast.success(
        saved ? `Saved to “${destination.boardPath.join(" / ")}”` : "Saved to Library",
      );
    } catch (error) {
      failUpload(uploadId, (error as Error).message);
      toast.error(
        `Video ${mode === "download" ? "export" : "save"} failed: ${(error as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div className="fixed bottom-[76px] left-4 z-30">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className="flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_92%,transparent)] px-4 py-2 text-xs-plus font-medium text-foreground shadow-2xl backdrop-blur transition-transform hover:border-[color:var(--accent)] active:scale-95 disabled:opacity-60"
              disabled={busy}
              title="Render this video with your overlays burned in"
              type="button"
            >
              <span aria-hidden>▶</span>
              {busy ? "Working…" : "Export video"}
            </button>
          }
        />
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuItem onClick={() => void runExport("download")}>
            Download
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void runExport("library")}>
            Save to Library
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>,
    document.body,
  );
}
