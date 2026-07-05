---
name: writing-plans
description: Turn an approved Toolcraft app spec into a deterministic implementation plan focused on app files, tests, build, and browser verification.
---

# Writing Plans (Toolcraft implementation planning)

From the approved spec, produce a plan that names:

1. The exact files to add/edit under `src/app` and `src/routes` (never hand-composed runtime surfaces).
2. Schema work: sections, controls, targets, defaults, `visibleWhen`, order roles, and the
   matching `starterControlSectionInventory` entries.
3. Renderer work: technique, layers, pass invalidation (`rendererPipeline`) for custom renderers.
4. Acceptance work: rows per visible entity with automated + browser test names, and where
   those tests live (`src/app/*.test.ts`, `e2e/app-controls.spec.ts`).
5. Performance work: roles per control, workload scenarios with `stressFixture`.
6. The verification tier per step (Tier 0–4) with the exact commands to run.

In this project the standing plan is `docs/BUILD_PLAN.md` (phased). Keep it current as
phases land; per-pass plans go in the worklog decision trail.
