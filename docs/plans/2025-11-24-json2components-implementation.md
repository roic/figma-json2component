# JSON2Components Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Figma plugin that generates components from JSON schema with design token references.

**Architecture:** Plugin has two parts: UI (iframe with file picker) and main thread (Figma sandbox). Core logic is split into parser → resolver → tokenMapper → generator pipeline. Pure logic modules are unit-testable outside Figma.

**Tech Stack:** TypeScript, Figma Plugin API, esbuild for bundling, Vitest for testing

---

## Task 1: Project Setup

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `.gitignore`

**Step 1: Create manifest.json**

```json
{
  "name": "JSON2Components",
  "id": "json2components-dev",
  "api": "1.0.0",
  "main": "dist/main.js",
  "ui": "dist/ui.html",
  "capabilities": [],
  "enableProposedApi": false,
  "editorType": ["figma"]
}
```

**Step 2: Create package.json**

```json
{
  "name": "figma-json2component",
  "version": "0.1.0",
  "description": "Generate Figma components from JSON schema",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "watch": "node esbuild.config.mjs --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.98.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "typeRoots": ["node_modules/@figma/plugin-typings", "node_modules/@types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create esbuild.config.mjs**

```javascript
import * as esbuild from 'esbuild';
import * as fs from 'fs';

const isWatch = process.argv.includes('--watch');

// Build main.ts (Figma sandbox)
const mainConfig = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
};

// Build ui.ts and inline into HTML
const uiConfig = {
  entryPoints: ['src/ui.ts'],
  bundle: true,
  outfile: 'dist/ui.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
};

async function buildUI() {
  await esbuild.build(uiConfig);
  const uiJs = fs.readFileSync('dist/ui.js', 'utf8');
  const uiHtml = fs.readFileSync('src/ui.html', 'utf8');
  const finalHtml = uiHtml.replace('<!-- SCRIPT -->', `<script>${uiJs}</script>`);
  fs.writeFileSync('dist/ui.html', finalHtml);
  fs.unlinkSync('dist/ui.js');
}

async function build() {
  await esbuild.build(mainConfig);
  await buildUI();
  console.log('Build complete');
}

if (isWatch) {
  const ctx1 = await esbuild.context(mainConfig);
  const ctx2 = await esbuild.context(uiConfig);
  await ctx1.watch();
  console.log('Watching for changes...');
  // For watch mode, rebuild UI on change
  fs.watch('src', { recursive: true }, async () => {
    await build();
  });
} else {
  await build();
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.log
.DS_Store
```

**Step 6: Install dependencies**

Run: `npm install`
Expected: Dependencies installed, node_modules created

**Step 7: Commit**

```bash
git add manifest.json package.json tsconfig.json esbuild.config.mjs .gitignore
git commit -m "chore: initial project setup with esbuild and vitest"
```

---

## Task 2: TypeScript Schema Types

**Files:**
- Create: `src/types/schema.ts`

**Step 1: Create schema types**

```typescript
// src/types/schema.ts

// ============ Layout Types ============

export type SizeValue = number | 'fill' | 'hug';

export type Direction = 'horizontal' | 'vertical';

export type AlignItems = 'center' | 'start' | 'end' | 'stretch';

export type JustifyContent = 'start' | 'center' | 'end' | 'space-between';

export interface LayoutProps {
  direction?: Direction;
  padding?: number;
  paddingToken?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  gap?: number;
  gapToken?: string;
  alignItems?: AlignItems;
  justifyContent?: JustifyContent;
  width?: SizeValue;
  height?: SizeValue;
}

export interface StyleProps {
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
  shadowToken?: string;
}

// ============ Node Types ============

export interface BaseNode {
  id: string;
  name: string;
}

export interface FrameNode extends BaseNode {
  nodeType: 'frame';
  layout?: LayoutProps;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
  shadowToken?: string;
  children?: ChildNode[];
}

export interface TextNode extends BaseNode {
  nodeType: 'text';
  text?: string;
  textStyleToken?: string;
  fillToken?: string;
}

export interface InstanceNode extends BaseNode {
  nodeType: 'instance';
  ref: string;
  variantProps?: Record<string, string>;
  overrides?: Record<string, { text?: string }>;
  layout?: Pick<LayoutProps, 'width' | 'height'>;
}

export interface RectangleNode extends BaseNode {
  nodeType: 'rectangle';
  layout?: Pick<LayoutProps, 'width' | 'height'>;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
}

export type ChildNode = FrameNode | TextNode | InstanceNode | RectangleNode;

// ============ Component Types ============

export interface ComponentBase extends StyleProps {
  layout: LayoutProps;
  children?: ChildNode[];
}

export interface Variant extends StyleProps {
  props: Record<string, string>;
}

export interface ComponentSetDefinition {
  id: string;
  name: string;
  description?: string;
  variantProps: string[];
  base: ComponentBase;
  variants: Variant[];
}

export interface ComponentDefinition extends StyleProps {
  id: string;
  name: string;
  description?: string;
  layout: LayoutProps;
  children?: ChildNode[];
}

// ============ Schema Root ============

export interface Schema {
  components?: ComponentDefinition[];
  componentSets?: ComponentSetDefinition[];
}

// ============ Validation Result ============

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
```

**Step 2: Commit**

```bash
git add src/types/schema.ts
git commit -m "feat: add TypeScript schema types"
```

---

## Task 3: Parser with Validation

**Files:**
- Create: `src/core/parser.ts`
- Create: `src/core/parser.test.ts`

**Step 1: Write failing test for valid JSON parsing**

```typescript
// src/core/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchema } from './parser';

describe('parseSchema', () => {
  it('parses valid minimal schema', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: { direction: 'horizontal' }
      }]
    });

    const result = parseSchema(json);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.schema?.components).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - Cannot find module './parser'

**Step 3: Create parser skeleton**

