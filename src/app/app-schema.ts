import {
  defineToolcraft,
  type ToolcraftControlSchema,
  type ToolcraftControlSectionSchema,
} from "@/toolcraft/runtime";

import { MRS_BRAND } from "./data/brand-kit";
import { PLATFORM_FORMATS } from "./data/formats";
import {
  EXTRA_SLOT_KEYS,
  STUDIO_DEFAULTS,
  slotKind,
  slotLabel,
  type FlowKind,
} from "./studio/comp-layout";

const textColorOptions = MRS_BRAND.colors
  .filter((color) => color.text)
  .map((color) => ({ label: color.label, value: color.id }));

/**
 * Content section for one EXTRA element instance ("Headline 2", "Divider 3").
 * Mechanically mirrors the base element's section with every control target
 * prefixed by the slot id ("heading2.text"), gated on `${slot}.include`, and
 * shown when the slot is the focused element. Generated — the base sections
 * stay literal so old comps' behavior is untouched.
 */
function extraElementSection(slot: string): ToolcraftControlSectionSchema {
  const kind = slotKind(slot) as FlowKind;
  const label = slotLabel(slot);
  const lower = label.toLowerCase();
  const on = { equals: true, target: `${slot}.include` } as const;
  const controls: Record<string, ToolcraftControlSchema> = {
    elementNav: {
      label: false,
      target: "ui.selectedElement",
      type: "elementContentNav",
    },
  };
  const spacingControl: ToolcraftControlSchema = {
    defaultValue: { bottom: 0, top: 0 },
    description: `Add space above or below the ${lower} in the stack.`,
    label: "Spacing",
    orderRole: "detail",
    performanceReason:
      "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
    performanceRole: "responsiveness",
    target: `${slot}.space`,
    type: "elementSpacing",
    visibleWhen: on,
  };
  const sizeSlider = (min: number, max: number, defaultValue: number): ToolcraftControlSchema => ({
    defaultValue,
    label: "Size",
    max,
    min,
    orderRole: "strength",
    performanceReason: "Size percent rescales one block on the modular scale.",
    performanceRole: "responsiveness",
    step: 5,
    target: `${slot}.size`,
    type: "slider",
    unit: "%",
    visibleWhen: on,
  });
  const widthSlider: ToolcraftControlSchema = {
    defaultValue: 100,
    description: `Max width of just this ${lower}'s column — lower wraps it sooner.`,
    label: "Text width",
    max: 100,
    min: 40,
    orderRole: "spatial",
    performanceReason:
      "Width drags re-measure one text block's wrapping without media work.",
    performanceRole: "responsiveness",
    step: 5,
    target: `${slot}.width`,
    type: "slider",
    unit: "%",
    visibleWhen: on,
  };
  const leadingControl: ToolcraftControlSchema = {
    defaultValue: "normal",
    description: `Line spacing for just this ${lower}.`,
    label: "Leading",
    options: [
      { label: "Tight", value: "tight" },
      { label: "Normal", value: "normal" },
      { label: "Airy", value: "airy" },
    ],
    orderRole: "detail",
    performanceReason: "Leading re-measures one text block without media work.",
    performanceRole: "responsiveness",
    target: `${slot}.leading`,
    type: "segmented",
    visibleWhen: on,
  };
  switch (kind) {
    case "heading":
      controls[`${slot}Text`] = {
        defaultValue: STUDIO_DEFAULTS.headingText,
        description: "Press Enter for a hard line break.",
        label: "Text",
        orderRole: "primary",
        performanceReason:
          "Headline length changes text layout and wrapping work on every keystroke.",
        performanceRole: "workload",
        target: `${slot}.text`,
        type: "multilineText",
        visibleWhen: on,
      };
      controls[`${slot}Style`] = {
        defaultValue: STUDIO_DEFAULTS.headingStyleId,
        label: "Style",
        options: MRS_BRAND.textStyles
          .filter((style) => style.role === "heading")
          .map((style) => ({ label: style.label, value: style.id })),
        orderRole: "mode",
        performanceReason:
          "Switching between the two approved heading styles restyles one text block.",
        performanceRole: "responsiveness",
        target: `${slot}.style`,
        type: "select",
        visibleWhen: on,
      };
      controls[`${slot}Size`] = sizeSlider(40, 220, STUDIO_DEFAULTS.headingSize);
      controls[`${slot}Width`] = widthSlider;
      controls[`${slot}Leading`] = leadingControl;
      controls[`${slot}Flourish`] = {
        defaultValue: [],
        description:
          "Tap a word to flourish it in Romie italic. Pick a flourished word and set how its swash sits.",
        label: "Flourish",
        orderRole: "detail",
        performanceReason:
          "Flourish restyles individual words of one heading without changing media or layout size.",
        performanceRole: "responsiveness",
        target: `${slot}.flourish`,
        type: "flourish",
        visibleWhen: on,
      };
      break;
    case "subhead":
      controls[`${slot}Text`] = {
        defaultValue: STUDIO_DEFAULTS.subheadText,
        description: "Tap · to drop the brand mid-dot separator.",
        label: "Text",
        orderRole: "primary",
        performanceReason:
          "Subheading length changes text layout work on every keystroke.",
        performanceRole: "workload",
        target: `${slot}.text`,
        type: "separatorText",
        visibleWhen: on,
      };
      controls[`${slot}Size`] = sizeSlider(50, 200, STUDIO_DEFAULTS.subheadSize);
      controls[`${slot}Width`] = widthSlider;
      controls[`${slot}Leading`] = leadingControl;
      break;
    case "body":
      controls[`${slot}Text`] = {
        defaultValue: STUDIO_DEFAULTS.bodyText,
        description: "Press Enter for a hard line break.",
        label: "Text",
        orderRole: "primary",
        performanceReason: "Body copy length changes text layout work on every keystroke.",
        performanceRole: "workload",
        target: `${slot}.text`,
        type: "multilineText",
        visibleWhen: on,
      };
      controls[`${slot}Size`] = sizeSlider(50, 200, STUDIO_DEFAULTS.bodySize);
      controls[`${slot}Width`] = widthSlider;
      controls[`${slot}Leading`] = leadingControl;
      break;
    case "cta":
      controls[`${slot}Text`] = {
        defaultValue: STUDIO_DEFAULTS.ctaText,
        label: "Text",
        orderRole: "primary",
        performanceReason:
          "Button label length re-measures one small box on every keystroke.",
        performanceRole: "workload",
        target: `${slot}.text`,
        type: "lineText",
        visibleWhen: on,
      };
      controls[`${slot}Style`] = {
        defaultValue: STUDIO_DEFAULTS.ctaStyle,
        label: "Style",
        options: [
          { label: "Outline", value: "outline" },
          { label: "Filled", value: "filled" },
          { label: "Underline", value: "underline" },
        ],
        orderRole: "mode",
        performanceReason: "Button style swaps the box treatment of one small element.",
        performanceRole: "responsiveness",
        target: `${slot}.style`,
        type: "segmented",
        visibleWhen: on,
      };
      controls[`${slot}Size`] = sizeSlider(60, 180, STUDIO_DEFAULTS.ctaSize);
      break;
    case "divider":
      controls[`${slot}Weight`] = {
        defaultValue: STUDIO_DEFAULTS.dividerWeight,
        label: "Weight",
        options: [
          { label: "Hairline", value: "hairline" },
          { label: "Regular", value: "regular" },
          { label: "Bold", value: "bold" },
        ],
        orderRole: "strength",
        performanceReason: "Divider weight changes one rule's thickness.",
        performanceRole: "responsiveness",
        target: `${slot}.weight`,
        type: "segmented",
        visibleWhen: on,
      };
      controls[`${slot}Length`] = {
        defaultValue: STUDIO_DEFAULTS.dividerLength,
        label: "Length",
        max: 100,
        min: 5,
        orderRole: "spatial",
        performanceReason: "Divider length changes one rule's width.",
        performanceRole: "responsiveness",
        step: 5,
        target: `${slot}.length`,
        type: "slider",
        unit: "%",
        visibleWhen: on,
      };
      break;
    case "lockup":
      controls[`${slot}Left`] = {
        defaultValue: STUDIO_DEFAULTS.lockupLeftText,
        description:
          "Tracked caps left of the brand motif — leave empty to skip this side.",
        label: "Left text",
        orderRole: "primary",
        performanceReason:
          "Lockup text re-measures one single-line row on each keystroke.",
        performanceRole: "workload",
        target: `${slot}.left`,
        type: "lineText",
        visibleWhen: on,
      };
      controls[`${slot}Right`] = {
        defaultValue: STUDIO_DEFAULTS.lockupRightText,
        description: "Tracked caps right of the motif — empty skips it.",
        label: "Right text",
        orderRole: "primary",
        performanceReason:
          "Lockup text re-measures one single-line row on each keystroke.",
        performanceRole: "workload",
        target: `${slot}.right`,
        type: "lineText",
        visibleWhen: on,
      };
      controls[`${slot}MotifSize`] = {
        defaultValue: STUDIO_DEFAULTS.lockupMotifSize,
        label: "Motif size",
        max: 200,
        min: 50,
        orderRole: "strength",
        performanceReason: "Size percent rescales the lockup's motif on the modular scale.",
        performanceRole: "responsiveness",
        step: 5,
        target: `${slot}.motifSize`,
        type: "slider",
        unit: "%",
        visibleWhen: on,
      };
      controls[`${slot}TextSize`] = {
        defaultValue: STUDIO_DEFAULTS.lockupTextSize,
        label: "Text size",
        max: 200,
        min: 50,
        orderRole: "strength",
        performanceReason: "Size percent rescales the lockup's texts on the modular scale.",
        performanceRole: "responsiveness",
        step: 5,
        target: `${slot}.textSize`,
        type: "slider",
        unit: "%",
        visibleWhen: on,
      };
      break;
    case "masthead":
      controls[`${slot}ShowLogo`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadShowLogo,
        label: "Logo",
        orderRole: "mode",
        performanceReason:
          "Toggling a banner segment re-measures one row without media work.",
        performanceRole: "responsiveness",
        target: `${slot}.showLogo`,
        type: "switch",
        visibleWhen: on,
      };
      controls[`${slot}Logo`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadLogoVariantId,
        description: "Which brand mark leads the banner.",
        label: false,
        options: MRS_BRAND.logos.map((logo) => ({ label: logo.label, value: logo.id })),
        orderRole: "mode",
        performanceReason:
          "Swapping the mark redraws one image segment without re-measuring text.",
        performanceRole: "responsiveness",
        target: `${slot}.logoVariant`,
        type: "select",
        visibleWhen: on,
      };
      controls[`${slot}ShowTitle`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadShowTitle,
        description:
          "Romie caps with ordinals — type № from the special characters, or N + o for the ligature.",
        label: "Title text",
        orderRole: "primary",
        performanceReason:
          "Toggling a banner segment re-measures one row without media work.",
        performanceRole: "responsiveness",
        target: `${slot}.showTitle`,
        type: "switch",
        visibleWhen: on,
      };
      controls[`${slot}Title`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadTitleText,
        label: false,
        orderRole: "primary",
        performanceReason:
          "Title length re-measures one single-line row on each keystroke.",
        performanceRole: "workload",
        target: `${slot}.title`,
        type: "lineText",
        visibleWhen: on,
      };
      controls[`${slot}ShowCaption`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadShowCaption,
        description: "Small tracked caps — press Enter for the second line.",
        label: "Caption text",
        orderRole: "primary",
        performanceReason:
          "Toggling a banner segment re-measures one row without media work.",
        performanceRole: "responsiveness",
        target: `${slot}.showCaption`,
        type: "switch",
        visibleWhen: on,
      };
      controls[`${slot}Caption`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadCaptionText,
        label: false,
        orderRole: "primary",
        performanceReason:
          "Caption length re-measures one banner segment on each keystroke.",
        performanceRole: "workload",
        target: `${slot}.caption`,
        type: "multilineText",
        visibleWhen: on,
      };
      controls[`${slot}ShowDividers`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadShowDividers,
        label: "Dividers",
        orderRole: "detail",
        performanceReason:
          "Toggling the hairlines redraws two rects without re-measuring text.",
        performanceRole: "responsiveness",
        target: `${slot}.showDividers`,
        type: "switch",
        visibleWhen: on,
      };
      controls[`${slot}DividerCount`] = {
        defaultValue: STUDIO_DEFAULTS.mastheadDividerCount,
        description: "How many hairlines separate the segments, left to right.",
        label: "Count",
        options: [
          { label: "Auto", value: "auto" },
          { label: "1", value: "1" },
          { label: "2", value: "2" },
        ],
        orderRole: "detail",
        performanceReason:
          "Divider count redraws at most two rects without re-measuring text.",
        performanceRole: "responsiveness",
        target: `${slot}.dividerCount`,
        type: "segmented",
        visibleWhen: { equals: true, target: `${slot}.showDividers` },
      };
      controls[`${slot}Size`] = sizeSlider(50, 200, STUDIO_DEFAULTS.mastheadSize);
      break;
    default:
      break;
  }
  controls[`${slot}Spacing`] = spacingControl;
  return {
    controls,
    title: "Content",
    visibleWhen: { equals: slot, target: "ui.selectedElement" },
  };
}

