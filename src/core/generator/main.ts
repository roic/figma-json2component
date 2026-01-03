// src/core/generator/main.ts
import type {
  Schema,
  ComponentDefinition,
  ComponentSetDefinition,
  ChildNode,
  LayoutProps,
  StyleProps,
  SizeValue,
  Organization,
} from '../../types/schema';
import { resolveDependencies } from '../resolver';
import { resolveVariable, resolveTextStyle, formatResolutionError, validateVariableType } from '../tokenResolver';
import { IconRegistry } from '../../types/iconRegistry';
import { GenerationContext, GenerateResult, PLUGIN_DATA_KEY, PLUGIN_DATA_NODE_ID } from './types';
import { buildContext, buildVariableLookupAliases, generateStyleKeys } from './context';

// Helper to find instance dependencies in children
function findInstanceDependencies(children: ChildNode[]): string[] {
  const deps: string[] = [];
  for (const child of children) {
    // Only track `ref` - not `componentKey` or `iconRef`.
    // `componentKey` references library components (imported via figma.importComponentByKeyAsync)
    // `iconRef` references icons from external libraries (also imported by key)
    // Neither creates local dependencies that affect generation order.
    // Only `ref` points to locally-defined components that must be created first.
    if (child.nodeType === 'instance' && child.ref) {
      deps.push(child.ref);
    } else if (child.nodeType === 'frame' && child.children) {
      deps.push(...findInstanceDependencies(child.children));
    }
  }
  return deps;
}

export async function generateFromSchema(
  schema: Schema,
  selectedIds: string[],
  registries: IconRegistry[] = []
): Promise<GenerateResult> {
  const warnings: string[] = [];

  // Resolve dependencies
  const depResult = resolveDependencies(schema);
  if (!depResult.success) {
    return { success: false, warnings: [], error: depResult.error, createdCount: 0 };
  }

  // Build context
  const context = await buildContext(warnings, registries);

  // Expand selected IDs to include all dependencies
  const selectedSet = new Set(selectedIds);
  const expandedSet = new Set<string>();

  // Helper to recursively add dependencies
  const addWithDependencies = (id: string) => {
    if (expandedSet.has(id)) return;
    expandedSet.add(id);

    // Find this component's dependencies and add them first
    const comp = schema.components?.find(c => c.id === id);
    const compSet = schema.componentSets?.find(s => s.id === id);

    const children = comp?.children || compSet?.base.children || [];
    const deps = findInstanceDependencies(children);
    deps.forEach(dep => addWithDependencies(dep));
  };

  // Add all selected components and their dependencies
  selectedIds.forEach(id => addWithDependencies(id));

  // Log auto-included dependencies
  const autoIncluded = [...expandedSet].filter(id => !selectedSet.has(id));
  if (autoIncluded.length > 0) {
    console.log(`Auto-including dependencies: ${autoIncluded.join(', ')}`);
  }

  // Filter to expanded IDs and order by dependencies
  const orderedIds = depResult.order.filter(id => expandedSet.has(id));

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

  // Position components using organization config
  await positionComponents(context.componentMap, orderedIds, schema);

  return { success: true, warnings: context.warnings, createdCount };
}

/**
 * Build token lookup maps for validation.
 * Exported for pre-flight token validation.
 */
export async function buildTokenMaps(): Promise<{
  variableMap: Map<string, Variable>;
  textStyleMap: Map<string, TextStyle>;
  effectStyleMap: Map<string, EffectStyle>;
}> {
  // Build collection-aware variable index
  const variableMap = new Map<string, Variable>();
  const collections = figma.variables.getLocalVariableCollections();

  for (const collection of collections) {
    for (const variableId of collection.variableIds) {
      const variable = figma.variables.getVariableById(variableId);
      if (!variable) continue;

      const keys = buildVariableLookupAliases(variable.name, collection.name);
      for (const key of keys) {
        if (!variableMap.has(key) || variableMap.get(key)!.id === variable.id) {
          variableMap.set(key, variable);
        }
      }
    }
  }

  // Build text style index
  const textStyleMap = new Map<string, TextStyle>();
  const textStyles = await figma.getLocalTextStylesAsync();

  for (const style of textStyles) {
    const keys = generateStyleKeys(style.name);
    for (const key of keys) {
      if (!textStyleMap.has(key) || textStyleMap.get(key)!.id === style.id) {
        textStyleMap.set(key, style);
      }
    }
  }

  // Build effect style index
  const effectStyleMap = new Map<string, EffectStyle>();
  const effectStyles = figma.getLocalEffectStyles();

  for (const style of effectStyles) {
    const keys = generateStyleKeys(style.name);
    for (const key of keys) {
      if (!effectStyleMap.has(key) || effectStyleMap.get(key)!.id === style.id) {
        effectStyleMap.set(key, style);
      }
    }
  }

  return { variableMap, textStyleMap, effectStyleMap };
}