```typescript
// src/core/parser.ts
import type { Schema, ValidationResult, ValidationError, ComponentDefinition, ComponentSetDefinition, ChildNode } from '../types/schema';

export interface ParseResult extends ValidationResult {
  schema?: Schema;
}

export function parseSchema(jsonString: string): ParseResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Step 1: Parse JSON
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid JSON';
    return {
      valid: false,
      errors: [{ path: '', message: `JSON parse error: ${message}` }],
      warnings: [],
    };
  }

  // Step 2: Validate structure
  if (typeof raw !== 'object' || raw === null) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Schema must be an object' }],
      warnings: [],
    };
  }

  const schema = raw as Record<string, unknown>;
  const result: Schema = {};

  // Validate components
  if ('components' in schema) {
    if (!Array.isArray(schema.components)) {
      errors.push({ path: 'components', message: 'components must be an array' });
    } else {
      result.components = [];
      schema.components.forEach((comp, i) => {
        const compErrors = validateComponent(comp, `components[${i}]`);
        errors.push(...compErrors.errors);
        warnings.push(...compErrors.warnings);
        if (compErrors.errors.length === 0) {
          result.components!.push(comp as ComponentDefinition);
        }
      });
    }
  }

  // Validate componentSets
  if ('componentSets' in schema) {
    if (!Array.isArray(schema.componentSets)) {
      errors.push({ path: 'componentSets', message: 'componentSets must be an array' });
    } else {
      result.componentSets = [];
      schema.componentSets.forEach((set, i) => {
        const setErrors = validateComponentSet(set, `componentSets[${i}]`);
        errors.push(...setErrors.errors);
        warnings.push(...setErrors.warnings);
        if (setErrors.errors.length === 0) {
          result.componentSets!.push(set as ComponentSetDefinition);
        }
      });
    }
  }

  // Check for duplicate IDs
  const allIds = [
    ...(result.components?.map(c => c.id) || []),
    ...(result.componentSets?.map(c => c.id) || []),
  ];
  const seen = new Set<string>();
  allIds.forEach(id => {
    if (seen.has(id)) {
      errors.push({ path: '', message: `Duplicate id '${id}' found` });
    }
    seen.add(id);
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schema: errors.length === 0 ? result : undefined,
  };
}

function validateComponent(comp: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof comp !== 'object' || comp === null) {
    errors.push({ path, message: 'Component must be an object' });
    return { errors, warnings };
  }

  const c = comp as Record<string, unknown>;

  // Required fields
  if (!c.id || typeof c.id !== 'string') {
    errors.push({ path, message: "Missing required field 'id'" });
  }
  if (!c.name || typeof c.name !== 'string') {
    errors.push({ path, message: "Missing required field 'name'" });
  }
  if (!c.layout || typeof c.layout !== 'object') {
    errors.push({ path, message: "Missing required field 'layout'" });
  } else {
    const layoutErrors = validateLayout(c.layout, `${path}.layout`);
    errors.push(...layoutErrors.errors);
    warnings.push(...layoutErrors.warnings);
  }

  // Validate children if present
  if (c.children) {
    if (!Array.isArray(c.children)) {
      errors.push({ path: `${path}.children`, message: 'children must be an array' });
    } else {
      c.children.forEach((child, i) => {
        const childErrors = validateChildNode(child, `${path}.children[${i}]`);
        errors.push(...childErrors.errors);
        warnings.push(...childErrors.warnings);
      });
    }
  }

  return { errors, warnings };
}

function validateComponentSet(set: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof set !== 'object' || set === null) {
    errors.push({ path, message: 'ComponentSet must be an object' });
    return { errors, warnings };
  }

  const s = set as Record<string, unknown>;

  // Required fields
  if (!s.id || typeof s.id !== 'string') {
    errors.push({ path, message: "Missing required field 'id'" });
  }
  if (!s.name || typeof s.name !== 'string') {
    errors.push({ path, message: "Missing required field 'name'" });
  }
  if (!Array.isArray(s.variantProps)) {
    errors.push({ path, message: "Missing required field 'variantProps' (array)" });
  }
  if (!s.base || typeof s.base !== 'object') {
    errors.push({ path, message: "Missing required field 'base'" });
  } else {
    const baseErrors = validateLayout((s.base as Record<string, unknown>).layout, `${path}.base.layout`);
    errors.push(...baseErrors.errors);
    warnings.push(...baseErrors.warnings);
  }
  if (!Array.isArray(s.variants)) {
    errors.push({ path, message: "Missing required field 'variants' (array)" });
  } else {
    s.variants.forEach((v, i) => {
      if (typeof v !== 'object' || !v || !('props' in (v as object))) {
        errors.push({ path: `${path}.variants[${i}]`, message: "Variant missing 'props'" });
      }
    });
  }

  return { errors, warnings };
}

function validateLayout(layout: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof layout !== 'object' || layout === null) {
    errors.push({ path, message: 'Layout must be an object' });
    return { errors, warnings };
  }

  const l = layout as Record<string, unknown>;

  // Check for token/value conflicts
  if (l.padding !== undefined && l.paddingToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'padding' and 'paddingToken'" });
  }
  if (l.gap !== undefined && l.gapToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'gap' and 'gapToken'" });
  }

  return { errors, warnings };
}

function validateChildNode(node: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof node !== 'object' || node === null) {
    errors.push({ path, message: 'Node must be an object' });
    return { errors, warnings };
  }

  const n = node as Record<string, unknown>;

  if (!n.nodeType || typeof n.nodeType !== 'string') {
    errors.push({ path, message: "Missing required field 'nodeType'" });
    return { errors, warnings };
  }

  const validTypes = ['frame', 'text', 'instance', 'rectangle'];
  if (!validTypes.includes(n.nodeType as string)) {
    errors.push({ path, message: `Invalid nodeType '${n.nodeType}'. Must be one of: ${validTypes.join(', ')}` });
    return { errors, warnings };
  }

  // All nodes except instance require id
  if (n.nodeType !== 'instance' && (!n.id || typeof n.id !== 'string')) {
    errors.push({ path, message: "Missing required field 'id'" });
  }

  if (!n.name || typeof n.name !== 'string') {
    errors.push({ path, message: "Missing required field 'name'" });
  }

  // Instance-specific validation
  if (n.nodeType === 'instance') {
    if (!n.ref || typeof n.ref !== 'string') {
      errors.push({ path, message: "Instance missing required field 'ref'" });
    }
  }

  // Recursive children validation for frames
  if (n.nodeType === 'frame' && n.children) {
    if (!Array.isArray(n.children)) {
      errors.push({ path: `${path}.children`, message: 'children must be an array' });
    } else {
      (n.children as unknown[]).forEach((child, i) => {
        const childErrors = validateChildNode(child, `${path}.children[${i}]`);
        errors.push(...childErrors.errors);
        warnings.push(...childErrors.warnings);
      });
    }
  }

  return { errors, warnings };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Add more test cases**

```typescript
// Add to src/core/parser.test.ts

