/**
 * Shared, ephemeral playback state between the Media panel's scrubber and the
 * canvas's live video layer. Deliberately NOT a Toolcraft value: play state
 * and the live playhead are transient UI, not part of the design (the design
 * value is `image.posterTime` — the still moment — which the pad writes when
 * scrubbing/pausing).
 */

import * as React from "react";

export interface VideoPlayback {
  /** Live playhead (seconds) while playing — mirrors the canvas video. */
  currentTime: number;
  /** Duration the canvas video learned (fallback for assets whose import-time
   * duration probe failed — e.g. WebM without duration metadata). */
  duration: number;
  playing: boolean;
}

let state: VideoPlayback = { currentTime: 0, duration: 0, playing: false };
const listeners = new Set<() => void>();

function emit(): void {
  state = { ...state };
  for (const listener of listeners) listener();
}

export function setPlaying(playing: boolean): void {
  if (state.playing !== playing) {
    state.playing = playing;
    emit();
  }
}

export function reportPlayhead(currentTime: number): void {
  // Throttled by the caller (timeupdate fires ~4Hz) — plain write + emit.
  state.currentTime = currentTime;
  emit();
}

export function reportDuration(duration: number): void {
  if (Number.isFinite(duration) && duration > 0 && state.duration !== duration) {
    state.duration = duration;
    emit();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): VideoPlayback {
  return state;
}

export function useVideoPlayback(): VideoPlayback {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
