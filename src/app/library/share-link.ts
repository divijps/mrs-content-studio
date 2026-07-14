import { toast } from "sonner";

/**
 * Copy a deep link to a Library asset or board onto the clipboard. The link
 * (`/library?asset=<id>` or `/library?board=<id>`) opens straight to that item.
 *
 * It's team-gated for free: the whole app sits behind the AuthGate on one
 * shared project, so the link resolves only for someone signed in as a
 * teammate — anyone else hits the sign-in screen first. The id is the stable
 * asset/collection id, so the link keeps working across sessions.
 */
function libraryShareUrl(kind: "asset" | "board", id: string): string {
  return `${window.location.origin}/library?${kind}=${encodeURIComponent(id)}`;
}

export function copyLibraryShareLink(kind: "asset" | "board", id: string): void {
  const url = libraryShareUrl(kind, id);
  const description = "Anyone on your team can open it.";
  const succeed = (): void => {
    toast.success("Link copied", { description });
  };
  const fallback = (): void => {
    // No async clipboard (or it was blocked) — surface the link to copy by hand.
    window.prompt("Copy this link:", url);
  };
  if (typeof navigator.clipboard?.writeText === "function") {
    navigator.clipboard.writeText(url).then(succeed).catch(fallback);
  } else {
    fallback();
  }
}

/**
 * Send a share link the best way for the device. On touch (iPad/iPhone) it
 * opens the native share sheet so the link can go straight to Messages, Mail,
 * or AirDrop — "sending" it. Everywhere else it copies the link. Either way the
 * link is team-gated by the AuthGate (see {@link copyLibraryShareLink}).
 */
export function shareLibraryLink(kind: "asset" | "board", id: string, title = "Mrs asset"): void {
  const url = libraryShareUrl(kind, id);
  if (navigator.maxTouchPoints > 0 && typeof navigator.share === "function") {
    navigator.share({ title, url }).catch((error: { name?: string }) => {
      // User dismissed the sheet — fine. Any real failure falls back to copy.
      if (error?.name !== "AbortError") {
        copyLibraryShareLink(kind, id);
      }
    });
    return;
  }
  copyLibraryShareLink(kind, id);
}
