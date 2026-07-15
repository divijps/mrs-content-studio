import * as React from "react";

import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  ImagesIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  addAssetVersion,
  createId,
  deleteAssetVersion,
  getProjectSnapshot,
  setCurrentAssetVersion,
  useProject,
} from "../data/project-store";
import { cloneCurrentVersion } from "../data/asset-versions";
import { importFiles } from "../data/import-assets";
import { downloadFromUrl } from "../data/download";
import type { Asset, AssetVersion } from "../data/types";

/** Compact relative time for version attribution lines. */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ACTION_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)] transition-colors hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--foreground)] disabled:opacity-40";

/** The Versions section shown in the asset viewer sidebar: the version stack
 * plus an "Add version" dialog (upload a file, or attribute an existing asset). */
export function AssetVersionsPanel(props: { asset: Asset }): React.JSX.Element {
  const { asset } = props;
  const [adding, setAdding] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const download = (version: AssetVersion): void => {
    const ext = (version.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "img").toLowerCase();
    const label = version.label ? `-${version.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
    const done = toast.loading("Downloading…");
    void downloadFromUrl(version.url, `${asset.name}${label}.${ext}`)
      .then(() => toast.success("Downloaded", { id: done }))
      .catch(() => toast.error("Download failed.", { id: done }));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="ds-label">Versions</span>
        <button
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-medium text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
          onClick={() => setAdding(true)}
          type="button"
        >
          <PlusIcon size={13} weight="bold" />
          Add version
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {asset.versions.map((version, index) => {
          const isCurrent = version.id === asset.currentVersionId;
          const label = version.label || `Version ${index + 1}`;
          const bits = [version.createdBy || "Someone", ago(version.createdAt)];
          if (version.sourcedFromAssetId) bits.push("from library");
          return (
            <div
              className={`flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${
                isCurrent
                  ? "bg-[color:var(--surface-active)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--accent)_45%,transparent)]"
                  : "bg-[color:var(--surface-inactive)] hover:bg-[color:var(--surface-active)]"
              }`}
              key={version.id}
            >
              <img
                alt=""
                className="h-11 w-11 shrink-0 rounded-md object-cover"
                loading="lazy"
                src={version.thumbUrl || version.url}
                style={{ objectPosition: `${version.focalPoint.x * 100}% ${version.focalPoint.y * 100}%` }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{label}</span>
                  {isCurrent ? (
                    <span className="shrink-0 rounded-full bg-[color:color-mix(in_oklab,var(--accent)_28%,transparent)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[color:var(--foreground)]">
                      Current
                    </span>
                  ) : null}
                </div>
                <span className="truncate text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                  {bits.join(" · ")}
                </span>
              </div>

              {confirmId === version.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="rounded-md px-2 py-1 text-2xs font-semibold text-[#e5675f] transition-colors hover:bg-[color:var(--surface-raised)]"
                    onClick={() => {
                      deleteAssetVersion(asset.id, version.id);
                      setConfirmId(null);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                  <button
                    className="rounded-md px-2 py-1 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:bg-[color:var(--surface-raised)]"
                    onClick={() => setConfirmId(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-0.5">
                  {!isCurrent ? (
                    <button
                      aria-label="Make current"
                      className={ACTION_BTN}
                      onClick={() => setCurrentAssetVersion(asset.id, version.id)}
                      title="Make current"
                      type="button"
                    >
                      <ArrowCounterClockwiseIcon size={15} />
                    </button>
                  ) : null}
                  <button
                    aria-label="Download version"
                    className={ACTION_BTN}
                    onClick={() => download(version)}
                    title="Download"
                    type="button"
                  >
                    <DownloadSimpleIcon size={15} />
                  </button>
                  {!isCurrent && asset.versions.length > 1 ? (
                    <button
                      aria-label="Remove version"
                      className={ACTION_BTN}
                      onClick={() => setConfirmId(version.id)}
                      title="Remove"
                      type="button"
                    >
                      <TrashIcon size={15} />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? <AddVersionDialog asset={asset} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

/** Modal for adding a version — upload a fresh file, or attribute an existing
 * Library asset (zero-copy: the new version references the picked asset's bytes). */
function AddVersionDialog(props: { asset: Asset; onClose: () => void }): React.JSX.Element {
  const { asset, onClose } = props;
  const project = useProject();
  const [mode, setMode] = React.useState<"upload" | "library">("upload");
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const displayName = project.settings.displayName ?? null;

  const handleUpload = async (file: File): Promise<void> => {
    setBusy(true);
    const done = toast.loading("Reading file…");
    try {
      const snapshot = getProjectSnapshot();
      const result = await importFiles({
        addedBy: displayName,
        collectionId: null,
        collectionName: asset.name,
        existing: [],
        files: [file],
      });
      const read = result.assets[0];
      if (!read) {
        toast.error("That file isn't a supported image or video.", { id: done });
        setBusy(false);
        return;
      }
      const versionId = createId("ver");
      // Inherit the asset's current focal point so a re-upload keeps the crop.
      const version: AssetVersion = {
        ...cloneCurrentVersion(read, {
          createdAt: new Date().toISOString(),
          createdBy: displayName,
          id: versionId,
        }),
        focalPoint: asset.focalPoint,
      };
      if (snapshot.source === "cloud") {
        toast.loading("Uploading…", { id: done });
        const { uploadAssetVersion } = await import("../data/backend/supabase-backend");
        const source = result.sources.get(read.id);
        if (!source) {
          toast.error("Upload failed.", { id: done });
          setBusy(false);
          return;
        }
        const uploaded = await uploadAssetVersion(
          asset.id,
          version,
          source,
          result.posters.get(read.id),
        );
        addAssetVersion(asset.id, uploaded);
      } else {
        addAssetVersion(asset.id, version);
      }
      toast.success("New version added.", { id: done });
      onClose();
    } catch (error) {
      toast.error(`Couldn't add version: ${(error as Error).message}`, { id: done });
      setBusy(false);
    }
  };

  const attributeFrom = (sourceAsset: Asset): void => {
    const versionId = createId("ver");
    const version = cloneCurrentVersion(sourceAsset, {
      createdAt: new Date().toISOString(),
      createdBy: displayName,
      id: versionId,
      label: sourceAsset.name,
      sourcedFromAssetId: sourceAsset.id,
    });
    addAssetVersion(asset.id, version);
    toast.success(`Added a version from ${sourceAsset.name}.`);
    onClose();
  };

  const needle = query.trim().toLowerCase();
  const candidates = project.assets.filter(
    (candidate) =>
      candidate.id !== asset.id &&
      (!needle ||
        candidate.name.toLowerCase().includes(needle) ||
        candidate.filename.toLowerCase().includes(needle)),
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-[color:var(--popover)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-3">
          <span className="text-sm font-semibold">Add a version</span>
          <button
            aria-label="Close"
            className={ACTION_BTN}
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          {(["upload", "library"] as const).map((tab) => (
            <button
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === tab
                  ? "bg-[color:var(--surface-active)] text-[color:var(--foreground)]"
                  : "text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)] hover:bg-[color:var(--surface-inactive)]"
              }`}
              key={tab}
              onClick={() => setMode(tab)}
              type="button"
            >
              {tab === "upload" ? <UploadSimpleIcon size={15} /> : <ImagesIcon size={15} />}
              {tab === "upload" ? "Upload" : "From library"}
            </button>
          ))}
        </div>

        {mode === "upload" ? (
          <div className="p-4">
            <input
              accept="image/*,video/*,.heic,.heif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
                event.target.value = "";
              }}
              ref={fileRef}
              type="file"
            />
            <button
              className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:color-mix(in_oklab,var(--border)_35%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)] disabled:opacity-50"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              <UploadSimpleIcon size={26} />
              <span className="text-sm">{busy ? "Working…" : "Choose an image or video"}</span>
              <span className="text-2xs">Becomes the new current version</span>
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col p-4">
            <input
              className="mb-3 h-9 w-full rounded-lg border-0 bg-[color:var(--surface-inactive)] px-3 text-sm outline-none placeholder:text-[color:var(--text-muted)] focus:bg-[color:var(--surface-active)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the library…"
              value={query}
            />
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto">
              {candidates.map((candidate) => (
                <button
                  className="group relative aspect-square overflow-hidden rounded-lg bg-[color:var(--surface-inactive)] ring-0 ring-[color:var(--accent)] transition-all hover:ring-2"
                  disabled={busy}
                  key={candidate.id}
                  onClick={() => attributeFrom(candidate)}
                  title={candidate.name}
                  type="button"
                >
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={candidate.thumbUrl || candidate.url}
                    style={{ objectPosition: `${candidate.focalPoint.x * 100}% ${candidate.focalPoint.y * 100}%` }}
                  />
                </button>
              ))}
              {candidates.length === 0 ? (
                <p className="col-span-3 py-8 text-center text-sm text-[color:var(--text-muted)]">
                  No other assets to pick from.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
