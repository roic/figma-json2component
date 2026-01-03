// src/core/generator/context.ts
import { IconRegistryResolver } from '../iconRegistry';
import { IconRegistry } from '../../types/iconRegistry';
import { GenerationContext, PLUGIN_DATA_KEY } from './types';
import { buildSuffixIndex } from '../tokenResolver';

/**
 * Generate multiple lookup aliases for a variable to support various naming conventions.
 *
 * Design systems use different naming patterns depending on the tooling:
 * - Tokens Studio: "primitives/colors/primary" (slash-separated hierarchies)
 * - Figma Variables: "Colors/Primary" (Title Case, slash-separated)
 * - Code references: "colors.primary" or "colors-primary" (dot or kebab notation)
 * - CSS custom properties: "--colors-primary" (kebab-case with prefix)
 *
 * We generate multiple aliases for each variable so that schema authors can reference
 * tokens using ANY of these conventions and still get a match. This eliminates the
 * need for users to know exactly how tokens were imported into Figma.
 *
 * @param variableName - The variable name (e.g., "colors/primary" or "colors.primary")
 * @param collectionName - The collection name (e.g., "primitives" or "primitives/colors")
 * @returns Array of normalized lookup keys for the variable
 *
 * @example
 * // For variable "primary" in collection "colors":
 * const keys = buildVariableLookupAliases('primary', 'colors');
 * // Returns: ['primary', 'colors/primary', 'colors.primary', ...]
 */
