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
| Identifiers | Stable `id` fields for all components and nodes |

## Overwrite Behavior

**Components created by this plugin are fully owned by the JSON definition.** On re-generation, their internal structure and styles are completely replaced. Designers should treat generated components as artifacts during the bootstrapping phase, not hand-tweaked pieces.

The plugin uses stable `id` fields (stored in Figma pluginData) to identify which components to overwrite. This survives Figma layer renames.

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
  "id": "button",
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

**Fields:**
- `id` (required) - stable identifier, used for references and pluginData
- `name` (required) - human-friendly Figma layer name (can be changed)
- `description` (optional) - component description
- `variantProps` (required) - array of variant property names; each becomes a Figma variant property
- `base` (required) - shared layout, tokens, and children inherited by all variants
- `variants` (required) - array of variant definitions; each overrides base properties

Variants inherit everything from `base` and only override what's different (root-level tokens only).

### Standalone Component

```json
{
  "id": "chatbox",
  "name": "ChatBox",
  "description": "Message input with send button",
  "layout": { ... },
  "fillToken": "color.bg.surface",
  "children": [...]
}
```

**Fields:**
- `id` (required) - stable identifier
- `name` (required) - Figma layer name
- `description` (optional) - component description
- `layout` (required) - layout properties
- `children` (optional) - array of child nodes

### Layout Properties

```json
{
  "layout": {
    "direction": "horizontal",
    "padding": 12,
    "paddingTop": 8,
    "paddingRight": 8,
    "paddingBottom": 8,
    "paddingLeft": 8,
    "gap": 8,
    "alignItems": "center",
    "justifyContent": "center",
    "width": 120,
    "height": 40
  },
  "fillToken": "color.bg.primary",
  "strokeToken": "color.border.default",
  "strokeWidth": 1,
  "radiusToken": "radius.md",
  "shadowToken": "shadow.sm"
}
```

