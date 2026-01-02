# Icon Reference Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow developers to reference icons using human-readable syntax (`"iconRef": "lucide:search"`) with registry files maintained in their codebase.

**Architecture:** Add `iconRef` field to instance nodes. Registry files (JSON mappings of icon names to component keys) are stored alongside component files and loaded together. Extraction UI in JASOTI helps generate registries from enabled Figma libraries. Visible placeholder nodes on import failure.

**Tech Stack:** TypeScript, Figma Plugin API

---

## Background

### Current (cryptic keys)
```json
{ "nodeType": "instance", "componentKey": "8f2a3b1c4d5e..." }
```

### New (readable names)
```json
{ "nodeType": "instance", "iconRef": "lucide:search" }
```

### Folder Structure
```
figma-components/
├── registries/
│   ├── lucide.json          ← Extracted registry
│   └── material.json        ← Extracted registry
└── components/
    ├── button.json
    └── card.json            ← Uses "iconRef": "lucide:search"
```

### Workflow
1. **One-time:** Enable library in Figma → JASOTI "Extract Registry" → Save JSON to repo
2. **Daily:** Write `"iconRef": "lucide:search"` → Select registry + component files → Generate

### Future (CDN)
When published as a product, registries can be hosted on CDN and fetched by version. Extraction UI remains for custom/private libraries.

---

## Task 1: Define Icon Registry Types

**Files:**
- Create: `src/types/iconRegistry.ts`

**Step 1: Create type definitions**

