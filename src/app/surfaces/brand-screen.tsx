import * as React from "react";

import { Button, Input, Textarea } from "@/toolcraft/ui";
import { toast } from "sonner";

import {
  addJournalEntry,
  addLink,
  deleteJournalEntry,
  deleteLink,
  updateJournalEntry,
  useProject,
} from "../data/project-store";
import type { JournalEntry } from "../data/types";

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
  return (
    <Section subtitle="Always white on the comp. Click to download the SVG." title="Logos">
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
  return (
    <Section subtitle="Approved type. Set headlines in Romie; body in the sans faces." title="Fonts">
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

function JournalCard(props: { entry: JournalEntry }): React.JSX.Element {
  const { entry } = props;
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {entry.kind}
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-xs-plus outline-none"
          onChange={(event) => updateJournalEntry(entry.id, { title: event.target.value })}
          value={entry.title}
        />
        {entry.kind === "copy" ? (
          <button
            className="text-2xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              void navigator.clipboard?.writeText(entry.body);
              toast.success("Copy copied");
            }}
            type="button"
          >
            Copy
          </button>
        ) : null}
        <button
          className="text-2xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Close" : "Edit"}
        </button>
        <button
          className="text-2xs text-muted-foreground hover:text-[color:var(--destructive)]"
          onClick={() => deleteJournalEntry(entry.id)}
          type="button"
        >
          Delete
        </button>
      </div>
      {open ? (
        <Textarea
          className="min-h-[7rem] resize-y rounded-none border-x-0 border-b-0 border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)]"
          onChange={(event) => updateJournalEntry(entry.id, { body: event.target.value })}
          value={entry.body}
        />
      ) : (
        <p
          className={`border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] px-3 py-2 text-xs-plus leading-relaxed text-muted-foreground ${entry.kind === "copy" ? "font-serif" : ""}`}
        >
          {entry.body || "Empty — click Edit to write."}
        </p>
      )}
    </div>
  );
}

function JournalSection(): React.JSX.Element {
  const project = useProject();
  return (
    <Section
      action={
        <div className="flex gap-1.5">
          <Button
            onClick={() => addJournalEntry("copy", "Untitled copy", "")}
            size="sm"
            type="button"
            variant="outline"
          >
            + Copy
          </Button>
          <Button
            onClick={() => addJournalEntry("journal", "Untitled note", "")}
            size="sm"
            type="button"
            variant="outline"
          >
            + Journal
          </Button>
        </div>
      }
      subtitle="Reusable captions and longer notes, in one readable place."
      title="Copy & journal"
    >
      {project.journal.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          Nothing yet — add a copy block or a journal note.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {project.journal.map((entry) => (
            <JournalCard entry={entry} key={entry.id} />
          ))}
        </div>
      )}
    </Section>
  );
}

export function BrandScreen(): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[880px] flex-col gap-8 px-6 py-6">
        <LinksSection />
        <ColorsSection />
        <FontsSection />
        <LogosSection />
        <JournalSection />
      </div>
    </div>
  );
}
