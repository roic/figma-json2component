// src/core/generator/layout.ts
import type {
  Schema,
  ComponentDefinition,
  ComponentSetDefinition,
  LayoutProps,
  SizeValue,
  Organization,
} from '../../types/schema';
import { resolveVariable, formatResolutionError, validateVariableType } from '../tokenResolver';
import { GenerationContext } from './types';

/**
 * Apply padding with optional token binding.
 */
export async function applyPaddingWithToken(
  node: FrameNode | ComponentNode,
  paddingField: 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft',
  tokenValue: string | undefined,
  rawValue: number | undefined,
  context: GenerationContext
): Promise<void> {
  if (tokenValue) {
    const result = resolveVariable(tokenValue, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', tokenValue, `${paddingField}Token`);
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable(paddingField, result.value);
        return;
      }
    } else {
      context.warnings.push(formatResolutionError(tokenValue, result, 'variable'));
    }
  }

  if (typeof rawValue === 'number') {
    node[paddingField] = rawValue;
  }
}

/**
 * Apply layout properties (auto-layout, padding, gap, alignment, sizing) to a node.
 */
export async function applyLayout(
  node: FrameNode | ComponentNode,
  layout: LayoutProps,
  context: GenerationContext
): Promise<void> {
  // Enable auto-layout
  node.layoutMode = layout.direction === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';

  // Padding - use token if available, otherwise raw value
  if (layout.paddingToken) {
    const result = resolveVariable(layout.paddingToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', layout.paddingToken, 'paddingToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('paddingTop', result.value);
        node.setBoundVariable('paddingRight', result.value);
        node.setBoundVariable('paddingBottom', result.value);
        node.setBoundVariable('paddingLeft', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(layout.paddingToken, result, 'variable'));
    }
  } else if (layout.padding !== undefined) {
    node.paddingTop = layout.padding;
    node.paddingRight = layout.padding;
    node.paddingBottom = layout.padding;
    node.paddingLeft = layout.padding;
  }

  // Individual padding values - token takes priority over raw value
  await applyPaddingWithToken(node, 'paddingTop', layout.paddingTopToken, layout.paddingTop, context);
  await applyPaddingWithToken(node, 'paddingRight', layout.paddingRightToken, layout.paddingRight, context);
  await applyPaddingWithToken(node, 'paddingBottom', layout.paddingBottomToken, layout.paddingBottom, context);
  await applyPaddingWithToken(node, 'paddingLeft', layout.paddingLeftToken, layout.paddingLeft, context);

  // Gap - token takes priority over raw value
  if (layout.gapToken) {
    const result = resolveVariable(layout.gapToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', layout.gapToken, 'gapToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('itemSpacing', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(layout.gapToken, result, 'variable'));
    }
  } else if (layout.gap !== undefined) {
    node.itemSpacing = layout.gap;
  }

  // Wrap
  if (layout.wrap !== undefined) {
    node.layoutWrap = layout.wrap ? 'WRAP' : 'NO_WRAP';
  }

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

/**
 * Apply sizing (fixed, fill, hug) to a single axis.
 */
function applySizing(
  node: FrameNode | ComponentNode,
  size: SizeValue | undefined,
  axis: 'horizontal' | 'vertical'
): void {
  if (size === undefined) return;

  const prop = axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';

  if (size === 'fill') {
    // FILL can only be set on children of auto-layout frames
    // Check if node has a parent with auto-layout enabled
    const parent = node.parent;
    const hasAutoLayoutParent = parent && 'layoutMode' in parent && parent.layoutMode !== 'NONE';

    if (hasAutoLayoutParent) {
      node[prop] = 'FILL';
    } else {
      // For top-level components, use HUG instead of FILL
      node[prop] = 'HUG';
    }
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

/**
 * Position generated components on the canvas according to organization config.
 */
export async function positionComponents(
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  orderedIds: string[],
  schema: Schema
): Promise<void> {
  // Get organization config with defaults
  const org: Required<Organization> = {
    groupBy: schema.organization?.groupBy ?? 'category',
    layout: schema.organization?.layout ?? 'frames',
    gridColumns: schema.organization?.gridColumns ?? 4,
    spacing: schema.organization?.spacing ?? 100,
    sortBy: schema.organization?.sortBy ?? 'schema-order',
    frameLabels: schema.organization?.frameLabels ?? true,
    pagePrefixes: schema.organization?.pagePrefixes ?? false,
  };

  // Get all component/componentSet definitions
  const allDefs = [
    ...(schema.components || []),
    ...(schema.componentSets || []),
  ];

  // Group components
  const groups = groupComponents(orderedIds, allDefs, componentMap, org);

  // Sort components within groups
  sortGroups(groups, org);

  // Apply layout
  if (org.layout === 'pages') {
    await applyPageLayout(groups, componentMap, org);
  } else if (org.layout === 'frames') {
    await applyFrameLayout(groups, componentMap, org);
  } else {
    applyGridLayout(groups, componentMap, org);
  }
}

// Group components by category, tags, or none
function groupComponents(
  orderedIds: string[],
  allDefs: (ComponentDefinition | ComponentSetDefinition)[],
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  orderedIds.forEach(id => {
    const def = allDefs.find(d => d.id === id);
    if (!def) return;

    let groupKey: string;

    if (org.groupBy === 'category') {
      groupKey = def.category || 'Uncategorized';
    } else if (org.groupBy === 'tags') {
      groupKey = def.tags && def.tags.length > 0 ? def.tags[0] : 'Untagged';
    } else {
      groupKey = 'All Components';
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(id);
  });

  return groups;
}

// Sort components within groups
function sortGroups(
  groups: Map<string, string[]>,
  org: Required<Organization>
): void {
  if (org.sortBy === 'alphabetical') {
    groups.forEach((ids, groupName) => {
      ids.sort();
    });
  }
  // schema-order: no sorting needed, already in order
}

// Apply page-based layout
async function applyPageLayout(
  groups: Map<string, string[]>,
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): Promise<void> {
  groups.forEach((ids, groupName) => {
    const pageName = org.pagePrefixes ? `Components/${groupName}` : groupName;

    // Find or create page
    let page = figma.root.children.find(p => p.name === pageName && p.type === 'PAGE') as PageNode | undefined;
    if (!page) {
      page = figma.createPage();
      page.name = pageName;
    }

    // Position components in grid on this page
    positionInGrid(ids, componentMap, org, 0, 0, page);
  });
}

// Apply frame-based layout
async function applyFrameLayout(
  groups: Map<string, string[]>,
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): Promise<void> {
  let frameY = 0;
  const FRAME_SPACING = org.spacing * 2;

  // Load font for labels if needed
  if (org.frameLabels) {
    await figma.loadFontAsync({ family: "Inter", style: "Bold" }).catch(() => {
      // Fallback to regular if Bold not available
      return figma.loadFontAsync({ family: "Inter", style: "Regular" });
    });
  }

  for (const [groupName, ids] of groups.entries()) {
    // Create labeled frame for this group
    const groupFrame = figma.createFrame();
    groupFrame.name = groupName;
    groupFrame.x = 0;
    groupFrame.y = frameY;

    // Add label if enabled
    if (org.frameLabels) {
      const label = figma.createText();
      label.name = `${groupName} Label`;
      label.characters = groupName;
      label.fontSize = 24;
      try {
        label.fontName = { family: "Inter", style: "Bold" };
      } catch {
        label.fontName = { family: "Inter", style: "Regular" };
      }
      label.x = 0;
      label.y = 0;
      groupFrame.appendChild(label);

      // Position components below label
      const labelHeight = label.height;
      positionInGrid(ids, componentMap, org, 0, labelHeight + org.spacing, null, groupFrame);
    } else {
      positionInGrid(ids, componentMap, org, 0, 0, null, groupFrame);
    }

    // Resize frame to fit content
    groupFrame.resize(
      Math.max(groupFrame.width, org.gridColumns * 300 + (org.gridColumns - 1) * org.spacing),
      groupFrame.height
    );

    // Set frame properties
    groupFrame.layoutMode = 'NONE';
    groupFrame.fills = [];
    groupFrame.clipsContent = false;

    frameY += groupFrame.height + FRAME_SPACING;
  }
}

// Apply flat grid layout
function applyGridLayout(
  groups: Map<string, string[]>,
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>
): void {
  const allIds: string[] = [];
  groups.forEach(ids => allIds.push(...ids));
  positionInGrid(allIds, componentMap, org, 0, 0, null);
}

// Position components in a grid
function positionInGrid(
  ids: string[],
  componentMap: Map<string, ComponentNode | ComponentSetNode>,
  org: Required<Organization>,
  startX: number,
  startY: number,
  page: PageNode | null,
  parentFrame?: FrameNode
): void {
  let x = startX;
  let y = startY;
  let col = 0;
  let maxHeightInRow = 0;

  ids.forEach(id => {
    const node = componentMap.get(id);
    if (!node) return;

    // Move to parent if specified
    if (parentFrame) {
      parentFrame.appendChild(node);
    } else if (page) {
      page.appendChild(node);
    }

    node.x = x;
    node.y = y;

    maxHeightInRow = Math.max(maxHeightInRow, node.height);
    col++;

    if (col >= org.gridColumns) {
      col = 0;
      x = startX;
      y += maxHeightInRow + org.spacing;
      maxHeightInRow = 0;
    } else {
      x += node.width + org.spacing;
    }
  });
}
