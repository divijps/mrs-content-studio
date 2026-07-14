/**
 * Project store: single source of truth for all four surfaces.
 *
 * Starts in demo mode (in-memory fixture). When the user connects the shared
 * Drive folder, a FileSystemBackend takes over persistence (Phase 2). All
 * mutations go through store actions so persistence stays centralized.
 */

import * as React from "react";

import { createDemoProject } from "./demo-project";
import { PLANNER_CHANNEL_LABELS } from "./types";
import type {
  Asset,
  BrandLink,
  Comp,
  CopyDeck,
  CopyFolder,
  CopySnippet,
  EmailDraft,
  EmailSection,
  JournalComment,
  JournalEntry,
  PinnedComment,
  PlannerChannel,
  PlannerFrame,
  PlannerGridSlot,
  ProjectSnapshot,
  QueueItem,
  ReviewStatus,
  Task,
  TaskStatus,
  TeamMember,
  Template,
} from "./types";

type Listener = () => void;

/**
 * Persistence backend (Supabase when configured). Store actions apply locally
 * first (optimistic), then notify the backend fire-and-forget.
 */
export interface ProjectBackend {
  addComment(assetId: string, comment: PinnedComment): void;
  clearQueue(): void;
  deleteAssets(assetIds: string[]): void;
  deleteCollection?(collectionId: string): void;
  deleteComp?(compId: string): void;
  deleteCopyFolder?(folderId: string): void;
  deleteCopySnippet?(snippetId: string): void;
  deleteEmail?(emailId: string): void;
  deleteJournalEntry?(entryId: string): void;
  deleteLink?(linkId: string): void;
  deleteTask?(taskId: string): void;
  deleteTemplate?(templateId: string): void;
  removeQueueItem(queueItemId: string): void;
  savePlanner(planner: ProjectSnapshot["planner"]): void;
  updateAsset(assetId: string, patch: Partial<Asset>): void;
  updateComment(
    assetId: string,
    commentId: string,
    patch: Partial<PinnedComment>,
  ): void;
  upsertCollection(collection: ProjectSnapshot["collections"][number]): void;
  upsertComp(comp: Comp): void;
  upsertCopyFolder?(folder: CopyFolder): void;
  upsertCopySnippet?(snippet: CopySnippet): void;
  upsertEmail?(email: EmailDraft): void;
  upsertProfile?(member: TeamMember): void;
  upsertDeck(deck: CopyDeck): void;
  upsertJournalEntry?(entry: JournalEntry): void;
  upsertLink?(link: BrandLink): void;
  upsertQueueItem(item: QueueItem): void;
  upsertTask?(task: Task): void;
  upsertTemplate?(template: Template): void;
}

let backend: ProjectBackend | null = null;

export function registerBackend(next: ProjectBackend | null): void {
  backend = next;
}

let snapshot: ProjectSnapshot = createDemoProject();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function update(mutator: (draft: ProjectSnapshot) => ProjectSnapshot): void {
  snapshot = mutator(snapshot);
  emit();
  // Folder persistence hook (Phase 2): write dirty entities via the backend.
}

export function getProjectSnapshot(): ProjectSnapshot {
  return snapshot;
}

/** Replace synced entity sets from the backend (login hydrate + realtime refetch). */
export function hydrateSnapshot(
  partial: Partial<
    Pick<
      ProjectSnapshot,
      | "assets"
      | "collections"
      | "comps"
      | "copyFolders"
      | "copySnippets"
      | "decks"
      | "emails"
      | "journal"
      | "links"
      | "planner"
      | "queue"
      | "tasks"
      | "teamMembers"
      | "templates"
    >
  > & { folderName?: string | null; source?: ProjectSnapshot["source"] },
): void {
  update((draft) => ({ ...draft, ...partial }));
}

export function subscribeToProject(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProject(): ProjectSnapshot {
  return React.useSyncExternalStore(subscribeToProject, getProjectSnapshot);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** ---- Settings --------------------------------------------------------- */

const DISPLAY_NAME_KEY = "mrs-studio.display-name";

export function loadDisplayName(): string | null {
  try {
    return window.localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

export function setDisplayName(name: string): void {
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // Private mode: keep in memory only.
  }
  update((draft) => ({ ...draft, settings: { ...draft.settings, displayName: name } }));
}

/** Record the signed-in teammate's stable id so the Studio can scope artboards
 * to them. Session-scoped (set on sign-in), not persisted. */
export function setCurrentUserId(userId: string | null): void {
  if (snapshot.settings.userId === userId) {
    return;
  }
  update((draft) => ({ ...draft, settings: { ...draft.settings, userId } }));
}

export function initializeSettings(): void {
  const stored = loadDisplayName();
  if (stored && snapshot.settings.displayName !== stored) {
    update((draft) => ({ ...draft, settings: { ...draft.settings, displayName: stored } }));
  }
}

/** Record the signed-in teammate so the whole team can see who has an account. */
export function upsertTeamMember(member: TeamMember): void {
  update((draft) => ({
    ...draft,
    teamMembers: [
      ...draft.teamMembers.filter((entry) => entry.id !== member.id),
      member,
    ],
  }));
  backend?.upsertProfile?.(member);
}

/** ---- Assets ----------------------------------------------------------- */

export function setBrand(brand: ProjectSnapshot["brand"]): void {
  update((draft) => ({ ...draft, brand }));
}

export function updateAsset(assetId: string, patch: Partial<Asset>): void {
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...patch, updatedAt: nowIso() } : asset,
    ),
  }));
  backend?.updateAsset(assetId, patch);
}

export function setAssetStatus(assetId: string, status: ReviewStatus): void {
  updateAsset(assetId, { status });
}

