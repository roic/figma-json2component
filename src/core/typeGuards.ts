// src/core/typeGuards.ts

import type { ChildNode } from '../types/schema';

/**
 * Type guard: checks if value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: checks if value is an array of strings.
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Type guard: checks if value is an array of numbers.
 */
export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number');
}

/**
 * Type guard: checks if an object has all required fields.
 * Note: This only checks field presence, not field types.
 */
export function hasRequiredFields<T extends Record<string, unknown>>(
  obj: unknown,
  fields: (keyof T)[]
): obj is T {
  if (!isRecord(obj)) return false;
  return fields.every(field => field in obj);
}

/**
 * Valid node types for ChildNode.
 */
const VALID_NODE_TYPES = ['frame', 'text', 'instance', 'rectangle', 'ellipse'] as const;

/**
 * Type guard: checks if value is a valid node type.
 */
export function isValidNodeType(value: unknown): value is ChildNode['nodeType'] {
  return typeof value === 'string' && VALID_NODE_TYPES.includes(value as typeof VALID_NODE_TYPES[number]);
}

/**
 * Type guard: checks if value is a string.
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard: checks if value is a number.
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Type guard: checks if value is a boolean.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
