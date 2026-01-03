// src/core/generator/context.ts
import { IconRegistryResolver } from '../iconRegistry';
import { IconRegistry } from '../../types/iconRegistry';
import { GenerationContext, PLUGIN_DATA_KEY } from './types';

/**
 * Generate all possible lookup keys for a variable.
 * Handles Tokens Studio naming variations.
 */
export function buildVariableLookupAliases(variableName: string, collectionName: string): string[] {
  const keys: string[] = [];
  const lowerName = variableName.toLowerCase();
  const lowerCollection = collectionName.toLowerCase();

  // 1. Original name (normalized)
  keys.push(lowerName);

  // 2. With collection prefix (slash notation)
  keys.push(`${lowerCollection}/${lowerName}`);

  // 3. With collection prefix (dot notation)
  keys.push(`${lowerCollection}.${lowerName}`);

  // 4. Variable name with dot-to-slash conversion
  const nameWithSlashes = lowerName.replace(/\./g, '/');
  if (nameWithSlashes !== lowerName) {
    keys.push(nameWithSlashes);
    keys.push(`${lowerCollection}/${nameWithSlashes}`);
    keys.push(`${lowerCollection}.${nameWithSlashes}`);
  }

  // 5. Variable name with slash-to-dot conversion
  const nameWithDots = lowerName.replace(/\//g, '.');
  if (nameWithDots !== lowerName) {
    keys.push(nameWithDots);
    keys.push(`${lowerCollection}/${nameWithDots}`);
    keys.push(`${lowerCollection}.${nameWithDots}`);
  }

  // 6. Handle multi-segment collection names (e.g., "primitives/spacing")
  // For variable "sm" in collection "primitives/spacing", also index as:
  // - "spacing/sm" and "spacing.sm" (using last segment of collection)
  const collectionSegments = lowerCollection.split('/');
  if (collectionSegments.length > 1) {
    const lastSegment = collectionSegments[collectionSegments.length - 1];
    keys.push(`${lastSegment}/${lowerName}`);
    keys.push(`${lastSegment}.${lowerName}`);

    // Also with variable name transformations
    if (nameWithSlashes !== lowerName) {
      keys.push(`${lastSegment}/${nameWithSlashes}`);
      keys.push(`${lastSegment}.${nameWithSlashes}`);
    }
    if (nameWithDots !== lowerName) {
      keys.push(`${lastSegment}/${nameWithDots}`);
      keys.push(`${lastSegment}.${nameWithDots}`);
    }
  }

  // 7. Strip collection from variable name if it starts with it
  if (lowerName.startsWith(lowerCollection + '/')) {
    const withoutCollection = lowerName.slice(lowerCollection.length + 1);
    keys.push(withoutCollection);
    keys.push(withoutCollection.replace(/\//g, '.'));
  }
  if (lowerName.startsWith(lowerCollection + '.')) {
    const withoutCollection = lowerName.slice(lowerCollection.length + 1);
    keys.push(withoutCollection);
    keys.push(withoutCollection.replace(/\./g, '/'));
  }

  return keys;
}

/**
 * Generate all possible lookup keys for a text/effect style.
 */
export function generateStyleKeys(styleName: string): string[] {
  const keys: string[] = [];
  const lowerName = styleName.toLowerCase();

  // 1. Original name (normalized)
  keys.push(lowerName);

  // 2. Dot-to-slash conversion
  const withSlashes = lowerName.replace(/\./g, '/');
  if (withSlashes !== lowerName) {
    keys.push(withSlashes);
  }

  // 3. Slash-to-dot conversion
  const withDots = lowerName.replace(/\//g, '.');
  if (withDots !== lowerName) {
    keys.push(withDots);
  }

  // 4. Capitalized variants (Typography/Label vs typography/label)
  const capitalizedFirst = styleName.charAt(0).toUpperCase() + styleName.slice(1).toLowerCase();
  keys.push(capitalizedFirst.toLowerCase());

  // 5. Strip common prefixes
  const prefixes = ['typography/', 'typography.', 'text/', 'text.', 'font/', 'font.', 'effects/', 'effects.', 'shadow/', 'shadow.'];
  for (const prefix of prefixes) {
    if (lowerName.startsWith(prefix)) {
      const withoutPrefix = lowerName.slice(prefix.length);
      keys.push(withoutPrefix);
      keys.push(withoutPrefix.replace(/\//g, '.'));
      keys.push(withoutPrefix.replace(/\./g, '/'));
    }
  }

  return keys;
}

export async function buildContext(
  warnings: string[],
  registries: IconRegistry[] = [],
  componentMap?: Map<string, ComponentNode | ComponentSetNode>
): Promise<GenerationContext> {
  // Use provided component map or create empty one
  // The caller (generateFromSchema) provides the cached component map
  const compMap = componentMap ?? new Map<string, ComponentNode | ComponentSetNode>();

  // Build collection-aware variable index (with warnings)
  const variableMap = new Map<string, Variable>();
  const collections = figma.variables.getLocalVariableCollections();

  for (const collection of collections) {
    for (const variableId of collection.variableIds) {
      const variable = figma.variables.getVariableById(variableId);
      if (!variable) continue;

      // Generate multiple normalized lookup keys for each variable
      const keys = buildVariableLookupAliases(variable.name, collection.name);

      // Store variable under all keys
      for (const key of keys) {
        if (variableMap.has(key)) {
          const existing = variableMap.get(key)!;
          // Only warn if it's a different variable (real collision), not duplicate key for same variable
          if (existing.id !== variable.id) {
            const existingCollection = collections.find(c => c.variableIds.includes(existing.id))?.name || 'unknown';
            console.warn(
              `Warning: Variable key collision: '${key}' maps to both ` +
              `'${existing.name}' (collection: ${existingCollection}) and ` +
              `'${variable.name}' (collection: ${collection.name}). ` +
              `Using latest match: '${variable.name}'.`
            );
          }
        }
        variableMap.set(key, variable);
      }
    }
  }

  // Build text style index with multiple naming variants
  const textStyleMap = new Map<string, TextStyle>();
  const textStyles = await figma.getLocalTextStylesAsync();

  for (const style of textStyles) {
    const keys = generateStyleKeys(style.name);
    for (const key of keys) {
      if (textStyleMap.has(key)) {
        const existing = textStyleMap.get(key)!;
        // Only warn if it's a different style (real collision), not duplicate key for same style
        if (existing.id !== style.id) {
          console.warn(
            `Warning: Text style key collision: '${key}' maps to both ` +
            `'${existing.name}' and '${style.name}'. ` +
            `Using latest match: '${style.name}'.`
          );
        }
      }
      textStyleMap.set(key, style);
    }
  }

  // Build effect style index for shadows
  const effectStyleMap = new Map<string, EffectStyle>();
  const effectStyles = figma.getLocalEffectStyles();

  for (const style of effectStyles) {
    const keys = generateStyleKeys(style.name);
    for (const key of keys) {
      if (effectStyleMap.has(key)) {
        const existing = effectStyleMap.get(key)!;
        // Only warn if it's a different style (real collision), not duplicate key for same style
        if (existing.id !== style.id) {
          console.warn(
            `Warning: Effect style key collision: '${key}' maps to both ` +
            `'${existing.name}' and '${style.name}'. ` +
            `Using latest match: '${style.name}'.`
          );
        }
      }
      effectStyleMap.set(key, style);
    }
  }

  // Build icon resolver from registries
  const iconResolver = new IconRegistryResolver(registries);

  return { componentMap: compMap, variableMap, textStyleMap, effectStyleMap, iconResolver, warnings };
}
