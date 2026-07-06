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
              options: PLATFORM_FORMATS.map((format) => ({
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
            formatGuides: {
              defaultValue: STUDIO_DEFAULTS.guides,
              description:
                "Shades the platform UI areas that exports must keep clear. Shown in preview only, never exported.",
              label: "Guides",
              orderRole: "detail",
              performanceReason:
                "Toggling the safe-zone shading only adds or removes a static preview overlay.",
              performanceRole: "responsiveness",
              target: "format.guides",
              type: "switch",
            },
          },
          title: "Format",
        },
        {
          controls: {
            elementsList: {
              defaultValue: STUDIO_DEFAULTS.elementsOrder,
              description:
                "Add components to the comp — their controls appear below when added. Drag rows to reorder the stack.",
              label: false,
              orderRole: "input",
              performanceReason:
                "Adding, removing, or reordering elements re-lays out a handful of existing blocks.",
              performanceRole: "responsiveness",
              target: "elements.order",
              type: "elementList",
            },
            elementsSpacing: {
              defaultValue: STUDIO_DEFAULTS.elementsSpacing,
              description:
                "Breathing room between stacked elements and around the image.",
              label: "Spacing",
              max: 240,
              min: 40,
              orderRole: "spatial",
              performanceReason:
                "Spacing drags re-offset a handful of existing blocks live without media work.",
              performanceRole: "responsiveness",
              step: 5,
              target: "elements.spacing",
              type: "slider",
              unit: "%",
            },
          },
          title: "Elements",
        },
        {
          controls: {
            layoutPattern: {
              defaultValue: STUDIO_DEFAULTS.layoutPattern,
              description:
                "Applies to the Framed image style; Bleed owns the full canvas. Collage lays several photos in rows and columns.",
              label: "Pattern",
              options: [
                { label: "Poster", value: "poster" },
                { label: "Split", value: "split" },
                { label: "Banded", value: "banded" },
                { label: "Edge", value: "edge" },
                { label: "Collage", value: "collage" },
              ],
              orderRole: "mode",
              performanceReason:
                "Pattern changes swap the DOM arrangement of a handful of blocks without new media decode.",
              performanceRole: "responsiveness",
              target: "layout.pattern",
              type: "select",
            },
            layoutCollageColumns: {
              defaultValue: STUDIO_DEFAULTS.collageColumns,
              description: "Auto solves the grid from the photo count.",
              label: "Columns",
              options: [
                { label: "Auto", value: "auto" },
                { label: "1", value: "1" },
                { label: "2", value: "2" },
                { label: "3", value: "3" },
              ],
              orderRole: "mode",
              performanceReason:
                "Column changes re-crop the same decoded photos into new grid cells.",
              performanceRole: "responsiveness",
              target: "layout.collageColumns",
              type: "segmented",
              visibleWhen: { equals: "collage", target: "layout.pattern" },
            },
            layoutOrder: {
              defaultValue: STUDIO_DEFAULTS.layoutOrder,
              label: "Order",
              options: [
                { label: "Image leads", value: "image" },
                { label: "Text leads", value: "text" },
              ],
              orderRole: "mode",
              performanceReason:
                "Reordering swaps the stacking of existing blocks without new media decode.",
              performanceRole: "responsiveness",
              target: "layout.order",
              type: "select",
              visibleWhen: { equals: "framed", target: "image.style" },
            },
            layoutTextPosition: {
              defaultValue: STUDIO_DEFAULTS.layoutTextPosition,
              description:
                "Where the text block sits in its zone. Auto follows the pattern's classic placement.",
              label: "Text position",
              options: [
                { label: "Auto", value: "auto" },
                { label: "Top", value: "top" },
                { label: "Middle", value: "middle" },
                { label: "Bottom", value: "bottom" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Repositioning the text stack recomputes a few block offsets only.",
              performanceRole: "responsiveness",
              target: "layout.textPosition",
              type: "segmented",
            },
            layoutShuffle: {
              actions: [{ icon: "shuffle", label: "Shuffle", value: "shuffle-layout" }],
              description:
                "Re-rolls pattern, text position, heading style, logo corner, and an approved color pairing.",
              label: "Variation",
              orderRole: "action",
              target: "layout.shuffle",
              type: "actions",
            },
          },
          title: "Layout",
        },
        {
          controls: {
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
          },
          title: "Typography",
        },
        {
          controls: {
            imageInclude: {
              defaultValue: STUDIO_DEFAULTS.imageInclude,
              label: "Include",
              orderRole: "input",
              performanceReason:
                "Toggling the image slot adds or removes one already-decoded library image from the comp.",
              performanceRole: "responsiveness",
              target: "image.include",
              type: "switch",
            },
            imageStyle: {
              defaultValue: "bleed",
              description:
                "Bleed is the house style: the photo fills the canvas behind the text with an automatic legibility scrim (text renders Bone). Framed keeps the photo inside the layout pattern.",
              label: "Style",
              options: [
                { label: "Bleed", value: "bleed" },
                { label: "Framed", value: "framed" },
              ],
              orderRole: "mode",
              performanceReason:
                "Style repositions the same decoded image (cover vs framed) and toggles one gradient scrim layer.",
              performanceRole: "responsiveness",
              target: "image.style",
              type: "segmented",
              visibleWhen: { equals: true, target: "image.include" },
            },
            imageAsset: {
              defaultValue: STUDIO_DEFAULTS.imageAssetId,
              description: "Pick from the Library — imports appear here instantly.",
              label: "Photo",
              orderRole: "input",
              performanceReason:
                "Choosing a different library photo decodes and paints new image pixels into the comp.",
              performanceRole: "workload",
              target: "image.assetId",
              type: "libraryImage",
              visibleWhen: { notEquals: "collage", target: "layout.pattern" },
            },
            imageAssets: {
              defaultValue: STUDIO_DEFAULTS.imageAssetIds,
              description:
                "Photos for the collage grid — selection order is cell order.",
              label: "Photos",
              orderRole: "input",
              performanceReason:
                "Each added collage photo decodes and paints one more library image into the comp.",
              performanceRole: "workload",
              target: "image.assetIds",
              type: "libraryImages",
              visibleWhen: { equals: "collage", target: "layout.pattern" },
            },
          },
          title: "Image",
        },
        {
          controls: {
            overlayStyle: {
              defaultValue: STUDIO_DEFAULTS.overlayStyle,
              description:
                "Full-canvas finishing treatment. Shades darken toward an edge for legibility; Keyline draws an editorial frame; Grain adds film texture.",
              label: "Style",
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
              label: "Strength",
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
          title: "Overlay",
        },
        {
          controls: {
            headingText: {
              defaultValue: STUDIO_DEFAULTS.headingText,
              description: "Press Enter for a hard line break.",
              label: "Text",
              orderRole: "primary",
              performanceReason:
                "Heading length changes text layout and wrapping work on every keystroke.",
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
            headingAlign: {
              defaultValue: STUDIO_DEFAULTS.headingAlign,
              label: "Align",
              options: [
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Alignment moves existing text lines without re-measuring media.",
              performanceRole: "responsiveness",
              target: "heading.align",
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
                "Tap a word to set it in Romie italic with swashes. Tap again to remove.",
              label: "Flourish",
              orderRole: "detail",
              performanceReason:
                "Flourish restyles individual words of one heading without changing media or layout size.",
              performanceRole: "responsiveness",
              target: "heading.flourish",
              type: "flourish",
              visibleWhen: { equals: true, target: "heading.include" },
            },
          },
          title: "Heading",
        },
        {
          controls: {
            subheadText: {
              defaultValue: STUDIO_DEFAULTS.subheadText,
              description: "Tap · to drop the brand mid-dot separator.",
              label: "Text",
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
            subheadAlign: {
              defaultValue: STUDIO_DEFAULTS.subheadAlign,
              label: "Align",
              options: [
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Alignment moves existing text lines without re-measuring media.",
              performanceRole: "responsiveness",
              target: "subhead.align",
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
          },
          title: "Subheading",
        },
        {
          controls: {
            bodyText: {
              defaultValue: STUDIO_DEFAULTS.bodyText,
              description: "Press Enter for a hard line break.",
              label: "Text",
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
            bodyAlign: {
              defaultValue: STUDIO_DEFAULTS.bodyAlign,
              label: "Align",
              options: [
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Alignment moves existing text lines without re-measuring media.",
              performanceRole: "responsiveness",
              target: "body.align",
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
          },
          title: "Body",
        },
        {
          controls: {
            logoVariant: {
              defaultValue: STUDIO_DEFAULTS.logoVariantId,
              description: "Approved logo set. Marks always render white on the comp.",
              items: MRS_BRAND.logos.map((logo) => ({
                alt: logo.label,
                src: logo.url,
                value: logo.id,
              })),
              label: "Mark",
              orderRole: "input",
              performanceReason:
                "Choosing a different logo swaps one small vector image in the comp.",
              performanceRole: "responsiveness",
              target: "logo.variant",
              type: "imagePicker",
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
            logoAnchor: {
              defaultValue: STUDIO_DEFAULTS.logoAnchor,
              label: "Position",
              orderRole: "spatial",
              performanceReason:
                "Anchoring moves one vector image inside the safe content box.",
              performanceRole: "responsiveness",
              target: "logo.anchor",
              type: "anchorGrid",
              visibleWhen: { equals: true, target: "logo.include" },
            },
          },
          title: "Logo",
        },
        {
          controls: {
            ctaText: {
              defaultValue: STUDIO_DEFAULTS.ctaText,
              label: "Text",
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
            ctaAlign: {
              defaultValue: STUDIO_DEFAULTS.ctaAlign,
              label: "Align",
              options: [
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Alignment moves one existing box without re-measuring.",
              performanceRole: "responsiveness",
              target: "cta.align",
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
          },
          title: "Button",
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
          },
          title: "Divider",
        },
        {
          controls: {
            backgroundInclude: {
              defaultValue: true,
              label: "Include",
              orderRole: "color",
              performanceReason:
                "Toggling background inclusion only flips the comp surface fill in preview and export alpha.",
              performanceRole: "responsiveness",
              target: "export.includeBackground",
              type: "switch",
            },
            backgroundColor: {
              defaultValue: { hex: STUDIO_DEFAULTS.backgroundHex },
              label: false,
              orderRole: "color",
              performanceReason:
                "Background color swaps one fill style without layout or media work.",
              performanceRole: "responsiveness",
              target: "appearance.background",
              type: "color",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["backgroundInclude", "backgroundColor"],
              layout: "inline",
            },
          ],
          title: "Background",
        },
        {
          controls: {
            imageFormat: {
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              orderRole: "advanced",
              performanceReason:
                "Export format only affects the encoding of the export action, not the live preview.",
              performanceRole: "responsiveness",
              target: "export.image.format",
              type: "select",
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
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["imageFormat", "imageResolution"],
              layout: "inline",
            },
          ],
          title: "Image Export",
        },
        {
          controls: {
            exportActions: {
              actions: [
                {
                  label: "Variations",
                  value: "generate-variations",
                  variant: "outline",
                },
                {
                  label: "Add to Queue",
                  value: "add-to-queue",
                  variant: "outline",
                },
                {
                  icon: "upload-simple",
                  label: "Export PNG",
                  value: "export-png",
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
