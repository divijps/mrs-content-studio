/**
 * Supabase backend: hydration, realtime sync, mutations, and media upload.
 *
 * Write path: store actions call the registered ProjectBackend after applying
 * locally (optimistic). Read path: full hydrate on login, then realtime
 * postgres_changes trigger debounced refetches per table — simple and robust
 * for a small team, no per-event merge logic to get wrong.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";

import type {
  Asset,
  AssetVersion,
  BrandLink,
  Collection,
  Comp,
  CopyDeck,
  CopyFolder,
  CopySnippet,
  EmailDraft,
  JournalEntry,
  PinnedComment,
  PlannerGridSlot,
  PlannerState,
  QueueItem,
  ReviewStatus,
  Task,
  TaskStatus,
  TeamMember,
  Template,
} from "../types";
import { normalizeReviewStatus } from "../types";
import { ensureAssetVersions, serializeVersion } from "../asset-versions";
import type { ProjectBackend } from "../project-store";
import { getSupabaseClient, getSupabaseConfig } from "./config";

/** A version as persisted in the `assets.versions` jsonb (no derived URLs). */
type StoredVersion = Omit<AssetVersion, "url" | "thumbUrl">;

function asStatus(value: unknown): ReviewStatus {
  return normalizeReviewStatus(value);
}

/** ---- Row mappers -------------------------------------------------------- */

interface AssetRow {
  assigned_to: string | null;
  collection_id: string | null;
  created_at: string;
  created_by: string | null;
  current_version_id: string | null;
  duration_sec: number | null;
  favorited_by: string[] | null;
  filename: string;
  focal_x: number;
  focal_y: number;
  height: number;
  id: string;
  import_fingerprint: string | null;
  kind: string | null;
  name: string;
  size_bytes: number | null;
  source_values: Record<string, unknown> | null;
  status: string;
  storage_path: string;
  tags: string[];
  thumb_path: string;
  updated_at: string;
  versions: StoredVersion[] | null;
  width: number;
}

interface CommentRow {
  asset_id: string;
  author: string;
  body: string;
  created_at: string;
  h: number | null;
  id: string;
  resolved: boolean;
  version_id: string | null;
  w: number | null;
  x: number;
  y: number;
}

function publicUrl(bucket: string, path: string): string {
  if (!path) {
    return "";
  }
  return getSupabaseClient().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Rehydrate a stored version, re-deriving its URLs from the storage paths. */
function rowVersion(stored: StoredVersion): AssetVersion {
  const url = publicUrl("assets", stored.storagePath);
  return {
    ...stored,
    thumbUrl: stored.thumbPath ? publicUrl("thumbs", stored.thumbPath) : url,
    url,
  };
}

function rowToAsset(row: AssetRow, comments: CommentRow[]): Asset {
  const url = publicUrl("assets", row.storage_path);
  const thumb = row.thumb_path ? publicUrl("thumbs", row.thumb_path) : url;
  const base: Asset = {
    collectionId: row.collection_id,
    comments: comments
      .filter((comment) => comment.asset_id === row.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(
        (comment): PinnedComment => ({
          author: comment.author,
          createdAt: comment.created_at,
          h: comment.h ?? undefined,
          id: comment.id,
          resolved: comment.resolved,
          text: comment.body,
          versionId: comment.version_id ?? undefined,
          w: comment.w ?? undefined,
          x: comment.x,
          y: comment.y,
        }),
      ),
    addedBy: row.created_by ?? null,
    assignedTo: row.assigned_to ?? null,
    createdAt: row.created_at,
    currentVersionId: row.current_version_id ?? "",
    durationSec: row.duration_sec ?? undefined,
    favoritedBy: row.favorited_by ?? [],
    filename: row.filename,
    focalPoint: { x: row.focal_x, y: row.focal_y },
    height: row.height,
    id: row.id,
    importFingerprint: row.import_fingerprint ?? undefined,
    kind: row.kind === "video" ? "video" : "image",
    name: row.name,
    sizeBytes: row.size_bytes ?? undefined,
    sourceValues: (row.source_values ?? undefined) as Asset["sourceValues"],
    status: asStatus(row.status),
    tags: row.tags ?? [],
    thumbUrl: thumb,
    updatedAt: row.updated_at,
    url,
    versions: (row.versions ?? []).map(rowVersion),
    width: row.width,
  };
  // Legacy rows (predating versioning) carry no versions[] — synthesize a v1
  // from the flat mirror fields so the rest of the app always sees ≥1 version.
  return ensureAssetVersions(base, { storagePath: row.storage_path, thumbPath: row.thumb_path });
}

/** ---- Hydration ----------------------------------------------------------- */

const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "review", "done"];

function asTaskStatus(value: unknown): TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : "todo";
}