const EXTRA_ELEMENT_SECTIONS: ToolcraftControlSectionSchema[] =
  EXTRA_SLOT_KEYS.map(extraElementSection);

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    size: { height: 1920, unit: "px", width: 1080 },
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
            // One colour for every text element. The app only ever uses a single
            // content colour, so the per-element pickers were retired (2026-07-14)
            // in favour of this one — readStudioValues fans it out to headline,
            // subheading, body, button, and divider. Defaults to bone.
            contentColor: {
              defaultValue: STUDIO_DEFAULTS.headingColorId,
              description:
                "One colour for all text — headline, subheading, body, button, and divider share it.",
              label: "Content color",
              options: textColorOptions,
              orderRole: "color",
              performanceReason: "Recolours all text at once without touching layout.",
              performanceRole: "responsiveness",
              target: "content.color",
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
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
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
              max: 220,
              min: 40,
              orderRole: "strength",
              performanceReason:
                "Size percent rescales one text block on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "heading.size",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingWidth: {
              defaultValue: STUDIO_DEFAULTS.headingWidthPct,
              description:
                "Max width of just this headline's column — lower wraps it sooner. The Layout › Text width sets the baseline for every element.",
              label: "Text width",
              max: 100,
              min: 40,
              orderRole: "spatial",
              performanceReason:
                "Width drags re-measure one text block's wrapping without media work.",
              performanceRole: "responsiveness",
              step: 5,
              target: "heading.width",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "heading.include" },
            },
            headingLeading: {
              defaultValue: STUDIO_DEFAULTS.headingLeading,
              description:
                "Line spacing for just this headline. Tight is the Swiss default look.",
              label: "Leading",
              options: [
                { label: "Tight", value: "tight" },
                { label: "Normal", value: "normal" },
                { label: "Airy", value: "airy" },
              ],
              orderRole: "detail",
              performanceReason:
                "Leading re-measures one text block without media work.",
              performanceRole: "responsiveness",
              target: "heading.leading",
              type: "segmented",
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
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
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
              max: 200,
              min: 50,
              orderRole: "strength",
              performanceReason:
                "Size percent rescales one text block on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "subhead.size",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
            subheadWidth: {
              defaultValue: STUDIO_DEFAULTS.subheadWidthPct,
              description:
                "Max width of just this sub-head's column — lower wraps it sooner. The Layout › Text width sets the baseline for every element.",
              label: "Text width",
              max: 100,
              min: 40,
              orderRole: "spatial",
              performanceReason:
                "Width drags re-measure one text block's wrapping without media work.",
              performanceRole: "responsiveness",
              step: 5,
              target: "subhead.width",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "subhead.include" },
            },
            subheadLeading: {
              defaultValue: STUDIO_DEFAULTS.subheadLeading,
              description:
                "Line spacing for just this sub-head. Tight is the Swiss default look.",
              label: "Leading",
              options: [
                { label: "Tight", value: "tight" },
                { label: "Normal", value: "normal" },
                { label: "Airy", value: "airy" },
              ],
              orderRole: "detail",
              performanceReason:
                "Leading re-measures one text block without media work.",
              performanceRole: "responsiveness",
              target: "subhead.leading",
              type: "segmented",
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
          },
          title: "Content",
          visibleWhen: { equals: "subhead", target: "ui.selectedElement" },
        },
        {
          controls: {
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
            lockupLeft: {
              defaultValue: STUDIO_DEFAULTS.lockupLeftText,
              description:
                "Tracked caps left of the brand motif — leave empty to skip this side.",
              label: "Left text",
              orderRole: "primary",
              performanceReason:
                "Lockup text re-measures one single-line row on each keystroke.",
              performanceRole: "workload",
              target: "lockup.left",
              type: "lineText",
              visibleWhen: { equals: true, target: "lockup.include" },
            },
            lockupRight: {
              defaultValue: STUDIO_DEFAULTS.lockupRightText,
              description: "Tracked caps right of the motif — empty skips it.",
              label: "Right text",
              orderRole: "primary",
              performanceReason:
                "Lockup text re-measures one single-line row on each keystroke.",
              performanceRole: "workload",
              target: "lockup.right",
              type: "lineText",
              visibleWhen: { equals: true, target: "lockup.include" },
            },
            lockupMotifSize: {
              defaultValue: STUDIO_DEFAULTS.lockupMotifSize,
              label: "Motif size",
              max: 200,
              min: 50,
              orderRole: "strength",
              performanceReason:
                "Size percent rescales the lockup's motif on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "lockup.motifSize",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "lockup.include" },
            },
            lockupTextSize: {
              defaultValue: STUDIO_DEFAULTS.lockupTextSize,
              label: "Text size",
              max: 200,
              min: 50,
              orderRole: "strength",
              performanceReason:
                "Size percent rescales the lockup's texts on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "lockup.textSize",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "lockup.include" },
            },
            lockupSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the lockup in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "lockup.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "lockup.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "lockup", target: "ui.selectedElement" },
        },
        {
          controls: {
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
            mastheadShowLogo: {
              defaultValue: STUDIO_DEFAULTS.mastheadShowLogo,
              label: "Logo",
              orderRole: "mode",
              performanceReason:
                "Toggling a banner segment re-measures one row without media work.",
              performanceRole: "responsiveness",
              target: "masthead.showLogo",
              type: "switch",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadLogo: {
              defaultValue: STUDIO_DEFAULTS.mastheadLogoVariantId,
              description: "Which brand mark leads the banner.",
              label: false,
              options: MRS_BRAND.logos.map((logo) => ({ label: logo.label, value: logo.id })),
              orderRole: "mode",
              performanceReason:
                "Swapping the mark redraws one image segment without re-measuring text.",
              performanceRole: "responsiveness",
              target: "masthead.logoVariant",
              type: "select",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadShowTitle: {
              defaultValue: STUDIO_DEFAULTS.mastheadShowTitle,
              description:
                "Romie caps with ordinals — type № from the special characters, or N + o for the ligature.",
              label: "Title text",
              orderRole: "primary",
              performanceReason:
                "Toggling a banner segment re-measures one row without media work.",
              performanceRole: "responsiveness",
              target: "masthead.showTitle",
              type: "switch",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadTitle: {
              defaultValue: STUDIO_DEFAULTS.mastheadTitleText,
              label: false,
              orderRole: "primary",
              performanceReason:
                "Title length re-measures one single-line row on each keystroke.",
              performanceRole: "workload",
              target: "masthead.title",
              type: "lineText",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadShowCaption: {
              defaultValue: STUDIO_DEFAULTS.mastheadShowCaption,
              description: "Small tracked caps — press Enter for the second line.",
              label: "Caption text",
              orderRole: "primary",
              performanceReason:
                "Toggling a banner segment re-measures one row without media work.",
              performanceRole: "responsiveness",
              target: "masthead.showCaption",
              type: "switch",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadCaption: {
              defaultValue: STUDIO_DEFAULTS.mastheadCaptionText,
              label: false,
              orderRole: "primary",
              performanceReason:
                "Caption length re-measures one banner segment on each keystroke.",
              performanceRole: "workload",
              target: "masthead.caption",
              type: "multilineText",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadShowDividers: {
              defaultValue: STUDIO_DEFAULTS.mastheadShowDividers,
              label: "Dividers",
              orderRole: "detail",
              performanceReason:
                "Toggling the hairlines redraws two rects without re-measuring text.",
              performanceRole: "responsiveness",
              target: "masthead.showDividers",
              type: "switch",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadDividerCount: {
              defaultValue: STUDIO_DEFAULTS.mastheadDividerCount,
              description: "How many hairlines separate the segments, left to right.",
              label: "Count",
              options: [
                { label: "Auto", value: "auto" },
                { label: "1", value: "1" },
                { label: "2", value: "2" },
              ],
              orderRole: "detail",
              performanceReason:
                "Divider count redraws at most two rects without re-measuring text.",
              performanceRole: "responsiveness",
              target: "masthead.dividerCount",
              type: "segmented",
              visibleWhen: { equals: true, target: "masthead.showDividers" },
            },
            mastheadSize: {
              defaultValue: STUDIO_DEFAULTS.mastheadSize,
              label: "Size",
              max: 200,
              min: 50,
              orderRole: "strength",
              performanceReason:
                "Size percent rescales the banner row on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "masthead.size",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
            mastheadSpacing: {
              defaultValue: { bottom: 0, top: 0 },
              description: "Add space above or below the banner in the stack.",
              label: "Spacing",
              orderRole: "detail",
              performanceReason:
                "Spacing nudges one element's position in the flow; it re-lays out the stack only.",
              performanceRole: "responsiveness",
              target: "masthead.space",
              type: "elementSpacing",
              visibleWhen: { equals: true, target: "masthead.include" },
            },
          },
          title: "Content",
          visibleWhen: { equals: "masthead", target: "ui.selectedElement" },
        },
        {
          controls: {
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
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
              max: 200,
              min: 50,
              orderRole: "strength",
              performanceReason:
                "Size percent rescales one text block on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "body.size",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "body.include" },
            },
            bodyWidth: {
              defaultValue: STUDIO_DEFAULTS.bodyWidthPct,
              description:
                "Max width of just this body copy's column — lower wraps it sooner. The Layout › Text width sets the baseline for every element.",
              label: "Text width",
              max: 100,
              min: 40,
              orderRole: "spatial",
              performanceReason:
                "Width drags re-measure one text block's wrapping without media work.",
              performanceRole: "responsiveness",
              step: 5,
              target: "body.width",
              type: "slider",
              unit: "%",
              visibleWhen: { equals: true, target: "body.include" },
            },
            bodyLeading: {
              defaultValue: STUDIO_DEFAULTS.bodyLeading,
              description:
                "Line spacing for just this body copy. Tight is the Swiss default look.",
              label: "Leading",
              options: [
                { label: "Tight", value: "tight" },
                { label: "Normal", value: "normal" },
                { label: "Airy", value: "airy" },
              ],
              orderRole: "detail",
              performanceReason:
                "Leading re-measures one text block without media work.",
              performanceRole: "responsiveness",
              target: "body.leading",
              type: "segmented",
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
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
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
              max: 250,
              min: 30,
              orderRole: "strength",
              performanceReason:
                "Logo size percent rescales one vector image without re-decoding.",
              performanceRole: "responsiveness",
              step: 5,
              target: "logo.size",
              type: "slider",
              unit: "%",
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
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
            ctaText: {
              defaultValue: STUDIO_DEFAULTS.ctaText,
              label: "Text",
              orderRole: "primary",
              performanceReason:
                "Button label length re-measures one small box on every keystroke.",
              performanceRole: "workload",
              target: "cta.text",
              type: "lineText",
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
              max: 180,
              min: 60,
              orderRole: "strength",
              performanceReason:
                "Button size percent rescales one small box on the modular scale.",
              performanceRole: "responsiveness",
              step: 5,
              target: "cta.size",
              type: "slider",
              unit: "%",
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
            elementNav: {
              label: false,
              target: "ui.selectedElement",
              type: "elementContentNav",
            },
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
              max: 100,
              min: 5,
              orderRole: "spatial",
              performanceReason:
                "Divider length changes one rule's width.",
              performanceRole: "responsiveness",
              step: 5,
              target: "divider.length",
              type: "slider",
              unit: "%",
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
        // Extra element instances ("Headline 2", "Divider 3", …) — generated
        // mirrors of the base sections above, one per possible slot.
        ...EXTRA_ELEMENT_SECTIONS,
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
            layoutSpacing: {
              defaultValue: STUDIO_DEFAULTS.layoutSpaceAll,
              description:
                "Add space above or below EVERY stacked element at once — the same slider as in each element's menu, applied to all. Per-element nudges add on top.",
              label: "Spacing",
              orderRole: "spatial",
              performanceReason:
                "Spacing re-spaces the placed blocks in the flow; no media work.",
              performanceRole: "responsiveness",
              target: "layout.spaceAll",
              type: "layoutSpacing",
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
              // Only the primary Export keeps an icon; the rest read as plain
              // text buttons (user directive 2026-07-13).
              actions: [
                {
                  label: "Save template",
                  value: "save-template",
                  variant: "outline",
                },
                {
                  // Files the current artboard into the planner strip that
                  // matches its format (Story → Stories, Post → Feed grid, …).
                  label: "Add to planner",
                  value: "add-to-planner",
                  variant: "outline",
                },
                {
                  label: "Save to Library",
                  value: "save-to-library",
                  variant: "outline",
                },
                {
                  // Overlay-only PNG (transparent background) onto the
                  // clipboard, for pasting straight onto platform content —
                  // Instagram turns a pasted PNG into a story sticker.
                  label: "Copy overlay",
                  value: "copy-transparent",
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
    // Dark-only: light mode doesn't translate well on the canvas, so the
    // theme toggle is hidden and the app is pinned dark (see index.html
    // data-theme + theme-runtime default).
    theme: false,
    zoom: true,
  },
});
