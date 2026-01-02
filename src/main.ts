// src/main.ts
import { parseSchema, parseSchemas, extractTokenReferences, TokenReference } from './core/parser';
import { generateFromSchema, buildTokenMaps } from './core/generator';

figma.showUI(__html__, { width: 400, height: 500 });

interface TokenValidationResult {
  found: Array<{ token: string; type: string }>;
  missing: Array<{ token: string; type: string; suggestion?: string }>;
  total: number;
}

figma.ui.onmessage = async (msg: { type: string; payload?: { json?: string; jsonFiles?: string[]; selectedIds?: string[] } }) => {
  // Pre-flight token validation
  if (msg.type === 'validate-tokens' && msg.payload) {
    const { jsonFiles } = msg.payload;

    const parseResult = jsonFiles && jsonFiles.length > 0
      ? parseSchemas(jsonFiles)
      : { valid: false, errors: [{ path: '', message: 'No JSON provided' }], warnings: [], schema: undefined };

    if (!parseResult.valid || !parseResult.schema) {
      figma.ui.postMessage({
        type: 'token-validation-result',
        payload: { error: parseResult.errors[0]?.message || 'Parse error' }
      });
      return;
    }

    // Extract all token references
    const tokenRefs = extractTokenReferences(parseResult.schema);

    // Build token maps for lookup
    const { variableMap, textStyleMap, effectStyleMap } = await buildTokenMaps();

    // Validate each token
    const result: TokenValidationResult = { found: [], missing: [], total: tokenRefs.length };

    for (const ref of tokenRefs) {
      const tokenLower = ref.token.toLowerCase();
      let isFound = false;

      if (ref.type === 'variable') {
        isFound = variableMap.has(tokenLower);
      } else if (ref.type === 'textStyle') {
        isFound = textStyleMap.has(tokenLower);
      } else if (ref.type === 'effectStyle') {
        isFound = effectStyleMap.has(tokenLower);
      }

      if (isFound) {
        result.found.push({ token: ref.token, type: ref.type });
      } else {
        // Try to find a suggestion
        let suggestion: string | undefined;
        const targetMap = ref.type === 'variable' ? variableMap
          : ref.type === 'textStyle' ? textStyleMap
          : effectStyleMap;

        // Simple suffix match for suggestions
        const suffix = tokenLower.split(/[./]/).pop() || '';
        for (const key of targetMap.keys()) {
          if (key.endsWith(suffix) && key !== tokenLower) {
            suggestion = key;
            break;
          }
        }

        result.missing.push({ token: ref.token, type: ref.type, suggestion });
      }
    }

    figma.ui.postMessage({ type: 'token-validation-result', payload: result });
    return;
  }

  if (msg.type === 'generate' && msg.payload) {
    const { json, jsonFiles, selectedIds } = msg.payload;

    // Parse schema(s) - support both single file (legacy) and multiple files
    const parseResult = jsonFiles && jsonFiles.length > 0
      ? parseSchemas(jsonFiles)
      : json
      ? parseSchema(json)
      : { valid: false, errors: [{ path: '', message: 'No JSON provided' }], warnings: [] };

    if (!parseResult.valid || !parseResult.schema) {
      figma.notify(`Parse error: ${parseResult.errors[0]?.message || 'Unknown error'}`, { error: true });
      figma.ui.postMessage({ type: 'generation-complete' });
      return;
    }

    // Generate components
    const result = await generateFromSchema(parseResult.schema, selectedIds);

    if (!result.success) {
      figma.notify(`Generation error: ${result.error}`, { error: true });
    } else {
      figma.notify(`Generated ${result.createdCount} components`);

      if (result.warnings.length > 0) {
        // Log warnings to Figma console for debugging
        console.warn(`⚠️ Token resolution warnings (${result.warnings.length}):`);
        result.warnings.forEach(w => console.warn('  ' + w));

        figma.ui.postMessage({ type: 'token-warnings', payload: result.warnings });
      }
    }

    figma.ui.postMessage({ type: 'generation-complete' });
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