export interface BackendSnapshot {
  assets: Asset[];
  collections: Collection[];
  comps: Comp[];
  copyFolders: CopyFolder[];
  copySnippets: CopySnippet[];
  decks: CopyDeck[];
  emails: EmailDraft[];
  journal: JournalEntry[];
  links: BrandLink[];
  planner: PlannerState;
  queue: QueueItem[];
  tasks: Task[];
  teamMembers: TeamMember[];
  templates: Template[];
}

/**
 * Fetch every row of a table, paging past PostgREST's 1000-row response cap.
 * Without this a library beyond 1000 assets silently truncates — the Library
 * count froze at "1000 items" and older assets vanished. `id` (unique) is the
 * paging tiebreaker so rows with equal sort keys never repeat or drop.
 */
async function fetchAllRows(
  table: string,
  orderColumn: string,
  ascending: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any[]; error: { message: string } | null }> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderColumn, { ascending })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return { data: rows, error };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) {
      return { data: rows, error: null };
    }
  }
}

export async function fetchBackendSnapshot(): Promise<BackendSnapshot> {
  const [
    assets,
    comments,
    collections,
    comps,
    decks,
    queueItems,
    slots,
    links,
    journal,
    tasks,
    copyFolders,
    profiles,
    emails,
    templates,
    copySnippets,
  ] = await Promise.all([
    fetchAllRows("assets", "created_at", false),
    fetchAllRows("asset_comments", "created_at", true),
    fetchAllRows("collections", "created_at", true),
    fetchAllRows("comps", "created_at", true),
    fetchAllRows("decks", "created_at", true),
    fetchAllRows("queue_items", "added_at", true),
    fetchAllRows("planner_slots", "position", true),
    fetchAllRows("brand_links", "created_at", true),
    fetchAllRows("journal_entries", "created_at", true),
    fetchAllRows("tasks", "position", true),
    fetchAllRows("copy_folders", "created_at", true),
    fetchAllRows("profiles", "name", true),
    fetchAllRows("emails", "created_at", true),
    fetchAllRows("templates", "created_at", true),
    fetchAllRows("copy_snippets", "created_at", true),
  ]);
  const firstError =
    assets.error ??
    comments.error ??
    collections.error ??
    comps.error ??
    decks.error ??
    queueItems.error ??
    slots.error ??
    links.error ??
    journal.error ??
    tasks.error ??
    copyFolders.error ??
    profiles.error ??
    emails.error ??
    templates.error ??
    copySnippets.error;
  if (firstError) {
    throw new Error(`Supabase fetch failed: ${firstError.message}`);
  }

  const commentRows = (comments.data ?? []) as CommentRow[];
  const slotRows = (slots.data ?? []) as {
    asset_id: string | null;
    assigned_to: string | null;
    comments: unknown;
    comp_id: string | null;
    crop?: unknown;
    frames: unknown;
    id: string;
    kind: "grid" | "story" | "pinterest" | "reel" | "tiktok";
    label: string | null;
    owner: string | null;
    scheduled_date: string | null;
    scheduled_time: string | null;
    status: string | null;
  }[];
  const toSlot = (row: (typeof slotRows)[number]): PlannerGridSlot => ({
    assetId: row.asset_id,
    assignedTo: row.assigned_to ?? null,
    comments: Array.isArray(row.comments)
      ? (row.comments as PlannerGridSlot["comments"])
      : [],
    compId: row.comp_id,
    crop: (row.crop ?? null) as PlannerGridSlot["crop"],
    frames: Array.isArray(row.frames) ? (row.frames as PlannerGridSlot["frames"]) : [],
    id: row.id,
    label: row.label,
    owner: row.owner ?? null,
    scheduledDate: row.scheduled_date ?? null,
    scheduledTime: row.scheduled_time ?? null,
    status: asStatus(row.status),
  });

  return {
    assets: ((assets.data ?? []) as AssetRow[]).map((row) =>
      rowToAsset(row, commentRows),
    ),
    collections: (collections.data ?? []).map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      name: row.name,
      parentId: row.parent_id ?? null,
    })),
    comps: (comps.data ?? []).map((row) => ({
      backgroundColorId: row.background_color_id,
      comments: [],
      createdAt: row.created_at,
      elements: [],
      formats: row.formats ?? [],
      id: row.id,
      layoutId: row.layout_id,
      name: row.name,
      originAssetId: row.origin_asset_id ?? null,
      overrides: {},
      ownerId: row.owner_id ?? null,
      sourceValues: (row.source_values ?? undefined) as Comp["sourceValues"],
      status: asStatus(row.status),
      updatedAt: row.updated_at,
    })),
    decks: (decks.data ?? []).map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      name: row.name,
      variants: row.variants ?? [],
    })),
    emails: (emails.data ?? []).map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      name: row.name ?? "Untitled email",
      sections: Array.isArray(row.sections)
        ? (row.sections as EmailDraft["sections"])
        : [],
      updatedAt: row.updated_at,
    })),
    copyFolders: (copyFolders.data ?? []).map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      name: row.name ?? "",
      parentId: row.parent_id ?? null,
    })),
    journal: (journal.data ?? []).map((row) => ({
      body: row.body ?? "",
      comments: Array.isArray(row.comments) ? (row.comments as JournalEntry["comments"]) : [],
      createdAt: row.created_at,
      folderId: row.folder_id ?? null,
      id: row.id,
      kind: row.kind === "journal" ? "journal" : "copy",
      tags: row.tags ?? [],
      title: row.title ?? "",
      updatedAt: row.updated_at,
    })),
    links: (links.data ?? []).map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      label: row.label ?? "",
      url: row.url ?? "",
    })),
    planner: {
      gridSlots: slotRows.filter((row) => row.kind === "grid").map(toSlot),
      pinSlots: slotRows.filter((row) => row.kind === "pinterest").map(toSlot),
      reelSlots: slotRows.filter((row) => row.kind === "reel").map(toSlot),
      storySlots: slotRows.filter((row) => row.kind === "story").map(toSlot),
      tiktokSlots: slotRows.filter((row) => row.kind === "tiktok").map(toSlot),
    },
    queue: (queueItems.data ?? []).map((row) => ({
      addedAt: row.added_at,
      assetId: row.asset_id ?? null,
      compId: row.comp_id ?? null,
      formatIds: row.format_ids ?? [],
      id: row.id,
    })),
    tasks: (tasks.data ?? []).map((row) => ({
      assignee: row.assignee ?? null,
      createdAt: row.created_at,
      createdBy: row.created_by ?? null,
      description: row.description ?? "",
      id: row.id,
      position: row.position ?? 0,
      subtasks: Array.isArray(row.subtasks)
        ? (row.subtasks as import("../types").Subtask[])
        : [],
      sourceCommentId: row.source_comment_id ?? null,
      sourceLabel: row.source_label ?? null,
      sourceRef: row.source_ref ?? null,
      status: asTaskStatus(row.status),
      tags: row.tags ?? [],
      title: row.title ?? "",
      updatedAt: row.updated_at,
    })),
    teamMembers: (profiles.data ?? []).map((row) => ({
      email: row.email ?? "",
      id: row.id,
      name: row.name ?? row.email ?? "Teammate",
    })),
    templates: (templates.data ?? []).map((row) => ({
      createdAt: row.created_at,
      createdBy: row.created_by ?? null,
      formatId: row.format_id ?? "ig-post",
      id: row.id,
      name: row.name ?? "Untitled template",
      values: (row.values ?? {}) as Record<string, unknown>,
    })),
    copySnippets: (copySnippets.data ?? []).map((row) => ({
      createdAt: row.created_at,
      createdBy: row.created_by ?? null,
      flourish: (row.flourish ?? undefined) as CopySnippet["flourish"],
      id: row.id,
      role: (row.role ?? "headline") as CopySnippet["role"],
      tags: row.tags ?? [],
      text: row.text ?? "",
      title: row.title ?? null,
    })),
  };
}

