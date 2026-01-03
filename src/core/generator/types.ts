// src/core/generator/types.ts
import { IconRegistryResolver } from '../iconRegistry';

export interface GenerationContext {
  componentMap: Map<string, ComponentNode | ComponentSetNode>;
  variableMap: Map<string, Variable>;
  textStyleMap: Map<string, TextStyle>;
  effectStyleMap: Map<string, EffectStyle>;
  iconResolver: IconRegistryResolver;
  warnings: string[];
}

export interface GenerateResult {
  success: boolean;
  warnings: string[];
  error?: string;
  createdCount: number;
}

export const PLUGIN_DATA_KEY = 'jasoti.id';
export const PLUGIN_DATA_NODE_ID = 'jasoti.nodeId';
