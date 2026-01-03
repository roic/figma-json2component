// src/core/tokenResolver.ts

/**
 * Smart token resolution for Figma variables and text styles.
 *
 * Tries multiple naming strategies to handle different Tokens Studio configurations:
 * - Exact match
 * - Dot-to-slash conversion (semantic.color.primary → semantic/color/primary)
 * - Prefix stripping (semantic.color.primary → color/primary)
 * - Suffix matching (color.primary.default → matches anything ending in "default")
 */

/**
 * Suffix index for O(1) partial lookups on variables.
 * Maps normalized suffix (last segment) to array of full variable names.
 * Only used for variables (the most common lookup).
 */
const suffixIndex = new Map<string, string[]>();

/**
 * Build suffix index for O(1) partial lookups on variables.
 * Should be called after building the variableMap in buildContext.
 *
 * @param variableMap - The pre-indexed variable map from buildContext
 */
export function buildSuffixIndex(variableMap: Map<string, Variable>): void {
  suffixIndex.clear();
  for (const name of variableMap.keys()) {
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
 * @param tokenPath - The token path from the JSON schema
 * @param tokenMap - Pre-indexed map of tokens
 * @param config - Configuration specifying which prefixes to try
 * @param getAvailableNames - Function to extract unique display names from tokens
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

  // Primary lookup: normalized lowercase (index has all patterns)
  triedNames.push(tokenPath);
  let result = tokenMap.get(normalized);
  if (result) {
    return { value: result, triedNames, availableNames, suggestion: null };
  }

  // Fallback: Try with common prefixes (both dot and slash variants)
  const prefixVariants = [normalized];
  for (const base of config.prefixBases) {
    prefixVariants.push(`${base}.${normalized}`);
    prefixVariants.push(`${base}/${normalized}`);
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

  // Last resort: Partial match on final segment
  const segments = normalized.split(/[./]/);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && segments.length > 1) {
    triedNames.push(`*/${lastSegment}`);

    // Use suffix index for O(1) lookup if enabled (variables only)
    if (config.useSuffixIndex && suffixIndex.size > 0) {
      const candidates = suffixIndex.get(lastSegment);
      if (candidates && candidates.length > 0) {
        // Return the first matching candidate
        const matchedName = candidates[0];
        const token = tokenMap.get(matchedName);
        if (token) {
          return {
            value: token,
            triedNames,
            availableNames,
            suggestion: token.name,
          };
        }
      }
    } else {
      // Fallback: O(n) iteration for text/effect styles
      for (const [name, token] of tokenMap.entries()) {
        const nameLower = name.toLowerCase();
        if (nameLower.endsWith('/' + lastSegment) || nameLower.endsWith('.' + lastSegment)) {
          return {
            value: token,
            triedNames,
            availableNames,
            suggestion: token.name,
          };
        }
      }
    }
  }

  // Not found - suggest similar names
  const suggestion = findSuggestion(normalized, availableNames);

  return {
    value: null,
    triedNames,
    availableNames,
    suggestion,
  };
}

/** Prefix configuration for variable tokens (uses suffix index for O(1) partial lookups) */
const VARIABLE_PREFIXES: TokenResolutionConfig = {
  prefixBases: ['semantic', 'primitives', 'core', 'tokens'],
  useSuffixIndex: true,
};

/** Prefix configuration for text style tokens */
const TEXT_STYLE_PREFIXES: TokenResolutionConfig = {
  prefixBases: ['typography', 'text', 'font'],
};

/** Prefix configuration for effect style tokens */
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
 */
function findSuggestion(target: string, availableNames: string[]): string | null {
  if (availableNames.length === 0) return null;

  // Normalize target for comparison
  const normalizedTarget = target.toLowerCase().replace(/[./]/g, '');

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const name of availableNames) {
    const normalizedName = name.toLowerCase().replace(/[./]/g, '');
    const score = similarity(normalizedTarget, normalizedName);

    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = name;
    }
  }

  return bestMatch;
}

/**
 * Simple string similarity score (0-1).
 * Based on longest common subsequence.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) {
    return Math.max(b.length / a.length, a.length / b.length);
  }

  // Simple character overlap
  const aChars = new Set(a.split(''));
  const bChars = new Set(b.split(''));
  const intersection = new Set([...aChars].filter(c => bChars.has(c)));

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