/** ---- Media upload --------------------------------------------------------- */

async function makeWebDerivative(file: File, maxEdge = 1600): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
  } catch {
    return null;
  }
}

function extensionOf(filename: string): string {
  return filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
}

/** Overall upload progress across a batch, with the in-flight file named. */
export type UploadProgress = {
  done: number;
  fraction: number;
  name: string;
  total: number;
};

/**
 * PUT a file straight to the Supabase Storage REST endpoint via XHR so we get
 * real byte-level `upload.onprogress` events — supabase-js `.upload()` resolves
 * only when the whole file is done, which is useless for a large video.
 */
async function uploadFileWithProgress(
  bucket: string,
  path: string,
  file: Blob,
  contentType: string,
  onFraction: (fraction: number) => void,
): Promise<void> {
  const { anonKey, url } = getSupabaseConfig();
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token ?? anonKey;
  const endpoint = `${url}/storage/v1/object/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "true");
    if (contentType) {
      xhr.setRequestHeader("content-type", contentType);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onFraction(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onFraction(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}) ${xhr.responseText.slice(0, 160)}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.send(file);
  });
}

/**
 * Upload originals + web derivatives, insert rows, and return the assets with
 * their storage-backed URLs (replacing session object URLs). `onProgress`
 * reports byte-level progress of the in-flight original so the UI can show a
 * moving bar even for one big video.
 */
export async function uploadAssets(
  assets: Asset[],
  filesById: Map<string, File>,
  onProgress?: (progress: UploadProgress) => void,
  postersById?: Map<string, Blob>,
): Promise<Asset[]> {
  const supabase = getSupabaseClient();
  const uploaded: Asset[] = [];
  const total = assets.length;
  let done = 0;
  for (const asset of assets) {
    const file = filesById.get(asset.id);
    if (!file) {
      continue;
    }
    const storagePath = `${asset.id}/original.${extensionOf(asset.filename)}`;
    try {
      await uploadFileWithProgress("assets", storagePath, file, file.type, (fraction) => {
        onProgress?.({ done, fraction: (done + fraction) / total, name: asset.filename, total });
      });
    } catch (error) {
      throw new Error(`Upload failed for ${asset.filename}: ${(error as Error).message}`);
    }

    // Thumbnail: a video's poster frame (generated at import) or an image's
    // downscaled WebP derivative.
    let thumbPath = "";
    const poster = postersById?.get(asset.id);
    const derivative = poster ?? (asset.kind === "image" ? await makeWebDerivative(file) : null);
    if (derivative) {
      thumbPath = `${asset.id}.webp`;
      const { error: thumbError } = await supabase.storage
        .from("thumbs")
        .upload(thumbPath, derivative, { contentType: "image/webp", upsert: true });
      if (thumbError) {
        thumbPath = "";
      }
    }

    // Now that the bytes have a real storage path, stamp it onto v1 (import
    // built v1 with the session object URL). versions[] + current_version_id are
    // the source of truth; the flat columns are their denormalized mirror.
    const finalUrl = publicUrl("assets", storagePath);
    const finalThumb = thumbPath ? publicUrl("thumbs", thumbPath) : finalUrl;
    const ensured = ensureAssetVersions(
      { ...asset, thumbUrl: finalThumb, url: finalUrl },
      { storagePath, thumbPath },
    );
    const versions = ensured.versions.map((version) =>
      version.id === ensured.currentVersionId
        ? { ...version, storagePath, thumbPath, thumbUrl: finalThumb, url: finalUrl }
        : version,
    );

    const { error: rowError } = await supabase.from("assets").insert({
      assigned_to: asset.assignedTo ?? null,
      collection_id: asset.collectionId,
      created_at: asset.createdAt,
      created_by: asset.addedBy ?? null,
      current_version_id: ensured.currentVersionId,
      duration_sec: asset.durationSec ?? null,
      favorited_by: asset.favoritedBy ?? [],
      filename: asset.filename,
      focal_x: asset.focalPoint.x,
      focal_y: asset.focalPoint.y,
      height: asset.height,
      id: asset.id,
      import_fingerprint: asset.importFingerprint ?? null,
      kind: asset.kind,
      name: asset.name,
      size_bytes: asset.sizeBytes ?? null,
      source_values: asset.sourceValues ?? null,
      status: asset.status,
      storage_path: storagePath,
      tags: asset.tags,
      thumb_path: thumbPath,
      updated_at: asset.updatedAt,
      versions: versions.map(serializeVersion),
      width: asset.width,
    });
    if (rowError) {
      throw new Error(`Saving ${asset.filename} failed: ${rowError.message}`);
    }

    uploaded.push({ ...ensured, thumbUrl: finalThumb, url: finalUrl, versions });
    done += 1;
    onProgress?.({ done, fraction: done / total, name: asset.filename, total });
  }
  return uploaded;
}

/**
 * Upload the bytes for one new version of an existing asset and return the
 * version with its storage paths + resolved URLs filled in. Bytes go to
 * `assets/{assetId}/{versionId}.{ext}` (thumb to `thumbs/{assetId}/{versionId}.webp`),
 * so versions never overwrite each other. The caller then `addAssetVersion`s it.
 */
export async function uploadAssetVersion(
  assetId: string,
  version: AssetVersion,
  file: File,
  poster?: Blob,
  onProgress?: (fraction: number) => void,
): Promise<AssetVersion> {
  const supabase = getSupabaseClient();
  const storagePath = `${assetId}/${version.id}.${extensionOf(version.filename)}`;
  await uploadFileWithProgress("assets", storagePath, file, file.type, (fraction) =>
    onProgress?.(fraction),
  );

  let thumbPath = "";
  const derivative = poster ?? (version.kind === "image" ? await makeWebDerivative(file) : null);
  if (derivative) {
    thumbPath = `${assetId}/${version.id}.webp`;
    const { error } = await supabase.storage
      .from("thumbs")
      .upload(thumbPath, derivative, { contentType: "image/webp", upsert: true });
    if (error) {
      thumbPath = "";
    }
  }

  const url = publicUrl("assets", storagePath);
  return { ...version, storagePath, thumbPath, thumbUrl: thumbPath ? publicUrl("thumbs", thumbPath) : url, url };
}

/** ---- Mutations (ProjectBackend implementation) ----------------------------- */

function logError(scope: string) {
  return ({ error }: { error: { message: string } | null }): void => {
    if (error) {
      console.error(`Supabase ${scope} failed: ${error.message}`);
    }
  };
}

export function createSupabaseBackend(): ProjectBackend {
  const supabase = getSupabaseClient();
  return {
    addComment(assetId, comment) {
      void supabase
        .from("asset_comments")
        .insert({
          asset_id: assetId,
          author: comment.author,
          body: comment.text,
          created_at: comment.createdAt,
          h: comment.h ?? null,
          id: comment.id,
          resolved: comment.resolved,
          version_id: comment.versionId ?? null,
          w: comment.w ?? null,
          x: comment.x,
          y: comment.y,
        })
        .then(logError("comment"));
    },
    clearQueue() {
      void supabase.from("queue_items").delete().neq("id", "").then(logError("queue clear"));
    },
    deleteAssets(assetIds) {
      void supabase.from("assets").delete().in("id", assetIds).then(logError("delete"));
    },
    deleteCollection(collectionId) {
      void (async () => {
        // Reparent this board's children up to its parent (matches the local
        // optimistic update), then delete. Assets in it unfile automatically
        // via the schema's ON DELETE SET NULL on collection_id.
        const { data } = await supabase
          .from("collections")
          .select("parent_id")
          .eq("id", collectionId)
          .single();
        const grandparent = (data?.parent_id as string | null) ?? null;
        await supabase
          .from("collections")
          .update({ parent_id: grandparent })
          .eq("parent_id", collectionId);
        const { error } = await supabase
          .from("collections")
          .delete()
          .eq("id", collectionId);
        if (error) {
          console.error(`Supabase collection delete failed: ${error.message}`);
        }
      })();
    },
    deleteComp(compId) {
      void supabase.from("comps").delete().eq("id", compId).then(logError("comp delete"));
    },
    deleteEmail(emailId) {
      void supabase.from("emails").delete().eq("id", emailId).then(logError("email delete"));
    },
    deleteCopyFolder(folderId) {
      void (async () => {
        // Reparent sub-folders up to this folder's parent (matches the local
        // optimistic update), then delete. Entries in it unfile via the
        // schema's ON DELETE SET NULL on folder_id.
        const { data } = await supabase
          .from("copy_folders")
          .select("parent_id")
          .eq("id", folderId)
          .single();
        const grandparent = (data?.parent_id as string | null) ?? null;
        await supabase
          .from("copy_folders")
          .update({ parent_id: grandparent })
          .eq("parent_id", folderId);
        const { error } = await supabase.from("copy_folders").delete().eq("id", folderId);
        if (error) {
          console.error(`Supabase copy folder delete failed: ${error.message}`);
        }
      })();
    },
    deleteJournalEntry(entryId) {
      void supabase
        .from("journal_entries")
        .delete()
        .eq("id", entryId)
        .then(logError("journal delete"));
    },
    deleteLink(linkId) {
      void supabase.from("brand_links").delete().eq("id", linkId).then(logError("link delete"));
    },
    deleteTask(taskId) {
      void supabase.from("tasks").delete().eq("id", taskId).then(logError("task delete"));
    },
    removeQueueItem(queueItemId) {
      void supabase
        .from("queue_items")
        .delete()
        .eq("id", queueItemId)
        .then(logError("queue remove"));
    },
    savePlanner(planner) {
      void (async () => {
        const rows = [
          ...planner.gridSlots.map((slot, index) => ({ kind: "grid", position: index, slot })),
          ...planner.storySlots.map((slot, index) => ({ kind: "story", position: index, slot })),
          ...planner.pinSlots.map((slot, index) => ({ kind: "pinterest", position: index, slot })),
          ...planner.reelSlots.map((slot, index) => ({ kind: "reel", position: index, slot })),
          ...planner.tiktokSlots.map((slot, index) => ({ kind: "tiktok", position: index, slot })),
        ].map(({ kind, position, slot }) => ({
          asset_id: slot.assetId,
          assigned_to: slot.assignedTo ?? null,
          comments: slot.comments,
          comp_id: slot.compId,
          crop: slot.crop ?? null,
          frames: slot.frames,
          id: slot.id,
          kind,
          label: slot.label,
          owner: slot.owner ?? null,
          position,
          scheduled_date: slot.scheduledDate ?? null,
          scheduled_time: slot.scheduledTime ?? null,
          status: slot.status,
        }));
        // Upsert FIRST, then prune removed rows. Never delete-before-insert:
        // that momentarily empties the whole table (a realtime refetch landing
        // in that window flashes the planner empty), and if the insert fails —
        // e.g. a `kind` whose check-constraint migration hasn't been applied —
        // the cloud planner is left wiped. Both show as posts "randomly
        // disappearing / reappearing", which is what this guards against.
        if (rows.length === 0) {
          const del = await supabase.from("planner_slots").delete().neq("id", "");
          logError("planner clear")(del);
          return;
        }
        const saved = await supabase
          .from("planner_slots")
          .upsert(rows, { onConflict: "id" });
        logError("planner save")(saved);
        if (saved.error) {
          // The write failed — do NOT prune, or we'd delete rows we couldn't
          // replace and wipe the planner. Leave the last-good state in place.
          return;
        }
        const keep = rows.map((row) => row.id).join(",");
        const del = await supabase
          .from("planner_slots")
          .delete()
          .not("id", "in", `(${keep})`);
        logError("planner prune")(del);
      })();
    },
    updateAsset(assetId, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo;
      if (patch.collectionId !== undefined) row.collection_id = patch.collectionId;
      if (patch.favoritedBy !== undefined) row.favorited_by = patch.favoritedBy;
      if (patch.focalPoint !== undefined) {
        row.focal_x = patch.focalPoint.x;
        row.focal_y = patch.focalPoint.y;
      }
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.tags !== undefined) row.tags = patch.tags;
      // Versioning: persist the stack + re-point current, and recompute the flat
      // mirror columns from the current version so a hydrate re-derives the same
      // current bytes/dimensions/focal that every reference resolves to.
      if (patch.versions !== undefined) {
        row.versions = patch.versions.map(serializeVersion);
        const current = patch.currentVersionId
          ? patch.versions.find((version) => version.id === patch.currentVersionId)
          : undefined;
        if (current) {
          row.current_version_id = current.id;
          row.storage_path = current.storagePath;
          row.thumb_path = current.thumbPath;
          row.width = current.width;
          row.height = current.height;
          row.size_bytes = current.sizeBytes ?? null;
          row.filename = current.filename;
          row.duration_sec = current.durationSec ?? null;
          row.focal_x = current.focalPoint.x;
          row.focal_y = current.focalPoint.y;
          row.source_values = current.sourceValues ?? null;
          row.kind = current.kind;
        }
      } else if (patch.currentVersionId !== undefined) {
        row.current_version_id = patch.currentVersionId;
      }
      void supabase.from("assets").update(row).eq("id", assetId).then(logError("asset"));
    },
    updateComment(assetId, commentId, patch) {
      void assetId;
      const row: Record<string, unknown> = {};
      if (patch.resolved !== undefined) row.resolved = patch.resolved;
      void supabase
        .from("asset_comments")
        .update(row)
        .eq("id", commentId)
        .then(logError("comment update"));
    },
    upsertCollection(collection) {
      void supabase
        .from("collections")
        .upsert({
          created_at: collection.createdAt,
          id: collection.id,
          name: collection.name,
          parent_id: collection.parentId,
        })
        .then(logError("collection"));
    },
    upsertComp(comp) {
      void supabase
        .from("comps")
        .upsert({
          background_color_id: comp.backgroundColorId,
          created_at: comp.createdAt,
          formats: comp.formats,
          id: comp.id,
          layout_id: comp.layoutId,
          name: comp.name,
          origin_asset_id: comp.originAssetId ?? null,
          owner_id: comp.ownerId ?? null,
          source_values: comp.sourceValues ?? null,
          status: comp.status,
          updated_at: comp.updatedAt,
        })
        .then(logError("comp"));
    },
    upsertEmail(email) {
      void supabase
        .from("emails")
        .upsert({
          created_at: email.createdAt,
          id: email.id,
          name: email.name,
          sections: email.sections,
          updated_at: email.updatedAt,
        })
        .then(logError("email"));
    },
    upsertCopyFolder(folder) {
      void supabase
        .from("copy_folders")
        .upsert({
          created_at: folder.createdAt,
          id: folder.id,
          name: folder.name,
          parent_id: folder.parentId,
        })
        .then(logError("copy folder"));
    },
    upsertJournalEntry(entry) {
      void supabase
        .from("journal_entries")
        .upsert({
          body: entry.body,
          comments: entry.comments,
          created_at: entry.createdAt,
          folder_id: entry.folderId,
          id: entry.id,
          kind: entry.kind,
          tags: entry.tags,
          title: entry.title,
          updated_at: entry.updatedAt,
        })
        .then(logError("journal"));
    },
    upsertLink(link) {
      void supabase
        .from("brand_links")
        .upsert({
          created_at: link.createdAt,
          id: link.id,
          label: link.label,
          url: link.url,
        })
        .then(logError("link"));
    },
    upsertProfile(member) {
      void supabase
        .from("profiles")
        .upsert({
          email: member.email,
          id: member.id,
          name: member.name,
          updated_at: new Date().toISOString(),
        })
        .then(logError("profile"));
    },
    upsertTask(task) {
      void supabase
        .from("tasks")
        .upsert({
          assignee: task.assignee,
          created_at: task.createdAt,
          created_by: task.createdBy ?? null,
          description: task.description ?? "",
          id: task.id,
          position: task.position,
          subtasks: task.subtasks ?? [],
          source_comment_id: task.sourceCommentId ?? null,
          source_label: task.sourceLabel ?? null,
          source_ref: task.sourceRef ?? null,
          status: task.status,
          tags: task.tags,
          title: task.title,
          updated_at: task.updatedAt,
        })
        .then(logError("task"));
    },
    upsertDeck(deck) {
      void supabase
        .from("decks")
        .upsert({
          created_at: deck.createdAt,
          id: deck.id,
          name: deck.name,
          variants: deck.variants,
        })
        .then(logError("deck"));
    },
    upsertQueueItem(item) {
      void supabase
        .from("queue_items")
        .upsert({
          added_at: item.addedAt,
          asset_id: item.assetId ?? null,
          comp_id: item.compId,
          format_ids: item.formatIds,
          id: item.id,
        })
        .then(logError("queue"));
    },
    deleteTemplate(templateId) {
      void supabase
        .from("templates")
        .delete()
        .eq("id", templateId)
        .then(logError("template delete"));
    },
    upsertTemplate(template) {
      void supabase
        .from("templates")
        .upsert({
          created_at: template.createdAt,
          created_by: template.createdBy ?? null,
          format_id: template.formatId,
          id: template.id,
          name: template.name,
          values: template.values,
        })
        .then(logError("template"));
    },
    deleteCopySnippet(snippetId) {
      void supabase
        .from("copy_snippets")
        .delete()
        .eq("id", snippetId)
        .then(logError("copy snippet delete"));
    },
    upsertCopySnippet(snippet) {
      void supabase
        .from("copy_snippets")
        .upsert({
          created_at: snippet.createdAt,
          created_by: snippet.createdBy ?? null,
          flourish: snippet.flourish ?? null,
          id: snippet.id,
          role: snippet.role,
          tags: snippet.tags,
          text: snippet.text,
          title: snippet.title ?? null,
        })
        .then(logError("copy snippet"));
    },
  };
}

/** ---- Realtime -------------------------------------------------------------- */

export function subscribeToChanges(onChange: () => void): RealtimeChannel {
  const supabase = getSupabaseClient();
  let timer: number | undefined;
  const debounced = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 400);
  };
  return supabase
    .channel("project-sync")
    .on("postgres_changes", { event: "*", schema: "public" }, debounced)
    .subscribe();
}
