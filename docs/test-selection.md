# Choosing checks

Local feedback and release acceptance answer different questions. Use Node 24. Commands below run from the repository root unless stated otherwise. CI's executable path rules in [ci-gate.mjs](../scripts/ci-gate.mjs) and jobs in [site-check.yml](../.github/workflows/site-check.yml) remain authoritative; this guide does not narrow them.

| Change | First local feedback | Before completion |
| --- | --- | --- |
| Prose or links only | Inspect the diff and resolve changed local links/anchors. | Relevant factual review; required CI still runs site checks. No desk runtime claim follows. |
| Site build or inquiry/voice behavior | `node scripts/build-site.mjs`, `node scripts/verify-site.mjs`, then `node --test scripts/inquiry.test.mjs scripts/voice-demo.test.mjs` | Affected browser journeys and required CI, including responsive/accessibility checks where relevant. |
| CI selection or aggregation | `node --test scripts/ci-gate.test.mjs` | Actual hosted jobs and required aggregate; changed CI selects the full desk and Windows checks. |
| Checkpoint behavior | `node --test scripts/context-checkpoint.test.mjs` | Relevant handoff/hook cases and hosted Windows checks. Passing writer tests does not prove agent recovery. |
| Desk behavior | After `npm ci --ignore-scripts` in `pipeline`, run the affected test file(s) using `node --test pipeline/NAME.test.mjs`. Choose callers and failure cases by reading the change. | From `pipeline`: `npm run check`, `node --test ../scripts/studio-context.test.mjs ../scripts/build-desk-assets.test.mjs`, and `npm test`; required CI includes Windows. Apply the existing feature/release acceptance separately. |

A single test or file is an iteration aid, not an automatically computed dependency closure. For shared authorization, persistence, dispatch, or delivery changes, include cross-role, stale/changed permission, concurrent writer, lost acknowledgement and no-duplicate-effect checks relevant to the callers. If the affected boundary is unclear, retain the full suite. Do not remove a case merely because its name or duration resembles another.

For fictional filesystem tests, use a writable temporary directory. In a restricted Windows environment, a child Git process may lack access to the sandbox-default temporary directory even when Node created it. This audit's CI-gate run initially failed at fixture `git init`; setting `TEMP` and `TMP` to a dedicated writable directory resolved it (6/6 passed). Diagnose the fixture failure before changing production code or claiming a behavioral regression.

## Measured baseline, November 3, 2026

[Hosted run 41671714726](https://github.com/Vziraka/ensizziyo-web-studio/actions/runs/41671714726), pipeline job 126041725888, used Node 24 on Linux. Its `npm test` summary reports 1,556 tests, 1,554 passed, two skipped, zero failed, and 1,201,490.85 ms (20m 1.49s). Dependency installation took about four seconds and syntax checks about five seconds by step timestamps. These are one run's observations, not a performance target or today's complete acceptance result.

| Sample slow case | Reported duration | Why retain it pending an equivalent proof |
| --- | --- | --- |
| Actual signed human/composed incoming changes during dependency waits (`shared-operations-refinement.test.mjs`) | 41.84s | Fences the next effect after concurrent state changes and preserves recovery. |
| P3/P5/P9 owner exact unchanged PDF proof (`shared-operations-pdf-mail.test.mjs`) | 40.90s | Owner authority and an immediate reply after older history. |
| Same scenario for friend | 40.56s | Separate operator authority; the owner's pass does not establish it. |

Durations are individual observations, can overlap, and must not be summed into a promised wall-time saving. The next optimization experiment should profile setup versus awaited work in a bounded fictional case, preserve both roles and failure assertions, then compare repeated runs on the same host/revision conditions. No test was removed, skipped, or combined in this documentation increment; no runtime saving is claimed. Avoid rerunning a 20-minute suite just to reproduce a documented baseline when a relevant hosted result already exists.
