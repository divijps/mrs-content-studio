import * as React from "react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";
import { toast } from "sonner";

import { getFormat } from "../data/formats";
import {
  addEmailSection,
  createEmail,
  deleteEmail,
  removeEmailSection,
  renameEmail,
  reorderEmailSection,
  updateEmailSection,
  useProject,
} from "../data/project-store";
import type {
  Asset,
  BrandKit,
  Comp,
  EmailDraft,
  EmailSection,
  EmailSectionType,
} from "../data/types";
import { OVERLAY_STYLES, STUDIO_DEFAULTS, type StudioValues } from "../studio/comp-layout";
import { buildCompSvg } from "../studio/comp-svg";
import {
  EMAIL_ASPECTS,
  EMAIL_TEMPLATE_GROUPS,
  EMAIL_TEMPLATES,
  type ElementKey,
  makeSection,
  sectionElements,
  sectionRuntimeValues,
  snapCompToEmailSection,
} from "../studio/email-templates";
import {
  exportEmailSingleImage,
  exportEmailSlices,
  saveEmailSlicesToLibrary,
} from "../studio/email-export";

/** Filled control style shared by the inspector fields — mirrors the Library
 * lightbox sidebar so the email controls read the same way. */
const FIELD_CLASS =
  "h-auto w-full rounded-lg border-0 bg-[color:var(--surface-inactive)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]";
const MENU_MATCH_CLASS = "[&_[data-slot=select-item]]:!text-sm";

const SECTION_TYPE_LABELS: Record<EmailSectionType, string> = {
  header: "Header",
  hero: "Hero",
  editorial: "Editorial",
  split: "Split",
  "product-grid": "Product grid",
  text: "Text",
  quote: "Quote",
  footer: "Footer",
  banner: "Banner",
  list: "List",
  cta: "Button",
  comp: "Studio comp",
};

