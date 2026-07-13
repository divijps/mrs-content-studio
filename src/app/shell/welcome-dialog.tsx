import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/toolcraft/ui";

import { setDisplayName, useProject } from "../data/project-store";

const WELCOMED_KEY = "mrs-studio.welcomed:v1";

const STEPS: { body: string; title: string }[] = [
  { body: "Import and organize your shoot into boards — tag, favorite, and review.", title: "Library" },
  { body: "Drop a photo into an on-brand layout and add headlines, logos, and buttons.", title: "Studio" },
  { body: "Lay out your Instagram grid and stories to see the feed before you post.", title: "Planner" },
  { body: "Export any design to every platform size at once — right from the Studio panel.", title: "Export" },
];

/**
 * One-time welcome. Orients a first-time teammate across the four surfaces and
 * captures their name (so comments/mentions are attributed). Shows once per
 * browser; dismissing any way records that so it never nags.
 */
export function WelcomeDialog(): React.JSX.Element {
  const project = useProject();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    try {
      if (!window.localStorage.getItem(WELCOMED_KEY)) {
        setOpen(true);
      }
    } catch {
      // Private mode: skip onboarding rather than nag every load.
    }
  }, []);

  const dismiss = (): void => {
    try {
      window.localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const start = (): void => {
    if (name.trim() && !project.settings.displayName) {
      setDisplayName(name.trim());
    }
    dismiss();
    void navigate({ to: "/library" });
  };

  return (
    <Dialog onOpenChange={(next) => (next ? setOpen(true) : dismiss())} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Mrs Content Studio</DialogTitle>
          <DialogDescription>
            Everything the team needs to make on-brand content — in one place.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2.5">
          {STEPS.map((step, index) => (
            <li className="flex items-start gap-2.5" key={step.title}>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] text-2xs font-semibold">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xs-plus font-medium">{step.title}</span>
                <span className="block text-2xs text-muted-foreground">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>

        {project.settings.displayName ? null : (
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Your name
            </span>
            <Input
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  start();
                }
              }}
              placeholder="So teammates know who commented"
              value={name}
            />
          </div>
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button onClick={dismiss} type="button" variant="ghost">
                Skip
              </Button>
            }
          />
          <Button onClick={start} type="button">
            Get started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
