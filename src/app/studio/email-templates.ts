/**
 * Email section templates + the element manifest that drives the inspector.
 * Each template is a curated preset over StudioValues at an email-sized format,
 * so a "hero" or "footer" is just the existing comp renderer pointed at email
 * dimensions with RHODE-calibrated defaults (lowercase quiet type, uppercase
 * tracked eyebrows, cream/greige, thin outline pills, rounded overlays).
 */

import { DEFAULT_FORMAT_ID, PLATFORM_FORMATS, getFormat } from "../data/formats";
import { createId } from "../data/project-store";
import type { Comp, EmailSection, EmailSectionType } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";

/** An editable element group in the inspector. */
export type ElementKey =
  | "logo"
  | "eyebrow"
  | "heading"
  | "subhead"
  | "body"
  | "cta"
  | "image"
  | "grid"
  | "list";

/**
 * Which element groups the inspector shows for each section type. Generous by
 * design: a group can be toggled off, so showing a plausibly-relevant element
 * (off by default) is how the user "turns anything on/off".
 */
export const EMAIL_ELEMENTS: Record<EmailSectionType, ElementKey[]> = {
  header: ["logo", "eyebrow"],
  hero: ["image", "eyebrow", "heading", "subhead", "body", "cta"],
  editorial: ["image", "eyebrow", "heading", "subhead", "body", "cta"],
  split: ["image", "eyebrow", "heading", "subhead", "body", "cta"],
  "product-grid": ["grid", "eyebrow", "heading", "cta"],
  text: ["eyebrow", "heading", "body", "cta", "logo"],
  quote: ["eyebrow", "heading", "body"],
  footer: ["logo", "body", "eyebrow"],
  banner: ["body"],
  list: ["eyebrow", "heading", "list"],
  cta: ["cta"],
  comp: [],
};

/** Alternate aspects offered by the inspector's "Shape" control, by type. */
export const EMAIL_ASPECTS: Partial<Record<EmailSectionType, string[]>> = {
  hero: ["email-hero-portrait", "email-hero-square", "email-hero-landscape"],
  comp: ["email-hero-portrait", "email-hero-square", "email-hero-landscape", "email-editorial"],
};

export type EmailTemplateGroup =
  | "Header"
  | "Announcement"
  | "Hero"
  | "Editorial"
  | "Body"
  | "List"
  | "Product"
  | "CTA"
  | "Footer";

export interface EmailTemplate {
  defaults: Partial<StudioValues>;
  formatId: string;
  group: EmailTemplateGroup;
  id: string;
  label: string;
  type: EmailSectionType;
}