/**
 * Parse a Figma variant name like "type=primary, state=default" into props object.
 * Returns normalized props sorted alphabetically by key.
 */
function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  const parts = name.split(',').map(s => s.trim());

  for (const part of parts) {
    const [key, value] = part.split('=').map(s => s.trim());
    if (key && value !== undefined) {
      props[key] = value;
    }
  }

  return props;
}

/**
 * Build a normalized variant key for comparison.
 * Sorts props alphabetically to ensure consistent matching.
 */
function buildVariantKey(props: Record<string, string>): string {
  return Object.entries(props)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

/**
 * Find a variant in a ComponentSet by its props.
 */
function findVariantByProps(
  componentSet: ComponentSetNode,
  props: Record<string, string>
): ComponentNode | null {
  const targetKey = buildVariantKey(props);

  for (const child of componentSet.children) {
    if (child.type === 'COMPONENT') {
      const childProps = parseVariantName(child.name);
      const childKey = buildVariantKey(childProps);
      if (childKey === targetKey) {
        return child;
      }
    }
  }

  return null;
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
  await applyLayout(comp, def.layout, context);

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
  const existingSet = context.componentMap.get(def.id) as ComponentSetNode | undefined;

  // Track which variant keys we process (for stale variant removal)
  const processedVariantKeys = new Set<string>();

  if (existingSet && existingSet.type === 'COMPONENT_SET') {
    // UPDATE IN PLACE - preserves Figma node identity and instance connections
    console.log(`Updating component set "${def.name}" in place`);

    existingSet.name = def.name;
    if (def.description) existingSet.description = def.description;

    for (const variant of def.variants) {
      const variantName = def.variantProps
        .map(prop => `${prop}=${variant.props[prop]}`)
        .join(', ');

      const variantKey = buildVariantKey(variant.props);
      processedVariantKeys.add(variantKey);

      // Find existing variant by props
      const existingVariant = findVariantByProps(existingSet, variant.props);

      if (existingVariant) {
        // Update existing variant in place
        existingVariant.name = variantName;
        existingVariant.children.forEach(c => c.remove());

        // Apply base layout first
        await applyLayout(existingVariant, def.base.layout, context);

        // Apply variant layout overrides (if any)
        if (variant.layout) {
          await applyLayout(existingVariant, variant.layout as LayoutProps, context);
        }

        // Apply merged styles
        const mergedStyles: StyleProps = { ...def.base, ...variant };
        await applyStyles(existingVariant, mergedStyles, context);

        // Recreate children
        if (def.base.children) {
          for (const childDef of def.base.children) {
            const child = await createChildNode(childDef, context);
            if (child) existingVariant.appendChild(child);
          }
        }
      } else {
        // Create new variant and add to existing set
        const newVariant = figma.createComponent();
        newVariant.name = variantName;

        await applyLayout(newVariant, def.base.layout, context);
        if (variant.layout) {
          await applyLayout(newVariant, variant.layout as LayoutProps, context);
        }

        const mergedStyles: StyleProps = { ...def.base, ...variant };
        await applyStyles(newVariant, mergedStyles, context);

        if (def.base.children) {
          for (const childDef of def.base.children) {
            const child = await createChildNode(childDef, context);
            if (child) newVariant.appendChild(child);
          }
        }

        // Add to existing component set
        existingSet.appendChild(newVariant);
        console.log(`  Added new variant: ${variantName}`);
      }
    }

    // Remove stale variants (exist in Figma but not in schema)
    const variantsToRemove: ComponentNode[] = [];
    for (const child of existingSet.children) {
      if (child.type === 'COMPONENT') {
        const childProps = parseVariantName(child.name);
        const childKey = buildVariantKey(childProps);
        if (!processedVariantKeys.has(childKey)) {
          variantsToRemove.push(child);
        }
      }
    }

    for (const staleVariant of variantsToRemove) {
      console.log(`  Removing stale variant: ${staleVariant.name}`);
      context.warnings.push(`Removed variant '${staleVariant.name}' from '${def.name}' - instances may be detached`);
      staleVariant.remove();
    }

    console.log(`Updated component set "${def.name}" with ${existingSet.children.length} variants`);
    return existingSet;
  }

  // CREATE NEW - no existing set found
  console.log(`Creating new component set "${def.name}"`);

  const variantComponents: ComponentNode[] = [];

  for (const variant of def.variants) {
    const variantName = def.variantProps
      .map(prop => `${prop}=${variant.props[prop]}`)
      .join(', ');

    const comp = figma.createComponent();
    comp.name = variantName;

    await applyLayout(comp, def.base.layout, context);
    if (variant.layout) {
      await applyLayout(comp, variant.layout as LayoutProps, context);
    }

    const mergedStyles: StyleProps = { ...def.base, ...variant };
    await applyStyles(comp, mergedStyles, context);

    if (def.base.children) {
      for (const childDef of def.base.children) {
        const child = await createChildNode(childDef, context);
        if (child) comp.appendChild(child);
      }
    }

    variantComponents.push(comp);
  }

  const componentSet = figma.combineAsVariants(variantComponents, figma.currentPage);
  componentSet.name = def.name;
  if (def.description) componentSet.description = def.description;
  componentSet.setPluginData(PLUGIN_DATA_KEY, def.id);
  context.componentMap.set(def.id, componentSet);

  console.log(`Created component set "${def.name}" with ${componentSet.children.length} variants`);

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
    case 'ellipse':
      return createEllipseNode(def, context);
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

  // Store schema node ID for tracking
  frame.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  if (def.layout) await applyLayout(frame, def.layout, context);
  await applyStyles(frame, def, context);

  // Apply image fill if specified
  if (def.imageUrl) {
    await applyImageFill(frame, def.imageUrl, def.imageScaleMode, context);
  }

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

  // Store schema node ID for reliable text override matching
  text.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  // Load font before setting text (with fallback chain)
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
      console.warn(`Failed to load font ${font.family}:`, e);
      // Try next font
    }
  }

  if (!fontLoaded) {
    context.warnings.push(`Could not load any font. Text nodes may not render correctly.`);
  }

  text.characters = def.text || '';

  // Apply text style
  if (def.textStyleToken) {
    const result = resolveTextStyle(def.textStyleToken, context.textStyleMap);
    if (result.value) {
      text.textStyleId = result.value.id;
    } else {
      context.warnings.push(formatResolutionError(def.textStyleToken, result, 'textStyle'));
    }
  }

  // Apply fill color
  if (def.fillToken) {
    const result = resolveVariable(def.fillToken, context.variableMap);
    if (result.value) {
      // Validate variable type
      const typeError = validateVariableType(result.value, 'COLOR', def.fillToken, 'fillToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        let paint = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
          'color',
          result.value
        ) as SolidPaint;

        // Apply paint-level opacity
        if (def.fillOpacityToken) {
          const opacityResult = resolveVariable(def.fillOpacityToken, context.variableMap);
          if (opacityResult.value) {
            const opacityTypeError = validateVariableType(opacityResult.value, 'FLOAT', def.fillOpacityToken, 'fillOpacityToken');
            if (opacityTypeError) {
              context.warnings.push(opacityTypeError);
            } else {
              paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
            }
          } else {
            context.warnings.push(formatResolutionError(def.fillOpacityToken, opacityResult, 'variable'));
          }
        } else if (def.fillOpacity !== undefined) {
          paint.opacity = def.fillOpacity;
        }

        text.fills = [paint];
      }
    } else {
      context.warnings.push(formatResolutionError(def.fillToken, result, 'variable'));
    }
  } else if (def.fillOpacityToken || def.fillOpacity !== undefined) {
    // fillOpacity without fillToken - apply to existing fills
    const fills = Array.isArray(text.fills) ? [...text.fills as Paint[]] : [];
    if (fills.length > 0 && fills[0].type === 'SOLID') {
      let paint = fills[0] as SolidPaint;

      if (def.fillOpacityToken) {
        const opacityResult = resolveVariable(def.fillOpacityToken, context.variableMap);
        if (opacityResult.value) {
          paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
        } else {
          context.warnings.push(formatResolutionError(def.fillOpacityToken, opacityResult, 'variable'));
        }
      } else if (def.fillOpacity !== undefined) {
        paint.opacity = def.fillOpacity;
      }

      text.fills = [paint, ...fills.slice(1)];
    }
  }

  // Apply layer-level opacity
  if (def.opacityToken) {
    const result = resolveVariable(def.opacityToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', def.opacityToken, 'opacityToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        text.setBoundVariable('opacity', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(def.opacityToken, result, 'variable'));
    }
  } else if (def.opacity !== undefined) {
    text.opacity = def.opacity;
  }

  return text;
}

