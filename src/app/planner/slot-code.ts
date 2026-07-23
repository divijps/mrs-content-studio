import { assetCode, stableNumber } from "../library/asset-code";
import type { Asset, Collection, PlannerChannel, PlannerGridSlot } from "../data/types";

/**
 * A short, human-friendly POST code — the automated naming system for planned
 * posts wherever they appear as components (calendar chips, agenda rows, the
 * pop-up headline). No new fields, nothing to type:
 *  · a post whose cover is a Library asset borrows the ASSET's own code
 *    (`SOL 106`) — the same name identifies the same content in the Library,
 *    the planner, and the calendar;
 *  · comps and placeholders get a channel-prefixed code (`FG 412`) whose
 *    number derives from the slot id, so it never changes across sessions.
 */

const CHANNEL_PREFIX: Record<PlannerChannel, string> = {
  grid: "FG",
  pinterest: "PIN",
  reel: "RL",
  story: "ST",
  tiktok: "TT",
};

export function slotCode(
  slot: Pick<PlannerGridSlot, "assetId" | "id">,
  channel: PlannerChannel,
  assets: readonly Asset[],
  collections: Collection[],
): string {
  if (slot.assetId) {
    const asset = assets.find((candidate) => candidate.id === slot.assetId);
    if (asset) return assetCode(asset, collections);
  }
  return `${CHANNEL_PREFIX[channel]} ${stableNumber(slot.id)}`;
}
