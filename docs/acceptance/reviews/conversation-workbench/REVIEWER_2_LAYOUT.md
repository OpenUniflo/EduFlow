# Reviewer 2 · Layout, UI and motion

Read-only reviewer; no application implementation or Hosted data writes. Initial HEAD implementation review and independent isolated Chromium browser on READY 67af2b8 Preview: https://edu-flow-ni7qa4s6b-july-nanas-projects.vercel.app.

## Findings before repair

- REAL DEFECT: Desktop Overview is visually aligned at y=80 but a full-width transparent course header intercepts native Summary click. Actual Playwright click timed out with `header.atlas-skill-course-island intercepts pointer events`. Requires blank-header pointer passthrough and retaining control pointer events.
- REAL DEFECT: 390×844 Overview y=172..216 overlaps Project toolbar y=176..224. Search and Adjust cover the disclosure and text. Evidence: `acceptance-a-project-narrow-overlap-before-fix.png`.
- BLOCKER: No further confirmed workbench blocker from source and inspected Fresh screenshots. Final UI approval remains pending real repair verification.
- IMPROVEMENT: None required beyond actual defects. The compact 44px textarea and removal of duplicate dialog entrance address prior optional review notes.
- OUT OF SCOPE: Route algorithms, Knowledge/Evidence authority, provider failures and historical Advisor warnings.

## Verified evidence so far

- Practice: independently visually inspected Fresh reviewer screenshots `../fresh-review/acceptance-a-practice-1366.png`, `acceptance-a-practice-1440.png`, `acceptance-a-practice-narrow-reduced.png` and 1366 geometry. Header/card/button language consistent, upload/formal submit/send visible, dock fixed. 1366 document height=768, scale=1, Timeline=390px/scrollHeight530, Context=530px/scrollHeight726, Composer607..747 and buttons699..735. Actual scrolling is being performed by sole-writer Fresh reviewer; reopening Practice would issue startAssignment, so this reviewer did not reopen it.
- Project1366: body1366×768, scale=1. Overview x423/y80/520×44, left x24/y80/215.64×50, right x1138/y89/204×32. Desktop no collision and strong centered strip, substantial upward movement from148px.
- Project1440 screenshot captured. Click stability pending pointer repair.
- Compact Assistant: actual open/close desktop and390 reduced; panel367.5px desktop, input44px, scoped Timeline cap220px, body scrollHeight768. All controls visible. Screenshots `acceptance-a-assistant-compact-1366.png`, `acceptance-a-assistant-compact-narrow-reduced.png`.
- Reduced motion Project: actual matchMedia=true and all23 directional pulses computed animationName=none; static relations/arrows retained. Narrow compact closes normally.
- Browser console: zero messages/errors on the read-only project/compact checks.

## Pending final verification

- Fresh repaired Preview native Overview click at1366/1440/390; before/open/closed graph dimensions, route coordinates and camera presentation stable.
- Capability Update desktop/narrow source folded/expanded, proposals, failed/success states via sole-writer Fresh screenshots and geometry.
- Final required report is not PASS until real defects are repaired and rechecked.

## b21989f repair verification

READY Preview https://edu-flow-4vahyexaj-july-nanas-projects.vercel.app. Actual native Summary clicks pass1366×768,1440×900,390×844 reduced, scale=1. Transparent Header interception and collapsed narrow overlap are repaired. Captured `acceptance-a-project-fixed-collapsed-*` and `expanded-*` screenshots. `overview-fixed-measurements.json` records before/open/closed: all23 route edge endpoints exactly equal, canvas dimensions exactly equal, Summary pointer hit=true at all3 sizes. This proves stable graph screen coordinates and camera presentation across disclosure; world coordinate state is not directly exposed by DOM and is supported by unchanged graph inputs/native disclosure code review.

Remaining REAL DEFECT: narrow expanded Overview content still sits below toolbar z5, so Search covers「项目目标」heading and Adjust covers goal copy. Screenshot `acceptance-a-project-fixed-expanded-390.png`. Desktop expanded presentation is clean. Final approval awaits this repair.

Fresh independently inspected Capability inline1366/1440 and source expanded screenshots show same quiet card/header/button/dock language. Visible source-collapsed proof is `../fresh-review/acceptance-a-source-collapsed-visible.png`: one selected source summary, no full library, dock visible. Independent settled scroll evidence `../fresh-review/acceptance-a-independent-scroll.json` records context.scrollTop400, Timeline.scrollTop596, documentY0, Composer still607..747. Earlier unscrolled captures are excluded.

## e7bbe51 repair verification

READY Preview https://edu-flow-4ipc6drvu-july-nanas-projects.vercel.app. All3 native Overview open/close clicks,23 endpoint screen coordinates, canvas dimensions and pointer hit-tests pass again (`overview-final-measurements.json`). Actual editing begin modifies only local draft; no Preview or Adopt request made by reviewer. Draft selected controls remain identical on disclosure (`overview-final-draft.json`, draftPreserved=true/screenStable=true). Toolbar parent and editor restore visible after closing; editor hides while open.

