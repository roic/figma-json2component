// src/core/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchema, parseSchemas } from './parser';

describe('parseSchema', () => {
  it('parses valid minimal schema', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: { direction: 'horizontal' }
      }]
    });

    const result = parseSchema(json);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.schema?.components).toHaveLength(1);
  });
});

describe('parseSchema error handling', () => {
  it('returns error for invalid JSON', () => {
    const result = parseSchema('not valid json');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('JSON parse error');
  });

  it('returns error for missing required id', () => {
    const json = JSON.stringify({
      components: [{
        name: 'Test',
        layout: { direction: 'horizontal' }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("'id'");
  });

  it('returns error for duplicate ids', () => {
    const json = JSON.stringify({
      components: [
        { id: 'same', name: 'Test1', layout: {} },
        { id: 'same', name: 'Test2', layout: {} }
      ]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('returns error for padding/paddingToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: { padding: 8, paddingToken: 'spacing.md' }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('padding');
  });
});

describe('parseSchema componentSets', () => {
  it('parses valid componentSet', () => {
    const json = JSON.stringify({
      componentSets: [{
        id: 'button',
        name: 'Button',
        variantProps: ['type', 'state'],
        base: {
          layout: { direction: 'horizontal' },
          children: []
        },
        variants: [
          { props: { type: 'primary', state: 'default' }, fillToken: 'color.primary' }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.schema?.componentSets).toHaveLength(1);
  });

  it('returns error for invalid children in componentSet base', () => {
    const json = JSON.stringify({
      componentSets: [{
        id: 'button',
        name: 'Button',
        variantProps: ['type'],
        base: {
          layout: { direction: 'horizontal' },
          children: [
            { nodeType: 'text', name: 'Label' } // missing id
          ]
        },
        variants: [{ props: { type: 'primary' } }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("'id'"))).toBe(true);
  });

  it('returns error for componentSet with empty variants array', () => {
    const json = JSON.stringify({
      componentSets: [{
        id: 'button',
        name: 'Button',
        variantProps: ['type'],
        base: {
          layout: { direction: 'horizontal' }
        },
        variants: []
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('at least one variant'))).toBe(true);
  });
});

describe('parseSchema child nodes', () => {
  it('validates instance nodes without id (id is optional)', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: { direction: 'vertical' },
        children: [
          {
            nodeType: 'instance',
            name: 'Button',
            ref: 'button'
          }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates instance nodes with id', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: { direction: 'vertical' },
        children: [
          {
            nodeType: 'instance',
            id: 'btn-1',
            name: 'Button',
            ref: 'button'
          }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for non-instance nodes without id', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: { direction: 'vertical' },
        children: [
          {
            nodeType: 'text',
            name: 'Title',
            text: 'Hello'
          }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("'id'"))).toBe(true);
  });

  it('returns error for instance nodes without ref or componentKey', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: { direction: 'vertical' },
        children: [
          {
            nodeType: 'instance',
            name: 'Button'
          }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("'ref'") && e.message.includes("'componentKey'"))).toBe(true);
  });

  it('validates frame nodes with nested children', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: { direction: 'vertical' },
        children: [
          {
            nodeType: 'frame',
            id: 'inner-frame',
            name: 'InnerFrame',
            children: [
              {
                nodeType: 'text',
                id: 'nested-text',
                name: 'NestedText',
                text: 'Hello'
              }
            ]
          }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for invalid nodeType', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [
          {
            nodeType: 'invalid',
            id: 'test',
            name: 'Test'
          }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Invalid nodeType'))).toBe(true);
  });
});

describe('parseSchema edge cases', () => {
  it('returns error for non-object schema', () => {
    const result = parseSchema('"just a string"');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('must be an object');
  });

  it('returns error for null schema', () => {
    const result = parseSchema('null');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('must be an object');
  });

  it('handles empty schema (no components or componentSets)', () => {
    const result = parseSchema('{}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for gap/gapToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: { gap: 8, gapToken: 'spacing.md' }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('gap'))).toBe(true);
  });
});

describe('parseSchema opacity validation', () => {
  it('returns error for opacity/opacityToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        opacity: 0.5,
        opacityToken: 'opacity.half'
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('opacity'))).toBe(true);
  });

  it('returns error for fillOpacity/fillOpacityToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        fillOpacity: 0.5,
        fillOpacityToken: 'opacity.half'
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('fillOpacity'))).toBe(true);
  });

  it('returns error for opacity out of range (below 0)', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        opacity: -0.5
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('opacity must be between 0 and 1'))).toBe(true);
  });

  it('returns error for opacity out of range (above 1)', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        opacity: 1.5
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('opacity must be between 0 and 1'))).toBe(true);
  });

  it('returns error for fillOpacity out of range', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        fillOpacity: 2
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('fillOpacity must be between 0 and 1'))).toBe(true);
  });

  it('accepts valid opacity values', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        opacity: 0.5,
        fillOpacity: 0.8
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates opacity in child nodes', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'text',
          id: 'label',
          name: 'Label',
          opacity: 1.5  // invalid
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('opacity must be between 0 and 1'))).toBe(true);
  });

  it('validates opacity in componentSet variants', () => {
    const json = JSON.stringify({
      componentSets: [{
        id: 'button',
        name: 'Button',
        variantProps: ['state'],
        base: {
          layout: {}
        },
        variants: [
          { props: { state: 'disabled' }, opacity: 0.5, opacityToken: 'opacity.half' }
        ]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('opacity'))).toBe(true);
  });
});

