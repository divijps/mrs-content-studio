import * as React from "react";

import { dismissUpload, useUploads, type UploadItem } from "../data/upload-store";

const PHASE_LABEL: Record<UploadItem["phase"], string> = {
  done: "Done",
  error: "Failed",
  preparing: "Preparing…",
  uploading: "Uploading…",
};

function kindIcon(kind: UploadItem["kind"]): string {
  if (kind === "video") return "▶";
  if (kind === "mixed") return "⧉";
  return "▦";
}

/**
 * Always-visible upload status, mounted app-wide (survives route changes). It
 * exists so a slow import — especially a large video — clearly reads as "still
 * working, don't refresh," with a live progress bar and an explicit warning.
 */
export function UploadPanel(): React.JSX.Element | null {
  const uploads = useUploads();
  if (uploads.length === 0) {
    return null;
  }
  const anyActive = uploads.some(
    (upload) => upload.phase === "preparing" || upload.phase === "uploading",
  );
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {uploads.map((upload) => {
        const pct = Math.round(upload.fraction * 100);
        const isError = upload.phase === "error";
        const isDone = upload.phase === "done";
        return (
          <div
            className="ds-hairline rounded-xl border border-border bg-[color:color-mix(in_oklab,var(--popover)_92%,transparent)] p-3 shadow-2xl backdrop-blur"
            key={upload.id}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]"
              >
                {isDone ? "✓" : isError ? "⚠" : kindIcon(upload.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs-plus text-foreground">
                {upload.label}
              </span>
              <span
                className={`tabular-nums text-2xs ${isError ? "text-[color:var(--destructive)]" : "text-muted-foreground"}`}
              >
                {isError ? "Failed" : isDone ? "Done" : `${pct}%`}
              </span>
              {isError || isDone ? (
                <button
                  aria-label="Dismiss"
                  className="ml-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => dismissUpload(upload.id)}
                  type="button"
                >
                  ✕
                </button>
              ) : null}
            </div>
            {isError ? (
              <p className="mt-1.5 text-2xs text-[color:var(--destructive)]">{upload.error}</p>
            ) : (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)]">
                  <div
                    className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-200"
                    style={{ width: `${isDone ? 100 : Math.max(4, pct)}%` }}
                  />
                </div>
                {!isDone ? (
                  <p className="mt-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                    {upload.detail
                      ? `${PHASE_LABEL[upload.phase]} · ${upload.detail}`
                      : PHASE_LABEL[upload.phase]}
                  </p>
                ) : null}
              </>
            )}
          </div>
        );
      })}
      {anyActive ? (
        <p className="ds-hairline rounded-lg bg-[color:color-mix(in_oklab,var(--popover)_85%,transparent)] px-3 py-1.5 text-center text-2xs text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] backdrop-blur">
          Keep this tab open — don’t refresh while uploading.
        </p>
      ) : null}
    </div>
  );
}
