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

let whitenedPromise: Promise<Map<string, { aspectRatio: number; url: string }>> | null =
  null;

function recolorElement(element: Element): void {
  const fill = element.getAttribute("fill");
  if (fill !== "none") {
    // No fill attribute means default black — recolor those too.
    element.setAttribute("fill", WHITE);
  }
  const stroke = element.getAttribute("stroke");
  if (stroke && stroke !== "none") {
    element.setAttribute("stroke", WHITE);
  }
  const style = element.getAttribute("style");
  if (style) {
    element.setAttribute(
      "style",
      style
        .replace(/fill:\s*(?!none)[^;]+/gi, `fill:${WHITE}`)
        .replace(/stroke:\s*(?!none)[^;]+/gi, `stroke:${WHITE}`),
    );
  }
}

const SHAPE_SELECTOR = "path,circle,ellipse,rect,polygon,polyline,line,text,g";

async function whitenOneLogo(logo: BrandLogo): Promise<{
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
    recolorElement(element);
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
export function whitenBrandLogos(
  brand: BrandKit,
): Promise<Map<string, { aspectRatio: number; url: string }>> {
  if (!whitenedPromise) {
    whitenedPromise = Promise.all(
      brand.logos.map(async (logo) => {
        try {
          return [logo.id, await whitenOneLogo(logo)] as const;
        } catch {
          return [logo.id, { aspectRatio: logo.aspectRatio, url: logo.url }] as const;
        }
      }),
    ).then((entries) => new Map(entries));
  }
  return whitenedPromise;
}

/** Brand kit with logos swapped for their white tight-cropped variants. */
export async function getWhiteLogoBrand(brand: BrandKit): Promise<BrandKit> {
  const map = await whitenBrandLogos(brand);
  return {
    ...brand,
    logos: brand.logos.map((logo) => {
      const white = map.get(logo.id);
      return white ? { ...logo, aspectRatio: white.aspectRatio, url: white.url } : logo;
    }),
  };
}