/** Hand an asset off to a teammate (by display name) for edits/review. */
export function setAssetAssignee(assetId: string, assignedTo: string | null): void {
  updateAsset(assetId, { assignedTo });
}

/** Append newly imported assets to the library. */
export function addAssets(assets: Asset[]): void {
  if (assets.length === 0) {
    return;
  }
  update((draft) => ({ ...draft, assets: [...assets, ...draft.assets] }));
}

/** Single-user fallback key when there's no signed-in teammate id (demo mode). */
const SOLO_FAVORITE_KEY = "me";

/** The current viewer's favorite key. */
export function favoriteKey(userId: string | null | undefined): string {
  return userId ?? SOLO_FAVORITE_KEY;
}

/** Whether `userId` has favorited this asset (favorites are per-person). */
export function isAssetFavorite(
  asset: Pick<Asset, "favoritedBy">,
  userId: string | null | undefined,
): boolean {
  return (asset.favoritedBy ?? []).includes(favoriteKey(userId));
}

export function toggleAssetFavorite(assetId: string): void {
  const key = favoriteKey(snapshot.settings.userId);
  const current = snapshot.assets.find((asset) => asset.id === assetId)?.favoritedBy ?? [];
  const next = current.includes(key)
    ? current.filter((entry) => entry !== key)
    : [...current, key];
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId
        ? { ...asset, favoritedBy: next, updatedAt: nowIso() }
        : asset,
    ),
  }));
  backend?.updateAsset(assetId, { favoritedBy: next });
}

export function setAssetTags(assetId: string, tags: string[]): void {
  updateAsset(assetId, { tags });
}

export function setAssetCollection(assetId: string, collectionId: string | null): void {
  updateAsset(assetId, { collectionId });
}

export function setAssetFocalPoint(assetId: string, x: number, y: number): void {
  updateAsset(assetId, { focalPoint: { x, y } });
}

/** ---- Bulk asset operations (single emit each) --------------------------- */

/** Drop planner slots (and carousel frames) that reference the given assets. */
function scrubPlannerAssets(
  planner: ProjectSnapshot["planner"],
  ids: Set<string>,
): ProjectSnapshot["planner"] {
  const scrub = (slots: PlannerGridSlot[]): PlannerGridSlot[] =>
    slots
      .filter((slot) => !(slot.assetId && ids.has(slot.assetId)))
      .map((slot) =>
        slot.frames.some((frame) => frame.assetId && ids.has(frame.assetId))
          ? {
              ...slot,
              frames: slot.frames.filter(
                (frame) => !(frame.assetId && ids.has(frame.assetId)),
              ),
            }
          : slot,
      );
  return {
    gridSlots: scrub(planner.gridSlots),
    pinSlots: scrub(planner.pinSlots),
    reelSlots: scrub(planner.reelSlots),
    storySlots: scrub(planner.storySlots),
    tiktokSlots: scrub(planner.tiktokSlots),
  };
}

export function deleteAssets(assetIds: string[]): void {
  const ids = new Set(assetIds);
  const orphanedQueueIds = snapshot.queue
    .filter((item) => item.assetId != null && ids.has(item.assetId))
    .map((item) => item.id);
  update((draft) => ({
    ...draft,
    assets: draft.assets.filter((asset) => !ids.has(asset.id)),
    planner: scrubPlannerAssets(draft.planner, ids),
    queue: draft.queue.filter((item) => item.assetId == null || !ids.has(item.assetId)),
  }));
  backend?.deleteAssets(assetIds);
  backend?.savePlanner(snapshot.planner);
  for (const queueItemId of orphanedQueueIds) {
    backend?.removeQueueItem(queueItemId);
  }
}

function bulkPatch(assetIds: string[], patch: (asset: Asset) => Partial<Asset>): void {
  const ids = new Set(assetIds);
  const patches = snapshot.assets
    .filter((asset) => ids.has(asset.id))
    .map((asset) => [asset.id, patch(asset)] as const);
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      ids.has(asset.id) ? { ...asset, ...patch(asset), updatedAt: nowIso() } : asset,
    ),
  }));
  for (const [assetId, assetPatch] of patches) {
    backend?.updateAsset(assetId, assetPatch);
  }
}

export function bulkSetAssetStatus(assetIds: string[], status: ReviewStatus): void {
  bulkPatch(assetIds, () => ({ status }));
}

export function bulkSetAssetCollection(
  assetIds: string[],
  collectionId: string | null,
): void {
  bulkPatch(assetIds, () => ({ collectionId }));
}

export function bulkAddAssetTag(assetIds: string[], tag: string): void {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return;
  bulkPatch(assetIds, (asset) => ({
    tags: asset.tags.includes(normalized) ? asset.tags : [...asset.tags, normalized],
  }));
}

export function bulkSetAssetFavorite(assetIds: string[], favorite: boolean): void {
  const key = favoriteKey(snapshot.settings.userId);
  bulkPatch(assetIds, (asset) => {
    const set = new Set(asset.favoritedBy ?? []);
    if (favorite) {
      set.add(key);
    } else {
      set.delete(key);
    }
    return { favoritedBy: [...set] };
  });
}

/** ---- Cross-surface intents ---------------------------------------------- */

/**
 * "Use in Studio": the Library requests an image; the Studio renderer consumes
 * it on next mount. Transient by design — never persisted.
 */
let pendingStudioImageId: string | null = null;

export function requestStudioImage(assetId: string): void {
  pendingStudioImageId = assetId;
}

export function consumeStudioImage(): string | null {
  const pending = pendingStudioImageId;
  pendingStudioImageId = null;
  return pending;
}

