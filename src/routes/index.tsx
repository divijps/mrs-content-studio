import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";
import { ToolcraftApp } from "@/toolcraft/runtime/react";
import { toast } from "sonner";

import { appSchema } from "../app/app-schema";
import { getProjectSnapshot, requestLibraryAsset } from "../app/data/project-store";
import type { Asset } from "../app/data/types";
import { SessionRail } from "../app/studio/session-rail";
import { SaveCopyControl } from "../app/studio/copy-save-control";
import {
  TemplatePickerControl,
  TemplateSaveDialog,
} from "../app/studio/template-controls";
import { readStudioValues, type StudioValues } from "../app/studio/comp-layout";
import { CompRenderer } from "../app/studio/comp-renderer";
import { downloadBlob, renderTransparentCompPng, slugify } from "../app/studio/export";
import { ElementListControl } from "../app/studio/element-list-control";
import {
  ExportDestinationControl,
  ExportFormatsControl,
} from "../app/studio/export-controls";
import { ElementSpacingControl } from "../app/studio/element-spacing-control";
import { FlourishControl } from "../app/studio/flourish-control";
import {
  DistributionControl,
  LogoPlacementControl,
  PlacementControl,
} from "../app/studio/layout-controls";
import {
  LibraryImageControl,
  LibraryImagesControl,
} from "../app/studio/library-image-control";
import { MediaPositionControl } from "../app/studio/media-position-control";
import { MultilineTextControl } from "../app/studio/multiline-text-control";
import { SeparatorTextControl } from "../app/studio/separator-text-control";
import {
  beginUpload,
  failUpload,
  finishUpload,
  updateUpload,
} from "../app/data/upload-store";
import { findCompVideoAsset } from "../app/studio/video-export";
import { exportDestination, saveImagesToLibrary, STUDIO_BOARD_NAME } from "../app/studio/save-to-library";
import {
  bundleStudioExport,
  renderStudioFormatFiles,
  stillEncodingOf,
  studioExportKey,
  type RenderedFormat,
} from "../app/studio/studio-multi-export";
import { shuffleStudio } from "../app/studio/studio-actions";
import { VariationsModal } from "../app/studio/variations-modal";

interface SaveOutcome {
  boardLabel: string;
  existed: number;
  firstAsset: Asset | null;
  saved: number;
}

function boardNameOf(asset: Asset): string {
  if (!asset.collectionId) {
    return "Library";
  }
  return (
    getProjectSnapshot().collections.find((c) => c.id === asset.collectionId)?.name ??
    "Library"
  );
}

/** Find an already-saved Library asset for a design-state key, if any. */
function findSavedByKey(key: string): Asset | null {
  return (
    getProjectSnapshot().assets.find((asset) => asset.importFingerprint === key) ?? null
  );
}

/**
 * File already-rendered formats into the Library, keyed on the design state so a
 * copy that already exists is reported (never re-saved). `keyOf` gives each
 * format's design-state key; the saved asset stores it as its fingerprint.
 */
async function saveRenderedToLibrary(
  rendered: RenderedFormat[],
  board: string,
  keyOf: (formatId: string) => string,
  sourceValues: Record<string, unknown>,
): Promise<SaveOutcome> {
  let saved = 0;
  let existed = 0;
  let firstAsset: Asset | null = null;
  let boardLabel = board;
  for (const item of rendered) {
    const key = keyOf(item.format.id);
    const known = findSavedByKey(key);
    if (known) {
      existed += 1;
      firstAsset = firstAsset ?? known;
      boardLabel = boardNameOf(known);
      continue;
    }
    const [asset] = await saveImagesToLibrary([item.file], {
      ...exportDestination(item.format, board),
      fingerprints: [key],
      sourceValues,
    });
    if (asset) {
      saved += 1;
      firstAsset = firstAsset ?? asset;
    }
  }
  return { boardLabel, existed, firstAsset, saved };
}

