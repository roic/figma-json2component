# Style Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add instance swap overrides, boolean overrides, background blur, gradients, and stroke options to JASOTI.

**Architecture:** Extend existing schema types and generator functions. Each feature is independent and can be implemented in any order.

**Tech Stack:** TypeScript, Figma Plugin API

---

## Task 1: Instance Swap Overrides

Allow swapping nested instance components within an instance.

**Files:**
- Modify: `src/types/schema.ts:88`
- Modify: `src/core/generator/nodes.ts:511-538`
- Test: `src/core/parser.test.ts`

**Step 1: Update override type in schema.ts**

Find the `InstanceNode` interface and update the `overrides` type:

```typescript
export interface InstanceNode {
  nodeType: 'instance';
  id?: string;
  name: string;
  ref?: string;
  componentKey?: string;
  iconRef?: string;
  variantProps?: Record<string, string>;
  overrides?: Record<string, {
    text?: string;
    // Instance swap: reference by iconRef, componentKey, or ref
    swap?: string;           // iconRef format: "lucide:check"
    swapComponentKey?: string;  // Direct component key
    swapRef?: string;        // Local component reference
  }>;
  layout?: Pick<LayoutProps, 'width' | 'height'>;
}
```

**Step 2: Update createInstanceNode in nodes.ts to handle swap overrides**

After the text override handling (around line 537), add:

```typescript
// Apply instance swap overrides
if (override.swap || override.swapComponentKey || override.swapRef) {
  // Find nested instance by pluginData or name
  let targetInstance = instance.findOne(n =>
    n.type === 'INSTANCE' && n.getPluginData(PLUGIN_DATA_NODE_ID) === nodeId
  ) as InstanceNode | null;

  if (!targetInstance) {
    targetInstance = instance.findOne(n =>
      n.type === 'INSTANCE' && n.name === nodeId
    ) as InstanceNode | null;
  }

  if (targetInstance) {
    let swapComponent: ComponentNode | null = null;

    // Resolve the swap target
    if (override.swap) {
      // iconRef format
      const resolved = context.iconResolver.resolve(override.swap);
      if (resolved.componentKey) {
        try {
          const imported = await figma.importComponentByKeyAsync(resolved.componentKey);
          swapComponent = imported.type === 'COMPONENT' ? imported : imported.children[0] as ComponentNode;
        } catch (err) {
          context.warnings.push(`Failed to import swap target '${override.swap}'`);
        }
      }
    } else if (override.swapComponentKey) {
      try {
        const imported = await figma.importComponentByKeyAsync(override.swapComponentKey);
        swapComponent = imported.type === 'COMPONENT' ? imported : imported.children[0] as ComponentNode;
      } catch (err) {
        context.warnings.push(`Failed to import swap target '${override.swapComponentKey}'`);
      }
    } else if (override.swapRef) {
      const target = context.componentMap.get(override.swapRef);
      if (target) {
        swapComponent = target.type === 'COMPONENT' ? target : target.children[0] as ComponentNode;
      }
    }

    if (swapComponent) {
      targetInstance.swapComponent(swapComponent);
    }
  }
}
```

**Step 3: Run tests**

```bash
npm test
```