/**
 * "Edit in Studio": reopen a saved design (a StudioValues snapshot) as a brand
 * new artboard. The Studio renderer consumes it on next mount and creates +
 * loads the comp there — creating the comp on the Studio side (not the calling
 * surface) is what lets the artboard-switch effect actually load it, instead of
 * the stale canvas autosaving over the wrong comp.
 */
let pendingStudioDesign: Record<string, unknown> | null = null;

export function requestStudioDesign(values: Record<string, unknown>): void {
  pendingStudioDesign = values;
}

export function consumeStudioDesign(): Record<string, unknown> | null {
  const pending = pendingStudioDesign;
  pendingStudioDesign = null;
  return pending;
}

/** Notification click: open this asset's viewer in the Library. */
let pendingLibraryAssetId: string | null = null;

/** Fired so an already-mounted Library reacts too (not just on mount). */
export const LIBRARY_ASSET_EVENT = "mrs:library-asset";

export function requestLibraryAsset(assetId: string): void {
  pendingLibraryAssetId = assetId;
  window.dispatchEvent(new Event(LIBRARY_ASSET_EVENT));
}

export function consumeLibraryAsset(): string | null {
  const pending = pendingLibraryAssetId;
  pendingLibraryAssetId = null;
  return pending;
}

/** Global search / cross-surface: focus the Library on a specific board. */
let pendingLibraryBoardId: string | null | undefined;

/** Fired when a board should become the active Library view. */
export const LIBRARY_BOARD_EVENT = "mrs:library-board";

export function requestLibraryBoard(boardId: string | null): void {
  pendingLibraryBoardId = boardId;
  window.dispatchEvent(new Event(LIBRARY_BOARD_EVENT));
}

/** Cross-surface: open a specific copy entry in the Copy screen. */
let pendingCopyEntryId: string | null = null;

export const COPY_ENTRY_EVENT = "mrs:copy-entry";

export function requestCopyEntry(entryId: string): void {
  pendingCopyEntryId = entryId;
  window.dispatchEvent(new Event(COPY_ENTRY_EVENT));
}

export function consumeCopyEntry(): string | null {
  const pending = pendingCopyEntryId;
  pendingCopyEntryId = null;
  return pending;
}

/** Cross-surface: open a specific planned post in the Planner lightbox. */
let pendingPlannerSlot: { channel: PlannerChannel; slotId: string } | null = null;

export const PLANNER_SLOT_EVENT = "mrs:planner-slot";

export function requestPlannerSlot(channel: PlannerChannel, slotId: string): void {
  pendingPlannerSlot = { channel, slotId };
  window.dispatchEvent(new Event(PLANNER_SLOT_EVENT));
}

export function consumePlannerSlot(): { channel: PlannerChannel; slotId: string } | null {
  const pending = pendingPlannerSlot;
  pendingPlannerSlot = null;
  return pending;
}

export function consumeLibraryBoard(): string | null | undefined {
  const pending = pendingLibraryBoardId;
  pendingLibraryBoardId = undefined;
  return pending;
}

export function resolveAssetComment(assetId: string, commentId: string): void {
  const current = snapshot.assets
    .find((asset) => asset.id === assetId)
    ?.comments.find((comment) => comment.id === commentId);
  backend?.updateComment(assetId, commentId, { resolved: !current?.resolved });
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId
        ? {
            ...asset,
            comments: asset.comments.map((comment) =>
              comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment,
            ),
            updatedAt: nowIso(),
          }
        : asset,
    ),
  }));
}

/** ---- Collections ------------------------------------------------------- */

export function addCollection(name: string, parentId: string | null = null): string {
  const id = createId("col");
  const collection = { createdAt: nowIso(), id, name, parentId };
  update((draft) => ({
    ...draft,
    collections: [...draft.collections, collection],
  }));
  backend?.upsertCollection(collection);
  return id;
}

/** Find a board by name (case-insensitive) under the given parent, or create it. */
export function ensureCollection(name: string, parentId: string | null = null): string {
  const existing = snapshot.collections.find(
    (collection) =>
      collection.parentId === parentId &&
      collection.name.toLowerCase() === name.toLowerCase(),
  );
  return existing ? existing.id : addCollection(name, parentId);
}

export function renameCollection(collectionId: string, name: string): void {
  update((draft) => ({
    ...draft,
    collections: draft.collections.map((collection) =>
      collection.id === collectionId ? { ...collection, name } : collection,
    ),
  }));
  const renamed = snapshot.collections.find((c) => c.id === collectionId);
  if (renamed) {
    backend?.upsertCollection(renamed);
  }
}

export function moveCollection(collectionId: string, parentId: string | null): void {
  // Guard against cycles: a board cannot become its own descendant.
  update((draft) => {
    if (parentId) {
      let cursor: string | null = parentId;
      while (cursor) {
        if (cursor === collectionId) {
          return draft;
        }
        cursor = draft.collections.find((c) => c.id === cursor)?.parentId ?? null;
      }
    }
    return {
      ...draft,
      collections: draft.collections.map((collection) =>
        collection.id === collectionId ? { ...collection, parentId } : collection,
      ),
    };
  });
  const moved = snapshot.collections.find((c) => c.id === collectionId);
  if (moved) {
    backend?.upsertCollection(moved);
  }
}

/** Delete a board: reparent its children to its parent, unfile its assets. */
export function deleteCollection(collectionId: string): void {
  update((draft) => {
    const target = draft.collections.find((c) => c.id === collectionId);
    const grandparent = target?.parentId ?? null;
    return {
      ...draft,
      assets: draft.assets.map((asset) =>
        asset.collectionId === collectionId ? { ...asset, collectionId: null } : asset,
      ),
      collections: draft.collections
        .filter((collection) => collection.id !== collectionId)
        .map((collection) =>
          collection.parentId === collectionId
            ? { ...collection, parentId: grandparent }
            : collection,
        ),
    };
  });
  backend?.deleteCollection?.(collectionId);
}

