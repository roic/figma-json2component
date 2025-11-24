// src/main.ts
import { parseSchema } from './core/parser';
import { generateFromSchema } from './core/generator';

figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg: { type: string; payload?: { json: string; selectedIds: string[] } }) => {
  if (msg.type === 'generate' && msg.payload) {
    const { json, selectedIds } = msg.payload;

    // Parse schema
    const parseResult = parseSchema(json);
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
        figma.ui.postMessage({ type: 'token-warnings', payload: result.warnings });
      }
    }

    figma.ui.postMessage({ type: 'generation-complete' });
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
