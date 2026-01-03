// src/core/errors.ts

export type ValidationErrorCode =
  | 'INVALID_JSON'
  | 'MISSING_REQUIRED'
  | 'INVALID_TYPE'
  | 'DUPLICATE_ID'
  | 'INVALID_NODE_TYPE'
  | 'MAX_DEPTH_EXCEEDED'
  | 'MAX_COMPONENTS_EXCEEDED'
  | 'MAX_CHILDREN_EXCEEDED'
  | 'MAX_VARIANTS_EXCEEDED'
  | 'INVALID_TOKEN_FORMAT'
  | 'INVALID_ICON_REF'
  | 'MUTUALLY_EXCLUSIVE'
  | 'INVALID_VALUE'
  | 'EMPTY_SCHEMA';

export interface ValidationError {
  path: string;
  message: string;
  code: ValidationErrorCode;
}

export function createError(
  code: ValidationErrorCode,
  path: string,
  message: string
): ValidationError {
  return { code, path, message };
}
