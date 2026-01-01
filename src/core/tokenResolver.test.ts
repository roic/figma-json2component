// src/core/tokenResolver.test.ts

import { describe, it, expect } from 'vitest';
import { resolveVariable, resolveTextStyle, formatResolutionError } from './tokenResolver';

/**
 * Helper to create a pre-indexed variable map (simulates buildContext behavior).
 * Stores the variable under multiple normalized keys.
 */
function createIndexedVariableMap(variables: Array<{ name: string; collectionName?: string }>): Map<string, Variable> {
  const map = new Map<string, Variable>();

  variables.forEach(({ name, collectionName = 'default' }, index) => {
    const variable = { id: String(index + 1), name } as Variable;

    // Add all normalized keys (same logic as generateVariableKeys)
    const lowerName = name.toLowerCase();
    const lowerCollection = collectionName.toLowerCase();

    const keys = [
      lowerName,
      `${lowerCollection}/${lowerName}`,
      `${lowerCollection}.${lowerName}`,
      lowerName.replace(/\./g, '/'),
      lowerName.replace(/\//g, '.'),
    ];

    keys.forEach(key => map.set(key, variable));
  });

  return map;
}

/**
 * Helper to create a pre-indexed style map.
 */
function createIndexedStyleMap(styleNames: string[]): Map<string, TextStyle> {
  const map = new Map<string, TextStyle>();

  styleNames.forEach((name, index) => {
    const style = { id: String(index + 1), name } as TextStyle;
    const lowerName = name.toLowerCase();

    const keys = [
      lowerName,
      lowerName.replace(/\./g, '/'),
      lowerName.replace(/\//g, '.'),
    ];

    // Also add without common prefixes
    const prefixes = ['typography/', 'typography.', 'text/', 'text.', 'font/', 'font.'];
    prefixes.forEach(prefix => {
      if (lowerName.startsWith(prefix)) {
        const withoutPrefix = lowerName.slice(prefix.length);
        keys.push(withoutPrefix);
        keys.push(withoutPrefix.replace(/\//g, '.'));
        keys.push(withoutPrefix.replace(/\./g, '/'));
      }
    });

    keys.forEach(key => map.set(key, style));
  });

  return map;
}

describe('resolveVariable', () => {
  it('finds exact match', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'semantic.color.primary', collectionName: 'tokens' }
    ]);

    const result = resolveVariable('semantic.color.primary', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('semantic.color.primary');
  });

  it('converts dots to slashes', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'semantic/color/primary', collectionName: 'tokens' }
    ]);

    const result = resolveVariable('semantic.color.primary', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('semantic/color/primary');
  });

  it('strips semantic prefix via collection', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'color/primary', collectionName: 'semantic' }
    ]);

    const result = resolveVariable('semantic.color.primary', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('color/primary');
  });

  it('strips primitives prefix via collection', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'color/blue/500', collectionName: 'primitives' }
    ]);

    const result = resolveVariable('primitives.color.blue.500', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('color/blue/500');
  });

  it('strips core prefix via fallback resolution', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'spacing/md', collectionName: 'other' }
    ]);

    const result = resolveVariable('core.spacing.md', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('spacing/md');
  });

  it('strips tokens prefix via fallback resolution', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'radius/sm', collectionName: 'other' }
    ]);

    const result = resolveVariable('tokens.radius.sm', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('radius/sm');
  });

  it('matches on final segment with slash', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'colors/semantic/primary', collectionName: 'tokens' }
    ]);

    const result = resolveVariable('semantic.color.primary', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('colors/semantic/primary');
  });

  it('matches on final segment with dot', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'colors.semantic.default', collectionName: 'tokens' }
    ]);

    const result = resolveVariable('semantic.color.primary.default', variableMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('colors.semantic.default');
  });

  it('returns null with suggestions when not found', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'semantic/color/secondary', collectionName: 'tokens' },
      { name: 'semantic/color/tertiary', collectionName: 'tokens' }
    ]);

    const result = resolveVariable('semantic.color.primary', variableMap);
    expect(result.value).toBeNull();
    expect(result.suggestion).toBeTruthy();
    expect(result.availableNames).toHaveLength(2);
  });

  it('includes available names in result', () => {
    const variableMap = createIndexedVariableMap([
      { name: 'color/red', collectionName: 'tokens' },
      { name: 'color/blue', collectionName: 'tokens' }
    ]);

    const result = resolveVariable('color.green', variableMap);
    expect(result.value).toBeNull();
    expect(result.availableNames).toEqual(['color/red', 'color/blue']);
  });
});

