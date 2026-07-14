import * as React from "react";

import { PlayIcon } from "@phosphor-icons/react";
import { Button, Input } from "@/toolcraft/ui";
import { toast } from "sonner";

import onsiteFontUrl from "../../../brand/fonts/Onsite/OnsiteStandard-Regular.woff2";
import reworkFontUrl from "../../../brand/fonts/Rework/ReworkMicro-Semibold.woff2";
import romieItalicFontUrl from "../../../brand/fonts/Romie/Romie-Italic.woff2";
import romieRegularFontUrl from "../../../brand/fonts/Romie/Romie-Regular.woff2";

import { ARCHETYPES_DECK } from "../brand/archetypes-deck";
import { DeckViewer } from "../brand/deck-viewer";
import { downloadBlob } from "../data/download";
import { addLink, deleteLink, useProject } from "../data/project-store";
import { createZip, type ZipEntry } from "../studio/zip";

/** The brand's bundled font files, packaged on demand as a ZIP. */
const FONT_FILES: { name: string; url: string }[] = [
  { name: "Romie-Regular.woff2", url: romieRegularFontUrl },
  { name: "Romie-Italic.woff2", url: romieItalicFontUrl },
  { name: "ReworkMicro-Semibold.woff2", url: reworkFontUrl },
  { name: "OnsiteStandard-Regular.woff2", url: onsiteFontUrl },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Fetch a set of URLs and download them bundled as one ZIP. */
async function downloadPackage(
  files: { name: string; url: string }[],
  zipName: string,
): Promise<number> {
  const entries: ZipEntry[] = [];
  for (const file of files) {
    const response = await fetch(file.url);
    if (!response.ok) continue;
    entries.push({ bytes: new Uint8Array(await response.arrayBuffer()), path: file.name });
  }
  if (entries.length === 0) return 0;
  downloadBlob(createZip(entries), zipName);
  return entries.length;
}

function Section(props: {
  action?: React.ReactNode;
  children: React.ReactNode;
  subtitle?: string;
  title: string;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{props.title}</h2>
          {props.subtitle ? (
            <p className="text-2xs text-muted-foreground">{props.subtitle}</p>
          ) : null}
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function memberHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}

function TeamSection(): React.JSX.Element {
  const { teamMembers } = useProject();
  const sorted = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Section
      subtitle="Everyone with an account on this workspace."
      title={`Team${sorted.length ? ` · ${sorted.length}` : ""}`}
    >
      {sorted.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          No teammates yet — invite people to sign in and they’ll appear here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sorted.map((member) => (
            <div
              className="flex items-center gap-2.5 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] px-3 py-2"
              key={member.id}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: `hsl(${memberHue(member.id || member.name)} 32% 42%)` }}
              >
                {memberInitials(member.name)}
              </span>
              <span className="flex flex-col">
                <span className="text-xs-plus leading-tight">{member.name}</span>
                {member.email ? (
                  <span className="text-2xs text-muted-foreground">{member.email}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function LinksSection(): React.JSX.Element {
  const project = useProject();
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");

  const add = (): void => {
    const trimmedUrl = url.trim();
    if (!label.trim() || !trimmedUrl) return;
    addLink(label.trim(), /^https?:\/\//.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`);
    setLabel("");
    setUrl("");
  };

  return (
    <Section subtitle="Instagram, website, admin — one tap away for the whole team." title="Links">
      <div className="flex flex-col gap-1.5">
        {project.links.map((link) => (
          <div
            className="group flex items-center gap-2 rounded-md border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] px-3 py-2"
            key={link.id}
          >
            <span className="w-32 shrink-0 truncate text-xs-plus">{link.label}</span>
            <a
              className="min-w-0 flex-1 truncate text-2xs text-[color:var(--link)] hover:underline"
              href={link.url}
              rel="noreferrer"
              target="_blank"
            >
              {link.url}
            </a>
            <button
              className="text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              onClick={() => deleteLink(link.id)}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="w-40"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label"
          value={label}
        />
        <Input
          className="flex-1"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          placeholder="https://…"
          value={url}
        />
        <Button disabled={!label.trim() || !url.trim()} onClick={add} size="sm" type="button">
          Add link
        </Button>
      </div>
    </Section>
  );
}

function ColorsSection(): React.JSX.Element {
  const { brand } = useProject();
  return (
    <Section subtitle="Approved palette. Click a swatch to copy the hex." title="Colors">
      <div className="flex flex-wrap gap-3">
        {brand.colors.map((color) => (
          <button
            className="flex w-28 flex-col overflow-hidden rounded-lg border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] text-left"
            key={color.id}
            onClick={() => {
              void navigator.clipboard?.writeText(color.hex);
              toast.success(`Copied ${color.hex}`);
            }}
            type="button"
          >
            <span className="h-16 w-full" style={{ backgroundColor: color.hex }} />
            <span className="px-2 py-1.5">
              <span className="block text-xs-plus">{color.label}</span>
              <span className="block font-mono text-2xs uppercase text-muted-foreground">
                {color.hex}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function LogosSection(): React.JSX.Element {
  const { brand } = useProject();
  const [busy, setBusy] = React.useState(false);

  const downloadAll = async (): Promise<void> => {
    setBusy(true);
    const toastId = toast.loading("Packaging logos…");
    try {
      const files = brand.logos.map((logo) => ({
        name: `${slugify(logo.label) || logo.id}.svg`,
        url: logo.url,
      }));
      const count = await downloadPackage(files, "mrs-logos.zip");
      if (count > 0) toast.success(`Downloaded ${count} logos → mrs-logos.zip`, { id: toastId });
      else toast.error("No logos to download.", { id: toastId });
    } catch (error) {
      toast.error(`Download failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      action={
        brand.logos.length > 0 ? (
          <Button
            disabled={busy}
            onClick={() => void downloadAll()}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy ? "Packaging…" : "⬇ Download all"}
          </Button>
        ) : undefined
      }
      subtitle="Always white on the comp. Click one to download its SVG, or grab the set."
      title="Logos"
    >
      <div className="flex flex-wrap gap-3">
        {brand.logos.map((logo) => (
          <a
            className="flex h-24 w-32 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] p-4 transition-colors hover:border-[color:var(--accent)]"
            download={`mrs-${logo.id}.svg`}
            href={logo.url}
            key={logo.id}
            title={`Download ${logo.label}`}
          >
            <img alt={logo.label} className="max-h-full max-w-full" src={logo.url} />
          </a>
        ))}
      </div>
    </Section>
  );
}

function FontsSection(): React.JSX.Element {
  const { brand } = useProject();
  const [busy, setBusy] = React.useState(false);

  const downloadFonts = async (): Promise<void> => {
    setBusy(true);
    const toastId = toast.loading("Packaging fonts…");
    try {
      const count = await downloadPackage(FONT_FILES, "mrs-fonts.zip");
      if (count > 0) toast.success(`Downloaded ${count} font files → mrs-fonts.zip`, { id: toastId });
      else toast.error("No font files available.", { id: toastId });
    } catch (error) {
      toast.error(`Download failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      action={
        <Button
          disabled={busy}
          onClick={() => void downloadFonts()}
          size="sm"
          type="button"
          variant="outline"
        >
          {busy ? "Packaging…" : "⬇ Download fonts"}
        </Button>
      }
      subtitle="Approved type. Set headlines in Romie; body in the sans faces."
      title="Fonts"
    >
      <div className="flex flex-col gap-2">
        {brand.textStyles.map((style) => (
          <div
            className="rounded-lg border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] px-4 py-3"
            key={style.id}
          >
            <span
              className="block truncate text-foreground"
              style={{
                fontFamily: style.fontFamily,
                fontStyle: style.fontStyle,
                fontWeight: style.fontWeight,
                fontSize: `${Math.min(34, Math.max(16, style.sizeFactor * 260))}px`,
                letterSpacing: `${style.letterSpacingEm}em`,
                textTransform: style.textTransform,
              }}
            >
              {style.label}
            </span>
            <span className="mt-1 block text-2xs text-muted-foreground">
              {style.fontFamily} · {style.fontStyle} {style.fontWeight}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DecksSection(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const deck = ARCHETYPES_DECK;
  const cover = deck.slides[0];

  return (
    <Section subtitle="Reference decks — click to flip through the slides." title="Decks">
      <button
        className="group flex w-full max-w-md items-center gap-4 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] p-3 text-left transition-colors hover:border-[color:var(--accent)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-black ds-hairline">
          {cover ? (
            <img alt="" className="h-full w-full object-cover" src={cover.thumb} />
          ) : null}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-colors group-hover:bg-black/25 group-hover:text-white">
            <PlayIcon size={22} weight="fill" />
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{deck.title}</span>
          <span className="truncate text-2xs text-muted-foreground">{deck.subtitle}</span>
          <span className="mt-1 text-2xs text-[color:var(--link)]">
            {deck.slides.length} slides · View deck →
          </span>
        </span>
      </button>
      {open ? <DeckViewer deck={deck} onClose={() => setOpen(false)} /> : null}
    </Section>
  );
}

export function BrandScreen(): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[880px] flex-col gap-8 px-6 py-6">
        <TeamSection />
        <DecksSection />
        <LinksSection />
        <ColorsSection />
        <FontsSection />
        <LogosSection />
      </div>
    </div>
  );
}
