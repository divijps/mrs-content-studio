---
name: brainstorming
description: Shape Toolcraft app behavior before code — product behavior, canvas sizing mode, panels, media flow, controls, export/copy behavior, renderer technique, timeline/layer choice, and ambiguous requirements.
---

# Brainstorming (Toolcraft app shaping)

Before writing or changing an app spec:

1. Restate the product behavior in one paragraph: what the user creates, edits, and exports.
2. Decide, with a one-line reason each:
   - canvas sizing mode (`editable-output` unless a documented exception applies);
   - panels (controls always; layers/timeline only when product behavior requires);
   - media flow (fileDrop targets, defaultAssets, or internal sources);
   - control sections by product entity/workflow stage (2–7 controls each);
   - export/copy behavior (still → Export PNG; animated → +Export Video);
   - renderer technique (DOM/SVG/Canvas2D/WebGL) from output semantics and workload;
   - timeline/layer choice from the Animation Intent Inventory.
3. Surface every ambiguous requirement as an explicit question or a recorded assumption.
4. Record the outcome in the project spec (`docs/BRIEF.md`) and the worklog decision trail
   (`docs/toolcraft/agent-worklog.md`) before implementation.

In this project, `docs/BRIEF.md` is the standing user-approved product spec. Update it —
do not fork parallel spec documents.
