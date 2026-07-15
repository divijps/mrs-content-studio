/**
 * Asset versioning helpers.
 *
 * An asset is a stable identity + a stack of {@link AssetVersion}s + a
 * `currentVersionId`. The asset's flat fields (`url`, `thumbUrl`, `width`,
 * `height`, `sizeBytes`, `filename`, `durationSec`, `focalPoint`, `sourceValues`)
 * are a *denormalized mirror* of the current version, so every existing
 * `assets.find(id)` resolve/crop site keeps working untouched — switching the
 * current version just recomputes the mirror here.
 *
 * These helpers import only types (no `project-store`) to stay cycle-free, and
 * synthesize a deterministic v1 id so repeated hydrates of a legacy row don't
 * churn `currentVersionId`.
 */

import type { Asset, AssetVersion } from "./types";

/** Storage pointers for a version's bytes (empty in demo mode). */
export interface VersionStoragePaths {
  storagePath: string;
  thumbPath: string;
}

/**
 * Deterministic id for an asset's synthesized v1. Must be stable across hydrates
 * so a legacy row (no persisted versions) always backfills the same
 * `currentVersionId` and version-scoped comments keep matching.
 */
export function syntheticVersionId(assetId: string): string {
  return `ver-${assetId}`;
}

/**
 * Build a single "v1" version from an asset's existing flat fields. Used to
 * backfill any asset arriving without a `versions[]` (demo seed + legacy cloud
 * rows), so the rest of the app always sees ≥1 version.
 */
export function synthesizeVersion(asset: Asset, paths?: VersionStoragePaths): AssetVersion {
  return {
    createdAt: asset.createdAt,
    createdBy: asset.addedBy ?? null,
    durationSec: asset.durationSec,
    filename: asset.filename,
    focalPoint: asset.focalPoint,
    height: asset.height,
    id: syntheticVersionId(asset.id),
    importFingerprint: asset.importFingerprint,
    kind: asset.kind,
    sizeBytes: asset.sizeBytes,
    sourceValues: asset.sourceValues,
    storagePath: paths?.storagePath ?? "",
    thumbPath: paths?.thumbPath ?? "",
    thumbUrl: asset.thumbUrl,
    url: asset.url,
    width: asset.width,
  };
}

/**
 * Guarantee the versioning invariant: a non-empty `versions[]` with a valid
 * `currentVersionId`. If versions already exist, only repair a dangling/missing
 * current pointer; otherwise synthesize v1 from the flat fields.
 */
export function ensureAssetVersions(asset: Asset, paths?: VersionStoragePaths): Asset {
  if (asset.versions && asset.versions.length > 0) {
    const hasCurrent = asset.versions.some((version) => version.id === asset.currentVersionId);
    return hasCurrent ? asset : { ...asset, currentVersionId: asset.versions[0]!.id };
  }
  const first = synthesizeVersion(asset, paths);
  return { ...asset, currentVersionId: first.id, versions: [first] };
}

/** The subset of an asset's flat fields that mirror its current version. */
export type CurrentVersionMirror = Pick<
  Asset,
  | "currentVersionId"
  | "durationSec"
  | "filename"
  | "focalPoint"
  | "height"
  | "kind"
  | "sizeBytes"
  | "sourceValues"
  | "thumbUrl"
  | "url"
  | "width"
>;

/** Compute the flat-field patch that mirrors `version`. `kind` mirrors too — a
 * video uploaded as a new version of a photo asset must flip every kind-keyed
 * renderer (players, planner thumbs, export) along with the bytes. */
export function currentVersionMirror(version: AssetVersion): CurrentVersionMirror {
  return {
    currentVersionId: version.id,
    durationSec: version.durationSec,
    filename: version.filename,
    focalPoint: version.focalPoint,
    height: version.height,
    kind: version.kind,
    sizeBytes: version.sizeBytes,
    sourceValues: version.sourceValues,
    thumbUrl: version.thumbUrl,
    url: version.url,
    width: version.width,
  };
}

/**
 * Return `asset` with its flat fields (and `currentVersionId`) mirroring the
 * named version. No-op if the version isn't found.
 */
export function applyCurrentVersion(asset: Asset, versionId: string): Asset {
  const version = asset.versions.find((candidate) => candidate.id === versionId);
  if (!version) return asset;
  return { ...asset, ...currentVersionMirror(version) };
}

/**
 * Strip runtime-only fields (`url`/`thumbUrl`) before persisting a version into
 * the `versions` jsonb — they are re-derived from the storage paths at hydrate,
 * so storing them would only risk going stale.
 */
export function serializeVersion(version: AssetVersion): Omit<AssetVersion, "url" | "thumbUrl"> {
  const { url: _url, thumbUrl: _thumbUrl, ...persisted } = version;
  return persisted;
}

/**
 * Build a new version by cloning an asset's current version under a fresh id.
 * Two callers:
 *  - **Upload** — pass the throwaway asset produced by reading the picked file
 *    (its current version carries the object URL and an empty `storagePath`,
 *    which the cloud upload then fills).
 *  - **Attribute from library** — pass the existing Library asset the user
 *    picked; its current version's storage paths come along, so the new version
 *    references the *same stored bytes* (zero-copy) and `sourcedFromAssetId`
 *    records the provenance. No upload needed.
 */
export function cloneCurrentVersion(
  source: Asset,
  opts: {
    createdAt: string;
    createdBy?: string | null;
    id: string;
    label?: string;
    sourcedFromAssetId?: string | null;
  },
): AssetVersion {
  const current =
    source.versions.find((version) => version.id === source.currentVersionId) ??
    source.versions[0];
  return {
    createdAt: opts.createdAt,
    createdBy: opts.createdBy ?? null,
    durationSec: current?.durationSec ?? source.durationSec,
    filename: current?.filename ?? source.filename,
    focalPoint: current?.focalPoint ?? source.focalPoint,
    height: current?.height ?? source.height,
    id: opts.id,
    importFingerprint: current?.importFingerprint ?? source.importFingerprint,
    kind: current?.kind ?? source.kind,
    label: opts.label,
    sizeBytes: current?.sizeBytes ?? source.sizeBytes,
    sourceValues: current?.sourceValues ?? source.sourceValues,
    sourcedFromAssetId: opts.sourcedFromAssetId ?? null,
    storagePath: current?.storagePath ?? "",
    thumbPath: current?.thumbPath ?? "",
    thumbUrl: current?.thumbUrl ?? source.thumbUrl,
    url: current?.url ?? source.url,
    width: current?.width ?? source.width,
  };
}
