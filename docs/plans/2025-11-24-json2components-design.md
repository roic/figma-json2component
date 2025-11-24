# JSON2Components Design

## Overview

A Figma plugin that generates components (with nested hierarchies and variants) from a JSON schema that references design tokens. It's a **bootstrapping tool** - use it to scaffold your component library, then delete the JSON. Tokens Studio handles ongoing token value sync.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Tool type | Bootstrapping/scaffolding (not continuous sync) |
| JSON input | File picker |
| Token matching | Flat dot notation, exact name match |
| Variant schema | Explicit component sets with base inheritance |
| Nesting | Full support with auto dependency resolution |
| Token types | Colors, radius, typography, shadows, spacing |
| Conflict handling | Full overwrite (JSON is temporary) |

## JSON Schema

### Top-level Structure

```json
{
  "components": [...],
  "componentSets": [...]
}
```

- `components` - standalone components (no variants)
- `componentSets` - component sets with variants (using inheritance)

### Component Set (with variants)

```json
{
  "name": "Button",
  "description": "Action buttons",
  "variantProps": ["type", "state"],
  "base": {
    "layout": { ... },
    "radiusToken": "radius.md",
    "children": [...]
  },
  "variants": [
    { "props": { "type": "primary", "state": "default" }, "fillToken": "color.button.primary.bg" },
    { "props": { "type": "primary", "state": "hover" }, "fillToken": "color.button.primary.hover" }
  ]
}
```

Variants inherit everything from `base` and only override what's different.

### Standalone Component

```json
{
  "name": "ChatBox",
  "description": "Message input with send button",
  "layout": { ... },
  "fillToken": "color.bg.surface",
  "children": [...]
}
```

### Layout Properties

```json
{
  "layout": {
    "direction": "horizontal" | "vertical",
    "padding": 12,
    "paddingToken": "spacing.md",
    "paddingTop": 8,
    "paddingRight": 8,
    "paddingBottom": 8,
    "paddingLeft": 8,
    "gap": 8,
    "gapToken": "spacing.sm",
    "alignItems": "center" | "start" | "end" | "stretch",
    "justifyContent": "start" | "center" | "end" | "space-between",
    "width": 120 | "fill" | "hug",
    "height": 40 | "fill" | "hug"
  },
  "fillToken": "color.bg.primary",
  "strokeToken": "color.border.default",
  "strokeWidth": 1,
  "radiusToken": "radius.md",
  "shadowToken": "shadow.sm"
}
```

### Node Types

| `nodeType` | Description |
|------------|-------------|
| `"frame"` | Nested frame with its own layout and children |
| `"text"` | Text node with optional content |
| `"instance"` | Instance of another component (by `ref` name) |
| `"rectangle"` | Simple rectangle (for dividers, backgrounds) |

### Instance Node

```json
{
  "nodeType": "instance",
  "ref": "Button",
  "variantProps": {
    "type": "primary",
    "state": "default"
  },
  "overrides": {
    "Label": "Submit"
  },
  "layout": {
    "width": "fill"
  }
}
```

### Text Node

```json
{
  "nodeType": "text",
  "name": "Label",
  "text": "Button",
  "textStyleToken": "typography.button.label",
  "fillToken": "color.text.primary"
}
```

## Dependency Resolution

The plugin auto-resolves dependencies:

1. Parse the entire JSON file
2. Build a dependency graph (which components reference which)
3. Topologically sort to determine build order
4. Generate leaf components first, then composites

Circular dependencies are detected and reported as errors.

## Token Resolution

- Any property ending in `Token` gets resolved to a Figma variable
- Exact name match: `fillToken: "color.button.primary.bg"` → variable named `color.button.primary.bg`
- All tokens resolved upfront before generation (fail fast)
- Missing token → warning (generates anyway with no fill/style applied)

## Plugin UI

```
┌─────────────────────────────────┐
│  JSON2Components                │
├─────────────────────────────────┤
│  [Select JSON File...]          │
│                                 │
│  📄 buttons.json                │
│     ✓ Parsed successfully       │
├─────────────────────────────────┤
│  Components to generate:        │
│                                 │
│  ☑ Button (component set)       │
│    └─ 4 variants                │
│  ☑ Input (component set)        │
│    └─ 3 variants                │
│  ☑ ChatBox (component)          │
│    └─ depends on: Button, Input │
├─────────────────────────────────┤
│  Token status:                  │
│  ✓ 12 tokens resolved           │
│  ⚠ 1 warning (see below)        │
│                                 │
│  ⚠ "shadow.lg" not found        │
├─────────────────────────────────┤
│  [ Generate Components ]        │
└─────────────────────────────────┘
```

## Workflow

1. Click "Select JSON File" → native file picker
2. Plugin parses, validates, shows component list with dependency info
3. Shows token resolution status (found/missing)
4. User reviews, clicks "Generate"
5. Components created on current page, positioned in a grid

## Error Handling

- Invalid JSON → show parse error with line number
- Missing required fields → "Component 'X' missing 'name' field"
- Missing token → warning (generates anyway with no fill/style applied)
- Circular dependency → blocks generation with clear error

## Technical Architecture

```
figma-json2component/
├── manifest.json           # Figma plugin manifest
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts             # Plugin entry (Figma sandbox)
│   ├── ui.html             # Plugin UI (iframe)
│   ├── ui.ts               # UI logic
│   ├── types/
│   │   └── schema.ts       # TypeScript interfaces for JSON schema
│   ├── core/
│   │   ├── parser.ts       # JSON parsing & validation
│   │   ├── resolver.ts     # Dependency graph & topological sort
│   │   ├── tokenMapper.ts  # Token name → Figma variable lookup
│   │   └── generator.ts    # Build Figma nodes from definitions
│   └── utils/
│       └── figmaHelpers.ts # Wrappers for Figma API calls
└── examples/
    └── buttons.json        # Example JSON for testing
```

## Data Flow

```
JSON File → parser.ts (validate)
         → resolver.ts (dependency order)
         → tokenMapper.ts (resolve all tokens upfront)
         → generator.ts (create Figma nodes)
```

## Complete JSON Example

```json
{
  "componentSets": [
    {
      "name": "Button",
      "description": "Action buttons",
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
            "name": "Label",
            "text": "Button",
            "textStyleToken": "typography.button.label"
          }
        ]
      },
      "variants": [
        { "props": { "type": "primary", "state": "default" }, "fillToken": "color.button.primary.bg" },
        { "props": { "type": "primary", "state": "hover" }, "fillToken": "color.button.primary.hover" },
        { "props": { "type": "secondary", "state": "default" }, "fillToken": "color.button.secondary.bg", "strokeToken": "color.border.default", "strokeWidth": 1 }
      ]
    }
  ],
  "components": [
    {
      "name": "ChatBox",
      "description": "Message input with send button",
      "layout": {
        "direction": "horizontal",
        "padding": 16,
        "gap": 12,
        "alignItems": "end",
        "width": 400,
        "height": "hug"
      },
      "fillToken": "color.bg.surface",
      "radiusToken": "radius.lg",
      "shadowToken": "shadow.md",
      "children": [
        {
          "nodeType": "instance",
          "ref": "Input",
          "layout": { "width": "fill" }
        },
        {
          "nodeType": "instance",
          "ref": "Button",
          "variantProps": { "type": "primary", "state": "default" },
          "overrides": { "Label": "Send" }
        }
      ]
    }
  ]
}
```

## Out of Scope (Explicitly Not Building)

- Round-trip sync (Figma → JSON)
- Token management (Tokens Studio handles this)
- Load from URL
- Partial/incremental updates
- Checksum tracking
- Change detection/diffing