```typescript
// src/types/iconRegistry.ts

export interface IconRegistry {
  library: string;           // e.g., "lucide", "material"
  figmaLibraryName: string;  // e.g., "Lucide Icons" (for error messages)
  fileKey?: string;          // Figma file key (for version tracking)
  extractedAt?: string;      // ISO date string
  icons: Record<string, string>;  // iconName → componentKey
}

export interface IconRef {
  library: string;
  iconName: string;
  raw: string;  // Original "lucide:search" string
}

/**
 * Parse an iconRef string like "lucide:search" into parts.
 */
export function parseIconRef(ref: string): IconRef | null {
  const trimmed = ref.trim();
  const colonIndex = trimmed.indexOf(':');

  if (colonIndex === -1 || colonIndex === 0 || colonIndex === trimmed.length - 1) {
    return null;
  }

  const library = trimmed.slice(0, colonIndex).toLowerCase().trim();
  const iconName = trimmed.slice(colonIndex + 1).toLowerCase().trim();

  if (!library || !iconName) {
    return null;
  }

  return { library, iconName, raw: ref };
}

/**
 * Check if a parsed JSON object is an IconRegistry (vs a component schema).
 */
export function isIconRegistry(obj: unknown): obj is IconRegistry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'library' in obj &&
    'icons' in obj &&
    typeof (obj as IconRegistry).library === 'string' &&
    typeof (obj as IconRegistry).icons === 'object'
  );
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
- Modify: `src/core/parser.ts`
- Test: `src/core/parser.test.ts`

**Step 1: Write failing tests**

Add to `src/core/parser.test.ts`:

```typescript
describe('parseSchema iconRef validation', () => {
  it('validates instance with iconRef', () => {
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

  it('returns error for invalid iconRef format', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          iconRef: 'lucide-search'  // Missing colon
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('iconRef'))).toBe(true);
  });

  it('returns error when instance has multiple reference types', () => {
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
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

**Step 3: Update instance validation in parser.ts**

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

  const refCount = [hasRef, hasComponentKey, hasIconRef].filter(Boolean).length;

  if (refCount === 0) {
    errors.push({ path, message: "Instance requires 'ref', 'componentKey', or 'iconRef'" });
  }
  if (refCount > 1) {
    errors.push({ path, message: "Instance can only have one of 'ref', 'componentKey', or 'iconRef'" });
  }

  if (hasIconRef) {
    const parsed = parseIconRef(n.iconRef);
    if (!parsed) {
      errors.push({ path, message: "Invalid iconRef format. Expected 'library:iconName' (e.g., 'lucide:search')" });
    }
  }
}
```

**Step 4: Run tests**

```bash
npm test
```

**Step 5: Commit**

```bash
git add src/core/parser.ts src/core/parser.test.ts
git commit -m "feat(parser): validate iconRef field"
```

---

## Task 4: Create Icon Registry Resolver

**Files:**
- Create: `src/core/iconRegistry.ts`
- Test: `src/core/iconRegistry.test.ts`

**Step 1: Write tests**

Create `src/core/iconRegistry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { IconRegistryResolver } from './iconRegistry';
import { IconRegistry } from '../types/iconRegistry';

describe('IconRegistryResolver', () => {
  const lucideRegistry: IconRegistry = {
    library: 'lucide',
    figmaLibraryName: 'Lucide Icons',
    icons: {
      'search': 'key-search-123',
      'home': 'key-home-456',
      'settings': 'key-settings-789',
    }
  };

  const materialRegistry: IconRegistry = {
    library: 'material',
    figmaLibraryName: 'Material Design Icons',
    icons: {
      'search': 'mat-search-abc',
      'home': 'mat-home-def',
    }
  };

  it('resolves valid iconRef', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('lucide:search');

    expect(result.componentKey).toBe('key-search-123');
    expect(result.error).toBeUndefined();
  });

  it('resolves from correct library when multiple loaded', () => {
    const resolver = new IconRegistryResolver([lucideRegistry, materialRegistry]);

    const lucideResult = resolver.resolve('lucide:search');
    expect(lucideResult.componentKey).toBe('key-search-123');

    const materialResult = resolver.resolve('material:search');
    expect(materialResult.componentKey).toBe('mat-search-abc');
  });

  it('returns error for unknown library', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('unknown:search');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('unknown');
    expect(result.error).toContain('lucide');  // Should list available
  });

  it('returns error for unknown icon with suggestions', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('lucide:sear');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('sear');
    expect(result.error).toContain('search');  // Should suggest similar
  });

  it('handles case insensitivity', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);

    expect(resolver.resolve('LUCIDE:SEARCH').componentKey).toBe('key-search-123');
    expect(resolver.resolve('Lucide:Search').componentKey).toBe('key-search-123');
  });

  it('returns error for invalid format', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('invalid-format');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('format');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

**Step 3: Create resolver module**

Create `src/core/iconRegistry.ts`:

```typescript
// src/core/iconRegistry.ts

import { IconRegistry, parseIconRef } from '../types/iconRegistry';

export interface IconResolveResult {
  componentKey: string | null;
  library: string;
  iconName: string;
  libraryDisplayName?: string;
  error?: string;
}

export class IconRegistryResolver {
  private registries: Map<string, IconRegistry> = new Map();

  constructor(registries: IconRegistry[] = []) {
    for (const registry of registries) {
      this.addRegistry(registry);
    }
  }

  addRegistry(registry: IconRegistry): void {
    this.registries.set(registry.library.toLowerCase(), registry);
  }

  getAvailableLibraries(): string[] {
    return [...this.registries.keys()];
  }

  getLibraryDisplayName(library: string): string {
    return this.registries.get(library.toLowerCase())?.figmaLibraryName || library;
  }

  resolve(iconRef: string): IconResolveResult {
    const parsed = parseIconRef(iconRef);

    if (!parsed) {
      return {
        componentKey: null,
        library: '',
        iconName: '',
        error: `Invalid iconRef format: '${iconRef}'. Expected 'library:iconName' (e.g., 'lucide:search')`,
      };
    }

    const registry = this.registries.get(parsed.library);

    if (!registry) {
      const available = this.getAvailableLibraries();
      const availableText = available.length > 0
        ? `Available: ${available.join(', ')}`
        : 'No icon registries loaded';

      return {
        componentKey: null,
        library: parsed.library,
        iconName: parsed.iconName,
        error: `Unknown icon library '${parsed.library}'. ${availableText}. Load a registry file for this library.`,
      };
    }

    const componentKey = registry.icons[parsed.iconName];

    if (!componentKey) {
      const suggestions = this.findSuggestions(registry, parsed.iconName);
      const suggestionText = suggestions.length > 0
        ? ` Did you mean: ${suggestions.join(', ')}?`
        : '';

      return {
        componentKey: null,
        library: parsed.library,
        iconName: parsed.iconName,
        libraryDisplayName: registry.figmaLibraryName,
        error: `Icon '${parsed.iconName}' not found in ${registry.figmaLibraryName}.${suggestionText}`,
      };
    }

    return {
      componentKey,
      library: parsed.library,
      iconName: parsed.iconName,
      libraryDisplayName: registry.figmaLibraryName,
    };
  }

  private findSuggestions(registry: IconRegistry, iconName: string): string[] {
    const allIcons = Object.keys(registry.icons);

    // Find icons that contain the search term or vice versa
    const matches = allIcons.filter(name =>
      name.includes(iconName) || iconName.includes(name)
    );

    // Sort by length similarity and return top 3
    return matches
      .sort((a, b) => Math.abs(a.length - iconName.length) - Math.abs(b.length - iconName.length))
      .slice(0, 3);
  }
}
```

**Step 4: Run tests**

```bash
npm test
```

**Step 5: Commit**

```bash
git add src/core/iconRegistry.ts src/core/iconRegistry.test.ts
git commit -m "feat(core): add icon registry resolver with suggestions"
```

---

## Task 5: Update Multi-File Parser to Load Registries

**Files:**
- Modify: `src/core/parser.ts` (parseSchemas function)

**Step 1: Update parseSchemas to detect and separate registries**

Find `parseSchemas` function and update to return registries alongside schema:

```typescript
import { IconRegistry, isIconRegistry } from '../types/iconRegistry';

export interface ParseSchemasResult extends ValidationResult {
  schema?: Schema;
  registries: IconRegistry[];
}

export function parseSchemas(jsonStrings: string[]): ParseSchemasResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const registries: IconRegistry[] = [];

  // Merged schema
  const merged: Schema = {
    components: [],
    componentSets: [],
  };

  for (let i = 0; i < jsonStrings.length; i++) {
    const jsonString = jsonStrings[i];

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      allErrors.push({ path: `file[${i}]`, message: `Invalid JSON: ${e}` });
      continue;
    }

    // Check if this is an icon registry
    if (isIconRegistry(parsed)) {
      registries.push(parsed);
      continue;
    }

    // Otherwise treat as component schema
    const result = parseSchema(jsonString);

    // Prefix errors with file index
    result.errors.forEach(e => {
      allErrors.push({ path: `file[${i}].${e.path}`, message: e.message });
    });
    result.warnings.forEach(w => {
      allWarnings.push({ path: `file[${i}].${w.path}`, message: w.message });
    });

    if (result.schema) {
      // Merge components
      if (result.schema.components) {
        merged.components!.push(...result.schema.components);
      }
      if (result.schema.componentSets) {
        merged.componentSets!.push(...result.schema.componentSets);
      }
      // Take first organization config found
      if (result.schema.organization && !merged.organization) {
        merged.organization = result.schema.organization;
      }
    }
  }

  // ... rest of duplicate ID checking, etc.

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    schema: merged,
    registries,
  };
}
```

**Step 2: Commit**

```bash
git add src/core/parser.ts
git commit -m "feat(parser): detect and load icon registries from multi-file input"
```

---

## Task 6: Update Generator to Resolve iconRef

**Files:**
- Modify: `src/core/generator.ts`

**Step 1: Update GenerationContext to include icon resolver**

```typescript
import { IconRegistryResolver } from './iconRegistry';

interface GenerationContext {
  componentMap: Map<string, ComponentNode | ComponentSetNode>;
  variableMap: Map<string, Variable>;
  textStyleMap: Map<string, TextStyle>;
  effectStyleMap: Map<string, EffectStyle>;
  iconResolver: IconRegistryResolver;  // Add this
  warnings: string[];
}
```

**Step 2: Update generateFromSchema to accept registries**

```typescript
export async function generateFromSchema(
  schema: Schema,
  selectedIds: string[],
  registries: IconRegistry[] = []  // Add parameter
): Promise<GenerateResult> {
  // ... existing code ...

  // Build context with icon resolver
  const context = await buildContext(warnings, registries);

  // ... rest of function
}

async function buildContext(
  warnings: string[],
  registries: IconRegistry[] = []
): Promise<GenerationContext> {
  // ... existing variable/style map building ...

  // Add icon resolver
  const iconResolver = new IconRegistryResolver(registries);

  return { componentMap, variableMap, textStyleMap, effectStyleMap, iconResolver, warnings };
}
```

**Step 3: Update createInstanceNode to handle iconRef**

At the beginning of `createInstanceNode`:

```typescript
async function createInstanceNode(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  context: GenerationContext
): Promise<InstanceNode | null> {
  let mainComponent: ComponentNode | null = null;
  let componentKey: string | undefined = def.componentKey;
  let iconRefSource: string | undefined;  // Track for placeholder message

  // Case 0: Resolve iconRef to componentKey
  if (def.iconRef) {
    iconRefSource = def.iconRef;
    const resolved = context.iconResolver.resolve(def.iconRef);

    if (resolved.error) {
      context.warnings.push(resolved.error);
      return createMissingIconPlaceholder(def, resolved.error, context);
    }

    componentKey = resolved.componentKey!;
  }

  // Case 1: Library component via componentKey (includes resolved iconRef)
  if (componentKey) {
    try {
      const imported = await figma.importComponentByKeyAsync(componentKey);
      // ... existing componentKey handling ...
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const source = iconRefSource || componentKey;
      const errorMsg = `Couldn't import '${source}'. Check that the library is enabled and the registry matches your library version.`;
      context.warnings.push(errorMsg);
      return createMissingIconPlaceholder(def, errorMsg, context);
    }
  }

  // ... rest of existing function ...
}
```

**Step 4: Add placeholder creation function**

```typescript
function createMissingIconPlaceholder(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  errorMessage: string,
  context: GenerationContext
): FrameNode {
  // Create a visible placeholder frame
  const placeholder = figma.createFrame();
  placeholder.name = `⚠️ ${def.name} (missing)`;

  // Size: use requested size or default 24x24
  const width = typeof def.layout?.width === 'number' ? def.layout.width : 24;
  const height = typeof def.layout?.height === 'number' ? def.layout.height : 24;
  placeholder.resize(width, height);

  // Style: red dashed border, no fill
  placeholder.fills = [];
  placeholder.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.3, b: 0.3 } }];
  placeholder.strokeWeight = 1;
  placeholder.dashPattern = [2, 2];

  // Store error for debugging
  placeholder.setPluginData('jasoti.error', errorMessage);

  if (def.id) {
    placeholder.setPluginData(PLUGIN_DATA_NODE_ID, def.id);
  }

  return placeholder;
}
```

**Step 5: Build and verify**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/core/generator.ts
git commit -m "feat(generator): resolve iconRef and create placeholder on failure"
```