**Step 4: Run build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/types/schema.ts src/core/generator/nodes.ts
git commit -m "feat(overrides): add instance swap support"
```

---

## Task 2: Boolean Overrides (Visibility)

Allow toggling visibility of nested elements.

**Files:**
- Modify: `src/types/schema.ts:88` (already updated in Task 1)
- Modify: `src/core/generator/nodes.ts:511-538`

**Step 1: Update override type to include visible**

Update the overrides type (if not already done):

```typescript
overrides?: Record<string, {
  text?: string;
  swap?: string;
  swapComponentKey?: string;
  swapRef?: string;
  visible?: boolean;  // NEW: Toggle visibility
}>;
```

**Step 2: Add visibility override handling in nodes.ts**

After the swap override handling, add:

```typescript
// Apply visibility overrides
if (override.visible !== undefined) {
  // Find by pluginData first, fallback to name
  let targetNode = instance.findOne(n =>
    n.getPluginData(PLUGIN_DATA_NODE_ID) === nodeId
  );

  if (!targetNode) {
    targetNode = instance.findOne(n => n.name === nodeId);
  }

  if (targetNode) {
    targetNode.visible = override.visible;
  } else {
    context.warnings.push(`Override target '${nodeId}' not found in instance`);
  }
}
```

**Step 3: Run tests and build**

```bash
npm test && npm run build
```

**Step 4: Commit**

```bash
git add src/types/schema.ts src/core/generator/nodes.ts
git commit -m "feat(overrides): add visibility toggle support"
```

---

## Task 3: Background Blur

Add glassmorphism/frosted glass effect support.

**Files:**
- Modify: `src/types/schema.ts:56-67` (FrameNode interface)
- Modify: `src/core/generator/styles.ts`
- Modify: `src/core/generator/nodes.ts` (apply blur after styles)

**Step 1: Add backgroundBlur to FrameNode in schema.ts**

```typescript
export interface FrameNode extends BaseNode {
  nodeType: 'frame';
  layout?: LayoutProps;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
  shadowToken?: string;
  backgroundBlur?: number;       // NEW: Blur radius in pixels
  backgroundBlurToken?: string;  // NEW: Token reference for blur
  imageUrl?: string;
  imageScaleMode?: ImageScaleMode;
  children?: ChildNode[];
}
```

**Step 2: Add applyBackgroundBlur function in styles.ts**

Add after applyStyles function:

```typescript
/**
 * Apply background blur effect to a node.
 *
 * Creates a frosted glass/glassmorphism effect by blurring
 * content behind the node.
 *
 * @param node - The node to apply blur to
 * @param blur - Blur radius in pixels (or undefined to skip)
 * @param blurToken - Token reference for blur value
 * @param context - Generation context for token resolution
 */
export async function applyBackgroundBlur(
  node: FrameNode | ComponentNode | RectangleNode,
  blur: number | undefined,
  blurToken: string | undefined,
  context: GenerationContext
): Promise<void> {
  let blurRadius: number | undefined = blur;

  // Resolve token if provided
  if (blurToken) {
    const result = resolveVariable(blurToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', blurToken, 'backgroundBlurToken');
      if (typeError) {
        context.warnings.push(typeError);
        return;
      }
      // Get the resolved value - for blur we need the actual number
      // Note: Figma doesn't support variable binding for effect radius yet,
      // so we resolve the value and use it directly
      const resolvedValue = result.value.resolveForConsumer(figma.variables.getLocalVariableCollections()[0]);
      if (typeof resolvedValue === 'number') {
        blurRadius = resolvedValue;
      }
    } else {
      context.warnings.push(formatResolutionError(blurToken, result, 'variable'));
      return;
    }
  }

  if (blurRadius !== undefined && blurRadius > 0) {
    const blurEffect: Effect = {
      type: 'BACKGROUND_BLUR',
      radius: blurRadius,
      visible: true,
    };

    // Preserve existing effects (like shadows) and add blur
    const existingEffects = 'effects' in node ? [...node.effects] : [];
    // Remove any existing background blur
    const filteredEffects = existingEffects.filter(e => e.type !== 'BACKGROUND_BLUR');
    node.effects = [...filteredEffects, blurEffect];
  }
}
```

**Step 3: Apply blur in createFrameNode**

In `nodes.ts`, after applying styles, add:

```typescript
// Apply background blur
if (def.backgroundBlur !== undefined || def.backgroundBlurToken) {
  await applyBackgroundBlur(frame, def.backgroundBlur, def.backgroundBlurToken, context);
}
```

**Step 4: Run tests and build**

```bash
npm test && npm run build
```

**Step 5: Commit**

```bash
git add src/types/schema.ts src/core/generator/styles.ts src/core/generator/nodes.ts
git commit -m "feat(styles): add background blur support for glassmorphism"
```

---

## Task 4: Gradients

Add linear and radial gradient fill support.

**Files:**
- Modify: `src/types/schema.ts` (add gradient types)
- Modify: `src/core/generator/styles.ts` (apply gradients)

**Step 1: Add gradient types to schema.ts**

Add before the StyleProps interface:

```typescript
// ============ Gradient Types ============

