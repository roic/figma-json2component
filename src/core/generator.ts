// src/core/generator.ts
import type {
  Schema,
  ComponentDefinition,
  ComponentSetDefinition,
  ChildNode,
  LayoutProps,
  StyleProps,
  SizeValue,
} from '../types/schema';
import { resolveDependencies } from './resolver';

const PLUGIN_DATA_KEY = 'json2components.id';

interface GenerationContext {
  componentMap: Map<string, ComponentNode | ComponentSetNode>;
  variableMap: Map<string, Variable>;
  textStyleMap: Map<string, TextStyle>;
  warnings: string[];
}

export interface GenerateResult {
  success: boolean;
  warnings: string[];
  error?: string;
  createdCount: number;
}

export async function generateFromSchema(
  schema: Schema,
  selectedIds: string[]
): Promise<GenerateResult> {
  const warnings: string[] = [];

  // Resolve dependencies
  const depResult = resolveDependencies(schema);
  if (!depResult.success) {
    return { success: false, warnings: [], error: depResult.error, createdCount: 0 };
  }

  // Build context
  const context = await buildContext(warnings);

  // Filter to selected IDs and order by dependencies
  const selectedSet = new Set(selectedIds);
  const orderedIds = depResult.order.filter(id => selectedSet.has(id));

  // Create/update components in order
  let createdCount = 0;
  for (const id of orderedIds) {
    const compDef = schema.components?.find(c => c.id === id);
    const setDef = schema.componentSets?.find(s => s.id === id);

    if (setDef) {
      await createOrUpdateComponentSet(setDef, context);
      createdCount++;
    } else if (compDef) {
      await createOrUpdateComponent(compDef, context);
      createdCount++;
    }
  }

  // Position components in grid
  positionComponents(context.componentMap, orderedIds);

  return { success: true, warnings: context.warnings, createdCount };
}

async function buildContext(warnings: string[]): Promise<GenerationContext> {
  // Get existing components created by this plugin
  const componentMap = new Map<string, ComponentNode | ComponentSetNode>();
  const allComponents = figma.currentPage.findAll(n =>
    (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') &&
    n.getPluginData(PLUGIN_DATA_KEY)
  );
  allComponents.forEach(c => {
    const id = c.getPluginData(PLUGIN_DATA_KEY);
    if (id) componentMap.set(id, c as ComponentNode | ComponentSetNode);
  });

  // Get variables
  const variableMap = new Map<string, Variable>();
  const variables = await figma.variables.getLocalVariablesAsync();
  variables.forEach(v => variableMap.set(v.name, v));

  // Get text styles
  const textStyleMap = new Map<string, TextStyle>();
  const textStyles = await figma.getLocalTextStylesAsync();
  textStyles.forEach(s => textStyleMap.set(s.name, s));

  return { componentMap, variableMap, textStyleMap, warnings };
}

async function createOrUpdateComponent(
  def: ComponentDefinition,
  context: GenerationContext
): Promise<ComponentNode> {
  // Check if exists
  let comp = context.componentMap.get(def.id) as ComponentNode | undefined;

  if (comp && comp.type === 'COMPONENT') {
    // Clear existing children for full overwrite
    comp.children.forEach(c => c.remove());
  } else {
    // Create new
    comp = figma.createComponent();
    comp.setPluginData(PLUGIN_DATA_KEY, def.id);
    context.componentMap.set(def.id, comp);
  }

  comp.name = def.name;
  if (def.description) comp.description = def.description;

  // Apply layout
  applyLayout(comp, def.layout);

  // Apply styles
  await applyStyles(comp, def, context);

  // Create children
  if (def.children) {
    for (const childDef of def.children) {
      const child = await createChildNode(childDef, context);
      if (child) comp.appendChild(child);
    }
  }

  return comp;
}

async function createOrUpdateComponentSet(
  def: ComponentSetDefinition,
  context: GenerationContext
): Promise<ComponentSetNode> {
  // First, create all variant components
  const variantComponents: ComponentNode[] = [];

  for (const variant of def.variants) {
    const variantName = def.variantProps
      .map(prop => `${prop}=${variant.props[prop]}`)
      .join(', ');

    const comp = figma.createComponent();
    comp.name = variantName;

    // Apply base layout
    applyLayout(comp, def.base.layout);

    // Apply base styles, then variant overrides
    const mergedStyles: StyleProps = {
      ...def.base,
      ...variant,
    };
    await applyStyles(comp, mergedStyles, context);

    // Create children from base
    if (def.base.children) {
      for (const childDef of def.base.children) {
        const child = await createChildNode(childDef, context);
        if (child) comp.appendChild(child);
      }
    }

    variantComponents.push(comp);
  }

  // Combine into component set
  const existingSet = context.componentMap.get(def.id) as ComponentSetNode | undefined;
  if (existingSet && existingSet.type === 'COMPONENT_SET') {
    // Remove old set (will also remove its children)
    existingSet.remove();
  }

  const componentSet = figma.combineAsVariants(variantComponents, figma.currentPage);
  componentSet.name = def.name;
  if (def.description) componentSet.description = def.description;
  componentSet.setPluginData(PLUGIN_DATA_KEY, def.id);
  context.componentMap.set(def.id, componentSet);

  return componentSet;
}

async function createChildNode(
  def: ChildNode,
  context: GenerationContext
): Promise<SceneNode | null> {
  switch (def.nodeType) {
    case 'frame':
      return createFrameNode(def, context);
    case 'text':
      return createTextNode(def, context);
    case 'rectangle':
      return createRectangleNode(def, context);
    case 'instance':
      return createInstanceNode(def, context);
    default:
      return null;
  }
}

async function createFrameNode(
  def: Extract<ChildNode, { nodeType: 'frame' }>,
  context: GenerationContext
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = def.name;

  if (def.layout) applyLayout(frame, def.layout);
  await applyStyles(frame, def, context);

  if (def.children) {
    for (const childDef of def.children) {
      const child = await createChildNode(childDef, context);
      if (child) frame.appendChild(child);
    }
  }

  return frame;
}

async function createTextNode(
  def: Extract<ChildNode, { nodeType: 'text' }>,
  context: GenerationContext
): Promise<TextNode> {
  const text = figma.createText();
  text.name = def.name;

  // Load font before setting text
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  text.characters = def.text || '';

  // Apply text style
  if (def.textStyleToken) {
    const style = context.textStyleMap.get(def.textStyleToken);
    if (style) {
      text.textStyleId = style.id;
    } else {
      context.warnings.push(`Text style '${def.textStyleToken}' not found`);
    }
  }

  // Apply fill color
  if (def.fillToken) {
    const variable = context.variableMap.get(def.fillToken);
    if (variable) {
      text.setBoundVariable('fills', variable.id as unknown as VariableBindableField);
    } else {
      context.warnings.push(`Variable '${def.fillToken}' not found`);
    }
  }

  return text;
}

async function createRectangleNode(
  def: Extract<ChildNode, { nodeType: 'rectangle' }>,
  context: GenerationContext
): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  rect.name = def.name;

  // Apply sizing
  if (def.layout) {
    if (typeof def.layout.width === 'number') rect.resize(def.layout.width, rect.height);
    if (typeof def.layout.height === 'number') rect.resize(rect.width, def.layout.height);
  }

  await applyStyles(rect, def, context);

  return rect;
}

