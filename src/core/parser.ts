// src/core/parser.ts
import type { Schema, ValidationResult, ValidationError, ComponentDefinition, ComponentSetDefinition, ChildNode, LayoutProps, StyleProps, RectangleNode, Organization } from '../types/schema';

export interface ParseResult extends ValidationResult {
  schema?: Schema;
}

/**
 * Parse and merge multiple JSON schema files.
 * Useful for component libraries split across multiple files.
 */
export function parseSchemas(jsonStrings: string[]): ParseResult {
  if (jsonStrings.length === 0) {
    return {
      valid: false,
      errors: [{ path: '', message: 'No schemas provided' }],
      warnings: [],
    };
  }

  // Parse each schema individually
  const parsedSchemas: Schema[] = [];
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  jsonStrings.forEach((jsonString, index) => {
    const result = parseSchema(jsonString);
    if (result.valid && result.schema) {
      parsedSchemas.push(result.schema);
    }
    // Prefix errors/warnings with file index for clarity
    allErrors.push(...result.errors.map(e => ({
      ...e,
      path: `[file ${index + 1}] ${e.path}`,
    })));
    allWarnings.push(...result.warnings.map(w => ({
      ...w,
      path: `[file ${index + 1}] ${w.path}`,
    })));
  });

  // If any schema failed to parse, return errors
  if (allErrors.length > 0) {
    return {
      valid: false,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  // Merge all schemas and track file origins
  const idToFileIndex = new Map<string, number>();

  parsedSchemas.forEach((schema, fileIndex) => {
    schema.components?.forEach(c => {
      if (idToFileIndex.has(c.id)) {
        allErrors.push({
          path: '',
          message: `Duplicate id '${c.id}' found in multiple files (first in file ${idToFileIndex.get(c.id)! + 1}, duplicate in file ${fileIndex + 1})`,
        });
      } else {
        idToFileIndex.set(c.id, fileIndex);
      }
    });

    schema.componentSets?.forEach(s => {
      if (idToFileIndex.has(s.id)) {
        allErrors.push({
          path: '',
          message: `Duplicate id '${s.id}' found in multiple files (first in file ${idToFileIndex.get(s.id)! + 1}, duplicate in file ${fileIndex + 1})`,
        });
      } else {
        idToFileIndex.set(s.id, fileIndex);
      }
    });
  });

  if (allErrors.length > 0) {
    return {
      valid: false,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  // Merge all schemas
  const mergedSchema = mergeSchemas(parsedSchemas);

  return {
    valid: true,
    errors: [],
    warnings: allWarnings,
    schema: mergedSchema,
  };
}

/**
 * Merge multiple schemas into one unified schema.
 * Takes organization config from first schema that has it.
 */
function mergeSchemas(schemas: Schema[]): Schema {
  const merged: Schema = {
    components: [],
    componentSets: [],
  };

  // Take organization from first schema that has it
  for (const schema of schemas) {
    if (schema.organization && !merged.organization) {
      merged.organization = schema.organization;
      break;
    }
  }

  schemas.forEach(schema => {
    if (schema.components) {
      merged.components!.push(...schema.components);
    }
    if (schema.componentSets) {
      merged.componentSets!.push(...schema.componentSets);
    }
  });

  return merged;
}

export function parseSchema(jsonString: string): ParseResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Step 1: Parse JSON
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid JSON';
    return {
      valid: false,
      errors: [{ path: '', message: `JSON parse error: ${message}` }],
      warnings: [],
    };
  }

  // Step 2: Validate structure
  if (typeof raw !== 'object' || raw === null) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Schema must be an object' }],
      warnings: [],
    };
  }

  const schema = raw as Record<string, unknown>;
  const result: Schema = {};

  // Validate organization
  if ('organization' in schema) {
    if (typeof schema.organization !== 'object' || schema.organization === null) {
      errors.push({ path: 'organization', message: 'organization must be an object' });
    } else {
      const orgErrors = validateOrganization(schema.organization, 'organization');
      errors.push(...orgErrors.errors);
      warnings.push(...orgErrors.warnings);
      if (orgErrors.errors.length === 0) {
        result.organization = schema.organization as Organization;
      }
    }
  }

  // Validate components
  if ('components' in schema) {
    if (!Array.isArray(schema.components)) {
      errors.push({ path: 'components', message: 'components must be an array' });
    } else {
      result.components = [];
      schema.components.forEach((comp, i) => {
        const compErrors = validateComponent(comp, `components[${i}]`);
        errors.push(...compErrors.errors);
        warnings.push(...compErrors.warnings);
        if (compErrors.errors.length === 0) {
          result.components!.push(comp as ComponentDefinition);
        }
      });
    }
  }

  // Validate componentSets
  if ('componentSets' in schema) {
    if (!Array.isArray(schema.componentSets)) {
      errors.push({ path: 'componentSets', message: 'componentSets must be an array' });
    } else {
      result.componentSets = [];
      schema.componentSets.forEach((set, i) => {
        const setErrors = validateComponentSet(set, `componentSets[${i}]`);
        errors.push(...setErrors.errors);
        warnings.push(...setErrors.warnings);
        if (setErrors.errors.length === 0) {
          result.componentSets!.push(set as ComponentSetDefinition);
        }
      });
    }
  }

  // Check for duplicate IDs
  const allIds = [
    ...(result.components?.map(c => c.id) || []),
    ...(result.componentSets?.map(c => c.id) || []),
  ];
  const seen = new Set<string>();
  allIds.forEach(id => {
    if (seen.has(id)) {
      errors.push({ path: '', message: `Duplicate id '${id}' found` });
    }
    seen.add(id);
  });

  // Warn if schema is empty
  if (allIds.length === 0) {
    warnings.push({ path: '', message: 'Schema contains no components or componentSets' });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schema: errors.length === 0 ? result : undefined,
  };
}

