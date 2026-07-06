import * as React from "react";

import { Button } from "@/toolcraft/ui";
import { toast } from "sonner";

import { PLATFORM_FORMATS } from "../data/formats";
import { addDeck, useProject } from "../data/project-store";
import type { StudioValues } from "./comp-layout";
import { generateVariations } from "./studio-actions";

/**
 * Matrix generator: turn a pasted bullet list (or a saved copy deck) into a
 * full set of variations across chosen images and formats, all queued for
 * export. Solves "we struggle with a large number of copies".
 */
export function VariationsModal(props: {
  base: StudioValues;
  onClose: () => void;
  onGenerated: () => void;
}): React.JSX.Element {
  const project = useProject();
  const [source, setSource] = React.useState<"paste" | string>("paste");
  const [pasted, setPasted] = React.useState("");
  const [applyTo, setApplyTo] = React.useState<"heading" | "subhead">("heading");
  const [assetIds, setAssetIds] = React.useState<string[]>([props.base.imageAssetId]);
  const [formatIds, setFormatIds] = React.useState<string[]>([props.base.formatId]);
  const [deckName, setDeckName] = React.useState("");

  const variants = React.useMemo(() => {
    if (source === "paste") {
      return pasted
        .split("\n")
        .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
        .filter(Boolean);
    }
    return project.decks.find((deck) => deck.id === source)?.variants ?? [];
  }, [source, pasted, project.decks]);

  const compCount = variants.length * Math.max(1, assetIds.length);
  const fileCount = compCount * Math.max(1, formatIds.length);

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const generate = (): void => {
    if (variants.length === 0) {
      toast.error("Add at least one line of copy.");
      return;
    }
    if (source === "paste" && deckName.trim()) {
      addDeck(deckName.trim(), variants);
    }
    const result = generateVariations({
      applyTo,
      assetIds,
      base: props.base,
      formatIds,
      variants,
    });
    toast.success(`${result.comps} variations → ${result.files} files queued`);
    props.onGenerated();
    props.onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[86vh] w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-[color:var(--popover)] shadow-2xl"
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
          {/* Copy source */}
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Copy
            </span>
            <div className="flex flex-wrap gap-1">
              <button
                className={`rounded-md px-2 py-1 text-xs-plus ${source === "paste" ? "bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]" : "text-muted-foreground"}`}
                onClick={() => setSource("paste")}
                type="button"
              >
                Paste a list
              </button>
              {project.decks.map((deck) => (
                <button
                  className={`rounded-md px-2 py-1 text-xs-plus ${source === deck.id ? "bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]" : "text-muted-foreground"}`}
                  key={deck.id}
                  onClick={() => setSource(deck.id)}
                  type="button"
                >
                  {deck.name} ({deck.variants.length})
                </button>
              ))}
            </div>
            {source === "paste" ? (
              <>
                <textarea
                  autoFocus
                  className="h-28 resize-none rounded-md border border-border bg-transparent px-2 py-1.5 text-xs-plus outline-none focus:border-accent"
                  onChange={(event) => setPasted(event.target.value)}
                  placeholder={"One line per row —\nSummer arrives quietly\nLinen for the long light\nCut for warm evenings"}
                  value={pasted}
                />
                <input
                  className="rounded-md border border-border bg-transparent px-2 py-1 text-xs-plus outline-none focus:border-accent"
                  onChange={(event) => setDeckName(event.target.value)}
                  placeholder="Save as deck (optional name)"
                  value={deckName}
                />
              </>
            ) : (
              <ul className="max-h-28 overflow-y-auto rounded-md border border-border p-2 text-xs-plus text-muted-foreground">
                {variants.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Apply to */}
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Fill
            </span>
            <div className="flex gap-1">
              {(["heading", "subhead"] as const).map((role) => (
                <button
                  className={`rounded-md px-2.5 py-1 text-xs-plus ${applyTo === role ? "bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]" : "text-muted-foreground"}`}
                  key={role}
                  onClick={() => setApplyTo(role)}
                  type="button"
                >
                  {role === "heading" ? "Heading" : "Subheading"}
                </button>
              ))}
            </div>
          </div>

          {/* Images */}
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Images ({assetIds.length})
            </span>
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

          {/* Formats */}
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Formats
            </span>
            <div className="flex flex-wrap gap-1">
              {PLATFORM_FORMATS.map((format) => (
                <button
                  className={`rounded-full border px-2 py-0.5 text-2xs transition-colors ${formatIds.includes(format.id) ? "border-accent bg-[color:color-mix(in_oklab,var(--accent)_16%,transparent)] text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  key={format.id}
                  onClick={() => setFormatIds((list) => toggle(list, format.id))}
                  type="button"
                >
                  {format.platformLabel} {format.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-2xs text-muted-foreground">
            {variants.length} copy × {Math.max(1, assetIds.length)} image
            {assetIds.length === 1 ? "" : "s"} × {Math.max(1, formatIds.length)} format
            {formatIds.length === 1 ? "" : "s"} ={" "}
            <span className="text-foreground">{fileCount} files</span>
          </span>
          <Button disabled={variants.length === 0} onClick={generate} size="sm" type="button">
            Generate &amp; queue
          </Button>
        </div>
      </div>
    </div>
  );
}
