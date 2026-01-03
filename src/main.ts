// src/main.ts
import { parseSchema, parseSchemas, extractTokenReferences, TokenReference, extractIconRefs } from './core/parser';
import { generateFromSchema, buildTokenMaps } from './core/generator';
import { IconRegistry } from './types/iconRegistry';
import { IconRegistryResolver } from './core/iconRegistry';

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
      : { valid: false, errors: [{ path: '', message: 'No JSON provided' }], warnings: [], schema: undefined, registries: [] };

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

    // Add icon validation
    const iconRefs = extractIconRefs(parseResult.schema);
    const iconResolver = new IconRegistryResolver(parseResult.registries);
    const iconIssues: Array<{ iconRef: string; error: string }> = [];

    for (const ref of iconRefs) {
      const resolved = iconResolver.resolve(ref.iconRef);
      if (resolved.error) {
        iconIssues.push({ iconRef: ref.iconRef, error: resolved.error });
      }
    }

    figma.ui.postMessage({
      type: 'token-validation-result',
      payload: {
        ...result,
        iconIssues,
        registriesLoaded: parseResult.registries.map(r => r.library),
      }
    });
    return;
  }

  if (msg.type === 'generate' && msg.payload) {
    const { json, jsonFiles, selectedIds } = msg.payload;

    // Parse schema(s) - support both single file (legacy) and multiple files
    const parseResult = jsonFiles && jsonFiles.length > 0
      ? parseSchemas(jsonFiles)
      : json
      ? parseSchema(json)
      : { valid: false, errors: [{ path: '', message: 'No JSON provided' }], warnings: [], registries: [] };

    if (!parseResult.valid || !parseResult.schema) {
      figma.notify(`Parse error: ${parseResult.errors[0]?.message || 'Unknown error'}`, { error: true });
      figma.ui.postMessage({ type: 'generation-complete' });
      return;
    }

    // Generate components
    const result = await generateFromSchema(parseResult.schema, selectedIds, parseResult.registries);

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

  if (msg.type === 'extract-registry' && msg.payload?.libraryName) {
    const libraryName = msg.payload.libraryName as string;
    const registry = await extractIconRegistry(libraryName);
    figma.ui.postMessage({
      type: 'extraction-result',
      payload: { registry }
    });
  }
};

async function extractIconRegistry(libraryName: string): Promise<IconRegistry & { extractionWarnings?: string[] }> {
  const icons: Record<string, string> = {};
  const warnings: string[] = [];
  const allNodes = figma.root.findAll(n => n.type === 'INSTANCE') as InstanceNode[];

  let processed = 0;
  let skipped = 0;

  for (const instance of allNodes) {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) {
      skipped++;
      continue;
    }

    try {
      const key = mainComponent.key;
      if (!key) {
        skipped++;
        continue;
      }
      const name = mainComponent.name.toLowerCase().replace(/\s+/g, '-');
      if (!icons[name]) {
        icons[name] = key;
        processed++;
      }
    } catch (e) {
      skipped++;
      console.warn(`Skipped instance ${instance.name}:`, e);
      // Local components don't have keys - this is expected
    }
  }

  if (skipped > 0 && processed === 0) {
    warnings.push(`Skipped ${skipped} instances (likely local components). Place library icons to extract.`);
  }

  return {
    type: 'icon-registry',
    library: libraryName.toLowerCase().replace(/\s+/g, '-'),
    figmaLibraryName: libraryName,
    extractedAt: new Date().toISOString(),
    icons,
    ...(warnings.length > 0 && { extractionWarnings: warnings }),
  };
}
