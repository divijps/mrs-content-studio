import * as React from "react";

/**
 * Full-surface loading state while the team workspace streams in. Grey boxes
 * only — the demo seed used to flash here before the cloud snapshot replaced
 * it, which read as someone else's content. Generic enough to stand in for
 * any surface: a toolbar row up top, a media grid below, pulsing gently with
 * a light stagger (opacity only — nothing moves).
 */
export function HydrationSkeleton(): React.JSX.Element {
  const box =
    "animate-pulse rounded-xl bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)]";
  return (
    <div aria-busy className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4">
      <div className="flex items-center gap-2">
        <div className={`${box} h-8 w-40`} />
        <div className={`${box} h-8 w-24`} />
        <div className={`${box} ml-auto h-8 w-28`} />
      </div>
      <div className="grid flex-1 grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            className={`${box} aspect-[4/5]`}
            key={index}
            style={{ animationDelay: `${index * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