const controlRenderers = {
  distribution: DistributionControl,
  elementList: ElementListControl,
  elementSpacing: ElementSpacingControl,
  exportDestination: ExportDestinationControl,
  exportFormats: ExportFormatsControl,
  flourish: FlourishControl,
  logoPlacement: LogoPlacementControl,
  placement: PlacementControl,
  libraryImage: LibraryImageControl,
  libraryImages: LibraryImagesControl,
  mediaPosition: MediaPositionControl,
  multilineText: MultilineTextControl,
  saveCopy: SaveCopyControl,
  separatorText: SeparatorTextControl,
  templatePicker: TemplatePickerControl,
};

export function AppHome(): React.JSX.Element {
  const navigate = useNavigate();
  const [variationsBase, setVariationsBase] = React.useState<StudioValues | null>(null);
  const [templateDraft, setTemplateDraft] = React.useState<StudioValues | null>(null);

  const handlePanelAction = React.useCallback(
    async (context: ToolcraftPanelActionContext): Promise<void> => {
      const { action, dispatch, reportProgress, state } = context;

      // A "View" toast action that jumps to the saved file in the Library.
      const viewAction = (asset: Asset | null) =>
        asset
          ? {
              action: {
                label: "View",
                onClick: () => {
                  requestLibraryAsset(asset.id);
                  void navigate({ to: "/library" });
                },
              },
            }
          : {};

      // The platform sizes to render — the Export panel's multi-select, with a
      // fallback to the live canvas format so Export always has a target.
      const readExportFormats = (): string[] => {
        const raw = state.values["export.formats"];
        const list = Array.isArray(raw)
          ? raw.filter((entry): entry is string => typeof entry === "string")
          : [];
        return list.length > 0 ? list : [readStudioValues(state.values).formatId];
      };
      const readDestinationBoard = (): string => {
        const raw = state.values["export.destinationBoard"];
        return typeof raw === "string" && raw ? raw : STUDIO_BOARD_NAME;
      };

      // Design-state key per format — computed from the current settings BEFORE
      // rendering, so an unchanged re-save is recognized without re-rendering.
      const buildKeyOf = (): ((formatId: string) => string) => {
        const project = getProjectSnapshot();
        const values = readStudioValues(state.values);
        const isVideo = Boolean(findCompVideoAsset(values, project.assets));
        const encoding = stillEncodingOf(state.values["export.image.format"]);
        const video = {
          audio: state.values["export.video.audio"] !== false,
          format: (state.values["export.video.format"] === "webm" ? "webm" : "mp4") as
            | "mp4"
            | "webm",
        };
        return (formatId: string) =>
          studioExportKey({ encoding, formatId, isVideo, values, video });
      };

      /**
       * Render the current artboard across the selected formats. A video
       * background renders in real time, so it runs under the upload panel's
       * "keep this tab open" guard (beforeunload + progress row).
       */
      const renderFormats = async (
        formatIds: string[],
      ): Promise<{ rendered: RenderedFormat[]; uploadId: string | null }> => {
        const project = getProjectSnapshot();
        const values = readStudioValues(state.values);
        const video = findCompVideoAsset(values, project.assets);
        const uploadId = video
          ? beginUpload({ kind: "video", label: `${video.name} (video)` })
          : null;
        try {
          const rendered = await renderStudioFormatFiles({
            assets: project.assets,
            brand: project.brand,
            encoding: stillEncodingOf(state.values["export.image.format"]),
            formatIds,
            onProgress: (fraction) => {
              reportProgress(fraction * 0.95);
              if (uploadId) {
                updateUpload(uploadId, { fraction: fraction * 0.9, phase: "rendering" });
              }
            },
            values,
            video: {
              audio: state.values["export.video.audio"] !== false,
              format: state.values["export.video.format"] === "webm" ? "webm" : "mp4",
            },
          });
          return { rendered, uploadId };
        } catch (error) {
          if (uploadId) {
            failUpload(uploadId, (error as Error).message);
          }
          throw error;
        }
      };

      switch (action.value) {
        // Primary Export: render every selected format at its optimal setting,
        // download it (bare file or a ZIP for several), AND file it into the
        // Library — a one-click "get the deliverable + keep a copy". A video
        // background renders branded MP4/WebM. ("export-png" is an old alias.)
        case "export-png":
        case "export-comp": {
          const formatIds = readExportFormats();
          const board = readDestinationBoard();
          const keyOf = buildKeyOf();
          let uploadId: string | null = null;
          try {
            // Export always renders (the download is the point), then files the
            // result into the Library — reusing any copy already saved for this
            // exact state instead of writing a duplicate.
            const result = await renderFormats(formatIds);
            uploadId = result.uploadId;
            const bundle = await bundleStudioExport(result.rendered);
            downloadBlob(bundle.blob, bundle.filename);
            if (uploadId) {
              updateUpload(uploadId, {
                detail: "Saving to Library…",
                fraction: 0.94,
                phase: "uploading",
              });
            }
            const outcome = await saveRenderedToLibrary(
              result.rendered,
              board,
              keyOf,
              readStudioValues(state.values) as unknown as Record<string, unknown>,
            );
            if (uploadId) {
              finishUpload(uploadId);
            }
            reportProgress(1);
            const headline = bundle.single
              ? `Exported ${bundle.filename}`
              : `Exported ${bundle.count} formats`;
            const savedNote =
              outcome.saved === 0 && outcome.existed > 0
                ? `Already in “${outcome.boardLabel}”`
                : outcome.existed > 0
                  ? `Saved ${outcome.saved} to “${board}”, ${outcome.existed} already there`
                  : `Saved to “${board}”`;
            toast.success(headline, {
              description: savedNote,
              ...viewAction(outcome.firstAsset),
            });
          } catch (error) {
            if (uploadId) {
              failUpload(uploadId, (error as Error).message);
            }
            toast.error(`Export failed: ${(error as Error).message}`);
          }
          return;
        }
        // Save to Library only (no download). Duplicate-guarded BEFORE rendering:
        // any format already saved for this exact state is skipped entirely — if
        // every format is already there, nothing re-renders; the toast just says
        // "already saved" and jumps to the file.
        case "save-to-library": {
          const formatIds = readExportFormats();
          const board = readDestinationBoard();
          const keyOf = buildKeyOf();

          const toRender = formatIds.filter((id) => !findSavedByKey(keyOf(id)));
          const alreadySaved = formatIds.length - toRender.length;

          if (toRender.length === 0) {
            const first = findSavedByKey(keyOf(formatIds[0]!));
            const boardLabel = first ? boardNameOf(first) : board;
            toast.success(
              formatIds.length === 1
                ? `Already saved to “${boardLabel}”`
                : `All ${formatIds.length} formats already in “${boardLabel}”`,
              viewAction(first),
            );
            return;
          }

          const saving = toast.loading("Saving to Library…");
          let uploadId: string | null = null;
          try {
            const result = await renderFormats(toRender);
            uploadId = result.uploadId;
            if (uploadId) {
              updateUpload(uploadId, {
                detail: "Saving to Library…",
                fraction: 0.94,
                phase: "uploading",
              });
            }
            const outcome = await saveRenderedToLibrary(
              result.rendered,
              board,
              keyOf,
              readStudioValues(state.values) as unknown as Record<string, unknown>,
            );
            if (uploadId) {
              finishUpload(uploadId);
            }
            reportProgress(1);
            const message =
              alreadySaved > 0
                ? `Saved ${outcome.saved} to “${board}”, ${alreadySaved} already there`
                : outcome.saved === 1
                  ? `Saved to “${board}”`
                  : `Saved ${outcome.saved} formats to “${board}” — one sub-board per type`;
            toast.success(message, { id: saving, ...viewAction(outcome.firstAsset) });
          } catch (error) {
            if (uploadId) {
              failUpload(uploadId, (error as Error).message);
            }
            toast.error(`Save failed: ${(error as Error).message}`, { id: saving });
          }
          return;
        }
        // Overlay-only PNG (transparent background, no media) → onto Instagram.
        //
        // Two device paths, because image-clipboard on iPad Safari is
        // unreliable (it can report success yet paste nothing):
        //
        // - TOUCH devices (iPad/iPhone): the native SHARE SHEET. Renders the
        //   PNG, hands it to navigator.share({ files }) → the user taps "Save
        //   Image" (Photos keeps the alpha) or shares straight to Instagram,
        //   then adds it as a story photo-sticker. This is the reliable route
        //   to the actual goal and sidesteps the clipboard entirely.
        // - DESKTOP: clipboard copy. clipboard.write runs inside the click's
        //   task (the chain PanelActions onClick → runAction → onPanelAction →
        //   here is synchronous, nothing awaited before write) and the
        //   ClipboardItem carries the PENDING render promise — paste anywhere.
        //
        // Either path falls back to a download so the intent never dies.
        case "copy-transparent": {
          const project = getProjectSnapshot();
          const values = readStudioValues(state.values);
          const filename = `${slugify(values.headingText)}-transparent.png`;
          // Kick the render immediately; desktop hands the PENDING promise to
          // ClipboardItem, touch awaits it for the share sheet.
          const png = renderTransparentCompPng({
            assets: project.assets,
            brand: project.brand,
            values,
          });

          const downloadInstead = async (note: string): Promise<void> => {
            try {
              downloadBlob(await png, filename);
              toast.success(note);
            } catch (error) {
              toast.error(`Copy transparent failed: ${(error as Error).message}`);
            }
          };

          // Touch → share sheet (Save to Photos / send to Instagram).
          const file = new File([new Blob()], filename, { type: "image/png" });
          const canShareFile =
            typeof navigator.share === "function" &&
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [file] });
          if (navigator.maxTouchPoints > 0 && canShareFile) {
            try {
              const shareFile = new File([await png], filename, { type: "image/png" });
              await navigator.share({ files: [shareFile] });
            } catch (error) {
              // User dismissed the sheet — nothing to do; otherwise download.
              if ((error as { name?: string })?.name !== "AbortError") {
                await downloadInstead("Downloaded the transparent PNG");
              }
            }
            return;
          }

          // Desktop → clipboard copy.
          const clipboardReady =
            window.isSecureContext &&
            typeof ClipboardItem !== "undefined" &&
            typeof navigator.clipboard?.write === "function" &&
            (typeof ClipboardItem.supports !== "function" ||
              ClipboardItem.supports("image/png"));
          if (!clipboardReady) {
            await downloadInstead(
              "Clipboard images aren’t supported here — downloaded the PNG instead",
            );
            return;
          }
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
            toast.success("Transparent PNG copied", {
              description: "Paste it onto your content — Instagram adds it as a sticker.",
            });
          } catch (error) {
            await downloadInstead(
              (error as { name?: string })?.name === "NotAllowedError"
                ? "Clipboard access was blocked — downloaded the PNG instead"
                : "Copy didn’t go through — downloaded the PNG instead",
            );
          }
          return;
        }
        case "generate-variations": {
          setVariationsBase(readStudioValues(state.values));
          return;
        }
        case "save-template": {
          setTemplateDraft(readStudioValues(state.values));
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
    [navigate],
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-row">
        <SessionRail onVariations={setVariationsBase} />
        <div className="min-h-0 min-w-0 flex-1">
          <ToolcraftApp
            canvasContent={<CompRenderer />}
            className="h-full min-h-0"
            controlRenderers={controlRenderers}
            onPanelAction={handlePanelAction}
            renderDefaultCanvasMedia={false}
            schema={appSchema}
          />
        </div>
      </div>
      {variationsBase ? (
        <VariationsModal
          base={variationsBase}
          onClose={() => setVariationsBase(null)}
          onGenerated={() => setVariationsBase(null)}
        />
      ) : null}
      {templateDraft ? (
        <TemplateSaveDialog base={templateDraft} onClose={() => setTemplateDraft(null)} />
      ) : null}
    </>
  );
}