async function createInstanceNode(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  context: GenerationContext
): Promise<InstanceNode | null> {
  const target = context.componentMap.get(def.ref);

  if (!target) {
    context.warnings.push(`Component '${def.ref}' not found for instance`);
    return null;
  }

  let mainComponent: ComponentNode;

  if (target.type === 'COMPONENT_SET') {
    // Find specific variant
    if (def.variantProps) {
      const variantName = Object.entries(def.variantProps)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      const variant = target.findChild(c => c.name === variantName) as ComponentNode;
      if (variant) {
        mainComponent = variant;
      } else {
        // Use first variant
        mainComponent = target.children[0] as ComponentNode;
        context.warnings.push(`Variant '${variantName}' not found, using default`);
      }
    } else {
      mainComponent = target.children[0] as ComponentNode;
    }
  } else {
    mainComponent = target;
  }

  const instance = mainComponent.createInstance();

  // Apply sizing
  if (def.layout) {
    if (def.layout.width === 'fill') instance.layoutSizingHorizontal = 'FILL';
    else if (def.layout.width === 'hug') instance.layoutSizingHorizontal = 'HUG';
    else if (typeof def.layout.width === 'number') {
      instance.layoutSizingHorizontal = 'FIXED';
      instance.resize(def.layout.width, instance.height);
    }

    if (def.layout.height === 'fill') instance.layoutSizingVertical = 'FILL';
    else if (def.layout.height === 'hug') instance.layoutSizingVertical = 'HUG';
    else if (typeof def.layout.height === 'number') {
      instance.layoutSizingVertical = 'FIXED';
      instance.resize(instance.width, def.layout.height);
    }
  }

  // Apply text overrides
  if (def.overrides) {
    for (const [nodeId, override] of Object.entries(def.overrides)) {
      if (override.text !== undefined) {
        // Find text node by searching for one with matching pluginData or name
        const textNode = instance.findOne(n =>
          n.type === 'TEXT' && (n.name === nodeId || n.getPluginData('nodeId') === nodeId)
        ) as TextNode | null;
        if (textNode) {
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = override.text;
        }
      }
    }
  }

  return instance;
}

