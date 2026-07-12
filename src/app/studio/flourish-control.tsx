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
  // Mirror the comp: swash glyphs ride the end letters the style asks for.
  const flourishStyle =
    typeof state.values["heading.flourishStyle"] === "string"
      ? (state.values["heading.flourishStyle"] as string)
      : "swash";

  const words = headingText.split(/\s+/).filter(Boolean);

  // Romie's swashes ship via ss01 in this font build (see comp-svg.ts) — the
  // chip preview applies it to the same end letters the comp will.
  const swashStyle: React.CSSProperties = { fontFeatureSettings: "'ss01' 1" };
  const preview = (word: string): React.ReactNode => {
    if (flourishStyle === "italic" || word.length === 0) {
      return word;
    }
    if (word.length === 1) {
      return <span style={swashStyle}>{word}</span>;
    }
    if (flourishStyle === "swash-first") {
      return (
        <>
          <span style={swashStyle}>{word[0]}</span>
          {word.slice(1)}
        </>
      );
    }
    if (flourishStyle === "swash-last") {
      return (
        <>
          {word.slice(0, -1)}
          <span style={swashStyle}>{word.slice(-1)}</span>
        </>
      );
    }
    return (
      <>
        <span style={swashStyle}>{word[0]}</span>
        {word.slice(1, -1)}
        <span style={swashStyle}>{word.slice(-1)}</span>
      </>
    );
  };

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
                      fontStyle: "italic",
                    }
                  : undefined
              }
            >
              {active ? preview(word) : word}
            </span>
          </Button>
        );
      })}
    </div>
  );
};
