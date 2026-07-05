import * as React from "react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

import { useProject } from "../data/project-store";

/**
 * Library-fed photo picker.
 *
 * Custom control (documented builtInFitCheck): the built-in imagePicker takes a
 * static `items` list resolved when the schema module loads, but the Library is
 * a living collection — imports, board filing, and (later) Supabase sync must
 * appear here instantly. This renders the same compact thumbnail-grid
 * interaction against live store data and writes the asset id via setValue.
 */
export const LibraryImageControl: ToolcraftCustomControlRenderer = ({
  setValue,
  value,
}) => {
  const project = useProject();
  const selected = typeof value === "string" ? value : null;

  if (project.assets.length === 0) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        No photos yet — import some in the Library.
      </p>
    );
  }

  return (
    <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
      {project.assets.map((asset) => {
        const active = selected === asset.id;
        return (
          <button
            aria-label={asset.name}
            aria-pressed={active}
            className={`relative aspect-square overflow-hidden rounded-md border transition-colors ${
              active
                ? "border-[color:var(--accent)] ring-1 ring-[color:color-mix(in_oklab,var(--accent)_45%,transparent)]"
                : "border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)]"
            }`}
            key={asset.id}
            onClick={() => setValue(asset.id)}
            title={asset.name}
            type="button"
          >
            <img
              alt=""
              className="h-full w-full object-cover"
              src={asset.thumbUrl}
              style={{
                objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%`,
              }}
            />
            {asset.status === "approved" ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#4caf7d]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
