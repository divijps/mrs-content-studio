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
export function copyLibraryShareLink(kind: "asset" | "board", id: string): void {
  const url = `${window.location.origin}/library?${kind}=${encodeURIComponent(id)}`;
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