export function addAssetComment(
  assetId: string,
  comment: Omit<PinnedComment, "id" | "createdAt" | "resolved">,
): void {
  const full: PinnedComment = {
    ...comment,
    createdAt: nowIso(),
    id: createId("comment"),
    resolved: false,
  };
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId
        ? { ...asset, comments: [...asset.comments, full], updatedAt: nowIso() }
        : asset,
    ),
  }));
  backend?.addComment(assetId, full);
  const asset = snapshot.assets.find((item) => item.id === assetId);
  spawnCommentTask(
    full.id,
    `Photo · ${asset?.name ?? "asset"}`,
    full.text,
    `asset:${assetId}`,
  );
}

/** ---- Comps ------------------------------------------------------------ */

export function upsertComp(comp: Comp): void {
  const next = { ...comp, updatedAt: nowIso() };
  update((draft) => {
    const exists = draft.comps.some((candidate) => candidate.id === comp.id);
    return {
      ...draft,
      comps: exists
        ? draft.comps.map((candidate) => (candidate.id === comp.id ? next : candidate))
        : [...draft.comps, next],
    };
  });
  backend?.upsertComp(next);
}

/** ---- Artboards (the Studio's editable set of comps) -------------------- */

export function setActiveArtboard(compId: string | null): void {
  if (snapshot.activeArtboardId === compId) {
    return;
  }
  update((draft) => ({ ...draft, activeArtboardId: compId }));
}

export function deleteComp(compId: string): void {
  const scrub = (slots: PlannerGridSlot[]): PlannerGridSlot[] =>
    slots
      .filter((slot) => slot.compId !== compId)
      .map((slot) =>
        slot.frames.some((frame) => frame.compId === compId)
          ? { ...slot, frames: slot.frames.filter((frame) => frame.compId !== compId) }
          : slot,
      );
  update((draft) => ({
    ...draft,
    activeArtboardId: draft.activeArtboardId === compId ? null : draft.activeArtboardId,
    comps: draft.comps.filter((comp) => comp.id !== compId),
    planner: {
      gridSlots: scrub(draft.planner.gridSlots),
      pinSlots: scrub(draft.planner.pinSlots),
      reelSlots: scrub(draft.planner.reelSlots),
      storySlots: scrub(draft.planner.storySlots),
      tiktokSlots: scrub(draft.planner.tiktokSlots),
    },
    queue: draft.queue.filter((item) => item.compId !== compId),
  }));
  backend?.deleteComp?.(compId);
}

export function setCompStatus(compId: string, status: ReviewStatus): void {
  update((draft) => ({
    ...draft,
    comps: draft.comps.map((comp) =>
      comp.id === compId ? { ...comp, status, updatedAt: nowIso() } : comp,
    ),
  }));
  const changed = snapshot.comps.find((comp) => comp.id === compId);
  if (changed) {
    backend?.upsertComp(changed);
  }
}

/** ---- Emails ----------------------------------------------------------- */

export function createEmail(name: string): EmailDraft {
  const iso = nowIso();
  const email: EmailDraft = {
    createdAt: iso,
    id: createId("email"),
    name: name.trim() || "Untitled email",
    sections: [],
    updatedAt: iso,
  };
  update((draft) => ({ ...draft, emails: [...draft.emails, email] }));
  backend?.upsertEmail?.(email);
  return email;
}

export function renameEmail(emailId: string, name: string): void {
  let changed: EmailDraft | undefined;
  update((draft) => ({
    ...draft,
    emails: draft.emails.map((email) => {
      if (email.id !== emailId) return email;
      changed = { ...email, name: name.trim() || email.name, updatedAt: nowIso() };
      return changed;
    }),
  }));
  if (changed) backend?.upsertEmail?.(changed);
}

export function deleteEmail(emailId: string): void {
  update((draft) => ({
    ...draft,
    emails: draft.emails.filter((email) => email.id !== emailId),
  }));
  backend?.deleteEmail?.(emailId);
}

/** Apply a change to one email's section list and re-persist the whole row. */
function mutateEmailSections(
  emailId: string,
  mutate: (sections: EmailSection[]) => EmailSection[],
): void {
  let changed: EmailDraft | undefined;
  update((draft) => ({
    ...draft,
    emails: draft.emails.map((email) => {
      if (email.id !== emailId) return email;
      changed = { ...email, sections: mutate(email.sections), updatedAt: nowIso() };
      return changed;
    }),
  }));
  if (changed) backend?.upsertEmail?.(changed);
}

export function addEmailSection(
  emailId: string,
  section: EmailSection,
  index?: number,
): void {
  mutateEmailSections(emailId, (sections) => {
    if (index == null || index >= sections.length) {
      return [...sections, section];
    }
    const next = [...sections];
    next.splice(Math.max(0, index), 0, section);
    return next;
  });
}

export function updateEmailSection(
  emailId: string,
  sectionId: string,
  patch: Partial<EmailSection>,
): void {
  mutateEmailSections(emailId, (sections) =>
    sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch } : section,
    ),
  );
}

export function removeEmailSection(emailId: string, sectionId: string): void {
  mutateEmailSections(emailId, (sections) =>
    sections.filter((section) => section.id !== sectionId),
  );
}

