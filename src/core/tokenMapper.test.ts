// src/core/tokenMapper.test.ts
import { describe, it, expect } from 'vitest';
import { extractTokens } from './tokenMapper';
import { Schema } from '../types/schema';

describe('extractTokens', () => {
  it('extracts fill tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        fillToken: 'color.primary'
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.primary')).toBe(true);
  });

  it('extracts stroke tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        strokeToken: 'color.border'
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.border')).toBe(true);
  });

  it('extracts radius tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        radiusToken: 'radius.md'
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('radius.md')).toBe(true);
  });

  it('extracts shadow tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        shadowToken: 'shadow.lg'
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('shadow.lg')).toBe(true);
  });

  it('extracts opacity tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        opacityToken: 'opacity.half'
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('opacity.half')).toBe(true);
  });

  it('extracts fillOpacity tokens from components', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        fillOpacityToken: 'opacity.subtle'
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('opacity.subtle')).toBe(true);
  });

  it('extracts tokens from nested children', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'frame',
          id: 'inner',
          name: 'Inner',
          fillToken: 'color.surface',
          children: [{
            nodeType: 'text',
            id: 'text',
            name: 'Text',
            textStyleToken: 'typography.body'
          }]
        }]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.surface')).toBe(true);
    expect(result.textStyles.has('typography.body')).toBe(true);
  });

  it('extracts tokens from componentSet variants', () => {
    const schema: Schema = {
      componentSets: [{
        id: 'btn',
        name: 'Button',
        variantProps: ['state'],
        base: { layout: {}, fillToken: 'color.base' },
        variants: [
          { props: { state: 'default' }, fillToken: 'color.default' },
          { props: { state: 'hover' }, fillToken: 'color.hover' }
        ]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.base')).toBe(true);
    expect(result.tokens.has('color.default')).toBe(true);
    expect(result.tokens.has('color.hover')).toBe(true);
  });

  it('handles empty schema', () => {
    const schema: Schema = {};
    const result = extractTokens(schema);
    expect(result.tokens.size).toBe(0);
    expect(result.textStyles.size).toBe(0);
  });

  it('returns empty warnings array', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        fillToken: 'color.primary'
      }]
    };

    const result = extractTokens(schema);

    expect(result.warnings).toHaveLength(0);
  });
});

