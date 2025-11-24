// src/core/parser.ts
import type { Schema, ValidationResult, ValidationError, ComponentDefinition, ComponentSetDefinition, ChildNode } from '../types/schema';

export interface ParseResult extends ValidationResult {
  schema?: Schema;
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
    const baseErrors = validateLayout((s.base as Record<string, unknown>).layout, `${path}.base.layout`);
    errors.push(...baseErrors.errors);
    warnings.push(...baseErrors.warnings);
  }
  if (!Array.isArray(s.variants)) {
    errors.push({ path, message: "Missing required field 'variants' (array)" });
  } else {
    s.variants.forEach((v, i) => {
      if (typeof v !== 'object' || !v || !('props' in (v as object))) {
        errors.push({ path: `${path}.variants[${i}]`, message: "Variant missing 'props'" });
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
  if (l.gap !== undefined && l.gapToken !== undefined) {
    errors.push({ path, message: "Cannot specify both 'gap' and 'gapToken'" });
  }

  return { errors, warnings };
}

function validateChildNode(node: unknown, path: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (typeof node !== 'object' || node === null) {
    errors.push({ path, message: 'Node must be an object' });
    return { errors, warnings };
  }

  const n = node as Record<string, unknown>;

  if (!n.nodeType || typeof n.nodeType !== 'string') {
    errors.push({ path, message: "Missing required field 'nodeType'" });
    return { errors, warnings };
  }

  const validTypes = ['frame', 'text', 'instance', 'rectangle'];
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

  // Recursive children validation for frames
  if (n.nodeType === 'frame' && n.children) {
    if (!Array.isArray(n.children)) {
      errors.push({ path: `${path}.children`, message: 'children must be an array' });
    } else {
      (n.children as unknown[]).forEach((child, i) => {
        const childErrors = validateChildNode(child, `${path}.children[${i}]`);
        errors.push(...childErrors.errors);
        warnings.push(...childErrors.warnings);
      });
    }
  }

  return { errors, warnings };
}
