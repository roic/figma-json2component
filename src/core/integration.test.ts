// src/core/integration.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchema, parseSchemas } from './parser';
import { resolveDependencies } from './resolver';
import { extractTokens } from './tokenMapper';

describe('Integration: Full Pipeline', () => {
  it('parses, resolves, and extracts tokens from a complete schema', () => {
    const json = JSON.stringify({
      components: [
        {
          id: 'card',
          name: 'Card',
          layout: { direction: 'vertical', padding: 16 },
          fillToken: 'color.surface',
          children: [
            {
              nodeType: 'text',
              id: 'title',
              name: 'Title',
              textStyleToken: 'typography.heading'
            },
            {
              nodeType: 'instance',
              name: 'Button',
              ref: 'button'
            }
          ]
        },
        {
          id: 'button',
          name: 'Button',
          layout: { direction: 'horizontal' },
          fillToken: 'color.primary'
        }
      ]
    });

    // Parse
    const parseResult = parseSchema(json);
    expect(parseResult.valid).toBe(true);
    expect(parseResult.schema).toBeDefined();

    // Resolve dependencies
    const resolveResult = resolveDependencies(parseResult.schema!);
    expect(resolveResult.success).toBe(true);
    expect(resolveResult.order).toContain('button');
    expect(resolveResult.order).toContain('card');
    // Button should come before card (it's a dependency)
    expect(resolveResult.order.indexOf('button')).toBeLessThan(
      resolveResult.order.indexOf('card')
    );

    // Extract tokens
    const tokens = extractTokens(parseResult.schema!);
    expect(tokens.tokens.has('color.surface')).toBe(true);
    expect(tokens.tokens.has('color.primary')).toBe(true);
    expect(tokens.textStyles.has('typography.heading')).toBe(true);
  });

  it('handles multi-file parsing with registries', () => {
    const componentFile = JSON.stringify({
      components: [
        {
          id: 'icon-btn',
          name: 'IconButton',
          layout: {},
          children: [
            { nodeType: 'instance', id: 'icon', name: 'Icon', iconRef: 'lucide:search' }
          ]
        }
      ]
    });

    const registryFile = JSON.stringify({
      type: 'icon-registry',
      library: 'lucide',
      figmaLibraryName: 'Lucide Icons',
      icons: { search: 'key123' }
    });

    const result = parseSchemas([componentFile, registryFile]);

    expect(result.valid).toBe(true);
    expect(result.schema?.components).toHaveLength(1);
    expect(result.registries).toHaveLength(1);
    expect(result.registries[0].icons.search).toBe('key123');
  });

  it('handles complex nested structures with multiple token types', () => {
    const json = JSON.stringify({
      components: [
        {
          id: 'complex-card',
          name: 'ComplexCard',
          layout: {
            direction: 'vertical',
            paddingToken: 'space.md',
            gapToken: 'space.sm'
          },
          fillToken: 'color.background',
          strokeToken: 'color.border',
          radiusToken: 'radius.lg',
          children: [
            {
              nodeType: 'frame',
              id: 'header',
              name: 'Header',
              layout: { direction: 'horizontal' },
              fillToken: 'color.header-bg',
              children: [
                {
                  nodeType: 'text',
                  id: 'heading',
                  name: 'Heading',
                  textStyleToken: 'typography.h2',
                  fillToken: 'color.text-primary'
                }
              ]
            },
            {
              nodeType: 'rectangle',
              id: 'divider',
              name: 'Divider',
              fillToken: 'color.divider'
            },
            {
              nodeType: 'text',
              id: 'body',
              name: 'Body',
              textStyleToken: 'typography.body'
            }
          ]
        }
      ]
    });

    // Parse
    const parseResult = parseSchema(json);
    expect(parseResult.valid).toBe(true);

    // Extract tokens
    const tokens = extractTokens(parseResult.schema!);

    // Layout tokens
    expect(tokens.tokens.has('space.md')).toBe(true);
    expect(tokens.tokens.has('space.sm')).toBe(true);

    // Style tokens
    expect(tokens.tokens.has('color.background')).toBe(true);
    expect(tokens.tokens.has('color.border')).toBe(true);
    expect(tokens.tokens.has('radius.lg')).toBe(true);
    expect(tokens.tokens.has('color.header-bg')).toBe(true);
    expect(tokens.tokens.has('color.text-primary')).toBe(true);
    expect(tokens.tokens.has('color.divider')).toBe(true);

    // Text styles
    expect(tokens.textStyles.has('typography.h2')).toBe(true);
    expect(tokens.textStyles.has('typography.body')).toBe(true);
  });

  it('handles componentSets with variants in the full pipeline', () => {
    const json = JSON.stringify({
      componentSets: [
        {
          id: 'btn-set',
          name: 'Button',
          variantProps: ['variant', 'size'],
          base: {
            layout: { direction: 'horizontal', paddingToken: 'space.button' },
            fillToken: 'color.button-default',
            radiusToken: 'radius.button',
            children: [
              {
                nodeType: 'text',
                id: 'label',
                name: 'Label',
                textStyleToken: 'typography.button'
              }
            ]
          },
          variants: [
            {
              props: { variant: 'primary', size: 'md' },
              fillToken: 'color.primary'
            },
            {
              props: { variant: 'secondary', size: 'md' },
              fillToken: 'color.secondary'
            }
          ]
        }
      ]
    });

    // Parse
    const parseResult = parseSchema(json);
    expect(parseResult.valid).toBe(true);
    expect(parseResult.schema?.componentSets).toHaveLength(1);

    // Resolve (should work even with no dependencies)
    const resolveResult = resolveDependencies(parseResult.schema!);
    expect(resolveResult.success).toBe(true);
    expect(resolveResult.order).toContain('btn-set');

    // Extract tokens
    const tokens = extractTokens(parseResult.schema!);

    // Base tokens
    expect(tokens.tokens.has('space.button')).toBe(true);
    expect(tokens.tokens.has('color.button-default')).toBe(true);
    expect(tokens.tokens.has('radius.button')).toBe(true);
    expect(tokens.textStyles.has('typography.button')).toBe(true);

    // Variant tokens
    expect(tokens.tokens.has('color.primary')).toBe(true);
    expect(tokens.tokens.has('color.secondary')).toBe(true);
  });

  it('handles empty schema gracefully', () => {
    const json = JSON.stringify({
      components: [],
      componentSets: []
    });

    const parseResult = parseSchema(json);
    // Empty schema is valid but should have warnings
    expect(parseResult.valid).toBe(true);
    expect(parseResult.warnings.length).toBeGreaterThan(0);

    const resolveResult = resolveDependencies(parseResult.schema!);
    expect(resolveResult.success).toBe(true);
    expect(resolveResult.order).toHaveLength(0);

    const tokens = extractTokens(parseResult.schema!);
    expect(tokens.tokens.size).toBe(0);
    expect(tokens.textStyles.size).toBe(0);
  });

  it('catches validation errors before reaching resolve step', () => {
    const json = JSON.stringify({
      components: [
        {
          // Missing required 'id' and 'name'
          layout: { direction: 'horizontal' }
        }
      ]
    });

    const parseResult = parseSchema(json);
    expect(parseResult.valid).toBe(false);
    expect(parseResult.errors.length).toBeGreaterThan(0);
    expect(parseResult.schema).toBeUndefined();
  });
});