async function createRectangleNode(
  def: Extract<ChildNode, { nodeType: 'rectangle' }>,
  context: GenerationContext
): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  rect.name = def.name;

  // Store schema node ID for tracking
  rect.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  // Apply sizing
  if (def.layout) {
    if (typeof def.layout.width === 'number') rect.resize(def.layout.width, rect.height);
    if (typeof def.layout.height === 'number') rect.resize(rect.width, def.layout.height);
  }

  await applyStyles(rect, def, context);

  // Apply image fill if specified
  if (def.imageUrl) {
    await applyImageFill(rect, def.imageUrl, def.imageScaleMode, context);
  }

  return rect;
}

async function createEllipseNode(
  def: Extract<ChildNode, { nodeType: 'ellipse' }>,
  context: GenerationContext
): Promise<EllipseNode> {
  const ellipse = figma.createEllipse();
  ellipse.name = def.name;

  // Store schema node ID for tracking
  ellipse.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  // Apply sizing
  if (def.layout) {
    if (typeof def.layout.width === 'number') ellipse.resize(def.layout.width, ellipse.height);
    if (typeof def.layout.height === 'number') ellipse.resize(ellipse.width, def.layout.height);
  }

  await applyStyles(ellipse, def, context);

  return ellipse;
}

/**
 * Create a visible placeholder frame for a missing icon/component.
 * Shows red dashed border to make it obvious something is missing.
 */
