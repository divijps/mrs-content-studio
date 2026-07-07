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
  BrandLink,
  Collection,
  Comp,
  CopyDeck,
  CopyFolder,
  JournalEntry,
  PinnedComment,
  PlannerGridSlot,
  PlannerState,
  QueueItem,
  ReviewStatus,
  Task,
  TaskStatus,
  TeamMember,
} from "../types";
import type { ProjectBackend } from "../project-store";
import { getSupabaseClient } from "./config";

const REVIEW_STATUSES: ReviewStatus[] = [
  "draft",
  "in-review",
  "changes-requested",
  "approved",
];

function asStatus(value: unknown): ReviewStatus {
  return REVIEW_STATUSES.includes(value as ReviewStatus)
    ? (value as ReviewStatus)
    : "draft";
}

/** ---- Row mappers -------------------------------------------------------- */

interface AssetRow {
  collection_id: string | null;
  created_at: string;
  duration_sec: number | null;
  favorite: boolean;
  filename: string;
  focal_x: number;
  focal_y: number;
  height: number;
  id: string;
  import_fingerprint: string | null;
  kind: string | null;
  name: string;
  size_bytes: number | null;
  status: string;
  storage_path: string;
  tags: string[];
  thumb_path: string;
  updated_at: string;
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

function rowToAsset(row: AssetRow, comments: CommentRow[]): Asset {
  const url = publicUrl("assets", row.storage_path);
  const thumb = row.thumb_path ? publicUrl("thumbs", row.thumb_path) : url;
  return {
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
          w: comment.w ?? undefined,
          x: comment.x,
          y: comment.y,
        }),
      ),
    createdAt: row.created_at,
    durationSec: row.duration_sec ?? undefined,
    favorite: row.favorite,
    filename: row.filename,
    focalPoint: { x: row.focal_x, y: row.focal_y },
    height: row.height,
    id: row.id,
    importFingerprint: row.import_fingerprint ?? undefined,
    kind: row.kind === "video" ? "video" : "image",
    name: row.name,
    sizeBytes: row.size_bytes ?? undefined,
    status: asStatus(row.status),
    tags: row.tags ?? [],
    thumbUrl: thumb,
    updatedAt: row.updated_at,
    url,
    width: row.width,
  };
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
  decks: CopyDeck[];
  journal: JournalEntry[];
  links: BrandLink[];
  planner: PlannerState;
  queue: QueueItem[];
  tasks: Task[];
  teamMembers: TeamMember[];
}

