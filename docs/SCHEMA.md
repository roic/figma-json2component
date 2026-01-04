# JASOTI Schema Reference

**Complete specification for creating component JSON files that work with the JASOTI Figma plugin.**

> JASOTI = JSON As Source Of Truth for Interfaces

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Root Schema](#root-schema)
- [Multi-File Support](#multi-file-support)
- [Organization Configuration](#organization-configuration)
- [Component Sets (with Variants)](#component-sets-with-variants)
- [Components (Standalone)](#components-standalone)
- [Layout Properties](#layout-properties)
- [Style Properties](#style-properties)
  - [Gradient Fills](#gradient-fills)
  - [Stroke Options](#stroke-options)
- [Child Nodes](#child-nodes)
  - [Background Blur](#background-blur)
  - [Instance Overrides](#instance-overrides)
- [Icon Libraries](#icon-libraries)
- [Design Token Binding](#design-token-binding)
- [Complete Examples](#complete-examples)
- [Validation Rules](#validation-rules)
- [Best Practices](#best-practices)

---

## Overview

### What This Schema Does

Defines the structure of JSON files that JASOTI reads to generate Figma components with design token bindings.

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

The top-level JSON object with optional configuration and component arrays:

```typescript
{
  "organization"?: Organization,
  "components"?: ComponentDefinition[],
  "componentSets"?: ComponentSetDefinition[]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organization` | Object | No | Controls how components are positioned in Figma (see [Organization Configuration](#organization-configuration)) |
| `components` | Array | No | Array of standalone component definitions |
| `componentSets` | Array | No | Array of component set definitions (with variants) |

**At least one component array must be present (`components` or `componentSets`).**

---

## Multi-File Support

Select multiple JSON files at once for automatic dependency resolution.

### Why Multi-File?

- **Better organization**: Keep components in separate files by category or feature
- **Dependency resolution**: Plugin automatically includes referenced components across files
- **Team collaboration**: Easier to work on different components simultaneously without conflicts

### Usage

1. Click "Select JSON file(s)" in the plugin UI
2. Hold Cmd/Ctrl and select multiple files:
   - `Avatar.json`
   - `FriendRating.json`
   - `ChatInput.json`
3. Click "Generate Components"

The plugin:
- Parses all files
- Merges into one schema
- Resolves dependencies across files
- Generates in correct order (dependencies first)

### Example

**Avatar.json:**
```json
{
  "componentSets": [{
    "id": "avatar",
    "name": "Avatar",
    "variantProps": ["size"],
    "base": {
      "layout": { "direction": "horizontal" }
    },
    "variants": [
      { "props": { "size": "small" } },
      { "props": { "size": "large" } }
    ]
  }]
}
```

**FriendRating.json:**
```json
{
  "components": [{
    "id": "friend-rating",
    "name": "FriendRating",
    "layout": {
      "direction": "horizontal",
      "gap": 8
    },
    "children": [
      {
        "nodeType": "instance",
        "name": "UserAvatar",
        "ref": "avatar",  // References Avatar from other file
        "variantProps": { "size": "small" }
      },
      {
        "nodeType": "text",
        "id": "name",
        "name": "Name",
        "text": "John Doe"
      }
    ]
  }]
}
```

Select both files → FriendRating correctly gets Avatar instances!

### Duplicate ID Detection

If multiple files define components with the same `id`, the plugin will show an error:

```
❌ Duplicate component ID 'button' found in multiple files
```

**Fix:** Ensure all component IDs are unique across all files.

---

## Organization Configuration

Control how components are positioned and organized in Figma.

### Structure

The `organization` field is an optional root-level configuration:

```json
{
  "organization": {
    "groupBy": "category",
    "layout": "frames",
    "gridColumns": 4,
    "spacing": 100,
    "sortBy": "alphabetical",
    "frameLabels": true,
    "pagePrefixes": false
  },
  "components": [...],
  "componentSets": [...]
}
```

### All Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupBy` | `'category'` \| `'tags'` \| `'none'` | `'category'` | How to group components |
| `layout` | `'frames'` \| `'pages'` \| `'grid'` | `'frames'` | Where to place groups |
| `gridColumns` | number | `4` | Columns per grid row |
| `spacing` | number | `100` | Pixels between components |
| `sortBy` | `'alphabetical'` \| `'schema-order'` | `'schema-order'` | Sort order within groups |
| `frameLabels` | boolean | `true` | Show category labels (frames layout only) |
| `pagePrefixes` | boolean | `false` | Add "Components/" prefix (pages layout only) |

**All fields are optional.** If you omit the entire `organization` object, defaults are used.

---

### Grouping Options

#### By Category (default)

Groups components by their `category` field:

```json
{
  "organization": { "groupBy": "category" },
  "components": [
    { "id": "btn", "name": "Button", "category": "Actions", ... },
    { "id": "card", "name": "Card", "category": "Layout", ... }
  ]
}
```

**Result:** Separate groups for "Actions", "Layout", etc.

Components without a `category` field are placed in an "Uncategorized" group.

#### By Tags

Groups components by their **first tag**:

```json
{
  "organization": { "groupBy": "tags" },
  "components": [
    { "id": "btn", "name": "Button", "tags": ["interactive", "core"], ... }
  ]
}
```

**Result:** Components grouped by "interactive", "core", etc.

Components without `tags` are placed in an "Untagged" group.

#### No Grouping

All components in a single flat layout:

```json
{
  "organization": { "groupBy": "none", "layout": "grid" }
}
```

**Use case:** Small libraries (5-15 components) or when you want full manual control.

---

### Layout Modes

#### Frames (default)

Creates labeled section frames on the current page:

```json
{
  "organization": { "layout": "frames" }
}
```

**Result:**
```
Current Page
├── [Chat]
│   ├── SendButton
│   ├── QuickSelect
│   └── Avatar
├── [Forms]
│   ├── TextField
│   └── Checkbox
└── [Navigation]
    └── NavItem
```

- Each group gets a frame with a label (if `frameLabels: true`)
- Frames are positioned horizontally with `spacing` pixels between them
- Clean, organized view on a single page

**Best for:** Medium libraries (20-50 components)

#### Pages

Creates separate pages for each group:

```json
{
  "organization": {
    "layout": "pages",
    "pagePrefixes": true
  }
}
```

**Result:**
```
Figma Pages:
├── Components/Chat
├── Components/Forms
└── Components/Navigation
```

- Each group gets its own page
- Components laid out in a grid on each page
- Optional "Components/" prefix with `pagePrefixes: true`

**Best for:** Large libraries (50+ components)

#### Grid

Flat grid layout with no grouping:

```json
{
  "organization": {
    "layout": "grid",
    "gridColumns": 6,
    "spacing": 80
  }
}
```

**Result:** Simple grid on current page, `gridColumns` components per row.

**Best for:** Very small libraries or single-group imports

---

### Sorting Options

#### Schema Order (default)

Components appear in the order they're defined in JSON:

```json
{
  "organization": { "sortBy": "schema-order" },
  "components": [
    { "id": "button", "name": "Button" },
    { "id": "input", "name": "Input" },
    { "id": "checkbox", "name": "Checkbox" }
  ]
}
```

**Result:** Button → Input → Checkbox (exactly as in JSON)

**Use case:** When you want full control over component order

#### Alphabetical

Components sorted A-Z by name within each group:

```json
{
  "organization": { "sortBy": "alphabetical" }
}
```

**Result:** Button → Checkbox → Input (alphabetical)

**Use case:** Large libraries where alphabetical sorting helps designers find components

---

### Complete Examples

#### Small Library (10-20 components)

Use defaults - simple and effective:

```json
{
  "components": [...]
}
```

**Result:** Components grouped by category, in labeled frames on current page.

---

#### Large Library (50+ components)

Use pages for better organization:

```json
{
  "organization": {
    "layout": "pages",
    "sortBy": "alphabetical",
    "pagePrefixes": true
  },
  "components": [
    { "id": "btn", "name": "Button", "category": "Actions", ... },
    { "id": "card", "name": "Card", "category": "Layout", ... },
    ...
  ]
}
```

**Result:**
```
Pages:
├── Components/Actions (Button sorted alphabetically)
└── Components/Layout (Card sorted alphabetically)
```

---

#### Dense Layout

Fit more components on screen:

```json
{
  "organization": {
    "gridColumns": 8,
    "spacing": 50,
    "frameLabels": false
  },
  "components": [...]
}
```

**Result:** 8 columns, 50px spacing, no frame labels

---

#### Tag-Based Organization

Group by feature instead of category:

```json
{
  "organization": {
    "groupBy": "tags",
    "layout": "frames"
  },
  "components": [
    { "id": "btn", "name": "Button", "tags": ["core", "interactive"], ... },
    { "id": "input", "name": "Input", "tags": ["core", "form"], ... }
  ]
}
```

**Result:** Groups: "core", "interactive", "form" (based on first tag)

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
  "paddingTopToken": "spacing.sm",
  "paddingRight": 16,
  "paddingRightToken": "spacing.md",
  "paddingBottom": 8,
  "paddingBottomToken": "spacing.sm",
  "paddingLeft": 16,
  "paddingLeftToken": "spacing.md",
  "paddingToken": "spacing.md",
  "gap": 8,
  "gapToken": "spacing.sm",
  "wrap": true,
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
| `paddingTopToken` | string | Top padding token | `paddingTop` (bound to variable) |
| `paddingRight` | number | Right padding | `paddingRight` |
| `paddingRightToken` | string | Right padding token | `paddingRight` (bound to variable) |
| `paddingBottom` | number | Bottom padding | `paddingBottom` |
| `paddingBottomToken` | string | Bottom padding token | `paddingBottom` (bound to variable) |
| `paddingLeft` | number | Left padding | `paddingLeft` |
| `paddingLeftToken` | string | Left padding token | `paddingLeft` (bound to variable) |
| `gap` | number | Space between items | `itemSpacing` |
| `gapToken` | string | Gap token | `itemSpacing` (bound to variable) |
| `wrap` | boolean | Enable flex-wrap | `layoutWrap` (`WRAP` or `NO_WRAP`) |
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

### Wrap Explained

**Use case:** Multi-line layouts like tag lists, pill containers, or chip groups.

**Example - Tag list with wrapping:**
```json
{
  "direction": "horizontal",
  "wrap": true,
  "gap": 8,
  "alignItems": "start"
}
```

When `wrap: true`, items overflow to the next row/column instead of clipping or overflowing the container.

### Padding Tokens Explained

**Per-side padding tokens** enable asymmetric padding with design system values.

**Example - Card with different vertical/horizontal padding:**
```json
{
  "paddingTopToken": "spacing.lg",
  "paddingRightToken": "spacing.md",
  "paddingBottomToken": "spacing.lg",
  "paddingLeftToken": "spacing.md"
}
```

**Validation:** Cannot specify both raw value and token (e.g., both `paddingTop` and `paddingTopToken`).

---

## Style Properties

Visual styling with design token bindings.

### All Style Fields

```json
{
  "fillToken": "color.surface",
  "fill": { "type": "linear", "angle": 90, "stops": [...] },
  "strokeToken": "color.border",
  "strokeWidth": 1,
  "strokeDash": [4, 4],
  "strokeAlign": "inside",
  "strokeSides": ["top", "bottom"],
  "radiusToken": "radius.md",
  "shadowToken": "shadow.sm",
  "backgroundBlur": 20,
  "opacity": 0.9,
  "opacityToken": "opacity.high",
  "fillOpacity": 0.5,
  "fillOpacityToken": "opacity.medium"
}
```

### Field Reference

| Field | Type | Description | Figma Binding |
|-------|------|-------------|---------------|
| `fillToken` | string | Background color token | Color variable bound to fills |
| `fill` | GradientFill | Gradient fill (linear or radial) | `fills` array with gradient paint |
| `strokeToken` | string | Border color token | Color variable bound to strokes |
| `strokeWidth` | number | Border width in pixels | `strokeWeight` |
| `strokeDash` | number[] | Dash pattern for border | `dashPattern` (e.g., `[4, 4]` for dashed) |
| `strokeAlign` | `"inside"` \| `"center"` \| `"outside"` | Stroke position | `strokeAlign` |
| `strokeSides` | string[] | Sides to stroke | `strokeTopWeight`, etc. |
| `radiusToken` | string | Corner radius token | Number variable bound to all 4 corners |
| `shadowToken` | string | Shadow/effect token | Effect variable bound to effects |
| `backgroundBlur` | number | Background blur amount | `BACKGROUND_BLUR` effect |
| `opacity` | number (0-1) | Layer-level opacity | `node.opacity` |
| `opacityToken` | string | Layer-level opacity token | Number variable bound to opacity |
| `fillOpacity` | number (0-1) | Paint-level opacity | `paint.opacity` on fill |
| `fillOpacityToken` | string | Paint-level opacity token | Number variable bound to fill opacity |

**Token Resolution:** The plugin looks for Figma variables/styles with matching names.

**Example:** `"fillToken": "color.primary"` → Plugin finds variable named `color.primary` and binds it.

### Stroke Dash Explained

**Use case:** Dashed borders for secondary elements, dividers, or helper components.

**Common patterns:**
- `[4, 4]` - Standard dashed line (4px dash, 4px gap)
- `[2, 2]` - Fine dashed line
- `[8, 4]` - Long dashes
- `[1, 3]` - Dotted line

**Example - Dashed border pill:**
```json
{
  "strokeToken": "color.border.subtle",
  "strokeWidth": 1,
  "strokeDash": [4, 4],
  "radiusToken": "radius.full"
}
```

### Opacity Explained

**Layer-level opacity** (`opacity` / `opacityToken`):
- Affects the entire node including all children, fills, strokes, and effects
- Range: 0.0 (fully transparent) to 1.0 (fully opaque)
- Use case: Disabled states, ghost elements, overlays

**Paint-level opacity** (`fillOpacity` / `fillOpacityToken`):
- Only affects the fill color opacity (background)
- Does not affect strokes, shadows, or children
- Range: 0.0 (fully transparent) to 1.0 (fully opaque)
- Use case: Semi-transparent backgrounds while keeping text/borders opaque

**Example - Disabled button variant:**
```json
{
  "props": { "state": "disabled" },
  "opacity": 0.5  // Entire button becomes semi-transparent
}
```

**Example - Glassmorphism effect:**
```json
{
  "fillToken": "color.surface",
  "fillOpacity": 0.7,  // Semi-transparent background
  "shadowToken": "shadow.lg"  // Shadow stays fully visible
}
```

**Validation Rules:**
- Cannot specify both raw value and token (e.g., both `opacity` and `opacityToken`)
- Values must be between 0 and 1
- Both layer-level and paint-level opacity can be used together

### Gradient Fills

Instead of solid color tokens, you can use gradient fills for more complex backgrounds.

#### Linear Gradient

Creates a gradient along a straight line at a specified angle.

```json
{
  "fill": {
    "type": "linear",
    "angle": 90,
    "stops": [
      { "position": 0, "colorToken": "color.primary.500" },
      { "position": 1, "colorToken": "color.primary.700" }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"linear"` | Linear gradient type |
| `angle` | number | Gradient angle in degrees (0 = left-to-right, 90 = top-to-bottom) |
| `stops` | GradientStop[] | Array of color stops |

#### Radial Gradient

Creates a gradient radiating from a center point.

```json
{
  "fill": {
    "type": "radial",
    "centerX": 0.5,
    "centerY": 0.5,
    "stops": [
      { "position": 0, "color": "#FFFFFF", "opacity": 1 },
      { "position": 1, "color": "#000000", "opacity": 0.5 }
    ]
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `"radial"` | | Radial gradient type |
| `centerX` | number | 0.5 | Horizontal center (0-1, where 0.5 is center) |
| `centerY` | number | 0.5 | Vertical center (0-1, where 0.5 is center) |
| `stops` | GradientStop[] | | Array of color stops |

#### Gradient Stops

Each stop defines a color at a position along the gradient.

| Field | Type | Description |
|-------|------|-------------|
| `position` | number | Position from 0 (start) to 1 (end) |
| `color` | string | Hex color value (e.g., `"#FF5500"`) |
| `colorToken` | string | Color token reference (alternative to `color`) |
| `opacity` | number | Optional opacity (0-1), defaults to 1 |

**Example - Button with gradient background:**
```json
{
  "id": "gradient-button",
  "name": "GradientButton",
  "layout": { "direction": "horizontal", "padding": 16 },
  "fill": {
    "type": "linear",
    "angle": 135,
    "stops": [
      { "position": 0, "colorToken": "color.accent.start" },
      { "position": 1, "colorToken": "color.accent.end" }
    ]
  },
  "radiusToken": "radius.md"
}
```

### Stroke Options

Additional stroke customization beyond color and width.

#### Stroke Alignment

Control where the stroke is drawn relative to the shape boundary.

```json
{
  "strokeToken": "color.border",
  "strokeWidth": 2,
  "strokeAlign": "inside"
}
```

| Value | Description |
|-------|-------------|
| `"center"` | Stroke centered on the boundary (default) |
| `"inside"` | Stroke drawn inside the boundary |
| `"outside"` | Stroke drawn outside the boundary |

**Use cases:**
- `inside` - Prevents stroke from affecting layout size
- `outside` - For outline/halo effects
- `center` - Default CSS-like behavior

#### Individual Side Strokes

Apply strokes to specific sides only (useful for borders, dividers).

```json
{
  "strokeToken": "color.border",
  "strokeWidth": 1,
  "strokeSides": ["bottom"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `strokeSides` | string[] | Array of sides: `"top"`, `"right"`, `"bottom"`, `"left"` |

**Example - Card with bottom border:**
```json
{
  "id": "list-item",
  "name": "ListItem",
  "layout": { "direction": "horizontal", "padding": 12 },
  "strokeToken": "color.border.subtle",
  "strokeWidth": 1,
  "strokeSides": ["bottom"]
}
```

**Example - Input field with underline:**
```json
{
  "strokeToken": "color.border.input",
  "strokeWidth": 2,
  "strokeSides": ["bottom"],
  "strokeAlign": "inside"
}
```

**Note:** When using `strokeSides`, the stroke is applied only to the specified sides. All four sides can be combined: `["top", "right", "bottom", "left"]`.

---

## Child Nodes

Components can contain five types of child nodes.

### Node ID Stability

Each child node's `id` field is stored in Figma's pluginData (`jasoti.nodeId`), ensuring reliable identification even if node names change. This enables:

- **Reliable text overrides**: Text overrides match by schema ID (not name), preventing errors when multiple nodes share the same name
- **Regeneration safety**: Re-running the plugin on the same schema preserves node identities
- **Refactoring support**: Renaming nodes in Figma doesn't break schema references

When using text overrides (see [Instance Node](#instance-node)), the plugin preferentially matches by this stored ID, falling back to name matching for backward compatibility with older components.

### Node Types

| Type | Use Case | Example |
|------|----------|---------|
| `frame` | Nested containers | Icon wrapper, content section |
| `text` | Text labels | Button label, card title |
| `rectangle` | Simple shapes | Divider, background |
| `ellipse` | Circles and ovals | Status dot, avatar placeholder |
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
- `imageUrl`: URL to fetch and apply as image fill
- `imageScaleMode`: `"FILL"` (default), `"FIT"`, `"CROP"`, or `"TILE"`
- `backgroundBlur`: Blur amount in pixels (for glassmorphism effects)

### Background Blur

Apply a blur effect to content behind a frame (glassmorphism/frosted glass effect).

```json
{
  "nodeType": "frame",
  "id": "glass-card",
  "name": "GlassCard",
  "backgroundBlur": 20,
  "fillToken": "color.surface.glass",
  "fillOpacity": 0.7,
  "radiusToken": "radius.lg"
}
```

**Notes:**
- Combine with semi-transparent fills (`fillOpacity`) for the best effect
- Higher values (20-40) create a stronger frosted glass appearance
- Works on frames, components, and component sets

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

Simple rectangle shape (for dividers, backgrounds, image placeholders).

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
- `fillToken`, `strokeToken`, `strokeWidth`, `strokeDash`, `radiusToken`
- `opacity`, `opacityToken`, `fillOpacity`, `fillOpacityToken`
- `imageUrl`: URL to fetch and apply as image fill
- `imageScaleMode`: `"FILL"` (default), `"FIT"`, `"CROP"`, or `"TILE"`

**Example - Image placeholder:**
```json
{
  "nodeType": "rectangle",
  "id": "hero-image",
  "name": "HeroImage",
  "layout": { "width": 400, "height": 300 },
  "imageUrl": "https://picsum.photos/400/300",
  "imageScaleMode": "FILL",
  "radiusToken": "radius.md"
}
```

---

### Ellipse Node

Native ellipse/circle shape (better than rectangle + full radius workaround).

```json
{
  "nodeType": "ellipse",
  "id": "status-dot",
  "name": "StatusDot",
  "layout": {
    "width": 8,
    "height": 8
  },
  "fillToken": "color.success"
}
```

**Required:**
- `nodeType`: `"ellipse"`
- `id`: Unique within parent
- `name`: Figma layer name

**Optional:**
- `layout`: Only `width` and `height` supported
- `fillToken`, `strokeToken`, `strokeWidth`, `strokeDash`
- `opacity`, `opacityToken`, `fillOpacity`, `fillOpacityToken`

**Use Cases:**
- **Perfect circles**: Set `width` and `height` to the same value
- **Ovals**: Use different `width` and `height` values
- **Status indicators**: Small colored dots (e.g., online/offline status)
- **Avatar placeholders**: Circular image placeholders

**Example - Online status indicator:**
```json
{
  "nodeType": "ellipse",
  "id": "online-status",
  "name": "OnlineStatus",
  "layout": {
    "width": 12,
    "height": 12
  },
  "fillToken": "color.status.online",
  "strokeToken": "color.surface",
  "strokeWidth": 2
}
```

---

## Icon Libraries

JASOTI supports referencing icons from libraries like Lucide and Material using human-readable names.

### Setup

1. **Enable the icon library** in Figma (Assets panel → Libraries)
2. **Extract the registry:**
   - Open JASOTI → Enter library name (e.g., "lucide")
   - Place icons from the library into your file
   - Click Extract → Copy JSON
3. **Save registry file** to your project:
   ```
   figma-components/registries/lucide.json
   ```
4. **Select registry files** alongside component files when generating

### Registry File Format

```json
{
  "type": "icon-registry",
  "library": "lucide",
  "figmaLibraryName": "Lucide Icons",
  "extractedAt": "2025-01-02T10:00:00Z",
  "icons": {
    "search": "component-key-abc123",
    "home": "component-key-def456",
    "settings": "component-key-ghi789"
  }
}
```

### Using iconRef

Reference icons with `library:iconName` format:

```json
{
  "nodeType": "instance",
  "name": "SearchIcon",
  "iconRef": "lucide:search"
}
```

### Comparison

| Approach | Use Case |
|----------|----------|
| `ref` | Local components from same schema |
| `iconRef` | Icons from registered libraries (Lucide, Material, etc.) |
| `componentKey` | Direct key for unregistered library components |

### Missing Icon Behavior

If an icon can't be imported, JASOTI creates a visible placeholder:
- Red dashed border
- Original size preserved
- Warning in results panel

This prevents layout collapse and makes missing icons obvious.

---

### Instance Node

References another component (local or from a published library).

**Local component reference:**
```json
{
  "nodeType": "instance",
  "name": "SubmitButton",
  "ref": "button",
  "variantProps": { "type": "primary", "state": "default" }
}
```

**Published library component (e.g., Lucide icons):**
```json
{
  "nodeType": "instance",
  "name": "SearchIcon",
  "componentKey": "abc123def456789..."
}
```

**Required:**
- `nodeType`: `"instance"`
- `name`: Figma layer name
- One of:
  - `ref`: Local component ID (from same schema)
  - `iconRef`: Icon library reference (e.g., `"lucide:search"`)
  - `componentKey`: Direct library component key

**Optional:**
- `id`: Schema node ID (for tracking)
- `variantProps`: Select variant (works with both `ref` and `componentKey`)
- `overrides`: Override nested elements (text, visibility, instance swaps)
- `layout`: Override `width` and/or `height`

### Instance Overrides

The `overrides` object lets you customize nested elements within an instance by targeting them by name or ID.

**Override types:**

| Override | Type | Description |
|----------|------|-------------|
| `text` | string | Override text content |
| `visible` | boolean | Show or hide the element |
| `swap` | string | Swap instance using iconRef format (e.g., `"lucide:check"`) |
| `swapComponentKey` | string | Swap instance using direct component key |
| `swapRef` | string | Swap instance using local component ref |

**Example - Combined overrides:**
```json
{
  "nodeType": "instance",
  "ref": "button",
  "overrides": {
    "icon": { "swap": "lucide:check" },
    "label": { "text": "Confirm" },
    "badge": { "visible": false }
  }
}
```

**Example - Swap with component key:**
```json
{
  "nodeType": "instance",
  "ref": "list-item",
  "overrides": {
    "avatar": { "swapComponentKey": "abc123def456..." },
    "status": { "swapRef": "status-indicator" }
  }
}
```

**Override matching:** The plugin matches override keys to nested elements by:
1. Schema node ID stored in pluginData (preferred)
2. Element name (fallback for older components)

**How to get a componentKey:**
1. Ensure the library is enabled in your Figma file (Assets panel → Team library)
2. Right-click a component in the Assets panel
3. "Copy/Paste as" → "Copy link"
4. The key is embedded in the URL, or use Dev Mode's "Copy component key"

---

## Design Token Binding

### How Tokens Work

1. **You define tokens** in your design system (JSON, YAML, etc.)
2. **Tokens Studio syncs to Figma** creating variables and text styles
3. **JASOTI references tokens** by name using `*Token` fields
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

**Smart resolution with multiple fallback strategies.** The plugin tries several naming patterns to find your tokens, adapting to different Tokens Studio configurations.

#### Resolution Strategies

When you reference a token like `"fillToken": "semantic.color.primary.default"`, the plugin tries in order:

1. **Exact match**: `semantic.color.primary.default`
2. **Dot-to-slash**: `semantic/color/primary/default` (common Tokens Studio format)
3. **Strip prefixes**: `color.primary.default`, `color/primary/default` (handles collection names)
4. **Partial match**: Any variable ending in `/default` or `.default`
5. **Similarity**: Suggests closest matching names if nothing found

#### Supported Prefixes

These prefixes are automatically tried when stripping:
- `semantic.` / `semantic/`
- `primitives.` / `primitives/`
- `core.` / `core/`
- `tokens.` / `tokens/`

For text styles:
- `typography.` / `typography/`
- `text.` / `text/`
- `font.` / `font/`

#### Examples

✅ All of these work:
```json
{
  "fillToken": "semantic.color.primary",
  // Matches: semantic/color/primary (Tokens Studio slash format)

  "fillToken": "semantic.color.primary.default",
  // Matches: color/primary/default (in "semantic" collection)

  "textStyleToken": "typography.label-large",
  // Matches: Typography/label-large (capitalized Figma style)

  "paddingToken": "core.spacing.md",
  // Matches: spacing/md (in "core" collection)
}
```

#### Case Sensitivity

Variable names are case-sensitive, but text styles try capitalization variants automatically.

### Missing Tokens

If a token isn't found after all resolution strategies, the plugin:
1. Shows a detailed warning in the UI with helpful suggestions
2. Generates the component anyway (without that style applied)
3. Continues processing other components

Example warning with suggestions:
```
⚠ Variable 'semantic.color.primary' not found
  Tried: semantic.color.primary, semantic/color/primary, color.primary, color/primary, */primary
  💡 Did you mean: 'semantic/color/secondary'?
  Available: semantic/color/secondary, semantic/color/tertiary, ...
```

This helps you quickly identify and fix token naming mismatches.

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

**Same rule applies to:**
- `opacity` / `opacityToken`
- `fillOpacity` / `fillOpacityToken`
- `gap` / `gapToken`
- `paddingTop` / `paddingTopToken`
- `paddingRight` / `paddingRightToken`
- `paddingBottom` / `paddingBottomToken`
- `paddingLeft` / `paddingLeftToken`

---

### Type Validation

**wrap must be boolean:**

❌ **Invalid:**
```json
{
  "layout": {
    "wrap": "true"  // String, not boolean!
  }
}
```

**Error:** `"wrap must be a boolean"`

✅ **Valid:**
```json
{
  "layout": {
    "wrap": true
  }
}
```

**strokeDash must be array of numbers:**

❌ **Invalid:**
```json
{
  "strokeDash": "4, 4"  // String, not array!
}
```

**Error:** `"strokeDash must be an array"`

❌ **Invalid:**
```json
{
  "strokeDash": [4, "4"]  // Mixed types!
}
```

**Error:** `"strokeDash must be an array of numbers"`

✅ **Valid:**
```json
{
  "strokeDash": [4, 4]
}
```

---

### Opacity Range Validation

Opacity values must be between 0 (fully transparent) and 1 (fully opaque).

❌ **Invalid:**
```json
{
  "opacity": 1.5  // Out of range!
}
```

**Error:** `"opacity must be between 0 and 1"`

❌ **Invalid:**
```json
{
  "fillOpacity": -0.2  // Out of range!
}
```

**Error:** `"fillOpacity must be between 0 and 1"`

✅ **Valid:**
```json
{
  "opacity": 0.5,
  "fillOpacity": 0.8
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
- One of: `ref` ✓ or `componentKey` ✓

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

### Nesting Depth Limit

Child nodes cannot be nested deeper than 50 levels to prevent stack overflow.

❌ **Invalid:**
```json
{
  "children": [
    {
      "nodeType": "frame",
      "id": "level1",
      "name": "Level1",
      "children": [
        {
          "nodeType": "frame",
          "id": "level2",
          "name": "Level2",
          "children": [
            // ... 48 more levels ...
            {
              "nodeType": "frame",
              "id": "level51",
              "name": "Level51"  // Too deep!
            }
          ]
        }
      ]
    }
  ]
}
```

**Error:** `"Maximum nesting depth (50) exceeded"`

**Note:** This limit is extremely generous and should never be hit in normal use cases. If you encounter this error, your schema likely has a structural issue.

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

### "Text override matched by name (not schema ID)"

**Cause:** Referenced component was generated with an older plugin version that didn't store node IDs in pluginData.

**Impact:** Text overrides work but are less reliable if multiple nodes have the same name.

**Fix:** Regenerate the referenced component using the latest plugin version. After regeneration, text overrides will use reliable schema ID matching.

---

## Need Help?

- **Examples:** See `examples/buttons.json` in the repo
- **Design Spec:** See `docs/plans/2025-11-24-json2components-design.md`
- **Issues:** https://github.com/roic/jasoti/issues