describe('resolveTextStyle', () => {
  it('finds exact match', () => {
    const textStyleMap = createIndexedStyleMap(['typography.label-large']);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('typography.label-large');
  });

  it('converts dots to slashes', () => {
    const textStyleMap = createIndexedStyleMap(['typography/label-large']);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('typography/label-large');
  });

  it('capitalizes first letter', () => {
    const textStyleMap = createIndexedStyleMap(['Typography/label-large']);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('Typography/label-large');
  });

  it('strips typography prefix', () => {
    const textStyleMap = createIndexedStyleMap(['typography/label-large']);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('typography/label-large');
  });

  it('strips text prefix', () => {
    const textStyleMap = createIndexedStyleMap(['text/heading/h1']);

    const result = resolveTextStyle('text.heading.h1', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('text/heading/h1');
  });

  it('strips font prefix', () => {
    const textStyleMap = createIndexedStyleMap(['font/body/regular']);

    const result = resolveTextStyle('font.body.regular', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('font/body/regular');
  });

  it('works with capitalized style names', () => {
    const textStyleMap = createIndexedStyleMap(['Typography/Label-large']);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('Typography/Label-large');
  });

  it('matches on final segment', () => {
    const textStyleMap = createIndexedStyleMap(['Styles/Typography/label-large']);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).not.toBeNull();
    expect(result.value?.name).toBe('Styles/Typography/label-large');
  });

  it('returns null with suggestions when not found', () => {
    const textStyleMap = createIndexedStyleMap([
      'Typography/heading-1',
      'Typography/heading-2'
    ]);

    const result = resolveTextStyle('typography.label-large', textStyleMap);
    expect(result.value).toBeNull();
    expect(result.availableNames).toHaveLength(2);
  });
});

describe('formatResolutionError', () => {
  it('formats basic error message', () => {
    const result = {
      value: null,
      triedNames: ['semantic.color.primary'],
      availableNames: [],
      suggestion: null,
    };

    const message = formatResolutionError('semantic.color.primary', result, 'variable');
    expect(message).toContain("Variable 'semantic.color.primary' not found");
  });

  it('includes tried names when multiple', () => {
    const result = {
      value: null,
      triedNames: ['semantic.color.primary', 'semantic/color/primary', 'color.primary'],
      availableNames: [],
      suggestion: null,
    };

    const message = formatResolutionError('semantic.color.primary', result, 'variable');
    expect(message).toContain('Tried: semantic.color.primary, semantic/color/primary, color.primary');
  });

  it('includes suggestion when available', () => {
    const result = {
      value: null,
      triedNames: ['semantic.color.primary'],
      availableNames: ['semantic/color/secondary'],
      suggestion: 'semantic/color/secondary',
    };

    const message = formatResolutionError('semantic.color.primary', result, 'variable');
    expect(message).toContain('Did you mean: \'semantic/color/secondary\'');
  });

  it('shows all available names when 10 or fewer', () => {
    const result = {
      value: null,
      triedNames: ['color.red'],
      availableNames: ['color/blue', 'color/green'],
      suggestion: null,
    };

    const message = formatResolutionError('color.red', result, 'variable');
    expect(message).toContain('Available: color/blue, color/green');
  });

  it('shows first 5 when more than 10 available', () => {
    const result = {
      value: null,
      triedNames: ['color.red'],
      availableNames: [
        'color/a', 'color/b', 'color/c', 'color/d', 'color/e',
        'color/f', 'color/g', 'color/h', 'color/i', 'color/j', 'color/k'
      ],
      suggestion: null,
    };

    const message = formatResolutionError('color.red', result, 'variable');
    expect(message).toContain('Available (first 5)');
    expect(message).toContain('(11 total)');
  });

  it('uses correct label for text styles', () => {
    const result = {
      value: null,
      triedNames: ['typography.label'],
      availableNames: [],
      suggestion: null,
    };

    const message = formatResolutionError('typography.label', result, 'textStyle');
    expect(message).toContain("Text style 'typography.label' not found");
  });
});
