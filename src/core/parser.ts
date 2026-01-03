// src/core/parser.ts
import type { Schema, ValidationResult, ComponentDefinition, ComponentSetDefinition, ChildNode, LayoutProps, StyleProps, RectangleNode, Organization } from '../types/schema';
import { parseIconRef, isIconRegistry, IconRegistry } from '../types/iconRegistry';
import { isRecord, isStringArray, isNumberArray, isValidNodeType, isString, isBoolean } from './typeGuards';
import { createError, ValidationError } from './errors';

const SCHEMA_LIMITS = {
  MAX_DEPTH: 50,
  MAX_COMPONENTS: 500,
  MAX_CHILDREN_PER_NODE: 200,
  MAX_VARIANTS: 100,
};

export interface ParseResult extends ValidationResult {
  schema?: Schema;
  registries: IconRegistry[];
}

/**
 * Parse and merge multiple JSON schema files.
 * Useful for component libraries split across multiple files.
 */
export function parseSchemas(jsonStrings: string[]): ParseResult {
  if (jsonStrings.length === 0) {
    return {
      valid: false,
      errors: [createError('EMPTY_SCHEMA', '', 'No schemas provided')],
      warnings: [],
      registries: [],
    };
  }

  // Parse each file - detect registries vs schemas
  const parsedSchemas: Schema[] = [];
  const registries: IconRegistry[] = [];
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  jsonStrings.forEach((jsonString, index) => {
    // First, try to parse as JSON to check if it's a registry
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      allErrors.push(createError(
        'INVALID_JSON',
        `[file ${index + 1}]`,
        `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
      ));
      return;
    }

    // Check if this is an icon registry
    if (isIconRegistry(parsed)) {
      registries.push(parsed);
      return;
    }

    // Otherwise, treat as component schema
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
      registries,
    };
  }

  // Merge all schemas and track file origins
  const idToFileIndex = new Map<string, number>();

  parsedSchemas.forEach((schema, fileIndex) => {
    schema.components?.forEach(c => {
      if (idToFileIndex.has(c.id)) {
        allErrors.push(createError(
          'DUPLICATE_ID',
          '',
          `Duplicate id '${c.id}' found in multiple files (first in file ${idToFileIndex.get(c.id)! + 1}, duplicate in file ${fileIndex + 1})`
        ));
      } else {
        idToFileIndex.set(c.id, fileIndex);
      }
    });

    schema.componentSets?.forEach(s => {
      if (idToFileIndex.has(s.id)) {
        allErrors.push(createError(
          'DUPLICATE_ID',
          '',
          `Duplicate id '${s.id}' found in multiple files (first in file ${idToFileIndex.get(s.id)! + 1}, duplicate in file ${fileIndex + 1})`
        ));
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
      registries,
    };
  }

  // Merge all schemas
  const mergedSchema = mergeSchemas(parsedSchemas);

  return {
    valid: true,
    errors: [],
    warnings: allWarnings,
    schema: mergedSchema,
    registries,
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
      errors: [createError('INVALID_JSON', '', `JSON parse error: ${message}`)],
      warnings: [],
      registries: [],
    };
  }

  // Step 2: Validate structure
  if (!isRecord(raw)) {
    return {
      valid: false,
      errors: [createError('INVALID_TYPE', '', 'Schema must be an object')],
      warnings: [],
      registries: [],
    };
  }

  const schema = raw;
  const result: Schema = {};

  // Validate organization
  if ('organization' in schema) {
    if (typeof schema.organization !== 'object' || schema.organization === null) {
      errors.push(createError('INVALID_TYPE', 'organization', 'organization must be an object'));
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
      errors.push(createError('INVALID_TYPE', 'components', 'components must be an array'));
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
      errors.push(createError('INVALID_TYPE', 'componentSets', 'componentSets must be an array'));
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

  // Check total component count
  const totalComponents = (schema.components?.length || 0) + (schema.componentSets?.length || 0);
  if (totalComponents > SCHEMA_LIMITS.MAX_COMPONENTS) {
    errors.push(createError(
      'MAX_COMPONENTS_EXCEEDED',
      'schema',
      `Schema has ${totalComponents} components, exceeding maximum of ${SCHEMA_LIMITS.MAX_COMPONENTS}`
    ));
  }

  // Check for duplicate IDs
  const allIds = [
    ...(result.components?.map(c => c.id) || []),
    ...(result.componentSets?.map(c => c.id) || []),
  ];
  const seen = new Set<string>();
  allIds.forEach(id => {
    if (seen.has(id)) {
      errors.push(createError('DUPLICATE_ID', '', `Duplicate id '${id}' found`));
    }
    seen.add(id);
  });

  // Warn if schema is empty
  if (allIds.length === 0) {
    warnings.push(createError('EMPTY_SCHEMA', '', 'Schema contains no components or componentSets'));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schema: errors.length === 0 ? result : undefined,
    registries: [],
  };
}

function validateComponent(comp: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(comp)) {
    errors.push(createError('INVALID_TYPE', path, 'Component must be an object'));
    return { errors, warnings };
  }

  const c = comp;

  // Required fields
  if (!isString(c.id)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'id'"));
  }
  if (!isString(c.name)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'name'"));
  }
  if (!isRecord(c.layout)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'layout'"));
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
      errors.push(createError('INVALID_TYPE', `${path}.children`, 'children must be an array'));
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

  if (!isRecord(set)) {
    errors.push(createError('INVALID_TYPE', path, 'ComponentSet must be an object'));
    return { errors, warnings };
  }

  const s = set;

  // Required fields
  if (!isString(s.id)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'id'"));
  }
  if (!isString(s.name)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'name'"));
  }
  if (!isStringArray(s.variantProps)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'variantProps' (array)"));
  }
  if (!isRecord(s.base)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'base'"));
  } else {
    const base = s.base;
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
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'variants' (array)"));
  } else if (s.variants.length === 0) {
    errors.push(createError('INVALID_VALUE', `${path}.variants`, 'componentSet must have at least one variant'));
  } else {
    if (s.variants.length > SCHEMA_LIMITS.MAX_VARIANTS) {
      errors.push(createError(
        'MAX_VARIANTS_EXCEEDED',
        `${path}.variants`,
        `ComponentSet has ${s.variants.length} variants, exceeding maximum of ${SCHEMA_LIMITS.MAX_VARIANTS}`
      ));
    }
    s.variants.forEach((v, i) => {
      if (!isRecord(v) || !('props' in v)) {
        errors.push(createError('MISSING_REQUIRED', `${path}.variants[${i}]`, "Variant missing 'props'"));
      } else {
        const variant = v;

        // Validate variant props match variantProps keys
        if (isStringArray(s.variantProps) && isRecord(variant.props)) {
          const variantProps = variant.props;
          const variantKeys = Object.keys(variantProps);
          const expectedKeys = s.variantProps;

          // Check all expected keys are present
          expectedKeys.forEach(key => {
            if (!(key in variantProps)) {
              errors.push(createError(
                'MISSING_REQUIRED',
                `${path}.variants[${i}].props`,
                `Missing required variant property '${key}'`
              ));
            }
          });

          // Warn about extra keys
          variantKeys.forEach(key => {
            if (!expectedKeys.includes(key)) {
              warnings.push(createError(
                'INVALID_VALUE',
                `${path}.variants[${i}].props`,
                `Unexpected variant property '${key}' (not in variantProps)`
              ));
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

  if (!isRecord(layout)) {
    errors.push(createError('INVALID_TYPE', path, 'Layout must be an object'));
    return { errors, warnings };
  }

  const l = layout;

  // Check for token/value conflicts
  if (l.padding !== undefined && l.paddingToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'padding' and 'paddingToken'"));
  }
  if (l.paddingTop !== undefined && l.paddingTopToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'paddingTop' and 'paddingTopToken'"));
  }
  if (l.paddingRight !== undefined && l.paddingRightToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'paddingRight' and 'paddingRightToken'"));
  }
  if (l.paddingBottom !== undefined && l.paddingBottomToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'paddingBottom' and 'paddingBottomToken'"));
  }
  if (l.paddingLeft !== undefined && l.paddingLeftToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'paddingLeft' and 'paddingLeftToken'"));
  }
  if (l.gap !== undefined && l.gapToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'gap' and 'gapToken'"));
  }

  // Validate wrap is boolean
  if (l.wrap !== undefined && !isBoolean(l.wrap)) {
    errors.push(createError('INVALID_TYPE', path, "wrap must be a boolean"));
  }

  return { errors, warnings };
}

function validateStyleProps(props: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(props)) {
    return { errors, warnings };
  }

  const p = props;

  // Check for token/value conflicts
  if (p.opacity !== undefined && p.opacityToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'opacity' and 'opacityToken'"));
  }
  if (p.fillOpacity !== undefined && p.fillOpacityToken !== undefined) {
    errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Cannot specify both 'fillOpacity' and 'fillOpacityToken'"));
  }

  // Validate opacity ranges (0-1)
  if (p.opacity !== undefined && typeof p.opacity === 'number') {
    if (p.opacity < 0 || p.opacity > 1) {
      errors.push(createError('INVALID_VALUE', path, "opacity must be between 0 and 1"));
    }
  }
  if (p.fillOpacity !== undefined && typeof p.fillOpacity === 'number') {
    if (p.fillOpacity < 0 || p.fillOpacity > 1) {
      errors.push(createError('INVALID_VALUE', path, "fillOpacity must be between 0 and 1"));
    }
  }

  // Validate strokeDash is array of numbers
  if (p.strokeDash !== undefined) {
    if (!isNumberArray(p.strokeDash)) {
      if (!Array.isArray(p.strokeDash)) {
        errors.push(createError('INVALID_TYPE', path, "strokeDash must be an array"));
      } else {
        errors.push(createError('INVALID_TYPE', path, "strokeDash must be an array of numbers"));
      }
    }
  }

  return { errors, warnings };
}

function validateChildNode(node: unknown, path: string, depth: number = 0): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check nesting depth to prevent stack overflow
  if (depth > SCHEMA_LIMITS.MAX_DEPTH) {
    errors.push(createError('MAX_DEPTH_EXCEEDED', path, `Maximum nesting depth (${SCHEMA_LIMITS.MAX_DEPTH}) exceeded`));
    return { errors, warnings };
  }

  if (!isRecord(node)) {
    errors.push(createError('INVALID_TYPE', path, 'Node must be an object'));
    return { errors, warnings };
  }

  const n = node;

  if (!isString(n.nodeType)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'nodeType'"));
    return { errors, warnings };
  }

  if (!isValidNodeType(n.nodeType)) {
    const validTypes = ['frame', 'text', 'instance', 'rectangle', 'ellipse'];
    errors.push(createError('INVALID_NODE_TYPE', path, `Invalid nodeType '${n.nodeType}'. Must be one of: ${validTypes.join(', ')}`));
    return { errors, warnings };
  }

  // All nodes except instance require id (instance.id is optional per schema)
  if (n.nodeType !== 'instance' && !isString(n.id)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'id'"));
  }

  if (!isString(n.name)) {
    errors.push(createError('MISSING_REQUIRED', path, "Missing required field 'name'"));
  }

  // Instance-specific validation
  if (n.nodeType === 'instance') {
    const hasRef = isString(n.ref);
    const hasComponentKey = isString(n.componentKey);
    const hasIconRef = isString(n.iconRef);

    const refCount = [hasRef, hasComponentKey, hasIconRef].filter(Boolean).length;

    if (refCount === 0) {
      errors.push(createError('MISSING_REQUIRED', path, "Instance requires 'ref', 'componentKey', or 'iconRef'"));
    }
    if (refCount > 1) {
      errors.push(createError('MUTUALLY_EXCLUSIVE', path, "Instance can only have one of 'ref', 'componentKey', or 'iconRef'"));
    }

    if (hasIconRef && isString(n.iconRef)) {
      const parsed = parseIconRef(n.iconRef);
      if (!parsed) {
        errors.push(createError('INVALID_ICON_REF', path, "Invalid iconRef format. Expected 'library:iconName' (e.g., 'lucide:search')"));
      }
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
      if (!isString(n.imageUrl)) {
        errors.push(createError('INVALID_TYPE', `${path}.imageUrl`, 'imageUrl must be a string'));
      } else if (!n.imageUrl.startsWith('http://') && !n.imageUrl.startsWith('https://')) {
        warnings.push(createError('INVALID_VALUE', `${path}.imageUrl`, 'imageUrl should be a valid HTTP(S) URL'));
      }
    }
    if (n.imageScaleMode !== undefined) {
      const validScaleModes = ['FILL', 'FIT', 'CROP', 'TILE'];
      if (!isString(n.imageScaleMode) || !validScaleModes.includes(n.imageScaleMode)) {
        errors.push(createError('INVALID_VALUE', `${path}.imageScaleMode`, `imageScaleMode must be one of: ${validScaleModes.join(', ')}`));
      }
    }
  }

  // Recursive children validation for frames
  if (n.nodeType === 'frame' && n.children) {
    if (!Array.isArray(n.children)) {
      errors.push(createError('INVALID_TYPE', `${path}.children`, 'children must be an array'));
    } else {
      const children = n.children as unknown[];
      if (children.length > SCHEMA_LIMITS.MAX_CHILDREN_PER_NODE) {
        errors.push(createError(
          'MAX_CHILDREN_EXCEEDED',
          path,
          `Node has ${children.length} children, exceeding maximum of ${SCHEMA_LIMITS.MAX_CHILDREN_PER_NODE}`
        ));
      }
      children.forEach((child, i) => {
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

  if (!isRecord(org)) {
    return { errors, warnings };
  }

  const o = org;

  // Validate groupBy
  if (o.groupBy !== undefined) {
    const validGroupBy = ['category', 'tags', 'none'];
    if (!isString(o.groupBy) || !validGroupBy.includes(o.groupBy)) {
      const validOptions = validGroupBy.join(', ');
      errors.push(createError('INVALID_VALUE', `${path}.groupBy`, `groupBy must be one of: ${validOptions}`));
    }
  }

  // Validate layout
  if (o.layout !== undefined) {
    const validLayout = ['frames', 'pages', 'grid'];
    if (!isString(o.layout) || !validLayout.includes(o.layout)) {
      const validOptions = validLayout.join(', ');
      errors.push(createError('INVALID_VALUE', `${path}.layout`, `layout must be one of: ${validOptions}`));
    }
  }

  // Validate gridColumns
  if (o.gridColumns !== undefined) {
    if (typeof o.gridColumns !== 'number' || o.gridColumns < 1) {
      errors.push(createError('INVALID_VALUE', `${path}.gridColumns`, 'gridColumns must be a positive number'));
    }
  }

  // Validate spacing
  if (o.spacing !== undefined) {
    if (typeof o.spacing !== 'number' || o.spacing < 0) {
      errors.push(createError('INVALID_VALUE', `${path}.spacing`, 'spacing must be a non-negative number'));
    }
  }

  // Validate sortBy
  if (o.sortBy !== undefined) {
    const validSortBy = ['alphabetical', 'schema-order'];
    if (!isString(o.sortBy) || !validSortBy.includes(o.sortBy)) {
      const validOptions = validSortBy.join(', ');
      errors.push(createError('INVALID_VALUE', `${path}.sortBy`, `sortBy must be one of: ${validOptions}`));
    }
  }

  // Validate frameLabels
  if (o.frameLabels !== undefined && !isBoolean(o.frameLabels)) {
    errors.push(createError('INVALID_TYPE', `${path}.frameLabels`, 'frameLabels must be a boolean'));
  }

  // Validate pagePrefixes
  if (o.pagePrefixes !== undefined && !isBoolean(o.pagePrefixes)) {
    errors.push(createError('INVALID_TYPE', `${path}.pagePrefixes`, 'pagePrefixes must be a boolean'));
  }

  return { errors, warnings };
}

// ============ Token Extraction ============

export interface TokenReference {
  token: string;
  category: 'variable' | 'textStyle' | 'effectStyle';
  path: string;  // Where in schema this token is referenced
}

/**
 * Extract all token references from a parsed schema.
 * Returns a list of unique tokens with their types and locations.
 */
export function extractTokenReferences(schema: Schema): TokenReference[] {
  const refs: TokenReference[] = [];
  const seen = new Set<string>();

  function addRef(token: string | undefined, category: TokenReference['category'], path: string) {
    if (!token) return;
    const key = `${category}:${token}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ token, category, path });
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

// ============ Icon Reference Extraction ============

export interface IconReference {
  iconRef: string;
  path: string;
}

/**
 * Extract all iconRef references from a schema for pre-flight validation.
 */
export function extractIconRefs(schema: Schema): IconReference[] {
  const refs: IconReference[] = [];

  function walkChildren(children: ChildNode[] | undefined, path: string) {
    if (!children) return;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childPath = `${path}.children[${i}]`;

      if (child.nodeType === 'instance' && child.iconRef) {
        refs.push({ iconRef: child.iconRef, path: childPath });
      }

      // Recurse into any node with children (frames)
      if (child.nodeType === 'frame' && child.children) {
        walkChildren(child.children, childPath);
      }
    }
  }

  schema.components?.forEach((comp, i) => {
    walkChildren(comp.children, `components[${i}]`);
  });

  schema.componentSets?.forEach((set, i) => {
    walkChildren(set.base.children, `componentSets[${i}].base`);
  });

  return refs;
}