function createMissingIconPlaceholder(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  errorMessage: string
): FrameNode {
  const placeholder = figma.createFrame();
  placeholder.name = `⚠️ ${def.name} (missing)`;

  // Size: use requested size or default 24x24 (common icon size)
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

async function createInstanceNode(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  context: GenerationContext
): Promise<InstanceNode | FrameNode | null> {
  let mainComponent: ComponentNode | null = null;
  let componentKey: string | undefined = def.componentKey;
  let iconRefSource: string | undefined;

  // Case 0: Resolve iconRef to componentKey first
  if (def.iconRef) {
    iconRefSource = def.iconRef;
    const resolved = context.iconResolver.resolve(def.iconRef);

    if (resolved.error) {
      context.warnings.push(resolved.error);
      return createMissingIconPlaceholder(def, resolved.error);
    }

    componentKey = resolved.componentKey!;
  }

  // Case 1: Library component via componentKey (includes resolved iconRef)
  if (componentKey) {
    try {
      const imported = await figma.importComponentByKeyAsync(componentKey);
      if (imported.type === 'COMPONENT') {
        mainComponent = imported;
      } else if (imported.type === 'COMPONENT_SET') {
        // Check if the component set has variants
        if (imported.children.length === 0) {
          context.warnings.push(`Imported ComponentSet '${iconRefSource || componentKey}' has no variants`);
          return null;
        }
        // If it's a component set, find the right variant or use first
        if (def.variantProps) {
          const variantName = Object.entries(def.variantProps)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          const variant = imported.findChild(c => c.name === variantName) as ComponentNode;
          mainComponent = variant || (imported.children[0] as ComponentNode);
        } else {
          mainComponent = imported.children[0] as ComponentNode;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const source = iconRefSource || componentKey;
      const errorMsg = `Couldn't import '${source}'. Check that the library is enabled and the registry matches your library version.`;
      context.warnings.push(errorMsg);
      return createMissingIconPlaceholder(def, errorMsg);
    }
  }
  // Case 2: Local component via ref
  else if (def.ref) {
    const target = context.componentMap.get(def.ref);

    if (!target) {
      context.warnings.push(`Component '${def.ref}' not found for instance`);
      return null;
    }

    if (target.type === 'COMPONENT_SET') {
      if (target.children.length === 0) {
        context.warnings.push(`ComponentSet '${def.ref}' has no variants`);
        return null;
      }

      if (def.variantProps) {
        const variantName = Object.entries(def.variantProps)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const variant = target.findChild(c => c.name === variantName) as ComponentNode;
        mainComponent = variant || (target.children[0] as ComponentNode);
        if (!variant) {
          context.warnings.push(`Variant '${variantName}' not found in '${def.ref}', using first variant`);
        }
      } else {
        mainComponent = target.children[0] as ComponentNode;
      }
    } else {
      mainComponent = target;
    }
  }

  if (!mainComponent) {
    return null;
  }

  // Create instance
  const instance = mainComponent.createInstance();
  instance.name = def.name;

  // Store schema node ID if provided
  if (def.id) {
    instance.setPluginData(PLUGIN_DATA_NODE_ID, def.id);
  }

  // Apply sizing
  if (def.layout) {
    if (def.layout.width !== undefined) {
      if (def.layout.width === 'fill') {
        instance.layoutSizingHorizontal = 'FILL';
      } else if (def.layout.width === 'hug') {
        instance.layoutSizingHorizontal = 'HUG';
      } else if (typeof def.layout.width === 'number') {
        instance.resize(def.layout.width, instance.height);
      }
    }
    if (def.layout.height !== undefined) {
      if (def.layout.height === 'fill') {
        instance.layoutSizingVertical = 'FILL';
      } else if (def.layout.height === 'hug') {
        instance.layoutSizingVertical = 'HUG';
      } else if (typeof def.layout.height === 'number') {
        instance.resize(instance.width, def.layout.height);
      }
    }
  }

  // Apply text overrides
  if (def.overrides) {
    for (const [nodeId, override] of Object.entries(def.overrides)) {
      if (override.text !== undefined) {
        // Find by pluginData first (reliable), fallback to name
        let targetNode = instance.findOne(n =>
          n.type === 'TEXT' && n.getPluginData(PLUGIN_DATA_NODE_ID) === nodeId
        ) as TextNode | null;

        if (!targetNode) {
          targetNode = instance.findOne(n =>
            n.type === 'TEXT' && n.name === nodeId
          ) as TextNode | null;

          if (targetNode) {
            context.warnings.push(
              `Text override for '${nodeId}' matched by name. Regenerate '${def.ref || def.componentKey}' for reliable matching.`
            );
          }
        }

        if (targetNode) {
          await figma.loadFontAsync(targetNode.fontName as FontName);
          targetNode.characters = override.text;
        }
      }
    }
  }

  return instance;
}

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
      const typeError = validateVariableType(result.value, 'FLOAT', tokenValue, `${paddingField}Token`);
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable(paddingField, result.value);
        return;
      }
    } else {
      context.warnings.push(formatResolutionError(tokenValue, result, 'variable'));
    }
  }

  if (typeof rawValue === 'number') {
    node[paddingField] = rawValue;
  }
}

