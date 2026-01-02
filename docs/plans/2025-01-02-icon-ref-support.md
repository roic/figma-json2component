# Icon Reference Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow developers to reference icons using human-readable syntax (`"iconRef": "lucide:search"`) instead of cryptic component keys.

**Architecture:** Add `iconRef` field to instance nodes that uses bundled icon registries (JSON mappings of icon names to component keys) for Lucide and Material libraries. Pre-flight validation checks if required libraries are enabled and shows clear error messages.

**Tech Stack:** TypeScript, Figma Plugin API, bundled JSON registries

---

## Background

Current approach requires cryptic component keys:
```json
{ "nodeType": "instance", "componentKey": "8f3a2b1c4d5e..." }
```

New approach uses readable names:
```json
{ "nodeType": "instance", "iconRef": "lucide:search" }
```

### Registry Format

Each library has a JSON file:
```json
{
  "library": "lucide",
  "figmaLibraryName": "Lucide Icons",
  "version": "1.0.0",
  "icons": {
    "search": "component-key-here",
    "home": "component-key-here",
    ...
  }
}
```

---

## Task 1: Define Icon Registry Types

**Files:**
- Create: `src/types/iconRegistry.ts`

**Step 1: Create the icon registry type definitions**

```typescript
// src/types/iconRegistry.ts

export interface IconRegistry {
  library: string;           // e.g., "lucide", "material"
  figmaLibraryName: string;  // e.g., "Lucide Icons" (for error messages)
  version: string;
  icons: Record<string, string>;  // iconName → componentKey
}

export interface IconRef {
  library: string;
  iconName: string;
  raw: string;  // Original "lucide:search" string
}

export function parseIconRef(ref: string): IconRef | null {
  const parts = ref.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return {
    library: parts[0].toLowerCase(),
    iconName: parts[1].toLowerCase(),
    raw: ref,
  };
}
```

**Step 2: Commit**

```bash
git add src/types/iconRegistry.ts
git commit -m "feat(types): add icon registry type definitions"
```

---

## Task 2: Update Schema to Add iconRef Field

**Files:**
- Modify: `src/types/schema.ts:80-89`

**Step 1: Add iconRef to InstanceNode interface**

Update the InstanceNode interface:

```typescript
export interface InstanceNode {
  nodeType: 'instance';
  id?: string;
  name: string;
  ref?: string;           // Local component reference
  componentKey?: string;  // Published library component key (direct)
  iconRef?: string;       // Icon library reference (e.g., "lucide:search")
  variantProps?: Record<string, string>;
  overrides?: Record<string, { text?: string }>;
  layout?: Pick<LayoutProps, 'width' | 'height'>;
}
```

**Step 2: Commit**

```bash
git add src/types/schema.ts
git commit -m "feat(schema): add iconRef field for icon library references"
```

---

## Task 3: Update Parser Validation for iconRef

**Files:**
- Modify: `src/core/parser.ts:489-499`
- Test: `src/core/parser.test.ts`

**Step 1: Write failing tests for iconRef validation**

Add to `src/core/parser.test.ts`:

