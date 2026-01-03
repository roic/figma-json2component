// src/core/generator/main.ts
import type {
  Schema,
  ComponentDefinition,
  ComponentSetDefinition,
  ChildNode,
  LayoutProps,
  StyleProps,
} from '../../types/schema';
import { resolveDependencies } from '../resolver';
import { IconRegistry } from '../../types/iconRegistry';
import { GenerationContext, GenerateResult, PLUGIN_DATA_KEY } from './types';
import { buildContext, buildVariableLookupAliases, generateStyleKeys } from './context';
import { applyStyles } from './styles';
import { applyLayout, positionComponents } from './layout';
import { createChildNode } from './nodes';

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
