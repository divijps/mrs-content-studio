import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";
import { ToolcraftApp } from "@/toolcraft/runtime/react";
import { toast } from "sonner";

import { appSchema } from "../app/app-schema";
import { getProjectSnapshot } from "../app/data/project-store";
import { ArtboardTray } from "../app/studio/artboard-tray";
import { readStudioValues, type StudioValues } from "../app/studio/comp-layout";
import { CompRenderer } from "../app/studio/comp-renderer";
import { downloadBlob, renderStudioExport } from "../app/studio/export";
import { ElementListControl } from "../app/studio/element-list-control";
import { FlourishControl } from "../app/studio/flourish-control";
import {
  LibraryImageControl,
  LibraryImagesControl,
} from "../app/studio/library-image-control";
import { MultilineTextControl } from "../app/studio/multiline-text-control";
import { SeparatorTextControl } from "../app/studio/separator-text-control";
import {
  beginUpload,
  failUpload,
  finishUpload,
  updateUpload,
} from "../app/data/upload-store";
import { findCompVideoAsset, renderStudioVideo } from "../app/studio/video-export";
import { getFormat } from "../app/data/formats";
import type { Asset } from "../app/data/types";
import { exportDestination, saveImagesToLibrary } from "../app/studio/save-to-library";
import { addStudioCompToQueue, shuffleStudio } from "../app/studio/studio-actions";
import { VariationsModal } from "../app/studio/variations-modal";

const controlRenderers = {
  elementList: ElementListControl,
  flourish: FlourishControl,
  libraryImage: LibraryImageControl,
  libraryImages: LibraryImagesControl,
  multilineText: MultilineTextControl,
  separatorText: SeparatorTextControl,
};

export function AppHome(): React.JSX.Element {
  const navigate = useNavigate();
  const [variationsBase, setVariationsBase] = React.useState<StudioValues | null>(null);

  const handlePanelAction = React.useCallback(
    async (context: ToolcraftPanelActionContext): Promise<void> => {
      const { action, dispatch, reportProgress, state } = context;

      // The comp's background media, when it's a video — export actions then
      // produce a branded video instead of a still.
      const backgroundVideo = (): Asset | undefined =>
        findCompVideoAsset(readStudioValues(state.values), getProjectSnapshot().assets);

      /** Render the branded video with panel progress + the upload-store guard
       * (a real-time render must survive the user's patience — the panel says
       * "don't refresh" and beforeunload confirms). */
      const renderVideo = async (asset: Asset) => {
        const project = getProjectSnapshot();
        const values = readStudioValues(state.values);
        const uploadId = beginUpload({ kind: "video", label: `${asset.name} (video)` });
        try {
          const rendered = await renderStudioVideo({
            asset,
            assets: project.assets,
            brand: project.brand,
            includeAudio: state.values["export.video.audio"] !== false,
            onProgress: (fraction) => {
              reportProgress(fraction * 0.95);
              updateUpload(uploadId, { fraction: fraction * 0.9, phase: "rendering" });
            },
            preferredFormat:
              state.values["export.video.format"] === "webm" ? "webm" : "mp4",
            values,
          });
          return { rendered, uploadId };
        } catch (error) {
          failUpload(uploadId, (error as Error).message);
          throw error;
        }
      };

      switch (action.value) {
        // One Export action: a video background renders a branded video (per
        // the Video Export settings); anything else exports a still (per the
        // Image Export settings). "export-png" kept as an alias for old runs.
        case "export-png":
        case "export-comp": {
          const video = backgroundVideo();
          if (video) {
            try {
              const { rendered, uploadId } = await renderVideo(video);
              downloadBlob(rendered.blob, rendered.filename);
              finishUpload(uploadId);
              reportProgress(1);
              toast.success(`Exported ${rendered.filename}`);
            } catch (error) {
              toast.error(`Video export failed: ${(error as Error).message}`);
            }
            return;
          }
          const project = getProjectSnapshot();
          const exported = await renderStudioExport({
            assets: project.assets,
            brand: project.brand,
            reportProgress,
            state,
          });
          downloadBlob(exported.blob, exported.filename);
          reportProgress(1);
          toast.success(`Exported ${exported.filename}`);
          return;
        }
        case "add-to-queue": {
          const comp = addStudioCompToQueue(state);
          toast.success(`“${comp.name}” added to the queue`);
          return;
        }
        case "save-to-library": {
          const project = getProjectSnapshot();
          const video = backgroundVideo();
          if (video) {
            // Save the branded VIDEO (not a still) when the media is a video.
            try {
              const { rendered, uploadId } = await renderVideo(video);
              updateUpload(uploadId, {
                detail: "Saving to Library…",
                fraction: 0.92,
                phase: "uploading",
              });
              const baseMime = rendered.extension === "mp4" ? "video/mp4" : "video/webm";
              const file = new File([rendered.blob], rendered.filename, { type: baseMime });
              const destination = exportDestination(
                getFormat(readStudioValues(state.values).formatId),
              );
              const [saved] = await saveImagesToLibrary([file], destination);
              finishUpload(uploadId);
              reportProgress(1);
              toast.success(
                saved
                  ? `Saved to “${destination.boardPath.join(" / ")}”`
                  : "Saved to Library",
              );
            } catch (error) {
              toast.error(`Video save failed: ${(error as Error).message}`);
            }
            return;
          }
          const saving = toast.loading("Saving to Library…");
          try {
            const exported = await renderStudioExport({
              assets: project.assets,
              brand: project.brand,
              reportProgress,
              state,
            });
            const file = new File([exported.blob], exported.filename, {
              type: exported.mimeType,
            });
            const format = getFormat(readStudioValues(state.values).formatId);
            const destination = exportDestination(format);
            const [asset] = await saveImagesToLibrary([file], destination);
            reportProgress(1);
            toast.success(
              asset
                ? `Saved to “${destination.boardPath.join(" / ")}”`
                : "Saved to Library",
              { id: saving },
            );
          } catch (error) {
            toast.error(`Save failed: ${(error as Error).message}`, { id: saving });
          }
          return;
        }
        case "generate-variations": {
          setVariationsBase(readStudioValues(state.values));
          return;
        }
        case "shuffle-layout": {
          shuffleStudio(state, dispatch);
          return;
        }
        default:
          return;
      }
    },
    [],
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <ToolcraftApp
            canvasContent={<CompRenderer />}
            className="h-full min-h-0"
            controlRenderers={controlRenderers}
            onPanelAction={handlePanelAction}
            renderDefaultCanvasMedia={false}
            schema={appSchema}
          />
        </div>
        <ArtboardTray />
      </div>
      {variationsBase ? (
        <VariationsModal
          base={variationsBase}
          onClose={() => setVariationsBase(null)}
          onGenerated={() => {
            void navigate({ to: "/queue" });
          }}
        />
      ) : null}
    </>
  );
}