export interface GradientStop {
  position: number;  // 0-1
  color?: string;    // Hex color: "#FF0000"
  colorToken?: string;  // Or token reference
  opacity?: number;  // 0-1, defaults to 1
}

export interface LinearGradient {
  type: 'linear';
  angle?: number;  // Degrees, 0 = left-to-right, 90 = top-to-bottom
  stops: GradientStop[];
}

export interface RadialGradient {
  type: 'radial';
  centerX?: number;  // 0-1, defaults to 0.5
  centerY?: number;  // 0-1, defaults to 0.5
  stops: GradientStop[];
}

export type Gradient = LinearGradient | RadialGradient;
```

**Step 2: Add gradient to StyleProps**

```typescript
export interface StyleProps {
  fillToken?: string;
  fill?: Gradient;  // NEW: Gradient fill (alternative to fillToken)
  strokeToken?: string;
  strokeWidth?: number;
  strokeDash?: number[];
  radiusToken?: string;
  shadowToken?: string;
  opacity?: number;
  opacityToken?: string;
  fillOpacity?: number;
  fillOpacityToken?: string;
}
```

**Step 3: Add gradient application in styles.ts**

Add helper function:

```typescript
/**
 * Parse a hex color string to RGB values (0-1 range).
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: ((bigint >> 16) & 255) / 255,
    g: ((bigint >> 8) & 255) / 255,
    b: (bigint & 255) / 255,
  };
}

/**
 * Apply a gradient fill to a node.
 */
