# Audit Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all 32 issues identified in the codebase audit, improving code quality, test coverage, type safety, and UX.

**Architecture:** Phased approach starting with critical fixes, then refactoring for maintainability, expanding test coverage, improving type safety, and finally UX enhancements. Each phase builds on the previous.

**Tech Stack:** TypeScript, Vitest, Figma Plugin API

---

## Overview

| Phase | Focus | Tasks | Priority |
|-------|-------|-------|----------|
| 1 | Critical Fixes | 3 | High |
| 2 | DRY Refactoring | 4 | Medium |
| 3 | Generator Split | 4 | Medium |
| 4 | Test Coverage | 5 | Medium |
| 5 | Type Safety | 4 | Medium |
| 6 | Performance | 3 | Medium |
| 7 | Documentation | 2 | Low |
| 8 | UX Polish | 3 | Low |

---

## Phase 1: Critical Fixes

### Task 1.1: Fix Null Check in findInstanceDependencies

**Files:**
- Modify: `src/core/generator.ts:27-37`

**Issue:** `findInstanceDependencies` pushes `child.ref` without checking if it exists. Instance nodes may have `componentKey` or `iconRef` instead.

**Step 1: Locate and read the function**

```typescript
// Current code (lines 27-37)
function findInstanceDependencies(children: ChildNode[]): string[] {
  const deps: string[] = [];
  for (const child of children) {
    if (child.nodeType === 'instance') {
      deps.push(child.ref);  // BUG: child.ref might be undefined!
    } else if (child.nodeType === 'frame' && child.children) {
      deps.push(...findInstanceDependencies(child.children));
    }
  }
  return deps;
}
```

**Step 2: Fix the null check**

```typescript
function findInstanceDependencies(children: ChildNode[]): string[] {
  const deps: string[] = [];
  for (const child of children) {
    if (child.nodeType === 'instance' && child.ref) {
      deps.push(child.ref);
    } else if (child.nodeType === 'frame' && child.children) {
      deps.push(...findInstanceDependencies(child.children));
    }
  }
  return deps;
}
```

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/core/generator.ts
git commit -m "fix(generator): add null check for instance ref in dependency finder"
```

---

### Task 1.2: Add Font Loading Error Handling

**Files:**
- Modify: `src/core/generator.ts:652-680` (createTextNode function)

**Issue:** Font loading fails silently if "Inter" isn't available, causing cryptic errors later.

**Step 1: Find the font loading code**

```typescript
// Current code around line 660
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
```

**Step 2: Add try-catch with fallback**

```typescript
// Replace the font loading section
let fontLoaded = false;
const fallbackFonts = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Roboto', style: 'Regular' },
  { family: 'Arial', style: 'Regular' },
];

for (const font of fallbackFonts) {
  try {
    await figma.loadFontAsync(font);
    fontLoaded = true;
    break;
  } catch (e) {
    // Try next font
  }
}

if (!fontLoaded) {
  context.warnings.push(`Could not load any font. Text nodes may not render correctly.`);
}
```

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/core/generator.ts
git commit -m "fix(generator): add font loading fallback chain with error handling"
```

---

### Task 1.3: Add Error Handling to extractIconRegistry

**Files:**
- Modify: `src/main.ts:140-175` (extractIconRegistry function)

**Issue:** If `mainComponent.key` throws, the entire extraction fails without useful feedback.

**Step 1: Read current function**

```typescript
async function extractIconRegistry(libraryName: string): Promise<IconRegistry> {
  const icons: Record<string, string> = {};
  const allNodes = figma.root.findAll(n => n.type === 'INSTANCE') as InstanceNode[];

  for (const instance of allNodes) {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) continue;

    try {
      const key = mainComponent.key;
      const name = mainComponent.name.toLowerCase().replace(/\s+/g, '-');
      if (!icons[name]) {
        icons[name] = key;
      }
    } catch (e) {
      // Skip if can't get key
    }
  }
  // ...
}
```

**Step 2: Add failure tracking and reporting**

