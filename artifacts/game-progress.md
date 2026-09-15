# Mushroom Grand Prix

## Current revision — scheme three complete

Added six daily challenge templates, deterministic Beijing-day rotation of three, race-finish XP and three cosmetic tiers at100/300/600. Shared progression rules support guest local persistence and SQLite account state, with atomic/idempotent finish settlement, old-data migration, start-day synchronization and equipment authorization. Gameplay records actual orange-or-higher releases, every coin pickup, both rescue paths and shortcut exits. Growth dialog pauses inputs, fits desktop/mobile, equips player-only paint, violet boost particles and title visible on player label/leaderboard. Previous mode/ghost/route gameplay retained. Evidence artifacts/progression-v1/README.md:60 deterministic groups,20 backend groups,8 real game browser groups,4 real API browser groups and2 boost effect checks. Real keyboard three-lap run47.067s,54 pickups,0rescues,200XP. Old far-rescue QA fixture was invalidated by the new shortcut and moved truly off-course; game rescue rules unchanged. Worker runs hit usage limit; lead completed integration and checks directly. Real OAuth/Alibaba deployment and physical mobile/gamepad verification remain pending.

## Previous revision — scheme two complete

Time trial has no AI/random items, retaining coins, drift, boosts and both shortcut hazards. Added fixed-rate local best ghost recording with strict schema/storage validation, interpolation, pause/reset, display toggle and no collision. Twelve quarter-lap splits compare against the previous best; a slower or incomplete run preserves it. SQLite safely migrates old rows to grand-prix and isolates time-trial tickets, stats and leaderboards. Current evidence: artifacts/time-trial-v1/README.md. Production build and 52 deterministic checks pass; 15 backend groups and 9 real-API browser groups pass. Real keyboard races complete three laps in 47.166s and 49.500s, preserving 945 frames from the faster run; mobile layout and return to grand-prix verified. Real OAuth/Alibaba deployment and physical mobile/gamepad remain pending; ghost is device-local.

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

## Requested interaction repair — in verification
User reports missing guardrail collisions and unresponsive question boxes, asks to self-audit related interactions. Baselines reproduced: KartDriving crosses z=110 wall to z=121.15; touching item box has no roulette, and holding an item ignores subsequent boxes. Implemented shared capsule sweep for karts and shells, visual rail/collider alignment, nearby trunk/post proxies, collision impact feedback, double-slot simulation-time inventory/roulette, shatter/respawn, hit spin/bounce and brief immunity, racer separation, road-following red shells, max-preserving boost pads. Independent review caught shell launch offset tunnelling and birth-path sweep now handles it. Unit checks pass; production browser verification is in progress. Current evidence folder: artifacts/interactions-v3.

Interaction repair complete: production build, 27 deterministic checks (10 driving + 8 collisions + 9 inventory), 15 browser interaction checks and 17 full-race regression checks pass. Full real-input three-lap race: 50.600 seconds, first place. Point-blank shell launch sweep verified against actual visible rail. New frame-synchronized browser setup prevents stale diagnostics from the previous test. Final render-only rail simplification saves 73,728 triangles; desktop/mobile captures updated and evidence checker passes. Current detailed report: artifacts/interactions-v3/README.md; final-evidence.md links the current revision and marks prior handling-v2 metrics as historical. Residual limitations: local arcade simulation, no physical mobile/gamepad verification, existing mobile geometry budget exceeded.

## Continuity repair — in verification
User reports rivals vanishing after overtakes and player unexpectedly snapping back to track. Both reproduced: rear depth [-23,-3] forced opponent mesh.visible=false; missed-gate condition and 24m/1.2s recovery reset cars even on road or on a recoverable detour. Removed rear-depth hide. Checkpoint corridor now 24m, kept ordered scoring; missed gates only report a warning. Auto rescue requires >60m true off-course distance for 3 seconds, includes countdown, and cancels when returning. Added six deterministic continuity cases and browser front/rear threshold sweep, rear-view and road/grass/rescue fixtures. Browser verification in progress; output artifacts/continuity-v4.

