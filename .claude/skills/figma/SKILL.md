---
name: figma
description: Inspect actual Figma structure via MCP before implementing Figma-referenced Toolcraft apps.
---

# Figma Inspection

When a prompt provides a Figma URL:

1. Use the Figma MCP tools (`get_design_context`, `get_metadata`, `get_screenshot`) to read
   the real node: layer tree, components, variants, text nodes, variables, styles, assets.
2. If the URL is not node-specific, inspect file/page metadata and pick the relevant node
   only when unambiguous; otherwise ask for a node-specific link.
3. Record the inspected node ids and extracted values (colors, type, spacing) in the worklog.
4. Screenshots are for final visual QA only — never the implementation source of truth.

Never implement a Figma design by eye from an image or memory.