```typescript
async function extractIconRegistry(libraryName: string): Promise<IconRegistry & { extractionWarnings?: string[] }> {
  const icons: Record<string, string> = {};
  const warnings: string[] = [];
  const allNodes = figma.root.findAll(n => n.type === 'INSTANCE') as InstanceNode[];

  let processed = 0;
  let skipped = 0;

  for (const instance of allNodes) {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) {
      skipped++;
      continue;
    }

    try {
      const key = mainComponent.key;
      if (!key) {
        skipped++;
        continue;
      }
      const name = mainComponent.name.toLowerCase().replace(/\s+/g, '-');
      if (!icons[name]) {
        icons[name] = key;
        processed++;
      }
    } catch (e) {
      skipped++;
      // Local components don't have keys - this is expected
    }
  }

  if (skipped > 0 && processed === 0) {
    warnings.push(`Skipped ${skipped} instances (likely local components). Place library icons to extract.`);
  }

  return {
    type: 'icon-registry',
    library: libraryName.toLowerCase().replace(/\s+/g, '-'),
    figmaLibraryName: libraryName,
    extractedAt: new Date().toISOString(),
    icons,
  };
}
```

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix(main): improve error handling in icon registry extraction"
```

---

## Phase 2: DRY Refactoring

### Task 2.1: Refactor Token Resolution (DRY)

**Files:**
- Modify: `src/core/tokenResolver.ts`

**Issue:** `resolveVariable`, `resolveTextStyle`, and `resolveEffectStyle` share nearly identical logic.

**Step 1: Create generic resolution helper**

Add at the top of the file:

```typescript
interface TokenResolution<T> {
  value: T | null;
  suggestion?: string;
}

function resolveToken<T extends { name: string }>(
  tokenPath: string,
  tokenMap: Map<string, T>,
  tokenType: string
): TokenResolution<T> {
  const normalized = tokenPath.toLowerCase().replace(/\./g, '/');

  // 1. Try exact match
  if (tokenMap.has(normalized)) {
    return { value: tokenMap.get(normalized)! };
  }

  // 2. Try with common prefixes stripped
  const prefixVariants = [
    normalized,
    normalized.replace(/^(primitives|tokens|semantic|alias|ref)\//i, ''),
  ];

  for (const variant of prefixVariants) {
    if (tokenMap.has(variant)) {
      return { value: tokenMap.get(variant)! };
    }
  }

  // 3. Try partial match by final segment
  const lastSegment = normalized.split('/').pop() || '';
  for (const [name, token] of tokenMap.entries()) {
    const nameLower = name.toLowerCase();
    if (nameLower.endsWith('/' + lastSegment) || nameLower.endsWith('.' + lastSegment)) {
      return { value: token };
    }
  }

  // 4. Not found - generate suggestion
  const suggestion = findClosestMatch(normalized, tokenMap, tokenType);
  return { value: null, suggestion };
}

function findClosestMatch<T extends { name: string }>(
  target: string,
  tokenMap: Map<string, T>,
  tokenType: string
): string | undefined {
  const targetLast = target.split('/').pop() || '';

  for (const name of tokenMap.keys()) {
    if (name.toLowerCase().includes(targetLast)) {
      return name;
    }
  }
  return undefined;
}
```

**Step 2: Simplify existing functions**

```typescript
export function resolveVariable(
  tokenPath: string,
  variableMap: Map<string, Variable>
): VariableResolution {
  const result = resolveToken(tokenPath, variableMap, 'variable');
  return result;
}

export function resolveTextStyle(
  tokenPath: string,
  textStyleMap: Map<string, TextStyle>
): TextStyleResolution {
  const result = resolveToken(tokenPath, textStyleMap, 'text style');
  return result;
}

export function resolveEffectStyle(
  tokenPath: string,
  effectStyleMap: Map<string, EffectStyle>
): EffectStyleResolution {
  const result = resolveToken(tokenPath, effectStyleMap, 'effect style');
  return result;
}
```

**Step 3: Run tests**

```bash
npm test
```

Expected: All 25 tokenResolver tests should still pass.

**Step 4: Commit**

```bash
git add src/core/tokenResolver.ts
git commit -m "refactor(tokenResolver): extract generic resolution helper to reduce duplication"
```

---

### Task 2.2: Extract Padding Application Helper

**Files:**
- Modify: `src/core/generator.ts:989-1075`

**Issue:** Padding token resolution is duplicated 4 times (top, right, bottom, left).

**Step 1: Create helper function**

Add before `applyLayout`:

```typescript
async function applyPaddingWithToken(
  node: FrameNode | ComponentNode,
  paddingField: 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft',
  tokenValue: string | undefined,
  rawValue: number | undefined,
  context: GenerationContext
): Promise<void> {
  if (tokenValue) {
    const result = resolveVariable(tokenValue, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', tokenValue);
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable(paddingField, result.value);
        return;
      }
    } else {
      context.warnings.push(formatResolutionError('variable', tokenValue, result.suggestion));
    }
  }

  if (typeof rawValue === 'number') {
    node[paddingField] = rawValue;
  }
}
```

**Step 2: Replace duplicated code in applyLayout**

```typescript
// Replace the 4 blocks of padding code with:
await applyPaddingWithToken(node, 'paddingTop', layout.paddingTopToken, layout.paddingTop, context);
await applyPaddingWithToken(node, 'paddingRight', layout.paddingRightToken, layout.paddingRight, context);
await applyPaddingWithToken(node, 'paddingBottom', layout.paddingBottomToken, layout.paddingBottom, context);
await applyPaddingWithToken(node, 'paddingLeft', layout.paddingLeftToken, layout.paddingLeft, context);
```

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/core/generator.ts
git commit -m "refactor(generator): extract applyPaddingWithToken helper to reduce duplication"
```