async function applyLayout(node: FrameNode | ComponentNode, layout: LayoutProps, context: GenerationContext): Promise<void> {
  // Enable auto-layout
  node.layoutMode = layout.direction === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

  // Padding - use token if available, otherwise raw value
  if (layout.paddingToken) {
    const result = resolveVariable(layout.paddingToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', layout.paddingToken, 'paddingToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('paddingTop', result.value);
        node.setBoundVariable('paddingRight', result.value);
        node.setBoundVariable('paddingBottom', result.value);
        node.setBoundVariable('paddingLeft', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(layout.paddingToken, result, 'variable'));
    }
  } else if (layout.padding !== undefined) {
    node.paddingTop = layout.padding;
    node.paddingRight = layout.padding;
    node.paddingBottom = layout.padding;
    node.paddingLeft = layout.padding;
  }

  // Individual padding values - token takes priority over raw value
  await applyPaddingWithToken(node, 'paddingTop', layout.paddingTopToken, layout.paddingTop, context);
  await applyPaddingWithToken(node, 'paddingRight', layout.paddingRightToken, layout.paddingRight, context);
  await applyPaddingWithToken(node, 'paddingBottom', layout.paddingBottomToken, layout.paddingBottom, context);
  await applyPaddingWithToken(node, 'paddingLeft', layout.paddingLeftToken, layout.paddingLeft, context);

  // Gap - token takes priority over raw value
  if (layout.gapToken) {
    const result = resolveVariable(layout.gapToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', layout.gapToken, 'gapToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('itemSpacing', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(layout.gapToken, result, 'variable'));
    }
  } else if (layout.gap !== undefined) {
    node.itemSpacing = layout.gap;
  }

  // Wrap
  if (layout.wrap !== undefined) {
    node.layoutWrap = layout.wrap ? 'WRAP' : 'NO_WRAP';
  }

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
    // FILL can only be set on children of auto-layout frames
    // Check if node has a parent with auto-layout enabled
    const parent = node.parent;
    const hasAutoLayoutParent = parent && 'layoutMode' in parent && parent.layoutMode !== 'NONE';

    if (hasAutoLayoutParent) {
      node[prop] = 'FILL';
    } else {
      // For top-level components, use HUG instead of FILL
      node[prop] = 'HUG';
    }
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

/**
 * Apply an image fill from a URL.
 */
async function applyImageFill(
  node: GeometryMixin & MinimalFillsMixin,
  imageUrl: string,
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE' | undefined,
  context: GenerationContext
): Promise<void> {
  try {
    const image = await figma.createImageAsync(imageUrl);
    const imagePaint: ImagePaint = {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: scaleMode || 'FILL',
    };
    node.fills = [imagePaint];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    context.warnings.push(`Failed to load image '${imageUrl}': ${message}`);
    console.warn(`⚠️ Failed to load image '${imageUrl}': ${message}`);
  }
}

async function applyStyles(
  node: FrameNode | ComponentNode | RectangleNode | EllipseNode,
  styles: StyleProps,
  context: GenerationContext
): Promise<void> {
  // Clear existing styles to ensure clean state (especially important for updates)
  // Only clear if the corresponding property is NOT specified to allow explicit control
  if (!styles.fillToken && !styles.fillOpacity && !styles.fillOpacityToken) {
    node.fills = [];
  }
  if (!styles.strokeToken) {
    node.strokes = [];
  }
  if (!styles.shadowToken && 'effects' in node) {
    node.effects = [];
  }

  // Fill
  if (styles.fillToken) {
    const result = resolveVariable(styles.fillToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'COLOR', styles.fillToken, 'fillToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        let paint = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
          'color',
          result.value
        ) as SolidPaint;

        // Apply paint-level opacity
        if (styles.fillOpacityToken) {
          const opacityResult = resolveVariable(styles.fillOpacityToken, context.variableMap);
          if (opacityResult.value) {
            const opacityTypeError = validateVariableType(opacityResult.value, 'FLOAT', styles.fillOpacityToken, 'fillOpacityToken');
            if (opacityTypeError) {
              context.warnings.push(opacityTypeError);
            } else {
              paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
            }
          } else {
            context.warnings.push(formatResolutionError(styles.fillOpacityToken, opacityResult, 'variable'));
          }
        } else if (styles.fillOpacity !== undefined) {
          paint.opacity = styles.fillOpacity;
        }

        node.fills = [paint];
      }
    } else {
      context.warnings.push(formatResolutionError(styles.fillToken, result, 'variable'));
    }
  } else if (styles.fillOpacityToken || styles.fillOpacity !== undefined) {
    // fillOpacity without fillToken - apply to existing fills
    const fills = Array.isArray(node.fills) ? [...node.fills as Paint[]] : [];
    if (fills.length > 0 && fills[0].type === 'SOLID') {
      let paint = fills[0] as SolidPaint;

      if (styles.fillOpacityToken) {
        const opacityResult = resolveVariable(styles.fillOpacityToken, context.variableMap);
        if (opacityResult.value) {
          const opacityTypeError = validateVariableType(opacityResult.value, 'FLOAT', styles.fillOpacityToken, 'fillOpacityToken');
          if (opacityTypeError) {
            context.warnings.push(opacityTypeError);
          } else {
            paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
          }
        } else {
          context.warnings.push(formatResolutionError(styles.fillOpacityToken, opacityResult, 'variable'));
        }
      } else if (styles.fillOpacity !== undefined) {
        paint.opacity = styles.fillOpacity;
      }

      node.fills = [paint, ...fills.slice(1)];
    }
  }

  // Stroke
  if (styles.strokeToken) {
    const result = resolveVariable(styles.strokeToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'COLOR', styles.strokeToken, 'strokeToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        const stroke = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
          'color',
          result.value
        );
        node.strokes = [stroke];
      }
    } else {
      context.warnings.push(formatResolutionError(styles.strokeToken, result, 'variable'));
    }
  }
  if (styles.strokeWidth !== undefined) {
    node.strokeWeight = styles.strokeWidth;
  }

  // Stroke dash pattern
  if (styles.strokeDash !== undefined && 'dashPattern' in node) {
    node.dashPattern = styles.strokeDash;
  }

  // Radius (only for frames/components/rectangles)
  if (styles.radiusToken && 'cornerRadius' in node) {
    const result = resolveVariable(styles.radiusToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', styles.radiusToken, 'radiusToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('topLeftRadius', result.value);
        node.setBoundVariable('topRightRadius', result.value);
        node.setBoundVariable('bottomLeftRadius', result.value);
        node.setBoundVariable('bottomRightRadius', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(styles.radiusToken, result, 'variable'));
    }
  }

  // Shadow - using composite effect variables
  if (styles.shadowToken && 'effects' in node) {
    const result = resolveVariable(styles.shadowToken, context.variableMap);
    if (result.value) {
      try {
        // Create a default drop shadow effect
        const effect: DropShadowEffect = {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 },
          radius: 8,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL'
        };

        // Bind the effect variable
        const boundEffect = figma.variables.setBoundVariableForEffect(effect, 'effects', result.value);
        node.effects = [boundEffect];
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        context.warnings.push(`Failed to bind shadow token '${styles.shadowToken}': ${message}`);
      }
    } else {
      context.warnings.push(formatResolutionError(styles.shadowToken, result, 'variable'));
    }
  }

  // Layer-level opacity
  if (styles.opacityToken) {
    const result = resolveVariable(styles.opacityToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', styles.opacityToken, 'opacityToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('opacity', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(styles.opacityToken, result, 'variable'));
    }
  } else if (styles.opacity !== undefined) {
    node.opacity = styles.opacity;
  }
}