---

## Task 7: Update Main to Pass Registries

**Files:**
- Modify: `src/main.ts`

**Step 1: Update generate handler**

Find the generate message handler and update to pass registries:

```typescript
if (msg.type === 'generate' && msg.payload) {
  const { jsonFiles, selectedIds } = msg.payload;

  const parseResult = jsonFiles && jsonFiles.length > 0
    ? parseSchemas(jsonFiles)
    : { valid: false, errors: [{ path: '', message: 'No JSON provided' }], warnings: [], schema: undefined, registries: [] };

  if (!parseResult.valid || !parseResult.schema) {
    figma.ui.postMessage({
      type: 'generate-result',
      payload: { success: false, error: parseResult.errors[0]?.message }
    });
    return;
  }

  // Pass registries to generator
  const result = await generateFromSchema(
    parseResult.schema,
    selectedIds || [],
    parseResult.registries  // Add this
  );

  // ... rest of handler
}
```

**Step 2: Update validate-tokens handler for icon validation**

```typescript
if (msg.type === 'validate-tokens' && msg.payload) {
  // ... existing token validation ...

  // Add icon validation
  const iconRefs = extractIconRefs(parseResult.schema);
  const iconResolver = new IconRegistryResolver(parseResult.registries);
  const iconIssues: { iconRef: string; error: string }[] = [];

  for (const ref of iconRefs) {
    const resolved = iconResolver.resolve(ref.iconRef);
    if (resolved.error) {
      iconIssues.push({ iconRef: ref.iconRef, error: resolved.error });
    }
  }

  figma.ui.postMessage({
    type: 'token-validation-result',
    payload: {
      ...result,
      iconIssues,
      registriesLoaded: parseResult.registries.map(r => r.library),
    }
  });
}
```

**Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): pass registries to generator and validate icons"
```

---

## Task 8: Add extractIconRefs to Parser

**Files:**
- Modify: `src/core/parser.ts`

**Step 1: Add extraction function**

```typescript
export interface IconReference {
  iconRef: string;
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
        refs.push({ iconRef: child.iconRef, path: childPath });
      }

      // Recurse into any node with children (not just frames)
      if ('children' in child && Array.isArray((child as any).children)) {
        walkChildren((child as any).children, childPath);
      }
    }
  }

  schema.components?.forEach((comp, i) => {
    walkChildren(comp.children, `components[${i}]`);
  });

  schema.componentSets?.forEach((set, i) => {
    walkChildren(set.base.children, `componentSets[${i}].base`);
  });

  return refs;
}
```

**Step 2: Commit**

```bash
git add src/core/parser.ts
git commit -m "feat(parser): add extractIconRefs for pre-flight validation"
```

---

## Task 9: Add Extraction UI

**Files:**
- Modify: `src/ui.html`
- Modify: `src/ui.ts`
- Modify: `src/main.ts`

**Step 1: Add extraction button to UI**

In `src/ui.html`, add a section:

```html
<div class="section">
  <h3>Icon Registry</h3>
  <button id="extract-registry-btn" class="secondary-btn">
    Extract Registry from Library
  </button>
  <div id="extraction-result" style="display: none;">
    <textarea id="registry-output" rows="10" readonly></textarea>
    <button id="copy-registry-btn">Copy to Clipboard</button>
  </div>
