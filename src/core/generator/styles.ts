// src/core/generator/styles.ts
import type { StyleProps } from '../../types/schema';
import { resolveVariable, formatResolutionError, validateVariableType } from '../tokenResolver';
import { GenerationContext } from './types';

/**
 * Validate that a URL is a valid HTTP/HTTPS URL.
 * Blocks potentially malicious URLs like javascript:, data:, file:, etc.
 */
function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Apply an image fill from a URL.
 */
export async function applyImageFill(
  node: GeometryMixin & MinimalFillsMixin,
  imageUrl: string,
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE' | undefined,
  context: GenerationContext
): Promise<void> {
  // Validate URL to prevent malicious protocols (javascript:, data:, file:, etc.)
  if (!isValidImageUrl(imageUrl)) {
    context.warnings.push(`Blocked non-HTTP image URL: ${imageUrl}`);
    return;
  }

  try {
    const image = await figma.createImageAsync(imageUrl);
    const imagePaint: ImagePaint = {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: scaleMode || 'FILL',
    };
    node.fills = [imagePaint];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    context.warnings.push(`Failed to load image '${imageUrl}': ${message}`);
    console.warn(`⚠️ Failed to load image '${imageUrl}': ${message}`);
  }
}

/**
 * Apply style properties (fill, stroke, radius, shadow, opacity) to a node.
 */
export async function applyStyles(
  node: FrameNode | ComponentNode | RectangleNode | EllipseNode,
  styles: StyleProps,
  context: GenerationContext
): Promise<void> {
  // Clear existing styles to ensure clean state (especially important for updates)
  // Only clear if the corresponding property is NOT specified to allow explicit control
  if (!styles.fillToken && !styles.fillOpacity && !styles.fillOpacityToken) {
    node.fills = [];
  }
  if (!styles.strokeToken) {
    node.strokes = [];
  }
  if (!styles.shadowToken && 'effects' in node) {
    node.effects = [];
  }

  // Fill
  if (styles.fillToken) {
    const result = resolveVariable(styles.fillToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'COLOR', styles.fillToken, 'fillToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        let paint = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
          'color',
          result.value
        ) as SolidPaint;

        // Apply paint-level opacity
        if (styles.fillOpacityToken) {
          const opacityResult = resolveVariable(styles.fillOpacityToken, context.variableMap);
          if (opacityResult.value) {
            const opacityTypeError = validateVariableType(opacityResult.value, 'FLOAT', styles.fillOpacityToken, 'fillOpacityToken');
            if (opacityTypeError) {
              context.warnings.push(opacityTypeError);
            } else {
              paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
            }
          } else {
            context.warnings.push(formatResolutionError(styles.fillOpacityToken, opacityResult, 'variable'));
          }
        } else if (styles.fillOpacity !== undefined) {
          paint.opacity = styles.fillOpacity;
        }

        node.fills = [paint];
      }
    } else {
      context.warnings.push(formatResolutionError(styles.fillToken, result, 'variable'));
    }
  } else if (styles.fillOpacityToken || styles.fillOpacity !== undefined) {
    // fillOpacity without fillToken - apply to existing fills
    const fills = Array.isArray(node.fills) ? [...node.fills as Paint[]] : [];
    if (fills.length > 0 && fills[0].type === 'SOLID') {
      let paint = fills[0] as SolidPaint;

      if (styles.fillOpacityToken) {
        const opacityResult = resolveVariable(styles.fillOpacityToken, context.variableMap);
        if (opacityResult.value) {
          const opacityTypeError = validateVariableType(opacityResult.value, 'FLOAT', styles.fillOpacityToken, 'fillOpacityToken');
          if (opacityTypeError) {
            context.warnings.push(opacityTypeError);
          } else {
            paint = figma.variables.setBoundVariableForPaint(paint, 'opacity', opacityResult.value) as SolidPaint;
          }
        } else {
          context.warnings.push(formatResolutionError(styles.fillOpacityToken, opacityResult, 'variable'));
        }
      } else if (styles.fillOpacity !== undefined) {
        paint.opacity = styles.fillOpacity;
      }

      node.fills = [paint, ...fills.slice(1)];
    }
  }

  // Stroke
  if (styles.strokeToken) {
    const result = resolveVariable(styles.strokeToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'COLOR', styles.strokeToken, 'strokeToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        const stroke = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
          'color',
          result.value
        );
        node.strokes = [stroke];
      }
    } else {
      context.warnings.push(formatResolutionError(styles.strokeToken, result, 'variable'));
    }
  }
  if (styles.strokeWidth !== undefined) {
    node.strokeWeight = styles.strokeWidth;
  }

  // Stroke dash pattern
  if (styles.strokeDash !== undefined && 'dashPattern' in node) {
    node.dashPattern = styles.strokeDash;
  }

  // Radius (only for frames/components/rectangles)
  if (styles.radiusToken && 'cornerRadius' in node) {
    const result = resolveVariable(styles.radiusToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', styles.radiusToken, 'radiusToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('topLeftRadius', result.value);
        node.setBoundVariable('topRightRadius', result.value);
        node.setBoundVariable('bottomLeftRadius', result.value);
        node.setBoundVariable('bottomRightRadius', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(styles.radiusToken, result, 'variable'));
    }
  }

  // Shadow - using composite effect variables
  if (styles.shadowToken && 'effects' in node) {
    const result = resolveVariable(styles.shadowToken, context.variableMap);
    if (result.value) {
      try {
        // Create a default drop shadow effect
        const effect: DropShadowEffect = {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 },
          radius: 8,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL'
        };

        // Bind the effect variable
        const boundEffect = figma.variables.setBoundVariableForEffect(effect, 'effects', result.value);
        node.effects = [boundEffect];
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        context.warnings.push(`Failed to bind shadow token '${styles.shadowToken}': ${message}`);
      }
    } else {
      context.warnings.push(formatResolutionError(styles.shadowToken, result, 'variable'));
    }
  }

  // Layer-level opacity
  if (styles.opacityToken) {
    const result = resolveVariable(styles.opacityToken, context.variableMap);
    if (result.value) {
      const typeError = validateVariableType(result.value, 'FLOAT', styles.opacityToken, 'opacityToken');
      if (typeError) {
        context.warnings.push(typeError);
      } else {
        node.setBoundVariable('opacity', result.value);
      }
    } else {
      context.warnings.push(formatResolutionError(styles.opacityToken, result, 'variable'));
    }
  } else if (styles.opacity !== undefined) {
    node.opacity = styles.opacity;
  }
}
