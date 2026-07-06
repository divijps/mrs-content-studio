import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Avatar,
  AvatarFallback,
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
import {
  requestLibraryAsset,
  setDisplayName,
  useProject,
} from "../data/project-store";

interface Notification {
  assetId: string;
  assetName: string;
  author: string;
  count: number;
  latestAt: string;
}

function initialsOf(name: string | null): string {
  if (!name || !name.trim()) {
    return "?";
  }
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Account & notifications menu (top-right). Replaces the old plain-text
 * "Demo project · Set your name" chips: identity, workspace status, unresolved
 * review notes, and session actions live behind one avatar.
 */
export function AccountMenu(): React.JSX.Element {
  const project = useProject();
  const navigate = useNavigate();
  const [editingName, setEditingName] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  const name = project.settings.displayName;

  // Unresolved review notes, newest-first, grouped per asset.
  const notifications = React.useMemo<Notification[]>(() => {
    const items: Notification[] = [];
    for (const asset of project.assets) {
      const open = asset.comments.filter((comment) => !comment.resolved);
      if (open.length === 0) {
        continue;
      }
      const latest = open.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
      items.push({
        assetId: asset.id,
        assetName: asset.name,
        author: latest.author || "Someone",
        count: open.length,
        latestAt: latest.createdAt,
      });
    }
    return items.sort((a, b) => b.latestAt.localeCompare(a.latestAt)).slice(0, 5);
  }, [project.assets]);

  const totalOpen = notifications.reduce((sum, item) => sum + item.count, 0);

  const workspaceLine =
    project.source === "cloud"
      ? (project.folderName ?? "Team workspace")
      : "Demo project — data stays in this browser";

  const openNotification = (assetId: string): void => {
    requestLibraryAsset(assetId);
    void navigate({ to: "/library" });
  };

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
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[10px] font-semibold">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        {totalOpen > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#e5b452]" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-xs font-semibold">
                {initialsOf(name)}
              </AvatarFallback>
            </Avatar>
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Notifications{totalOpen > 0 ? ` (${totalOpen})` : ""}
          </DropdownMenuLabel>
          {notifications.length === 0 ? (
            <div className="px-2 pb-1.5 text-2xs text-muted-foreground">
              No unresolved notes — all clear.
            </div>
          ) : (
            notifications.map((item) => (
              <DropdownMenuItem
                key={item.assetId}
                onClick={() => openNotification(item.assetId)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs-plus">
                    {item.count} open note{item.count === 1 ? "" : "s"} ·{" "}
                    {item.assetName}
                  </span>
                  <span className="truncate text-2xs text-muted-foreground">
                    latest from {item.author}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
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
