import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Toaster } from "@/toolcraft/ui";

import { MRS_LOGO_URLS } from "../data/brand-kit";
import { AccountMenu } from "./account-menu";
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
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] leading-[1.125rem] transition-colors " +
        (props.active
          ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] text-[color:var(--foreground)]"
          : "text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)] hover:text-[color:var(--foreground)]")
      }
      to={props.path}
    >
      {props.label}
      {props.badge ? (
        <span className="font-mono text-[11px] tabular-nums text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
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

  return (
    <div className="flex h-dvh min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-3">
        <img
          alt="Mrs"
          className="h-4 w-4 shrink-0 select-none invert"
          draggable={false}
          src={MRS_LOGO_URLS.motif}
        />
        <nav aria-label="Surfaces" className="flex items-center gap-0.5">
          {SURFACES.map((surface) => (
            <SurfaceTab
              active={
                surface.path === "/"
                  ? pathname === "/"
                  : pathname.startsWith(surface.path)
              }
              badge={surface.path === "/queue" ? project.queue.length : undefined}
              key={surface.path}
              label={surface.label}
              path={surface.path}
            />
          ))}
        </nav>
        <div className="ml-auto flex items-center">
          <AccountMenu />
        </div>
      </header>
      <main className="min-h-0 flex-1">{props.children}</main>
      <WelcomeDialog />
      <Toaster position="bottom-center" theme="dark" />
    </div>
  );
}