```typescript
describe('parseSchema iconRef validation', () => {
  it('validates instance with iconRef (no ref/componentKey required)', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'SearchIcon',
          iconRef: 'lucide:search'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('returns error for invalid iconRef format (missing colon)', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          iconRef: 'lucide-search'  // Invalid: no colon
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('iconRef'))).toBe(true);
  });

  it('returns error when instance has both ref and iconRef', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          ref: 'button',
          iconRef: 'lucide:search'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('only one'))).toBe(true);
  });

  it('returns error when instance has both componentKey and iconRef', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          componentKey: 'abc123',
          iconRef: 'lucide:search'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL

**Step 3: Update validateChildNode in parser.ts**

Add import at top:
```typescript
import { parseIconRef } from '../types/iconRegistry';
```

Replace instance validation section (~line 489):

```typescript
// Instance-specific validation
if (n.nodeType === 'instance') {
  const hasRef = n.ref && typeof n.ref === 'string';
  const hasComponentKey = n.componentKey && typeof n.componentKey === 'string';
  const hasIconRef = n.iconRef && typeof n.iconRef === 'string';

  // Count how many reference types are specified
  const refCount = [hasRef, hasComponentKey, hasIconRef].filter(Boolean).length;

  if (refCount === 0) {
    errors.push({ path, message: "Instance requires 'ref', 'componentKey', or 'iconRef'" });
  }
  if (refCount > 1) {
    errors.push({ path, message: "Instance can only have one of 'ref', 'componentKey', or 'iconRef'" });
  }

  // Validate iconRef format
  if (hasIconRef) {
    const parsed = parseIconRef(n.iconRef);
    if (!parsed) {
      errors.push({ path, message: "Invalid iconRef format. Expected 'library:iconName' (e.g., 'lucide:search')" });
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/parser.ts src/core/parser.test.ts
git commit -m "feat(parser): validate iconRef field for icon library references"
```

---

## Task 4: Create Icon Registry Loader

**Files:**
- Create: `src/core/iconRegistry.ts`

**Step 1: Create the registry loader module**

```typescript
// src/core/iconRegistry.ts

import { IconRegistry, IconRef, parseIconRef } from '../types/iconRegistry';

// Import bundled registries
import lucideRegistry from '../registries/lucide.json';
import materialRegistry from '../registries/material.json';

// Registry cache
const registries: Map<string, IconRegistry> = new Map();

// Initialize with bundled registries
function initRegistries(): void {
  if (registries.size > 0) return;

  registries.set('lucide', lucideRegistry as IconRegistry);
  registries.set('material', materialRegistry as IconRegistry);
}

/**
 * Get the component key for an iconRef.
 * Returns null if library or icon not found.
 */
export function resolveIconRef(iconRef: string): {
  componentKey: string | null;
  library: string;
  iconName: string;
  error?: string;
} {
  initRegistries();

  const parsed = parseIconRef(iconRef);
  if (!parsed) {
    return {
      componentKey: null,
      library: '',
      iconName: '',
      error: `Invalid iconRef format: '${iconRef}'`,
    };
  }

  const registry = registries.get(parsed.library);
  if (!registry) {
    const available = [...registries.keys()].join(', ');
    return {
      componentKey: null,
      library: parsed.library,
      iconName: parsed.iconName,
      error: `Unknown icon library '${parsed.library}'. Available: ${available}`,
    };
  }

  const componentKey = registry.icons[parsed.iconName];
  if (!componentKey) {
    // Find similar icon names for suggestions
    const allIcons = Object.keys(registry.icons);
    const suggestions = allIcons
      .filter(name => name.includes(parsed.iconName) || parsed.iconName.includes(name))
      .slice(0, 3);

    const suggestionText = suggestions.length > 0
      ? ` Did you mean: ${suggestions.join(', ')}?`
      : '';

    return {
      componentKey: null,
      library: parsed.library,
      iconName: parsed.iconName,
      error: `Icon '${parsed.iconName}' not found in ${registry.figmaLibraryName}.${suggestionText}`,
    };
  }

  return {
    componentKey,
    library: parsed.library,
    iconName: parsed.iconName,
  };
}

/**
 * Get the Figma library name for a library key.
 */
export function getLibraryDisplayName(library: string): string {
  initRegistries();
  return registries.get(library)?.figmaLibraryName || library;
}

/**
 * Get all available libraries.
 */
export function getAvailableLibraries(): string[] {
  initRegistries();
  return [...registries.keys()];
}

export { parseIconRef };
```

**Step 2: Commit**

```bash
git add src/core/iconRegistry.ts
git commit -m "feat(core): add icon registry loader with lookup functions"
```

---

## Task 5: Create Placeholder Registry Files

**Files:**
- Create: `src/registries/lucide.json`
- Create: `src/registries/material.json`

**Step 1: Create placeholder Lucide registry**

```json
{
  "library": "lucide",
  "figmaLibraryName": "Lucide Icons",
  "version": "0.0.1",
  "icons": {
    "_placeholder": "This file needs to be populated with actual component keys"
  }
}
```

Save to `src/registries/lucide.json`

**Step 2: Create placeholder Material registry**

```json
{
  "library": "material",
  "figmaLibraryName": "Material Design Icons",
  "version": "0.0.1",
  "icons": {
    "_placeholder": "This file needs to be populated with actual component keys"
  }
}
```

Save to `src/registries/material.json`

**Step 3: Update tsconfig.json to allow JSON imports**

Add to compilerOptions:
```json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

**Step 4: Commit**

```bash
git add src/registries/*.json tsconfig.json
git commit -m "feat(registries): add placeholder Lucide and Material registry files"
```

---

## Task 6: Create Registry Extraction Script

**Files:**
- Create: `scripts/extract-icon-registry.ts`

**Purpose:** Run this in Figma to extract component keys from an enabled library.

**Step 1: Create the extraction script**

```typescript
// scripts/extract-icon-registry.ts
//
// This script is meant to be run in the Figma console or as a plugin
// to extract component keys from an enabled library.
//
// Usage:
// 1. Enable the icon library in Figma (Assets → Libraries)
// 2. Run this script in the Figma console
// 3. Copy the output JSON

const LIBRARY_NAME = 'Lucide Icons'; // Change for different libraries

async function extractIconRegistry() {
  const output: Record<string, string> = {};

  // This approach works for components already used in the file
  // For full library extraction, you'd need the Figma REST API

  console.log('Extracting icons from library:', LIBRARY_NAME);
  console.log('Note: This extracts icons that have been used in this file.');
  console.log('For full library extraction, use the Figma REST API.');

  // Find all instances from the target library
  const instances = figma.currentPage.findAll(n => n.type === 'INSTANCE') as InstanceNode[];

  for (const instance of instances) {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) continue;

    // Check if from target library
    // Note: This is a simplified check
    try {
      const key = mainComponent.key;
      const name = mainComponent.name.toLowerCase().replace(/\s+/g, '-');
      output[name] = key;
    } catch (e) {
      // Skip if can't get key
    }
  }

  const registry = {
    library: LIBRARY_NAME.toLowerCase().replace(/\s+/g, '-'),
    figmaLibraryName: LIBRARY_NAME,
    version: '1.0.0',
    icons: output
  };

  console.log(JSON.stringify(registry, null, 2));
  return registry;
}

// Run extraction
extractIconRegistry();
```

**Step 2: Document the extraction process**

The actual extraction requires either:
1. Figma REST API access to the library file
2. A helper plugin that can enumerate library components

For now, we'll provide placeholder registries and document how to populate them.

**Step 3: Commit**

```bash
git add scripts/extract-icon-registry.ts
git commit -m "feat(scripts): add icon registry extraction helper"
```

---

## Task 7: Update Generator to Resolve iconRef

**Files:**
- Modify: `src/core/generator.ts` (createInstanceNode function)

**Step 1: Add import for icon registry**

At top of file:
```typescript
import { resolveIconRef } from './iconRegistry';
```

**Step 2: Update createInstanceNode to handle iconRef**

Find the `createInstanceNode` function and update the beginning:

```typescript
async function createInstanceNode(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  context: GenerationContext
): Promise<InstanceNode | null> {
  let mainComponent: ComponentNode | null = null;
  let componentKey: string | undefined = def.componentKey;

  // Case 0: Resolve iconRef to componentKey
  if (def.iconRef) {
    const resolved = resolveIconRef(def.iconRef);
    if (resolved.error) {
      context.warnings.push(resolved.error);
      console.warn(`⚠️ ${resolved.error}`);
      return null;
    }
    componentKey = resolved.componentKey!;
  }

  // Case 1: Library component via componentKey (includes resolved iconRef)
  if (componentKey) {
    try {
      const imported = await figma.importComponentByKeyAsync(componentKey);
      // ... rest of existing componentKey handling
```

The key insight: `iconRef` resolution produces a `componentKey`, which then uses the existing componentKey flow.

**Step 3: Build to verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/core/generator.ts
git commit -m "feat(generator): resolve iconRef to componentKey before import"
```

---

## Task 8: Add Pre-flight Icon Validation

**Files:**
- Modify: `src/core/parser.ts` (add extractIconRefs function)
- Modify: `src/main.ts` (add icon validation to validate-tokens handler)

**Step 1: Add extractIconRefs to parser.ts**

Add after `extractTokenReferences`:

```typescript
export interface IconReference {
  iconRef: string;
  library: string;
  iconName: string;
  path: string;
}

export function extractIconRefs(schema: Schema): IconReference[] {
  const refs: IconReference[] = [];

  function walkChildren(children: ChildNode[] | undefined, path: string) {
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childPath = `${path}.children[${i}]`;

      if (child.nodeType === 'instance' && child.iconRef) {
        const parsed = parseIconRef(child.iconRef);
        if (parsed) {
          refs.push({
            iconRef: child.iconRef,
            library: parsed.library,
            iconName: parsed.iconName,
            path: childPath,
          });
        }
      }

      if (child.nodeType === 'frame' && child.children) {
        walkChildren(child.children, childPath);
      }
    }
  }

  // Walk components
  schema.components?.forEach((comp, i) => {
    walkChildren(comp.children, `components[${i}]`);
  });

  // Walk componentSets
  schema.componentSets?.forEach((set, i) => {
    walkChildren(set.base.children, `componentSets[${i}].base`);
  });

  return refs;
}
```

Add import at top:
```typescript
import { parseIconRef } from '../types/iconRegistry';
```

**Step 2: Update validate-tokens handler in main.ts**

Add icon validation after token validation:

```typescript
// After token validation, add icon validation
const iconRefs = extractIconRefs(parseResult.schema);
const iconIssues: { iconRef: string; error: string }[] = [];

for (const ref of iconRefs) {
  const resolved = resolveIconRef(ref.iconRef);
  if (resolved.error) {
    iconIssues.push({ iconRef: ref.iconRef, error: resolved.error });
  } else {
    // Try to import to verify library is enabled
    try {
      await figma.importComponentByKeyAsync(resolved.componentKey!);
    } catch (e) {
      const libraryName = getLibraryDisplayName(ref.library);
      iconIssues.push({
        iconRef: ref.iconRef,
        error: `Library '${libraryName}' not enabled. Enable it in Assets → Libraries.`
      });
    }
  }
}

// Include icon issues in response
figma.ui.postMessage({
  type: 'token-validation-result',
  payload: {
    ...result,
    iconIssues  // Add this
  }
});
```

Add imports at top of main.ts:
```typescript
import { extractIconRefs } from './core/parser';
import { resolveIconRef, getLibraryDisplayName } from './core/iconRegistry';
```

**Step 3: Commit**

```bash
git add src/core/parser.ts src/main.ts
git commit -m "feat(validation): add pre-flight icon reference validation"
```

---

## Task 9: Update UI to Show Icon Validation Results

**Files:**
- Modify: `src/ui.ts`
- Modify: `src/ui.html`

**Step 1: Update validation result display**

In `src/ui.ts`, update the `token-validation-result` handler to show icon issues:

```typescript
// Add icon issues display
if (payload.iconIssues && payload.iconIssues.length > 0) {
  html += '<h4>Icon Issues:</h4><ul class="issues-list">';
  for (const issue of payload.iconIssues) {
    html += `<li><code>${issue.iconRef}</code>: ${issue.error}</li>`;
  }
  html += '</ul>';
}
```

**Step 2: Commit**

```bash
git add src/ui.ts src/ui.html
git commit -m "feat(ui): display icon validation issues in pre-flight dialog"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `docs/SCHEMA.md`

**Step 1: Update Instance Node section**

Add iconRef documentation to the Instance Node section:

```markdown
### Instance Node

References another component (local, library, or icon library).

**Local component reference:**
```json
{
  "nodeType": "instance",
  "name": "SubmitButton",
  "ref": "button",
  "variantProps": { "type": "primary", "state": "default" }
}
```

**Icon library reference (recommended for icons):**
```json
{
  "nodeType": "instance",
  "name": "SearchIcon",
  "iconRef": "lucide:search"
}
```

**Direct library component (for non-icon library components):**
```json
{
  "nodeType": "instance",
  "name": "CustomComponent",
  "componentKey": "abc123def456789..."
}
```

**Required:**
- `nodeType`: `"instance"`
- `name`: Figma layer name
- One of:
  - `ref`: Local component ID (from same schema)
  - `iconRef`: Icon library reference (format: `library:iconName`)
  - `componentKey`: Direct library component key

**Supported Icon Libraries:**
- `lucide`: Lucide Icons (e.g., `"lucide:search"`, `"lucide:home"`)
- `material`: Material Design Icons (e.g., `"material:search"`, `"material:home"`)

**Optional:**
- `id`: Schema node ID (for tracking)
- `variantProps`: Select variant
- `overrides`: Text content overrides
- `layout`: Override `width` and/or `height`
```

**Step 2: Commit**

```bash
git add docs/SCHEMA.md
git commit -m "docs: add iconRef documentation for icon library references"
```

---

## Task 11: Populate Icon Registries (Manual/API)

**Files:**
- Modify: `src/registries/lucide.json`
- Modify: `src/registries/material.json`

**Step 1: Obtain component keys**

Options:
1. **Figma REST API** - Use the API to get component keys from the library files
2. **Manual extraction** - Add icons to a Figma file, inspect instances
3. **Community resources** - Check if key mappings are published

For Lucide Icons Figma library:
- Community file: https://www.figma.com/community/file/...
- Use Figma REST API: `GET /v1/files/{file_key}/components`

**Step 2: Populate registries with actual keys**

This step requires manual work or API access. The registry format:

```json
{
  "library": "lucide",
  "figmaLibraryName": "Lucide Icons",
  "version": "1.0.0",
  "icons": {
    "search": "actual-component-key",
    "home": "actual-component-key",
    "settings": "actual-component-key",
    ...
  }
}
```

**Step 3: Commit**

```bash
git add src/registries/*.json
git commit -m "feat(registries): populate Lucide and Material icon registries"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Icon registry types | `src/types/iconRegistry.ts` |
| 2 | Add iconRef to schema | `src/types/schema.ts` |
| 3 | Parser validation | `src/core/parser.ts`, tests |
| 4 | Registry loader | `src/core/iconRegistry.ts` |
| 5 | Placeholder registries | `src/registries/*.json` |
| 6 | Extraction script | `scripts/extract-icon-registry.ts` |
| 7 | Generator integration | `src/core/generator.ts` |
| 8 | Pre-flight validation | `src/core/parser.ts`, `src/main.ts` |
| 9 | UI updates | `src/ui.ts`, `src/ui.html` |
| 10 | Documentation | `docs/SCHEMA.md` |
| 11 | Populate registries | `src/registries/*.json` |

**Dependencies:**
- Tasks 1-2 can run in parallel
- Task 3 depends on Task 1
- Tasks 4-5 can run together
- Task 7 depends on Tasks 4-5
- Task 8 depends on Tasks 3, 4
- Task 11 is semi-manual (API or manual extraction)

**Note on Registry Population (Task 11):**
This requires obtaining actual component keys from Figma. Options:
1. Use Figma REST API to fetch from community library files
2. Manual extraction by using icons in a file and inspecting
3. Check if Lucide/Material publish these mappings

The implementation is complete without Task 11, but `iconRef` won't resolve until registries are populated.
