// src/core/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchema } from './parser';

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

  it('returns error for instance nodes without ref', () => {
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
    expect(result.errors.some(e => e.message.includes("'ref'"))).toBe(true);
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
