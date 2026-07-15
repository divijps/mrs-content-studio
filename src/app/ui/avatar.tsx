import * as React from "react";

/**
 * Gradient portraits (brand/avatars/avatar-NN.webp, 160px squares) — each
 * teammate is dealt one by name hash so the pick is stable everywhere without
 * any stored assignment. Eager-imported so Vite bundles + fingerprints them.
 */
const AVATAR_MODULES = import.meta.glob("../../../brand/avatars/avatar-*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const AVATARS: readonly string[] = Object.entries(AVATAR_MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

/** Two-letter initials for a person's display name. */
export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Stable hue in [0, 360) derived from the name, so each teammate keeps a colour. */
export function personHue(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360;
  }
  return hash;
}

/** FNV-1a — spreads similar names across the portrait set better than the
 * additive hue hash, so small rosters rarely share a portrait. */
function personAvatarIndex(name: string, count: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % count;
}

/** The portrait dealt to this name, or null when none are bundled. */
export function personAvatarUrl(name: string): string | null {
  if (AVATARS.length === 0) {
    return null;
  }
  return AVATARS[personAvatarIndex(name, AVATARS.length)]!;
}

/**
 * Portrait avatar for a teammate. One shared implementation so people read
 * the same across the Tasks board, assignment cards, and comment threads.
 * The gradient stands alone (initials over the pale portraits are illegible
 * at 20px) — names accompany the avatar in every surface, plus the tooltip.
 * Initials-on-hue remains the fallback when no portraits are bundled.
 */
export function PersonAvatar(props: { name: string; size?: number }): React.JSX.Element {
  const size = props.size ?? 20;
  const url = personAvatarUrl(props.name);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-normal text-white"
      style={{
        backgroundColor: `hsl(${personHue(props.name)} 32% 42%)`,
        fontSize: size * 0.44,
        height: size,
        width: size,
      }}
      title={props.name}
    >
      {url ? (
        <img alt="" className="h-full w-full object-cover" draggable={false} src={url} />
      ) : (
        personInitials(props.name)
      )}
    </span>
  );
}
