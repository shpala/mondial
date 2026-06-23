// Display-layer provenance: distinguishing scores a user can trust as real from
// illustrative ones the app fabricated when the live feed is unreachable.
//
// In sample mode (the openfootball spine is down — see `getDataStatus`) fixtures
// come from the bundled snapshot, whose finished games carry invented scorelines.
// Those must NOT wear the emerald "real result" badge. The one exception: even in
// sample mode the facade still overlays genuine ESPN live/final scores onto
// matching snapshot fixtures, flagging them `liveOverlaid` — those ARE real.
//
// Pure and side-effect-free, so it runs in server and client components alike.

import type { Fixture } from "@/lib/types";

/**
 * True when this fixture's *result* is a fabricated snapshot score rather than a
 * real one — i.e. we are in sample mode, the match is finished, and its score did
 * not come from the ESPN overlay. Scoped to finished results (the definitive
 * "looks like a real result" case); inferred-live snapshot states are transient
 * and already read as provisional.
 */
export function isFabricatedResult(
  fixture: Pick<Fixture, "status" | "liveOverlaid">,
  usingSample: boolean,
): boolean {
  return usingSample && fixture.status === "finished" && !fixture.liveOverlaid;
}
