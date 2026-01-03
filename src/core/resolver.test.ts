// src/core/resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDependencies } from './resolver';
import type { Schema } from '../types/schema';

describe('resolveDependencies', () => {
  it('returns components in dependency order', () => {
    const schema: Schema = {
      components: [
        {
          id: 'chatbox',
          name: 'ChatBox',
          layout: { direction: 'horizontal' },
          children: [
            { nodeType: 'instance', id: 'btn', name: 'Btn', ref: 'button' }
          ]
        }
      ],
      componentSets: [
        {
          id: 'button',
          name: 'Button',
          variantProps: ['type'],
          base: { layout: { direction: 'horizontal' } },
          variants: [{ props: { type: 'primary' } }]
        }
      ]
    };

    const result = resolveDependencies(schema);

    expect(result.success).toBe(true);
    expect(result.order).toEqual(['button', 'chatbox']);
  });

  it('detects circular dependencies', () => {
    const schema: Schema = {
      components: [
        {
          id: 'a',
          name: 'A',
          layout: {},
          children: [{ nodeType: 'instance', id: 'i1', name: 'I1', ref: 'b' }]
        },
        {
          id: 'b',
          name: 'B',
          layout: {},
          children: [{ nodeType: 'instance', id: 'i2', name: 'I2', ref: 'a' }]
        }
      ]
    };

    const result = resolveDependencies(schema);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Circular');
  });

  it('handles components with no dependencies', () => {
    const schema: Schema = {
      components: [
        { id: 'a', name: 'A', layout: {} },
        { id: 'b', name: 'B', layout: {} }
      ]
    };

    const result = resolveDependencies(schema);

    expect(result.success).toBe(true);
    expect(result.order).toHaveLength(2);
  });
});

describe('resolveDependencies edge cases', () => {
  it('handles 5-level deep dependency chains', () => {
    const schema: Schema = {
      components: [
        { id: 'a', name: 'A', layout: {}, children: [
          { nodeType: 'instance', id: 'inst-b', name: 'B', ref: 'b' }
        ]},
        { id: 'b', name: 'B', layout: {}, children: [
          { nodeType: 'instance', id: 'inst-c', name: 'C', ref: 'c' }
        ]},
        { id: 'c', name: 'C', layout: {}, children: [
          { nodeType: 'instance', id: 'inst-d', name: 'D', ref: 'd' }
        ]},
        { id: 'd', name: 'D', layout: {}, children: [
          { nodeType: 'instance', id: 'inst-e', name: 'E', ref: 'e' }
        ]},
        { id: 'e', name: 'E', layout: {} },
      ]
    };

    const result = resolveDependencies(schema);

    expect(result.success).toBe(true);
    // e should come before d, d before c, etc.
    const order = result.order!;
    expect(order.indexOf('e')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('handles missing dependency references gracefully', () => {
    const schema: Schema = {
      components: [
        { id: 'a', name: 'A', layout: {}, children: [
          { nodeType: 'instance', name: 'Missing', ref: 'nonexistent' }
        ]}
      ]
    };

    const result = resolveDependencies(schema);

    // Should still succeed - missing refs are handled at generation time
    expect(result.success).toBe(true);
    expect(result.order).toContain('a');
  });
});
