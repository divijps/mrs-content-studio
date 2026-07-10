/**
 * A tiny app-wide store for in-flight imports/uploads, so the UI can always
 * show a clear "still working — don't refresh" indicator (the previous flow
 * gave no feedback for a single large video, and a user refreshed mid-upload
 * and lost it). While anything is active it also arms a beforeunload guard so
 * closing or refreshing the tab prompts a confirmation.
 */

import * as React from "react";

export type UploadPhase = "preparing" | "rendering" | "uploading" | "done" | "error";

export interface UploadItem {
  detail?: string;
  error?: string;
  /** 0..1 overall progress. */
  fraction: number;
  id: string;
  kind: "image" | "mixed" | "video";
  label: string;
  phase: UploadPhase;
}

let items: UploadItem[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit(): void {
  // New array identity each change so useSyncExternalStore re-renders.
  items = [...items];
  for (const listener of listeners) listener();
  syncUnloadGuard();
}

function isActive(item: UploadItem): boolean {
  return (
    item.phase === "preparing" ||
    item.phase === "uploading" ||
    item.phase === "rendering"
  );
}

/** Warn before unload while an upload is running — the whole point of this store. */
function beforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}

let guardArmed = false;
function syncUnloadGuard(): void {
  if (typeof window === "undefined") return;
  const active = items.some(isActive);
  if (active && !guardArmed) {
    window.addEventListener("beforeunload", beforeUnload);
    guardArmed = true;
  } else if (!active && guardArmed) {
    window.removeEventListener("beforeunload", beforeUnload);
    guardArmed = false;
  }
}

export function beginUpload(input: {
  kind: UploadItem["kind"];
  label: string;
}): string {
  seq += 1;
  const id = `upload-${seq}`;
  items.push({
    fraction: 0,
    id,
    kind: input.kind,
    label: input.label,
    phase: "preparing",
  });
  emit();
  return id;
}

export function updateUpload(id: string, patch: Partial<Omit<UploadItem, "id">>): void {
  items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  emit();
}

/** Mark done, then drop it from the list after a short beat so the ✓ is seen. */
export function finishUpload(id: string): void {
  updateUpload(id, { fraction: 1, phase: "done" });
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, 2500);
}

/** Mark failed — stays until dismissed so the error isn't missed. */
export function failUpload(id: string, error: string): void {
  updateUpload(id, { error, phase: "error" });
}

export function dismissUpload(id: string): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UploadItem[] {
  return items;
}

export function useUploads(): UploadItem[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