export async function applyGradientFill(
  node: FrameNode | ComponentNode | RectangleNode | EllipseNode,
  gradient: Gradient,
  context: GenerationContext
): Promise<void> {
  // Build gradient stops
  const gradientStops: ColorStop[] = [];

  for (const stop of gradient.stops) {
    let color: RGBA;

    if (stop.colorToken) {
      // Resolve color from token
      const result = resolveVariable(stop.colorToken, context.variableMap);
      if (result.value) {
        // Get the resolved color value
        const collections = figma.variables.getLocalVariableCollections();
        if (collections.length > 0) {
          const modeId = collections[0].modes[0].modeId;
          const resolved = result.value.valuesByMode[modeId];
          if (typeof resolved === 'object' && 'r' in resolved) {
            color = { ...resolved as RGB, a: stop.opacity ?? 1 };
          } else {
            context.warnings.push(`Token '${stop.colorToken}' is not a color`);
            continue;
          }
        } else {
          continue;
        }
      } else {
        context.warnings.push(formatResolutionError(stop.colorToken, result, 'variable'));
        continue;
      }
    } else if (stop.color) {
      const rgb = parseHexColor(stop.color);
      color = { ...rgb, a: stop.opacity ?? 1 };
    } else {
      context.warnings.push('Gradient stop requires either color or colorToken');
      continue;
    }

    gradientStops.push({
      position: stop.position,
      color,
    });
  }

  if (gradientStops.length < 2) {
    context.warnings.push('Gradient requires at least 2 stops');
    return;
  }

  // Build gradient transform based on type and angle
  let gradientTransform: Transform;

  if (gradient.type === 'linear') {
    const angle = ((gradient.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Transform matrix for gradient direction
    gradientTransform = [
      [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
      [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
    ];
  } else {
    // Radial gradient centered at specified point
    const cx = gradient.centerX ?? 0.5;
    const cy = gradient.centerY ?? 0.5;
    gradientTransform = [
      [1, 0, cx - 0.5],
      [0, 1, cy - 0.5],
    ];
  }

  const paint: GradientPaint = {
    type: gradient.type === 'linear' ? 'GRADIENT_LINEAR' : 'GRADIENT_RADIAL',
    gradientStops,
    gradientTransform,
  };

  node.fills = [paint];
}
```

**Step 4: Update applyStyles to handle gradients**

In the `applyStyles` function, before the fillToken handling, add:

```typescript
// Gradient fill (takes precedence over fillToken)
if (styles.fill && 'type' in styles.fill) {
  await applyGradientFill(node, styles.fill, context);
  return; // Skip solid fill handling if gradient is specified
}
```

Wait, we need to be more careful here. Let me revise - we should handle gradient in applyStyles properly:

```typescript
// At the start of applyStyles, check for gradient
if (styles.fill) {
  await applyGradientFill(node, styles.fill, context);
} else if (styles.fillToken) {
  // ... existing fillToken logic
}
```

**Step 5: Run tests and build**

```bash
npm test && npm run build
```

**Step 6: Commit**

```bash
git add src/types/schema.ts src/core/generator/styles.ts
git commit -m "feat(styles): add gradient fill support (linear and radial)"
```

---

## Task 5: Stroke Options

Add individual side strokes and stroke alignment.

**Files:**
- Modify: `src/types/schema.ts:34-45` (StyleProps)
- Modify: `src/core/generator/styles.ts`

**Step 1: Add stroke options to StyleProps**

```typescript
export type StrokeAlign = 'inside' | 'center' | 'outside';
export type StrokeSide = 'top' | 'right' | 'bottom' | 'left';

export interface StyleProps {
  fillToken?: string;
  fill?: Gradient;
  strokeToken?: string;
  strokeWidth?: number;
  strokeDash?: number[];
  strokeAlign?: StrokeAlign;       // NEW: Stroke alignment
  strokeSides?: StrokeSide[];      // NEW: Which sides to stroke
  radiusToken?: string;
  shadowToken?: string;
  opacity?: number;
  opacityToken?: string;
  fillOpacity?: number;
  fillOpacityToken?: string;
}
```

**Step 2: Update applyStyles to handle stroke options**

After the existing stroke handling in `styles.ts`:

```typescript
// Stroke alignment
if (styles.strokeAlign && 'strokeAlign' in node) {
  const alignMap: Record<StrokeAlign, 'INSIDE' | 'CENTER' | 'OUTSIDE'> = {
    'inside': 'INSIDE',
    'center': 'CENTER',
    'outside': 'OUTSIDE',
  };
  node.strokeAlign = alignMap[styles.strokeAlign];
}

// Individual stroke sides
if (styles.strokeSides && 'strokeTopWeight' in node) {
  const weight = styles.strokeWidth ?? 1;
  const sides = new Set(styles.strokeSides);

  // Figma uses individual weights for each side
  node.strokeTopWeight = sides.has('top') ? weight : 0;
  node.strokeRightWeight = sides.has('right') ? weight : 0;
  node.strokeBottomWeight = sides.has('bottom') ? weight : 0;
  node.strokeLeftWeight = sides.has('left') ? weight : 0;
}
```

**Step 3: Run tests and build**

```bash
npm test && npm run build
```

**Step 4: Commit**

```bash
git add src/types/schema.ts src/core/generator/styles.ts
git commit -m "feat(styles): add stroke alignment and individual side strokes"
```

---

## Task 6: Update Parser Validation

Add validation for new schema fields.

**Files:**
- Modify: `src/core/parser.ts`
- Test: `src/core/parser.test.ts`

**Step 1: Add validation for gradient stops**

In the validation section for style props:

```typescript
// Validate gradient
if (styles.fill) {
  if (!styles.fill.type || !['linear', 'radial'].includes(styles.fill.type)) {
    errors.push(createError('INVALID_VALUE', path, "Gradient 'type' must be 'linear' or 'radial'"));
  }
  if (!Array.isArray(styles.fill.stops) || styles.fill.stops.length < 2) {
    errors.push(createError('INVALID_VALUE', path, 'Gradient requires at least 2 stops'));
  }
  for (let i = 0; i < (styles.fill.stops?.length ?? 0); i++) {
    const stop = styles.fill.stops[i];
    if (typeof stop.position !== 'number' || stop.position < 0 || stop.position > 1) {
      errors.push(createError('INVALID_VALUE', `${path}.fill.stops[${i}]`, 'Stop position must be 0-1'));
    }
    if (!stop.color && !stop.colorToken) {
      errors.push(createError('MISSING_REQUIRED', `${path}.fill.stops[${i}]`, 'Stop requires color or colorToken'));
    }
  }
}

// Validate stroke options
if (styles.strokeAlign && !['inside', 'center', 'outside'].includes(styles.strokeAlign)) {
  errors.push(createError('INVALID_VALUE', path, "strokeAlign must be 'inside', 'center', or 'outside'"));
}
if (styles.strokeSides) {
  const validSides = ['top', 'right', 'bottom', 'left'];
  for (const side of styles.strokeSides) {
    if (!validSides.includes(side)) {
      errors.push(createError('INVALID_VALUE', path, `Invalid strokeSide: ${side}`));
    }
  }
}
```

**Step 2: Add validation for overrides**

In the instance validation section:

```typescript
// Validate override swap fields
if (n.overrides) {
  for (const [nodeId, override] of Object.entries(n.overrides)) {
    const swapCount = [override.swap, override.swapComponentKey, override.swapRef].filter(Boolean).length;
    if (swapCount > 1) {
      errors.push(createError('MUTUALLY_EXCLUSIVE', `${path}.overrides.${nodeId}`,
        'Only one of swap, swapComponentKey, or swapRef can be specified'));
    }
  }
}
```

**Step 3: Add tests for new validations**

```typescript
describe('gradient validation', () => {
  it('accepts valid linear gradient', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          angle: 90,
          stops: [
            { position: 0, color: '#FF0000' },
            { position: 1, color: '#0000FF' }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('rejects gradient with less than 2 stops', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          stops: [{ position: 0, color: '#FF0000' }]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
  });
});
```

**Step 4: Run tests**

```bash
npm test
```

**Step 5: Commit**

```bash
git add src/core/parser.ts src/core/parser.test.ts
git commit -m "feat(parser): add validation for gradients, stroke options, and overrides"
```

---

## Task 7: Update Documentation

Update SCHEMA.md with new features.

**Files:**
- Modify: `docs/SCHEMA.md`

**Step 1: Add Instance Swap Overrides section**

Add to the Instance Node section:

```markdown
### Instance Overrides

Override nested elements within an instance:

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

**Override types:**
- `text` - Change text content
- `swap` - Swap instance with iconRef (e.g., `"lucide:check"`)
- `swapComponentKey` - Swap with component key
- `swapRef` - Swap with local component reference
- `visible` - Toggle visibility (boolean)
```

**Step 2: Add Background Blur section**

Add to Frame Node section:

```markdown
### Background Blur (Glassmorphism)

Add frosted glass effect:

```json
{
  "nodeType": "frame",
  "backgroundBlur": 20,
  "fillToken": "color.surface.glass"
}
```

Use with semi-transparent fills for best effect.
```

**Step 3: Add Gradients section**

Add new section:

```markdown
### Gradient Fills

**Linear gradient:**
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

**Radial gradient:**
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

Gradient stops can use `color` (hex) or `colorToken` (variable reference).
```

**Step 4: Add Stroke Options section**

Add to Styling section:

```markdown
### Stroke Options

**Stroke alignment:**
```json
{
  "strokeToken": "color.border",
  "strokeWidth": 2,
  "strokeAlign": "inside"
}
```

Values: `inside`, `center`, `outside`

**Individual sides:**
```json
{
  "strokeToken": "color.border",
  "strokeWidth": 1,
  "strokeSides": ["bottom"]
}
```

Values: `top`, `right`, `bottom`, `left`
```

**Step 5: Commit**

```bash
git add docs/SCHEMA.md
git commit -m "docs: add gradient, blur, stroke options, and override documentation"
```

---

## Summary

| Task | Feature | Effort |
|------|---------|--------|
| 1 | Instance swap overrides | ~50 lines |
| 2 | Boolean/visibility overrides | ~15 lines |
| 3 | Background blur | ~40 lines |
| 4 | Gradients | ~100 lines |
| 5 | Stroke options | ~25 lines |
| 6 | Parser validation | ~50 lines |
| 7 | Documentation | Text only |

**Total:** ~280 lines of code + docs

---

## Verification Checklist

After completing all tasks:

- [ ] `npm test` - All tests pass
- [ ] `npm run build` - Build succeeds
- [ ] Test: Instance with swap override
- [ ] Test: Instance with visibility override
- [ ] Test: Frame with background blur
- [ ] Test: Component with gradient fill
- [ ] Test: Frame with bottom-only stroke
