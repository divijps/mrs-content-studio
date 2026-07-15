import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  CalendarBlankIcon,
  DiamondsFourIcon,
  EnvelopeSimpleIcon,
  ImagesIcon,
  KanbanIcon,
  PaintBrushIcon,
  TextTIcon,
  type Icon,
} from "@phosphor-icons/react";

import { Toaster } from "@/toolcraft/ui";

import { MRS_LOGO_URLS } from "../data/brand-kit";
import { CommandPalette } from "../search/command-palette";
import { AccountMenu } from "./account-menu";
import { GlobalSearch } from "./global-search";
import { UploadPanel } from "./upload-panel";
import { WelcomeDialog } from "./welcome-dialog";
import { getProjectSnapshot, initializeSettings, setBrand } from "../data/project-store";
import { getWhiteLogoBrand } from "../studio/logo-white";

const SURFACES: readonly { icon: Icon; label: string; path: string }[] = [
  { icon: ImagesIcon, label: "Library", path: "/library" },
  { icon: PaintBrushIcon, label: "Studio", path: "/" },
  { icon: CalendarBlankIcon, label: "Planner", path: "/planner" },
  { icon: EnvelopeSimpleIcon, label: "Email", path: "/email" },
  { icon: TextTIcon, label: "Copy", path: "/copy" },
  { icon: DiamondsFourIcon, label: "Brand", path: "/brand" },
  { icon: KanbanIcon, label: "Tasks", path: "/tasks" },
] as const;

/**
 * Focused nav tab: the active surface shows icon + name highlighted; every
 * other surface collapses to just its icon and expands its name on hover, so
 * the bar stays quiet while you work.
 */
function SurfaceTab(props: {
  active: boolean;
  badge?: number;
  icon: Icon;
  label: string;
  path: string;
}): React.JSX.Element {
  const IconGlyph = props.icon;
  return (
    <Link
      className={
        "group inline-flex h-7 shrink-0 items-center rounded-lg px-2 text-xs leading-[0.875rem] transition-colors " +
        (props.active
          ? "bg-[color:var(--surface-active)] text-foreground ds-hairline"
          : "text-muted-foreground hover:bg-[color:var(--surface-inactive)] hover:text-foreground")
      }
      title={props.label}
      to={props.path}
    >
      <IconGlyph size={15} weight={props.active ? "fill" : "regular"} />
      <span
        className={
          "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin-left] duration-200 " +
          (props.active
            ? "ml-1.5 max-w-24 opacity-100"
            : "ml-0 max-w-0 opacity-0 group-hover:ml-1.5 group-hover:max-w-24 group-hover:opacity-100")
        }
      >
        {props.label}
      </span>
      {props.badge ? (
        <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[color:var(--text-muted)]">
          {props.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell(props: { children: React.ReactNode }): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Normalize brand marks once at startup: white, tight-cropped artwork.
  // Also restore the saved display name (identity for comments/notifications).
  React.useEffect(() => {
    initializeSettings();
    let cancelled = false;
    void getWhiteLogoBrand(getProjectSnapshot().brand).then((brand) => {
      if (!cancelled) {
        setBrand(brand);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = SURFACES.map((surface) => (
    <SurfaceTab
      active={surface.path === "/" ? pathname === "/" : pathname.startsWith(surface.path)}
      icon={surface.icon}
      key={surface.path}
      label={surface.label}
      path={surface.path}
    />
  ));

  return (
    <div className="dialkit-skin flex h-dvh min-h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border">
        <div className="flex h-11 items-center gap-3 px-3">
          <img
            alt="Mrs"
            className="h-4 w-4 shrink-0 select-none invert"
            draggable={false}
            src={MRS_LOGO_URLS.motif}
          />
          {/* Desktop: tabs inline. Mobile: tabs move to the scrollable row below. */}
          <nav aria-label="Surfaces" className="hidden items-center gap-0.5 sm:flex">
            {tabs}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <GlobalSearch />
            <AccountMenu />
          </div>
        </div>
        <nav
          aria-label="Surfaces"
          className="no-scrollbar flex items-center gap-1 overflow-x-auto px-3 pb-2 sm:hidden"
        >
          {tabs}
        </nav>
      </header>
      <main className="min-h-0 flex-1">{props.children}</main>
      <CommandPalette />
      <WelcomeDialog />
      <UploadPanel />
      <Toaster position="bottom-center" theme="dark" />
    </div>
  );
}
