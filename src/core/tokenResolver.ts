// src/core/tokenResolver.ts

/**
 * Smart token resolution for Figma variables and text styles.
 *
 * This module handles the "last mile" of token resolution - when the pre-indexed
 * lookup maps in context.ts don't have an exact match. It provides fallback
 * strategies to find tokens even when naming conventions don't align perfectly.
 *
 * Resolution strategies (in order):
 * 1. Exact match against pre-indexed map (fastest, most reliable)
 * 2. Common prefix variants (try "semantic.{token}", "primitives/{token}", etc.)
 * 3. Suffix matching (match by final segment: "color.primary.default" → "default")
 *
 * The suffix matching is particularly useful for design systems where token names
 * are deeply nested but users want to reference just the leaf name.
 */

/**
 * Suffix index for O(1) partial lookups on variables.
 *
 * Maps the final segment of a token path to all full paths that end with that segment.
 * For example, if we have tokens:
 *   - "primitives/colors/primary/default"
 *   - "semantic/text/default"
 *
 * The suffix index would contain:
 *   - "default" → ["primitives/colors/primary/default", "semantic/text/default"]
 *   - "primary" → ["primitives/colors/primary"]
 *
 * This allows O(1) lookup when the user references just "default" and we need to
 * find matching tokens. The alternative would be O(n) iteration over all tokens.
 *
 * Note: Only used for variables (the most common lookup type).
 */
const suffixIndex = new Map<string, string[]>();

/**
 * Build the suffix index for O(1) partial lookups on variables.
 *
 * Called once during context initialization after the variableMap is built.
 * Extracts the final segment from each variable path and indexes it.
 *
 * @param variableMap - The pre-indexed variable map from buildContext
 *
 * @example
 * // For a map containing "colors/primary" and "spacing/sm":
 * buildSuffixIndex(variableMap);
 * // suffixIndex now contains: { "primary" → [...], "sm" → [...] }
 */
export function buildSuffixIndex(variableMap: Map<string, Variable>): void {
  suffixIndex.clear();

  for (const name of variableMap.keys()) {
    // Extract the final segment after the last "/" or "." separator
    // "primitives/colors/primary" → "primary"
    // "colors.primary.default" → "default"
    const suffix = name.split(/[./]/).pop() || name;
    const normalizedSuffix = suffix.toLowerCase();

    if (!suffixIndex.has(normalizedSuffix)) {
      suffixIndex.set(normalizedSuffix, []);
    }
    suffixIndex.get(normalizedSuffix)!.push(name);
  }
}

export interface ResolutionResult<T> {
  value: T | null;
  triedNames: string[];
  availableNames: string[];
  suggestion: string | null;
}

/**
 * Configuration for the generic token resolution helper.
 */
interface TokenResolutionConfig {
  /** Common prefixes to try prepending (both dot and slash variants are generated) */
  prefixBases: string[];
  /** Whether to use the suffix index for partial lookups (only for variables) */
  useSuffixIndex?: boolean;
}

/**
 * Generic token resolution helper that reduces duplication across
 * resolveVariable, resolveTextStyle, and resolveEffectStyle.
 *
 * This function implements a multi-strategy approach to find tokens:
 * 1. Direct lookup (most common, fastest)
 * 2. Prefix expansion (try adding common prefixes)
 * 3. Suffix matching (match by final segment only)
 *
 * The goal is to be forgiving of naming mismatches between how tokens are
 * defined in the design system vs how users reference them in schemas.
 *
 * @param tokenPath - The token path from the JSON schema (e.g., "colors.primary")
 * @param tokenMap - Pre-indexed map of tokens with multiple lookup keys per token
 * @param config - Configuration specifying which prefixes to try and whether to use suffix index
 * @param getAvailableNames - Function to extract unique display names for error messages
 */
