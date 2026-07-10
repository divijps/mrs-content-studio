import * as React from "react";
import { createPortal } from "react-dom";

import { useToolcraft } from "@/toolcraft/runtime/react";
import { toast } from "sonner";

import { useProject } from "../data/project-store";
import { readStudioValues } from "./comp-layout";
import { downloadBlob } from "./export";
import { isVideoExportSupported, renderStudioVideo } from "./video-export";

/**
 * Contextual export affordance: only appears when the comp's background is a
 * video, and renders a branded video (overlays burned onto the live frames).
 * Lives inside the Toolcraft canvas so it can read live Studio values; the
 * panel's "Export PNG" still works too (it exports the poster still).
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

  const handleExport = async (): Promise<void> => {
    if (!isVideoExportSupported()) {
      toast.error("This browser can’t record video. Try Chrome, Edge, or Safari.");
      return;
    }
    setBusy(true);
    const toastId = toast.loading("Rendering video… 0%");
    try {
      const rendered = await renderStudioVideo({
        asset,
        assets: project.assets,
        brand: project.brand,
        onProgress: (fraction) =>
          toast.loading(`Rendering video… ${Math.round(fraction * 100)}%`, { id: toastId }),
        values,
      });
      downloadBlob(rendered.blob, rendered.filename);
      toast.success(`Exported ${rendered.filename}`, { id: toastId });
    } catch (error) {
      toast.error(`Video export failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") {
    return null;
  }
  // Portal to <body>: the Studio canvas has a zoom/pan transform, which would
  // make `position: fixed` relative to that ancestor instead of the viewport.
  return createPortal(
    <button
      className="fixed bottom-[76px] left-4 z-30 flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_92%,transparent)] px-4 py-2 text-xs-plus font-medium text-foreground shadow-2xl backdrop-blur transition-transform hover:border-[color:var(--accent)] active:scale-95 disabled:opacity-60"
      disabled={busy}
      onClick={() => void handleExport()}
      title="Render this video with your overlays burned in"
      type="button"
    >
      <span aria-hidden>▶</span>
      {busy ? "Rendering…" : "Export video"}
    </button>,
    document.body,
  );
}
