// src/main.ts
import { parseSchema, parseSchemas } from './core/parser';
import { generateFromSchema } from './core/generator';

figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg: { type: string; payload?: { json?: string; jsonFiles?: string[]; selectedIds: string[] } }) => {
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