function resolveToken<T extends { name: string }>(
  tokenPath: string,
  tokenMap: Map<string, T>,
  config: TokenResolutionConfig,
  getAvailableNames: (map: Map<string, T>) => string[]
): ResolutionResult<T> {
  const triedNames: string[] = [];
  const normalized = tokenPath.toLowerCase();
  const availableNames = getAvailableNames(tokenMap);

  // =========================================================================
  // STRATEGY 1: Direct lookup (most common case)
  // =========================================================================
  // The tokenMap is pre-indexed with many naming variants (see context.ts),
  // so a simple lowercase lookup handles most cases.
  triedNames.push(tokenPath);
  let result = tokenMap.get(normalized);
  if (result) {
    return { value: result, triedNames, availableNames, suggestion: null };
  }

  // =========================================================================
  // STRATEGY 2: Try common prefixes
  // =========================================================================
  // When the direct lookup fails, the token might be defined with a prefix
  // that the user omitted. For example, a variable might be at "semantic/colors/primary"
  // but the user just wrote "colors/primary".
  //
  // We try prepending common prefixes like "semantic", "primitives", "tokens"
  // in both dot and slash notation to find the token.
  const prefixVariants = [normalized];
  for (const base of config.prefixBases) {
    prefixVariants.push(`${base}.${normalized}`);  // semantic.colors.primary
    prefixVariants.push(`${base}/${normalized}`);  // semantic/colors/primary
  }

  for (const variant of prefixVariants) {
    if (variant !== normalized) {
      triedNames.push(variant);
      result = tokenMap.get(variant);
      if (result) {
        return { value: result, triedNames, availableNames, suggestion: null };
      }
    }
  }

  // =========================================================================
  // STRATEGY 3: Suffix matching (last resort)
  // =========================================================================
  // If prefix expansion doesn't work, try matching just the final segment.
  // This handles cases where users reference "primary" and we have
  // "primitives/colors/primary" in the design system.
  //
  // IMPORTANT: This is a fuzzy match and may return unexpected results if
  // multiple tokens share the same suffix. We return the first match and
  // include a suggestion so users know the full path they should use.
  const segments = normalized.split(/[./]/);
  const lastSegment = segments[segments.length - 1];

  // Only do suffix matching if there are multiple segments (i.e., we already tried
  // the full name and it failed). Single-segment names were already tried above.
  if (lastSegment && segments.length > 1) {
    triedNames.push(`*/${lastSegment}`);  // Log that we tried a wildcard match

    // Use the pre-built suffix index for O(1) lookup (variables only)
    // This is a significant performance optimization for large design systems
    if (config.useSuffixIndex && suffixIndex.size > 0) {
      const candidates = suffixIndex.get(lastSegment);
      if (candidates && candidates.length > 0) {
        // Return the first matching candidate
        // TODO: Consider ranking candidates by similarity to the original path
        const matchedName = candidates[0];
        const token = tokenMap.get(matchedName);
        if (token) {
          return {
            value: token,
            triedNames,
            availableNames,
            suggestion: token.name,  // Suggest the full name for future use
          };
        }
      }
    } else {
      // Fallback: O(n) iteration for text/effect styles
      // We don't build suffix indices for styles because they're less frequently used
      for (const [name, token] of tokenMap.entries()) {
        const nameLower = name.toLowerCase();
        // Check if name ends with "/lastSegment" or ".lastSegment"
        if (nameLower.endsWith('/' + lastSegment) || nameLower.endsWith('.' + lastSegment)) {
          return {
            value: token,
            triedNames,
            availableNames,
            suggestion: token.name,  // Suggest the full name for future use
          };
        }
      }
    }
  }

  // =========================================================================
  // NOT FOUND: Generate helpful suggestions
  // =========================================================================
  // Use fuzzy string matching to suggest similar tokens the user might have meant.
  // This helps with typos and close misses.
  const suggestion = findSuggestion(normalized, availableNames);

  return {
    value: null,
    triedNames,
    availableNames,
    suggestion,
  };
}

/**
 * Prefix configuration for variable tokens.
 *
 * Common top-level prefixes in design systems:
 * - "semantic": Semantic/alias tokens (e.g., semantic/color/primary)
 * - "primitives": Base/primitive tokens (e.g., primitives/blue/500)
 * - "core": Alternative name for primitives
 * - "tokens": Generic prefix some tools use
 *
 * Uses suffix index for O(1) partial lookups since variables are the
 * most frequently resolved token type.
 */
const VARIABLE_PREFIXES: TokenResolutionConfig = {
  prefixBases: ['semantic', 'primitives', 'core', 'tokens'],
  useSuffixIndex: true,
};

/**
 * Prefix configuration for text style tokens.
 *
 * Common organizational prefixes for typography styles:
 * - "typography": Standard prefix (e.g., typography/heading/h1)
 * - "text": Alternative name
 * - "font": Another common alternative
 */
const TEXT_STYLE_PREFIXES: TokenResolutionConfig = {
  prefixBases: ['typography', 'text', 'font'],
};

/**
 * Prefix configuration for effect style tokens.
 *
 * Common organizational prefixes for effect styles (shadows, blurs, etc.):
 * - "effects": Standard prefix (e.g., effects/shadow/md)
 * - "shadow": Direct prefix for shadow-only collections
 */
const EFFECT_STYLE_PREFIXES: TokenResolutionConfig = {
  prefixBases: ['effects', 'shadow'],
};

/**
 * Resolve a variable token.
 *
 * Note: The variableMap is now pre-indexed with all naming variations,
 * so we just need to normalize the input and do a simple lookup.
 * Fallback strategies are kept for edge cases not covered by pre-indexing.
 */
export function resolveVariable(
  tokenPath: string,
  variableMap: Map<string, Variable>
): ResolutionResult<Variable> {
  return resolveToken(
    tokenPath,
    variableMap,
    VARIABLE_PREFIXES,
    (map) => Array.from(new Set(Array.from(map.values()).map(v => v.name)))
  );
}

/**
 * Resolve a text style token.
 *
 * Note: The textStyleMap is now pre-indexed with all naming variations,
 * so we just need to normalize the input and do a simple lookup.
 */