describe('extractTokens layout tokens', () => {
  it('extracts padding token from layout', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          paddingToken: 'spacing.md'
        }
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('spacing.md')).toBe(true);
  });

  it('extracts individual padding tokens from layout', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          paddingTopToken: 'spacing.sm',
          paddingRightToken: 'spacing.md',
          paddingBottomToken: 'spacing.lg',
          paddingLeftToken: 'spacing.xl'
        }
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('spacing.sm')).toBe(true);
    expect(result.tokens.has('spacing.md')).toBe(true);
    expect(result.tokens.has('spacing.lg')).toBe(true);
    expect(result.tokens.has('spacing.xl')).toBe(true);
  });

  it('extracts gap token from layout', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {
          gapToken: 'spacing.gap'
        }
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('spacing.gap')).toBe(true);
  });

  it('extracts layout tokens from componentSet base', () => {
    const schema: Schema = {
      componentSets: [{
        id: 'btn',
        name: 'Button',
        variantProps: ['size'],
        base: {
          layout: {
            paddingToken: 'spacing.button',
            gapToken: 'spacing.icon-gap'
          }
        },
        variants: [
          { props: { size: 'sm' } }
        ]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('spacing.button')).toBe(true);
    expect(result.tokens.has('spacing.icon-gap')).toBe(true);
  });

  it('extracts layout tokens from nested frame children', () => {
    const schema: Schema = {
      components: [{
        id: 'card',
        name: 'Card',
        layout: {},
        children: [{
          nodeType: 'frame',
          id: 'content',
          name: 'Content',
          layout: {
            paddingToken: 'spacing.card-padding',
            gapToken: 'spacing.card-gap'
          }
        }]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('spacing.card-padding')).toBe(true);
    expect(result.tokens.has('spacing.card-gap')).toBe(true);
  });
});

describe('extractTokens child node types', () => {
  it('extracts tokens from text nodes', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'text',
          id: 'label',
          name: 'Label',
          fillToken: 'color.text',
          textStyleToken: 'typography.heading',
          opacityToken: 'opacity.text',
          fillOpacityToken: 'opacity.textFill'
        }]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.text')).toBe(true);
    expect(result.tokens.has('opacity.text')).toBe(true);
    expect(result.tokens.has('opacity.textFill')).toBe(true);
    expect(result.textStyles.has('typography.heading')).toBe(true);
  });

  it('extracts tokens from rectangle nodes', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'rectangle',
          id: 'rect',
          name: 'Rect',
          fillToken: 'color.rect-fill',
          strokeToken: 'color.rect-stroke',
          radiusToken: 'radius.rect',
          opacityToken: 'opacity.rect',
          fillOpacityToken: 'opacity.rectFill'
        }]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.rect-fill')).toBe(true);
    expect(result.tokens.has('color.rect-stroke')).toBe(true);
    expect(result.tokens.has('radius.rect')).toBe(true);
    expect(result.tokens.has('opacity.rect')).toBe(true);
    expect(result.tokens.has('opacity.rectFill')).toBe(true);
  });

  it('extracts tokens from ellipse nodes', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'ellipse',
          id: 'ellipse',
          name: 'Ellipse',
          fillToken: 'color.ellipse-fill',
          strokeToken: 'color.ellipse-stroke',
          opacityToken: 'opacity.ellipse',
          fillOpacityToken: 'opacity.ellipseFill'
        }]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.ellipse-fill')).toBe(true);
    expect(result.tokens.has('color.ellipse-stroke')).toBe(true);
    expect(result.tokens.has('opacity.ellipse')).toBe(true);
    expect(result.tokens.has('opacity.ellipseFill')).toBe(true);
  });

  it('extracts tokens from frame child with all style props', () => {
    const schema: Schema = {
      components: [{
        id: 'test',
        name: 'Test',
        layout: {},
        children: [{
          nodeType: 'frame',
          id: 'frame',
          name: 'Frame',
          fillToken: 'color.frame-fill',
          strokeToken: 'color.frame-stroke',
          radiusToken: 'radius.frame',
          shadowToken: 'shadow.frame'
        }]
      }]
    };

    const result = extractTokens(schema);

    expect(result.tokens.has('color.frame-fill')).toBe(true);
    expect(result.tokens.has('color.frame-stroke')).toBe(true);
    expect(result.tokens.has('radius.frame')).toBe(true);
    expect(result.tokens.has('shadow.frame')).toBe(true);
  });
});

describe('extractTokens deduplication', () => {
  it('does not duplicate tokens used multiple times', () => {
    const schema: Schema = {
      components: [
        {
          id: 'btn1',
          name: 'Button1',
          layout: {},
          fillToken: 'color.primary'
        },
        {
          id: 'btn2',
          name: 'Button2',
          layout: {},
          fillToken: 'color.primary'  // Same token
        }
      ]
    };

    const result = extractTokens(schema);

    // Set naturally deduplicates, just verify size
    expect(result.tokens.size).toBe(1);
    expect(result.tokens.has('color.primary')).toBe(true);
  });
});

describe('extractTokens componentSet children', () => {
  it('extracts tokens from componentSet base children', () => {
    const schema: Schema = {
      componentSets: [{
        id: 'btn',
        name: 'Button',
        variantProps: ['state'],
        base: {
          layout: {},
          children: [{
            nodeType: 'text',
            id: 'label',
            name: 'Label',
            textStyleToken: 'typography.button',
            fillToken: 'color.button-text'
          }]
        },
        variants: [
          { props: { state: 'default' } }
        ]
      }]
    };

    const result = extractTokens(schema);

    expect(result.textStyles.has('typography.button')).toBe(true);
    expect(result.tokens.has('color.button-text')).toBe(true);
  });
});
