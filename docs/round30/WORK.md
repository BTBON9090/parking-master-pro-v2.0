实施时记录，最终状态以 RELEASE.md 与 VALIDATION.md 为准。

# 0.25 development — latest request 2026-10-28
Not a completion report. Keep final verification separate.
- Implemented, awaiting integration QA: residual collision velocity brake impulse; 44px touch pedal; 48-division speed-zoom/panning steering ruler; faster return; combined traction corner launch budget; moderate turn-in correction; transient sprung load rollover; wider lamps; coach 12.245m config; new dense exam layout + scoring engine/panel + manual signals/wiper input.
- Implemented; verification and publishing still pending: exam terrain rendering/corridor scoring/wiper visual; highway traffic map; expanded city/mountain ring; distinct harsh terrain and snow; eight new vehicle configs and Blender assets (trike, tractor, 18-wheel articulated semi, Cybertruck, Revuelto, Veyron, V800, Cooper S), coach rebuild; all regression and actual UI; release 0.25 builds/push/COS.
- Baseline full foot brake alone was already ~40m from 100km/h for SUVs, 54m coach. Actual bug: collision recovery overwrote already-braked velocity each frame. Do not inflate braking unrealistically.
- Published specs vs simulation calibration must remain explicit. V800 primary config https://hima.auto/zunjie/v800/configuration/ valid current model. Coach reference https://dk.yutong.com/products/T12-param.shtml .
