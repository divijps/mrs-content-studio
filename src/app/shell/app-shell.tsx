import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Toaster } from "@/toolcraft/ui";

import { MRS_LOGO_URLS } from "../data/brand-kit";
import { AccountMenu } from "./account-menu";
import { GlobalSearch } from "./global-search";
import { WelcomeDialog } from "./welcome-dialog";
import {
  getProjectSnapshot,
  initializeSettings,
  setBrand,
  useProject,
} from "../data/project-store";
import { getWhiteLogoBrand } from "../studio/logo-white";

const SURFACES = [
  { label: "Library", path: "/library" },
  { label: "Studio", path: "/" },
  { label: "Planner", path: "/planner" },
  { label: "Queue", path: "/queue" },
  { label: "Copy", path: "/copy" },
  { label: "Brand", path: "/brand" },
  { label: "Tasks", path: "/tasks" },
] as const;

function SurfaceTab(props: {
  active: boolean;
  badge?: number;
  label: string;
  path: string;
}): React.JSX.Element {
  return (
    <Link
      className={
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs leading-[0.875rem] transition-colors " +
        (props.active
          ? "bg-[color:var(--surface-active)] text-foreground ds-hairline"
          : "text-muted-foreground hover:text-foreground")
      }
      to={props.path}
    >
      {props.label}
      {props.badge ? (
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--text-muted)]">
          {props.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell(props: { children: React.ReactNode }): React.JSX.Element {
  const project = useProject();
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
      badge={surface.path === "/queue" ? project.queue.length : undefined}
      key={surface.path}
      label={surface.label}
      path={surface.path}
    />
  ));

  return (
    <div className="flex h-dvh min-h-dvh flex-col bg-background text-foreground">
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
      <WelcomeDialog />
      <Toaster position="bottom-center" theme="dark" />
    </div>
  );
}