function overlayLabel(style: string): string {
  return style === "none" ? "None" : style.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function aspectLabel(formatId: string): string {
  return getFormat(formatId).label.replace(/^Hero /, "").replace(/^Editorial /, "");
}

/** Load the brand fonts once so the SVG previews render with real type. */
function useBrandFontsReady(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      document.fonts.load("400 24px Romie"),
      document.fonts.load("italic 400 24px Romie"),
      document.fonts.load("600 24px 'Rework Micro'"),
      document.fonts.load("400 24px 'Onsite Standard'"),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

/** Pixel-accurate section preview: the same SVG the export path rasterizes,
 * built at the email format's native size then CSS-scaled to fit. */
function ValuesPreview(props: {
  assets: readonly Asset[];
  brand: BrandKit;
  fontsReady: boolean;
  values: StudioValues;
  width: number;
}): React.JSX.Element {
  const format = getFormat(props.values.formatId);
  const scale = props.width / format.width;
  const valuesKey = JSON.stringify(props.values);
  const svg = React.useMemo(() => {
    if (!props.fontsReady) {
      return null;
    }
    return buildCompSvg({
      assets: props.assets,
      brand: props.brand,
      format,
      values: props.values,
    }).svg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, props.assets, props.brand, format.id, props.fontsReady]);
  return (
    <div
      className="relative overflow-hidden bg-[color:var(--surface-inactive)]"
      style={{ height: format.height * scale, width: props.width }}
    >
      {svg ? (
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{
            height: format.height,
            left: 0,
            position: "absolute",
            top: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: format.width,
          }}
        />
      ) : null}
    </div>
  );
}

/** Single-pick overlay for photos (library) or comps (Studio). */
function PickerOverlay(props: {
  assets: readonly Asset[];
  brand: BrandKit;
  comps: readonly Comp[];
  fontsReady: boolean;
  kind: "photo" | "comp";
  onClose: () => void;
  onPick: (id: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const photos = props.assets.filter(
    (asset) =>
      !needle ||
      asset.name.toLowerCase().includes(needle) ||
      asset.filename.toLowerCase().includes(needle) ||
      asset.tags.some((tag) => tag.includes(needle)),
  );
  const comps = props.comps.filter(
    (comp) => !needle || comp.name.toLowerCase().includes(needle),
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-[color:var(--popover)] ds-hairline"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Input
            autoFocus
            className="h-8 flex-1 text-xs-plus"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={props.kind === "photo" ? "Search photos…" : "Search comps…"}
            value={query}
          />
          <button
            className="px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={props.onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {props.kind === "photo" ? (
            photos.length === 0 ? (
              <p className="py-8 text-center text-2xs text-muted-foreground">No photos match.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {photos.map((asset) => (
                  <button
                    className="relative aspect-square overflow-hidden rounded-md border border-border transition-transform active:scale-95"
                    key={asset.id}
                    onClick={() => props.onPick(asset.id)}
                    title={asset.name}
                    type="button"
                  >
                    <img
                      alt={asset.name}
                      className="h-full w-full object-cover"
                      decoding="async"
                      loading="lazy"
                      src={asset.thumbUrl}
                    />
                  </button>
                ))}
              </div>
            )
          ) : comps.length === 0 ? (
            <p className="py-8 text-center text-2xs text-muted-foreground">
              No comps yet — build one in the Studio.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {comps.map((comp) => (
                <button
                  className="overflow-hidden rounded-md border border-border transition-transform active:scale-95"
                  key={comp.id}
                  onClick={() => props.onPick(comp.id)}
                  title={comp.name}
                  type="button"
                >
                  <ValuesPreview
                    assets={props.assets}
                    brand={props.brand}
                    fontsReady={props.fontsReady}
                    values={
                      {
                        ...STUDIO_DEFAULTS,
                        ...(comp.sourceValues as Partial<StudioValues> | undefined),
                      } as StudioValues
                    }
                    width={130}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Curated per-type editor for the selected section. */
function SectionInspector(props: {
  assets: readonly Asset[];
  brand: BrandKit;
  email: EmailDraft;
  onOpenPhoto: (onPick: (id: string) => void) => void;
  section: EmailSection;
}): React.JSX.Element {
  const { brand, email, section } = props;
  const values = section.values as Record<string, unknown>;
  const elements = sectionElements(section.type);

  const patch = (next: Record<string, unknown>): void => {
    updateEmailSection(email.id, section.id, { values: { ...values, ...next } });
  };
  const str = (key: string, fallback = ""): string =>
    typeof values[key] === "string" ? (values[key] as string) : fallback;
  const num = (key: string, fallback = 0): number =>
    typeof values[key] === "number" ? (values[key] as number) : fallback;
  const bool = (key: string): boolean => values[key] === true;
  const list = (key: string): string[] =>
    Array.isArray(values[key]) ? (values[key] as string[]) : [];
  const captions = (): { name: string; note: string }[] =>
    Array.isArray(values.collageCaptions)
      ? (values.collageCaptions as { name: string; note: string }[])
      : [];

  const textColors = brand.colors.filter((color) => color.text);
  const surfaceColors = brand.colors.filter((color) => color.surface);
  const currentImage = props.assets.find((asset) => asset.id === str("imageAssetId"));

  const SIZE_OPTIONS = [
    { label: "S", value: "s" },
    { label: "M", value: "m" },
    { label: "L", value: "l" },
  ];
  const ALIGN_OPTIONS = [
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" },
  ];

  const seg = (
    value: string,
    options: { label: string; value: string }[],
    onChange: (next: string) => void,
  ): React.JSX.Element => (
    <ToggleGroup
      className="w-full"
      onValueChange={(picked: string[]) => {
        const next = picked[picked.length - 1];
        if (next) onChange(next);
      }}
      value={[value]}
    >
      {options.map((option) => (
        <ToggleGroupItem className="flex-1" key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  const colorRow = (currentId: string, onChange: (id: string) => void): React.JSX.Element => (
    <div className="flex flex-wrap gap-2">
      {textColors.map((color) => (
        <button
          aria-label={color.label}
          className={`h-6 w-6 rounded-full border transition-transform ${currentId === color.id ? "scale-110 border-[color:var(--foreground)]" : "border-border"}`}
          key={color.id}
          onClick={() => onChange(color.id)}
          style={{ backgroundColor: color.hex }}
          title={color.label}
          type="button"
        />
      ))}
    </div>
  );

  const sizeAndAlign = (sizeKey: string, alignKey: string): React.JSX.Element => (
    <div className="flex gap-2">
      <div className="flex-1">{seg(str(sizeKey, "m"), SIZE_OPTIONS, (v) => patch({ [sizeKey]: v }))}</div>
      <div className="flex-[1.4]">
        {seg(str(alignKey, "left"), ALIGN_OPTIONS, (v) => patch({ [alignKey]: v }))}
      </div>
    </div>
  );

  const toggleRow = (
    labelText: string,
    on: boolean,
    onToggle: (next: boolean) => void,
  ): React.JSX.Element => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]">
        {labelText}
      </span>
      <Switch
        checked={on}
        name={labelText}
        onCheckedChange={(checked) => onToggle(Boolean(checked))}
      />
    </div>
  );

  // A titled element group with an optional include toggle in its header.
  const group = (
    key: string,
    title: string,
    includeKey: string | null,
    body: React.JSX.Element,
  ): React.JSX.Element => {
    const on = includeKey ? bool(includeKey) : true;
    return (
      <div
        className="flex flex-col gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] pt-5"
        key={key}
      >
        <div className="flex items-center justify-between">
          <span className="ds-label">{title}</span>
          {includeKey ? (
            <Switch
              checked={on}
              name={title}
              onCheckedChange={(checked) => patch({ [includeKey]: Boolean(checked) })}
            />
          ) : null}
        </div>
        {on ? body : null}
      </div>
    );
  };

  const textBlock = (
    textKey: string,
    colorKey: string,
    sizeKey: string,
    alignKey: string,
  ): React.JSX.Element => (
    <div className="flex flex-col gap-2">
      <input
        className={FIELD_CLASS}
        onChange={(event) => patch({ [textKey]: event.target.value })}
        value={str(textKey)}
      />
      {colorRow(str(colorKey, "ink"), (id) => patch({ [colorKey]: id }))}
      {sizeAndAlign(sizeKey, alignKey)}
    </div>
  );

  const renderElement = (element: ElementKey): React.JSX.Element => {
    switch (element) {
      case "logo":
        return group(
          "logo",
          "Logo",
          "logoInclude",
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {brand.logos.map((logo) => {
                const active = str("logoVariantId") === logo.id;
                return (
                  <button
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${active ? "ds-hairline bg-[color:var(--surface-active)] text-foreground" : "bg-[color:var(--surface-inactive)] text-muted-foreground hover:text-foreground"}`}
                    key={logo.id}
                    onClick={() => patch({ logoVariantId: logo.id })}
                    type="button"
                  >
                    {logo.label}
                  </button>
                );
              })}
            </div>
            {seg(str("logoSize", "m"), SIZE_OPTIONS, (v) => patch({ logoSize: v }))}
          </div>,
        );
      case "eyebrow":
        return group(
          "eyebrow",
          "Eyebrow",
          "eyebrowInclude",
          textBlock("eyebrowText", "eyebrowColorId", "eyebrowSize", "eyebrowAlign"),
        );
      case "heading":
        return group(
          "heading",
          "Headline",
          "headingInclude",
          textBlock("headingText", "headingColorId", "headingSize", "headingAlign"),
        );
      case "subhead":
        return group(
          "subhead",
          "Subheading",
          "subheadInclude",
          textBlock("subheadText", "subheadColorId", "subheadSize", "subheadAlign"),
        );
      case "body":
        return group(
          "body",
          "Body",
          "bodyInclude",
          <div className="flex flex-col gap-2">
            <textarea
              className={`${FIELD_CLASS} min-h-[80px] resize-y`}
              onChange={(event) => patch({ bodyText: event.target.value })}
              value={str("bodyText")}
            />
            {colorRow(str("bodyColorId", "ink"), (id) => patch({ bodyColorId: id }))}
            {sizeAndAlign("bodySize", "bodyAlign")}
          </div>,
        );
      case "cta":
        return group(
          "cta",
          "Button",
          "ctaInclude",
          <div className="flex flex-col gap-2">
            <input
              className={FIELD_CLASS}
              onChange={(event) => patch({ ctaText: event.target.value })}
              placeholder="Button label"
              value={str("ctaText")}
            />
            <input
              className={FIELD_CLASS}
              onChange={(event) => patch({ ctaHref: event.target.value })}
              placeholder="Link URL (https://…)"
              value={str("ctaHref")}
            />
            {seg(
              str("ctaStyle", "outline"),
              [
                { label: "Outline", value: "outline" },
                { label: "Filled", value: "filled" },
                { label: "Underline", value: "underline" },
              ],
              (v) => patch({ ctaStyle: v }),
            )}
            {toggleRow("Pill", bool("ctaPill"), (next) => patch({ ctaPill: next }))}
            {colorRow(str("ctaColorId", "ink"), (id) => patch({ ctaColorId: id }))}
            {sizeAndAlign("ctaSize", "ctaAlign")}
          </div>,
        );
      case "image":
        return group(
          "image",
          "Image",
          "imageInclude",
          <div className="flex flex-col gap-2">
            <button
              className="relative aspect-[3/2] w-full overflow-hidden rounded-lg border border-border transition-colors hover:border-[color:var(--surface-raised)]"
              onClick={() =>
                props.onOpenPhoto((id) => patch({ imageAssetId: id, imageInclude: true }))
              }
              type="button"
            >
              {currentImage ? (
                <img
                  alt={currentImage.name}
                  className="h-full w-full object-cover"
                  src={currentImage.thumbUrl}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  Choose a photo
                </span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45 py-1 text-center text-2xs text-white">
                {currentImage ? "Change photo" : "Pick from Library"}
              </span>
            </button>
            {toggleRow("Rounded corners", num("imageRadius") > 0, (next) =>
              patch({ imageRadius: next ? 16 : 0 }),
            )}
          </div>,
        );
      case "grid": {
        const ids = list("imageAssetIds");
        const caps = captions();
        const showCaps = bool("collageShowCaptions");
        const setCaption = (index: number, key: "name" | "note", value: string): void => {
          const next = ids.map((_, position) => caps[position] ?? { name: "", note: "" });
          next[index] = { ...next[index]!, [key]: value };
          patch({ collageCaptions: next });
        };
        return group(
          "grid",
          "Photos",
          null,
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {ids.map((id, index) => {
                const asset = props.assets.find((candidate) => candidate.id === id);
                return (
                  <div
                    className="relative aspect-square overflow-hidden rounded-md border border-border"
                    key={`${id}-${index}`}
                  >
                    {asset ? (
                      <img
                        alt={asset.name}
                        className="h-full w-full object-cover"
                        src={asset.thumbUrl}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-2xs text-muted-foreground">
                        —
                      </span>
                    )}
                    <button
                      aria-label="Remove"
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-2xs text-white"
                      onClick={() =>
                        patch({ imageAssetIds: ids.filter((_, position) => position !== index) })
                      }
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <button
                className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-lg text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => props.onOpenPhoto((id) => patch({ imageAssetIds: [...ids, id] }))}
                type="button"
              >
                +
              </button>
            </div>
            {seg(
              str("collageColumns", "3"),
              [
                { label: "2-up", value: "2" },
                { label: "3-up", value: "3" },
              ],
              (v) => patch({ collageColumns: v }),
            )}
            {toggleRow("Captions", showCaps, (next) => patch({ collageShowCaptions: next }))}
            {showCaps
              ? ids.map((id, index) => (
                  <div className="flex flex-col gap-1.5" key={`cap-${id}-${index}`}>
                    <input
                      className={FIELD_CLASS}
                      onChange={(event) => setCaption(index, "name", event.target.value)}
                      placeholder="Product name"
                      value={caps[index]?.name ?? ""}
                    />
                    <input
                      className={FIELD_CLASS}
                      onChange={(event) => setCaption(index, "note", event.target.value)}
                      placeholder="Detail"
                      value={caps[index]?.note ?? ""}
                    />
                  </div>
                ))
              : null}
          </div>,
        );
      }
      case "list": {
        const items = list("listItems");
        const setItem = (index: number, value: string): void => {
          const next = [...items];
          next[index] = value;
          patch({ listItems: next });
        };
        return group(
          "list",
          "List items",
          "listInclude",
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div className="flex gap-1.5" key={`item-${index}`}>
                <input
                  className={FIELD_CLASS}
                  onChange={(event) => setItem(index, event.target.value)}
                  value={item}
                />
                <button
                  aria-label="Remove"
                  className="shrink-0 px-2 text-sm text-muted-foreground transition-colors hover:text-[color:var(--destructive)]"
                  onClick={() =>
                    patch({ listItems: items.filter((_, position) => position !== index) })
                  }
                  type="button"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="self-start rounded-full bg-[color:var(--surface-inactive)] px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-[color:var(--surface-active)] hover:text-foreground"
              onClick={() => patch({ listItems: [...items, "New item"] })}
              type="button"
            >
              + Add item
            </button>
            {colorRow(str("listColorId", "ink"), (id) => patch({ listColorId: id }))}
            {sizeAndAlign("listSize", "listAlign")}
          </div>,
        );
      }
    }
  };

  const aspects = EMAIL_ASPECTS[section.type];
  const imageCapable = elements.includes("image");

  return (
    <div className="flex flex-col gap-5">
      {/* Section-level group */}
      <div className="flex flex-col gap-4">
        <span className="text-sm text-foreground">{SECTION_TYPE_LABELS[section.type]}</span>
        <div className="flex flex-col gap-2">
          <span className="ds-label">Background</span>
          <div className="flex gap-2">
            {surfaceColors.map((color) => {
              const active = str("backgroundHex") === color.hex;
              return (
                <button
                  aria-label={color.label}
                  className={`h-7 w-7 rounded-full border transition-transform ${active ? "scale-110 border-[color:var(--foreground)]" : "border-border"}`}
                  key={color.id}
                  onClick={() => patch({ backgroundHex: color.hex })}
                  style={{ backgroundColor: color.hex }}
                  title={color.label}
                  type="button"
                />
              );
            })}
          </div>
        </div>
        {aspects && aspects.length > 1 ? (
          <div className="flex flex-col gap-2">
            <span className="ds-label">Shape</span>
            {seg(
              str("formatId"),
              aspects.map((formatId) => ({ label: aspectLabel(formatId), value: formatId })),
              (v) => patch({ formatId: v }),
            )}
          </div>
        ) : null}
        {imageCapable ? (
          <div className="flex flex-col gap-2">
            <span className="ds-label">Overlay</span>
            <Select
              items={OVERLAY_STYLES.map((option) => ({ label: overlayLabel(option), value: option }))}
              onValueChange={(next) => patch({ overlayStyle: next })}
              value={str("overlayStyle", "none")}
            >
              <SelectTrigger className={`${FIELD_CLASS} justify-between`}>
                <SelectValue>{() => overlayLabel(str("overlayStyle", "none"))}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className={MENU_MATCH_CLASS}>
                <SelectGroup>
                  {OVERLAY_STYLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {overlayLabel(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {str("overlayStyle", "none") !== "none" ? (
              <input
                className="w-full accent-[color:var(--foreground)]"
                max={100}
                min={10}
                onChange={(event) => patch({ overlayStrength: Number(event.target.value) })}
                type="range"
                value={num("overlayStrength", 55)}
              />
            ) : null}
          </div>
        ) : null}
        {imageCapable ? (
          <div className="flex flex-col gap-2">
            <span className="ds-label">Text position</span>
            {seg(
              str("layoutTextPosition", "bottom"),
              [
                { label: "Top", value: "top" },
                { label: "Middle", value: "middle" },
                { label: "Bottom", value: "bottom" },
              ],
              (v) => patch({ layoutTextPosition: v }),
            )}
          </div>
        ) : null}
      </div>

      {elements.map((element) => renderElement(element))}

      <div className="flex flex-col gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] pt-5">
        <span className="ds-label">Alt text</span>
        <input
          className={FIELD_CLASS}
          onChange={(event) => updateEmailSection(email.id, section.id, { alt: event.target.value })}
          placeholder="Describe this block for accessibility"
          value={section.alt}
        />
      </div>
    </div>
  );
}

export function EmailScreen(): React.JSX.Element {
  const project = useProject();
  const fontsReady = useBrandFontsReady();
  const emails = project.emails;

  const [activeEmailId, setActiveEmailId] = React.useState<string | null>(emails[0]?.id ?? null);
  const activeEmail = emails.find((email) => email.id === activeEmailId) ?? emails[0] ?? null;

  const [selectedId, setSelectedId] = React.useState<string | null>(
    activeEmail?.sections[0]?.id ?? null,
  );
  const [busy, setBusy] = React.useState(false);
  const [picker, setPicker] = React.useState<{
    kind: "photo" | "comp";
    onPick: (id: string) => void;
  } | null>(null);

  // The center preview column scales to fit whatever width is left after the
  // rail + inspector, capped at the 600px email content width.
  const centerRef = React.useRef<HTMLElement>(null);
  const [centerWidth, setCenterWidth] = React.useState(600);
  React.useEffect(() => {
    const element = centerRef.current;
    if (!element) return;
    const update = (): void => setCenterWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const previewWidth = Math.max(160, Math.min(600, centerWidth - 48));

  // Keep the active email + selected section valid as data changes.
  React.useEffect(() => {
    if (activeEmail && activeEmail.id !== activeEmailId) {
      setActiveEmailId(activeEmail.id);
    }
  }, [activeEmail, activeEmailId]);

  const sections = activeEmail?.sections ?? [];
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  React.useEffect(() => {
    if (activeEmail && !sections.some((section) => section.id === selectedId)) {
      setSelectedId(sections[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmail?.id, sections.length, selectedId]);

  const openPhoto = (onPick: (id: string) => void): void =>
    setPicker({ kind: "photo", onPick });

  const handleAddTemplate = (templateId: string): void => {
    const template = EMAIL_TEMPLATES.find((entry) => entry.id === templateId);
    if (!template) return;
    let emailId = activeEmail?.id;
    if (!emailId) {
      const created = createEmail("Untitled email");
      emailId = created.id;
      setActiveEmailId(created.id);
    }
    const section = makeSection(template);
    addEmailSection(emailId, section);
    setSelectedId(section.id);
  };

  const handleAddFromStudio = (): void => {
    setPicker({
      kind: "comp",
      onPick: (compId) => {
        const comp = project.comps.find((candidate) => candidate.id === compId);
        setPicker(null);
        if (!comp) return;
        let emailId = activeEmail?.id;
        if (!emailId) {
          const created = createEmail("Untitled email");
          emailId = created.id;
          setActiveEmailId(created.id);
        }
        const section = snapCompToEmailSection(comp);
        addEmailSection(emailId, section);
        setSelectedId(section.id);
      },
    });
  };

  const handleNewEmail = (): void => {
    const created = createEmail("Untitled email");
    setActiveEmailId(created.id);
    setSelectedId(null);
  };

  const handleDeleteEmail = (): void => {
    if (!activeEmail) return;
    deleteEmail(activeEmail.id);
  };

  const runExport = async (kind: "slices" | "single" | "library"): Promise<void> => {
    if (!activeEmail) return;
    if (activeEmail.sections.length === 0) {
      toast.message("Add a section first.");
      return;
    }
    const labels = {
      library: "Save to Library",
      single: "Stitch single image",
      slices: "Export slices",
    } as const;
    const toastId = toast.loading(`${labels[kind]}…`);
    setBusy(true);
    try {
      if (kind === "slices") {
        const count = await exportEmailSlices(activeEmail, project.assets, project.brand);
        toast.success(`${count} slice${count === 1 ? "" : "s"} exported`, { id: toastId });
      } else if (kind === "single") {
        await exportEmailSingleImage(activeEmail, project.assets, project.brand);
        toast.success("Stitched image downloaded", { id: toastId });
      } else {
        const count = await saveEmailSlicesToLibrary(activeEmail, project.assets, project.brand);
        toast.success(`${count} slice${count === 1 ? "" : "s"} saved to Library`, { id: toastId });
      }
    } catch (error) {
      toast.error(`${labels[kind]} failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="w-full" size="sm" variant="outline">
            + Add section
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-56">
        {EMAIL_TEMPLATE_GROUPS.map((group) => (
          <DropdownMenuGroup key={group}>
            <DropdownMenuLabel>{group}</DropdownMenuLabel>
            {EMAIL_TEMPLATES.filter((template) => template.group === group).map((template) => (
              <DropdownMenuItem key={template.id} onClick={() => handleAddTemplate(template.id)}>
                {template.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Reuse</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleAddFromStudio}>From Studio…</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Surface actions */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-xs-plus text-foreground">Email</span>
        <span className="text-2xs text-[color:var(--text-muted)]">
          {sections.length} section{sections.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button disabled={busy} onClick={() => void runExport("slices")} size="sm" variant="outline">
            Export slices
          </Button>
          <Button
            disabled={busy}
            onClick={() => void runExport("single")}
            size="sm"
            variant="ghost"
          >
            Single image
          </Button>
          <Button
            disabled={busy}
            onClick={() => void runExport("library")}
            size="sm"
            variant="ghost"
          >
            Save to Library
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left rail: email + section stack */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] md:flex">
          <div className="flex items-center gap-1.5 border-b border-border p-2">
            <Input
              className="h-8 flex-1 text-xs-plus"
              disabled={!activeEmail}
              onChange={(event) => activeEmail && renameEmail(activeEmail.id, event.target.value)}
              placeholder="Email name"
              value={activeEmail?.name ?? ""}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button aria-label="Email options" size="sm" variant="ghost">
                    ⋯
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                {emails.length > 0 ? (
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Emails</DropdownMenuLabel>
                    {emails.map((email) => (
                      <DropdownMenuItem key={email.id} onClick={() => setActiveEmailId(email.id)}>
                        {email.id === activeEmail?.id ? "✓ " : ""}
                        {email.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={handleNewEmail}>New email</DropdownMenuItem>
                  {activeEmail ? (
                    <DropdownMenuItem onClick={handleDeleteEmail}>Delete this email</DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sections.length === 0 ? (
              <p className="px-1 py-6 text-center text-2xs text-muted-foreground">
                No sections yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sections.map((section, index) => {
                  const active = section.id === selectedId;
                  return (
                    <div
                      className={`overflow-hidden rounded-lg border transition-colors ${active ? "border-[color:var(--surface-raised)] ds-hairline" : "border-border"}`}
                      key={section.id}
                    >
                      <button
                        className="block w-full"
                        onClick={() => setSelectedId(section.id)}
                        type="button"
                      >
                        <ValuesPreview
                          assets={project.assets}
                          brand={project.brand}
                          fontsReady={fontsReady}
                          values={sectionRuntimeValues(section)}
                          width={224}
                        />
                      </button>
                      <div className="flex items-center gap-1 px-2 py-1">
                        <span className="flex-1 truncate text-2xs text-muted-foreground">
                          {SECTION_TYPE_LABELS[section.type]}
                        </span>
                        <button
                          aria-label="Move up"
                          className="px-1 text-2xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                          disabled={index === 0}
                          onClick={() => reorderEmailSection(activeEmail!.id, section.id, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label="Move down"
                          className="px-1 text-2xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                          disabled={index === sections.length - 1}
                          onClick={() => reorderEmailSection(activeEmail!.id, section.id, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                        <button
                          aria-label="Remove section"
                          className="px-1 text-2xs text-muted-foreground transition-colors hover:text-[color:var(--destructive)]"
                          onClick={() => removeEmailSection(activeEmail!.id, section.id)}
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t border-border p-2">{addMenu}</div>
        </aside>

        {/* Center: stacked email preview */}
        <main
          className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--background)] p-6"
          ref={centerRef}
        >
          {!activeEmail ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-xs-plus text-muted-foreground">No email yet.</p>
              <Button onClick={handleNewEmail} size="sm" variant="outline">
                New email
              </Button>
            </div>
          ) : sections.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs-plus text-muted-foreground">
                Add a section to start assembling this email.
              </p>
              <p className="text-2xs text-[color:var(--text-muted)]">
                Use “+ Add section” in the left rail.
              </p>
            </div>
          ) : (
            <div
              className="mx-auto overflow-hidden rounded-[var(--radius-panel)] shadow-2xl"
              style={{ width: previewWidth }}
            >
              {sections.map((section) => {
                const active = section.id === selectedId;
                return (
                  <button
                    className="relative block w-full"
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    type="button"
                  >
                    <ValuesPreview
                      assets={project.assets}
                      brand={project.brand}
                      fontsReady={fontsReady}
                      values={sectionRuntimeValues(section)}
                      width={previewWidth}
                    />
                    {active ? (
                      <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[color:var(--accent)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </main>

        {/* Right: inspector */}
        <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-border bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] p-3 md:flex">
          {selected && activeEmail ? (
            <SectionInspector
              assets={project.assets}
              brand={project.brand}
              email={activeEmail}
              onOpenPhoto={openPhoto}
              section={selected}
            />
          ) : (
            <p className="px-1 py-6 text-center text-2xs text-muted-foreground">
              Select a section to edit it.
            </p>
          )}
        </aside>
      </div>

      {picker ? (
        <PickerOverlay
          assets={project.assets}
          brand={project.brand}
          comps={project.comps}
          fontsReady={fontsReady}
          kind={picker.kind}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            picker.onPick(id);
            if (picker.kind === "photo") {
              setPicker(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
