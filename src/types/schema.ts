// src/types/schema.ts

// ============ Layout Types ============

export type SizeValue = number | 'fill' | 'hug';

export type Direction = 'horizontal' | 'vertical';

export type AlignItems = 'center' | 'start' | 'end' | 'stretch';

export type JustifyContent = 'start' | 'center' | 'end' | 'space-between';

export interface LayoutProps {
  direction?: Direction;
  padding?: number;
  paddingToken?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  gap?: number;
  gapToken?: string;
  alignItems?: AlignItems;
  justifyContent?: JustifyContent;
  width?: SizeValue;
  height?: SizeValue;
}

export interface StyleProps {
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
  shadowToken?: string;
}

// ============ Node Types ============

export interface BaseNode {
  id: string;
  name: string;
}

export interface FrameNode extends BaseNode {
  nodeType: 'frame';
  layout?: LayoutProps;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
  shadowToken?: string;
  children?: ChildNode[];
}

export interface TextNode extends BaseNode {
  nodeType: 'text';
  text?: string;
  textStyleToken?: string;
  fillToken?: string;
}

export interface InstanceNode extends BaseNode {
  nodeType: 'instance';
  ref: string;
  variantProps?: Record<string, string>;
  overrides?: Record<string, { text?: string }>;
  layout?: Pick<LayoutProps, 'width' | 'height'>;
}

export interface RectangleNode extends BaseNode {
  nodeType: 'rectangle';
  layout?: Pick<LayoutProps, 'width' | 'height'>;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
}

export type ChildNode = FrameNode | TextNode | InstanceNode | RectangleNode;

// ============ Component Types ============

export interface ComponentBase extends StyleProps {
  layout: LayoutProps;
  children?: ChildNode[];
}

export interface Variant extends StyleProps {
  props: Record<string, string>;
}

export interface ComponentSetDefinition {
  id: string;
  name: string;
  description?: string;
  variantProps: string[];
  base: ComponentBase;
  variants: Variant[];
}

export interface ComponentDefinition extends StyleProps {
  id: string;
  name: string;
  description?: string;
  layout: LayoutProps;
  children?: ChildNode[];
}

// ============ Schema Root ============

export interface Schema {
  components?: ComponentDefinition[];
  componentSets?: ComponentSetDefinition[];
}

// ============ Validation Result ============

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