function validateComponent(comp: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof comp !== 'object' || comp === null) {
    errors.push({ path, message: 'Component must be an object' });
    return { errors, warnings };
  }

  const c = comp as Record<string, unknown>;

  // Required fields
  if (!c.id || typeof c.id !== 'string') {
    errors.push({ path, message: "Missing required field 'id'" });
  }
  if (!c.name || typeof c.name !== 'string') {
    errors.push({ path, message: "Missing required field 'name'" });
  }
  if (!c.layout || typeof c.layout !== 'object') {
    errors.push({ path, message: "Missing required field 'layout'" });
  } else {
    const layoutErrors = validateLayout(c.layout, `${path}.layout`);
    errors.push(...layoutErrors.errors);
    warnings.push(...layoutErrors.warnings);
  }

  // Validate style props
  const styleErrors = validateStyleProps(c, path);
  errors.push(...styleErrors.errors);
  warnings.push(...styleErrors.warnings);

  // Validate children if present
  if (c.children) {
    if (!Array.isArray(c.children)) {
      errors.push({ path: `${path}.children`, message: 'children must be an array' });
    } else {
      c.children.forEach((child, i) => {
        const childErrors = validateChildNode(child, `${path}.children[${i}]`);
        errors.push(...childErrors.errors);
        warnings.push(...childErrors.warnings);
      });
    }
  }

  return { errors, warnings };
}

function validateComponentSet(set: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof set !== 'object' || set === null) {
    errors.push({ path, message: 'ComponentSet must be an object' });
    return { errors, warnings };
  }

  const s = set as Record<string, unknown>;

  // Required fields
  if (!s.id || typeof s.id !== 'string') {
    errors.push({ path, message: "Missing required field 'id'" });
  }
  if (!s.name || typeof s.name !== 'string') {
    errors.push({ path, message: "Missing required field 'name'" });
  }
  if (!Array.isArray(s.variantProps)) {
    errors.push({ path, message: "Missing required field 'variantProps' (array)" });
  }
  if (!s.base || typeof s.base !== 'object') {
    errors.push({ path, message: "Missing required field 'base'" });
  } else {
    const base = s.base as Record<string, unknown>;
    const baseErrors = validateLayout(base.layout, `${path}.base.layout`);
    errors.push(...baseErrors.errors);
    warnings.push(...baseErrors.warnings);

    // Validate base style props
    const baseStyleErrors = validateStyleProps(base, `${path}.base`);
    errors.push(...baseStyleErrors.errors);
    warnings.push(...baseStyleErrors.warnings);

    // Validate base children
    if (base.children && Array.isArray(base.children)) {
      base.children.forEach((child, i) => {
        const childErrors = validateChildNode(child, `${path}.base.children[${i}]`);
        errors.push(...childErrors.errors);
        warnings.push(...childErrors.warnings);
      });
    }
  }
  if (!Array.isArray(s.variants)) {
    errors.push({ path, message: "Missing required field 'variants' (array)" });
  } else if (s.variants.length === 0) {
    errors.push({ path: `${path}.variants`, message: 'componentSet must have at least one variant' });
  } else {
    s.variants.forEach((v, i) => {
      if (typeof v !== 'object' || !v || !('props' in (v as object))) {
        errors.push({ path: `${path}.variants[${i}]`, message: "Variant missing 'props'" });
      } else {
        const variant = v as Record<string, unknown>;

        // Validate variant props match variantProps keys
        if (Array.isArray(s.variantProps) && variant.props && typeof variant.props === 'object') {
          const variantProps = variant.props as Record<string, unknown>;
          const variantKeys = Object.keys(variantProps);
          const expectedKeys = s.variantProps as string[];

          // Check all expected keys are present
          expectedKeys.forEach(key => {
            if (!(key in variantProps)) {
              errors.push({
                path: `${path}.variants[${i}].props`,
                message: `Missing required variant property '${key}'`
              });
            }
          });

          // Warn about extra keys
          variantKeys.forEach(key => {
            if (!expectedKeys.includes(key)) {
              warnings.push({
                path: `${path}.variants[${i}].props`,
                message: `Unexpected variant property '${key}' (not in variantProps)`
              });
            }
          });
        }

        // Validate variant style props
        const variantStyleErrors = validateStyleProps(variant, `${path}.variants[${i}]`);
        errors.push(...variantStyleErrors.errors);
        warnings.push(...variantStyleErrors.warnings);
      }
    });
  }

  return { errors, warnings };
}

