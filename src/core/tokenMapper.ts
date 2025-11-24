// src/core/tokenMapper.ts
import type { Schema, ChildNode, ComponentBase, StyleProps } from '../types/schema';

export interface TokenWarning {
  token: string;
  type: 'variable' | 'textStyle';
  path: string;
}

export interface TokenMapResult {
  warnings: TokenWarning[];
  tokens: Set<string>;
  textStyles: Set<string>;
}

/**
 * Extracts all token references from a schema.
 * Actual resolution to Figma variables/styles happens at generation time.
 */
export function extractTokens(schema: Schema): TokenMapResult {
  const tokens = new Set<string>();
  const textStyles = new Set<string>();

  // Extract from components
  schema.components?.forEach(comp => {
    extractFromStyleProps(comp, tokens);
    extractLayoutTokens(comp.layout, tokens);
    comp.children?.forEach(child => extractFromChildNode(child, tokens, textStyles));
  });

  // Extract from componentSets
  schema.componentSets?.forEach(set => {
    extractFromStyleProps(set.base, tokens);
    extractLayoutTokens(set.base.layout, tokens);
    set.base.children?.forEach(child => extractFromChildNode(child, tokens, textStyles));
    set.variants.forEach(v => extractFromStyleProps(v, tokens));
  });

  return { warnings: [], tokens, textStyles };
}

function extractFromStyleProps(props: StyleProps, tokens: Set<string>): void {
  if (props.fillToken) tokens.add(props.fillToken);
  if (props.strokeToken) tokens.add(props.strokeToken);
  if (props.radiusToken) tokens.add(props.radiusToken);
  if (props.shadowToken) tokens.add(props.shadowToken);
}

function extractLayoutTokens(layout: { paddingToken?: string; gapToken?: string } | undefined, tokens: Set<string>): void {
  if (!layout) return;
  if (layout.paddingToken) tokens.add(layout.paddingToken);
  if (layout.gapToken) tokens.add(layout.gapToken);
}

function extractFromChildNode(node: ChildNode, tokens: Set<string>, textStyles: Set<string>): void {
  if (node.nodeType === 'text') {
    if (node.fillToken) tokens.add(node.fillToken);
    if (node.textStyleToken) textStyles.add(node.textStyleToken);
  } else if (node.nodeType === 'frame') {
    extractFromStyleProps(node, tokens);
    extractLayoutTokens(node.layout, tokens);
    node.children?.forEach(child => extractFromChildNode(child, tokens, textStyles));
  } else if (node.nodeType === 'rectangle') {
    if (node.fillToken) tokens.add(node.fillToken);
    if (node.strokeToken) tokens.add(node.strokeToken);
    if (node.radiusToken) tokens.add(node.radiusToken);
  }
}
