---
name: systematic-debugging
description: Investigate root cause before fixing broken controls, failed tests, build failures, visual mismatches, export issues, or runtime regressions.
---

# Systematic Debugging

Before changing code to fix a failure:

1. Reproduce it: run the exact failing command or browser interaction; capture the message,
   stack, or wrong pixels/bytes.
2. Localize it: bisect between schema → runtime state → renderer → export layers. Read the
   failing test/validator source to learn what it actually asserts.
3. Explain it: write one sentence naming the root cause. If you cannot, keep localizing —
   do not patch symptoms, do not add sleeps, do not weaken assertions.
4. Fix at the cause layer. Runtime/template bugs get fixed in shared source, not worked
   around per-app (see AGENTS.md runtime boundary).
5. Re-run the original failing check plus the tier-appropriate verification set.
6. Record non-obvious causes in the worklog decision trail.
