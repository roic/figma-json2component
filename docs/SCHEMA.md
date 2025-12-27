# JSON2Components Schema Reference

**Complete specification for creating component JSON files that work with the JSON2Components Figma plugin.**

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Root Schema](#root-schema)
- [Component Sets (with Variants)](#component-sets-with-variants)
- [Components (Standalone)](#components-standalone)
- [Layout Properties](#layout-properties)
- [Style Properties](#style-properties)
- [Child Nodes](#child-nodes)
- [Design Token Binding](#design-token-binding)
- [Complete Examples](#complete-examples)
- [Validation Rules](#validation-rules)
- [Best Practices](#best-practices)

---

## Overview

### What This Schema Does

Defines the structure of JSON files that the JSON2Components plugin reads to generate Figma components with design token bindings.

### Core Concepts

1. **Component Sets** - Create Figma component sets with variants (e.g., Button with primary/secondary types and default/hover states)
2. **Components** - Create standalone Figma components (e.g., Card, Modal)
3. **Token Binding** - Reference design tokens by name (e.g., `"fillToken": "color.primary"`) instead of hardcoding values
4. **Nesting** - Components can contain instances of other components
5. **Auto-layout** - Full control over Figma's auto-layout properties

---

## Quick Start

**Minimal valid schema:**

```json
{
  "components": [{
    "id": "card",
    "name": "Card",
    "layout": {
      "direction": "vertical"
    }
  }]
}
```

**With a component set:**

```json
{
  "componentSets": [{
    "id": "button",
    "name": "Button",
    "variantProps": ["type"],
    "base": {
      "layout": { "direction": "horizontal" }
    },
    "variants": [
      { "props": { "type": "primary" } }
    ]
  }]
}
```

---

## Root Schema

The top-level JSON object with two optional arrays:

```typescript
{
  "components"?: ComponentDefinition[],
  "componentSets"?: ComponentSetDefinition[]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `components` | Array | No | Array of standalone component definitions |
| `componentSets` | Array | No | Array of component set definitions (with variants) |

**At least one array must be present.**

---

## Component Sets (with Variants)

Create a Figma component set with multiple variants that share a base structure.

### Structure

```json
{
  "id": "button",
  "name": "Button",
  "description": "Primary action buttons",
  "storybook": "Components/Button",
  "category": "Actions",
  "tags": ["interactive", "core"],
  "variantProps": ["type", "state"],
  "base": {
    "layout": { ... },
    "children": [ ... ]
  },
  "variants": [
    { "props": { "type": "primary", "state": "default" }, "fillToken": "..." }
  ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (used for references, stored in Figma pluginData) |
| `name` | string | Display name in Figma |
| `variantProps` | string[] | Array of variant property names (maps to Figma variant axes) |
| `base` | ComponentBase | Shared structure inherited by all variants |
| `variants` | Variant[] | Array of variant definitions |

### Optional Metadata Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `description` | string | Component description | `"Primary action buttons"` |
| `storybook` | string | Storybook path | `"Components/Button"` |
| `category` | string | Organization category | `"Actions"`, `"Navigation"` |
| `tags` | string[] | Searchable tags | `["interactive", "core"]` |

### Base Structure

The `base` object defines what all variants share:

```json
"base": {
  "layout": { /* LayoutProps */ },
  "fillToken": "color.base",
  "radiusToken": "radius.md",
  "children": [ /* ChildNode[] */ ]
}
```

**Available fields:** All [Layout Properties](#layout-properties) + [Style Properties](#style-properties) + `children`

### Variants

Each variant overrides specific properties from `base`:

```json
"variants": [
  {
    "props": { "type": "primary", "state": "default" },
    "fillToken": "color.button.primary.bg"
  },
  {
    "props": { "type": "primary", "state": "hover" },
    "fillToken": "color.button.primary.hover"
  }
]
```

**Variant fields:**
- `props` (required) - Object mapping each `variantProps` name to a value
- Any [Style Properties](#style-properties) to override from base

**Figma variant naming:** Variants are named `"type=primary, state=default"` automatically.

---

## Components (Standalone)

Create a standalone Figma component (no variants).

### Structure

```json
{
  "id": "card",
  "name": "Card",
  "description": "Content card container",
  "storybook": "Components/Card",
  "category": "Layout",
  "tags": ["container"],
  "layout": { ... },
  "fillToken": "color.surface",
  "children": [ ... ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Display name in Figma |
| `layout` | LayoutProps | Layout configuration |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Component description |
| `storybook` | string | Storybook path |
| `category` | string | Organization category |
| `tags` | string[] | Searchable tags |
| All [Style Properties](#style-properties) | | Fill, stroke, radius, shadow tokens |
| `children` | ChildNode[] | Child nodes |

---

## Layout Properties

Controls Figma auto-layout behavior.

### All Layout Fields

```json
{
  "direction": "horizontal",
  "padding": 16,
  "paddingTop": 8,
  "paddingRight": 16,
  "paddingBottom": 8,
  "paddingLeft": 16,
  "paddingToken": "spacing.md",
  "gap": 8,
  "gapToken": "spacing.sm",
  "alignItems": "center",
  "justifyContent": "space-between",
  "width": 320,
  "height": "hug"
}
```

### Field Reference

| Field | Type | Description | Figma Mapping |
|-------|------|-------------|---------------|
| `direction` | `"horizontal"` \| `"vertical"` | Layout direction | `layoutMode` |
| `padding` | number | Uniform padding | All padding sides |
| `paddingToken` | string | Uniform padding token | All padding sides (bound to variable) |
| `paddingTop` | number | Top padding | `paddingTop` |
| `paddingRight` | number | Right padding | `paddingRight` |
| `paddingBottom` | number | Bottom padding | `paddingBottom` |
| `paddingLeft` | number | Left padding | `paddingLeft` |
| `gap` | number | Space between items | `itemSpacing` |
| `gapToken` | string | Gap token | `itemSpacing` (bound to variable) |
| `alignItems` | enum | Cross-axis alignment | `counterAxisAlignItems` |
| `justifyContent` | enum | Main-axis alignment | `primaryAxisAlignItems` |
| `width` | number \| `"fill"` \| `"hug"` | Width mode | `layoutSizingHorizontal` |
| `height` | number \| `"fill"` \| `"hug"` | Height mode | `layoutSizingVertical` |

### Alignment Values

**`alignItems`:**
- `"start"` → `MIN`
- `"center"` → `CENTER`
- `"end"` → `MAX`
- `"stretch"` → `STRETCH`

**`justifyContent`:**
- `"start"` → `MIN`
- `"center"` → `CENTER`
- `"end"` → `MAX`
- `"space-between"` → `SPACE_BETWEEN`

### Sizing Values

**`width` / `height`:**
- Number (e.g., `320`) → `FIXED` sizing with explicit size
- `"fill"` → `FILL` (fill parent container)
- `"hug"` → `HUG` (fit content)

---

## Style Properties

Visual styling with design token bindings.

### All Style Fields

```json
{
  "fillToken": "color.surface",
  "strokeToken": "color.border",
  "strokeWidth": 1,
  "radiusToken": "radius.md",
  "shadowToken": "shadow.sm"
}
```

### Field Reference

| Field | Type | Description | Figma Binding |
|-------|------|-------------|---------------|
| `fillToken` | string | Background color token | Color variable bound to fills |
| `strokeToken` | string | Border color token | Color variable bound to strokes |
| `strokeWidth` | number | Border width in pixels | `strokeWeight` |
| `radiusToken` | string | Corner radius token | Number variable bound to all 4 corners |
| `shadowToken` | string | Shadow/effect token | ⚠️ Not yet implemented (warns user) |

**Token Resolution:** The plugin looks for Figma variables/styles with matching names.

**Example:** `"fillToken": "color.primary"` → Plugin finds variable named `color.primary` and binds it.

---

## Child Nodes

Components can contain four types of child nodes.

### Node Types

| Type | Use Case | Example |
|------|----------|---------|
| `frame` | Nested containers | Icon wrapper, content section |
| `text` | Text labels | Button label, card title |
| `rectangle` | Simple shapes | Divider, background |
| `instance` | Component instances | Button inside Card |

---

### Frame Node

Nested frame with its own layout and children.

```json
{
  "nodeType": "frame",
  "id": "icon-wrapper",
  "name": "IconWrapper",
  "layout": {
    "direction": "horizontal",
    "padding": 4
  },
  "fillToken": "color.bg.subtle",
  "radiusToken": "radius.sm",
  "children": [ ... ]
}
```

**Required:**
- `nodeType`: `"frame"`
- `id`: Unique within parent
- `name`: Figma layer name

**Optional:**
- `layout`: [Layout Properties](#layout-properties)
- All [Style Properties](#style-properties)
- `children`: Array of child nodes (recursive)

---

### Text Node

Text label with optional content and styling.

```json
{
  "nodeType": "text",
  "id": "label",
  "name": "Label",
  "text": "Button",
  "textStyleToken": "typography.button.label",
  "fillToken": "color.text.primary"
}
```

**Required:**
- `nodeType`: `"text"`
- `id`: Unique within parent
- `name`: Figma layer name

**Optional:**
- `text`: Text content (defaults to empty string)
- `textStyleToken`: Figma text style name (exact match)
- `fillToken`: Text color variable

---

### Rectangle Node

Simple rectangle shape (for dividers, backgrounds).

```json
{
  "nodeType": "rectangle",
  "id": "divider",
  "name": "Divider",
  "layout": {
    "width": "fill",
    "height": 1
  },
  "fillToken": "color.border.subtle"
}
```

**Required:**
- `nodeType`: `"rectangle"`
- `id`: Unique within parent
- `name`: Figma layer name

**Optional:**
- `layout`: Only `width` and `height` supported
- `fillToken`, `strokeToken`, `strokeWidth`, `radiusToken`

---

### Instance Node

Reference to another component (creates an instance).

```json
{
  "nodeType": "instance",
  "id": "action-button",
  "name": "ActionButton",
  "ref": "button",
  "variantProps": {
    "type": "primary",
    "state": "default"
  },
  "overrides": {
    "label": { "text": "Submit" }
  },
  "layout": {
    "width": "fill"
  }
}
```

**Required:**
- `nodeType`: `"instance"`
- `name`: Figma layer name
- `ref`: ID of the component or componentSet to instantiate

**Optional:**
- `id`: Unique within parent (not required for instances)
- `variantProps`: If `ref` is a componentSet, specifies which variant
- `overrides`: Text content overrides (keyed by child node `id`)
- `layout`: Only `width` and `height` supported

**Variant Selection:**
If `ref` points to a componentSet:
- With `variantProps`: Finds exact variant match
- Without `variantProps`: Uses first variant (default)

**Text Overrides:**
```json
"overrides": {
  "label": { "text": "Submit" }
}
```
Finds child node with `id: "label"` and sets its text to `"Submit"`.

---

## Design Token Binding

### How Tokens Work

1. **You define tokens** in your design system (JSON, YAML, etc.)
2. **Tokens Studio syncs to Figma** creating variables and text styles
3. **JSON2Components references tokens** by name using `*Token` fields
4. **Plugin binds variables** to Figma component properties

### Token Naming Convention

All token fields end with `Token`:
- `fillToken`, `strokeToken`, `radiusToken`, `shadowToken`
- `paddingToken`, `gapToken`
- `textStyleToken`

### Token Resolution

**Color Variables** (`fillToken`, `strokeToken`):
```json
"fillToken": "color.button.primary.bg"
```
→ Plugin finds Figma **color variable** named `color.button.primary.bg`
→ Binds it to the fill property

**Number Variables** (`radiusToken`, `paddingToken`, `gapToken`):
```json
"radiusToken": "radius.md"
```
→ Plugin finds Figma **number variable** named `radius.md`
→ Binds it to corner radius

**Text Styles** (`textStyleToken`):
```json
"textStyleToken": "typography.button.label"
```
→ Plugin finds Figma **text style** named `typography.button.label`
→ Applies it via `textStyleId`

### Token Name Matching

**Exact match required.** Case-sensitive.

❌ Wrong:
```json
"fillToken": "Color.Primary"  // Capital C
```

✅ Correct:
```json
"fillToken": "color.primary"  // Matches Figma variable name exactly
```

### Missing Tokens

If a token isn't found, the plugin:
1. Shows a warning in the UI
2. Generates the component anyway (without that style applied)
3. Continues processing other components

Example warning:
```
⚠️ Variable 'color.accent' not found
```

---

## Complete Examples

### Example 1: Button Component Set

```json
{
  "componentSets": [{
    "id": "button",
    "name": "Button",
    "description": "Primary action buttons with multiple states",
    "storybook": "Components/Button",
    "category": "Actions",
    "tags": ["interactive", "core"],

    "variantProps": ["type", "state"],

    "base": {
      "layout": {
        "direction": "horizontal",
        "paddingToken": "spacing.button.padding",
        "gap": 8,
        "alignItems": "center",
        "justifyContent": "center",
        "height": 40,
        "width": "hug"
      },
      "radiusToken": "radius.md",
      "children": [
        {
          "nodeType": "text",
          "id": "label",
          "name": "Label",
          "text": "Button",
          "textStyleToken": "typography.button.label"
        }
      ]
    },

    "variants": [
      {
        "props": { "type": "primary", "state": "default" },
        "fillToken": "color.button.primary.bg"
      },
      {
        "props": { "type": "primary", "state": "hover" },
        "fillToken": "color.button.primary.hover"
      },
      {
        "props": { "type": "secondary", "state": "default" },
        "fillToken": "color.button.secondary.bg",
        "strokeToken": "color.border.default",
        "strokeWidth": 1
      },
      {
        "props": { "type": "secondary", "state": "hover" },
        "fillToken": "color.button.secondary.hover",
        "strokeToken": "color.border.hover",
        "strokeWidth": 1
      }
    ]
  }]
}
```

**Result:** Figma component set "Button" with 4 variants:
- `type=primary, state=default`
- `type=primary, state=hover`
- `type=secondary, state=default`
- `type=secondary, state=hover`

---

### Example 2: Card with Nested Instance

```json
{
  "components": [{
    "id": "card",
    "name": "Card",
    "description": "Content card with action button",
    "storybook": "Components/Card",
    "category": "Layout",

    "layout": {
      "direction": "vertical",
      "padding": 16,
      "gap": 12,
      "width": 320,
      "height": "hug"
    },
    "fillToken": "color.surface",
    "radiusToken": "radius.lg",
    "shadowToken": "shadow.md",

    "children": [
      {
        "nodeType": "text",
        "id": "title",
        "name": "Title",
        "text": "Card Title",
        "textStyleToken": "typography.heading.sm"
      },
      {
        "nodeType": "text",
        "id": "body",
        "name": "Body",
        "text": "Card body content goes here.",
        "textStyleToken": "typography.body.md"
      },
      {
        "nodeType": "instance",
        "name": "ActionButton",
        "ref": "button",
        "variantProps": {
          "type": "primary",
          "state": "default"
        },
        "overrides": {
          "label": { "text": "Action" }
        }
      }
    ]
  }]
}
```

**Dependencies:** Card depends on Button, so Button must be generated first (plugin handles this automatically).

---

### Example 3: Complex Layout

```json
{
  "components": [{
    "id": "nav-item",
    "name": "NavItem",
    "description": "Navigation menu item with icon and label",

    "layout": {
      "direction": "horizontal",
      "paddingTop": 8,
      "paddingRight": 16,
      "paddingBottom": 8,
      "paddingLeft": 12,
      "gap": 8,
      "alignItems": "center",
      "width": 200,
      "height": "hug"
    },
    "radiusToken": "radius.sm",

    "children": [
      {
        "nodeType": "frame",
        "id": "icon-container",
        "name": "IconContainer",
        "layout": {
          "direction": "horizontal",
          "padding": 4,
          "alignItems": "center",
          "justifyContent": "center",
          "width": 24,
          "height": 24
        },
        "fillToken": "color.icon.bg",
        "radiusToken": "radius.xs",
        "children": [
          {
            "nodeType": "rectangle",
            "id": "icon-placeholder",
            "name": "Icon",
            "layout": {
              "width": 16,
              "height": 16
            },
            "fillToken": "color.icon.fg"
          }
        ]
      },
      {
        "nodeType": "text",
        "id": "label",
        "name": "Label",
        "text": "Navigation",
        "textStyleToken": "typography.nav.label"
      }
    ]
  }]
}
```

---

## Validation Rules

### Schema-Level Rules

✅ **Valid:**
```json
{
  "components": [...]
}
```

✅ **Valid:**
```json
{
  "componentSets": [...]
}
```

✅ **Valid:**
```json
{
  "components": [...],
  "componentSets": [...]
}
```

❌ **Invalid:**
```json
{}  // Must have at least one array
```

---

### ID Uniqueness

All `id` values must be unique across the entire schema.

❌ **Invalid:**
```json
{
  "components": [
    { "id": "card", "name": "Card", ... },
    { "id": "card", "name": "CardVariant", ... }  // Duplicate!
  ]
}
```

**Error:** `"Duplicate id 'card' found"`

---

### Token vs Value Conflicts

Cannot specify both a token and a raw value for the same property.

❌ **Invalid:**
```json
{
  "layout": {
    "padding": 16,
    "paddingToken": "spacing.md"  // Conflict!
  }
}
```

**Error:** `"Cannot specify both 'padding' and 'paddingToken'"`

✅ **Valid:**
```json
{
  "layout": {
    "paddingToken": "spacing.md"  // Use token only
  }
}
```

Or:

✅ **Valid:**
```json
{
  "layout": {
    "padding": 16  // Use raw value only
  }
}
```

---

### Required Fields

**ComponentSet:**
- `id` ✓
- `name` ✓
- `variantProps` ✓
- `base` ✓
- `variants` ✓

**Component:**
- `id` ✓
- `name` ✓
- `layout` ✓

**All child nodes except Instance:**
- `id` ✓
- `name` ✓
- `nodeType` ✓

**Instance node:**
- `name` ✓
- `nodeType` ✓
- `ref` ✓

---

### Circular Dependencies

Components cannot depend on themselves (directly or indirectly).

❌ **Invalid:**
```json
{
  "components": [
    {
      "id": "a",
      "name": "A",
      "layout": {},
      "children": [
        { "nodeType": "instance", "name": "B", "ref": "b" }
      ]
    },
    {
      "id": "b",
      "name": "B",
      "layout": {},
      "children": [
        { "nodeType": "instance", "name": "A", "ref": "a" }  // Circular!
      ]
    }
  ]
}
```

**Error:** `"Circular dependency detected: a → b → a"`

---

## Best Practices

### 1. Use Semantic IDs

✅ **Good:**
```json
"id": "button-primary"
"id": "card-product"
"id": "nav-item"
```

❌ **Avoid:**
```json
"id": "comp1"
"id": "thing"
"id": "abc123"
```

---

### 2. Always Use Tokens for Values That Change

✅ **Good:**
```json
"fillToken": "color.surface",
"paddingToken": "spacing.md",
"radiusToken": "radius.lg"
```

❌ **Avoid:**
```json
"padding": 16,  // Hardcoded - won't update with design system
"width": 320
```

**Exception:** Layout dimensions (`width`, `height`) and `gap` are often hardcoded.

---

### 3. Keep Base Simple, Override in Variants

✅ **Good:**
```json
"base": {
  "layout": { "direction": "horizontal", "padding": 12 },
  "radiusToken": "radius.md",
  "children": [...]
},
"variants": [
  { "props": { "type": "primary" }, "fillToken": "color.primary" },
  { "props": { "type": "secondary" }, "fillToken": "color.secondary" }
]
```

❌ **Avoid:** Duplicating layout in every variant.

---

### 4. Use Descriptive Names

✅ **Good:**
```json
{
  "nodeType": "text",
  "id": "card-title",
  "name": "Title"
}
```

❌ **Avoid:**
```json
{
  "nodeType": "text",
  "id": "text1",
  "name": "Text"
}
```

---

### 5. Document with Metadata

Use optional metadata fields for better organization:

```json
{
  "id": "button",
  "name": "Button",
  "description": "Primary action button with hover and disabled states",
  "storybook": "Components/Button",
  "category": "Actions",
  "tags": ["interactive", "form", "core"]
}
```

---

### 6. Test Incrementally

Start small and build up:

1. **Single component, no variants**
2. **Add layout and tokens**
3. **Add children**
4. **Add variants**
5. **Add nested instances**

Don't try to create your entire design system in one JSON file on day one.

---

### 7. Version Control Your Schemas

Keep JSON files in your design system repo:

```
design-system/
├── tokens/
└── figma/
    └── schemas/
        ├── button.json
        ├── card.json
        ├── input.json
        └── nav.json
```

---

## Common Patterns

### Pattern: Button with Icon

```json
{
  "base": {
    "layout": { "direction": "horizontal", "gap": 8 },
    "children": [
      {
        "nodeType": "rectangle",
        "id": "icon",
        "name": "Icon",
        "layout": { "width": 16, "height": 16 }
      },
      {
        "nodeType": "text",
        "id": "label",
        "name": "Label",
        "text": "Button"
      }
    ]
  }
}
```

---

### Pattern: Card with Header and Footer

```json
{
  "layout": { "direction": "vertical", "gap": 0 },
  "children": [
    {
      "nodeType": "frame",
      "id": "header",
      "name": "Header",
      "layout": { "direction": "vertical", "padding": 16 }
    },
    {
      "nodeType": "frame",
      "id": "body",
      "name": "Body",
      "layout": { "direction": "vertical", "padding": 16 }
    },
    {
      "nodeType": "frame",
      "id": "footer",
      "name": "Footer",
      "layout": { "direction": "horizontal", "padding": 16, "justifyContent": "end" }
    }
  ]
}
```

---

### Pattern: List Item with Instance

```json
{
  "children": [
    {
      "nodeType": "text",
      "id": "title",
      "name": "Title",
      "text": "Item"
    },
    {
      "nodeType": "instance",
      "name": "Badge",
      "ref": "badge",
      "variantProps": { "color": "blue" }
    }
  ]
}
```

---

## Troubleshooting

### "Token 'X' not found"

**Cause:** Figma variable/style with that name doesn't exist.

**Fix:**
1. Check Figma's Variables panel - does variable exist?
2. Check spelling (case-sensitive!)
3. Verify Tokens Studio synced successfully

---

### "Duplicate id 'X' found"

**Cause:** Two components/componentSets have the same `id`.

**Fix:** Make all IDs unique across the entire schema.

---

### "Cannot specify both 'padding' and 'paddingToken'"

**Cause:** Both raw value and token specified.

**Fix:** Choose one - either use the token or the raw value.

---

### "Instance references unknown id 'X'"

**Cause:** `ref` points to a component that doesn't exist.

**Fix:**
1. Check the `id` value is correct
2. Ensure both components are included in the JSON

---

### Component generated but colors are static

**Cause:** Variable binding didn't work.

**Fix:**
1. Click the fill in Figma - does it show a variable icon?
2. Check variable type (colors must be Color type, not String)
3. Verify exact name match

---

## Need Help?

- **Examples:** See `examples/buttons.json` in the repo
- **Design Spec:** See `docs/plans/2025-11-24-json2components-design.md`
- **Issues:** https://github.com/roic/figma-json2component/issues
