import * as React from "react";
import { createPortal } from "react-dom";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { Button, ControlFieldLabel } from "@/toolcraft/ui";
import { toast } from "sonner";

import { getFormat } from "../data/formats";
import {
  addTemplate,
  deleteTemplate,
  setActiveArtboard,
  upsertComp,
  useProject,
} from "../data/project-store";
import type { Template } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import { buildCompSvg } from "./comp-svg";
import { studioValuesToComp } from "./studio-actions";
import { useVideoPosterAssets } from "./video-poster";

/** Live thumbnail of a template's stored design. */
function TemplateThumb(props: { template: Template }): React.JSX.Element {
  const project = useProject();
  const values: StudioValues = {
    ...STUDIO_DEFAULTS,
    ...(props.template.values as Partial<StudioValues>),
  };
  const format = getFormat(values.formatId);
  const renderAssets = useVideoPosterAssets(
    project.assets,
    [values.imageAssetId, ...values.imageAssetIds],
    { [values.imageAssetId]: values.videoPosterTime },
  );
  const svg = React.useMemo(
    () => buildCompSvg({ assets: renderAssets, brand: project.brand, values }).svg,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), renderAssets, project.brand],
  );
  return (
    <div
      className="w-full overflow-hidden bg-background [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ aspectRatio: `${format.width} / ${format.height}` }}
    />
  );
}

/**
 * Full-screen template gallery — the "browse to choose" preview dialog, modeled
 * on the Library picker: name search + format filter chips + a live-thumbnail
 * grid. Picking a template recalls the WHOLE design (layout + image + format)
 * into a fresh, active artboard, so it never overwrites current work.
 */
function TemplateGalleryDialog(props: { onClose: () => void }): React.JSX.Element {
  const project = useProject();
  const [query, setQuery] = React.useState("");
  const [formatFilter, setFormatFilter] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const templates = project.templates;
  const formats = React.useMemo(() => {
    const ids = [...new Set(templates.map((template) => template.formatId))];
    return ids.map((id) => ({ id, label: `${getFormat(id).platformLabel} ${getFormat(id).label}` }));
  }, [templates]);

  const filtered = templates.filter((template) => {
    if (formatFilter && template.formatId !== formatFilter) {
      return false;
    }
    const term = query.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return (
      template.name.toLowerCase().includes(term) ||
      (template.createdBy ?? "").toLowerCase().includes(term)
    );
  });

  const apply = (template: Template): void => {
    const comp = studioValuesToComp({
      ...STUDIO_DEFAULTS,
      ...(template.values as Partial<StudioValues>),
    } as StudioValues);
    upsertComp(comp);
    setActiveArtboard(comp.id);
    toast.success(`Applied “${template.name}”`);
    props.onClose();
  };

  const remove = (template: Template, event: React.MouseEvent): void => {
    event.stopPropagation();
    if (!window.confirm(`Delete template “${template.name}”? This affects everyone.`)) {
      return;
    }
    deleteTemplate(template.id);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[86vh] w-[720px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-[color:var(--popover)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Templates</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={props.onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
          <input
            autoFocus
            className="h-9 rounded-lg bg-[color:var(--surface-inactive)] px-3 text-sm outline-none focus:bg-[color:var(--surface-active)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates…"
            value={query}
          />
          {formats.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              <button
                className={`rounded-full px-2.5 py-1 text-2xs uppercase tracking-[0.1em] transition-colors ${
                  formatFilter === null
                    ? "bg-[color:color-mix(in_oklab,var(--foreground)_14%,transparent)] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setFormatFilter(null)}
                type="button"
              >
                All
              </button>
              {formats.map((format) => (
                <button
                  className={`rounded-full px-2.5 py-1 text-2xs uppercase tracking-[0.1em] transition-colors ${
                    formatFilter === format.id
                      ? "bg-[color:color-mix(in_oklab,var(--foreground)_14%,transparent)] text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  key={format.id}
                  onClick={() => setFormatFilter(format.id)}
                  type="button"
                >
                  {format.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {templates.length === 0
                ? "No templates yet — save one from the panel footer."
                : "No templates match your search."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((template) => (
                <button
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-left transition-colors hover:border-[color:var(--accent)]"
                  key={template.id}
                  onClick={() => apply(template)}
                  type="button"
                >
                  <TemplateThumb template={template} />
                  <div className="flex flex-col gap-0.5 px-2.5 py-2">
                    <span className="truncate text-xs-plus font-medium">{template.name}</span>
                    <span className="truncate text-2xs text-muted-foreground">
                      {getFormat(template.formatId).platformLabel}
                      {template.createdBy ? ` · ${template.createdBy}` : ""}
                    </span>
                  </div>
                  <button
                    aria-label="Delete template"
                    className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded bg-black/65 text-xs text-white group-hover:flex hover:bg-[color:var(--destructive)]"
                    onClick={(event) => remove(template, event)}
                    title="Delete template"
                    type="button"
                  >
                    ✕
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Format-section control: a "Browse templates" button that opens the shared
 * template gallery. Always-mounted section, so local state is safe here.
 */
export const TemplatePickerControl: ToolcraftCustomControlRenderer = ({ name }) => {
  const [open, setOpen] = React.useState(false);
  const title = typeof name === "string" && name ? name : "Templates";
  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <button
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_25%,transparent)] text-sm text-foreground transition-colors hover:border-[color:var(--accent)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        Browse templates
      </button>
      {open ? <TemplateGalleryDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
};

/**
 * The name-input modal behind the footer "Save template" action. Captures the
 * current design as a team-shared template under a user-given name.
 */
export function TemplateSaveDialog(props: {
  base: StudioValues;
  onClose: () => void;
}): React.JSX.Element {
  const [nameValue, setNameValue] = React.useState("");

  const save = (): void => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      toast.error("Give the template a name.");
      return;
    }
    addTemplate(trimmed, { ...props.base }, props.base.formatId);
    toast.success(`Saved template “${trimmed}”`);
    props.onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={props.onClose}
    >
      <div
        className="flex w-[400px] max-w-full flex-col gap-4 rounded-xl border border-border bg-[color:var(--popover)] p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="text-sm font-medium">Save as template</span>
        <p className="text-2xs text-muted-foreground">
          Captures this artboard’s full layout, image, and format. Shared with the whole team.
        </p>
        <input
          autoFocus
          className="h-9 rounded-lg bg-[color:var(--surface-inactive)] px-3 text-sm outline-none focus:bg-[color:var(--surface-active)]"
          onChange={(event) => setNameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          placeholder="Template name"
          value={nameValue}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={props.onClose} size="sm" type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={save} size="sm" type="button">
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
