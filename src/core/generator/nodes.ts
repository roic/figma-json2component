// src/core/generator/nodes.ts
import type { ChildNode } from '../../types/schema';
import { resolveVariable, resolveTextStyle, formatResolutionError, validateVariableType } from '../tokenResolver';
import { GenerationContext, PLUGIN_DATA_NODE_ID } from './types';
import { applyStyles, applyImageFill } from './styles';
import { applyLayout } from './layout';

/**
 * Create a child node based on its type.
 *
 * Factory function that dispatches to the appropriate node creation function
 * based on the nodeType field in the definition.
 *
 * @param def - The child node definition from the schema
 * @param context - Generation context for token resolution and warnings
 * @returns The created SceneNode, or null if node type is unsupported
 *
 * @example
 * const node = await createChildNode({ nodeType: 'text', name: 'Label', text: 'Hello' }, context);
 */
export async function createChildNode(
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
    case 'ellipse':
      return createEllipseNode(def, context);
    case 'instance':
      return createInstanceNode(def, context);
    default:
      return null;
  }
}

/**
 * Create a frame node with layout, styles, and children.
 *
 * Frames are container nodes that support auto-layout, styling, and
 * nested children. They are the primary building block for component structure.
 *
 * @param def - The frame definition from the schema
 * @param context - Generation context for token resolution and warnings
 * @returns The created FrameNode with all properties applied
 *
 * @example
 * const frame = await createFrameNode({
 *   nodeType: 'frame',
 *   name: 'Container',
 *   layout: { direction: 'horizontal', gap: 8 },
 *   children: [...]
 * }, context);
 */
export async function createFrameNode(
  def: Extract<ChildNode, { nodeType: 'frame' }>,
  context: GenerationContext
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = def.name;

  // Store schema node ID for tracking
  frame.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  if (def.layout) await applyLayout(frame, def.layout, context);
  await applyStyles(frame, def, context);

  // Apply image fill if specified
  if (def.imageUrl) {
    await applyImageFill(frame, def.imageUrl, def.imageScaleMode, context);
  }

  if (def.children) {
    for (const childDef of def.children) {
      const child = await createChildNode(childDef, context);
      if (child) frame.appendChild(child);
    }
  }

  return frame;
}

/**
 * Create a text node with font loading, styles, and text content.
 *
 * Handles font loading with a fallback chain (Inter > Roboto > Arial),
 * text style application via tokens, and fill color with opacity support.
 *
 * @param def - The text node definition from the schema
 * @param context - Generation context for token resolution and warnings
 * @returns The created TextNode with all properties applied
 *
 * @example
 * const text = await createTextNode({
 *   nodeType: 'text',
 *   name: 'Label',
 *   text: 'Click me',
 *   textStyleToken: 'typography/label',
 *   fillToken: 'colors/text/primary'
 * }, context);
 */
export async function createTextNode(
  def: Extract<ChildNode, { nodeType: 'text' }>,
  context: GenerationContext
): Promise<TextNode> {
  const text = figma.createText();
  text.name = def.name;

  // Store schema node ID for reliable text override matching
  text.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  // Load font before setting text (with fallback chain)
  let fontLoaded = false;
  const fallbackFonts = [
    { family: 'Inter', style: 'Regular' },
    { family: 'Roboto', style: 'Regular' },
    { family: 'Arial', style: 'Regular' },
  ];

  for (const font of fallbackFonts) {
    try {
      await figma.loadFontAsync(font);
      fontLoaded = true;
      break;
    } catch (e) {
      console.warn(`Failed to load font ${font.family}:`, e);
      // Try next font
    }
  }

  if (!fontLoaded) {
    context.warnings.push(`Could not load any font. Text nodes may not render correctly.`);
  }

  text.characters = def.text || '';

  // Apply text style
  if (def.textStyleToken) {
    const result = resolveTextStyle(def.textStyleToken, context.textStyleMap);
    if (result.value) {
      text.textStyleId = result.value.id;
    } else {
      context.warnings.push(formatResolutionError(def.textStyleToken, result, 'textStyle'));
    }
  }

  // Apply fill color
  if (def.fillToken) {
    const result = resolveVariable(def.fillToken, context.variableMap);
    if (result.value) {
      // Validate variable type
      const typeError = validateVariableType(result.value, 'COLOR', def.fillToken, 'fillToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        let paint = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
          'color',
          result.value
        ) as SolidPaint;

        // Apply paint-level opacity
        if (def.fillOpacityToken) {
          const opacityResult = resolveVariable(def.fillOpacityToken, context.variableMap);
          if (opacityResult.value) {
            const opacityTypeError = validateVariableType(opacityResult.value, 'FLOAT', def.fillOpacityToken, 'fillOpacityToken');
            if (opacityTypeError) {
              context.warnings.push(opacityTypeError);
            } else {
              paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
            }
          } else {
            context.warnings.push(formatResolutionError(def.fillOpacityToken, opacityResult, 'variable'));
          }
        } else if (def.fillOpacity !== undefined) {
          paint.opacity = def.fillOpacity;
        }

        text.fills = [paint];
      }
    } else {
      context.warnings.push(formatResolutionError(def.fillToken, result, 'variable'));
    }
  } else if (def.fillOpacityToken || def.fillOpacity !== undefined) {
    // fillOpacity without fillToken - apply to existing fills
    const fills = Array.isArray(text.fills) ? [...text.fills as Paint[]] : [];
    if (fills.length > 0 && fills[0].type === 'SOLID') {
      let paint = fills[0] as SolidPaint;

      if (def.fillOpacityToken) {
        const opacityResult = resolveVariable(def.fillOpacityToken, context.variableMap);
        if (opacityResult.value) {
          paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
        } else {
          context.warnings.push(formatResolutionError(def.fillOpacityToken, opacityResult, 'variable'));
        }
      } else if (def.fillOpacity !== undefined) {
        paint.opacity = def.fillOpacity;
      }

      text.fills = [paint, ...fills.slice(1)];
    }
  }

  // Apply layer-level opacity
  if (def.opacityToken) {
    const result = resolveVariable(def.opacityToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', def.opacityToken, 'opacityToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        text.setBoundVariable('opacity', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(def.opacityToken, result, 'variable'));
    }
  } else if (def.opacity !== undefined) {
    text.opacity = def.opacity;
  }

  return text;
}

