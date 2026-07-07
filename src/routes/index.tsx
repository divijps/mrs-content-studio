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
import { getFormat } from "../app/data/formats";
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

      switch (action.value) {
        case "export-png": {
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
