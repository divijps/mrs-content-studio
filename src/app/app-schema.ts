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
            // Background color lives with Format (2026-07-11): the standalone
            // Background section (and its transparent-export Include switch)
            // is retired — exports always carry the background.
            backgroundColor: {
              defaultValue: { hex: STUDIO_DEFAULTS.backgroundHex },
              label: "Background",
              orderRole: "color",
              performanceReason:
                "Background color swaps one fill style without layout or media work.",
              performanceRole: "responsiveness",
              target: "appearance.background",
              type: "color",
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
                "Click an element to edit it right below — one focused menu at a time. Drag rows to reorder the stack.",
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
            headingText: {
              defaultValue: STUDIO_DEFAULTS.headingText,
              description: "Press Enter for a hard line break.",
              label: "Text",
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
                "Tap a word to stylize it in Romie italic. Tap again to remove.",
              label: "Flourish",
              orderRole: "detail",
              performanceReason:
                "Flourish restyles individual words of one heading without changing media or layout size.",
              performanceRole: "responsiveness",
              target: "heading.flourish",
              type: "flourish",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingFlourishStyle: {
              defaultValue: STUDIO_DEFAULTS.headingFlourishStyle,
              description:
                "Swash adds the calligraphic entry/terminal glyphs; Italic slants the word with no special characters.",
              label: "Flourish style",
              options: [
                { label: "Swash", value: "swash" },
                { label: "Italic", value: "italic" },
              ],
              orderRole: "detail",
              performanceReason:
                "Flourish style restyles the already-flourished words of one heading.",
              performanceRole: "responsiveness",
              target: "heading.flourishStyle",
              type: "segmented",
              visibleWhen: { equals: true, target: "heading.include" },
            },
          },
          title: "Headline",
          // One focused element menu at a time: the Elements list publishes
          // ui.selectedElement when a row is clicked (no schema control).
          visibleWhen: { equals: "heading", target: "ui.selectedElement" },
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
          visibleWhen: { equals: "subhead", target: "ui.selectedElement" },
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
            logoAnchor: {
              defaultValue: STUDIO_DEFAULTS.logoAnchor,
              label: "Position",
              options: [
                { label: "Top left", value: "top-left" },
                { label: "Top center", value: "top-center" },
                { label: "Top right", value: "top-right" },
                { label: "Center left", value: "center-left" },
                { label: "Center", value: "center" },
                { label: "Center right", value: "center-right" },
                { label: "Bottom left", value: "bottom-left" },
                { label: "Bottom center", value: "bottom-center" },
                { label: "Bottom right", value: "bottom-right" },
              ],
              orderRole: "spatial",
              performanceReason:
                "Anchoring moves one vector image inside the safe content box.",
              performanceRole: "responsiveness",
              target: "logo.anchor",
              type: "select",
              visibleWhen: { equals: true, target: "logo.include" },
            },
          },
          title: "Logo",
          visibleWhen: { equals: "logo", target: "ui.selectedElement" },
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
          },
          title: "Divider",
          visibleWhen: { equals: "divider", target: "ui.selectedElement" },
        },
        {
          // Simplified 2026-07-11: the Studio is full-bleed only. Pattern
          // (split/banded/edge/collage), collage columns, and content order are
          // retired from the panel; the renderer keeps them for saved comps.
          controls: {
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
            layoutScale: {
              defaultValue: STUDIO_DEFAULTS.contentScale,
              description:
                "Overall size of the whole graphic within the canvas — lower values leave a margin of background around it.",
              label: "Scale",
              max: 100,
              min: 50,
              orderRole: "spatial",
              performanceReason:
                "Scale wraps the composed graphic in a single transform; no media re-decode.",
              performanceRole: "responsiveness",
              step: 1,
              target: "layout.scale",
              type: "slider",
              unit: "%",
            },
            layoutShuffle: {
              actions: [{ icon: "shuffle", label: "Shuffle", value: "shuffle-layout" }],
              description:
                "Re-rolls text position, heading style, logo corner, overlay, and an approved color pairing.",
              label: "Variation",
              orderRole: "action",
              target: "layout.shuffle",
              type: "actions",
            },
          },
          title: "Layout",
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
            imageFocalX: {
              defaultValue: Math.round(STUDIO_DEFAULTS.imageFocalX * 100),
              description:
                "Where the crop centers horizontally — the same point is kept in frame across every format.",
              label: "Position X",
              max: 100,
              min: 0,
              orderRole: "spatial",
              performanceReason:
                "Position drags re-solve one image crop without new decode.",
              performanceRole: "responsiveness",
              step: 1,
              target: "image.focalX",
              type: "slider",
              unit: "%",
            },
            imageFocalY: {
              defaultValue: Math.round(STUDIO_DEFAULTS.imageFocalY * 100),
              description: "Where the crop centers vertically.",
              label: "Position Y",
              max: 100,
              min: 0,
              orderRole: "spatial",
              performanceReason:
                "Position drags re-solve one image crop without new decode.",
              performanceRole: "responsiveness",
              step: 1,
              target: "image.focalY",
              type: "slider",
              unit: "%",
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
          // Hidden when the background media is a video (Video Export shows).
          visibleWhen: { notEquals: true, target: "media.isVideo" },
        },
        {
          controls: {
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
            },
          },
          title: "Video Export",
          // The render plays the clip through in real time — overlays are drawn
          // onto every frame and recorded, so exports take about the clip's length.
          visibleWhen: { equals: true, target: "media.isVideo" },
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
                  icon: "copy",
                  label: "Save to Library",
                  value: "save-to-library",
                  variant: "outline",
                },
                {
                  // One primary Export: stills export per the Image Export
                  // settings; a video background exports a branded MP4/WebM per
                  // the Video Export settings. (The runtime merges every
                  // panelActions control into a single sticky footer, so the
                  // mode is expressed by the settings section swap above.)
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