export function resolveTextStyle(
  tokenPath: string,
  textStyleMap: Map<string, TextStyle>
): ResolutionResult<TextStyle> {
  return resolveToken(
    tokenPath,
    textStyleMap,
    TEXT_STYLE_PREFIXES,
    (map) => Array.from(new Set(Array.from(map.values()).map(s => s.name)))
  );
}

/**
 * Resolve an effect style token (for shadows).
 */
export function resolveEffectStyle(
  tokenPath: string,
  effectStyleMap: Map<string, EffectStyle>
): ResolutionResult<EffectStyle> {
  return resolveToken(
    tokenPath,
    effectStyleMap,
    EFFECT_STYLE_PREFIXES,
    (map) => Array.from(new Set(Array.from(map.values()).map(s => s.name)))
  );
}

/**
 * Find a similar name suggestion using simple string similarity.
 *
 * Used when token resolution fails to suggest what the user might have meant.
 * For example, if the user wrote "color.primery" (typo), we might suggest
 * "colors/primary" as a close match.
 *
 * @param target - The normalized token path that wasn't found
 * @param availableNames - List of all available token names
 * @returns The closest matching name, or null if no good match (similarity < 0.6)
 */
function findSuggestion(target: string, availableNames: string[]): string | null {
  if (availableNames.length === 0) return null;

  // Strip separators for comparison - we care about character similarity, not path structure
  const normalizedTarget = target.toLowerCase().replace(/[./]/g, '');

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const name of availableNames) {
    const normalizedName = name.toLowerCase().replace(/[./]/g, '');
    const score = similarity(normalizedTarget, normalizedName);

    // Only suggest if similarity is above threshold (0.6 = 60% similar)
    // This prevents suggesting completely unrelated tokens
    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = name;
    }
  }

  return bestMatch;
}

/**
 * Calculate a simple string similarity score (0-1).
 *
 * Uses a two-tier approach:
 * 1. Substring containment: If one string contains the other, score based on length ratio
 * 2. Character overlap: Count shared unique characters (Jaccard-like similarity)
 *
 * This is NOT a sophisticated algorithm (no Levenshtein, no n-grams), but it's fast
 * and good enough for suggesting "did you mean X?" in error messages.
 *
 * @param a - First string (normalized, separators stripped)
 * @param b - Second string (normalized, separators stripped)
 * @returns Similarity score from 0 (no similarity) to 1 (identical)
 */
function similarity(a: string, b: string): number {
  // Identical strings have perfect similarity
  if (a === b) return 1;

  // Empty strings have no similarity
  if (a.length === 0 || b.length === 0) return 0;

  // Substring containment check
  // If "primary" is in "colorsprimary", they're likely related
  // Score is the ratio of the shorter to longer string
  if (a.includes(b) || b.includes(a)) {
    return Math.max(b.length / a.length, a.length / b.length);
  }

  // Character overlap (Jaccard-like similarity)
  // Count unique characters shared between both strings
  // Example: "primary" and "primery" share {p,r,i,m,e,y} = 6 chars out of 7 unique
  const aChars = new Set(a.split(''));
  const bChars = new Set(b.split(''));
  const intersection = new Set([...aChars].filter(c => bChars.has(c)));

  // Normalize by the larger character set to penalize missing characters
  return intersection.size / Math.max(aChars.size, bChars.size);
}

/**
 * Validate that a variable has the expected type.
 * Returns null if valid, or an error message if invalid.
 */
export function validateVariableType(
  variable: Variable,
  expectedType: 'COLOR' | 'FLOAT',
  tokenPath: string,
  tokenField: string
): string | null {
  if (variable.resolvedType !== expectedType) {
    return `${tokenField} '${tokenPath}' resolved to ${variable.resolvedType} variable '${variable.name}' (expected ${expectedType}). Skipping binding.`;
  }
  return null;
}

/**
 * Format a resolution error message with helpful details.
 */
export function formatResolutionError(
  tokenPath: string,
  result: ResolutionResult<any>,
  tokenType: 'variable' | 'textStyle'
): string {
  const typeLabel = tokenType === 'variable' ? 'Variable' : 'Text style';
  let message = `${typeLabel} '${tokenPath}' not found`;

  // Show what was tried
  if (result.triedNames.length > 1) {
    message += `\n  Tried: ${result.triedNames.join(', ')}`;
  }

  // Show suggestion if available
  if (result.suggestion) {
    message += `\n  💡 Did you mean: '${result.suggestion}'?`;
  }

  // Show available options (first 5) if list is small
  if (result.availableNames.length > 0 && result.availableNames.length <= 10) {
    message += `\n  Available: ${result.availableNames.join(', ')}`;
  } else if (result.availableNames.length > 10) {
    const preview = result.availableNames.slice(0, 5);
    message += `\n  Available (first 5): ${preview.join(', ')}, ... (${result.availableNames.length} total)`;
  }

  return message;
}
