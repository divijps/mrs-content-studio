import * as React from "react";

import { Button } from "@/toolcraft/ui";
import { toast } from "sonner";

import { PLATFORM_FORMATS } from "../data/formats";
import { useProject } from "../data/project-store";
import type { CopySnippet } from "../data/types";
import type { StudioValues } from "./comp-layout";
import { generateVariations, type VariationHeadline } from "./studio-actions";

const SOCIAL_FORMATS = PLATFORM_FORMATS.filter((format) => format.platform !== "email");

const SECTION_LABEL = "text-2xs uppercase tracking-[0.14em] text-muted-foreground";

/** A tap-to-select copy chip. */
function CopyChip(props: {
  active: boolean;
  label: string;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-pressed={props.active}
      className={`rounded-lg border px-2.5 py-1.5 text-left text-xs-plus transition-colors ${
        props.active
          ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_12%,transparent)] text-foreground"
          : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-muted-foreground hover:border-[color:color-mix(in_oklab,var(--foreground)_25%,transparent)] hover:text-foreground"
      }`}
      onClick={props.onToggle}
      type="button"
    >
      {props.label}
    </button>
  );
}

/**
 * Variations — the matrix builder. Seeded from the artboard in view, it fans out
 * the chosen headlines × sub-heads × images into new artboards in the session
 * rail. A format selector at the top keeps a batch organized to one size. Copy
 * options are the team's saved snippets (headlines carry their flourish preset),
 * plus ad-hoc lines you type in. Any dimension left empty keeps the base value.
 */
export function VariationsModal(props: {
  base: StudioValues;
  onClose: () => void;
  onGenerated: () => void;
}): React.JSX.Element {
  const project = useProject();
  const [formatId, setFormatId] = React.useState(props.base.formatId);
  const [headlineIds, setHeadlineIds] = React.useState<string[]>([]);
  const [subheadIds, setSubheadIds] = React.useState<string[]>([]);
  const [headlineExtra, setHeadlineExtra] = React.useState("");
  const [subheadExtra, setSubheadExtra] = React.useState("");
  const [assetIds, setAssetIds] = React.useState<string[]>([]);

  const headlineSnippets = project.copySnippets.filter((s) => s.role === "headline");
  const subheadSnippets = project.copySnippets.filter((s) => s.role === "subhead");

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const parseLines = (raw: string): string[] =>
    raw
      .split("\n")
      .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean);

  // Assemble the chosen dimensions. Snippet picks first, then any typed lines.
  const headlines: VariationHeadline[] = [
    ...headlineIds
      .map((id) => headlineSnippets.find((s) => s.id === id))
      .filter((s): s is CopySnippet => Boolean(s))
      .map((s) => ({ flourish: s.flourish, text: s.text })),
    ...parseLines(headlineExtra).map((text) => ({ text })),
  ];
  const subheads: string[] = [
    ...subheadIds
      .map((id) => subheadSnippets.find((s) => s.id === id)?.text)
      .filter((text): text is string => Boolean(text)),
    ...parseLines(subheadExtra),
  ];

  const dim = (n: number): number => Math.max(1, n);
  const compCount = dim(headlines.length) * dim(subheads.length) * dim(assetIds.length);
  const nothingPicked =
    headlines.length === 0 && subheads.length === 0 && assetIds.length === 0;

  const generate = (): void => {
    if (nothingPicked) {
      toast.error("Pick at least one headline, sub-head, or image to vary.");
      return;
    }
    const result = generateVariations({
      base: props.base,
      formatId,
      headlines,
      imageIds: assetIds,
      subheads,
    });
    toast.success(
      `${result.comps} variation${result.comps === 1 ? "" : "s"} added to the rail`,
    );
    props.onGenerated();
    props.onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[86vh] w-[560px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-[color:var(--popover)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Generate variations</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={props.onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {/* Format — organizes the whole batch to one size */}
          <div className="flex flex-col gap-1.5">
            <span className={SECTION_LABEL}>Format</span>
            <select
              className="h-9 rounded-lg bg-[color:var(--surface-inactive)] px-2.5 text-sm outline-none focus:bg-[color:var(--surface-active)]"
              onChange={(event) => setFormatId(event.target.value)}
              value={formatId}
            >
              {SOCIAL_FORMATS.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.platformLabel} · {format.label}
                </option>
              ))}
            </select>
          </div>

          {/* Headlines */}
          <div className="flex flex-col gap-1.5">
            <span className={SECTION_LABEL}>Headlines ({headlines.length})</span>
            {headlineSnippets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {headlineSnippets.map((snippet) => (
                  <CopyChip
                    active={headlineIds.includes(snippet.id)}
                    key={snippet.id}
                    label={snippet.text}
                    onToggle={() => setHeadlineIds((list) => toggle(list, snippet.id))}
                  />
                ))}
              </div>
            ) : (
              <p className="text-2xs text-muted-foreground">
                No saved headlines yet — save some from the Copy page, or type lines below.
              </p>
            )}
            <textarea
              className="h-16 resize-none rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs-plus outline-none focus:border-accent"
              onChange={(event) => setHeadlineExtra(event.target.value)}
              placeholder="…or add custom headlines, one per line"
              value={headlineExtra}
            />
          </div>

          {/* Sub-heads */}
          <div className="flex flex-col gap-1.5">
            <span className={SECTION_LABEL}>Sub-heads ({subheads.length})</span>
            {subheadSnippets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {subheadSnippets.map((snippet) => (
                  <CopyChip
                    active={subheadIds.includes(snippet.id)}
                    key={snippet.id}
                    label={snippet.text}
                    onToggle={() => setSubheadIds((list) => toggle(list, snippet.id))}
                  />
                ))}
              </div>
            ) : null}
            <textarea
              className="h-14 resize-none rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs-plus outline-none focus:border-accent"
              onChange={(event) => setSubheadExtra(event.target.value)}
              placeholder="…or add custom sub-heads, one per line"
              value={subheadExtra}
            />
          </div>

          {/* Images */}
          <div className="flex flex-col gap-1.5">
            <span className={SECTION_LABEL}>Images ({assetIds.length})</span>
            <div className="grid max-h-32 grid-cols-6 gap-1.5 overflow-y-auto">
              {project.assets.map((asset) => (
                <button
                  className={`overflow-hidden rounded-md border-2 ${assetIds.includes(asset.id) ? "border-accent" : "border-transparent"}`}
                  key={asset.id}
                  onClick={() => setAssetIds((list) => toggle(list, asset.id))}
                  type="button"
                >
                  <img
                    alt={asset.name}
                    className="aspect-square w-full object-cover"
                    decoding="async"
                    loading="lazy"
                    src={asset.thumbUrl}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-2xs text-muted-foreground">
            {dim(headlines.length)} × {dim(subheads.length)} × {dim(assetIds.length)} ={" "}
            <span className="text-foreground">
              {compCount} artboard{compCount === 1 ? "" : "s"}
            </span>
          </span>
          <Button disabled={nothingPicked} onClick={generate} size="sm" type="button">
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
