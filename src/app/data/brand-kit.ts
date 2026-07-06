/**
 * The Mrs brand kit, wired from /brand at the project root.
 * Fonts are registered via @font-face in src/styles.css.
 */

import homLogoUrl from "../../../brand/logos/HOM_LOGO.svg";
import verticalLogoUrl from "../../../brand/logos/Mr_BLK_Vertical.svg";
import motifLogoUrl from "../../../brand/logos/Mrs_Motif.svg";
import wordmarkWhiteUrl from "../../../brand/logos/Wordmark_White.svg";

import type { BrandKit } from "./types";

export const MRS_LOGO_URLS = {
  hom: homLogoUrl,
  motif: motifLogoUrl,
  vertical: verticalLogoUrl,
  wordmarkWhite: wordmarkWhiteUrl,
} as const;

export const MRS_BRAND: BrandKit = {
  colors: [
    { hex: "#111110", id: "ink", label: "Ink", surface: true, text: true },
    { hex: "#f5f2ec", id: "bone", label: "Bone", surface: true, text: true },
    { hex: "#e0d5c3", id: "sand", label: "Sand", surface: true, text: false },
  ],
  flourishFontFamily: "Romie",
  logos: [
    { aspectRatio: 1, id: "wordmark-white", label: "Wordmark (white)", url: wordmarkWhiteUrl },
    { aspectRatio: 1, id: "motif", label: "Motif", url: motifLogoUrl },
    { aspectRatio: 1, id: "vertical", label: "Vertical", url: verticalLogoUrl },
    { aspectRatio: 386 / 215, id: "hom", label: "HOM", url: homLogoUrl },
  ],
  name: "Mrs",
  namingTemplate: "{date}_{campaign}_{comp}_{platform}_{w}x{h}_v{n}",
  specialCharacters: ["™", "®", "№", "→", "·", "✳", "&"],
  // Swiss typographic base: tight leading, restrained tracking, legibility first.
  textStyles: [
    {
      fontFamily: "'Romie', Georgia, serif",
      fontStyle: "normal",
      fontWeight: 400,
      id: "display",
      label: "Big Heading",
      letterSpacingEm: -0.018,
      lineHeight: 0.98,
      role: "heading",
      sizeFactor: 0.105,
      textTransform: "none",
    },
    {
      fontFamily: "'Romie', Georgia, serif",
      fontStyle: "normal",
      fontWeight: 400,
      id: "editorial-caps",
      label: "Caps Heading",
      letterSpacingEm: 0.045,
      lineHeight: 1.02,
      role: "heading",
      sizeFactor: 0.055,
      textTransform: "uppercase",
    },
    {
      fontFamily: "'Rework Micro', 'Inter Variable', sans-serif",
      fontStyle: "normal",
      fontWeight: 600,
      id: "subhead",
      label: "Subhead",
      letterSpacingEm: 0.05,
      lineHeight: 1.15,
      role: "subhead",
      sizeFactor: 0.023,
      textTransform: "uppercase",
    },
    {
      fontFamily: "'Onsite Standard', 'Inter Variable', sans-serif",
      fontStyle: "normal",
      fontWeight: 400,
      id: "body",
      label: "Body",
      letterSpacingEm: 0,
      lineHeight: 1.38,
      role: "body",
      sizeFactor: 0.02,
      textTransform: "none",
    },
  ],
};