/** Nudge a section up (-1) or down (+1) in the stack. */
export function reorderEmailSection(
  emailId: string,
  sectionId: string,
  direction: -1 | 1,
): void {
  mutateEmailSections(emailId, (sections) => {
    const from = sections.findIndex((section) => section.id === sectionId);
    if (from === -1) return sections;
    const to = from + direction;
    if (to < 0 || to >= sections.length) return sections;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

/** Drag-to-reorder: move a section so it lands at `toIndex` in the stack. */
export function moveEmailSection(
  emailId: string,
  sectionId: string,
  toIndex: number,
): void {
  mutateEmailSections(emailId, (sections) => {
    const from = sections.findIndex((section) => section.id === sectionId);
    if (from === -1) return sections;
    const clamped = Math.max(0, Math.min(sections.length - 1, toIndex));
    if (clamped === from) return sections;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(clamped, 0, moved);
    return next;
  });
}

/** ---- Brand links ------------------------------------------------------- */

export function addLink(label: string, url: string): void {
  const link: BrandLink = { createdAt: nowIso(), id: createId("link"), label, url };
  update((draft) => ({ ...draft, links: [...draft.links, link] }));
  backend?.upsertLink?.(link);
}

export function updateLink(linkId: string, patch: Partial<BrandLink>): void {
  update((draft) => ({
    ...draft,
    links: draft.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)),
  }));
  const changed = snapshot.links.find((link) => link.id === linkId);
  if (changed) backend?.upsertLink?.(changed);
}

export function deleteLink(linkId: string): void {
  update((draft) => ({ ...draft, links: draft.links.filter((link) => link.id !== linkId) }));
  backend?.deleteLink?.(linkId);
}

/** ---- Copy library: folders --------------------------------------------- */

export function addCopyFolder(name: string, parentId: string | null = null): string {
  const folder: CopyFolder = {
    createdAt: nowIso(),
    id: createId("cfolder"),
    name,
    parentId,
  };
  update((draft) => ({ ...draft, copyFolders: [...draft.copyFolders, folder] }));
  backend?.upsertCopyFolder?.(folder);
  return folder.id;
}

export function renameCopyFolder(folderId: string, name: string): void {
  update((draft) => ({
    ...draft,
    copyFolders: draft.copyFolders.map((folder) =>
      folder.id === folderId ? { ...folder, name } : folder,
    ),
  }));
  const changed = snapshot.copyFolders.find((folder) => folder.id === folderId);
  if (changed) backend?.upsertCopyFolder?.(changed);
}

/**
 * Delete a folder: its sub-folders move up to its parent and its entries fall
 * back to unfiled (folderId null). Mirrors Library board deletion.
 */
export function deleteCopyFolder(folderId: string): void {
  const target = snapshot.copyFolders.find((folder) => folder.id === folderId);
  const grandparent = target?.parentId ?? null;
  const orphaned = snapshot.journal.filter((entry) => entry.folderId === folderId);
  const reparented = snapshot.copyFolders.filter((folder) => folder.parentId === folderId);
  update((draft) => ({
    ...draft,
    copyFolders: draft.copyFolders
      .filter((folder) => folder.id !== folderId)
      .map((folder) =>
        folder.parentId === folderId ? { ...folder, parentId: grandparent } : folder,
      ),
    journal: draft.journal.map((entry) =>
      entry.folderId === folderId ? { ...entry, folderId: null } : entry,
    ),
  }));
  backend?.deleteCopyFolder?.(folderId);
  for (const folder of reparented) {
    const next = snapshot.copyFolders.find((item) => item.id === folder.id);
    if (next) backend?.upsertCopyFolder?.(next);
  }
  for (const entry of orphaned) {
    const next = snapshot.journal.find((item) => item.id === entry.id);
    if (next) backend?.upsertJournalEntry?.(next);
  }
}

/** ---- Copy / journal ---------------------------------------------------- */

export function addJournalEntry(
  kind: JournalEntry["kind"],
  title: string,
  body: string,
  folderId: string | null = null,
): string {
  const now = nowIso();
  const entry: JournalEntry = {
    body,
    comments: [],
    createdAt: now,
    folderId,
    id: createId("note"),
    kind,
    tags: [],
    title,
    updatedAt: now,
  };
  update((draft) => ({ ...draft, journal: [entry, ...draft.journal] }));
  backend?.upsertJournalEntry?.(entry);
  return entry.id;
}

export function addJournalComment(entryId: string, text: string): void {
  const body = text.trim();
  if (!body) return;
  const comment: JournalComment = {
    author: snapshot.settings.displayName ?? "You",
    body,
    createdAt: nowIso(),
    id: createId("jc"),
  };
  update((draft) => ({
    ...draft,
    journal: draft.journal.map((entry) =>
      entry.id === entryId
        ? { ...entry, comments: [...entry.comments, comment] }
        : entry,
    ),
  }));
  const changed = snapshot.journal.find((entry) => entry.id === entryId);
  if (changed) backend?.upsertJournalEntry?.(changed);
  spawnCommentTask(
    comment.id,
    `Copy · ${changed?.title || "Untitled"}`,
    body,
    `copy:${entryId}`,
  );
}

export function deleteJournalComment(entryId: string, commentId: string): void {
  update((draft) => ({
    ...draft,
    journal: draft.journal.map((entry) =>
      entry.id === entryId
        ? { ...entry, comments: entry.comments.filter((c) => c.id !== commentId) }
        : entry,
    ),
  }));
  const changed = snapshot.journal.find((entry) => entry.id === entryId);
  if (changed) backend?.upsertJournalEntry?.(changed);
  deleteTasksForComment(commentId);
}

export function updateJournalEntry(entryId: string, patch: Partial<JournalEntry>): void {
  update((draft) => ({
    ...draft,
    journal: draft.journal.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch, updatedAt: nowIso() } : entry,
    ),
  }));
  const changed = snapshot.journal.find((entry) => entry.id === entryId);
  if (changed) backend?.upsertJournalEntry?.(changed);
}