---

### Task 2.3: Rename Unclear Functions/Types

**Files:**
- Modify: `src/core/generator.ts:321` (generateVariableKeys)
- Modify: `src/core/parser.ts:646` (TokenReference.type)

**Step 1: Rename generateVariableKeys**

```typescript
// Change function name from:
function generateVariableKeys(variableName: string, collectionName: string): string[]

// To:
function buildVariableLookupAliases(variableName: string, collectionName: string): string[]
```

Update all call sites (should be 1 location around line 194).

**Step 2: Rename TokenReference.type to category**

```typescript
// In parser.ts, change:
export interface TokenReference {
  token: string;
  type: 'variable' | 'textStyle' | 'effectStyle';
  path: string;
}

// To:
export interface TokenReference {
  token: string;
  category: 'variable' | 'textStyle' | 'effectStyle';
  path: string;
}
```

Update all usages in parser.ts and main.ts.

**Step 3: Run tests**

```bash
npm test
```

**Step 4: Commit**

```bash
git add src/core/generator.ts src/core/parser.ts src/main.ts
git commit -m "refactor: rename unclear identifiers for better readability"
```

---

### Task 2.4: Fix Window Property Store Anti-Pattern

**Files:**
- Modify: `src/ui.ts:143, 160, 179`

**Issue:** Using `(window as { jsonContents?: string[] }).jsonContents` is a code smell.

**Step 1: Create proper module state**

At the top of ui.ts, after the interface definitions:

```typescript
// Module state
const state = {
  jsonContents: [] as string[],
  pendingGeneration: false,
};
```

**Step 2: Replace all window.jsonContents usages**

```typescript
// Line 143 - change:
(window as { jsonContents?: string[] }).jsonContents = jsonStrings;
// To:
state.jsonContents = jsonStrings;

// Line 160 - change:
const jsonContents = (window as { jsonContents?: string[] }).jsonContents;
// To:
const jsonContents = state.jsonContents;

// Line 179 - change:
const jsonContents = (window as { jsonContents?: string[] }).jsonContents;
// To:
const jsonContents = state.jsonContents;
```

**Step 3: Remove the existing pendingGeneration variable and use state.pendingGeneration**

**Step 4: Build to verify**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/ui.ts
git commit -m "refactor(ui): replace window property store with proper module state"
```

---

## Phase 3: Generator Module Split

### Task 3.1: Create Generator Module Structure

**Files:**
- Create: `src/core/generator/index.ts`
- Create: `src/core/generator/context.ts`
- Create: `src/core/generator/types.ts`

**Step 1: Create types.ts with shared interfaces**

```typescript
// src/core/generator/types.ts
import { IconRegistryResolver } from '../iconRegistry';

export interface GenerationContext {
  componentMap: Map<string, ComponentNode | ComponentSetNode>;
  variableMap: Map<string, Variable>;
  textStyleMap: Map<string, TextStyle>;
  effectStyleMap: Map<string, EffectStyle>;
  iconResolver: IconRegistryResolver;
  warnings: string[];
}

export interface GenerateResult {
  success: boolean;
  warnings: string[];
  error?: string;
  createdCount: number;
}

export const PLUGIN_DATA_KEY = 'jasoti.id';
export const PLUGIN_DATA_NODE_ID = 'jasoti.nodeId';
```

**Step 2: Create context.ts**

Move `buildContext`, `generateVariableLookupAliases`, `generateStyleKeys` functions from generator.ts.

**Step 3: Create index.ts that re-exports**

```typescript
// src/core/generator/index.ts
export { generateFromSchema, buildTokenMaps } from './main';
export type { GenerateResult, GenerationContext } from './types';
```

**Step 4: Commit structure**

```bash
git add src/core/generator/
git commit -m "refactor(generator): create module structure for generator split"
```

---

### Task 3.2: Extract Style Functions

**Files:**
- Create: `src/core/generator/styles.ts`
- Modify: `src/core/generator.ts`

**Step 1: Move to styles.ts**

Move these functions:
- `applyStyles` (lines 1182-1351)
- `applyImageFill` (lines 1161-1180)

**Step 2: Export and import**

```typescript
// styles.ts
export async function applyStyles(...) { ... }
export async function applyImageFill(...) { ... }
```

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/core/generator/styles.ts src/core/generator.ts
git commit -m "refactor(generator): extract style application to separate module"
```

---

### Task 3.3: Extract Layout Functions

