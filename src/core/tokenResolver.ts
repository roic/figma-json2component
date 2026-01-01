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

export interface ResolutionResult<T> {
  value: T | null;
  triedNames: string[];
  availableNames: string[];
  suggestion: string | null;
}

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
  const triedNames: string[] = [];
  const normalized = tokenPath.toLowerCase();
  const availableNames = Array.from(new Set(
    Array.from(variableMap.values()).map(v => v.name)
  ));

  // Primary lookup: normalized lowercase (index has all patterns)
  triedNames.push(tokenPath);
  let result = variableMap.get(normalized);
  if (result) {
    return { value: result, triedNames, availableNames, suggestion: null };
  }

  // Fallback: Try with common semantic prefixes for schemas that include them
  const prefixVariants = [
    normalized,
    `semantic.${normalized}`,
    `semantic/${normalized}`,
    `primitives.${normalized}`,
    `primitives/${normalized}`,
    `core.${normalized}`,
    `core/${normalized}`,
    `tokens.${normalized}`,
    `tokens/${normalized}`,
  ];

  for (const variant of prefixVariants) {
    if (variant !== normalized) {
      triedNames.push(variant);
      result = variableMap.get(variant);
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
    for (const [name, variable] of variableMap.entries()) {
      const nameLower = name.toLowerCase();
      if (nameLower.endsWith('/' + lastSegment) || nameLower.endsWith('.' + lastSegment)) {
        return {
          value: variable,
          triedNames,
          availableNames,
          suggestion: variable.name,
        };
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
  const triedNames: string[] = [];
  const normalized = tokenPath.toLowerCase();
  const availableNames = Array.from(new Set(
    Array.from(textStyleMap.values()).map(s => s.name)
  ));

  // Primary lookup: normalized lowercase (index has all patterns)
  triedNames.push(tokenPath);
  let result = textStyleMap.get(normalized);
  if (result) {
    return { value: result, triedNames, availableNames, suggestion: null };
  }

  // Fallback: Try with common typography prefixes
  const prefixVariants = [
    normalized,
    `typography.${normalized}`,
    `typography/${normalized}`,
    `text.${normalized}`,
    `text/${normalized}`,
    `font.${normalized}`,
    `font/${normalized}`,
  ];

  for (const variant of prefixVariants) {
    if (variant !== normalized) {
      triedNames.push(variant);
      result = textStyleMap.get(variant);
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
    for (const [name, style] of textStyleMap.entries()) {
      const nameLower = name.toLowerCase();
      if (nameLower.endsWith('/' + lastSegment) || nameLower.endsWith('.' + lastSegment)) {
        return {
          value: style,
          triedNames,
          availableNames,
          suggestion: style.name,
        };
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

/**
 * Resolve an effect style token (for shadows).
 */
export function resolveEffectStyle(
  tokenPath: string,
  effectStyleMap: Map<string, EffectStyle>
): ResolutionResult<EffectStyle> {
  const triedNames: string[] = [];
  const normalized = tokenPath.toLowerCase();
  const availableNames = Array.from(new Set(
    Array.from(effectStyleMap.values()).map(s => s.name)
  ));

  // Primary lookup: normalized lowercase (index has all patterns)
  triedNames.push(tokenPath);
  let result = effectStyleMap.get(normalized);
  if (result) {
    return { value: result, triedNames, availableNames, suggestion: null };
  }

  // Fallback: Try with common effect/shadow prefixes
  const prefixVariants = [
    normalized,
    `effects.${normalized}`,
    `effects/${normalized}`,
    `shadow.${normalized}`,
    `shadow/${normalized}`,
  ];

  for (const variant of prefixVariants) {
    if (variant !== normalized) {
      triedNames.push(variant);
      result = effectStyleMap.get(variant);
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
    for (const [name, style] of effectStyleMap.entries()) {
      const nameLower = name.toLowerCase();
      if (nameLower.endsWith('/' + lastSegment) || nameLower.endsWith('.' + lastSegment)) {
        return {
          value: style,
          triedNames,
          availableNames,
          suggestion: style.name,
        };
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
