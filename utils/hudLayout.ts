/** Shared HUD spacing rules for the driving screen. */
export const HUD_MIRROR_GUTTER = 24;
export const FIRST_PERSON_CLUSTER_WIDTH = 422;

/** Outer width of a side mirror at this viewport, matching the CSS frame. */
export function sideMirrorOuterWidth(viewportWidth: number): number {
  return Math.min(440, Math.max(280, viewportWidth * 0.28));
}

/** Space between the two side-mirror slots, excluding their screen gutters. */
export function betweenMirrorsWidth(viewportWidth: number): number {
  return Math.max(0, viewportWidth - 2 * (sideMirrorOuterWidth(viewportWidth) + HUD_MIRROR_GUTTER));
}

/** Fit the fixed-width instrument cluster into the mirror gap. */
export function firstPersonClusterScale(viewportWidth: number): number {
  return Math.max(0.40, Math.min(0.89, betweenMirrorsWidth(viewportWidth) / 440));
}

export function firstPersonClusterWidth(viewportWidth: number): number {
  return FIRST_PERSON_CLUSTER_WIDTH * firstPersonClusterScale(viewportWidth);
}

export function firstPersonClusterFits(viewportWidth: number): boolean {
  return firstPersonClusterWidth(viewportWidth) <= betweenMirrorsWidth(viewportWidth);
}