Continuity targeted checks pass: 6 new unit cases, prior 27 unit cases, and 5 browser groups including all 32 overtake positions, rear-view, on-road/grass no-reset, and announced far-off-track rescue. Screenshots visually checked. Full real-input race regression is running to validate the widened checkpoint corridor and decoupled rescue across three laps. Current report: artifacts/continuity-v4/README.md.

Continuity repair complete. All 33 deterministic unit checks, five focused browser groups (32 overtake positions), and 17 full-race regression checks pass with no browser errors. Actual input completes three laps in 50.317 seconds, first place; manual scoring and original collision/item behavior remain intact. Dedicated overtake rear-view capture avoids generic suite filename reuse. Current report: artifacts/continuity-v4/README.md. No remaining reproduced defect from this request; keep existing physical mobile/gamepad limitations.

## User accounts and cloud scores — implementation complete, credentials/deployment pending
User requests WeChat/Google login, durable server scores, top ten users and profile; Alibaba host to follow. Applied existing threejs-game-director skill; delegated isolated cloud UI and server tests. Lead owns server, contracts, game integration, deployment and final verification. Added Node22 built-in SQLite HTTP backend, opaque hashed sessions, OAuth state/browser binding and Google PKCE, server code exchange/userinfo, same-origin JSON writes, race tickets tied to sessions, validated/idempotent finishes, per-user best top10/stats. UI supports guest/dev/real-provider availability, account modal pauses gameplay and works fullscreen, upload retries, no QA score upload. Login starts independent accounts, no email-based merges. Docker Compose + Caddy and online backup script prepared; .env examples contain no secrets.
Validation: 10 server HTTP/SQLite groups, 8 real API browser groups, 10 UI mocked-API groups, all33 previous deterministic game checks and production build passed. Backup integrity_check=ok. Actual game screenshots and detailed evidence artifacts/cloud-v1/README.md; deployment/configuration requirements deploy/README.md. No real OAuth credentials or Alibaba host supplied; no Docker installed locally, so third-party and container/server deployment remain explicitly unverified. Browser-authoritative race means baseline validation only, not complete anti-cheat. Current local preview at localhost:5173 uses explicitly enabled dev login and /tmp/mario-cloud-preview.sqlite; default npm run dev uses data/development.sqlite with dev auth disabled unless configured.

## Scheme one — dual shortcuts and timed course hazards complete
Added routes.ts authored cubic branches: garden .10–.35,12m wide,30.60m shorter; workshop .60–.89,9m wide,34.96m shorter. Continuous branch projection uses original ordered gates, preserves free steering, road speed and safe recovery semantics. Main world removes conflicting old props/rails. course.ts provides8s vent cycle (3safe/2warning/3active) and swept relative moving-barrier contacts; main uses simulation clock, player damage, once-per-route-per-lap exit boosts, reset/pause and HUD/map/finish feedback. course-visuals.ts supplies batched road ribbons/signs, matching dynamic visuals; all new support posts have proxies and entrance moved to avoid main lanes. Rules version2 and new localbest key isolate old scores; frontend declares version and server rejects stale races.
Validation: original33 unit checks,10 new deterministic groups,10 focused browsergroups,12 backendgroups and productionbuild passed. Full17-group driving regression completed3laps49.367s first; final support-post changes rechecked by focused browser traversal and1000-point main-lane clearance. Reports artifacts/course-v1/README.md and browser.json. Optional old interaction-browser suite was rejected by automaticapproval dueusagequota; not executed or counted. No known reproduced blocker remains; physicalmobile/gamepad and realclouddeployment remainunverified. Localpreview localhost:5173.


## AI item combat — complete
Independent AI item inventories, swept real box pickups, four tactical effects, held rear defense with directional hit ordering, threat warnings, input-cancel protection and casual/standard settings implemented. Standard GP rules3, TT rules2, casual receipt/progression without standard leaderboard contribution. Build,80 deterministic checks,22 backend groups,10 focused combat browser groups,10 local HTTP/UI groups and two real-input three-lap races passed. Full evidence: artifacts/combat-v1/README.md. Physical mobile/gamepad, live OAuth and Alibaba deployment remain unverified.