export async function fetchBackendSnapshot(): Promise<BackendSnapshot> {
  const supabase = getSupabaseClient();
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
  ] = await Promise.all([
    supabase.from("assets").select("*").order("created_at", { ascending: false }),
    supabase.from("asset_comments").select("*"),
    supabase.from("collections").select("*"),
    supabase.from("comps").select("*").order("created_at", { ascending: true }),
    supabase.from("decks").select("*"),
    supabase.from("queue_items").select("*").order("added_at", { ascending: true }),
    supabase.from("planner_slots").select("*").order("position", { ascending: true }),
    supabase.from("brand_links").select("*").order("created_at", { ascending: true }),
    supabase.from("journal_entries").select("*").order("created_at", { ascending: true }),
    supabase.from("tasks").select("*").order("position", { ascending: true }),
    supabase.from("copy_folders").select("*").order("created_at", { ascending: true }),
    supabase.from("profiles").select("*").order("name", { ascending: true }),
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
    profiles.error;
  if (firstError) {
    throw new Error(`Supabase fetch failed: ${firstError.message}`);
  }

  const commentRows = (comments.data ?? []) as CommentRow[];
  const slotRows = (slots.data ?? []) as {
    asset_id: string | null;
    comments: unknown;
    comp_id: string | null;
    frames: unknown;
    id: string;
    kind: "grid" | "story" | "pinterest" | "reel";
    label: string | null;
    status: string | null;
  }[];
  const toSlot = (row: (typeof slotRows)[number]): PlannerGridSlot => ({
    assetId: row.asset_id,
    comments: Array.isArray(row.comments)
      ? (row.comments as PlannerGridSlot["comments"])
      : [],
    compId: row.comp_id,
    frames: Array.isArray(row.frames) ? (row.frames as PlannerGridSlot["frames"]) : [],
    id: row.id,
    label: row.label,
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
      overrides: {},
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
    },
    queue: (queueItems.data ?? []).map((row) => ({
      addedAt: row.added_at,
      compId: row.comp_id,
      formatIds: row.format_ids ?? [],
      id: row.id,
    })),
    tasks: (tasks.data ?? []).map((row) => ({
      assignee: row.assignee ?? null,
      createdAt: row.created_at,
      id: row.id,
      position: row.position ?? 0,
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

/**
 * Upload originals + web derivatives, insert rows, and return the assets with
 * their storage-backed URLs (replacing session object URLs).
 */
export async function uploadAssets(
  assets: Asset[],
  filesById: Map<string, File>,
  onProgress?: (done: number, total: number) => void,
  postersById?: Map<string, Blob>,
): Promise<Asset[]> {
  const supabase = getSupabaseClient();
  const uploaded: Asset[] = [];
  let done = 0;
  for (const asset of assets) {
    const file = filesById.get(asset.id);
    if (!file) {
      continue;
    }
    const storagePath = `${asset.id}/original.${extensionOf(asset.filename)}`;
    const { error: originalError } = await supabase.storage
      .from("assets")
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (originalError) {
      throw new Error(`Upload failed for ${asset.filename}: ${originalError.message}`);
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

    const { error: rowError } = await supabase.from("assets").insert({
      collection_id: asset.collectionId,
      created_at: asset.createdAt,
      duration_sec: asset.durationSec ?? null,
      favorite: asset.favorite,
      filename: asset.filename,
      focal_x: asset.focalPoint.x,
      focal_y: asset.focalPoint.y,
      height: asset.height,
      id: asset.id,
      import_fingerprint: asset.importFingerprint ?? null,
      kind: asset.kind,
      name: asset.name,
      size_bytes: asset.sizeBytes ?? null,
      status: asset.status,
      storage_path: storagePath,
      tags: asset.tags,
      thumb_path: thumbPath,
      updated_at: asset.updatedAt,
      width: asset.width,
    });
    if (rowError) {
      throw new Error(`Saving ${asset.filename} failed: ${rowError.message}`);
    }

    uploaded.push({
      ...asset,
      thumbUrl: thumbPath ? publicUrl("thumbs", thumbPath) : publicUrl("assets", storagePath),
      url: publicUrl("assets", storagePath),
    });
    done += 1;
    onProgress?.(done, assets.length);
  }
  return uploaded;
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
        ].map(({ kind, position, slot }) => ({
          asset_id: slot.assetId,
          comments: slot.comments,
          comp_id: slot.compId,
          frames: slot.frames,
          id: slot.id,
          kind,
          label: slot.label,
          position,
          status: slot.status,
        }));
        const del = await supabase.from("planner_slots").delete().neq("id", "");
        logError("planner clear")(del);
        if (rows.length > 0) {
          const ins = await supabase.from("planner_slots").insert(rows);
          logError("planner save")(ins);
        }
      })();
    },
    updateAsset(assetId, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.collectionId !== undefined) row.collection_id = patch.collectionId;
      if (patch.favorite !== undefined) row.favorite = patch.favorite;
      if (patch.focalPoint !== undefined) {
        row.focal_x = patch.focalPoint.x;
        row.focal_y = patch.focalPoint.y;
      }
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.tags !== undefined) row.tags = patch.tags;
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
          source_values: comp.sourceValues ?? null,
          status: comp.status,
          updated_at: comp.updatedAt,
        })
        .then(logError("comp"));
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
          id: task.id,
          position: task.position,
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
          comp_id: item.compId,
          format_ids: item.formatIds,
          id: item.id,
        })
        .then(logError("queue"));
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