Expanded narrow remains FAIL: toolbar parent computes visibility:hidden but direct button child computes visibility:visible and still overlays Overview heading/text. Screenshots `acceptance-a-overview-final-default-narrow.png`, `acceptance-a-overview-final-editing-narrow.png`. Do not treat parent visibility measurements alone as visual PASS. Requires actual descendant suppression/retest.

Fresh success/proposal narrow screenshots independently inspected: candidates legible, judgement details folded, clear confirmed unchanged-route notice and Route Impact preview action. `acceptance-a-capability-proposals-1366.png` shows an earlier scroll position without actual candidates; use visible `acceptance-a-proposal-narrow-reduced.png` as concrete candidate evidence. Standalone Dialog and Failed Run visual checks remain pending Fresh writer.

Standalone Dialog1366/1440/390 reduced independently visually inspected from Fresh screenshots and geometry. Same presentation language, default collapsed source0, upload/analyze/send visible. Composer bottom743/875/835 respectively; documents exactly768/900/844 tall with scrollY0 and zoomscale1. No page/Dialog/Timeline scroll competition observed. Specific screenshots `../fresh-review/acceptance-a-capability-dialog-1366.png`, `...-1440.png`, `...-narrow-reduced.png`.

## Final normal Preview 9ae51b9 · Overview PASS

READY https://edu-flow-oqtdt6rf8-july-nanas-projects.vercel.app, commit `9ae51b973f04d6689e355bc45155b1faf11442c5`. Prior visibility-based attempts were actual visual FAIL and are retained above; the final narrow native-open rule hides whole absolute control containers using display:none. No React unmount or business-state mutation.

Actual native clicks pass1366×768,1440×900 and390×844 reduced, zoomscale1. All23 rendered route endpoints are exactly equal before/open/closed; canvas dimensions equal. `overview-9ae-final-measurements.json` records these assertions. Narrow default and editing screenshots are now unobstructed (`acceptance-a-overview-9ae-final-default-narrow.png`, `...-editing-narrow.png`). Close restores toolbar/editor (`...-closed-editor-restored.png`). `overview-9ae-final-draft.json`: rendered toolbar buttons2→0→2(default),1→0→1(editing), editor block→none→block, draft checked selections unchanged, screen coordinates unchanged. Hidden control bounds are intentionally not claimed unchanged; graph geometry/camera presentation is unchanged. World coordinates remain a code-level conclusion rather than direct engine introspection.

All confirmed Overview REAL DEFECTS resolved. Final Practice/inline/standalone Capability layout, source disclosure, proposal/success appearance, compact Assistant and reduced motion checks reviewed so far PASS. Final failed-Run appearance is still pending isolated Fresh scenario; no claim of complete goal acceptance is made by this layout report.

## Failed Run appearance · PASS

Independently inspected Fresh reviewer actual persisted failure screenshots `../fresh-review/acceptance-a-fault-failed-1366.png` and `../fresh-review/acceptance-a-fault-failed-narrow-reduced.png`. Both show one active failure card with one primary「重新分析」action, clear unchanged-capability/route explanation, collapsed technical details and history. No Refresh control, UUID, or duplicate Workspace error is visible. Narrow source selection is folded and the upload/send Composer stays visible; document scrollY=0 and Composer bottom835 at390×844/reduced. Desktop upload/send dock also remains visible. The intentional fault Preview `https://edu-flow-oqm4i8vwg-july-nanas-projects.vercel.app` is evidence for the failed state only, not the final normal deployment baseline.

## Final Reviewer 2 classification

- BLOCKER: None remaining in reviewed presentation scope.
- REAL DEFECT: All independently confirmed Overview click interception, narrow toolbar collision, expanded disclosure/editor collision, and insufficient visibility-based suppression are resolved by final normal commit9ae51b9 and actual native-click screenshots. Earlier failures remain documented rather than overwritten as PASS.
- IMPROVEMENT: None required for acceptance. Compact density and duplicate entrance review notes are resolved.
- OUT OF SCOPE: Provider fault/timeout operation, formal Knowledge/Route/Practice authority, A/B baseline reset, actual Retry outcome, and other reviewers' end-to-end/data assertions. This reviewer did not make Hosted writes or reopen Practice.

Reviewer 2 presentation verdict: PASS. Actual own-browser Overview/compact/reduced-motion checks plus independent visual inspection of Fresh real Practice/inline/standalone Capability/source/proposal/success/failure artifacts satisfy the assigned layout review. This is not a declaration that the whole goal is complete; final authority and remaining Retry/B checks belong to the main agent and assigned data/end-to-end reviewers.