**Files:**
- Create: `src/core/generator/layout.ts`
- Modify: `src/core/generator.ts`

**Step 1: Move to layout.ts**

Move these functions:
- `applyLayout` (lines 985-1160)
- `applyPaddingWithToken` (new helper)
- `positionComponents` (lines 1353+)

**Step 2: Build to verify**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/core/generator/layout.ts src/core/generator.ts
git commit -m "refactor(generator): extract layout functions to separate module"
```

---

### Task 3.4: Extract Node Creation Functions

**Files:**
- Create: `src/core/generator/nodes.ts`
- Modify: `src/core/generator.ts`

**Step 1: Move to nodes.ts**

Move these functions:
- `createFrameNode`
- `createTextNode`
- `createInstanceNode`
- `createRectangleNode`
- `createEllipseNode`
- `createMissingIconPlaceholder`

**Step 2: Update imports in main generator**

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/core/generator/nodes.ts src/core/generator.ts
git commit -m "refactor(generator): extract node creation to separate module"
```

---

## Phase 4: Test Coverage

### Task 4.1: Add Generator Context Tests

**Files:**
- Create: `src/core/generator/context.test.ts`

**Step 1: Create test file with mocks**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildVariableLookupAliases, generateStyleKeys } from './context';

describe('buildVariableLookupAliases', () => {
  it('generates aliases for simple variable name', () => {
    const aliases = buildVariableLookupAliases('primary', 'colors');

    expect(aliases).toContain('colors/primary');
    expect(aliases).toContain('primary');
  });

  it('handles nested variable paths', () => {
    const aliases = buildVariableLookupAliases('blue/500', 'primitives/colors');

    expect(aliases).toContain('primitives/colors/blue/500');
    expect(aliases).toContain('colors/blue/500');
    expect(aliases).toContain('blue/500');
  });

  it('normalizes separators', () => {
    const aliases = buildVariableLookupAliases('spacing.md', 'tokens');

    expect(aliases.some(a => a.includes('spacing/md') || a.includes('spacing.md'))).toBe(true);
  });
});