/**
 * Create a rectangle node with sizing and styles.
 *
 * Rectangles are basic shape nodes that support fills, strokes, corner radius,
 * and image fills. Useful for backgrounds, dividers, and decorative elements.
 *
 * @param def - The rectangle definition from the schema
 * @param context - Generation context for token resolution and warnings
 * @returns The created RectangleNode with all properties applied
 *
 * @example
 * const rect = await createRectangleNode({
 *   nodeType: 'rectangle',
 *   name: 'Background',
 *   layout: { width: 100, height: 50 },
 *   fillToken: 'colors/surface/secondary'
 * }, context);
 */
export async function createRectangleNode(
  def: Extract<ChildNode, { nodeType: 'rectangle' }>,
  context: GenerationContext
): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  rect.name = def.name;

  // Store schema node ID for tracking
  rect.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  // Apply sizing
  if (def.layout) {
    if (typeof def.layout.width === 'number') rect.resize(def.layout.width, rect.height);
    if (typeof def.layout.height === 'number') rect.resize(rect.width, def.layout.height);
  }

  await applyStyles(rect, def, context);

  // Apply image fill if specified
  if (def.imageUrl) {
    await applyImageFill(rect, def.imageUrl, def.imageScaleMode, context);
  }

  return rect;
}

/**
 * Create an ellipse node with sizing and styles.
 *
 * Ellipses are shape nodes that render as circles or ovals.
 * Support fills, strokes, and other style properties.
 *
 * @param def - The ellipse definition from the schema
 * @param context - Generation context for token resolution and warnings
 * @returns The created EllipseNode with all properties applied
 *
 * @example
 * const circle = await createEllipseNode({
 *   nodeType: 'ellipse',
 *   name: 'Avatar',
 *   layout: { width: 40, height: 40 },
 *   imageUrl: 'https://example.com/avatar.png'
 * }, context);
 */
export async function createEllipseNode(
  def: Extract<ChildNode, { nodeType: 'ellipse' }>,
  context: GenerationContext
): Promise<EllipseNode> {
  const ellipse = figma.createEllipse();
  ellipse.name = def.name;

  // Store schema node ID for tracking
  ellipse.setPluginData(PLUGIN_DATA_NODE_ID, def.id);

  // Apply sizing
  if (def.layout) {
    if (typeof def.layout.width === 'number') ellipse.resize(def.layout.width, ellipse.height);
    if (typeof def.layout.height === 'number') ellipse.resize(ellipse.width, def.layout.height);
  }

  await applyStyles(ellipse, def, context);

  return ellipse;
}

/**
 * Create a visible placeholder frame for a missing icon/component.
 *
 * Shows a red dashed border to make it obvious something is missing.
 * Stores the error message in plugin data for debugging.
 *
 * @param def - The instance definition that failed to resolve
 * @param errorMessage - Description of why the icon/component is missing
 * @returns A placeholder FrameNode styled to indicate a missing element
 *
 * @example
 * const placeholder = createMissingIconPlaceholder(
 *   def,
 *   "Icon 'lucide:missing' not found in any registry"
 * );
 */