function validateLayout(layout: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof layout !== 'object' || layout === null) {
    errors.push({ path, message: 'Layout must be an object' });
    return { errors, warnings };
  }

  const l = layout as Record<string, unknown>;

  // Check for token/value conflicts
  if (l.padding !== undefined && l.paddingToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'padding' and 'paddingToken'" });
  }
  if (l.paddingTop !== undefined && l.paddingTopToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'paddingTop' and 'paddingTopToken'" });
  }
  if (l.paddingRight !== undefined && l.paddingRightToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'paddingRight' and 'paddingRightToken'" });
  }
  if (l.paddingBottom !== undefined && l.paddingBottomToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'paddingBottom' and 'paddingBottomToken'" });
  }
  if (l.paddingLeft !== undefined && l.paddingLeftToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'paddingLeft' and 'paddingLeftToken'" });
  }
  if (l.gap !== undefined && l.gapToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'gap' and 'gapToken'" });
  }

  // Validate wrap is boolean
  if (l.wrap !== undefined && typeof l.wrap !== 'boolean') {
    errors.push({ path, message: "wrap must be a boolean" });
  }

  return { errors, warnings };
}

function validateStyleProps(props: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof props !== 'object' || props === null) {
    return { errors, warnings };
  }

  const p = props as Record<string, unknown>;

  // Check for token/value conflicts
  if (p.opacity !== undefined && p.opacityToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'opacity' and 'opacityToken'" });
  }
  if (p.fillOpacity !== undefined && p.fillOpacityToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'fillOpacity' and 'fillOpacityToken'" });
  }

  // Validate opacity ranges (0-1)
  if (p.opacity !== undefined && typeof p.opacity === 'number') {
    if (p.opacity < 0 || p.opacity > 1) {
      errors.push({ path, message: "opacity must be between 0 and 1" });
    }
  }
  if (p.fillOpacity !== undefined && typeof p.fillOpacity === 'number') {
    if (p.fillOpacity < 0 || p.fillOpacity > 1) {
      errors.push({ path, message: "fillOpacity must be between 0 and 1" });
    }
  }

  // Validate strokeDash is array of numbers
  if (p.strokeDash !== undefined) {
    if (!Array.isArray(p.strokeDash)) {
      errors.push({ path, message: "strokeDash must be an array" });
    } else if (!p.strokeDash.every((v: unknown) => typeof v === 'number')) {
      errors.push({ path, message: "strokeDash must be an array of numbers" });
    }
  }

  return { errors, warnings };
}