describe('generateStyleKeys', () => {
  it('generates keys for style name', () => {
    const keys = generateStyleKeys('Heading/H1');

    expect(keys).toContain('heading/h1');
    expect(keys).toContain('heading.h1');
  });
});
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/core/generator/context.test.ts
git commit -m "test(generator): add context building tests"
```

---

### Task 4.2: Add Parser Edge Case Tests

**Files:**
- Modify: `src/core/parser.test.ts`

**Step 1: Add depth limit tests**

```typescript
describe('parseSchema depth limits', () => {
  it('rejects schema exceeding max nesting depth', () => {
    // Build a deeply nested structure (51 levels)
    let nested: any = { nodeType: 'text', id: 'deep', name: 'Deep' };
    for (let i = 0; i < 51; i++) {
      nested = {
        nodeType: 'frame',
        id: `frame-${i}`,
        name: `Frame ${i}`,
        children: [nested]
      };
    }

    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [nested]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('depth'))).toBe(true);
  });
});
```

**Step 2: Add multi-file merge tests**

```typescript
describe('parseSchemas multi-file', () => {
  it('merges components from multiple files', () => {
    const file1 = JSON.stringify({
      components: [{ id: 'btn', name: 'Button', layout: {} }]
    });
    const file2 = JSON.stringify({
      components: [{ id: 'card', name: 'Card', layout: {} }]
    });

    const result = parseSchemas([file1, file2]);

    expect(result.valid).toBe(true);
    expect(result.schema?.components).toHaveLength(2);
  });

  it('detects duplicate IDs across files', () => {
    const file1 = JSON.stringify({
      components: [{ id: 'btn', name: 'Button', layout: {} }]
    });
    const file2 = JSON.stringify({
      components: [{ id: 'btn', name: 'Button2', layout: {} }]
    });

    const result = parseSchemas([file1, file2]);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('separates registries from schemas', () => {
    const schema = JSON.stringify({
      components: [{ id: 'btn', name: 'Button', layout: {} }]
    });
    const registry = JSON.stringify({
      type: 'icon-registry',
      library: 'lucide',
      figmaLibraryName: 'Lucide',
      icons: { search: 'key123' }
    });

    const result = parseSchemas([schema, registry]);

    expect(result.valid).toBe(true);
    expect(result.schema?.components).toHaveLength(1);
    expect(result.registries).toHaveLength(1);
    expect(result.registries[0].library).toBe('lucide');
  });
});
```

**Step 3: Run tests**

```bash
npm test
```

**Step 4: Commit**

```bash
git add src/core/parser.test.ts
git commit -m "test(parser): add edge case tests for depth limits and multi-file merging"
```

---

### Task 4.3: Add Resolver Edge Case Tests

**Files:**
- Modify: `src/core/resolver.test.ts`

**Step 1: Add tests for deep dependencies and missing refs**

```typescript
describe('resolveDependencies edge cases', () => {
  it('handles 5-level deep dependency chains', () => {
    const schema: Schema = {
      components: [
        { id: 'a', name: 'A', layout: {}, children: [
          { nodeType: 'instance', name: 'B', ref: 'b' }
        ]},
        { id: 'b', name: 'B', layout: {}, children: [
          { nodeType: 'instance', name: 'C', ref: 'c' }
        ]},
        { id: 'c', name: 'C', layout: {}, children: [
          { nodeType: 'instance', name: 'D', ref: 'd' }
        ]},
        { id: 'd', name: 'D', layout: {}, children: [
          { nodeType: 'instance', name: 'E', ref: 'e' }
        ]},
        { id: 'e', name: 'E', layout: {} },
      ]
    };

    const result = resolveDependencies(schema);

    expect(result.success).toBe(true);
    // e should come before d, d before c, etc.
    const order = result.order!;
    expect(order.indexOf('e')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('c'));
  });

  it('handles missing dependency references gracefully', () => {
    const schema: Schema = {
      components: [
        { id: 'a', name: 'A', layout: {}, children: [
          { nodeType: 'instance', name: 'Missing', ref: 'nonexistent' }
        ]}
      ]
    };

    const result = resolveDependencies(schema);

    // Should still succeed - missing refs are handled at generation time
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/core/resolver.test.ts
git commit -m "test(resolver): add edge case tests for deep chains and missing refs"
```

---

### Task 4.4: Add TokenMapper Tests

**Files:**
- Create: `src/core/tokenMapper.test.ts`

**Step 1: Create test file**

```typescript
import { describe, it, expect } from 'vitest';
import { extractTokens } from './tokenMapper';
import { Schema } from '../types/schema';

describe('extractTokens', () => {
  it('extracts fill tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        fillToken: 'color.primary'
      }]
    };

    const tokens = extractTokens(schema);

    expect(tokens.some(t => t.token === 'color.primary')).toBe(true);
  });

  it('extracts tokens from nested children', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'frame',
          id: 'inner',
          name: 'Inner',
          fillToken: 'color.surface',
          children: [{
            nodeType: 'text',
            id: 'text',
            name: 'Text',
            textStyleToken: 'typography.body'
          }]
        }]
      }]
    };

    const tokens = extractTokens(schema);

    expect(tokens.some(t => t.token === 'color.surface')).toBe(true);
    expect(tokens.some(t => t.token === 'typography.body')).toBe(true);
  });

  it('extracts tokens from componentSet variants', () => {
    const schema: Schema = {
      componentSets: [{
        id: 'btn',
        name: 'Button',
        variantProps: ['state'],
        base: { layout: {}, fillToken: 'color.base' },
        variants: [
          { props: { state: 'default' }, fillToken: 'color.default' },
          { props: { state: 'hover' }, fillToken: 'color.hover' }
        ]
      }]
    };

    const tokens = extractTokens(schema);

    expect(tokens.some(t => t.token === 'color.base')).toBe(true);
    expect(tokens.some(t => t.token === 'color.default')).toBe(true);
    expect(tokens.some(t => t.token === 'color.hover')).toBe(true);
  });

  it('handles empty schema', () => {
    const schema: Schema = {};
    const tokens = extractTokens(schema);
    expect(tokens).toHaveLength(0);
  });
});
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/core/tokenMapper.test.ts
git commit -m "test(tokenMapper): add comprehensive token extraction tests"
```

---

### Task 4.5: Add IconRegistry Edge Case Tests

**Files:**
- Modify: `src/core/iconRegistry.test.ts`

**Step 1: Add edge case tests**

```typescript
describe('IconRegistryResolver edge cases', () => {
  it('handles empty registry', () => {
    const emptyRegistry: IconRegistry = {
      type: 'icon-registry',
      library: 'empty',
      figmaLibraryName: 'Empty',
      icons: {}
    };

    const resolver = new IconRegistryResolver([emptyRegistry]);
    const result = resolver.resolve('empty:anything');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('not found');
  });

  it('handles registry with special characters in icon names', () => {
    const registry: IconRegistry = {
      type: 'icon-registry',
      library: 'test',
      figmaLibraryName: 'Test',
      icons: {
        'arrow-left': 'key1',
        'arrow_right': 'key2',
        'arrow.up': 'key3'
      }
    };

    const resolver = new IconRegistryResolver([registry]);

    expect(resolver.resolve('test:arrow-left').componentKey).toBe('key1');
    expect(resolver.resolve('test:arrow_right').componentKey).toBe('key2');
    expect(resolver.resolve('test:arrow.up').componentKey).toBe('key3');
  });

  it('provides multiple suggestions for partial matches', () => {
    const registry: IconRegistry = {
      type: 'icon-registry',
      library: 'test',
      figmaLibraryName: 'Test',
      icons: {
        'search': 'key1',
        'search-plus': 'key2',
        'search-minus': 'key3'
      }
    };

    const resolver = new IconRegistryResolver([registry]);
    const result = resolver.resolve('test:sear');

    expect(result.error).toContain('search');
  });
});
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/core/iconRegistry.test.ts
git commit -m "test(iconRegistry): add edge case tests for empty registries and special characters"
```

---

## Phase 5: Type Safety

### Task 5.1: Add Stricter Parser Type Guards

**Files:**
- Create: `src/core/typeGuards.ts`
- Modify: `src/core/parser.ts`

**Step 1: Create type guard utilities**

```typescript
// src/core/typeGuards.ts