function applyLayout(node: FrameNode | ComponentNode, layout: LayoutProps): void {
  // Enable auto-layout
  node.layoutMode = layout.direction === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

  // Padding
  if (layout.padding !== undefined) {
    node.paddingTop = layout.padding;
    node.paddingRight = layout.padding;
    node.paddingBottom = layout.padding;
    node.paddingLeft = layout.padding;
  }
  if (layout.paddingTop !== undefined) node.paddingTop = layout.paddingTop;
  if (layout.paddingRight !== undefined) node.paddingRight = layout.paddingRight;
  if (layout.paddingBottom !== undefined) node.paddingBottom = layout.paddingBottom;
  if (layout.paddingLeft !== undefined) node.paddingLeft = layout.paddingLeft;

  // Gap
  if (layout.gap !== undefined) node.itemSpacing = layout.gap;

  // Alignment
  if (layout.alignItems) {
    const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'STRETCH'> = {
      start: 'MIN',
      center: 'CENTER',
      end: 'MAX',
      stretch: 'STRETCH',
    };
    node.counterAxisAlignItems = alignMap[layout.alignItems] || 'MIN';
  }

  if (layout.justifyContent) {
    const justifyMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
      start: 'MIN',
      center: 'CENTER',
      end: 'MAX',
      'space-between': 'SPACE_BETWEEN',
    };
    node.primaryAxisAlignItems = justifyMap[layout.justifyContent] || 'MIN';
  }

  // Sizing
  applySizing(node, layout.width, 'horizontal');
  applySizing(node, layout.height, 'vertical');
}

function applySizing(
  node: FrameNode | ComponentNode,
  size: SizeValue | undefined,
  axis: 'horizontal' | 'vertical'
): void {
  if (size === undefined) return;

  const prop = axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';

  if (size === 'fill') {
    node[prop] = 'FILL';
  } else if (size === 'hug') {
    node[prop] = 'HUG';
  } else {
    node[prop] = 'FIXED';
    if (axis === 'horizontal') {
      node.resize(size, node.height);
    } else {
      node.resize(node.width, size);
    }
  }
}

async function applyStyles(
  node: FrameNode | ComponentNode | RectangleNode,
  styles: StyleProps,
  context: GenerationContext
): Promise<void> {
  // Fill
  if (styles.fillToken) {
    const variable = context.variableMap.get(styles.fillToken);
    if (variable) {
      const fills = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
        'color',
        variable
      );
      node.fills = [fills];
    } else {
      context.warnings.push(`Variable '${styles.fillToken}' not found`);
    }
  }

  // Stroke
  if (styles.strokeToken) {
    const variable = context.variableMap.get(styles.strokeToken);
    if (variable) {
      const stroke = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
        'color',
        variable
      );
      node.strokes = [stroke];
    } else {
      context.warnings.push(`Variable '${styles.strokeToken}' not found`);
    }
  }
  if (styles.strokeWidth !== undefined) {
    node.strokeWeight = styles.strokeWidth;
  }

  // Radius (only for frames/components/rectangles)
  if (styles.radiusToken && 'cornerRadius' in node) {
    const variable = context.variableMap.get(styles.radiusToken);
    if (variable) {
      node.setBoundVariable('topLeftRadius', variable);
      node.setBoundVariable('topRightRadius', variable);
      node.setBoundVariable('bottomLeftRadius', variable);
      node.setBoundVariable('bottomRightRadius', variable);
    } else {
      context.warnings.push(`Variable '${styles.radiusToken}' not found`);
    }
  }

  // Shadow
  if (styles.shadowToken && 'effects' in node) {
    const variable = context.variableMap.get(styles.shadowToken);
    if (variable) {
      // Effect variables work differently - this is a simplified approach
      context.warnings.push(`Shadow token binding not yet implemented: ${styles.shadowToken}`);
    }
  }
}

function positionComponents(
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  orderedIds: string[]
): void {
  const SPACING = 100;
  const COLS = 4;

  let x = 0;
  let y = 0;
  let col = 0;
  let maxHeightInRow = 0;

  orderedIds.forEach(id => {
    const node = componentMap.get(id);
    if (!node) return;

    node.x = x;
    node.y = y;

    maxHeightInRow = Math.max(maxHeightInRow, node.height);
    col++;

    if (col >= COLS) {
      col = 0;
      x = 0;
      y += maxHeightInRow + SPACING;
      maxHeightInRow = 0;
    } else {
      x += node.width + SPACING;
    }
  });
}
