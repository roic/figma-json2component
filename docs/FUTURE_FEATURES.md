# Future Features

Features to discuss/implement after current work is complete.

---

## Component Properties (Native Figma)

**What it means:**
Define component properties that control boolean visibility, instance swaps, and text fields through Figma's native UI.

```json
{
  "componentProperties": {
    "showIcon": { "type": "boolean", "default": true, "controls": "Icon" },
    "icon": { "type": "instance-swap", "default": "lucide:star" },
    "label": { "type": "text", "default": "Button" }
  }
}
```

**Why it matters:**
- Professional design system standard
- Better designer UX (toggle options without accessing variants)
- Discoverability of component options

**Effort:** High (~300 lines, 1-2 days)

---

## Vectors/Custom Paths

**What it means:**
Draw arbitrary shapes with vector paths (SVG-style):

```json
{
  "nodeType": "vector",
  "path": "M 0 0 L 100 0 L 50 100 Z",
  "fill": "color.primary"
}
```

**Use cases:**
- Custom icons
- Decorative shapes
- Arrows, chevrons

**Effort:** Medium-High (~200 lines, complex edge cases)

---

## Layer Blur

**What it means:**
Blur the layer itself (not what's behind it):

```json
{
  "nodeType": "rectangle",
  "blur": 8
}
```

**Use cases:**
- Skeleton loading states
- Disabled content preview

**Effort:** Low (~20 lines)

---

## Prototyping/Interactions

**What it means:**
Define prototype links and animations:

```json
{
  "interactions": [
    {
      "trigger": "ON_CLICK",
      "action": "NAVIGATE",
      "destination": "frame:checkout"
    }
  ]
}
```

**Status:** Out of scope - JASOTI focuses on component structure, not behavior.

---

*Last updated: 2026-01-04*