function validateChildNode(node: unknown, path: string, depth: number = 0): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check nesting depth to prevent stack overflow
  const MAX_DEPTH = 50;
  if (depth > MAX_DEPTH) {
    errors.push({ path, message: `Maximum nesting depth (${MAX_DEPTH}) exceeded` });
    return { errors, warnings };
  }

  if (typeof node !== 'object' || node === null) {
    errors.push({ path, message: 'Node must be an object' });
    return { errors, warnings };
  }

  const n = node as Record<string, unknown>;

  if (!n.nodeType || typeof n.nodeType !== 'string') {
    errors.push({ path, message: "Missing required field 'nodeType'" });
    return { errors, warnings };
  }

  const validTypes = ['frame', 'text', 'instance', 'rectangle', 'ellipse'];
  if (!validTypes.includes(n.nodeType as string)) {
    errors.push({ path, message: `Invalid nodeType '${n.nodeType}'. Must be one of: ${validTypes.join(', ')}` });
    return { errors, warnings };
  }

  // All nodes except instance require id (instance.id is optional per schema)
  if (n.nodeType !== 'instance' && (!n.id || typeof n.id !== 'string')) {
    errors.push({ path, message: "Missing required field 'id'" });
  }

  if (!n.name || typeof n.name !== 'string') {
    errors.push({ path, message: "Missing required field 'name'" });
  }

  // Instance-specific validation
  if (n.nodeType === 'instance') {
    if (!n.ref || typeof n.ref !== 'string') {
      errors.push({ path, message: "Instance missing required field 'ref'" });
    }
  }

  // Validate style props for nodes that support them (frame, text, rectangle, ellipse)
  if (n.nodeType === 'frame' || n.nodeType === 'text' || n.nodeType === 'rectangle' || n.nodeType === 'ellipse') {
    const styleErrors = validateStyleProps(n, path);
    errors.push(...styleErrors.errors);
    warnings.push(...styleErrors.warnings);
  }

  // Validate imageUrl for frame and rectangle nodes
  if (n.nodeType === 'frame' || n.nodeType === 'rectangle') {
    if (n.imageUrl !== undefined) {
      if (typeof n.imageUrl !== 'string') {
        errors.push({ path: `${path}.imageUrl`, message: 'imageUrl must be a string' });
      } else if (!n.imageUrl.startsWith('http://') && !n.imageUrl.startsWith('https://')) {
        warnings.push({ path: `${path}.imageUrl`, message: 'imageUrl should be a valid HTTP(S) URL' });
      }
    }
    if (n.imageScaleMode !== undefined) {
      const validScaleModes = ['FILL', 'FIT', 'CROP', 'TILE'];
      if (!validScaleModes.includes(n.imageScaleMode as string)) {
        errors.push({ path: `${path}.imageScaleMode`, message: `imageScaleMode must be one of: ${validScaleModes.join(', ')}` });
      }
    }
  }

  // Recursive children validation for frames
  if (n.nodeType === 'frame' && n.children) {
    if (!Array.isArray(n.children)) {
      errors.push({ path: `${path}.children`, message: 'children must be an array' });
    } else {
      (n.children as unknown[]).forEach((child, i) => {
        const childErrors = validateChildNode(child, `${path}.children[${i}]`, depth + 1);
        errors.push(...childErrors.errors);
        warnings.push(...childErrors.warnings);
      });
    }
  }

  return { errors, warnings };
}

function validateOrganization(org: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof org !== 'object' || org === null) {
    return { errors, warnings };
  }

  const o = org as Record<string, unknown>;

  // Validate groupBy
  if (o.groupBy !== undefined) {
    const validGroupBy = ['category', 'tags', 'none'];
    if (typeof o.groupBy !== 'string' || !validGroupBy.includes(o.groupBy)) {
      const validOptions = validGroupBy.join(', ');
      errors.push({ path: `${path}.groupBy`, message: `groupBy must be one of: ${validOptions}` });
    }
  }

  // Validate layout
  if (o.layout !== undefined) {
    const validLayout = ['frames', 'pages', 'grid'];
    if (typeof o.layout !== 'string' || !validLayout.includes(o.layout)) {
      const validOptions = validLayout.join(', ');
      errors.push({ path: `${path}.layout`, message: `layout must be one of: ${validOptions}` });
    }
  }

  // Validate gridColumns
  if (o.gridColumns !== undefined) {
    if (typeof o.gridColumns !== 'number' || o.gridColumns < 1) {
      errors.push({ path: `${path}.gridColumns`, message: 'gridColumns must be a positive number' });
    }
  }

  // Validate spacing
  if (o.spacing !== undefined) {
    if (typeof o.spacing !== 'number' || o.spacing < 0) {
      errors.push({ path: `${path}.spacing`, message: 'spacing must be a non-negative number' });
    }
  }

  // Validate sortBy
  if (o.sortBy !== undefined) {
    const validSortBy = ['alphabetical', 'schema-order'];
    if (typeof o.sortBy !== 'string' || !validSortBy.includes(o.sortBy)) {
      const validOptions = validSortBy.join(', ');
      errors.push({ path: `${path}.sortBy`, message: `sortBy must be one of: ${validOptions}` });
    }
  }

  // Validate frameLabels
  if (o.frameLabels !== undefined && typeof o.frameLabels !== 'boolean') {
    errors.push({ path: `${path}.frameLabels`, message: 'frameLabels must be a boolean' });
  }

  // Validate pagePrefixes
  if (o.pagePrefixes !== undefined && typeof o.pagePrefixes !== 'boolean') {
    errors.push({ path: `${path}.pagePrefixes`, message: 'pagePrefixes must be a boolean' });
  }

  return { errors, warnings };
}