import { ComponentDefinition, ComponentSetDefinition, ChildNode, LayoutProps } from '../types/schema';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function hasRequiredFields<T extends Record<string, unknown>>(
  obj: unknown,
  fields: (keyof T)[]
): obj is T {
  if (!isRecord(obj)) return false;
  return fields.every(field => field in obj);
}

export function isValidNodeType(value: unknown): value is ChildNode['nodeType'] {
  return typeof value === 'string' &&
    ['frame', 'text', 'instance', 'rectangle', 'ellipse'].includes(value);
}
```

**Step 2: Use in parser**

Replace unsafe casts in parser.ts with type guards.

**Step 3: Run tests**

```bash
npm test
```

**Step 4: Commit**

```bash
git add src/core/typeGuards.ts src/core/parser.ts
git commit -m "feat(types): add runtime type guards for safer parsing"
```

---

### Task 5.2: Add Error Codes

**Files:**
- Create: `src/core/errors.ts`
- Modify: `src/core/parser.ts`

**Step 1: Define error codes**

```typescript
// src/core/errors.ts

export type ValidationErrorCode =
  | 'INVALID_JSON'
  | 'MISSING_REQUIRED'
  | 'INVALID_TYPE'
  | 'DUPLICATE_ID'
  | 'INVALID_NODE_TYPE'
  | 'MAX_DEPTH_EXCEEDED'
  | 'INVALID_TOKEN_FORMAT'
  | 'INVALID_ICON_REF'
  | 'MUTUALLY_EXCLUSIVE';

export interface ValidationError {
  path: string;
  message: string;
  code: ValidationErrorCode;
}

export function createError(
  code: ValidationErrorCode,
  path: string,
  message: string
): ValidationError {
  return { code, path, message };
}
```

**Step 2: Update parser to use error codes**

Replace error objects with `createError()` calls.

**Step 3: Run tests**

Update tests to check error codes where needed.

**Step 4: Commit**

```bash
git add src/core/errors.ts src/core/parser.ts src/core/parser.test.ts
git commit -m "feat(errors): add error codes for programmatic error handling"
```

---

### Task 5.3: Add URL Validation for Images

**Files:**
- Modify: `src/core/generator.ts` (applyImageFill)

**Step 1: Add URL validation**

```typescript
function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// In applyImageFill:
if (!isValidImageUrl(imageUrl)) {
  context.warnings.push(`Blocked non-HTTP image URL: ${imageUrl}`);
  return;
}
```

**Step 2: Build to verify**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/core/generator.ts
git commit -m "security(generator): add URL validation for image fills"
```

---

### Task 5.4: Add Schema Limits

**Files:**
- Modify: `src/core/parser.ts`

**Step 1: Add constants and validation**

```typescript
const SCHEMA_LIMITS = {
  MAX_DEPTH: 50,
  MAX_COMPONENTS: 500,
  MAX_CHILDREN_PER_NODE: 200,
  MAX_VARIANTS: 100,
};

// Add to parseSchema:
if ((schema.components?.length || 0) + (schema.componentSets?.length || 0) > SCHEMA_LIMITS.MAX_COMPONENTS) {
  errors.push(createError(
    'MAX_DEPTH_EXCEEDED',
    'schema',
    `Schema exceeds maximum of ${SCHEMA_LIMITS.MAX_COMPONENTS} components`
  ));
}
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/core/parser.ts
git commit -m "security(parser): add schema-level limits to prevent resource exhaustion"
```

---

## Phase 6: Performance

### Task 6.1: Cache Component Lookups

**Files:**
- Modify: `src/core/generator.ts`

**Step 1: Add caching to buildContext**

Instead of calling `figma.currentPage.findAll` on every generation, cache the result and only refresh when needed.

