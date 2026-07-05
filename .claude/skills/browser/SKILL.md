---
name: browser
description: Verify the generated UI in a running local browser after implementation — real interactions against the real Toolcraft shell.
---

# Browser Verification

After implementation, before reporting completion:

1. Start or reuse the dev server via `pnpm dev` (port script owns port selection; never
   kill unrelated servers). Confirm the server identity before reporting a URL.
2. Drive the real UI with the agent-controlled browser (preview tools in this environment):
   click the actual controls, drag the actual sliders/thumbnails, run the actual export.
3. Prove product observables — rendered output changed, exported bytes decode with the
   expected dimensions/type — not just runtime state or DOM attributes.
4. Check viewport stability: canvas zoom/offset must not jump during interactions.
5. The default gate is `pnpm test:browser` (excludes `browser perf:`); run
   `pnpm test:browser:perf` only for first-working-version checkpoints or explicit
   performance complaints.
6. Record what was checked (and skipped, with reason) in the worklog verification notes.
