import * as React from "react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { Button } from "@/toolcraft/ui";

import type { FlourishStyle } from "./comp-layout";

const STYLE_OPTIONS: { label: string; value: FlourishStyle }[] = [
  { label: "Swash", value: "swash" },
  { label: "First", value: "swash-first" },
  { label: "Last", value: "swash-last" },
  { label: "Italic", value: "italic" },
];

/** Romie's swashes ship via ss01 in this font build (see comp-svg.ts). */
const SWASH: React.CSSProperties = { fontFeatureSettings: "'ss01' 1" };

/** Preview a word with the swash glyphs the style rides on the end letters. */
function preview(word: string, style: FlourishStyle): React.ReactNode {
  if (style === "italic" || word.length === 0) {
    return word;
  }
  if (word.length === 1) {
    return <span style={SWASH}>{word}</span>;
  }
  if (style === "swash-first") {
    return (
      <>
        <span style={SWASH}>{word[0]}</span>
        {word.slice(1)}
      </>
    );
  }
  if (style === "swash-last") {
    return (
      <>
        {word.slice(0, -1)}
        <span style={SWASH}>{word.slice(-1)}</span>
      </>
    );
  }
  return (
    <>
      <span style={SWASH}>{word[0]}</span>
      {word.slice(1, -1)}
      <span style={SWASH}>{word.slice(-1)}</span>
    </>
  );
}

/**
 * Flourish — the one-tap swash treatment, now per word.
 *
 * Tap a heading word to flourish it (Romie italic) using the heading's default
 * style. Each flourished word then gets its own style row below, so one
 * headline can mix (e.g.) a both-ends swash on one word and a terminal-only on
 * another — the flexibility the single style toggle lacked.
 *
 * Custom control (documented builtInFitCheck): the value model is a per-word
 * character-range selection PLUS a per-word style map across sibling targets,
 * which no built-in expresses.
 */
export const FlourishControl: ToolcraftCustomControlRenderer = ({
  dispatch,
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
  const defaultStyle = (
    typeof state.values["heading.flourishStyle"] === "string"
      ? state.values["heading.flourishStyle"]
      : "swash"
  ) as FlourishStyle;
  const styles = (state.values["heading.flourishStyles"] ?? {}) as Record<
    number,
    FlourishStyle
  >;
  const styleFor = (index: number): FlourishStyle => styles[index] ?? defaultStyle;

  const words = headingText.split(/\s+/).filter(Boolean);

  const setStyles = (next: Record<number, FlourishStyle>): void => {
    dispatch({
      history: "merge",
      historyGroup: "flourish-styles",
      target: "heading.flourishStyles",
      type: "controls.setValue",
      value: next,
    });
  };

  const toggleWord = (index: number): void => {
    if (flourished.includes(index)) {
      setValue(flourished.filter((entry) => entry !== index));
      // Drop any per-word override when a word stops being flourished.
      if (index in styles) {
        const next = { ...styles };
        delete next[index];
        setStyles(next);
      }
    } else {
      setValue([...flourished, index].sort((a, b) => a - b));
    }
  };

  const setWordStyle = (index: number, style: FlourishStyle): void => {
    const next = { ...styles };
    // Matching the default = track the default (so changing the default later
    // still moves this word); otherwise store the explicit override.
    if (style === defaultStyle) {
      delete next[index];
    } else {
      next[index] = style;
    }
    setStyles(next);
  };

  if (words.length === 0) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        Write a heading first, then tap words to flourish them.
      </p>
    );
  }

  const flourishedInOrder = flourished
    .filter((index) => index < words.length)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {words.map((word, index) => {
          const active = flourished.includes(index);
          return (
            <Button
              aria-pressed={active}
              data-flourish-word={index}
              key={`${word}-${index}`}
              onClick={() => toggleWord(index)}
              size="sm"
              type="button"
              variant={active ? "secondary" : "ghost"}
            >
              <span
                style={
                  active
                    ? { fontFamily: "'Romie', Georgia, serif", fontStyle: "italic" }
                    : undefined
                }
              >
                {active ? preview(word, styleFor(index)) : word}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Per-word style — one row per flourished word, defaulting to the
          heading default until changed. */}
      {flourishedInOrder.map((index) => (
        <div className="flex items-center gap-2" key={`style-${index}`}>
          <span className="w-16 shrink-0 truncate text-2xs text-muted-foreground">
            {words[index]}
          </span>
          <div className="flex min-w-0 flex-1 gap-1">
            {STYLE_OPTIONS.map((option) => (
              <button
                className="ds-seg !px-1.5 flex-1 text-2xs"
                data-active={styleFor(index) === option.value}
                key={option.value}
                onClick={() => setWordStyle(index, option.value)}
                title={`${words[index]}: ${option.label}`}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
