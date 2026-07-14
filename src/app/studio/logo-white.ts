/**
 * Logo normalization: every brand mark becomes tight-cropped, white artwork.
 *
 * Why not CSS `filter: invert(1)` on the SVG <image>? WebKit silently drops
 * CSS filters inside SVG-as-image documents (verified empirically), so the
 * logo would export black for Safari users. Instead we rewrite the SVG source
 * once at startup: fills/strokes recolored to white, viewBox tightened to the
 * real content bbox (the raw files sit on 4096×4096 canvases with big margins).
 */

import type { BrandKit, BrandLogo } from "../data/types";

const WHITE = "#ffffff";

type LogoArt = { aspectRatio: number; url: string };

/** One recolor cached per (logo id + colour) so repeat Studio colours are free. */
const recolorCache = new Map<string, Promise<LogoArt>>();

function recolorLogo(logo: BrandLogo, color: string): Promise<LogoArt> {
  const key = `${logo.id}:${color}`;
  let pending = recolorCache.get(key);
  if (!pending) {
    pending = recolorOneLogo(logo, color).catch(
      (): LogoArt => ({ aspectRatio: logo.aspectRatio, url: logo.url }),
    );
    recolorCache.set(key, pending);
  }
  return pending;
}

function recolorElement(element: Element, color: string): void {
  const fill = element.getAttribute("fill");
  if (fill !== "none") {
    // No fill attribute means default black — recolor those too.
    element.setAttribute("fill", color);
  }
  const stroke = element.getAttribute("stroke");
  if (stroke && stroke !== "none") {
    element.setAttribute("stroke", color);
  }
  const style = element.getAttribute("style");
  if (style) {
    element.setAttribute(
      "style",
      style
        .replace(/fill:\s*(?!none)[^;]+/gi, `fill:${color}`)
        .replace(/stroke:\s*(?!none)[^;]+/gi, `stroke:${color}`),
    );
  }
}

const SHAPE_SELECTOR = "path,circle,ellipse,rect,polygon,polyline,line,text,g";

async function recolorOneLogo(
  logo: BrandLogo,
  color: string,
): Promise<{
  aspectRatio: number;
  url: string;
}> {
  const response = await fetch(logo.url);
  const source = await response.text();
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.nodeName !== "svg") {
    return { aspectRatio: logo.aspectRatio, url: logo.url };
  }

  for (const element of Array.from(root.querySelectorAll(SHAPE_SELECTOR))) {
    recolorElement(element, color);
  }

  // Measure the true content bbox by rendering the artwork off-screen, then
  // tighten the viewBox so marks place edge-accurate on the comp.
  const host = document.createElement("div");
  host.style.cssText =
    "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  const adopted = document.importNode(root, true) as unknown as SVGSVGElement;
  adopted.style.width = "512px";
  adopted.style.height = "512px";
  host.appendChild(adopted);
  document.body.appendChild(host);
  let aspectRatio = logo.aspectRatio;
  try {
    const bbox = adopted.getBBox();
    if (bbox.width > 0 && bbox.height > 0) {
      const pad = Math.max(bbox.width, bbox.height) * 0.01;
      const viewBox = `${(bbox.x - pad).toFixed(2)} ${(bbox.y - pad).toFixed(2)} ${(
        bbox.width +
        pad * 2
      ).toFixed(2)} ${(bbox.height + pad * 2).toFixed(2)}`;
      root.setAttribute("viewBox", viewBox);
      root.removeAttribute("width");
      root.removeAttribute("height");
      aspectRatio = (bbox.width + pad * 2) / (bbox.height + pad * 2);
    }
  } catch {
    // getBBox can throw on detached/empty content; keep the declared ratio.
  } finally {
    host.remove();
  }

  const serialized = new XMLSerializer().serializeToString(root);
  const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(serialized)))}`;
  return { aspectRatio, url };
}

/** Whiten + tight-crop all brand logos once; resolves to id → artwork map. */
export function whitenBrandLogos(brand: BrandKit): Promise<Map<string, LogoArt>> {
  return Promise.all(
    brand.logos.map(async (logo) => [logo.id, await recolorLogo(logo, WHITE)] as const),
  ).then((entries) => new Map(entries));
}

/**
 * Brand kit with logos swapped for white tight-cropped variants, each carrying
 * recoloured `colorVariants` for the brand's text colours (bone, ink, …) so the
 * Studio content colour can tint the mark to match the copy.
 */
export async function getWhiteLogoBrand(brand: BrandKit): Promise<BrandKit> {
  const white = await whitenBrandLogos(brand);
  const textColors = brand.colors.filter((color) => color.text);
  const tints = await Promise.all(
    textColors.map(async (color) => {
      const entries = await Promise.all(
        brand.logos.map(
          async (logo) => [logo.id, (await recolorLogo(logo, color.hex)).url] as const,
        ),
      );
      return [color.id, new Map(entries)] as const;
    }),
  );
  return {
    ...brand,
    logos: brand.logos.map((logo) => {
      const w = white.get(logo.id);
      const colorVariants: Record<string, string> = {};
      for (const [colorId, map] of tints) {
        const url = map.get(logo.id);
        if (url) colorVariants[colorId] = url;
      }
      return {
        ...logo,
        aspectRatio: w?.aspectRatio ?? logo.aspectRatio,
        colorVariants,
        url: w?.url ?? logo.url,
      };
    }),
  };
}