async function positionComponents(
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  orderedIds: string[],
  schema: Schema
): Promise<void> {
  // Get organization config with defaults
  const org: Required<Organization> = {
    groupBy: schema.organization?.groupBy ?? 'category',
    layout: schema.organization?.layout ?? 'frames',
    gridColumns: schema.organization?.gridColumns ?? 4,
    spacing: schema.organization?.spacing ?? 100,
    sortBy: schema.organization?.sortBy ?? 'schema-order',
    frameLabels: schema.organization?.frameLabels ?? true,
    pagePrefixes: schema.organization?.pagePrefixes ?? false,
  };

  // Get all component/componentSet definitions
  const allDefs = [
    ...(schema.components || []),
    ...(schema.componentSets || []),
  ];

  // Group components
  const groups = groupComponents(orderedIds, allDefs, componentMap, org);

  // Sort components within groups
  sortGroups(groups, org);

  // Apply layout
  if (org.layout === 'pages') {
    await applyPageLayout(groups, componentMap, org);
  } else if (org.layout === 'frames') {
    await applyFrameLayout(groups, componentMap, org);
  } else {
    applyGridLayout(groups, componentMap, org);
  }
}

// Group components by category, tags, or none
function groupComponents(
  orderedIds: string[],
  allDefs: (ComponentDefinition | ComponentSetDefinition)[],
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  orderedIds.forEach(id => {
    const def = allDefs.find(d => d.id === id);
    if (!def) return;

    let groupKey: string;

    if (org.groupBy === 'category') {
      groupKey = def.category || 'Uncategorized';
    } else if (org.groupBy === 'tags') {
      groupKey = def.tags && def.tags.length > 0 ? def.tags[0] : 'Untagged';
    } else {
      groupKey = 'All Components';
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(id);
  });

  return groups;
}

// Sort components within groups
function sortGroups(
  groups: Map<string, string[]>,
  org: Required<Organization>
): void {
  if (org.sortBy === 'alphabetical') {
    groups.forEach((ids, groupName) => {
      ids.sort();
    });
  }
  // schema-order: no sorting needed, already in order
}

// Apply page-based layout
async function applyPageLayout(
  groups: Map<string, string[]>,
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): Promise<void> {
  groups.forEach((ids, groupName) => {
    const pageName = org.pagePrefixes ? `Components/${groupName}` : groupName;

    // Find or create page
    let page = figma.root.children.find(p => p.name === pageName && p.type === 'PAGE') as PageNode | undefined;
    if (!page) {
      page = figma.createPage();
      page.name = pageName;
    }

    // Position components in grid on this page
    positionInGrid(ids, componentMap, org, 0, 0, page);
  });
}

// Apply frame-based layout
async function applyFrameLayout(
  groups: Map<string, string[]>,
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): Promise<void> {
  let frameY = 0;
  const FRAME_SPACING = org.spacing * 2;

  // Load font for labels if needed
  if (org.frameLabels) {
    await figma.loadFontAsync({ family: "Inter", style: "Bold" }).catch(() => {
      // Fallback to regular if Bold not available
      return figma.loadFontAsync({ family: "Inter", style: "Regular" });
    });
  }

  for (const [groupName, ids] of groups.entries()) {
    // Create labeled frame for this group
    const groupFrame = figma.createFrame();
    groupFrame.name = groupName;
    groupFrame.x = 0;
    groupFrame.y = frameY;

    // Add label if enabled
    if (org.frameLabels) {
      const label = figma.createText();
      label.name = `${groupName} Label`;
      label.characters = groupName;
      label.fontSize = 24;
      try {
        label.fontName = { family: "Inter", style: "Bold" };
      } catch {
        label.fontName = { family: "Inter", style: "Regular" };
      }
      label.x = 0;
      label.y = 0;
      groupFrame.appendChild(label);

      // Position components below label
      const labelHeight = label.height;
      positionInGrid(ids, componentMap, org, 0, labelHeight + org.spacing, null, groupFrame);
    } else {
      positionInGrid(ids, componentMap, org, 0, 0, null, groupFrame);
    }

    // Resize frame to fit content
    groupFrame.resize(
      Math.max(groupFrame.width, org.gridColumns * 300 + (org.gridColumns - 1) * org.spacing),
      groupFrame.height
    );

    // Set frame properties
    groupFrame.layoutMode = 'NONE';
    groupFrame.fills = [];
    groupFrame.clipsContent = false;

    frameY += groupFrame.height + FRAME_SPACING;
  }
}

// Apply flat grid layout
function applyGridLayout(
  groups: Map<string, string[]>,
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): void {
  const allIds: string[] = [];
  groups.forEach(ids => allIds.push(...ids));
  positionInGrid(allIds, componentMap, org, 0, 0, null);
}

// Position components in a grid
function positionInGrid(
  ids: string[],
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>,
  startX: number,
  startY: number,
  page: PageNode | null,
  parentFrame?: FrameNode
): void {
  let x = startX;
  let y = startY;
  let col = 0;
  let maxHeightInRow = 0;

  ids.forEach(id => {
    const node = componentMap.get(id);
    if (!node) return;

    // Move to parent if specified
    if (parentFrame) {
      parentFrame.appendChild(node);
    } else if (page) {
      page.appendChild(node);
    }

    node.x = x;
    node.y = y;

    maxHeightInRow = Math.max(maxHeightInRow, node.height);
    col++;

    if (col >= org.gridColumns) {
      col = 0;
      x = startX;
      y += maxHeightInRow + org.spacing;
      maxHeightInRow = 0;
    } else {
      x += node.width + org.spacing;
    }
  });
}