## Second-round scheme two — trick combo complete
Four trick events,8s simulation-time combo and3xcap, collision/rescue interruptions with retained score, physical close-pass anti-repeat detection, clean shortcut qualification, separate per-mode/difficulty local bests and HUD/results integrated. Independent review fixed same-frame damage ordering and last-frame pass omission. Build and101 deterministic checks pass;10 focused browser groups,3 actual-input race groups (51.200s/520points),10 combat regression groups and3 production UI/storage groups pass. Evidence artifacts/tricks-v1/README.md. No new cloud score schema; local trick records only.


## Second-round scheme three — castle track and cup complete
Added tracks config +987.783m castle-night world, smooth12m bridge/physical parapets, preserved original mushroom. Two-stage6-driver cup with15/12/10/8/6/4 points, fixedcharacter/difficulty, snapshot-based stage order, tie breakers, intermission, retry rollback and podium. Root caches2scenes and swaps driving/map/fog; bridge-awareAI lanes; cup-only localrecords and explicit cloud/progression isolation. Build+121 deterministic checks+6focusedbrowsergroups+2productiongroups pass; actual keyboard6laps48.483s/61.450s,zerorescues,final110totalpoints andcorrecttie. Evidence artifacts/cup-v1/README.md. Realdevice/liveOAuth/Aliyun deployment remainunverified; newtrackfirstavailablevia cupsecondstation.

### 2026-09-14 原创竞速配乐

两首32小节赛道配乐已接入，最后一圈提速升调、暂停续播、切站/重赛/后台防叠音、提示音闪避与独立音量设置完成。预渲染MP3替代约10秒现场合成。构建、6组浏览器音频检查、3组生产检查、22项服务端检查通过；详见artifacts/audio-v1/README.md。

## 末位淘汰赛 — 完成

独立模式，30/50/70/90/110秒末位淘汰、5秒预警、末两名位置标记、无限圈有效赛程、AI/碰撞/投射物清理与退场、胜负/超车/本机最佳/重试完成。构建与134项规则检查、6组边界浏览器测试、110秒真实输入7圈实跑及生产登录30秒失败/云隔离检查通过。真实超车5次、0意外救援、AI道具23取13用；详见artifacts/elimination-v1/README.md。

## 赛车配置与试驾 — 完成

三种全开放驾驶配置、参考数值与取舍说明、20 秒真实试驾、暂停/重试/返回原模式、杯赛内配置锁定完成。配置偏好保存在本机，正式本机记录及幽灵按配置隔离；云 GP 规则4/TT规则3，数据库版本5保留历史并绑定开赛配置，榜单显示配置。构建、完整规则检查（134+8）、27项后端、4组边界浏览器与4组生产联调通过。三种真实键盘试驾各20秒、0救援；漂移型完整三圈47.117秒并成功保存12分段幽灵。详见 artifacts/loadouts-v1/README.md。未部署阿里云，未新增凭据要求。


## 技巧竞速（第四轮方案一）— 完成

增加同向近距尾流、两座可绕行低跳台、时机起跳/重力落地加速与120基础技巧分、三重蘑菇和超级喇叭；键盘/手柄/多指触屏接入，AI 同规则使用。跳台不改水平坐标，侧背面有碰撞，地面弹体按高度筛选；喇叭尊重护栏遮挡、救援和受击保护。云 GP5 / TT4 与本机各赛制新命名空间隔离旧成绩。
完整规则、28服务端、7场景浏览器、5输入、3模式切换、4生产联调通过；三种配置各实际三圈，均6次技巧、0救援；杯赛实际六圈46.650秒/62.667秒，0救援，正确清理跨赛道状态。独立复查的救援保护和AI侧壁路线两项问题已修复。构建通过，详细证据 artifacts/techniques-v1/README.md。真实OAuth、阿里云和实体手柄/手机仍未验证。用户授权完成后提交并推送远端master。