export function createMissingIconPlaceholder(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  errorMessage: string
): FrameNode {
  const placeholder = figma.createFrame();
  placeholder.name = `[Missing] ${def.name} (missing)`;

  // Size: use requested size or default 24x24 (common icon size)
  const width = typeof def.layout?.width === 'number' ? def.layout.width : 24;
  const height = typeof def.layout?.height === 'number' ? def.layout.height : 24;
  placeholder.resize(width, height);

  // Style: red dashed border, no fill
  placeholder.fills = [];
  placeholder.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.3, b: 0.3 } }];
  placeholder.strokeWeight = 1;
  placeholder.dashPattern = [2, 2];

  // Store error for debugging
  placeholder.setPluginData('jasoti.error', errorMessage);

  if (def.id) {
    placeholder.setPluginData(PLUGIN_DATA_NODE_ID, def.id);
  }

  return placeholder;
}

/**
 * Create an instance node from a component reference or library component.
 *
 * Supports three ways to reference the source component:
 * 1. iconRef - Resolved via icon registries to a componentKey
 * 2. componentKey - Direct library component key for import
 * 3. ref - Reference to a locally-defined component by ID
 *
 * Also handles:
 * - Variant selection via variantProps
 * - Sizing via layout properties
 * - Text overrides for nested text nodes
 *
 * @param def - The instance definition from the schema
 * @param context - Generation context for component lookup and warnings
 * @returns The created InstanceNode, a placeholder frame if missing, or null
 *
 * @example
 * // Using local ref
 * const instance = await createInstanceNode({
 *   nodeType: 'instance',
 *   name: 'PrimaryButton',
 *   ref: 'button',
 *   variantProps: { type: 'primary', size: 'md' },
 *   overrides: { label: { text: 'Submit' } }
 * }, context);
 *
 * @example
 * // Using iconRef
 * const icon = await createInstanceNode({
 *   nodeType: 'instance',
 *   name: 'CheckIcon',
 *   iconRef: 'lucide:check',
 *   layout: { width: 16, height: 16 }
 * }, context);
 */
