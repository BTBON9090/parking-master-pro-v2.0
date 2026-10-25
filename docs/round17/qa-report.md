# Round 17 — collision damage and post-crash inspection

Date: 2026-10-25

## Implemented

- Removed the unconditional FOLLOW_FAR override during destruction/rollover. Disabling a vehicle selects an exterior view once; subsequent left dragging, orbit control and zoom remain available. App input and renderer agree on the effective camera mode, including crashes entered from HOOD.
- The recovery notice is a non-blocking status banner. Only the reset button intercepts pointer input. Destruction does not pause the simulation; opening settings still intentionally pauses it.
- Damage is classified by normal closing speed, so a fast shallow scrape is not automatically a severe collision. Gameplay thresholds: under 2 m/s none, 2–6 light, 6–17 moderate, at least 17 severe. These are simulation calibration, not real vehicle crashworthiness ratings. Repeated low-energy scrapes cannot trigger full disassembly merely by accumulating damage percentage.
- Light damage detaches nearby authored lamp/indicator/mirror-glass islands. Medium damage detaches up to four nearby trim/glass islands and dents only the impacted shell area; wheels remain attached and the complete car retains the existing rebound/slide/yaw response.
- Runtime geometry is cloned on first damage, never written into the shared GLB cache. Reset restores original geometry. The collision footprint refreshes after deformation and ignores unused detached vertices.
- Severe damage clips the actual authored shell into up to twelve compact pieces and releases four complete wheels. Every shell piece and wheel inherits pre-impact linear velocity plus the angular contribution at its centre. Terrain/scenery contacts then determine rebound and sliding. The pre-existing clothed articulated crash-test driver remains.
- Removed the 18-second simulation cutoff. Fragments settle and sleep naturally; newly awakened pieces continue simulating. Fixed substeps, bounded fragment counts, spatial broadphase and sleeping keep the simulation bounded.
- Camera follows the shell debris centre. Debris still collides with solid walls and nearby parked vehicles; forward inheritance does not allow it to pass through a wall.

## Verification

- `npm test`: all suites passed (full output in test-output.txt).
- After the final broadphase/sleep optimization: crashDebris and vehicleDamage suites rerun and passed.
- `npm run typecheck` and `npm run build`: passed. Existing bundle-size warning remains.
- Actual GLBs for all five available cars: light detachment, local moderate deformation, unchanged wheels/opposite panels, geometry restoration and disposal passed. Medium test dents measured approximately 0.195–0.214 m at 10 m/s normal closing speed. See damage-regression.json.
- Free-flight severe breakup tested at 30/60/120 Hz. Every shell fragment and tyre moves at least 8 m forward in its first second with 20 m/s incoming velocity. Bodies remain finite and above terrain. See crash-simulation.json.
- Rigid-wall test: inherited launch velocity retained, no pieces tunnel through wall; after 22 seconds, explicitly waking a resting fragment still advances its pose.
- Camera regression: destroyed HOOD routes drag to orbit; manual orbit takes precedence over destruction/rollover fallback.

## Independent game checks

- Reproduced original defect: HOOD crash followed by left dragging left the view unchanged.
- Tai7, normal gameplay controls, city map: low-speed collision with a parked car produces light damage at 4%; full vehicle remains together (light-damage.png).
- Tai7, factory approach: collision at 59.1 km/h normal speed produces moderate damage, a dented bonnet/nose and missing light parts. Body remains whole. Collision telemetry reported 7.3 km/h residual motion and 0.93 rad/s yaw; vehicle translated and rotated away from impact (moderate-damage.png).
- Severe factory collision: shell and wheels separate; early and settled images show movement after the banner appears (crash-motion-early.png, crash-motion-settled.png).
- Left drag after destruction changes to free orbit and rotates the scene; scroll zoom works. Repeated dragging after settling works (severe-inspection.png).
- Recovery button removes wreck/damage and restores the complete car at spawn; another drive/collision succeeds.
- Final clean browser reload, launch, severe collision and orbit check completed with no new browser errors. During intermediate hot-editing there was a transient missing-callback error while the new canvas and old App were briefly mixed; it was absent after the complete update/reload.
- Game left running at http://127.0.0.1:3000/ in crash inspection mode, with reset available.

## Scope and limits

This is a bounded game damage simulation, not finite-element or soft-body crash analysis. Small parts come from existing mesh islands; shell breakup uses clipped regions rather than model-specific authored fracture seams. Solid-wall frontal impacts naturally keep much debris near the wall or redirect it laterally/backwards; unobstructed momentum is separately verified. Free orbit can still be visually occluded by a nearby building when rotated behind it. No Blender asset editing or polygon increase was needed for this runtime physics/interaction change.