// ============ Token Extraction ============

export interface TokenReference {
  token: string;
  type: 'variable' | 'textStyle' | 'effectStyle';
  path: string;  // Where in schema this token is referenced
}

/**
 * Extract all token references from a parsed schema.
 * Returns a list of unique tokens with their types and locations.
 */
export function extractTokenReferences(schema: Schema): TokenReference[] {
  const refs: TokenReference[] = [];
  const seen = new Set<string>();

  function addRef(token: string | undefined, type: TokenReference['type'], path: string) {
    if (!token) return;
    const key = `${type}:${token}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ token, type, path });
    }
  }

  function extractFromLayout(layout: LayoutProps | undefined, path: string) {
    if (!layout) return;
    addRef(layout.paddingToken, 'variable', `${path}.paddingToken`);
    addRef(layout.paddingTopToken, 'variable', `${path}.paddingTopToken`);
    addRef(layout.paddingRightToken, 'variable', `${path}.paddingRightToken`);
    addRef(layout.paddingBottomToken, 'variable', `${path}.paddingBottomToken`);
    addRef(layout.paddingLeftToken, 'variable', `${path}.paddingLeftToken`);
    addRef(layout.gapToken, 'variable', `${path}.gapToken`);
  }

  function extractFromStyle(obj: StyleProps | undefined, path: string) {
    if (!obj) return;
    addRef(obj.fillToken, 'variable', `${path}.fillToken`);
    addRef(obj.strokeToken, 'variable', `${path}.strokeToken`);
    addRef(obj.radiusToken, 'variable', `${path}.radiusToken`);
    addRef(obj.shadowToken, 'effectStyle', `${path}.shadowToken`);
    addRef(obj.opacityToken, 'variable', `${path}.opacityToken`);
    addRef(obj.fillOpacityToken, 'variable', `${path}.fillOpacityToken`);
  }

  function extractFromChild(child: ChildNode, path: string) {
    if (child.nodeType === 'frame') {
      extractFromLayout(child.layout, `${path}.layout`);
      addRef(child.fillToken, 'variable', `${path}.fillToken`);
      addRef(child.strokeToken, 'variable', `${path}.strokeToken`);
      addRef(child.radiusToken, 'variable', `${path}.radiusToken`);
      addRef(child.shadowToken, 'effectStyle', `${path}.shadowToken`);
      child.children?.forEach((c, i) => extractFromChild(c, `${path}.children[${i}]`));
    } else if (child.nodeType === 'text') {
      addRef(child.textStyleToken, 'textStyle', `${path}.textStyleToken`);
      addRef(child.fillToken, 'variable', `${path}.fillToken`);
      addRef(child.opacityToken, 'variable', `${path}.opacityToken`);
      addRef(child.fillOpacityToken, 'variable', `${path}.fillOpacityToken`);
    } else if (child.nodeType === 'rectangle' || child.nodeType === 'ellipse') {
      addRef(child.fillToken, 'variable', `${path}.fillToken`);
      addRef(child.strokeToken, 'variable', `${path}.strokeToken`);
      if (child.nodeType === 'rectangle') {
        addRef((child as RectangleNode).radiusToken, 'variable', `${path}.radiusToken`);
      }
      addRef(child.opacityToken, 'variable', `${path}.opacityToken`);
      addRef(child.fillOpacityToken, 'variable', `${path}.fillOpacityToken`);
    }
    // instance nodes don't have direct token references
  }

  // Extract from components
  schema.components?.forEach((comp, i) => {
    const path = `components[${i}]`;
    extractFromLayout(comp.layout, `${path}.layout`);
    extractFromStyle(comp, path);
    comp.children?.forEach((child, j) => extractFromChild(child, `${path}.children[${j}]`));
  });

  // Extract from componentSets
  schema.componentSets?.forEach((set, i) => {
    const path = `componentSets[${i}]`;
    extractFromLayout(set.base.layout, `${path}.base.layout`);
    extractFromStyle(set.base, `${path}.base`);
    set.base.children?.forEach((child, j) => extractFromChild(child, `${path}.base.children[${j}]`));

    set.variants.forEach((variant, j) => {
      const variantPath = `${path}.variants[${j}]`;
      extractFromStyle(variant, variantPath);
      if (variant.layout) {
        extractFromLayout(variant.layout as LayoutProps, `${variantPath}.layout`);
      }
    });
  });

  return refs;
}
