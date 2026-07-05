import * as React from "react";

import type { Asset } from "../data/types";
import { setAssetFocalPoint } from "../data/project-store";

/**
 * Click or drag on the image to set its focal point — the subject the app keeps
 * visible when cropping across aspect ratios. Critical for fashion (faces,
 * garment detail). Writes normalized 0..1 coordinates to the asset.
 */
export function FocalPointEditor(props: { asset: Asset }): React.JSX.Element {
  const { asset } = props;
  const ref = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const apply = React.useCallback(
    (clientX: number, clientY: number) => {
      const node = ref.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      setAssetFocalPoint(asset.id, Number(x.toFixed(3)), Number(y.toFixed(3)));
    },
    [asset.id],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
        Focal point
      </span>
      <div
        className="relative cursor-crosshair overflow-hidden rounded-md border border-border select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          apply(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging) {
            apply(event.clientX, event.clientY);
          }
        }}
        onPointerUp={() => setDragging(false)}
        ref={ref}
      >
        <img
          alt={asset.name}
          className="block max-h-[240px] w-full object-contain"
          draggable={false}
          src={asset.url}
        />
        <span
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{
            backgroundColor: "rgba(12,140,233,0.55)",
            left: `${asset.focalPoint.x * 100}%`,
            top: `${asset.focalPoint.y * 100}%`,
          }}
        />
      </div>
      <span className="text-2xs text-muted-foreground">
        Click the subject — crops for every format keep it in frame.
      </span>
    </div>
  );
}
