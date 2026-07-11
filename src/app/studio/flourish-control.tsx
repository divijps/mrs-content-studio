import * as React from "react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { Button } from "@/toolcraft/ui";

/**
 * Flourish — the one-tap swash treatment.
 *
 * Renders the heading's words as toggle chips. A tapped word is set in Romie
 * italic with the swash/ss05 alternates in the comp; what used to be
 * "switch font to italic, dig out the OpenType panel, enable swashes" is one tap.
 *
 * Custom control (documented builtInFitCheck): the value model is a per-word
 * character-range selection inside sibling text, which no built-in expresses.
 */
export const FlourishControl: ToolcraftCustomControlRenderer = ({
  setValue,
  state,
  value,
}) => {
  const headingText =
    typeof state.values["heading.text"] === "string"
      ? (state.values["heading.text"] as string)
      : "";
  const flourished = Array.isArray(value)
    ? (value as unknown[]).filter((entry): entry is number => typeof entry === "number")
    : [];
  // Mirror the comp: Italic style renders without the swash/alternate glyphs.
  const swashes = state.values["heading.flourishStyle"] !== "italic";

  const words = headingText.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        Write a heading first, then tap words to flourish them.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {words.map((word, index) => {
        const active = flourished.includes(index);
        return (
          <Button
            aria-pressed={active}
            data-flourish-word={index}
            key={`${word}-${index}`}
            onClick={() => {
              const next = active
                ? flourished.filter((entry) => entry !== index)
                : [...flourished, index].sort((a, b) => a - b);
              setValue(next);
            }}
            size="sm"
            type="button"
            variant={active ? "secondary" : "ghost"}
          >
            <span
              style={
                active
                  ? {
                      fontFamily: "'Romie', Georgia, serif",
                      fontFeatureSettings: swashes
                        ? "'swsh' 1, 'ss05' 1, 'salt' 1"
                        : undefined,
                      fontStyle: "italic",
                    }
                  : undefined
              }
            >
              {word}
            </span>
          </Button>
        );
      })}
    </div>
  );
};