export async function createInstanceNode(
  def: Extract<ChildNode, { nodeType: 'instance' }>,
  context: GenerationContext
): Promise<InstanceNode | FrameNode | null> {
  let mainComponent: ComponentNode | null = null;
  let componentKey: string | undefined = def.componentKey;
  let iconRefSource: string | undefined;

  // Case 0: Resolve iconRef to componentKey first
  if (def.iconRef) {
    iconRefSource = def.iconRef;
    const resolved = context.iconResolver.resolve(def.iconRef);

    if (resolved.error) {
      context.warnings.push(resolved.error);
      return createMissingIconPlaceholder(def, resolved.error);
    }

    componentKey = resolved.componentKey!;
  }

  // Case 1: Library component via componentKey (includes resolved iconRef)
  if (componentKey) {
    try {
      const imported = await figma.importComponentByKeyAsync(componentKey);
      if (imported.type === 'COMPONENT') {
        mainComponent = imported;
      } else if (imported.type === 'COMPONENT_SET') {
        // Check if the component set has variants
        if (imported.children.length === 0) {
          context.warnings.push(`Imported ComponentSet '${iconRefSource || componentKey}' has no variants`);
          return null;
        }
        // If it's a component set, find the right variant or use first
        if (def.variantProps) {
          const variantName = Object.entries(def.variantProps)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          const variant = imported.findChild(c => c.name === variantName) as ComponentNode;
          mainComponent = variant || (imported.children[0] as ComponentNode);
        } else {
          mainComponent = imported.children[0] as ComponentNode;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const source = iconRefSource || componentKey;
      const errorMsg = `Couldn't import '${source}'. Check that the library is enabled and the registry matches your library version.`;
      context.warnings.push(errorMsg);
      return createMissingIconPlaceholder(def, errorMsg);
    }
  }
  // Case 2: Local component via ref
  else if (def.ref) {
    const target = context.componentMap.get(def.ref);

    if (!target) {
      context.warnings.push(`Component '${def.ref}' not found for instance`);
      return null;
    }

    if (target.type === 'COMPONENT_SET') {
      if (target.children.length === 0) {
        context.warnings.push(`ComponentSet '${def.ref}' has no variants`);
        return null;
      }

      if (def.variantProps) {
        const variantName = Object.entries(def.variantProps)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const variant = target.findChild(c => c.name === variantName) as ComponentNode;
        mainComponent = variant || (target.children[0] as ComponentNode);
        if (!variant) {
          context.warnings.push(`Variant '${variantName}' not found in '${def.ref}', using first variant`);
        }
      } else {
        mainComponent = target.children[0] as ComponentNode;
      }
    } else {
      mainComponent = target;
    }
  }

  if (!mainComponent) {
    return null;
  }

  // Create instance
  const instance = mainComponent.createInstance();
  instance.name = def.name;

  // Store schema node ID if provided
  if (def.id) {
    instance.setPluginData(PLUGIN_DATA_NODE_ID, def.id);
  }

  // Apply sizing
  if (def.layout) {
    if (def.layout.width !== undefined) {
      if (def.layout.width === 'fill') {
        instance.layoutSizingHorizontal = 'FILL';
      } else if (def.layout.width === 'hug') {
        instance.layoutSizingHorizontal = 'HUG';
      } else if (typeof def.layout.width === 'number') {
        instance.resize(def.layout.width, instance.height);
      }
    }
    if (def.layout.height !== undefined) {
      if (def.layout.height === 'fill') {
        instance.layoutSizingVertical = 'FILL';
      } else if (def.layout.height === 'hug') {
        instance.layoutSizingVertical = 'HUG';
      } else if (typeof def.layout.height === 'number') {
        instance.resize(instance.width, def.layout.height);
      }
    }
  }

  // Apply text overrides
  if (def.overrides) {
    for (const [nodeId, override] of Object.entries(def.overrides)) {
      if (override.text !== undefined) {
        // Find by pluginData first (reliable), fallback to name
        let targetNode = instance.findOne(n =>
          n.type === 'TEXT' && n.getPluginData(PLUGIN_DATA_NODE_ID) === nodeId
        ) as TextNode | null;

        if (!targetNode) {
          targetNode = instance.findOne(n =>
            n.type === 'TEXT' && n.name === nodeId
          ) as TextNode | null;

          if (targetNode) {
            context.warnings.push(
              `Text override for '${nodeId}' matched by name. Regenerate '${def.ref || def.componentKey}' for reliable matching.`
            );
          }
        }

        if (targetNode) {
          await figma.loadFontAsync(targetNode.fontName as FontName);
          targetNode.characters = override.text;
        }
      }

      // Apply instance swap overrides
      if (override.swap || override.swapComponentKey || override.swapRef) {
        // Find nested instance by pluginData or name
        let targetInstance = instance.findOne(n =>
          n.type === 'INSTANCE' && n.getPluginData(PLUGIN_DATA_NODE_ID) === nodeId
        ) as InstanceNode | null;

        if (!targetInstance) {
          targetInstance = instance.findOne(n =>
            n.type === 'INSTANCE' && n.name === nodeId
          ) as InstanceNode | null;

          if (targetInstance) {
            context.warnings.push(
              `Instance swap for '${nodeId}' matched by name. Regenerate component for reliable matching.`
            );
          }
        }

        if (targetInstance) {
          let swapComponent: ComponentNode | null = null;

          // Resolve the swap target
          if (override.swap) {
            // iconRef format
            const resolved = context.iconResolver.resolve(override.swap);
            if (resolved.componentKey) {
              try {
                const imported = await figma.importComponentByKeyAsync(resolved.componentKey);
                if (imported.type === 'COMPONENT') {
                  swapComponent = imported;
                } else if (imported.type === 'COMPONENT_SET') {
                  if (imported.children.length === 0) {
                    context.warnings.push(`Imported ComponentSet for swap '${override.swap}' has no variants`);
                  } else {
                    swapComponent = imported.children[0] as ComponentNode;
                  }
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                context.warnings.push(`Failed to import swap target '${override.swap}': ${message}`);
              }
            } else if (resolved.error) {
              context.warnings.push(resolved.error);
            }
          } else if (override.swapComponentKey) {
            try {
              const imported = await figma.importComponentByKeyAsync(override.swapComponentKey);
              if (imported.type === 'COMPONENT') {
                swapComponent = imported;
              } else if (imported.type === 'COMPONENT_SET') {
                if (imported.children.length === 0) {
                  context.warnings.push(`Imported ComponentSet for swap '${override.swapComponentKey}' has no variants`);
                } else {
                  swapComponent = imported.children[0] as ComponentNode;
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              context.warnings.push(`Failed to import swap target '${override.swapComponentKey}': ${message}`);
            }
          } else if (override.swapRef) {
            const target = context.componentMap.get(override.swapRef);
            if (target) {
              if (target.type === 'COMPONENT') {
                swapComponent = target;
              } else if (target.type === 'COMPONENT_SET') {
                if (target.children.length === 0) {
                  context.warnings.push(`ComponentSet for swap ref '${override.swapRef}' has no variants`);
                } else {
                  swapComponent = target.children[0] as ComponentNode;
                }
              }
            } else {
              context.warnings.push(`Swap ref '${override.swapRef}' not found`);
            }
          }

          if (swapComponent) {
            targetInstance.swapComponent(swapComponent);
          }
        } else {
          context.warnings.push(`Instance '${nodeId}' not found for swap override`);
        }
      }
    }
  }

  return instance;
}