```typescript
let cachedComponentMap: Map<string, ComponentNode | ComponentSetNode> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

function getComponentMap(): Map<string, ComponentNode | ComponentSetNode> {
  const now = Date.now();
  if (cachedComponentMap && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedComponentMap;
  }

  cachedComponentMap = new Map();
  const allComponents = figma.currentPage.findAll(n =>
    (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') &&
    n.getPluginData(PLUGIN_DATA_KEY)
  );

  allComponents.forEach(c => {
    const id = c.getPluginData(PLUGIN_DATA_KEY);
    if (id) cachedComponentMap!.set(id, c as ComponentNode | ComponentSetNode);
  });

  cacheTimestamp = now;
  return cachedComponentMap;
}
```

**Step 2: Build to verify**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/core/generator.ts
git commit -m "perf(generator): cache component lookups with TTL"
```

---

### Task 6.2: Pre-index Token Suffixes

**Files:**
- Modify: `src/core/tokenResolver.ts`

**Step 1: Add suffix index for O(1) lookups**

```typescript
// Add to module scope
const suffixIndex = new Map<string, string[]>();

export function buildSuffixIndex(variableMap: Map<string, Variable>): void {
  suffixIndex.clear();
  for (const name of variableMap.keys()) {
    const suffix = name.split('/').pop() || name;
    const normalizedSuffix = suffix.toLowerCase();
    if (!suffixIndex.has(normalizedSuffix)) {
      suffixIndex.set(normalizedSuffix, []);
    }
    suffixIndex.get(normalizedSuffix)!.push(name);
  }
}

// Use in resolveToken for O(1) suffix lookup
```

**Step 2: Call buildSuffixIndex in buildContext**

**Step 3: Run tests**

```bash
npm test
```

**Step 4: Commit**

```bash
git add src/core/tokenResolver.ts src/core/generator.ts
git commit -m "perf(tokenResolver): add suffix index for O(1) partial lookups"
```

---

### Task 6.3: Avoid Double JSON Parse

**Files:**
- Modify: `src/core/parser.ts`

**Step 1: Reuse parsed result in parseSchemas**

```typescript
// In parseSchemas, after parsing JSON for registry check:
if (isIconRegistry(parsed)) {
  registries.push(parsed);
  return;
}

// Instead of calling parseSchema(jsonString), pass the parsed object
const result = parseSchemaFromObject(parsed, index);
```

**Step 2: Create parseSchemaFromObject helper**

Extract the validation logic to work with already-parsed objects.

**Step 3: Run tests**

```bash
npm test
```

**Step 4: Commit**

```bash
git add src/core/parser.ts
git commit -m "perf(parser): avoid double JSON parsing in multi-file mode"
```

---

## Phase 7: Documentation

### Task 7.1: Add JSDoc to Generator Functions

**Files:**
- Modify: `src/core/generator.ts`

**Step 1: Add JSDoc to main functions**

```typescript
/**
 * Generate Figma components from a validated schema.
 *
 * @param schema - The validated schema containing component definitions
 * @param selectedIds - IDs of components to generate (with dependencies auto-included)
 * @param registries - Icon registries for resolving iconRef fields
 * @returns Result object with success status, warnings, and count of created components
 *
 * @example
 * const result = await generateFromSchema(schema, ['button', 'card'], [lucideRegistry]);
 * if (result.success) {
 *   console.log(`Created ${result.createdCount} components`);
 * }
 */