export function deleteJournalEntry(entryId: string): void {
  update((draft) => ({
    ...draft,
    journal: draft.journal.filter((entry) => entry.id !== entryId),
  }));
  backend?.deleteJournalEntry?.(entryId);
}

/** ---- Tasks (Kanban) ---------------------------------------------------- */

/** Auto-create a "comment" task when a comment is made anywhere in the app. */
function spawnCommentTask(
  commentId: string,
  sourceLabel: string,
  text: string,
  sourceRef: string | null = null,
): void {
  const now = nowIso();
  const position =
    Math.max(0, ...snapshot.tasks.filter((t) => t.status === "todo").map((t) => t.position)) + 1;
  const task: Task = {
    assignee: null,
    createdAt: now,
    id: createId("task"),
    position,
    sourceCommentId: commentId,
    sourceLabel,
    sourceRef,
    status: "todo",
    tags: ["comment"],
    title: text.length > 120 ? `${text.slice(0, 117)}…` : text,
    updatedAt: now,
  };
  update((draft) => ({ ...draft, tasks: [...draft.tasks, task] }));
  backend?.upsertTask?.(task);
}

/** Remove any task auto-created from a now-deleted comment. */
function deleteTasksForComment(commentId: string): void {
  const doomed = snapshot.tasks.filter((task) => task.sourceCommentId === commentId);
  if (doomed.length === 0) return;
  update((draft) => ({
    ...draft,
    tasks: draft.tasks.filter((task) => task.sourceCommentId !== commentId),
  }));
  for (const task of doomed) backend?.deleteTask?.(task.id);
}

export function addTask(title: string, status: TaskStatus, tags: string[] = []): string {
  const now = nowIso();
  const position =
    Math.max(0, ...snapshot.tasks.filter((t) => t.status === status).map((t) => t.position)) + 1;
  const task: Task = {
    assignee: null,
    createdAt: now,
    id: createId("task"),
    position,
    status,
    tags,
    title,
    updatedAt: now,
  };
  update((draft) => ({ ...draft, tasks: [...draft.tasks, task] }));
  backend?.upsertTask?.(task);
  return task.id;
}

export function updateTask(taskId: string, patch: Partial<Task>): void {
  update((draft) => ({
    ...draft,
    tasks: draft.tasks.map((task) =>
      task.id === taskId ? { ...task, ...patch, updatedAt: nowIso() } : task,
    ),
  }));
  const changed = snapshot.tasks.find((task) => task.id === taskId);
  if (changed) backend?.upsertTask?.(changed);
}

export function addSubtask(taskId: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  const task = snapshot.tasks.find((t) => t.id === taskId);
  const subtasks = [
    ...(task?.subtasks ?? []),
    { done: false, id: createId("sub"), title: trimmed },
  ];
  updateTask(taskId, { subtasks });
}

export function toggleSubtask(taskId: string, subtaskId: string): void {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return;
  updateTask(taskId, {
    subtasks: (task.subtasks ?? []).map((sub) =>
      sub.id === subtaskId ? { ...sub, done: !sub.done } : sub,
    ),
  });
}

export function deleteSubtask(taskId: string, subtaskId: string): void {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return;
  updateTask(taskId, {
    subtasks: (task.subtasks ?? []).filter((sub) => sub.id !== subtaskId),
  });
}

/** Move a task to a column, appended to the end of it. */
export function moveTask(taskId: string, status: TaskStatus): void {
  const position =
    Math.max(0, ...snapshot.tasks.filter((t) => t.status === status).map((t) => t.position)) + 1;
  updateTask(taskId, { position, status });
}

/**
 * Move a task into `status` and place it before `beforeId` (or at the end when
 * null), renumbering that column so drag-to-reorder within and across columns
 * sticks. Persists every task whose position changed.
 */
export function reorderTask(
  taskId: string,
  status: TaskStatus,
  beforeId: string | null,
): void {
  const moved = snapshot.tasks.find((task) => task.id === taskId);
  if (!moved) return;
  const column = snapshot.tasks
    .filter((task) => task.status === status && task.id !== taskId)
    .sort((a, b) => a.position - b.position);
  const insertAt =
    beforeId && beforeId !== taskId
      ? column.findIndex((task) => task.id === beforeId)
      : column.length;
  const index = insertAt < 0 ? column.length : insertAt;
  const ordered = [...column.slice(0, index), moved, ...column.slice(index)];

  const now = nowIso();
  const nextPos = new Map<string, number>();
  ordered.forEach((task, position) => nextPos.set(task.id, position + 1));

  update((draft) => ({
    ...draft,
    tasks: draft.tasks.map((task) => {
      const position = nextPos.get(task.id);
      if (position === undefined) return task;
      if (task.id === taskId) return { ...task, position, status, updatedAt: now };
      return task.position === position ? task : { ...task, position };
    }),
  }));

  for (const task of snapshot.tasks) {
    if (nextPos.has(task.id)) backend?.upsertTask?.(task);
  }
}

export function deleteTask(taskId: string): void {
  update((draft) => ({ ...draft, tasks: draft.tasks.filter((task) => task.id !== taskId) }));
  backend?.deleteTask?.(taskId);
}

/** ---- Planner ----------------------------------------------------------- */

const CHANNEL_KEYS: Record<PlannerChannel, keyof ProjectSnapshot["planner"]> = {
  grid: "gridSlots",
  pinterest: "pinSlots",
  reel: "reelSlots",
  story: "storySlots",
  tiktok: "tiktokSlots",
};

