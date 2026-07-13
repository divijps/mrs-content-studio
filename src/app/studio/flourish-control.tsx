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
 * Flourish — the one-tap swash treatment.
 *
 * Tap a heading word to flourish it (Romie italic, full swash by default).
 * The one style control below adapts to the highlighted word, so different
 * words can carry different swash styles without a second, always-visible
 * menu. Tap the highlighted word again to remove its flourish.
 *
 * The full-swash default is internal (`heading.flourishStyle`), never a
 * surfaced control. Per-word overrides live in `heading.flourishStyles`.
 *
 * NOTE: custom controls are invoked as plain function calls inside
 * ControlsPanel (their hooks flatten into it), and this control only mounts
 * when Headline is the focused element — so it must NOT use React hooks.
 * The highlighted word lives in the runtime value `heading.flourishActive`
 * (transient UI focus, like `ui.selectedElement`), not React state.
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

  // Which flourished word the single style control edits. Explicit selection
  // (runtime value) wins; otherwise the most recently flourished word, so the
  // control always has a target when anything is flourished.
  const rawActive = state.values["heading.flourishActive"];
  const selected =
    typeof rawActive === "number" && flourished.includes(rawActive) ? rawActive : null;
  const activeWord =
    selected ?? (flourished.length > 0 ? Math.max(...flourished) : null);

  const setActive = (index: number | null): void => {
    dispatch({
      history: "skip", // UI focus, not a design edit
      target: "heading.flourishActive",
      type: "controls.setValue",
      value: index ?? -1,
    });
  };
  const setStyles = (next: Record<number, FlourishStyle>): void => {
    dispatch({
      history: "merge",
      historyGroup: "flourish-styles",
      target: "heading.flourishStyles",
      type: "controls.setValue",
      value: next,
    });
  };

  const tapWord = (index: number): void => {
    if (!flourished.includes(index)) {
      // Flourish it (full swash by default) and make it the active word.
      setValue([...flourished, index].sort((a, b) => a - b));
      setActive(index);
    } else if (index !== activeWord) {
      // Already flourished — highlight it so the style control targets it.
      setActive(index);
    } else {
      // Tapping the active word removes its flourish (and any override).
      setValue(flourished.filter((entry) => entry !== index));
      if (index in styles) {
        const next = { ...styles };
        delete next[index];
        setStyles(next);
      }
      setActive(null);
    }
  };

  const setActiveStyle = (style: FlourishStyle): void => {
    if (activeWord === null) {
      return;
    }
    const next = { ...styles };
    // Matching the default = track the default; else store the override.
    if (style === defaultStyle) {
      delete next[activeWord];
    } else {
      next[activeWord] = style;
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {words.map((word, index) => {
          const active = flourished.includes(index);
          const highlighted = index === activeWord;
          return (
            <Button
              aria-pressed={active}
              data-flourish-word={index}
              key={`${word}-${index}`}
              onClick={() => tapWord(index)}
              size="sm"
              type="button"
              variant={highlighted ? "secondary" : active ? "outline" : "ghost"}
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

      {/* One style control — it adapts to the highlighted word. */}
      {activeWord !== null ? (
        <div className="flex gap-1">
          {STYLE_OPTIONS.map((option) => (
            <button
              className="ds-seg flex-1"
              data-active={styleFor(activeWord) === option.value}
              key={option.value}
              onClick={() => setActiveStyle(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
