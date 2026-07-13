import { defineToolcraft } from "@/toolcraft/runtime";

import { MRS_BRAND } from "./data/brand-kit";
import { PLATFORM_FORMATS } from "./data/formats";
import { STUDIO_DEFAULTS } from "./studio/comp-layout";

const textColorOptions = MRS_BRAND.colors
  .filter((color) => color.text)
  .map((color) => ({ label: color.label, value: color.id }));

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    size: { height: 1350, unit: "px", width: 1080 },
    // User decision (2026-07-03): output sizes are locked to the platform
    // format registry; the Format select owns canvas dimensions.
    sizing: { mode: "fixed-output" },
    upload: false,
  },
  export: {
    png: {
      background: "include",
    },
  },
  // The generic Export/Import Settings (raw runtime-state JSON) don't fit this
  // product — comps are saved as artboards and exported through the Queue.
  settingsTransfer: false,
  // Survive tab switches and reloads: the Studio is one of four surfaces, so
  // its runtime state must outlive the route unmount.
  persistence: {
    include: ["values", "canvas", "panels"],
    key: "toolcraft:mrs-studio:state:v1",
    storage: "localStorage",
    version: 1,
  },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            formatActive: {
              defaultValue: STUDIO_DEFAULTS.formatId,
              label: "Format",
              // Social formats only — the email sizes belong to the Email
              // surface and are noise here (user directive 2026-07-11).
              options: PLATFORM_FORMATS.filter(
                (format) => format.platform !== "email",
              ).map((format) => ({
                label: `${format.platformLabel} ${format.label}`,
                value: format.id,
              })),
              orderRole: "mode",
              performanceReason:
                "Switching format changes canvas dimensions and therefore comp re-layout and paint cost.",
              performanceRole: "workload",
              target: "format.active",
              type: "select",
            },
            // Background color and safe-zone guides are retired from the panel
            // (2026-07-13): the canvas background defaults to black (media is
            // full-bleed over it) and guides stay off. Both still round-trip via
            // StudioValues for older comps.
            templatePicker: {
              defaultValue: "",
              description:
                "Browse team-shared templates and apply one — it recalls the whole design (layout, image, and format) into a new artboard.",
              label: "Templates",
              orderRole: "detail",
              performanceReason:
                "Opening the template gallery only reads saved layouts; it doesn't touch the live preview until you apply one.",
              performanceRole: "responsiveness",
              target: "template.picker",
              type: "templatePicker",
            },
          },
          title: "Format",
        },
        {
          // The Include switch, Bleed/Framed style toggle, and collage photo
          // picker are retired (2026-07-11): media is always present and
          // renders full-bleed with the automatic legibility scrim.
          // CompRenderer normalizes stale values from older sessions.
          controls: {
            imageAsset: {
              defaultValue: STUDIO_DEFAULTS.imageAssetId,
              description:
                "Pick a photo or video from the Library — imports appear here instantly. Media fills the canvas behind the text; videos design over their poster frame and export as branded MP4s.",
              label: "Media",
              orderRole: "input",
              performanceReason:
                "Choosing a different library photo decodes and paints new image pixels into the comp.",
              performanceRole: "workload",
              target: "image.assetId",
              type: "libraryImage",
            },
            // One visual pad replaces the Position X/Y sliders: drag the
            // footage to choose what stays in frame (placement is stored
            // relative to the source, so it holds across every format and
            // batch export), zoom to re-crop, and scrub video to judge the
            // layout at any moment. It edits image.focalX/Y + image.posterTime
            // via dispatch; its own target is the zoom percent.
            mediaPosition: {
              defaultValue: Math.round(STUDIO_DEFAULTS.imageZoom * 100),
              description:
                "Drag to choose what stays in frame — the placement holds across every format. Zoom re-crops into the footage; the readout warns past source quality.",
              label: "Position",
              orderRole: "spatial",
              performanceReason:
                "Position drags re-solve one media crop without new decode; scrubbing seeks the preview video.",
              performanceRole: "responsiveness",
              target: "image.zoom",
              type: "mediaPosition",
            },
            overlayStyle: {
              defaultValue: STUDIO_DEFAULTS.overlayStyle,
              description:
                "Full-canvas finishing treatment. Shades darken toward an edge for legibility; Keyline draws an editorial frame; Grain adds film texture.",
              label: "Overlay",
              options: [
                { label: "None", value: "none" },
                { label: "Shade bottom", value: "shade-bottom" },
                { label: "Shade top", value: "shade-top" },
                { label: "Shade top + bottom", value: "shade-frame" },
                { label: "Shade left", value: "shade-left" },
                { label: "Shade right", value: "shade-right" },
                { label: "Vignette", value: "vignette" },
                { label: "Ink wash", value: "wash-ink" },
                { label: "Bone wash", value: "wash-bone" },
                { label: "Keyline frame", value: "keyline" },
                { label: "Film grain", value: "grain" },
              ],
              orderRole: "mode",
              performanceReason:
                "Overlay styles swap one SVG gradient/filter layer without re-measuring text or decoding media.",
              performanceRole: "responsiveness",
              target: "overlay.style",
              type: "select",
            },
            overlayStrength: {
              defaultValue: STUDIO_DEFAULTS.overlayStrength,
              label: "Overlay strength",
              max: 100,
              min: 10,
              orderRole: "strength",
              performanceReason:
                "Strength drags retune one overlay layer's opacity live without layout work.",
              performanceRole: "responsiveness",
              step: 5,
              target: "overlay.strength",
              type: "slider",
              unit: "%",
              visibleWhen: { notEquals: "none", target: "overlay.style" },
            },
          },
          title: "Media",
        },
        {
          controls: {
            elementsList: {
              defaultValue: STUDIO_DEFAULTS.elementsOrder,
              description:
                "Click an element to edit it right below — one focused menu at a time. Drag rows to reorder the stack.",
              label: false,
              orderRole: "input",
              performanceReason:
                "Adding, removing, or reordering elements re-lays out a handful of existing blocks.",
              performanceRole: "responsiveness",
              target: "elements.order",
              type: "elementList",
            },
          },
          title: "Elements",
        },
        {
          controls: {
            headingText: {
              defaultValue: STUDIO_DEFAULTS.headingText,
              description: "Press Enter for a hard line break.",
              label: "Headline",
              orderRole: "primary",
              performanceReason:
                "Headline length changes text layout and wrapping work on every keystroke.",
              performanceRole: "workload",
              target: "heading.text",
              type: "multilineText",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingStyle: {
              defaultValue: STUDIO_DEFAULTS.headingStyleId,
              label: "Style",
              options: MRS_BRAND.textStyles
                .filter((style) => style.role === "heading")
                .map((style) => ({ label: style.label, value: style.id })),
              orderRole: "mode",
              performanceReason:
                "Switching between the two approved heading styles restyles one text block.",
              performanceRole: "responsiveness",
              target: "heading.style",
              type: "select",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingSize: {
              defaultValue: STUDIO_DEFAULTS.headingSize,
              label: "Size",
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
              ],
              orderRole: "strength",
              performanceReason:
                "Size steps re-measure one text block on the modular scale.",
              performanceRole: "responsiveness",
              target: "heading.size",
              type: "segmented",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingColor: {
              defaultValue: STUDIO_DEFAULTS.headingColorId,
              label: "Color",
              options: textColorOptions,
              orderRole: "color",
              performanceReason:
                "Color swaps restyle one text block without changing layout.",
              performanceRole: "responsiveness",
              target: "heading.color",
              type: "select",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingFlourish: {
              defaultValue: STUDIO_DEFAULTS.headingFlourish,
              description:
                "Tap a word to flourish it in Romie italic. Pick a flourished word and set how its swash sits — swash, first, last, or plain italic.",
              label: "Flourish",
              orderRole: "detail",
              performanceReason:
                "Flourish restyles individual words of one heading without changing media or layout size.",
              performanceRole: "responsiveness",
              target: "heading.flourish",
              type: "flourish",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the headline in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "heading.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            saveHeadingCopy: {
              defaultValue: "",
              description:
                "Save this headline and its flourish to the Copy library for reuse in variations.",
              label: "Copy",
              orderRole: "action",
              performanceReason:
                "Saving a copy snippet writes a library record; it never touches the live preview.",
              performanceRole: "responsiveness",
              target: "copy.save.heading",
              type: "saveCopy",
              visibleWhen: { equals: true, target: "heading.include" },
            },
          },
          // Titled "Content" generically; the first field names the element
          // (Headline/Subheading/…) so the focused menu still reads clearly.
          // One focused element menu at a time: the Elements list publishes
          // ui.selectedElement when a row is clicked (no schema control).
          title: "Content",
          visibleWhen: { equals: "heading", target: "ui.selectedElement" },
        },
        {
          controls: {
            subheadText: {
              defaultValue: STUDIO_DEFAULTS.subheadText,
              description: "Tap · to drop the brand mid-dot separator.",
              label: "Subheading",
              orderRole: "primary",
              performanceReason:
                "Subheading length changes text layout work on every keystroke.",
              performanceRole: "workload",
              target: "subhead.text",
              type: "separatorText",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
            subheadSize: {
              defaultValue: STUDIO_DEFAULTS.subheadSize,
              label: "Size",
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
              ],
              orderRole: "strength",
              performanceReason:
                "Size steps re-measure one text block on the modular scale.",
              performanceRole: "responsiveness",
              target: "subhead.size",
              type: "segmented",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
            subheadColor: {
              defaultValue: STUDIO_DEFAULTS.subheadColorId,
              label: "Color",
              options: textColorOptions,
              orderRole: "color",
              performanceReason:
                "Color swaps restyle one text block without changing layout.",
              performanceRole: "responsiveness",
              target: "subhead.color",
              type: "select",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
            subheadSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the sub-head in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "subhead.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
            saveSubheadCopy: {
              defaultValue: "",
              description: "Save this sub-head to the Copy library for reuse in variations.",
              label: "Copy",
              orderRole: "action",
              performanceReason:
                "Saving a copy snippet writes a library record; it never touches the live preview.",
              performanceRole: "responsiveness",
              target: "copy.save.subhead",
              type: "saveCopy",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "subhead", target: "ui.selectedElement" },
        },
        {
          controls: {
            bodyText: {
              defaultValue: STUDIO_DEFAULTS.bodyText,
              description: "Press Enter for a hard line break.",
              label: "Body",
              orderRole: "primary",
              performanceReason:
                "Body copy length changes text layout work on every keystroke.",
              performanceRole: "workload",
              target: "body.text",
              type: "multilineText",
              visibleWhen: { equals: true, target: "body.include" },
            },
            bodySize: {
              defaultValue: STUDIO_DEFAULTS.bodySize,
              label: "Size",
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
              ],
              orderRole: "strength",
              performanceReason:
                "Size steps re-measure one text block on the modular scale.",
              performanceRole: "responsiveness",
              target: "body.size",
              type: "segmented",
              visibleWhen: { equals: true, target: "body.include" },
            },
            bodyColor: {
              defaultValue: STUDIO_DEFAULTS.bodyColorId,
              label: "Color",
              options: textColorOptions,
              orderRole: "color",
              performanceReason:
                "Color swaps restyle one text block without changing layout.",
              performanceRole: "responsiveness",
              target: "body.color",
              type: "select",
              visibleWhen: { equals: true, target: "body.include" },
            },
            bodySpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the body copy in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "body.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "body.include" },
            },
            saveBodyCopy: {
              defaultValue: "",
              description: "Save this body copy to the Copy library for reuse in variations.",
              label: "Copy",
              orderRole: "action",
              performanceReason:
                "Saving a copy snippet writes a library record; it never touches the live preview.",
              performanceRole: "responsiveness",
              target: "copy.save.body",
              type: "saveCopy",
              visibleWhen: { equals: true, target: "body.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "body", target: "ui.selectedElement" },
        },
        {
          controls: {
            logoVariant: {
              defaultValue: STUDIO_DEFAULTS.logoVariantId,
              description: "Approved logo set. Marks always render white on the comp.",
              label: "Logo",
              options: MRS_BRAND.logos.map((logo) => ({
                label: logo.label,
                value: logo.id,
              })),
              orderRole: "input",
              performanceReason:
                "Choosing a different logo swaps one small vector image in the comp.",
              performanceRole: "responsiveness",
              target: "logo.variant",
              type: "select",
              visibleWhen: { equals: true, target: "logo.include" },
            },
            logoSize: {
              defaultValue: STUDIO_DEFAULTS.logoSize,
              label: "Size",
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
              ],
              orderRole: "strength",
              performanceReason:
                "Logo size steps rescale one vector image without re-decoding.",
              performanceRole: "responsiveness",
              target: "logo.size",
              type: "segmented",
              visibleWhen: { equals: true, target: "logo.include" },
            },
            logoPlacement: {
              defaultValue: STUDIO_DEFAULTS.logoAnchor,
              description:
                "An override on the automatic placement. Auto drops the logo opposite the text; only positions clear of the copy are offered.",
              label: "Position",
              orderRole: "spatial",
              performanceReason:
                "Anchoring moves one vector image inside the safe content box.",
              performanceRole: "responsiveness",
              target: "logo.anchor",
              type: "logoPlacement",
              visibleWhen: { equals: true, target: "logo.include" },
            },
            logoSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the logo when it stacks in the flow.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "logo.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "logo.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "logo", target: "ui.selectedElement" },
        },
        {
          controls: {
            ctaText: {
              defaultValue: STUDIO_DEFAULTS.ctaText,
              label: "Button",
              orderRole: "primary",
              performanceReason:
                "Button label length re-measures one small box on every keystroke.",
              performanceRole: "workload",
              target: "cta.text",
              type: "text",
              visibleWhen: { equals: true, target: "cta.include" },
            },
            ctaStyle: {
              defaultValue: STUDIO_DEFAULTS.ctaStyle,
              label: "Style",
              options: [
                { label: "Outline", value: "outline" },
                { label: "Filled", value: "filled" },
                { label: "Underline", value: "underline" },
              ],
              orderRole: "mode",
              performanceReason:
                "Button style swaps the box treatment of one small element.",
              performanceRole: "responsiveness",
              target: "cta.style",
              type: "segmented",
              visibleWhen: { equals: true, target: "cta.include" },
            },
            ctaSize: {
              defaultValue: STUDIO_DEFAULTS.ctaSize,
              label: "Size",
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
              ],
              orderRole: "strength",
              performanceReason:
                "Button size steps rescale one small box on the modular scale.",
              performanceRole: "responsiveness",
              target: "cta.size",
              type: "segmented",
              visibleWhen: { equals: true, target: "cta.include" },
            },
            ctaColor: {
              defaultValue: STUDIO_DEFAULTS.ctaColorId,
              label: "Color",
              options: textColorOptions,
              orderRole: "color",
              performanceReason:
                "Color swaps restyle one small box without layout work.",
              performanceRole: "responsiveness",
              target: "cta.color",
              type: "select",
              visibleWhen: { equals: true, target: "cta.include" },
            },
            ctaSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the button in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "cta.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "cta.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "cta", target: "ui.selectedElement" },
        },
        {
          controls: {
            dividerWeight: {
              defaultValue: STUDIO_DEFAULTS.dividerWeight,
              label: "Weight",
              options: [
                { label: "Hairline", value: "hairline" },
                { label: "Regular", value: "regular" },
                { label: "Bold", value: "bold" },
              ],
              orderRole: "strength",
              performanceReason:
                "Divider weight changes one rule's thickness.",
              performanceRole: "responsiveness",
              target: "divider.weight",
              type: "segmented",
              visibleWhen: { equals: true, target: "divider.include" },
            },
            dividerLength: {
              defaultValue: STUDIO_DEFAULTS.dividerLength,
              label: "Length",
              options: [
                { label: "Full", value: "full" },
                { label: "Short", value: "short" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Divider length changes one rule's width.",
              performanceRole: "responsiveness",
              target: "divider.length",
              type: "segmented",
              visibleWhen: { equals: true, target: "divider.include" },
            },
            dividerColor: {
              defaultValue: STUDIO_DEFAULTS.dividerColorId,
              label: "Color",
              options: textColorOptions,
              orderRole: "color",
              performanceReason:
                "Color swaps restyle one rule without layout work.",
              performanceRole: "responsiveness",
              target: "divider.color",
              type: "select",
              visibleWhen: { equals: true, target: "divider.include" },
            },
            dividerSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the divider in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "divider.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "divider.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "divider", target: "ui.selectedElement" },
        },
        {
          // Simplified 2026-07-11: the Studio is full-bleed only. Pattern
          // (split/banded/edge/collage), collage columns, and content order are
          // retired from the panel; the renderer keeps them for saved comps.
          controls: {
            layoutPlacement: {
              defaultValue: STUDIO_DEFAULTS.layoutAnchorY,
              description:
                "Anchor the whole text block to a corner, edge, or the center. Also sets alignment to match — the Alignment control can override it.",
              label: "Placement",
              orderRole: "spatial",
              performanceReason:
                "Repositioning the text stack recomputes a few block offsets only.",
              performanceRole: "responsiveness",
              target: "layout.anchorY",
              type: "placement",
            },
            layoutAlign: {
              defaultValue: STUDIO_DEFAULTS.layoutAlign,
              description: "Text alignment for every element in the stack.",
              label: "Alignment",
              options: [
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Alignment moves existing text lines without re-measuring media.",
              performanceRole: "responsiveness",
              target: "layout.align",
              type: "segmented",
            },
            layoutDistribution: {
              defaultValue: STUDIO_DEFAULTS.layoutDistribution,
              description:
                "How the stacked elements share the vertical space. Stack keeps them together; Spread fills the zone evenly; Grouped fills it but keeps grouped elements tight.",
              label: "Distribution",
              orderRole: "spatial",
              performanceReason:
                "Distribution only re-spaces the placed blocks; no media work.",
              performanceRole: "responsiveness",
              target: "layout.distribution",
              type: "distribution",
            },
            typeLeading: {
              defaultValue: STUDIO_DEFAULTS.typeLeading,
              description:
                "Line spacing rhythm for every text block. Tight is the Swiss default look.",
              label: "Leading",
              options: [
                { label: "Tight", value: "tight" },
                { label: "Normal", value: "normal" },
                { label: "Airy", value: "airy" },
              ],
              orderRole: "detail",
              performanceReason:
                "Leading changes re-measure a handful of text blocks without media work.",
              performanceRole: "responsiveness",
              target: "type.leading",
              type: "segmented",
            },
            typeWidth: {
              defaultValue: STUDIO_DEFAULTS.typeWidthPct,
              description:
                "Max width of the text column — lower values wrap headlines and copy sooner.",
              label: "Text width",
              max: 100,
              min: 40,
              orderRole: "spatial",
              performanceReason:
                "Width drags re-measure text wrapping for a few blocks without media work.",
              performanceRole: "responsiveness",
              step: 5,
              target: "type.width",
              type: "slider",
              unit: "%",
            },
            layoutShuffle: {
              actions: [{ icon: "shuffle", label: "Shuffle", value: "shuffle-layout" }],
              description:
                "Re-rolls placement, heading style, logo corner, overlay, and an approved color pairing.",
              label: "Variation",
              orderRole: "action",
              target: "layout.shuffle",
              type: "actions",
            },
          },
          title: "Layout",
        },
        {
          // The former Queue surface lives here now — one panel that owns the
          // whole export flow: pick the platform sizes (grid), the encoding
          // quality (image or video, swapped by media.isVideo), where saves
          // land, then Export or Save. Export renders the on-screen view by
          // default (Formats falls back to the live canvas format) and both
          // downloads AND files it to the Library; several formats bundle into a
          // ZIP grouped by platform with a manifest. The two custom controls are
          // in this always-mounted section, so they may (but need not) use hooks.
          //
          // Titled "Export": body sections keep their authored title even when a
          // panelActions control is hoisted to the sticky footer (see
          // define-toolcraft getBodySectionTitleAfterActionSplit).
          controls: {
            exportFormats: {
              // Empty default = "the size on screen": the control falls back to
              // the live canvas format, so a zero-config Export outputs exactly
              // what's being viewed until the user taps other sizes.
              defaultValue: [],
              description:
                "Tap the platform sizes to render. One exports a single file; several bundle into a ZIP grouped by platform with a manifest.",
              label: "Formats",
              orderRole: "input",
              performanceReason:
                "Choosing export sizes only changes what the Export action renders, never the live preview.",
              performanceRole: "responsiveness",
              target: "export.formats",
              type: "exportFormats",
            },
            imageFormat: {
              defaultValue: "jpg",
              label: "Format",
              options: [
                { label: "JPG", value: "jpg" },
                { label: "PNG", value: "png" },
                { label: "WebP", value: "webp" },
              ],
              orderRole: "advanced",
              performanceReason:
                "Export format only affects the encoding of the export action, not the live preview.",
              performanceRole: "responsiveness",
              target: "export.image.format",
              type: "segmented",
              // Encoding controls swap with the media type.
              visibleWhen: { notEquals: true, target: "media.isVideo" },
            },
            imageResolution: {
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              orderRole: "advanced",
              performanceReason:
                "Export resolution only affects the offscreen export rasterization, not the live preview.",
              performanceRole: "responsiveness",
              target: "export.image.resolution",
              type: "select",
              visibleWhen: { notEquals: true, target: "media.isVideo" },
            },
            videoFormat: {
              defaultValue: "mp4",
              description:
                "MP4 is the social-ready default; the export falls back to WebM if this browser can't encode H.264.",
              label: "Format",
              options: [
                { label: "MP4", value: "mp4" },
                { label: "WebM", value: "webm" },
              ],
              orderRole: "advanced",
              performanceReason:
                "Video format only selects the recording container for the export action, not the live preview.",
              performanceRole: "responsiveness",
              target: "export.video.format",
              type: "select",
              // The render plays the clip through in real time — overlays are
              // drawn onto every frame and recorded.
              visibleWhen: { equals: true, target: "media.isVideo" },
            },
            videoAudio: {
              defaultValue: true,
              description:
                "Keep the clip's own sound in the export. Turn off for footage that gets music later.",
              label: "Audio",
              orderRole: "advanced",
              performanceReason:
                "Audio inclusion only toggles an export recording track, not the live preview.",
              performanceRole: "responsiveness",
              target: "export.video.audio",
              type: "switch",
              visibleWhen: { equals: true, target: "media.isVideo" },
            },
            exportDestination: {
              defaultValue: "Studio exports",
              description: "Board that Export and Save to Library file this artboard into.",
              label: "Save to",
              orderRole: "detail",
              performanceReason:
                "The destination board only affects where a saved export is filed, not the live preview.",
              performanceRole: "responsiveness",
              target: "export.destinationBoard",
              type: "exportDestination",
            },
            exportActions: {
              actions: [
                {
                  label: "Save template",
                  value: "save-template",
                  variant: "outline",
                },
                {
                  label: "Variations",
                  value: "generate-variations",
                  variant: "outline",
                },
                {
                  icon: "copy",
                  label: "Save to Library",
                  value: "save-to-library",
                  variant: "outline",
                },
                {
                  // One primary Export: stills export per the Image Export
                  // settings; a video background exports a branded MP4/WebM per
                  // the Video Export settings, across every selected format.
                  icon: "upload-simple",
                  label: "Export",
                  value: "export-comp",
                },
              ],
              target: "panel.actions",
              type: "panelActions",
            },
          },
          title: "Export",
        },
      ],
      title: "Studio",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
});