function channelSlots(planner: ProjectSnapshot["planner"], channel: PlannerChannel): PlannerGridSlot[] {
  return planner[CHANNEL_KEYS[channel]];
}

function withChannelSlots(
  planner: ProjectSnapshot["planner"],
  channel: PlannerChannel,
  slots: PlannerGridSlot[],
): ProjectSnapshot["planner"] {
  return { ...planner, [CHANNEL_KEYS[channel]]: slots };
}

function makeSlot(input: { assetId?: string | null; compId?: string | null; label?: string | null }): PlannerGridSlot {
  return {
    assetId: input.assetId ?? null,
    comments: [],
    compId: input.compId ?? null,
    frames: [],
    id: createId("slot"),
    label: input.label ?? null,
    status: "draft",
  };
}

export function addPlannerSlot(
  channel: PlannerChannel,
  input: { assetId?: string | null; compId?: string | null; label?: string | null },
): string {
  // Each teammate owns the posts they add; the planner filters by owner.
  const slot = { ...makeSlot(input), owner: snapshot.settings.displayName ?? null };
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      // Feed grid plans newest-first (top of profile); other strips append.
      channel === "grid"
        ? [slot, ...channelSlots(draft.planner, channel)]
        : [...channelSlots(draft.planner, channel), slot],
    ),
  }));
  backend?.savePlanner(snapshot.planner);
  return slot.id;
}

export function addPlannerGridSlot(input: {
  assetId?: string | null;
  compId?: string | null;
  label?: string | null;
}): void {
  addPlannerSlot("grid", input);
}

export function addPlannerStorySlot(input: {
  assetId?: string | null;
  compId?: string | null;
  label?: string | null;
}): void {
  addPlannerSlot("story", input);
}

/** The planner channel a Studio format belongs to, so "Add to planner" files
 * the comp under the strip that matches how it publishes. */
export function plannerChannelForFormat(formatId: string): PlannerChannel {
  switch (formatId) {
    case "ig-story":
      return "story";
    case "tiktok":
      return "tiktok";
    case "pin":
      return "pinterest";
    default:
      // ig-post, ig-square, landscape, email… all read as feed posts.
      return "grid";
  }
}

/** The planner channel a raw asset belongs to, inferred from its aspect and
 * kind (assets carry no format). Tall video → Reels, 9:16 → Stories, ~2:3 →
 * Pinterest, otherwise the feed grid. */
export function plannerChannelForAsset(asset: Asset): PlannerChannel {
  const aspect = asset.height > 0 ? asset.width / asset.height : 1;
  if (asset.kind === "video" && aspect <= 0.65) {
    return "reel";
  }
  if (aspect <= 0.6) {
    return "story";
  }
  if (aspect <= 0.72) {
    return "pinterest";
  }
  return "grid";
}

export function removePlannerSlot(channel: PlannerChannel, slotId: string): void {
  const doomed = channelSlots(snapshot.planner, channel).find((slot) => slot.id === slotId);
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      channelSlots(draft.planner, channel).filter((slot) => slot.id !== slotId),
    ),
  }));
  backend?.savePlanner(snapshot.planner);
  for (const comment of doomed?.comments ?? []) deleteTasksForComment(comment.id);
}

export function reorderPlannerSlots(
  channel: PlannerChannel,
  fromId: string,
  toId: string,
): void {
  update((draft) => {
    const list = channelSlots(draft.planner, channel);
    const fromIndex = list.findIndex((slot) => slot.id === fromId);
    const toIndex = list.findIndex((slot) => slot.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return draft;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    return { ...draft, planner: withChannelSlots(draft.planner, channel, next) };
  });
  backend?.savePlanner(snapshot.planner);
}

export function addPlannerPlaceholder(channel: PlannerChannel, label: string): void {
  addPlannerSlot(channel, { label });
}

export function updatePlannerSlot(
  channel: PlannerChannel,
  slotId: string,
  patch: Partial<
    Pick<
      PlannerGridSlot,
      "assetId" | "assignedTo" | "compId" | "label" | "scheduledDate" | "scheduledTime" | "status"
    >
  >,
): void {
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      channelSlots(draft.planner, channel).map((slot) =>
        slot.id === slotId ? { ...slot, ...patch } : slot,
      ),
    ),
  }));
  backend?.savePlanner(snapshot.planner);
}

/** Append a carousel frame to a planned post. */
export function addPlannerFrame(
  channel: PlannerChannel,
  slotId: string,
  input: { assetId?: string | null; compId?: string | null },
): void {
  const frame: PlannerFrame = {
    assetId: input.assetId ?? null,
    compId: input.compId ?? null,
    id: createId("frame"),
  };
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      channelSlots(draft.planner, channel).map((slot) =>
        slot.id === slotId ? { ...slot, frames: [...slot.frames, frame] } : slot,
      ),
    ),
  }));
  backend?.savePlanner(snapshot.planner);
}

export function removePlannerFrame(
  channel: PlannerChannel,
  slotId: string,
  frameId: string,
): void {
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      channelSlots(draft.planner, channel).map((slot) =>
        slot.id === slotId
          ? { ...slot, frames: slot.frames.filter((frame) => frame.id !== frameId) }
          : slot,
      ),
    ),
  }));
  backend?.savePlanner(snapshot.planner);
}

export function addPlannerComment(
  channel: PlannerChannel,
  slotId: string,
  text: string,
): void {
  const body = text.trim();
  if (!body) return;
  const comment: JournalComment = {
    author: snapshot.settings.displayName ?? "You",
    body,
    createdAt: nowIso(),
    id: createId("pc"),
  };
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      channelSlots(draft.planner, channel).map((slot) =>
        slot.id === slotId ? { ...slot, comments: [...slot.comments, comment] } : slot,
      ),
    ),
  }));
  backend?.savePlanner(snapshot.planner);
  spawnCommentTask(
    comment.id,
    `Planner · ${PLANNER_CHANNEL_LABELS[channel]}`,
    body,
    `planner:${channel}:${slotId}`,
  );
}