describe('parseSchema layout wrap and padding tokens', () => {
  it('returns error for wrap not boolean', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          wrap: "true"  // Should be boolean, not string
        }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('wrap must be a boolean'))).toBe(true);
  });

  it('accepts wrap as boolean', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          wrap: true
        }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for paddingTop/paddingTopToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          paddingTop: 8,
          paddingTopToken: 'spacing.sm'
        }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('paddingTop'))).toBe(true);
  });

  it('returns error for paddingLeft/paddingLeftToken conflict', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          paddingLeft: 12,
          paddingLeftToken: 'spacing.md'
        }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('paddingLeft'))).toBe(true);
  });

  it('accepts all padding tokens', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          paddingTopToken: 'spacing.sm',
          paddingRightToken: 'spacing.md',
          paddingBottomToken: 'spacing.sm',
          paddingLeftToken: 'spacing.md'
        }
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('parseSchema instance componentKey validation', () => {
  it('validates instance with componentKey (no ref required)', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'SearchIcon',
          componentKey: 'abc123def456'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('returns error when instance has neither ref nor componentKey', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('ref') && e.message.includes('componentKey'))).toBe(true);
  });

  it('returns error when instance has both ref and componentKey', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          ref: 'button',
          componentKey: 'abc123'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('can only have one'))).toBe(true);
  });
});

describe('parseSchema iconRef validation', () => {
  it('validates instance with iconRef', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'SearchIcon',
          iconRef: 'lucide:search'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('returns error for invalid iconRef format', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          iconRef: 'lucide-search'  // Missing colon
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('iconRef'))).toBe(true);
  });

  it('returns error when instance has multiple reference types', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          ref: 'button',
          iconRef: 'lucide:search'
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('can only have one'))).toBe(true);
  });
});

describe('parseSchema strokeDash validation', () => {
  it('returns error for strokeDash not array', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        strokeDash: "4, 4"  // Should be array
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('strokeDash must be an array'))).toBe(true);
  });

  it('returns error for strokeDash array with non-numbers', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        strokeDash: [4, "4"]  // Mixed types
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('strokeDash must be an array of numbers'))).toBe(true);
  });

  it('accepts valid strokeDash array', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        strokeDash: [4, 4]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates strokeDash in child rectangles', () => {
    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'rectangle',
          id: 'rect',
          name: 'Rect',
          strokeDash: "invalid"  // Not an array
        }]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('strokeDash must be an array'))).toBe(true);
  });
});

describe('parseSchema depth limits', () => {
  it('rejects schema exceeding max nesting depth', () => {
    // Build a deeply nested structure (51 levels)
    let nested: any = { nodeType: 'text', id: 'deep', name: 'Deep' };
    for (let i = 0; i < 51; i++) {
      nested = {
        nodeType: 'frame',
        id: `frame-${i}`,
        name: `Frame ${i}`,
        children: [nested]
      };
    }

    const json = JSON.stringify({
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [nested]
      }]
    });

    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('depth'))).toBe(true);
  });
});

