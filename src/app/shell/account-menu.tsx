import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@/toolcraft/ui";

import { signOut } from "../auth/auth-gate";
import { isSupabaseConfigured } from "../data/backend/config";
import { mentions } from "../library/mentions";
import { setDisplayName, useProject } from "../data/project-store";
import { PersonAvatar } from "../ui/avatar";

/**
 * Account menu (top-right). Identity, workspace status, and session actions
 * behind the teammate's gradient portrait. Notifications collapsed to one
 * action (2026-07-15, per Divij): the dot stays as the ambient signal, and the
 * menu offers a single button into the Tasks board — the one place that
 * gathers everything waiting on you.
 */
export function AccountMenu(): React.JSX.Element {
  const project = useProject();
  const navigate = useNavigate();
  const [editingName, setEditingName] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  const name = project.settings.displayName;

  // Open review notes across the library — the count behind the dot and the
  // Tasks button. Mentions of the current user turn the dot red.
  const { mentionCount, totalOpen } = React.useMemo(() => {
    let total = 0;
    let mentioned = 0;
    for (const asset of project.assets) {
      for (const comment of asset.comments) {
        if (comment.resolved) continue;
        total += 1;
        if (mentions(comment.text, name)) mentioned += 1;
      }
    }
    return { mentionCount: mentioned, totalOpen: total };
  }, [project.assets, name]);

  const workspaceLine =
    project.source === "cloud"
      ? (project.folderName ?? "Team workspace")
      : "Demo project — data stays in this browser";

  const saveName = (): void => {
    const trimmed = draftName.trim();
    if (trimmed) {
      setDisplayName(trimmed);
    }
    setEditingName(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Account and notifications"
            className="relative flex items-center rounded-full outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent"
            type="button"
          />
        }
      >
        <PersonAvatar name={name ?? "You"} size={24} />
        {totalOpen > 0 ? (
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${mentionCount > 0 ? "bg-[#e0564a]" : "bg-[#e5b452]"}`}
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5">
            <PersonAvatar name={name ?? "You"} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-xs-plus text-foreground">
                {name ?? "Unnamed teammate"}
              </span>
              <span className="block truncate text-2xs font-normal text-muted-foreground">
                {workspaceLine}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {editingName ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <Input
              autoFocus
              className="h-7 flex-1 text-xs-plus"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                }
                if (event.key === "Escape") {
                  setEditingName(false);
                }
                event.stopPropagation();
              }}
              placeholder="Your name"
              value={draftName}
            />
            <Button onClick={saveName} size="sm" type="button">
              Save
            </Button>
          </div>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => {
                setDraftName(name ?? "");
                setEditingName(true);
              }}
            >
              {name ? "Change display name" : "Set your name"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        {totalOpen > 0 ? (
          <div className="px-2 py-1.5">
            <button
              className="flex h-9 w-full items-center justify-center rounded-lg bg-[color:var(--accent)] text-xs-plus font-medium text-[color:var(--accent-foreground)] transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
              onClick={() => void navigate({ to: "/tasks" })}
              type="button"
            >
              {totalOpen} to look at in Tasks
            </button>
          </div>
        ) : (
          <div className="px-2 py-1.5 text-2xs text-muted-foreground">
            All clear — nothing waiting on you.
          </div>
        )}
        {isSupabaseConfigured ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
