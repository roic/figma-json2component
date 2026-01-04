// src/core/generator/styles.ts
import type { StyleProps, Gradient } from '../../types/schema';
import { resolveVariable, formatResolutionError, validateVariableType } from '../tokenResolver';
import { GenerationContext } from './types';

/**
 * Parse a hex color string to RGB values (0-1 range).
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Validate that a URL is a valid HTTP/HTTPS URL.
 *
 * Blocks potentially malicious URL schemes (javascript:, data:, file:, etc.)
 * to prevent security issues when loading external images.
 *
 * @param url - The URL string to validate
 * @returns True if the URL uses http: or https: protocol
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
 * Apply an image fill from a URL to a node.
 *
 * Downloads the image from the provided URL and sets it as the node's fill.
 * Validates the URL to ensure it uses HTTP/HTTPS protocol for security.
 *
 * @param node - The node to apply the image fill to
 * @param imageUrl - URL of the image to load
 * @param scaleMode - How to scale the image (FILL, FIT, CROP, or TILE)
 * @param context - Generation context for collecting warnings
 *
 * @example
 * await applyImageFill(frame, 'https://example.com/image.png', 'FILL', context);
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
 * Apply a gradient fill to a node.
 */
export async function applyGradientFill(
  node: FrameNode | ComponentNode | RectangleNode | EllipseNode,
  gradient: Gradient,
  context: GenerationContext
): Promise<void> {
  const gradientStops: ColorStop[] = [];

  for (const stop of gradient.stops) {
    let color: RGBA;

    if (stop.colorToken) {
      // Resolve color from token
      const result = resolveVariable(stop.colorToken, context.variableMap);
      if (result.value) {
        const typeError = validateVariableType(result.value, 'COLOR', stop.colorToken, 'colorToken');
        if (typeError) {
          context.warnings.push(typeError);
          continue;
        }
        // Get the resolved color value
        try {
          const collections = figma.variables.getLocalVariableCollections();
          if (collections.length > 0) {
            const modeId = collections[0].modes[0].modeId;
            const resolved = result.value.valuesByMode[modeId];
            if (typeof resolved === 'object' && 'r' in resolved) {
              color = { ...(resolved as RGB), a: stop.opacity ?? 1 };
            } else {
              context.warnings.push(`Token '${stop.colorToken}' is not a color`);
              continue;
            }
          } else {
            context.warnings.push(`No variable collections found for gradient`);
            continue;
          }
        } catch (err) {
          context.warnings.push(`Failed to resolve color token '${stop.colorToken}'`);
          continue;
        }
      } else {
        context.warnings.push(formatResolutionError(stop.colorToken, result, 'variable'));
        continue;
      }
    } else if (stop.color) {
      const rgb = parseHexColor(stop.color);
      color = { ...rgb, a: stop.opacity ?? 1 };
    } else {
      context.warnings.push('Gradient stop requires either color or colorToken');
      continue;
    }

    gradientStops.push({
      position: stop.position,
      color,
    });
  }

  if (gradientStops.length < 2) {
    context.warnings.push('Gradient requires at least 2 valid stops');
    return;
  }

  // Build gradient transform based on type and angle
  let gradientTransform: Transform;

  if (gradient.type === 'linear') {
    const angleRad = ((gradient.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    gradientTransform = [
      [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
      [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
    ];
  } else {
    // Radial gradient centered at specified point
    const cx = gradient.centerX ?? 0.5;
    const cy = gradient.centerY ?? 0.5;
    gradientTransform = [
      [1, 0, cx - 0.5],
      [0, 1, cy - 0.5],
    ];
  }

  const paint: GradientPaint = {
    type: gradient.type === 'linear' ? 'GRADIENT_LINEAR' : 'GRADIENT_RADIAL',
    gradientStops,
    gradientTransform,
  };

  node.fills = [paint];
}

/**
 * Apply style properties to a node.
 *
 * Handles the following style properties:
 * - Fill color (with token binding and opacity support)
 * - Stroke color and width (with token binding)
 * - Stroke dash pattern
 * - Corner radius (with token binding)
 * - Shadow/effects (with effect style token binding)
 * - Layer opacity (with token binding)
 *
 * Clears existing styles before applying new ones to ensure clean state,
 * unless the corresponding style property is explicitly specified.
 *
 * @param node - The node to apply styles to
 * @param styles - Style properties from the schema
 * @param context - Generation context for token resolution and warnings
 *
 * @example
 * await applyStyles(frame, {
 *   fillToken: 'colors/surface/primary',
 *   strokeToken: 'colors/border/default',
 *   radiusToken: 'radii/md',
 *   strokeWidth: 1
 * }, context);
 */
export async function applyStyles(
  node: FrameNode | ComponentNode | RectangleNode | EllipseNode,
  styles: StyleProps,
  context: GenerationContext
): Promise<void> {
  // Clear existing styles to ensure clean state (especially important for updates)
  // Only clear if the corresponding property is NOT specified to allow explicit control
  if (!styles.fill && !styles.fillToken && !styles.fillOpacity && !styles.fillOpacityToken) {
    node.fills = [];
  }
  if (!styles.strokeToken) {
    node.strokes = [];
  }
  if (!styles.shadowToken && 'effects' in node) {
    node.effects = [];
  }

  // Gradient fill (takes precedence over fillToken)
  if (styles.fill) {
    await applyGradientFill(node, styles.fill, context);
    // Don't apply fillToken if gradient is set
  } else if (styles.fillToken) {
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

  // Stroke alignment
  if (styles.strokeAlign) {
    const alignMap: Record<string, 'INSIDE' | 'CENTER' | 'OUTSIDE'> = {
      'inside': 'INSIDE',
      'center': 'CENTER',
      'outside': 'OUTSIDE',
    };
    if ('strokeAlign' in node) {
      node.strokeAlign = alignMap[styles.strokeAlign];
    }
  }

  // Individual stroke sides
  if (styles.strokeSides && 'strokeTopWeight' in node) {
    const weight = styles.strokeWidth ?? 1;
    const sides = new Set(styles.strokeSides);

    // Figma uses individual weights for each side
    node.strokeTopWeight = sides.has('top') ? weight : 0;
    node.strokeRightWeight = sides.has('right') ? weight : 0;
    node.strokeBottomWeight = sides.has('bottom') ? weight : 0;
    node.strokeLeftWeight = sides.has('left') ? weight : 0;
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

/**
 * Apply background blur effect (glassmorphism) to a node.
 *
 * @param node - The node to apply blur to
 * @param blur - Blur radius in pixels
 */
export function applyBackgroundBlur(
  node: FrameNode | RectangleNode,
  blur: number | undefined
): void {
  if (blur === undefined || blur <= 0) {
    return;
  }

  const blurEffect: Effect = {
    type: 'BACKGROUND_BLUR',
    radius: blur,
    visible: true,
  };

  // Preserve existing effects (like shadows) and add blur
  const existingEffects = 'effects' in node ? [...node.effects] : [];
  // Remove any existing background blur to avoid duplicates
  const filteredEffects = existingEffects.filter(e => e.type !== 'BACKGROUND_BLUR');
  node.effects = [...filteredEffects, blurEffect];
}