</div>
```

**Step 2: Add extraction handler in ui.ts**

```typescript
document.getElementById('extract-registry-btn')?.addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'list-libraries' } }, '*');
});

// Handle library list response
if (msg.type === 'library-list') {
  // Show library picker dialog
  const libraries = msg.payload.libraries;
  // ... show selection UI
}

// Handle extraction result
if (msg.type === 'extraction-result') {
  const output = document.getElementById('registry-output') as HTMLTextAreaElement;
  const container = document.getElementById('extraction-result')!;

  output.value = JSON.stringify(msg.payload.registry, null, 2);
  container.style.display = 'block';
}

document.getElementById('copy-registry-btn')?.addEventListener('click', () => {
  const output = document.getElementById('registry-output') as HTMLTextAreaElement;
  navigator.clipboard.writeText(output.value);
});
```

**Step 3: Add extraction handler in main.ts**

```typescript
if (msg.type === 'extract-registry' && msg.payload?.libraryName) {
  const registry = await extractIconRegistry(msg.payload.libraryName);
  figma.ui.postMessage({
    type: 'extraction-result',
    payload: { registry }
  });
}

async function extractIconRegistry(libraryName: string): Promise<IconRegistry> {
  const icons: Record<string, string> = {};

  // Find all instances in the document from this library
  const allNodes = figma.root.findAll(n => n.type === 'INSTANCE') as InstanceNode[];

  for (const instance of allNodes) {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) continue;

    try {
      // Check if from target library (simplified check)
      const key = mainComponent.key;
      const name = mainComponent.name.toLowerCase().replace(/\s+/g, '-');

      if (!icons[name]) {
        icons[name] = key;
      }
    } catch (e) {
      // Skip if can't get key
    }
  }

  return {
    library: libraryName.toLowerCase().replace(/\s+/g, '-'),
    figmaLibraryName: libraryName,
    extractedAt: new Date().toISOString(),
    icons,
  };
}
```

**Note:** This extraction finds icons already used in the file. For full library extraction, users would need to place all icons from the library into the file first, or use Figma REST API.

**Step 4: Commit**

```bash
git add src/ui.html src/ui.ts src/main.ts
git commit -m "feat(ui): add icon registry extraction UI"
```

---

## Task 10: Update UI for Icon Validation Display

**Files:**
- Modify: `src/ui.ts`

**Step 1: Update validation result display**

In the `token-validation-result` handler:

```typescript
if (msg.type === 'token-validation-result') {
  const { found, missing, iconIssues, registriesLoaded } = msg.payload;

  let html = '';

  // Show loaded registries
  if (registriesLoaded && registriesLoaded.length > 0) {
    html += `<p>📚 Registries loaded: ${registriesLoaded.join(', ')}</p>`;
  }

  // Token issues (existing)
  if (missing.length > 0) {
    html += '<h4>Missing Tokens:</h4><ul>';
    // ... existing token display
    html += '</ul>';
  }

  // Icon issues (new)
  if (iconIssues && iconIssues.length > 0) {
    html += '<h4>Icon Issues:</h4><ul class="issues-list">';
    for (const issue of iconIssues) {
      html += `<li><code>${issue.iconRef}</code>: ${issue.error}</li>`;
    }
    html += '</ul>';
  }

  // Show dialog
  // ...
}
```

**Step 2: Commit**

```bash
git add src/ui.ts
git commit -m "feat(ui): display icon validation issues in pre-flight dialog"
```

---

## Task 11: Update Documentation

**Files:**
- Modify: `docs/SCHEMA.md`

**Step 1: Add Icon Libraries section**

Add new section after Child Nodes:

```markdown
## Icon Libraries