export function deletePlannerComment(
  channel: PlannerChannel,
  slotId: string,
  commentId: string,
): void {
  update((draft) => ({
    ...draft,
    planner: withChannelSlots(
      draft.planner,
      channel,
      channelSlots(draft.planner, channel).map((slot) =>
        slot.id === slotId
          ? { ...slot, comments: slot.comments.filter((c) => c.id !== commentId) }
          : slot,
      ),
    ),
  }));
  backend?.savePlanner(snapshot.planner);
  deleteTasksForComment(commentId);
}

/** ---- Copy decks -------------------------------------------------------- */

export function addDeck(name: string, variants: string[]): CopyDeck {
  const deck: CopyDeck = { createdAt: nowIso(), id: createId("deck"), name, variants };
  update((draft) => ({ ...draft, decks: [...draft.decks, deck] }));
  backend?.upsertDeck(deck);
  return deck;
}

/** ---- Studio templates -------------------------------------------------- */

/** Save the current design as a team-shared, reusable template. */
export function addTemplate(
  name: string,
  values: Record<string, unknown>,
  formatId: string,
): Template {
  const template: Template = {
    createdAt: nowIso(),
    createdBy: snapshot.settings.displayName ?? null,
    formatId,
    id: createId("tmpl"),
    name,
    values,
  };
  update((draft) => ({ ...draft, templates: [...draft.templates, template] }));
  backend?.upsertTemplate?.(template);
  return template;
}

export function deleteTemplate(templateId: string): void {
  update((draft) => ({
    ...draft,
    templates: draft.templates.filter((template) => template.id !== templateId),
  }));
  backend?.deleteTemplate?.(templateId);
}

/** ---- Copy snippets ----------------------------------------------------- */

/** Save a reusable piece of copy (headline/subhead/body), shared with the team. */
export function addCopySnippet(input: {
  flourish?: Record<string, unknown>;
  role: CopySnippet["role"];
  tags?: string[];
  text: string;
}): CopySnippet {
  const snippet: CopySnippet = {
    createdAt: nowIso(),
    createdBy: snapshot.settings.displayName ?? null,
    flourish: input.flourish,
    id: createId("copy"),
    role: input.role,
    tags: input.tags ?? [],
    text: input.text,
  };
  update((draft) => ({ ...draft, copySnippets: [...draft.copySnippets, snippet] }));
  backend?.upsertCopySnippet?.(snippet);
  return snippet;
}

export function updateCopySnippet(
  snippetId: string,
  patch: Partial<Pick<CopySnippet, "flourish" | "role" | "tags" | "text">>,
): void {
  let updated: CopySnippet | null = null;
  update((draft) => ({
    ...draft,
    copySnippets: draft.copySnippets.map((snippet) => {
      if (snippet.id !== snippetId) {
        return snippet;
      }
      updated = { ...snippet, ...patch };
      return updated;
    }),
  }));
  if (updated) {
    backend?.upsertCopySnippet?.(updated);
  }
}

export function deleteCopySnippet(snippetId: string): void {
  update((draft) => ({
    ...draft,
    copySnippets: draft.copySnippets.filter((snippet) => snippet.id !== snippetId),
  }));
  backend?.deleteCopySnippet?.(snippetId);
}

/** ---- Queue ------------------------------------------------------------- */

export function addToQueue(compId: string, formatIds: string[]): void {
  const item: QueueItem = { addedAt: nowIso(), compId, formatIds, id: createId("queue") };
  update((draft) => ({ ...draft, queue: [...draft.queue, item] }));
  backend?.upsertQueueItem(item);
}

/**
 * Stage a raw asset for export/download. Its original file rides along in the
 * queue's ZIP (under `originals/`) and can be downloaded individually. Deduped:
 * a second add for the same asset is a no-op.
 */
export function addAssetToQueue(assetId: string): boolean {
  if (snapshot.queue.some((item) => item.assetId === assetId)) {
    return false;
  }
  const item: QueueItem = {
    addedAt: nowIso(),
    assetId,
    compId: null,
    formatIds: [],
    id: createId("queue"),
  };
  update((draft) => ({ ...draft, queue: [...draft.queue, item] }));
  backend?.upsertQueueItem(item);
  return true;
}

export function removeFromQueue(queueItemId: string): void {
  update((draft) => ({
    ...draft,
    queue: draft.queue.filter((item) => item.id !== queueItemId),
  }));
  backend?.removeQueueItem(queueItemId);
}

/** Toggle a platform format on/off for a queued comp. */
export function toggleQueueItemFormat(queueItemId: string, formatId: string): void {
  update((draft) => ({
    ...draft,
    queue: draft.queue.map((item) => {
      if (item.id !== queueItemId) {
        return item;
      }
      const has = item.formatIds.includes(formatId);
      const formatIds = has
        ? item.formatIds.filter((id) => id !== formatId)
        : [...item.formatIds, formatId];
      // Never allow an empty selection — keep at least the toggled format.
      return { ...item, formatIds: formatIds.length > 0 ? formatIds : [formatId] };
    }),
  }));
  const changed = snapshot.queue.find((item) => item.id === queueItemId);
  if (changed) {
    backend?.upsertQueueItem(changed);
  }
}

export function clearQueue(): void {
  update((draft) => ({ ...draft, queue: [] }));
  backend?.clearQueue();
}
