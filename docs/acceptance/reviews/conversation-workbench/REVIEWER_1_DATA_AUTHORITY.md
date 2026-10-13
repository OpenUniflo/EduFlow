# Reviewer 1 final · PASS

Reviewed implementation HEAD `822f76ba29ab9799cf8a4bc6ebb8ce0c6d10b248` on `feature/project-capability-model` in the real repository. This is a read-only data/authority review; Reviewer 1 performed no Hosted write, login or Reset.

## Classification

- **BLOCKER:** none.
- **REAL DEFECT:** none remaining. Fixed and reverified: protected admin/QQ Reset owners; out-of-course Micro manifest restore; standalone null-course Diagnosis sessions retaining deleted Run references; retained B baseline session reusing stale appended test references.
- **IMPROVEMENT:** none required for this scope.
- **OUT OF SCOPE:** unchanged historical Security Advisor INFO/WARN and performance advice, known intermittent embedding timeout. The intentional disposable-deployment transport failure is a separately labelled acceptance fault, not a normal Preview systemic failure.

## Final protected-data proof

Independent live SQL after Fresh ended and both final resets: **all 26 protected table row counts and complete-row hashes match the original pre-Phase0 snapshot exactly**. The learner-table set includes the complete rows of old admin, QQ and every other non-A/B owner across UKS, Route heads/versions, Attempts, Results, Evidence sources/units, Diagnosis/proposals, ActionRuns, learning events/progress and sessions. The shared-definition set includes Knowledge nodes/revisions/edges, Action definitions/bindings, Courses, Assignments and CurriculumCoverage.

- Protected Assistant messages: **194**, original/final hash `c6c5af271df458a43b81aed2265e5e48`.
- Protected private user-evidence objects: **33**, original/final hash `535d1b1f3b62b26e8bc4e561d20df501`.
- Final outsideHash: `dd998207261f1896f0b877a9320ee0c3`.

This proves old admin/QQ and other owners' persisted learning/business rows unchanged without signing in to those accounts.

## Final acceptance fixture

| Account | Version | Selected nodes | executionSteps | Stored UKS | Evidence | Diagnosis | ActionRun | Retained Route versions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acceptance A | V8 | 18 | 23 | 7 | 0 | 0 | 0 | 8 |
| Acceptance B | V8 | 14 | 17 | 7 | 0 | 0 | 0 | 8 |

A active ID: `901f6524-8d9b-4383-9868-58c5f4298d35`. B active ID: `bf9d5115-1600-47bc-9342-97b8f09ab7fa`.

Independent live SQL compares **every stored UKS field** against the original A/B baseline: both accounts match exactly. Both final complete Verify JSON documents match each other exactly, including all reported fixture values, outsideHash and three actual retained session IDs. Original two sessions are preserved; the additional unrelated empty personal session is deliberately preserved. New test histories are removed only by authoritative scope.

## Authority review and actual Fresh evidence

- A/B Route fixture follows Preview → explicit existing real Edge/Action selection → existing Adopt authority. Preview does not append versions; prior V1–V7 history remains unchanged, and final V1–V8 snapshots/heads match the captured fixture.
- Workbench Shell remains presentation-only. Explicit formal Practice submit keeps its existing Assignment/ActionRun payload and conversation authority. Ordinary user/Assistant messages are not Evidence.
- Evidence upload continues using actual private Storage and owned source identity. Diagnosis creates a new owned Run. Confirmation is run-scoped and explicit, writing through the existing capability authority. Route Impact enters Preview; neither confirmation nor Preview adopts.
- Actual Fresh A snapshots independently compared offline: Trace preserves UKS and formal version; Confirm changes UKS 7→8 but preserves exact V8; Route Impact Preview preserves exact V8; Text retains UKS/version/Evidence library/Diagnosis history; File retains UKS/version/Diagnosis history.
- Actual Fresh B: Trace preserves capability status/mastery/origin/timestamps and exact V8. GET progress adds a derived assignment_accepted observation under already-learned Knowledge; this is expected evidence lineage, **not** a mastery mutation. Independent live SQL before Confirm proved all seven stored UKS rows baseline-exact. Explicit Confirm changes derived count 7→8 while exact V8 persists; final Route Impact Preview preserves exact V8.
- Controlled transport-fault Run `32f490ea-40fe-41dc-a7ff-4c7d082c8021` remains exactly immutable, including its sources/units/proposals, after reanalysis. Normal Preview creates different Run `6fecdfab-2972-453c-a1b2-7e0689659d22`, completed with five proposals from the same sources. No SQL fake or state patch.
- Actual Hosted rollback probes PASS: mixed-source rejection, course-only deletion, mixed/other-course/malformed/schema99/generic-empty preservation, same-owner null-course source/Run proof, baseline session post-capture cleanup and pre-capture history retention. Probe IDs disappear after rollback.
- Actual Hosted ACL: adoption, capability confirmation and both conversation Assignment RPCs remain service-only; anon/authenticated EXECUTE=false.

## Engineering and governance

- Independently reran **8 relevant suites / 75 tests PASS** after final reset fix.
- Primary final full-test artifact inspected: **124 files / 900 tests PASS**.
- **63 Hosted migration version/name pairs exactly equal 63 local files**, checked again after final resets. New migration: **none**.
- Final Security Advisor is **baseline-exact: 5 INFO / 3 WARN, no ERROR/new issue**.

Reviewer 2/3 own viewport/animation/browser coverage; this review does not substitute code checks for their actual UX verification.

## Evidence

All paths under `.acceptance/conversation-workbench/`:

- `reviewer-1-protected-before.json`, `reviewer-1-protected-final.json`
- `reviewer-1-protected-before-extra.json`, `reviewer-1-protected-final-extra.json`
- `reviewer-1-ab-final.json`
- `reviewer-1-final-reset-security-migrations.json`
- `reviewer-1-hosted-authority-acl.json`
- `reviewer-1-fresh-a-authority.json`
- `reviewer-1-fresh-b-preconfirm-stored-uks.json`, `reviewer-1-fresh-b-authority.json`
- `reviewer-1-fault-retry-immutability.json`
- `reference-session-reset-guard.json`, `session-reset-guard.json`, `mixed-reset-guard.json`
- `acceptance-ab-baseline.json.verify-final-1.json`, `acceptance-ab-baseline.json.verify-final-2.json`

