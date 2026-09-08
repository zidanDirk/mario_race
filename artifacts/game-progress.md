# Mushroom Grand Prix

Intent: Build a complete local Mario-inspired 3D arcade kart racer in Chinese. Three laps, six racers, keyboard and touch, restart and pause. No online multiplayer or paid services required.

Art direction: sunny toy-like Mushroom Kingdom, tarmac ribbon, red/white curbs, oversized spotted mushrooms, castle landmark, mint hills, soft clouds. Authored procedural models suit the lightweight stylized scope. UI: warm ivory, dark teal, racing red and yellow, condensed race numerals, crisp outlined controls.

## Design brief
Player promise: drift a red kart through a whimsical kingdom and outpace five rivals. Primary verb: steer and accelerate. Secondary verbs: charge/release drift boost, collect coins/items, use mushroom boost or shell. Every 5–30 seconds choose a racing line or pickup lane and time a boost. Across three laps learn corners and exploit boosts. Off-road travel loses speed; rivals create position pressure. Finishing gives placement and time, retry is immediate. Skilled players stay on tarmac and release charged drifts at corner exits.

## Core loop contract
Player steers and accelerates to finish three laps ahead of five AI racers, while corners, off-road slowdown and traffic create risk; coins and items reward good lines with speed and tactical advantages, and lower placement invites instant retry.

## Level plan
Single closed rolling circuit, approximately 800 world units. Start straight and pickup row before flowing bends. Course landmarks: mushroom grove, castle, hills and balloons. Wide recovery shoulder, continuous curb cues, chevrons at bends. AI pace increases slightly per lap. Camera shows upcoming curvature; compact minimap reveals full course.

## Technical contract
- world.ts owns track, environment and kart factory. Track uses normalized unbounded progress in game, wrapped only for samples.
- buildWorld(scene) returns { trackLength, sample(t, lateral=0): {position, tangent, normal}, curve, animated, pickups, boostPads }.
- pickups: { object: THREE.Object3D, t:number, lane:number, kind:'coin'|'item', cooldown:number }[]; pads {t,lane}[]; t normalized.
- createKart(color, character) returns THREE.Group, forward is +Z, ground contact y=0. Wheels in userData.wheels.
- main.ts owns fixed 60Hz arcade physics, controls, camera, race state and feedback. style.css owns UI.

Completed: world, six racers, fixed-step race, drift/pickups/audio/UI, production build, real-input full three-lap race (44.283s), pause/retry and touch checks, final desktop/mobile captures and evidence validation.

Corrections: curved shoulder folding fixed (min radius17.314), steering sign corrected to camera-right, flower triangles reduced and shadow flags preserved, trailing-kart camera occlusion handled.

Remaining constraints: single-player local game; mobile hardware performance not measured (171 draw calls in emulation). No blocking defects from final test suite. Final details: artifacts/final-evidence.md.

## Requested revision — faithful characters and handling
User supplied character reference strip; preserve existing six racers, rebuild identity/proportions and add front-view character selection. Read Nintendo official basic-controls page and MK8 manual for hop/drift/mini-turbo, brake/reverse, rocket start and shell distinctions. No original binary assets supplied; profile-aware probe confirms TRIPO/GEMINI/ELEVENLABS missing, so authored local 3D rebuild. No paid jobs submitted.

Driving change: free world-space nose/velocity steering (no centerline autopilot), speed-dependent turning, hop into latched drift, countersteer radius, blue/orange/purple charge/release, reverse and spin turn, timed rocket start/burnout, rear-view, physical shell travel, gamepad and touch parity. Road projection only for surfaces and ordered lap gates; recovery handles excursions. Current checkpoints every1/8lap prevent shortcuts. Workers: character_upgrade owns driver/kart factory; garage_ui owns selector/help module. Lead owns driving, integration and final input/motion QA.

Revision complete: six rebuilt selectable characters; free steering, hop/drift/countersteer and three-stage turbo, reverse/spin turn, timed rocket start, rear-view, physical distinct items, keyboard/touch/standard gamepad. Calibrated countersteer after actual bend testing; fixed fast item taps and Nintendo A/B positions. Production build passes, 10 physics checks + 17 browser checks + 6 simulated gamepad checks pass. Full real-input three-lap race: 47.650 seconds, first place; page/console errors zero. Final captures and limitations now in artifacts/final-evidence.md; evidence.json references handling-v2 only. Mobile render budget exceeded due to richer models; physical mobile performance and physical gamepad remain unverified.