JASOTI supports referencing icons from libraries like Lucide and Material using human-readable names.

### Setup

1. **Enable the icon library** in Figma (Assets panel → Libraries)
2. **Extract the registry:**
   - Open JASOTI → "Extract Registry from Library"
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
```

**Step 2: Update Instance Node section**

Update the Required section:

```markdown
**Required:**
- `nodeType`: `"instance"`
- `name`: Figma layer name
- One of:
  - `ref`: Local component ID (from same schema)
  - `iconRef`: Icon library reference (e.g., `"lucide:search"`)
  - `componentKey`: Direct library component key
```

**Step 3: Commit**

```bash
git add docs/SCHEMA.md
git commit -m "docs: add icon libraries documentation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Icon registry types | `src/types/iconRegistry.ts` |
| 2 | Add iconRef to schema | `src/types/schema.ts` |
| 3 | Parser validation + tests | `src/core/parser.ts`, tests |
| 4 | Registry resolver + tests | `src/core/iconRegistry.ts`, tests |
| 5 | Multi-file registry loading | `src/core/parser.ts` |
| 6 | Generator integration + placeholder | `src/core/generator.ts` |
| 7 | Main handler updates | `src/main.ts` |
| 8 | extractIconRefs function | `src/core/parser.ts` |
| 9 | Extraction UI | `src/ui.html`, `src/ui.ts`, `src/main.ts` |
| 10 | Validation UI updates | `src/ui.ts` |
| 11 | Documentation | `docs/SCHEMA.md` |

---

## Future: CDN Registries

When ready to host registries on CDN:

1. Add version field to schema: `"iconLibraries": [{ "name": "lucide", "version": "0.300.0" }]`
2. Add fetch logic: `fetch(\`https://cdn.jasoti.dev/registries/\${name}/\${version}.json\`)`
3. Cache fetched registries in `figma.clientStorage`
4. Keep extraction UI for custom/private libraries
