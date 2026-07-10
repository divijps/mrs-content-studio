import * as React from "react";

import type { Deck } from "./archetypes-deck";

const NAV_BUTTON_CLASS =
  "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_70%,transparent)] text-lg text-[color:color-mix(in_oklab,var(--foreground)_80%,transparent)] backdrop-blur transition-transform hover:text-[color:var(--foreground)] active:scale-90";

/**
 * Full-screen slide viewer, styled to match the Library asset lightbox
 * ([asset-detail.tsx]): dimmed blurred backdrop, a contained slide on a stage
 * with round prev/next arrows, a page counter, and a thumbnail filmstrip.
 * Arrow keys page through; Escape (or a backdrop click) closes.
 */
export function DeckViewer(props: {
  deck: Deck;
  initialIndex?: number;
  onClose: () => void;
}): React.JSX.Element {
  const { deck, onClose } = props;
  const slides = deck.slides;
  const [index, setIndex] = React.useState(
    Math.max(0, Math.min(slides.length - 1, props.initialIndex ?? 0)),
  );
  const hasPrev = index > 0;
  const hasNext = index < slides.length - 1;
  const current = slides[index];

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (event.key === "ArrowRight")
        setIndex((i) => Math.min(slides.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slides.length]);

  // Keep the active thumbnail scrolled into view as you page through.
  const stripRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${index}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [index]);

  if (!current) return <></>;

  const closeOnBackdrop = (event: React.MouseEvent): void => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-xl">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4">
        <span className="truncate text-xs-plus text-foreground">{deck.title}</span>
        <span className="hidden truncate text-2xs text-muted-foreground sm:block">
          {deck.subtitle}
        </span>
        <span className="ml-auto tabular-nums text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          {index + 1} / {slides.length}
        </span>
        <button
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-md text-base text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)] transition-transform hover:text-[color:var(--foreground)] active:scale-90"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>
      </div>

      {/* Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-4 md:p-8"
        onClick={closeOnBackdrop}
      >
        <img
          alt={`${deck.title} — slide ${index + 1}`}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
          draggable={false}
          key={current.page}
          src={current.src}
        />
        {hasPrev ? (
          <button
            aria-label="Previous slide"
            className={`${NAV_BUTTON_CLASS} left-2 md:left-4`}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            type="button"
          >
            ‹
          </button>
        ) : null}
        {hasNext ? (
          <button
            aria-label="Next slide"
            className={`${NAV_BUTTON_CLASS} right-2 md:right-4`}
            onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
            type="button"
          >
            ›
          </button>
        ) : null}
      </div>

      {/* Thumbnail filmstrip */}
      <div
        className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-t border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-3"
        ref={stripRef}
      >
        {slides.map((slide, i) => (
          <button
            aria-current={i === index}
            aria-label={`Slide ${i + 1}`}
            className={`relative aspect-video h-14 shrink-0 overflow-hidden rounded-md border transition-all ${
              i === index
                ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]"
                : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] opacity-55 hover:opacity-100"
            }`}
            data-idx={i}
            key={slide.page}
            onClick={() => setIndex(i)}
            type="button"
          >
            <img
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              src={slide.thumb}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
