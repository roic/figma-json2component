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
  paddingTopToken?: string;
  paddingRight?: number;
  paddingRightToken?: string;
  paddingBottom?: number;
  paddingBottomToken?: string;
  paddingLeft?: number;
  paddingLeftToken?: string;
  gap?: number;
  gapToken?: string;
  wrap?: boolean;
  alignItems?: AlignItems;
  justifyContent?: JustifyContent;
  width?: SizeValue;
  height?: SizeValue;
}

export interface StyleProps {
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  strokeDash?: number[];
  radiusToken?: string;
  shadowToken?: string;
  opacity?: number;
  opacityToken?: string;
  fillOpacity?: number;
  fillOpacityToken?: string;
}

// ============ Node Types ============

export interface BaseNode {
  id: string;
  name: string;
}

export type ImageScaleMode = 'FILL' | 'FIT' | 'CROP' | 'TILE';

export interface FrameNode extends BaseNode {
  nodeType: 'frame';
  layout?: LayoutProps;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  radiusToken?: string;
  shadowToken?: string;
  imageUrl?: string;
  imageScaleMode?: ImageScaleMode;
  children?: ChildNode[];
}

export interface TextNode extends BaseNode {
  nodeType: 'text';
  text?: string;
  textStyleToken?: string;
  fillToken?: string;
  opacity?: number;
  opacityToken?: string;
  fillOpacity?: number;
  fillOpacityToken?: string;
}

export interface InstanceNode {
  nodeType: 'instance';
  id?: string;
  name: string;
  ref?: string;           // Local component reference
  componentKey?: string;  // Published library component key
  iconRef?: string;       // Icon library reference (e.g., "lucide:search")
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
  strokeDash?: number[];
  radiusToken?: string;
  opacity?: number;
  opacityToken?: string;
  fillOpacity?: number;
  fillOpacityToken?: string;
  imageUrl?: string;
  imageScaleMode?: ImageScaleMode;
}

export interface EllipseNode extends BaseNode {
  nodeType: 'ellipse';
  layout?: Pick<LayoutProps, 'width' | 'height'>;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  strokeDash?: number[];
  opacity?: number;
  opacityToken?: string;
  fillOpacity?: number;
  fillOpacityToken?: string;
}

export type ChildNode = FrameNode | TextNode | InstanceNode | RectangleNode | EllipseNode;

// ============ Component Types ============

export interface ComponentBase extends StyleProps {
  layout: LayoutProps;
  children?: ChildNode[];
}

export interface Variant extends StyleProps {
  props: Record<string, string>;
  layout?: Partial<LayoutProps>;  // Variants can override layout properties
}

export interface ComponentSetDefinition {
  id: string;
  name: string;
  description?: string;
  storybook?: string;
  category?: string;
  tags?: string[];
  variantProps: string[];
  base: ComponentBase;
  variants: Variant[];
}

export interface ComponentDefinition extends StyleProps {
  id: string;
  name: string;
  description?: string;
  storybook?: string;
  category?: string;
  tags?: string[];
  layout: LayoutProps;
  children?: ChildNode[];
}

// ============ Organization Configuration ============

export interface Organization {
  // Phase 1: Core options
  groupBy?: 'category' | 'tags' | 'none';  // How to group components (default: 'category')
  layout?: 'frames' | 'pages' | 'grid';     // Where to place groups (default: 'frames')
  gridColumns?: number;                      // Columns in grid layout (default: 4)
  spacing?: number;                          // Spacing between components (default: 100)

  // Phase 2: Advanced options
  sortBy?: 'alphabetical' | 'schema-order';  // How to sort within groups (default: 'schema-order')
  frameLabels?: boolean;                     // Show category labels on frames (default: true)
  pagePrefixes?: boolean;                    // Prefix page names with "Components/" (default: false)
}

// ============ Schema Root ============

export interface Schema {
  organization?: Organization;
  components?: ComponentDefinition[];
  componentSets?: ComponentSetDefinition[];
}

// ============ Validation Result ============

// Re-export ValidationError from errors.ts for backward compatibility
export type { ValidationError } from '../core/errors';

export interface ValidationResult {
  valid: boolean;
  errors: import('../core/errors').ValidationError[];
  warnings: import('../core/errors').ValidationError[];
}