**Layout fields:**
- `direction` - `"horizontal"` | `"vertical"` (maps to Figma `layoutMode`)
- `padding` - uniform padding (number), OR use per-side values
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` - per-side padding
- `paddingToken` - token for uniform padding (mutually exclusive with `padding`)
- `gap` - item spacing (number)
- `gapToken` - token for gap (mutually exclusive with `gap`)
- `alignItems` - `"center"` | `"start"` | `"end"` | `"stretch"` (maps to `counterAxisAlignItems`)
- `justifyContent` - `"start"` | `"center"` | `"end"` | `"space-between"` (maps to `primaryAxisAlignItems`)
- `width`, `height` - see sizing rules below

**Sizing rules (maps to Figma auto-layout sizing):**
- `"fill"` → `layoutSizingHorizontal/Vertical = "FILL"` (fill parent)
- `"hug"` → `layoutSizingHorizontal/Vertical = "HUG"` (fit content)
- `120` (number) → `layoutSizingHorizontal/Vertical = "FIXED"` with explicit size

**Token vs raw value rule:**
Specifying both a raw value and a token for the same property is a **schema validation error**:
```
Error: Component "button" specifies both "padding" and "paddingToken". Use one or the other.
```

### Node Types

| `nodeType` | Description |
|------------|-------------|
| `"frame"` | Nested frame with its own layout and children |
| `"text"` | Text node with optional content |
| `"instance"` | Instance of another component (by `ref` id) |
| `"rectangle"` | Simple rectangle (for dividers, backgrounds) |

### Frame Node

```json
{
  "nodeType": "frame",
  "id": "icon-wrapper",
  "name": "IconWrapper",
  "layout": {
    "direction": "horizontal",
    "padding": 4,
    "alignItems": "center"
  },
  "fillToken": "color.bg.subtle",
  "radiusToken": "radius.sm",
  "children": [...]
}
```

### Text Node

```json
{
  "nodeType": "text",
  "id": "label-text",
  "name": "Label",
  "text": "Button",
  "textStyleToken": "typography.button.label",
  "fillToken": "color.text.primary"
}
```

**Fields:**
- `id` (required) - stable identifier for overrides
- `name` (required) - Figma layer name
- `text` (optional) - text content, defaults to empty string
- `textStyleToken` (optional) - Figma text style name
- `fillToken` (optional) - text color variable

### Instance Node

```json
{
  "nodeType": "instance",
  "id": "send-button",
  "ref": "button",
  "variantProps": {
    "type": "primary",
    "state": "default"
  },
  "overrides": {
    "label-text": { "text": "Submit" }
  },
  "layout": {
    "width": "fill"
  }
}
```

**Fields:**
- `id` (optional) - stable identifier for this instance
- `ref` (required) - references component/componentSet by `id` (not name)
- `variantProps` (optional) - if ref is a componentSet, specifies which variant
- `overrides` (optional) - keyed by child node `id`, see override rules below
- `layout` (optional) - sizing overrides for the instance

**Reference resolution:**
1. Plugin looks up `ref` value against all component and componentSet `id` fields
2. If it's a componentSet and `variantProps` is specified → finds exact variant match
3. If it's a componentSet and no `variantProps` → uses first variant (default)

### Rectangle Node

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

Rectangles are purely visual elements with no children.

### Override Rules (v1)

**v1 supports text content overrides only:**

```json
"overrides": {
  "label-text": { "text": "Submit" }
}
```

- Keys are child node `id` values (not names)
- Values specify what to override
- v1 limitation: only `text` property can be overridden

**Not supported in v1:**
- Token overrides on instances
- Visibility toggles
- Nested/deep overrides

Workaround: if you need different styling per instance, create separate variants.

## Dependency Resolution

The plugin auto-resolves dependencies:

1. Parse the entire JSON file
2. Build a dependency graph: any `instance` node with `ref: "X"` implies a dependency on component/componentSet with `id: "X"`
3. Topologically sort to determine build order
4. Generate leaf components first (no dependencies), then composites

**Circular dependency detection:**
If Button references ChatBox which references Button → error:
```
Circular dependency detected: button → chatbox → button
```

## Token Resolution

**Token types and what they map to:**

| Token property | Figma target |
|----------------|--------------|
| `fillToken` | Figma color variable |
| `strokeToken` | Figma color variable |
| `radiusToken` | Figma number variable |
| `shadowToken` | Figma effect variable |
| `paddingToken` | Figma number variable |
| `gapToken` | Figma number variable |
| `textStyleToken` | Figma text style (not variable) |

**Resolution rules:**
- Exact name match: `fillToken: "color.button.primary.bg"` → variable named `color.button.primary.bg`
- All tokens resolved upfront before generation begins
- Missing token → **warning** (generates anyway with no fill/style applied)
- Plugin does NOT fail on missing tokens; shows warnings in UI

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
│    └─ depends on: button, input │
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
3. Shows token resolution status (found/missing as warnings)
4. User reviews, clicks "Generate"
5. Components created on current page, positioned in a grid
6. Plugin stores `id` in pluginData on each generated component

## Error Handling

| Error type | Behavior |
|------------|----------|
| Invalid JSON syntax | Show parse error with line number |
| Missing required field | "Component at index 2 missing 'id' field" |
| Duplicate id | "Duplicate id 'button' found" |
| Both token and raw value | "Component 'button' specifies both 'padding' and 'paddingToken'" |
| Missing token | **Warning only** - generates with no fill/style applied |
| Unknown ref | "Instance references unknown id 'foo'" |
| Circular dependency | Blocks generation with clear error message |

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
│   │   ├── tokenMapper.ts  # Token name → Figma variable/style lookup
│   │   └── generator.ts    # Build Figma nodes from definitions
│   └── utils/
│       └── figmaHelpers.ts # Wrappers for Figma API calls
└── examples/
    └── buttons.json        # Example JSON for testing
```

## Data Flow

```
JSON File → parser.ts (validate schema, check for conflicts)
         → resolver.ts (build dependency graph, topological sort)
         → tokenMapper.ts (resolve all tokens upfront, collect warnings)
         → generator.ts (create Figma nodes, store pluginData)
```

## Testing Strategy

The schema is pure JSON and logic is cleanly separated, enabling unit tests without Figma:
- `parser.ts` - test validation rules, error messages
- `resolver.ts` - test dependency ordering, cycle detection
- `tokenMapper.ts` - test token lookup logic (mock Figma API)

## Complete JSON Example

```json
{
  "componentSets": [
    {
      "id": "button",
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
            "id": "label-text",
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
      "id": "chatbox",
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
          "id": "message-input",
          "ref": "input",
          "layout": { "width": "fill" }
        },
        {
          "nodeType": "instance",
          "id": "send-button",
          "ref": "button",
          "variantProps": { "type": "primary", "state": "default" },
          "overrides": { "label-text": { "text": "Send" } }
        }
      ]
    }
  ]
}
```

## v1 Limitations (Documented)

These are explicitly not supported in v1:

| Limitation | Workaround |
|------------|------------|
| Variant-level child overrides | Restructure token naming or create separate components |
| Instance token overrides | Create additional variants |
| Visibility toggles | Not supported |
| Load from URL | Use file picker |
| Dry run / preview mode | Review component list before generating |

## Out of Scope (Not Building)

- Round-trip sync (Figma → JSON)
- Token management (Tokens Studio handles this)
- Partial/incremental updates
- Change detection/diffing
