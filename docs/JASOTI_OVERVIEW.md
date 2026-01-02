# JASOTI - Comprehensive Overview

**JSON As Source Of Truth for Interfaces**

Version: 0.1.0 | Last Updated: January 2026

---

## Table of Contents

- [What is JASOTI?](#what-is-jasoti)
- [The Problem It Solves](#the-problem-it-solves)
- [Core Capabilities](#core-capabilities)
- [Architecture](#architecture)
- [Feature Deep Dive](#feature-deep-dive)
- [Technical Specifications](#technical-specifications)
- [Use Cases](#use-cases)
- [Limitations](#limitations)
- [Engineering Effort Estimate](#engineering-effort-estimate)

---

## What is JASOTI?

JASOTI is a Figma plugin that generates design components from declarative JSON schemas. Instead of manually creating components in Figma, designers and developers define their component library in JSON files that reference design tokens, and JASOTI generates the actual Figma components automatically.

**Key Insight:** JASOTI treats JSON as the single source of truth for component structure, making component creation reproducible, version-controllable, and synchronized with code.

### The Name

**J**SON **A**s **S**ource **O**f **T**ruth for **I**nterfaces

---

## The Problem It Solves

### Traditional Workflow Pain Points

1. **Manual Component Creation**: Designers spend hours building components in Figma, clicking through menus, setting auto-layout properties, applying tokens
2. **Drift Between Design and Code**: Component structures defined in Figma often diverge from what developers implement
3. **Token Synchronization**: Ensuring components use correct design tokens requires manual vigilance
4. **Regeneration Difficulty**: When token structures change, updating all components is tedious and error-prone
5. **No Version Control**: Figma components aren't easily diffable or version-controlled

### JASOTI's Solution

- **Declarative Definitions**: Define components in JSON - review, version, and diff like code
- **Token-First Design**: Reference tokens by name; JASOTI resolves and binds them
- **Reproducible Generation**: Same JSON → same components, every time
- **Regeneration Support**: Update JSON, regenerate - components update in place
- **Dependency Management**: Components can reference other components; JASOTI handles ordering

---

## Core Capabilities

### 1. Component Generation

Generate Figma components from JSON definitions:

```json
{
  "components": [{
    "id": "card",
    "name": "Card",
    "layout": {
      "direction": "vertical",
      "padding": 16,
      "gap": 12
    },
    "fillToken": "color.surface",
    "radiusToken": "radius.lg",
    "children": [...]
  }]
}
```

**Generates:** A Figma `ComponentNode` with auto-layout, bound variables, and child nodes.

### 2. ComponentSet Generation (Variants)

Create component sets with multiple variants:

```json
{
  "componentSets": [{
    "id": "button",
    "name": "Button",
    "variantProps": ["type", "state"],
    "base": { /* shared structure */ },
    "variants": [
      { "props": { "type": "primary", "state": "default" }, "fillToken": "color.primary" },
      { "props": { "type": "primary", "state": "hover" }, "fillToken": "color.primary.hover" }
    ]
  }]
}
```

**Generates:** A Figma `ComponentSetNode` with all variant combinations.

### 3. Design Token Integration

JASOTI supports multiple token types with intelligent resolution:

| Token Type | Schema Field | Figma Binding |
|------------|--------------|---------------|
| Colors | `fillToken`, `strokeToken` | Variable binding (COLOR) |
| Spacing | `paddingToken`, `gapToken` | Variable binding (FLOAT) |
| Radius | `radiusToken` | Variable binding (FLOAT) |
| Typography | `textStyleToken` | Text style reference |
| Shadows | `shadowToken` | Effect style reference |
| Opacity | `opacityToken`, `fillOpacityToken` | Variable binding (FLOAT) |

**Flexible Token Resolution:**
- Supports multiple naming conventions (slash, dot, kebab-case)
- Collection-aware lookups (`primitives/color/primary` → `color.primary`)
- Partial matching with suggestions for typos
- Pre-flight validation before generation

### 4. Node Types

JASOTI supports 5 node types for building component trees:

| Node Type | Purpose | Key Features |
|-----------|---------|--------------|
| `frame` | Container with auto-layout | Full layout control, nesting, styling |
| `text` | Text content | Text styles, fill colors, opacity |
| `instance` | Reference to another component | Local refs, library refs, icon refs, overrides |
| `rectangle` | Shape primitive | Fills, strokes, radius, images |
| `ellipse` | Circular/oval shapes | Fills, strokes, opacity |

### 5. Icon Library Support

Reference icons from published Figma libraries using human-readable names:

```json
{
  "nodeType": "instance",
  "name": "SearchIcon",
  "iconRef": "lucide:search"
}
```

**Features:**
- Registry extraction from placed icons
- Multiple library support (Lucide, Material, custom)
- Typo suggestions
- Visible placeholder on missing icons

### 6. Instance References & Overrides

Components can reference other components and override content:

```json
{
  "nodeType": "instance",
  "name": "ActionButton",
  "ref": "button",
  "variantProps": { "type": "primary", "state": "default" },
  "overrides": { "label": { "text": "Submit" } }
}
```

### 7. Multi-File Support

Split component libraries across multiple JSON files:

```
figma-components/
├── registries/
│   └── lucide.json
├── primitives/
│   └── buttons.json
└── patterns/
    └── cards.json
```

JASOTI merges files, detects registries, and resolves cross-file dependencies.

### 8. In-Place Updates

When regenerating, JASOTI:
- Finds existing components by schema ID
- Updates them in place (preserving instances)
- Adds new variants to existing ComponentSets
- Warns about removed variants

### 9. Pre-Flight Validation

Before generating, JASOTI validates:
- Token references (exist in Figma?)
- Icon references (registered?)
- Schema structure (valid JSON?)

Shows dialog with issues and "Generate Anyway" option.

### 10. Image Support

Components can include images:

```json
{
  "nodeType": "rectangle",
  "imageUrl": "https://example.com/hero.jpg",
  "imageScaleMode": "FILL"
}
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Figma Plugin                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐ │
│  │  UI     │  │  Parser  │  │ Generator │  │  Resolver   │ │
│  │ (HTML)  │──│  (JSON)  │──│ (Figma)   │──│  (Tokens)   │ │
│  └─────────┘  └──────────┘  └───────────┘  └─────────────┘ │
│       │            │              │              │          │
│       ▼            ▼              ▼              ▼          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Main Thread                          ││
│  │  - Message routing                                      ││
│  │  - Figma API access                                     ││
│  │  - Token/style resolution                               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
JSON Files ──► Parser ──► Schema AST ──► Dependency Resolver
                                              │
                                              ▼
                                        Generation Order
                                              │
                                              ▼
Token Maps ◄── Context Builder ◄── Generator ──► Figma Nodes
                    │
                    ▼
              Icon Resolver
```

### File Structure

```
src/
├── core/
│   ├── parser.ts        # JSON parsing & validation (781 lines)
│   ├── generator.ts     # Figma node creation (1570 lines)
│   ├── resolver.ts      # Dependency ordering (129 lines)
│   ├── tokenResolver.ts # Token lookup & binding (329 lines)
│   ├── iconRegistry.ts  # Icon ref resolution (100 lines)
│   └── tokenMapper.ts   # Token extraction (90 lines)
├── types/
│   ├── schema.ts        # TypeScript interfaces (192 lines)
│   └── iconRegistry.ts  # Icon registry types (54 lines)
├── main.ts              # Plugin main thread (178 lines)
├── ui.ts                # UI logic (358 lines)
└── ui.html              # UI markup (278 lines)
```

---

## Feature Deep Dive

### Layout System

JASOTI provides full auto-layout control:

| Property | Values | Description |
|----------|--------|-------------|
| `direction` | `horizontal`, `vertical` | Main axis direction |
| `padding` | number | Uniform padding |
| `paddingTop/Right/Bottom/Left` | number | Individual padding |
| `paddingToken` | string | Token-bound padding |
| `gap` | number | Space between children |
| `gapToken` | string | Token-bound gap |
| `wrap` | boolean | Enable flex wrap |
| `alignItems` | `start`, `center`, `end`, `stretch` | Cross-axis alignment |
| `justifyContent` | `start`, `center`, `end`, `space-between` | Main-axis distribution |
| `width` | number, `fill`, `hug` | Width sizing |
| `height` | number, `fill`, `hug` | Height sizing |

### Styling System

| Property | Type | Description |
|----------|------|-------------|
| `fillToken` | string | Background color variable |
| `strokeToken` | string | Border color variable |
| `strokeWidth` | number | Border thickness |
| `strokeDash` | [number, number] | Dashed border pattern |
| `radiusToken` | string | Corner radius variable |
| `shadowToken` | string | Drop shadow effect style |
| `opacity` | number (0-1) | Overall opacity |
| `opacityToken` | string | Token-bound opacity |
| `fillOpacity` | number (0-1) | Fill-only opacity |
| `fillOpacityToken` | string | Token-bound fill opacity |

### Token Resolution Algorithm

1. **Normalize input**: lowercase, handle multiple separators
2. **Exact match**: Try direct lookup
3. **Prefix variants**: Try with/without collection prefix
4. **Partial match**: Match by final segment
5. **Suggestion**: Find similar tokens for error message

### ComponentSet Update Strategy

When regenerating a ComponentSet:

1. Find existing set by plugin data ID
2. Parse existing variant names to extract props
3. Match schema variants to existing variants by props
4. Update matching variants in place
5. Add new variants
6. Warn about (but preserve) removed variants

This preserves instance connections in the design file.

---

## Technical Specifications

### Codebase Metrics

| Metric | Value |
|--------|-------|
| Total Lines of Code | 5,241 |
| TypeScript Files | 12 |
| Test Files | 4 |
| Test Cases | 75 |
| Core Generator | 1,570 lines |
| Core Parser | 781 lines |

### Dependencies

- `@figma/plugin-typings` - Figma API types
- `esbuild` - Build tool
- `vitest` - Test framework
- `typescript` - Type checking

### Browser/Runtime Requirements

- Figma Desktop or Web
- Plugin sandbox environment
- No external network calls (except image URLs)

### Schema Limits

| Limit | Value |
|-------|-------|
| Max nesting depth | 50 levels |
| Max children per node | Unlimited (memory-bound) |
| Max file size | Browser memory limit |

---

## Use Cases

### 1. Design System Bootstrap

Start a design system from a JSON spec:
- Define all primitives (buttons, inputs, cards)
- Generate base component library
- Iterate by editing JSON and regenerating

### 2. Code-Design Synchronization

Keep Figma in sync with React/Vue components:
- Generate JSON from component props
- Run JASOTI to update Figma
- Designers see what developers will build

### 3. Theme Variations

Generate multiple themed component sets:
- Define base structure once
- Swap token references for different themes
- Generate all variations

### 4. Prototyping

Quickly scaffold UI for prototypes:
- Write JSON (faster than clicking)
- Generate components
- Compose into screens

### 5. Automated Pipelines

CI/CD integration possibilities:
- JSON files in git
- Validate schema on PR
- Future: headless generation

---

## Limitations

### Current Limitations

1. **No Export**: Cannot export Figma → JSON (one-way only)
2. **No Constraints**: Only auto-layout, no manual positioning
3. **No Complex Shapes**: No vectors, stars, polygons
4. **No Interactions**: No prototype links or triggers
5. **No Components Nesting**: ComponentSets cannot contain other ComponentSets
6. **Text Styles Only**: No local text formatting (bold/italic spans)
7. **Single Page**: Generates to current page only

### Known Issues

1. Font loading assumes "Inter" is available
2. Large schemas may be slow (500+ components)
3. Image URLs must be publicly accessible

---

## Engineering Effort Estimate

### Methodology

This estimate considers:
- An "A-player engineer" = senior developer with Figma plugin experience
- Working full-time (8 hrs/day, ~20 days/month)
- No AI assistance
- Building from scratch with similar architecture decisions

### Breakdown by Module

| Module | Complexity | Estimated Effort |
|--------|------------|------------------|
| **Schema Design & Types** | Medium | 1 week |
| - Type definitions | | 2 days |
| - Schema specification | | 3 days |
| **Parser** | High | 2 weeks |
| - JSON parsing | | 2 days |
| - Validation logic | | 4 days |
| - Error messages | | 2 days |
| - Multi-file support | | 2 days |
| **Token Resolution** | High | 2 weeks |
| - Variable lookup | | 3 days |
| - Text style resolution | | 2 days |
| - Effect style resolution | | 2 days |
| - Flexible matching | | 3 days |
| **Generator** | Very High | 4 weeks |
| - Context building | | 2 days |
| - Component creation | | 3 days |
| - ComponentSet creation | | 4 days |
| - Layout application | | 3 days |
| - Style application | | 4 days |
| - Instance handling | | 3 days |
| - In-place updates | | 3 days |
| **Dependency Resolver** | Medium | 3 days |
| - Topological sort | | 2 days |
| - Cycle detection | | 1 day |
| **Icon Registry** | Medium | 1 week |
| - Registry types | | 1 day |
| - Resolver logic | | 2 days |
| - Extraction UI | | 2 days |
| **UI Development** | Medium | 1 week |
| - File picker | | 1 day |
| - Component list | | 1 day |
| - Validation dialog | | 2 days |
| - Extraction UI | | 1 day |
| **Testing** | Medium | 1 week |
| - Parser tests | | 3 days |
| - Resolver tests | | 1 day |
| - Token resolver tests | | 2 days |
| - Icon resolver tests | | 1 day |
| **Documentation** | Low | 3 days |
| - Schema reference | | 2 days |
| - README | | 1 day |
| **Integration & Polish** | Medium | 1 week |
| - Bug fixes | | 3 days |
| - Edge cases | | 2 days |

### Total Estimate

| Phase | Duration |
|-------|----------|
| Core Development | 10-11 weeks |
| Testing & Documentation | 2 weeks |
| Integration & Polish | 1 week |
| **Total** | **13-14 weeks** |

### In Working Months

**3 to 3.5 engineer-months** for an experienced developer building this without AI assistance.

### Factors That Could Increase Effort

- Figma API learning curve (add 2-4 weeks if new to Figma plugins)
- More sophisticated error handling
- Performance optimization for large files
- Additional node types (vectors, etc.)
- Bidirectional sync (export support)

### Factors That Could Decrease Effort

- Prior Figma plugin experience
- Existing token resolution library
- Simpler schema requirements
- Less comprehensive testing

### What AI Assistance Changed

This implementation was completed in approximately **2 days** with AI assistance, representing roughly a **30x acceleration** in development speed. Key accelerations:

1. **Boilerplate generation**: Type definitions, interfaces, repetitive patterns
2. **Algorithm implementation**: Topological sort, token resolution, variant matching
3. **Test generation**: Comprehensive test cases with edge cases
4. **Documentation**: Schema reference, inline comments, this document
5. **Debugging**: Quick identification and fixes for issues
6. **Refactoring**: Safe, comprehensive code changes

---

## Conclusion

JASOTI represents a paradigm shift in design-development workflows: treating component definitions as data rather than visual artifacts. By making component structure declarative and token-aware, it enables version control, reproducibility, and tighter design-code synchronization.

The plugin is production-ready for internal use, with room for enhancement in testing coverage, performance optimization, and additional node type support.

---

*Document generated January 2026*
