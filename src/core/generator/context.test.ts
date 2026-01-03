// src/core/generator/context.test.ts
import { describe, it, expect } from 'vitest';
import { buildVariableLookupAliases, generateStyleKeys } from './context';

describe('buildVariableLookupAliases', () => {
  it('generates aliases for simple variable name', () => {
    const aliases = buildVariableLookupAliases('primary', 'colors');

    expect(aliases).toContain('colors/primary');
    expect(aliases).toContain('colors.primary');
    expect(aliases).toContain('primary');
  });

  it('handles nested variable paths with slash', () => {
    const aliases = buildVariableLookupAliases('blue/500', 'primitives/colors');

    // Original name normalized
    expect(aliases).toContain('blue/500');
    // With full collection prefix
    expect(aliases).toContain('primitives/colors/blue/500');
    expect(aliases).toContain('primitives/colors.blue/500');
    // Slash-to-dot conversion
    expect(aliases).toContain('blue.500');
    expect(aliases).toContain('primitives/colors/blue.500');
    // With last segment of collection (colors)
    expect(aliases).toContain('colors/blue/500');
    expect(aliases).toContain('colors.blue/500');
  });

  it('handles variable names with dots', () => {
    const aliases = buildVariableLookupAliases('spacing.md', 'tokens');

    // Original name
    expect(aliases).toContain('spacing.md');
    // With collection prefix
    expect(aliases).toContain('tokens/spacing.md');
    expect(aliases).toContain('tokens.spacing.md');
    // Dot-to-slash conversion
    expect(aliases).toContain('spacing/md');
    expect(aliases).toContain('tokens/spacing/md');
  });

  it('handles multi-segment collection names', () => {
    const aliases = buildVariableLookupAliases('sm', 'primitives/spacing');

    // Original name
    expect(aliases).toContain('sm');
    // Full collection path
    expect(aliases).toContain('primitives/spacing/sm');
    expect(aliases).toContain('primitives/spacing.sm');
    // Last segment only (spacing)
    expect(aliases).toContain('spacing/sm');
    expect(aliases).toContain('spacing.sm');
  });

  it('strips collection prefix from variable name if present (slash notation)', () => {
    const aliases = buildVariableLookupAliases('colors/primary', 'colors');

    expect(aliases).toContain('primary');
    expect(aliases).toContain('colors/primary');
  });

  it('strips collection prefix from variable name if present (dot notation)', () => {
    const aliases = buildVariableLookupAliases('colors.primary', 'colors');

    expect(aliases).toContain('primary');
    expect(aliases).toContain('colors.primary');
  });

  it('normalizes to lowercase', () => {
    const aliases = buildVariableLookupAliases('Primary', 'Colors');

    expect(aliases).toContain('primary');
    expect(aliases).toContain('colors/primary');
    expect(aliases).toContain('colors.primary');
  });

  it('handles complex nested paths in collection and variable', () => {
    const aliases = buildVariableLookupAliases('button/hover', 'semantic/colors');

    // Full paths
    expect(aliases).toContain('semantic/colors/button/hover');
    expect(aliases).toContain('colors/button/hover');
    // Dot conversions
    expect(aliases).toContain('button.hover');
  });
});

describe('generateStyleKeys', () => {
  it('generates keys for style name with slash', () => {
    const keys = generateStyleKeys('Heading/H1');

    expect(keys).toContain('heading/h1');
    expect(keys).toContain('heading.h1');
  });

  it('generates keys for style name with dots', () => {
    const keys = generateStyleKeys('Typography.Label');

    expect(keys).toContain('typography.label');
    expect(keys).toContain('typography/label');
  });

  it('strips typography prefix', () => {
    const keys = generateStyleKeys('typography/Body/Regular');

    expect(keys).toContain('body/regular');
    expect(keys).toContain('body.regular');
  });

  it('strips text prefix', () => {
    const keys = generateStyleKeys('text/heading');

    expect(keys).toContain('heading');
  });

  it('strips font prefix', () => {
    const keys = generateStyleKeys('font/body/small');

    expect(keys).toContain('body/small');
    expect(keys).toContain('body.small');
  });

  it('strips effects prefix', () => {
    const keys = generateStyleKeys('effects/shadow/md');

    expect(keys).toContain('shadow/md');
    expect(keys).toContain('shadow.md');
  });

  it('strips shadow prefix', () => {
    const keys = generateStyleKeys('shadow/lg');

    expect(keys).toContain('lg');
  });

  it('normalizes to lowercase', () => {
    const keys = generateStyleKeys('HEADING/H1');

    expect(keys).toContain('heading/h1');
    expect(keys).toContain('heading.h1');
  });

  it('handles simple style name without path', () => {
    const keys = generateStyleKeys('Label');

    expect(keys).toContain('label');
  });

  it('handles dot notation prefixes', () => {
    const keys = generateStyleKeys('typography.heading.large');

    expect(keys).toContain('typography.heading.large');
    expect(keys).toContain('typography/heading/large');
    expect(keys).toContain('heading.large');
    expect(keys).toContain('heading/large');
  });
});