export function buildVariableLookupAliases(variableName: string, collectionName: string): string[] {
  const keys: string[] = [];

  // All lookups are case-insensitive to handle Figma's Title Case vs lowercase in code
  const lowerName = variableName.toLowerCase();
  const lowerCollection = collectionName.toLowerCase();

  // 1. Original name only (normalized to lowercase)
  // Allows simple lookups like "primary" when variable names are unique across collections
  keys.push(lowerName);

  // 2. Full path with collection prefix using slash notation
  // Matches Tokens Studio format: "primitives/colors/primary"
  // Needed when multiple collections have variables with the same name
  keys.push(`${lowerCollection}/${lowerName}`);

  // 3. Full path with collection prefix using dot notation
  // Matches code-style references: "primitives.colors.primary"
  // Common in TypeScript/JavaScript token exports
  keys.push(`${lowerCollection}.${lowerName}`);

  // 4. Convert dots to slashes in variable name
  // Handles case where Tokens Studio exports "colors.primary" but user references "colors/primary"
  // This bidirectional conversion ensures both formats work regardless of source
  const nameWithSlashes = lowerName.replace(/\./g, '/');
  if (nameWithSlashes !== lowerName) {
    keys.push(nameWithSlashes);
    keys.push(`${lowerCollection}/${nameWithSlashes}`);
    keys.push(`${lowerCollection}.${nameWithSlashes}`);
  }

  // 5. Convert slashes to dots in variable name
  // Inverse of above: "colors/primary" can be looked up as "colors.primary"
  // Useful when copying token paths from Figma's variable panel (which uses slashes)
  const nameWithDots = lowerName.replace(/\//g, '.');
  if (nameWithDots !== lowerName) {
    keys.push(nameWithDots);
    keys.push(`${lowerCollection}/${nameWithDots}`);
    keys.push(`${lowerCollection}.${nameWithDots}`);
  }

  // 6. Handle hierarchical collection names (e.g., "primitives/spacing")
  // Tokens Studio often creates nested collections like "primitives/spacing" with variable "sm".
  // Users might reference this as "spacing/sm" (using only the leaf segment of the collection).
  // This allows shorter, more intuitive references without the full collection path.
  const collectionSegments = lowerCollection.split('/');
  if (collectionSegments.length > 1) {
    const lastSegment = collectionSegments[collectionSegments.length - 1];
    keys.push(`${lastSegment}/${lowerName}`);
    keys.push(`${lastSegment}.${lowerName}`);

    // Also apply dot/slash transformations with the shortened collection prefix
    if (nameWithSlashes !== lowerName) {
      keys.push(`${lastSegment}/${nameWithSlashes}`);
      keys.push(`${lastSegment}.${nameWithSlashes}`);
    }
    if (nameWithDots !== lowerName) {
      keys.push(`${lastSegment}/${nameWithDots}`);
      keys.push(`${lastSegment}.${nameWithDots}`);
    }
  }

  // 7. Strip redundant collection prefix from variable name
  // Some Tokens Studio configurations create variables like "colors/primary" inside
  // a collection also named "colors", resulting in "colors/colors/primary" lookups.
  // This deduplicates by stripping the collection name when it's already in the variable path.
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
 * Generate multiple lookup aliases for a text or effect style.
 *
 * Like variables, styles in Figma can have different naming conventions:
 * - Figma default: "Typography/Heading/H1" (slash-separated, Title Case)
 * - Design tokens: "typography.heading.h1" (dot-separated, lowercase)
 * - Shorthand: "heading/h1" (without category prefix)
 *
 * This function generates aliases to match styles regardless of how they're referenced.
 *
 * @param styleName - The style name (e.g., "Typography/Label" or "typography.label")
 * @returns Array of normalized lookup keys for the style
 *
 * @example
 * const keys = generateStyleKeys('Typography/Heading/H1');
 * // Returns: ['typography/heading/h1', 'heading/h1', 'heading.h1', ...]
 */
export function generateStyleKeys(styleName: string): string[] {
  const keys: string[] = [];

  // Normalize to lowercase for case-insensitive matching
  const lowerName = styleName.toLowerCase();

  // 1. Original name (normalized to lowercase)
  // Handles exact matches with case normalization
  keys.push(lowerName);

  // 2. Convert dots to slashes
  // Allows "typography.heading.h1" to match Figma's "Typography/Heading/H1"
  const withSlashes = lowerName.replace(/\./g, '/');
  if (withSlashes !== lowerName) {
    keys.push(withSlashes);
  }

  // 3. Convert slashes to dots
  // Allows "typography/heading/h1" to match code-style "typography.heading.h1" references
  const withDots = lowerName.replace(/\//g, '.');
  if (withDots !== lowerName) {
    keys.push(withDots);
  }

  // 4. Handle case variants
  // Figma uses Title Case ("Typography/Label") but code often uses lowercase
  // This is already handled by lowerName, but we keep the explicit transformation
  // for clarity and potential future case-aware matching
  const capitalizedFirst = styleName.charAt(0).toUpperCase() + styleName.slice(1).toLowerCase();
  keys.push(capitalizedFirst.toLowerCase());

  // 5. Strip common category prefixes
  // Design systems often organize styles under "typography/", "text/", "font/", etc.
  // Users may want to reference "heading/h1" without knowing the parent category.
  // This allows shorthand references: "heading/h1" instead of "typography/heading/h1"
  const prefixes = ['typography/', 'typography.', 'text/', 'text.', 'font/', 'font.', 'effects/', 'effects.', 'shadow/', 'shadow.'];
  for (const prefix of prefixes) {
    if (lowerName.startsWith(prefix)) {
      const withoutPrefix = lowerName.slice(prefix.length);
      keys.push(withoutPrefix);
      // Also generate dot and slash variants of the stripped name
      keys.push(withoutPrefix.replace(/\//g, '.'));
      keys.push(withoutPrefix.replace(/\./g, '/'));
    }
  }

  return keys;
}

/**
 * Build the generation context with all lookup maps and resolvers.
 *
 * Creates a context object containing:
 * - componentMap: Existing components indexed by plugin data ID
 * - variableMap: All variables indexed by multiple lookup keys
 * - textStyleMap: Text styles indexed by multiple lookup keys
 * - effectStyleMap: Effect styles indexed by multiple lookup keys
 * - iconResolver: Resolver for iconRef lookups
 * - warnings: Array to collect warnings during generation
 *
 * @param warnings - Array to collect warnings during context building
 * @param registries - Icon registries for iconRef resolution
 * @param componentMap - Optional pre-built component map (for caching)
 * @returns The generation context for use by generator functions
 *
 * @example
 * const context = await buildContext([], [lucideRegistry], componentMap);
 * const colorVar = context.variableMap.get('colors/primary');
 */
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

  // Build suffix index for O(1) partial lookups on variables
  buildSuffixIndex(variableMap);

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