const CREAM = "#f5f2ec";
const SAND = "#e0d5c3";

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  // ---- Header --------------------------------------------------------------
  {
    id: "wordmark-header",
    group: "Header",
    label: "Wordmark header",
    type: "header",
    formatId: "email-wordmark",
    defaults: {
      backgroundHex: CREAM,
      headingInclude: false,
      imageInclude: false,
      logoAnchor: "center-left",
      logoInclude: true,
      logoSize: "l",
      logoVariantId: "motif",
      subheadInclude: false,
    },
  },
  {
    id: "header-nav",
    group: "Header",
    label: "Header + nav",
    type: "header",
    formatId: "email-header",
    defaults: {
      backgroundHex: CREAM,
      elementsOrder: ["eyebrow"],
      eyebrowAlign: "center",
      eyebrowColorId: "ink",
      eyebrowInclude: true,
      eyebrowText: "Shop · New · Journal",
      headingInclude: false,
      imageInclude: false,
      layoutTextPosition: "bottom",
      logoAnchor: "top-center",
      logoInclude: true,
      logoSize: "m",
      logoVariantId: "motif",
      subheadInclude: false,
    },
  },
  // ---- Announcement --------------------------------------------------------
  {
    id: "eyebrow-intro",
    group: "Announcement",
    label: "Eyebrow intro",
    type: "text",
    formatId: "email-text",
    defaults: {
      backgroundHex: CREAM,
      bodyAlign: "center",
      bodyColorId: "ink",
      bodyInclude: true,
      bodyText: "A short line of copy to set the mood and welcome the reader in.",
      ctaAlign: "center",
      ctaColorId: "ink",
      ctaInclude: true,
      ctaPill: true,
      ctaStyle: "outline",
      ctaText: "Come on in",
      elementsOrder: ["eyebrow", "heading", "body", "cta"],
      eyebrowAlign: "center",
      eyebrowInclude: true,
      eyebrowText: "Welcome to the world of Mrs",
      headingAlign: "center",
      headingInclude: false,
      imageInclude: false,
      layoutTextPosition: "middle",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  {
    id: "slim-banner",
    group: "Announcement",
    label: "Slim banner",
    type: "banner",
    formatId: "email-banner",
    defaults: {
      backgroundHex: SAND,
      bodyAlign: "center",
      bodyColorId: "ink",
      bodyInclude: true,
      bodySize: "s",
      bodyText: "Complimentary shipping over $75",
      elementsOrder: ["body"],
      headingInclude: false,
      imageInclude: false,
      layoutTextPosition: "middle",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  // ---- Hero ----------------------------------------------------------------
  {
    id: "full-hero",
    group: "Hero",
    label: "Full-bleed hero",
    type: "hero",
    formatId: "email-hero-portrait",
    defaults: {
      ctaColorId: "bone",
      ctaInclude: true,
      ctaPill: true,
      ctaStyle: "outline",
      ctaText: "Shop the edit",
      elementsOrder: ["eyebrow", "heading", "subhead", "cta"],
      headingColorId: "bone",
      headingInclude: true,
      headingText: "Summer, softly",
      imageBleed: true,
      imageInclude: true,
      layoutPattern: "poster",
      layoutTextPosition: "bottom",
      logoInclude: false,
      overlayStrength: 55,
      overlayStyle: "shade-bottom",
      subheadColorId: "bone",
      subheadInclude: true,
      subheadText: "the july edit",
    },
  },
  {
    id: "overlay-hero",
    group: "Hero",
    label: "Overlay hero (rounded)",
    type: "hero",
    formatId: "email-overlay",
    defaults: {
      bodyAlign: "left",
      bodyColorId: "bone",
      bodyInclude: true,
      bodyText: "Apply a thick layer as an overnight lip mask. Wake up glazed.",
      ctaInclude: false,
      elementsOrder: ["eyebrow", "heading", "body"],
      headingAlign: "left",
      headingColorId: "bone",
      headingInclude: true,
      headingText: "lip tip",
      imageBleed: true,
      imageInclude: true,
      imageRadius: 16,
      layoutPattern: "poster",
      layoutTextPosition: "top",
      logoInclude: false,
      overlayStrength: 32,
      overlayStyle: "shade-frame",
      subheadInclude: false,
    },
  },
  // ---- Editorial -----------------------------------------------------------
  {
    id: "editorial-photo",
    group: "Editorial",
    label: "Editorial photo",
    type: "editorial",
    formatId: "email-editorial",
    defaults: {
      backgroundHex: CREAM,
      bodyColorId: "ink",
      bodyInclude: true,
      bodyText: "A short caption for the story.",
      ctaInclude: false,
      elementsOrder: ["eyebrow", "heading", "body"],
      headingColorId: "ink",
      headingInclude: true,
      headingText: "in the long light",
      imageBleed: true,
      imageInclude: true,
      layoutPattern: "banded",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  {
    id: "lineup-band",
    group: "Editorial",
    label: "Product-lineup band",
    type: "editorial",
    formatId: "email-lineup",
    defaults: {
      backgroundHex: CREAM,
      bodyInclude: false,
      ctaInclude: false,
      elementsOrder: ["heading"],
      headingAlign: "center",
      headingColorId: "ink",
      headingInclude: true,
      headingText: "one of everything really good",
      imageBleed: false,
      imageInclude: true,
      layoutOrder: "text",
      layoutPattern: "banded",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  // ---- Body ----------------------------------------------------------------
  {
    id: "centered-body",
    group: "Body",
    label: "Centered body",
    type: "text",
    formatId: "email-text",
    defaults: {
      backgroundHex: CREAM,
      bodyAlign: "center",
      bodyColorId: "ink",
      bodyInclude: true,
      bodyText: "Say something here — a note, an announcement, a short story.",
      ctaInclude: false,
      elementsOrder: ["heading", "body"],
      headingAlign: "center",
      headingColorId: "ink",
      headingInclude: true,
      headingText: "a note",
      imageInclude: false,
      layoutTextPosition: "middle",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  {
    id: "founder-note",
    group: "Body",
    label: "Founder note + signature",
    type: "text",
    formatId: "email-note",
    defaults: {
      backgroundHex: CREAM,
      bodyAlign: "center",
      bodyColorId: "ink",
      bodyInclude: true,
      bodyText:
        "“At Mrs, our philosophy is to make one of everything really good — the pieces you never want to leave the house without.”",
      ctaInclude: false,
      elementsOrder: ["eyebrow", "body"],
      eyebrowAlign: "center",
      eyebrowInclude: true,
      eyebrowText: "A note from our founder",
      headingInclude: false,
      imageInclude: false,
      layoutTextPosition: "top",
      logoAnchor: "bottom-center",
      logoInclude: true,
      logoSize: "s",
      logoVariantId: "motif",
      subheadInclude: false,
    },
  },
  // ---- List ----------------------------------------------------------------
  {
    id: "values-list",
    group: "List",
    label: "Values list",
    type: "list",
    formatId: "email-list",
    defaults: {
      backgroundHex: CREAM,
      bodyInclude: false,
      elementsOrder: ["eyebrow", "heading", "list"],
      headingInclude: false,
      imageInclude: false,
      listAlign: "left",
      listColorId: "ink",
      listInclude: true,
      listItems: [
        "vegan",
        "cruelty-free",
        "gluten-free",
        "dermatologist-tested",
        "fragrance-free",
      ],
      listSize: "m",
      layoutTextPosition: "middle",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  // ---- Product -------------------------------------------------------------
  {
    id: "product-grid-3",
    group: "Product",
    label: "Product grid · 3-up",
    type: "product-grid",
    formatId: "email-grid-3",
    defaults: {
      backgroundHex: CREAM,
      collageCaptions: [
        { name: "glazing milk", note: "facial essence" },
        { name: "peptide lip tint", note: "tinted layer" },
        { name: "barrier butter", note: "moisture balm" },
      ],
      collageColumns: "3",
      collageShowCaptions: true,
      headingInclude: false,
      imageBleed: false,
      imageInclude: true,
      layoutPattern: "collage",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  {
    id: "product-grid-2",
    group: "Product",
    label: "Product grid · 2-up",
    type: "product-grid",
    formatId: "email-grid-2",
    defaults: {
      backgroundHex: CREAM,
      collageCaptions: [
        { name: "glazing milk", note: "facial essence" },
        { name: "barrier butter", note: "moisture balm" },
      ],
      collageColumns: "2",
      collageShowCaptions: true,
      headingInclude: false,
      imageBleed: false,
      imageInclude: true,
      layoutPattern: "collage",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  // ---- CTA -----------------------------------------------------------------
  {
    id: "pill-cta",
    group: "CTA",
    label: "Pill button",
    type: "cta",
    formatId: "email-cta",
    defaults: {
      backgroundHex: CREAM,
      bodyInclude: false,
      ctaAlign: "center",
      ctaColorId: "ink",
      ctaInclude: true,
      ctaPill: true,
      ctaStyle: "outline",
      ctaText: "Start your routine",
      elementsOrder: ["cta"],
      headingInclude: false,
      imageInclude: false,
      layoutTextPosition: "middle",
      logoInclude: false,
      subheadInclude: false,
    },
  },
  // ---- Footer --------------------------------------------------------------
  {
    id: "footer",
    group: "Footer",
    label: "Social + legal footer",
    type: "footer",
    formatId: "email-footer",
    defaults: {
      backgroundHex: SAND,
      bodyAlign: "center",
      bodyColorId: "ink",
      bodyInclude: true,
      bodyText: "Instagram · TikTok · YouTube\nMrs · 123 Atelier Way, London E1\nmrs.com · Unsubscribe",
      elementsOrder: ["body"],
      eyebrowInclude: false,
      headingInclude: false,
      imageInclude: false,
      layoutTextPosition: "middle",
      logoAnchor: "top-center",
      logoInclude: true,
      logoSize: "s",
      logoVariantId: "motif",
      subheadInclude: false,
    },
  },
];

export const EMAIL_TEMPLATE_GROUPS: readonly EmailTemplateGroup[] = [
  "Header",
  "Announcement",
  "Hero",
  "Editorial",
  "Body",
  "List",
  "Product",
  "CTA",
  "Footer",
];

/** A fresh section from a template: a full StudioValues snapshot at the email format. */
export function makeSection(template: EmailTemplate): EmailSection {
  return {
    alt: "",
    id: createId("esec"),
    type: template.type,
    values: { ...STUDIO_DEFAULTS, ...template.defaults, formatId: template.formatId },
  };
}

/** Merge a section's stored values back over the defaults for rendering. */
export function sectionRuntimeValues(section: EmailSection): StudioValues {
  return { ...STUDIO_DEFAULTS, ...(section.values as Partial<StudioValues>) };
}

/** Element groups the inspector should render for a section. */
export function sectionElements(type: EmailSectionType): ElementKey[] {
  return EMAIL_ELEMENTS[type] ?? [];
}

const EMAIL_FORMATS = PLATFORM_FORMATS.filter((format) => format.platform === "email");

/** Closest email format by aspect ratio (never the thin header/banner bands). */
function nearestEmailFormatId(aspect: number): string {
  let bestId = "email-hero-portrait";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const format of EMAIL_FORMATS) {
    if (format.width / format.height > 3) {
      continue;
    }
    const delta = Math.abs(format.width / format.height - aspect);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestId = format.id;
    }
  }
  return bestId;
}

/**
 * Turn a finished Studio comp into a section: copy its values, snap the format
 * to the nearest email aspect so it renders full-bleed at 600px content width.
 */
export function snapCompToEmailSection(comp: Comp): EmailSection {
  const source = (comp.sourceValues ?? {}) as Partial<StudioValues>;
  const sourceFormatId =
    typeof source.formatId === "string" ? source.formatId : DEFAULT_FORMAT_ID;
  let aspect = 0.8;
  try {
    const format = getFormat(sourceFormatId);
    aspect = format.width / format.height;
  } catch {
    // Unknown source format — keep the portrait-ish default aspect.
  }
  return {
    alt: comp.name ?? "",
    id: createId("esec"),
    type: "comp",
    values: { ...STUDIO_DEFAULTS, ...source, formatId: nearestEmailFormatId(aspect) },
  };
}

export function templateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((template) => template.id === id);
}
