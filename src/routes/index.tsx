import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";
import { ToolcraftApp } from "@/toolcraft/runtime/react";
import { toast } from "sonner";

import { appSchema } from "../app/app-schema";
import { getProjectSnapshot } from "../app/data/project-store";
import { readStudioValues, type StudioValues } from "../app/studio/comp-layout";
import { CompRenderer } from "../app/studio/comp-renderer";
import { downloadBlob, renderStudioExport } from "../app/studio/export";
import { ElementListControl } from "../app/studio/element-list-control";
import { FlourishControl } from "../app/studio/flourish-control";
import { LibraryImageControl } from "../app/studio/library-image-control";
import { addStudioCompToQueue, shuffleStudio } from "../app/studio/studio-actions";
import { VariationsModal } from "../app/studio/variations-modal";

const controlRenderers = {
  elementList: ElementListControl,
  flourish: FlourishControl,
  libraryImage: LibraryImageControl,
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
      <ToolcraftApp
        canvasContent={<CompRenderer />}
        className="h-full min-h-0"
        controlRenderers={controlRenderers}
        onPanelAction={handlePanelAction}
        renderDefaultCanvasMedia={false}
        schema={appSchema}
      />
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