describe('parseSchema error handling', () => {
  it('returns error for invalid JSON', () => {
    const result = parseSchema('not valid json');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('JSON parse error');
  });

  it('returns error for missing required id', () => {
    const json = JSON.stringify({
      components: [{
        name: 'Test',
        layout: { direction: 'horizontal' }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("'id'");
  });

  it('returns error for duplicate ids', () => {
    const json = JSON.stringify({
      components: [
        { id: 'same', name: 'Test1', layout: {} },
        { id: 'same', name: 'Test2', layout: {} }
      ]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('returns error for padding/paddingToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: { padding: 8, paddingToken: 'spacing.md' }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('padding');
  });
});

describe('parseSchema componentSets', () => {
  it('parses valid componentSet', () => {
    const json = JSON.stringify({
      componentSets: [{
        id: 'button',
        name: 'Button',
        variantProps: ['type', 'state'],
        base: {
          layout: { direction: 'horizontal' },
          children: []
        },
        variants: [
          { props: { type: 'primary', state: 'default' }, fillToken: 'color.primary' }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.schema?.componentSets).toHaveLength(1);
  });
});
```

**Step 6: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/core/parser.ts src/core/parser.test.ts
git commit -m "feat: add JSON schema parser with validation"
```

---

## Task 4: Dependency Resolver

**Files:**
- Create: `src/core/resolver.ts`
- Create: `src/core/resolver.test.ts`

**Step 1: Write failing test for dependency ordering**

```typescript
// src/core/resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDependencies } from './resolver';
import type { Schema } from '../types/schema';

describe('resolveDependencies', () => {
  it('returns components in dependency order', () => {
    const schema: Schema = {
      components: [
        {
          id: 'chatbox',
          name: 'ChatBox',
          layout: { direction: 'horizontal' },
          children: [
            { nodeType: 'instance', id: 'btn', name: 'Btn', ref: 'button' }
          ]
        }
      ],
      componentSets: [
        {
          id: 'button',
          name: 'Button',
          variantProps: ['type'],
          base: { layout: { direction: 'horizontal' } },
          variants: [{ props: { type: 'primary' } }]
        }
      ]
    };

    const result = resolveDependencies(schema);

    expect(result.success).toBe(true);
    expect(result.order).toEqual(['button', 'chatbox']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - Cannot find module './resolver'

**Step 3: Implement dependency resolver**

```typescript
// src/core/resolver.ts
import type { Schema, ChildNode, ComponentDefinition, ComponentSetDefinition } from '../types/schema';

export interface ResolveResult {
  success: boolean;
  order: string[];
  error?: string;
}

export function resolveDependencies(schema: Schema): ResolveResult {
  const allIds = new Set<string>();
  const dependencies = new Map<string, Set<string>>();

  // Collect all component/componentSet ids
  schema.components?.forEach(c => allIds.add(c.id));
  schema.componentSets?.forEach(c => allIds.add(c.id));

  // Initialize dependency sets
  allIds.forEach(id => dependencies.set(id, new Set()));

  // Find dependencies from children
  schema.components?.forEach(comp => {
    const deps = findDependencies(comp.children || []);
    deps.forEach(dep => {
      if (allIds.has(dep)) {
        dependencies.get(comp.id)!.add(dep);
      }
    });
  });

  schema.componentSets?.forEach(set => {
    const deps = findDependencies(set.base.children || []);
    deps.forEach(dep => {
      if (allIds.has(dep)) {
        dependencies.get(set.id)!.add(dep);
      }
    });
  });

  // Topological sort using Kahn's algorithm
  const inDegree = new Map<string, number>();
  allIds.forEach(id => inDegree.set(id, 0));

  dependencies.forEach((deps, _id) => {
    deps.forEach(dep => {
      inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
    });
  });

  // Wait, that's backwards. Let me fix the direction.
  // If A depends on B, then B must come before A.
  // So edge is A -> B means "A depends on B"
  // In topo sort, we want nodes with no incoming edges first.
  // But our dependencies map has A -> {B, C} meaning A depends on B and C.
  // So the edge direction is A <- B (B must come before A).
  // We need to reverse: B has an outgoing edge to A.

  // Rebuild with correct direction
  const graph = new Map<string, Set<string>>(); // node -> nodes that depend on it
  allIds.forEach(id => graph.set(id, new Set()));

  dependencies.forEach((deps, dependentId) => {
    deps.forEach(dependencyId => {
      graph.get(dependencyId)!.add(dependentId);
    });
  });

  // Now recalculate in-degree
  const inDeg = new Map<string, number>();
  allIds.forEach(id => inDeg.set(id, 0));
  graph.forEach((dependents, _node) => {
    dependents.forEach(dep => {
      inDeg.set(dep, (inDeg.get(dep) || 0) + 1);
    });
  });

  // Kahn's algorithm
  const queue: string[] = [];
  inDeg.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    graph.get(node)!.forEach(dependent => {
      const newDeg = inDeg.get(dependent)! - 1;
      inDeg.set(dependent, newDeg);
      if (newDeg === 0) {
        queue.push(dependent);
      }
    });
  }

  if (order.length !== allIds.size) {
    // Find cycle
    const remaining = [...allIds].filter(id => !order.includes(id));
    const cycle = findCycle(dependencies, remaining[0], new Set(), []);
    return {
      success: false,
      order: [],
      error: `Circular dependency detected: ${cycle.join(' → ')}`,
    };
  }

  return { success: true, order };
}

function findDependencies(children: ChildNode[]): string[] {
  const deps: string[] = [];

  for (const child of children) {
    if (child.nodeType === 'instance') {
      deps.push(child.ref);
    } else if (child.nodeType === 'frame' && child.children) {
      deps.push(...findDependencies(child.children));
    }
  }

  return deps;
}

function findCycle(
  dependencies: Map<string, Set<string>>,
  start: string,
  visited: Set<string>,
  path: string[]
): string[] {
  if (visited.has(start)) {
    const cycleStart = path.indexOf(start);
    return [...path.slice(cycleStart), start];
  }

  visited.add(start);
  path.push(start);

  const deps = dependencies.get(start) || new Set();
  for (const dep of deps) {
    const cycle = findCycle(dependencies, dep, visited, path);
    if (cycle.length > 0) return cycle;
  }

  path.pop();
  return [];
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Add circular dependency test**

```typescript
// Add to src/core/resolver.test.ts

it('detects circular dependencies', () => {
  const schema: Schema = {
    components: [
      {
        id: 'a',
        name: 'A',
        layout: {},
        children: [{ nodeType: 'instance', id: 'i1', name: 'I1', ref: 'b' }]
      },
      {
        id: 'b',
        name: 'B',
        layout: {},
        children: [{ nodeType: 'instance', id: 'i2', name: 'I2', ref: 'a' }]
      }
    ]
  };

  const result = resolveDependencies(schema);

  expect(result.success).toBe(false);
  expect(result.error).toContain('Circular');
});

it('handles components with no dependencies', () => {
  const schema: Schema = {
    components: [
      { id: 'a', name: 'A', layout: {} },
      { id: 'b', name: 'B', layout: {} }
    ]
  };

  const result = resolveDependencies(schema);

  expect(result.success).toBe(true);
  expect(result.order).toHaveLength(2);
});
```

**Step 6: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/core/resolver.ts src/core/resolver.test.ts
git commit -m "feat: add dependency resolver with cycle detection"
```

---

## Task 5: Token Mapper (Types Only - Figma API Needed at Runtime)

**Files:**
- Create: `src/core/tokenMapper.ts`

**Step 1: Create token mapper types and interface**

```typescript
// src/core/tokenMapper.ts
import type { Schema, ChildNode, ComponentBase, StyleProps } from '../types/schema';

export interface TokenWarning {
  token: string;
  type: 'variable' | 'textStyle';
  path: string;
}

export interface TokenMapResult {
  warnings: TokenWarning[];
  tokens: Set<string>;
  textStyles: Set<string>;
}

/**
 * Extracts all token references from a schema.
 * Actual resolution to Figma variables/styles happens at generation time.
 */
export function extractTokens(schema: Schema): TokenMapResult {
  const tokens = new Set<string>();
  const textStyles = new Set<string>();

  // Extract from components
  schema.components?.forEach(comp => {
    extractFromStyleProps(comp, tokens);
    extractLayoutTokens(comp.layout, tokens);
    comp.children?.forEach(child => extractFromChildNode(child, tokens, textStyles));
  });

  // Extract from componentSets
  schema.componentSets?.forEach(set => {
    extractFromStyleProps(set.base, tokens);
    extractLayoutTokens(set.base.layout, tokens);
    set.base.children?.forEach(child => extractFromChildNode(child, tokens, textStyles));
    set.variants.forEach(v => extractFromStyleProps(v, tokens));
  });

  return { warnings: [], tokens, textStyles };
}

function extractFromStyleProps(props: StyleProps, tokens: Set<string>): void {
  if (props.fillToken) tokens.add(props.fillToken);
  if (props.strokeToken) tokens.add(props.strokeToken);
  if (props.radiusToken) tokens.add(props.radiusToken);
  if (props.shadowToken) tokens.add(props.shadowToken);
}

function extractLayoutTokens(layout: { paddingToken?: string; gapToken?: string } | undefined, tokens: Set<string>): void {
  if (!layout) return;
  if (layout.paddingToken) tokens.add(layout.paddingToken);
  if (layout.gapToken) tokens.add(layout.gapToken);
}

function extractFromChildNode(node: ChildNode, tokens: Set<string>, textStyles: Set<string>): void {
  if (node.nodeType === 'text') {
    if (node.fillToken) tokens.add(node.fillToken);
    if (node.textStyleToken) textStyles.add(node.textStyleToken);
  } else if (node.nodeType === 'frame') {
    extractFromStyleProps(node, tokens);
    extractLayoutTokens(node.layout, tokens);
    node.children?.forEach(child => extractFromChildNode(child, tokens, textStyles));
  } else if (node.nodeType === 'rectangle') {
    if (node.fillToken) tokens.add(node.fillToken);
    if (node.strokeToken) tokens.add(node.strokeToken);
    if (node.radiusToken) tokens.add(node.radiusToken);
  }
}
```

**Step 2: Commit**

```bash
git add src/core/tokenMapper.ts
git commit -m "feat: add token extractor for schema analysis"
```

---

## Task 6: Stub Files for Main and UI

**Files:**
- Create: `src/main.ts`
- Create: `src/ui.ts`
- Create: `src/ui.html`

**Step 1: Create main.ts stub**

```typescript
// src/main.ts

// Show plugin UI
figma.showUI(__html__, { width: 400, height: 500 });

// Handle messages from UI
figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  if (msg.type === 'generate') {
    // TODO: Implement generation
    figma.notify('Generation not yet implemented');
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
```

**Step 2: Create ui.html**

```html
<!-- src/ui.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      padding: 16px;
      color: #333;
    }
    h1 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .section {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e5e5;
    }
    .file-picker {
      width: 100%;
      padding: 12px;
      border: 2px dashed #ccc;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .file-picker:hover {
      border-color: #18a0fb;
    }
    .file-picker.has-file {
      border-style: solid;
      border-color: #18a0fb;
      background: #f0f9ff;
    }
    .file-name {
      font-weight: 500;
      margin-top: 8px;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      font-size: 11px;
    }
    .status.success { color: #1bc47d; }
    .status.error { color: #f24822; }
    .status.warning { color: #ffab00; }
    .component-list {
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
    }
    .component-item {
      padding: 8px 12px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .component-item:last-child {
      border-bottom: none;
    }
    .component-item input {
      margin: 0;
    }
    .component-meta {
      font-size: 10px;
      color: #888;
      margin-left: auto;
    }
    .warnings {
      background: #fffbf0;
      border: 1px solid #ffab00;
      border-radius: 4px;
      padding: 8px;
      font-size: 11px;
      max-height: 80px;
      overflow-y: auto;
    }
    .warning-item {
      padding: 2px 0;
      color: #996600;
    }
    button {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    button.primary {
      background: #18a0fb;
      color: white;
    }
    button.primary:hover {
      background: #0d8de5;
    }
    button.primary:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <h1>JSON2Components</h1>

  <div class="section">
    <div class="file-picker" id="filePicker">
      <div>Click to select JSON file</div>
      <input type="file" id="fileInput" accept=".json" style="display: none;">
    </div>
    <div id="fileStatus"></div>
  </div>

  <div class="section hidden" id="componentsSection">
    <div style="font-weight: 500; margin-bottom: 8px;">Components to generate:</div>
    <div class="component-list" id="componentList"></div>
  </div>

  <div class="section hidden" id="tokenSection">
    <div style="font-weight: 500; margin-bottom: 8px;">Token status:</div>
    <div id="tokenStatus"></div>
    <div class="warnings hidden" id="tokenWarnings"></div>
  </div>

  <button class="primary" id="generateBtn" disabled>Generate Components</button>

  <!-- SCRIPT -->
</body>
</html>
```

**Step 3: Create ui.ts**

```typescript
// src/ui.ts

interface ParsedSchema {
  components: Array<{ id: string; name: string; childCount: number }>;
  componentSets: Array<{ id: string; name: string; variantCount: number }>;
  tokens: string[];
  textStyles: string[];
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

let currentSchema: ParsedSchema | null = null;

// File picker handling
const filePicker = document.getElementById('filePicker')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const fileStatus = document.getElementById('fileStatus')!;
const componentsSection = document.getElementById('componentsSection')!;
const componentList = document.getElementById('componentList')!;
const tokenSection = document.getElementById('tokenSection')!;
const tokenStatus = document.getElementById('tokenStatus')!;
const tokenWarnings = document.getElementById('tokenWarnings')!;
const generateBtn = document.getElementById('generateBtn') as HTMLButtonElement;

filePicker.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    handleJsonContent(text, file.name);
  } catch (err) {
    showFileError('Failed to read file');
  }
});

function handleJsonContent(jsonString: string, fileName: string) {
  // For now, just parse and show basic info
  // Full validation will be done by main thread
  try {
    const raw = JSON.parse(jsonString);

    // Basic extraction
    const components = (raw.components || []).map((c: { id: string; name: string; children?: unknown[] }) => ({
      id: c.id || 'unknown',
      name: c.name || 'Unnamed',
      childCount: (c.children || []).length,
    }));

    const componentSets = (raw.componentSets || []).map((s: { id: string; name: string; variants?: unknown[] }) => ({
      id: s.id || 'unknown',
      name: s.name || 'Unnamed',
      variantCount: (s.variants || []).length,
    }));

    currentSchema = {
      components,
      componentSets,
      tokens: [], // Will be filled by main thread
      textStyles: [],
      errors: [],
      warnings: [],
    };

    // Update UI
    filePicker.classList.add('has-file');
    fileStatus.innerHTML = `
      <div class="file-name">📄 ${fileName}</div>
      <div class="status success">✓ Parsed successfully</div>
    `;

    // Show components
    componentsSection.classList.remove('hidden');
    componentList.innerHTML = '';

    componentSets.forEach((set: { id: string; name: string; variantCount: number }) => {
      componentList.innerHTML += `
        <div class="component-item">
          <input type="checkbox" checked data-id="${set.id}">
          <span>${set.name}</span>
          <span class="component-meta">${set.variantCount} variants</span>
        </div>
      `;
    });

    components.forEach((comp: { id: string; name: string; childCount: number }) => {
      componentList.innerHTML += `
        <div class="component-item">
          <input type="checkbox" checked data-id="${comp.id}">
          <span>${comp.name}</span>
          <span class="component-meta">${comp.childCount} children</span>
        </div>
      `;
    });

    // Token section placeholder
    tokenSection.classList.remove('hidden');
    tokenStatus.innerHTML = '<span class="status">Token resolution will happen on generate</span>';

    generateBtn.disabled = false;

    // Store JSON for sending to main
    (window as { jsonContent?: string }).jsonContent = jsonString;

  } catch (err) {
    showFileError(`JSON parse error: ${(err as Error).message}`);
  }
}

function showFileError(message: string) {
  filePicker.classList.remove('has-file');
  fileStatus.innerHTML = `<div class="status error">✗ ${message}</div>`;
  componentsSection.classList.add('hidden');
  tokenSection.classList.add('hidden');
  generateBtn.disabled = true;
  currentSchema = null;
}

generateBtn.addEventListener('click', () => {
  const jsonContent = (window as { jsonContent?: string }).jsonContent;
  if (!jsonContent) return;

  // Get selected component IDs
  const checkboxes = componentList.querySelectorAll('input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => (cb as HTMLInputElement).dataset.id);

  parent.postMessage({
    pluginMessage: {
      type: 'generate',
      payload: {
        json: jsonContent,
        selectedIds,
      }
    }
  }, '*');

  generateBtn.textContent = 'Generating...';
  generateBtn.disabled = true;
});

// Handle messages from main
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'generation-complete') {
    generateBtn.textContent = 'Generate Components';
    generateBtn.disabled = false;
  }

  if (msg.type === 'token-warnings') {
    const warnings = msg.payload as string[];
    if (warnings.length > 0) {
      tokenWarnings.classList.remove('hidden');
      tokenWarnings.innerHTML = warnings.map(w => `<div class="warning-item">⚠ ${w}</div>`).join('');
    }
  }
};
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build complete, dist/ folder created with main.js and ui.html

**Step 5: Commit**

```bash
git add src/main.ts src/ui.ts src/ui.html
git commit -m "feat: add plugin main and UI stubs"
```

---

## Task 7: Generator - Core Node Creation

**Files:**
- Create: `src/core/generator.ts`
- Modify: `src/main.ts`

**Step 1: Create generator with node creation logic**

```typescript
// src/core/generator.ts
import type {
  Schema,
  ComponentDefinition,
  ComponentSetDefinition,
  ChildNode,
  LayoutProps,
  StyleProps,
  SizeValue,
} from '../types/schema';
import { resolveDependencies } from './resolver';

const PLUGIN_DATA_KEY = 'json2components.id';

interface GenerationContext {
  componentMap: Map<string, ComponentNode | ComponentSetNode>;
  variableMap: Map<string, Variable>;
  textStyleMap: Map<string, TextStyle>;
  warnings: string[];
}

export interface GenerateResult {
  success: boolean;
  warnings: string[];
  error?: string;
  createdCount: number;
}

export async function generateFromSchema(
  schema: Schema,
  selectedIds: string[]
): Promise<GenerateResult> {
  const warnings: string[] = [];

  // Resolve dependencies
  const depResult = resolveDependencies(schema);
  if (!depResult.success) {
    return { success: false, warnings: [], error: depResult.error, createdCount: 0 };
  }

  // Build context
  const context = await buildContext(warnings);

  // Filter to selected IDs and order by dependencies
  const selectedSet = new Set(selectedIds);
  const orderedIds = depResult.order.filter(id => selectedSet.has(id));

  // Create/update components in order
  let createdCount = 0;
  for (const id of orderedIds) {
    const compDef = schema.components?.find(c => c.id === id);
    const setDef = schema.componentSets?.find(s => s.id === id);

    if (setDef) {
      await createOrUpdateComponentSet(setDef, context);
      createdCount++;
    } else if (compDef) {
      await createOrUpdateComponent(compDef, context);
      createdCount++;
    }
  }

  // Position components in grid
  positionComponents(context.componentMap, orderedIds);

  return { success: true, warnings: context.warnings, createdCount };
}

async function buildContext(warnings: string[]): Promise<GenerationContext> {
  // Get existing components created by this plugin
  const componentMap = new Map<string, ComponentNode | ComponentSetNode>();
  const allComponents = figma.currentPage.findAll(n =>
    (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') &&
    n.getPluginData(PLUGIN_DATA_KEY)
  );
  allComponents.forEach(c => {
    const id = c.getPluginData(PLUGIN_DATA_KEY);
    if (id) componentMap.set(id, c as ComponentNode | ComponentSetNode);
  });

  // Get variables
  const variableMap = new Map<string, Variable>();
  const variables = await figma.variables.getLocalVariablesAsync();
  variables.forEach(v => variableMap.set(v.name, v));

  // Get text styles
  const textStyleMap = new Map<string, TextStyle>();
  const textStyles = await figma.getLocalTextStylesAsync();
  textStyles.forEach(s => textStyleMap.set(s.name, s));

  return { componentMap, variableMap, textStyleMap, warnings };
}

async function createOrUpdateComponent(
  def: ComponentDefinition,
  context: GenerationContext
): Promise<ComponentNode> {
  // Check if exists
  let comp = context.componentMap.get(def.id) as ComponentNode | undefined;

  if (comp && comp.type === 'COMPONENT') {
    // Clear existing children for full overwrite
    comp.children.forEach(c => c.remove());
  } else {
    // Create new
    comp = figma.createComponent();
    comp.setPluginData(PLUGIN_DATA_KEY, def.id);
    context.componentMap.set(def.id, comp);
  }

  comp.name = def.name;
  if (def.description) comp.description = def.description;

  // Apply layout
  applyLayout(comp, def.layout);

  // Apply styles
  await applyStyles(comp, def, context);

  // Create children
  if (def.children) {
    for (const childDef of def.children) {
      const child = await createChildNode(childDef, context);
      if (child) comp.appendChild(child);
    }
  }

  return comp;
}

async function createOrUpdateComponentSet(
  def: ComponentSetDefinition,
  context: GenerationContext
): Promise<ComponentSetNode> {
  // First, create all variant components
  const variantComponents: ComponentNode[] = [];

  for (const variant of def.variants) {
    const variantName = def.variantProps
      .map(prop => `${prop}=${variant.props[prop]}`)
      .join(', ');

    const comp = figma.createComponent();
    comp.name = variantName;

    // Apply base layout
    applyLayout(comp, def.base.layout);

    // Apply base styles, then variant overrides
    const mergedStyles: StyleProps = {
      ...def.base,
      ...variant,
    };
    await applyStyles(comp, mergedStyles, context);

    // Create children from base
    if (def.base.children) {
      for (const childDef of def.base.children) {
        const child = await createChildNode(childDef, context);
        if (child) comp.appendChild(child);
      }
    }

    variantComponents.push(comp);
  }

  // Combine into component set
  const existingSet = context.componentMap.get(def.id) as ComponentSetNode | undefined;
  if (existingSet && existingSet.type === 'COMPONENT_SET') {
    // Remove old set (will also remove its children)
    existingSet.remove();
  }

  const componentSet = figma.combineAsVariants(variantComponents, figma.currentPage);
  componentSet.name = def.name;
  if (def.description) componentSet.description = def.description;
  componentSet.setPluginData(PLUGIN_DATA_KEY, def.id);
  context.componentMap.set(def.id, componentSet);

  return componentSet;
}

async function createChildNode(
  def: ChildNode,
  context: GenerationContext
): Promise<SceneNode | null> {
  switch (def.nodeType) {
    case 'frame':
      return createFrameNode(def, context);
    case 'text':
      return createTextNode(def, context);
    case 'rectangle':
      return createRectangleNode(def, context);
    case 'instance':
      return createInstanceNode(def, context);
    default:
      return null;
  }
}

async function createFrameNode(
  def: Extract<ChildNode, { nodeType: 'frame' }>,
  context: GenerationContext
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = def.name;

  if (def.layout) applyLayout(frame, def.layout);
  await applyStyles(frame, def, context);

  if (def.children) {
    for (const childDef of def.children) {
      const child = await createChildNode(childDef, context);
      if (child) frame.appendChild(child);
    }
  }

  return frame;
}

async function createTextNode(
  def: Extract<ChildNode, { nodeType: 'text' }>,
  context: GenerationContext
): Promise<TextNode> {
  const text = figma.createText();
  text.name = def.name;

  // Load font before setting text
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  text.characters = def.text || '';

  // Apply text style
  if (def.textStyleToken) {
    const style = context.textStyleMap.get(def.textStyleToken);
    if (style) {
      text.textStyleId = style.id;
    } else {
      context.warnings.push(`Text style '${def.textStyleToken}' not found`);
    }
  }

  // Apply fill color
  if (def.fillToken) {
    const variable = context.variableMap.get(def.fillToken);
    if (variable) {
      text.setBoundVariable('fills', variable.id as unknown as VariableBindableField);
    } else {
      context.warnings.push(`Variable '${def.fillToken}' not found`);
    }
  }

  return text;
}

async function createRectangleNode(
  def: Extract<ChildNode, { nodeType: 'rectangle' }>,
  context: GenerationContext
): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  rect.name = def.name;

  // Apply sizing
  if (def.layout) {
    if (typeof def.layout.width === 'number') rect.resize(def.layout.width, rect.height);
    if (typeof def.layout.height === 'number') rect.resize(rect.width, def.layout.height);
  }

  await applyStyles(rect, def, context);

  return rect;
}

async function createInstanceNode(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  context: GenerationContext
): Promise<InstanceNode | null> {
  const target = context.componentMap.get(def.ref);

  if (!target) {
    context.warnings.push(`Component '${def.ref}' not found for instance`);
    return null;
  }

  let mainComponent: ComponentNode;

  if (target.type === 'COMPONENT_SET') {
    // Find specific variant
    if (def.variantProps) {
      const variantName = Object.entries(def.variantProps)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      const variant = target.findChild(c => c.name === variantName) as ComponentNode;
      if (variant) {
        mainComponent = variant;
      } else {
        // Use first variant
        mainComponent = target.children[0] as ComponentNode;
        context.warnings.push(`Variant '${variantName}' not found, using default`);
      }
    } else {
      mainComponent = target.children[0] as ComponentNode;
    }
  } else {
    mainComponent = target;
  }

  const instance = mainComponent.createInstance();

  // Apply sizing
  if (def.layout) {
    if (def.layout.width === 'fill') instance.layoutSizingHorizontal = 'FILL';
    else if (def.layout.width === 'hug') instance.layoutSizingHorizontal = 'HUG';
    else if (typeof def.layout.width === 'number') {
      instance.layoutSizingHorizontal = 'FIXED';
      instance.resize(def.layout.width, instance.height);
    }

    if (def.layout.height === 'fill') instance.layoutSizingVertical = 'FILL';
    else if (def.layout.height === 'hug') instance.layoutSizingVertical = 'HUG';
    else if (typeof def.layout.height === 'number') {
      instance.layoutSizingVertical = 'FIXED';
      instance.resize(instance.width, def.layout.height);
    }
  }

  // Apply text overrides
  if (def.overrides) {
    for (const [nodeId, override] of Object.entries(def.overrides)) {
      if (override.text !== undefined) {
        // Find text node by searching for one with matching pluginData or name
        const textNode = instance.findOne(n =>
          n.type === 'TEXT' && (n.name === nodeId || n.getPluginData('nodeId') === nodeId)
        ) as TextNode | null;
        if (textNode) {
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = override.text;
        }
      }
    }
  }

  return instance;
}

function applyLayout(node: FrameNode | ComponentNode, layout: LayoutProps): void {
  // Enable auto-layout
  node.layoutMode = layout.direction === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

  // Padding
  if (layout.padding !== undefined) {
    node.paddingTop = layout.padding;
    node.paddingRight = layout.padding;
    node.paddingBottom = layout.padding;
    node.paddingLeft = layout.padding;
  }
  if (layout.paddingTop !== undefined) node.paddingTop = layout.paddingTop;
  if (layout.paddingRight !== undefined) node.paddingRight = layout.paddingRight;
  if (layout.paddingBottom !== undefined) node.paddingBottom = layout.paddingBottom;
  if (layout.paddingLeft !== undefined) node.paddingLeft = layout.paddingLeft;

  // Gap
  if (layout.gap !== undefined) node.itemSpacing = layout.gap;

  // Alignment
  if (layout.alignItems) {
    const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'STRETCH'> = {
      start: 'MIN',
      center: 'CENTER',
      end: 'MAX',
      stretch: 'STRETCH',
    };
    node.counterAxisAlignItems = alignMap[layout.alignItems] || 'MIN';
  }

  if (layout.justifyContent) {
    const justifyMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
      start: 'MIN',
      center: 'CENTER',
      end: 'MAX',
      'space-between': 'SPACE_BETWEEN',
    };
    node.primaryAxisAlignItems = justifyMap[layout.justifyContent] || 'MIN';
  }

  // Sizing
  applySizing(node, layout.width, 'horizontal');
  applySizing(node, layout.height, 'vertical');
}

function applySizing(
  node: FrameNode | ComponentNode,
  size: SizeValue | undefined,
  axis: 'horizontal' | 'vertical'
): void {
  if (size === undefined) return;

  const prop = axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';

  if (size === 'fill') {
    node[prop] = 'FILL';
  } else if (size === 'hug') {
    node[prop] = 'HUG';
  } else {
    node[prop] = 'FIXED';
    if (axis === 'horizontal') {
      node.resize(size, node.height);
    } else {
      node.resize(node.width, size);
    }
  }
}

async function applyStyles(
  node: FrameNode | ComponentNode | RectangleNode,
  styles: StyleProps,
  context: GenerationContext
): Promise<void> {
  // Fill
  if (styles.fillToken) {
    const variable = context.variableMap.get(styles.fillToken);
    if (variable) {
      const fills = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
        'color',
        variable
      );
      node.fills = [fills];
    } else {
      context.warnings.push(`Variable '${styles.fillToken}' not found`);
    }
  }

  // Stroke
  if (styles.strokeToken) {
    const variable = context.variableMap.get(styles.strokeToken);
    if (variable) {
      const stroke = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
        'color',
        variable
      );
      node.strokes = [stroke];
    } else {
      context.warnings.push(`Variable '${styles.strokeToken}' not found`);
    }
  }
  if (styles.strokeWidth !== undefined) {
    node.strokeWeight = styles.strokeWidth;
  }

  // Radius (only for frames/components/rectangles)
  if (styles.radiusToken && 'cornerRadius' in node) {
    const variable = context.variableMap.get(styles.radiusToken);
    if (variable) {
      node.setBoundVariable('topLeftRadius', variable);
      node.setBoundVariable('topRightRadius', variable);
      node.setBoundVariable('bottomLeftRadius', variable);
      node.setBoundVariable('bottomRightRadius', variable);
    } else {
      context.warnings.push(`Variable '${styles.radiusToken}' not found`);
    }
  }

  // Shadow
  if (styles.shadowToken && 'effects' in node) {
    const variable = context.variableMap.get(styles.shadowToken);
    if (variable) {
      // Effect variables work differently - this is a simplified approach
      context.warnings.push(`Shadow token binding not yet implemented: ${styles.shadowToken}`);
    }
  }
}

function positionComponents(
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  orderedIds: string[]
): void {
  const SPACING = 100;
  const COLS = 4;

  let x = 0;
  let y = 0;
  let col = 0;
  let maxHeightInRow = 0;

  orderedIds.forEach(id => {
    const node = componentMap.get(id);
    if (!node) return;

    node.x = x;
    node.y = y;

    maxHeightInRow = Math.max(maxHeightInRow, node.height);
    col++;

    if (col >= COLS) {
      col = 0;
      x = 0;
      y += maxHeightInRow + SPACING;
      maxHeightInRow = 0;
    } else {
      x += node.width + SPACING;
    }
  });
}
```

**Step 2: Update main.ts to use generator**

```typescript
// src/main.ts
import { parseSchema } from './core/parser';
import { generateFromSchema } from './core/generator';

figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg: { type: string; payload?: { json: string; selectedIds: string[] } }) => {
  if (msg.type === 'generate' && msg.payload) {
    const { json, selectedIds } = msg.payload;

    // Parse schema
    const parseResult = parseSchema(json);
    if (!parseResult.valid || !parseResult.schema) {
      figma.notify(`Parse error: ${parseResult.errors[0]?.message || 'Unknown error'}`, { error: true });
      figma.ui.postMessage({ type: 'generation-complete' });
      return;
    }

    // Generate components
    const result = await generateFromSchema(parseResult.schema, selectedIds);

    if (!result.success) {
      figma.notify(`Generation error: ${result.error}`, { error: true });
    } else {
      figma.notify(`Generated ${result.createdCount} components`);

      if (result.warnings.length > 0) {
        figma.ui.postMessage({ type: 'token-warnings', payload: result.warnings });
      }
    }

    figma.ui.postMessage({ type: 'generation-complete' });
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
```

**Step 3: Build and test in Figma**

Run: `npm run build`

To test:
1. Open Figma Desktop
2. Go to Plugins → Development → Import plugin from manifest
3. Select the manifest.json file
4. Create a test JSON file and run the plugin

**Step 4: Commit**

```bash
git add src/core/generator.ts src/main.ts
git commit -m "feat: implement component generator with Figma API"
```

---

## Task 8: Create Example JSON File

**Files:**
- Create: `examples/buttons.json`

**Step 1: Create example JSON**

```json
{
  "componentSets": [
    {
      "id": "button",
      "name": "Button",
      "description": "Primary action buttons",
      "variantProps": ["type", "state"],
      "base": {
        "layout": {
          "direction": "horizontal",
          "padding": 12,
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
            "textStyleToken": "typography.button"
          }
        ]
      },
      "variants": [
        { "props": { "type": "primary", "state": "default" }, "fillToken": "color.primary" },
        { "props": { "type": "primary", "state": "hover" }, "fillToken": "color.primary.hover" },
        { "props": { "type": "secondary", "state": "default" }, "fillToken": "color.secondary" },
        { "props": { "type": "secondary", "state": "hover" }, "fillToken": "color.secondary.hover" }
      ]
    }
  ],
  "components": [
    {
      "id": "card",
      "name": "Card",
      "description": "Basic card container",
      "layout": {
        "direction": "vertical",
        "padding": 16,
        "gap": 12,
        "width": 300,
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
          "textStyleToken": "typography.heading"
        },
        {
          "nodeType": "text",
          "id": "body",
          "name": "Body",
          "text": "Card body content goes here.",
          "textStyleToken": "typography.body"
        },
        {
          "nodeType": "instance",
          "id": "action-button",
          "name": "ActionButton",
          "ref": "button",
          "variantProps": { "type": "primary", "state": "default" },
          "overrides": { "label": { "text": "Action" } }
        }
      ]
    }
  ]
}
```

**Step 2: Commit**

```bash
git add examples/buttons.json
git commit -m "docs: add example JSON schema file"
```

---

## Task 9: Final Build and Documentation

**Files:**
- Update: `README.md` (create if not exists)

**Step 1: Create README**

```markdown
# JSON2Components

A Figma plugin that generates components from JSON schema with design token references.

## Quick Start

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. In Figma: Plugins → Development → Import plugin from manifest
4. Select `manifest.json`

## Development

- `npm run build` - Build once
- `npm run watch` - Watch for changes
- `npm test` - Run tests

## JSON Schema

See `examples/buttons.json` for a complete example.

See `docs/plans/2025-11-24-json2components-design.md` for full schema documentation.

## Usage

1. Create a JSON file following the schema
2. Open the plugin in Figma
3. Click "Select JSON File" and choose your file
4. Review the components list
5. Click "Generate Components"

## Prerequisites

- Figma variables must exist for all token references (use Tokens Studio)
- Text styles must exist for `textStyleToken` references
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start guide"
```

---

## Summary

This plan creates a working Figma plugin with:

1. **Project setup** - TypeScript, esbuild, Vitest
2. **Schema types** - Full TypeScript interfaces
3. **Parser** - JSON validation with detailed errors
4. **Resolver** - Dependency ordering with cycle detection
5. **Token mapper** - Token extraction (resolution at runtime)
6. **Generator** - Full Figma node creation with variables
7. **UI** - File picker, component list, warnings display
8. **Example** - Working JSON example

Total: 9 tasks, ~40 steps

---

**Plan complete and saved to `docs/plans/2025-11-24-json2components-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
