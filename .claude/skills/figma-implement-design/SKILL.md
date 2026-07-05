---
name: figma-implement-design
description: Translate inspected Figma structure into Toolcraft schema, renderer, and verification coverage.
---

# Figma → Toolcraft Implementation

After `figma` inspection produces the node structure:

1. Map Figma entities to Toolcraft: frames → canvas/renderer layout; text styles → schema
   typography controls (`fontPicker`) or locked brand styles; variants → `select`/`segmented`
   modes; images → media/fileDrop or internal assets.
2. Keep runtime surfaces runtime-owned; the design maps to `canvasContent` product output
   and schema controls only.
3. Extract exact values from the inspected structure (not screenshots): colors, sizes,
   letter-spacing, line-height, spacing, corner radii.
4. Add acceptance rows proving the implemented design: rendered-pixels/product-output
   evidence per mapped entity; final visual QA against a Figma screenshot.
5. Record the node → schema/renderer mapping in the worklog decision trail.