describe('parseSchemas multi-file', () => {
  it('merges components from multiple files', () => {
    const file1 = JSON.stringify({
      components: [{ id: 'btn', name: 'Button', layout: {} }]
    });
    const file2 = JSON.stringify({
      components: [{ id: 'card', name: 'Card', layout: {} }]
    });

    const result = parseSchemas([file1, file2]);

    expect(result.valid).toBe(true);
    expect(result.schema?.components).toHaveLength(2);
  });

  it('detects duplicate IDs across files', () => {
    const file1 = JSON.stringify({
      components: [{ id: 'btn', name: 'Button', layout: {} }]
    });
    const file2 = JSON.stringify({
      components: [{ id: 'btn', name: 'Button2', layout: {} }]
    });

    const result = parseSchemas([file1, file2]);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('separates registries from schemas', () => {
    const schema = JSON.stringify({
      components: [{ id: 'btn', name: 'Button', layout: {} }]
    });
    const registry = JSON.stringify({
      type: 'icon-registry',
      library: 'lucide',
      figmaLibraryName: 'Lucide',
      icons: { search: 'key123' }
    });

    const result = parseSchemas([schema, registry]);

    expect(result.valid).toBe(true);
    expect(result.schema?.components).toHaveLength(1);
    expect(result.registries).toHaveLength(1);
    expect(result.registries[0].library).toBe('lucide');
  });
});

describe('new feature validation', () => {
  it('accepts valid linear gradient', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          angle: 90,
          stops: [
            { position: 0, color: '#FF0000' },
            { position: 1, color: '#0000FF' }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('accepts valid radial gradient', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'radial',
          stops: [
            { position: 0, color: '#FF0000' },
            { position: 0.5, colorToken: 'colors.primary' },
            { position: 1, color: '#0000FF' }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('rejects gradient with invalid type', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'conic',
          stops: [
            { position: 0, color: '#FF0000' },
            { position: 1, color: '#0000FF' }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("'linear' or 'radial'"))).toBe(true);
  });

  it('rejects gradient with less than 2 stops', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          stops: [{ position: 0, color: '#FF0000' }]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('2 stops'))).toBe(true);
  });

  it('rejects gradient stop with invalid position', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          stops: [
            { position: -0.5, color: '#FF0000' },
            { position: 1, color: '#0000FF' }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('position must be 0-1'))).toBe(true);
  });

  it('rejects gradient stop without color or colorToken', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          stops: [
            { position: 0, color: '#FF0000' },
            { position: 1 }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('color or colorToken'))).toBe(true);
  });

  it('rejects invalid strokeAlign', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        strokeAlign: 'invalid'
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("strokeAlign must be 'inside', 'center', or 'outside'"))).toBe(true);
  });

  it('accepts valid strokeAlign values', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        strokeAlign: 'inside'
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('rejects strokeSides that is not an array', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        strokeSides: 'top'
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('strokeSides must be an array'))).toBe(true);
  });

  it('rejects invalid strokeSides values', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        strokeSides: ['top', 'invalid', 'bottom']
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Invalid strokeSide: invalid'))).toBe(true);
  });

  it('accepts valid strokeSides array', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        strokeSides: ['top', 'bottom']
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('rejects multiple swap overrides', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          ref: 'icon',
          overrides: {
            nested: { swap: 'lucide:check', swapRef: 'other' }
          }
        }]
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Only one'))).toBe(true);
  });

  it('accepts single swap override', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          ref: 'icon',
          overrides: {
            nested: { swap: 'lucide:check' }
          }
        }]
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('accepts override with swapComponentKey', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'instance',
          name: 'Icon',
          ref: 'icon',
          overrides: {
            nested: { swapComponentKey: 'abc123' }
          }
        }]
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(true);
  });

  it('validates gradient in child frame nodes', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'frame',
          id: 'inner',
          name: 'Inner',
          fill: {
            type: 'invalid',
            stops: [{ position: 0, color: '#FF0000' }]
          }
        }]
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("'linear' or 'radial'"))).toBe(true);
  });

  it('rejects gradient stop with position greater than 1', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear',
          stops: [
            { position: 0, color: '#FF0000' },
            { position: 1.5, color: '#0000FF' }
          ]
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('0-1'))).toBe(true);
  });

  it('rejects gradient with missing stops array', () => {
    const json = JSON.stringify({
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        fill: {
          type: 'linear'
        }
      }]
    });
    const result = parseSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('2 stops'))).toBe(true);
  });
});