export async function generateFromSchema(
  schema: Schema,
  selectedIds: string[],
  registries: IconRegistry[] = []
): Promise<GenerateResult> {
```

**Step 2: Add JSDoc to other key functions**

- `buildContext`
- `applyLayout`
- `applyStyles`
- `createOrUpdateComponentSet`

**Step 3: Commit**

```bash
git add src/core/generator.ts
git commit -m "docs(generator): add JSDoc comments to public functions"
```

---

### Task 7.2: Add Inline Comments for Complex Logic

**Files:**
- Modify: `src/core/generator.ts:321-384` (variable key generation)

**Step 1: Add explanatory comments**

```typescript
/**
 * Generate multiple lookup aliases for a variable to support various naming conventions.
 *
 * Design systems use different naming patterns:
 * - Tokens Studio: "primitives/colors/primary"
 * - Figma Variables: "Colors/Primary"
 * - Code: "colors.primary" or "colors-primary"
 *
 * We generate aliases to match regardless of the source format.
 */
function buildVariableLookupAliases(variableName: string, collectionName: string): string[] {
  const aliases: string[] = [];

  // 1. Full path with collection: "primitives/colors/primary"
  // Needed when multiple collections have same variable names
  aliases.push(`${collectionName}/${variableName}`.toLowerCase());

  // 2. Variable name only: "primary"
  // For simple cases where names are unique
  aliases.push(variableName.toLowerCase());

  // ... etc with comments for each transformation
}
```

**Step 2: Commit**

```bash
git add src/core/generator.ts
git commit -m "docs(generator): add inline comments explaining naming convention handling"
```

---

## Phase 8: UX Polish

### Task 8.1: Improve Error Message Display

**Files:**
- Modify: `src/main.ts:105-110`

**Step 1: Show error count and first error**

```typescript
if (!parseResult.valid || !parseResult.schema) {
  const errorCount = parseResult.errors.length;
  const firstError = parseResult.errors[0]?.message || 'Unknown error';
  const suffix = errorCount > 1 ? ` (+${errorCount - 1} more errors)` : '';

  figma.notify(`Parse error: ${firstError}${suffix}`, { error: true });

  // Also log all errors to console for debugging
  console.error('Parse errors:', parseResult.errors);

  figma.ui.postMessage({ type: 'generation-complete' });
  return;
}
```

**Step 2: Build to verify**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/main.ts
git commit -m "ux(main): improve error message display with count and console logging"
```

---

### Task 8.2: Add Drag-and-Drop Support

**Files:**
- Modify: `src/ui.html`
- Modify: `src/ui.ts`

**Step 1: Add drag-drop styles**

```html
<!-- In ui.html, update file-picker styles -->
<style>
  .file-picker.drag-over {
    border-color: #18a0fb;
    background: #f0f9ff;
  }
</style>
```

**Step 2: Add drag-drop handlers in ui.ts**

```typescript
filePicker.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  filePicker.classList.add('drag-over');
});

filePicker.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  filePicker.classList.remove('drag-over');
});

filePicker.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  filePicker.classList.remove('drag-over');

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  // Filter for JSON files
  const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
  if (jsonFiles.length === 0) {
    showFileError('Please drop JSON files');
    return;
  }

  try {
    const fileContents: string[] = [];
    const fileNames: string[] = [];

    for (const file of jsonFiles) {
      const text = await file.text();
      fileContents.push(text);
      fileNames.push(file.name);
    }

    handleJsonContents(fileContents, fileNames);
  } catch (err) {
    showFileError('Failed to read dropped files');
  }
});
```

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/ui.html src/ui.ts
git commit -m "ux(ui): add drag-and-drop support for JSON files"
```

---

### Task 8.3: Add Generation Progress Indicator

**Files:**
- Modify: `src/ui.html`
- Modify: `src/ui.ts`
- Modify: `src/main.ts`

**Step 1: Add progress element in HTML**

```html
<div id="progressSection" style="display: none;" class="section">
  <div style="display: flex; align-items: center; gap: 8px;">
    <div class="spinner"></div>
    <span id="progressText">Generating...</span>
  </div>
</div>

<style>
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e5e5e5;
    border-top-color: #18a0fb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
```

**Step 2: Add progress messages from main.ts**

```typescript
// In generateFromSchema handler, add progress updates:
figma.ui.postMessage({
  type: 'generation-progress',
  payload: { stage: 'Resolving dependencies...' }
});

// ... after dependency resolution
figma.ui.postMessage({
  type: 'generation-progress',
  payload: { stage: `Generating ${toGenerate.length} components...` }
});
```

**Step 3: Handle progress in ui.ts**

```typescript
if (msg.type === 'generation-progress') {
  const progressSection = document.getElementById('progressSection')!;
  const progressText = document.getElementById('progressText')!;

  progressSection.style.display = 'block';
  progressText.textContent = msg.payload.stage;
}

if (msg.type === 'generation-complete') {
  document.getElementById('progressSection')!.style.display = 'none';
  // ... existing code
}
```

**Step 4: Build to verify**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/ui.html src/ui.ts src/main.ts
git commit -m "ux(ui): add generation progress indicator"
```

---

## Summary

| Phase | Tasks | Commits |
|-------|-------|---------|
| 1. Critical Fixes | 3 | 3 |
| 2. DRY Refactoring | 4 | 4 |
| 3. Generator Split | 4 | 4 |
| 4. Test Coverage | 5 | 5 |
| 5. Type Safety | 4 | 4 |
| 6. Performance | 3 | 3 |
| 7. Documentation | 2 | 2 |
| 8. UX Polish | 3 | 3 |
| **Total** | **28** | **28** |

**Estimated Implementation Time:** 2-3 sessions with AI assistance

---

## Verification Checklist

After completing all phases:

- [ ] `npm test` - All tests pass (should be ~100+ tests)
- [ ] `npm run build` - Build succeeds
- [ ] Manual test: Generate a component with tokens
- [ ] Manual test: Generate with icon refs
- [ ] Manual test: Drag-drop JSON files
- [ ] Manual test: Check progress indicator appears
