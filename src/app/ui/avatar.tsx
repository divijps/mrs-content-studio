import * as React from "react";

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

/**
 * Coloured-initials avatar for a teammate. One shared implementation so people
 * read the same across the Tasks board, assignment cards, and comment threads.
 */
export function PersonAvatar(props: { name: string; size?: number }): React.JSX.Element {
  const size = props.size ?? 20;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-normal text-white"
      style={{
        backgroundColor: `hsl(${personHue(props.name)} 32% 42%)`,
        fontSize: size * 0.44,
        height: size,
        width: size,
      }}
      title={props.name}
    >
      {personInitials(props.name)}
    </span>
  );
}
