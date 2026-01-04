#!/usr/bin/env npx tsx
/**
 * Extract Icon Registry from Figma Library
 *
 * Fetches all components from a Figma file and outputs a JASOTI-compatible
 * icon registry JSON.
 *
 * Usage:
 *   FIGMA_API_TOKEN=xxx npx tsx scripts/extract-registry.ts <file-key> <library-name>
 *
 * Example:
 *   FIGMA_API_TOKEN=xxx npx tsx scripts/extract-registry.ts abc123 lucide > registries/lucide/latest.json
 *
 * Arguments:
 *   file-key     - The Figma file key (from URL: figma.com/file/<file-key>/...)
 *   library-name - Short name for the library (e.g., "lucide", "material", "heroicons")
 */

interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  containing_frame?: {
    name: string;
  };
}

interface FigmaComponentsResponse {
  error?: boolean;
  status?: number;
  message?: string;
  meta?: {
    components: FigmaComponent[];
  };
}

interface IconRegistry {
  type: 'icon-registry';
  library: string;
  figmaLibraryName: string;
  fileKey: string;
  extractedAt: string;
  iconCount: number;
  icons: Record<string, string>;
}

async function fetchComponents(fileKey: string, token: string): Promise<FigmaComponent[]> {
  const url = `https://api.figma.com/v1/files/${fileKey}/components`;

  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': token,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Figma API error (${response.status}): ${text}`);
  }

  const data: FigmaComponentsResponse = await response.json();

  if (data.error) {
    throw new Error(`Figma API error: ${data.message || 'Unknown error'}`);
  }

  return data.meta?.components || [];
}

function normalizeIconName(name: string): string {
  // Remove common prefixes/suffixes
  let normalized = name
    .replace(/^(icon[-_]?|ic[-_]?)/i, '')  // Remove "icon-", "ic_" prefixes
    .replace(/([-_]?icon)$/i, '')           // Remove "-icon" suffix
    .toLowerCase()
    .trim();

  // Convert separators to consistent format
  normalized = normalized
    .replace(/[\s_]+/g, '-')  // spaces and underscores to hyphens
    .replace(/-+/g, '-')      // collapse multiple hyphens
    .replace(/^-|-$/g, '');   // trim hyphens

  return normalized;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: FIGMA_API_TOKEN=xxx npx tsx scripts/extract-registry.ts <file-key> <library-name>');
    console.error('');
    console.error('Example:');
    console.error('  FIGMA_API_TOKEN=xxx npx tsx scripts/extract-registry.ts abc123def lucide');
    process.exit(1);
  }

  const [fileKey, libraryName] = args;
  const token = process.env.FIGMA_API_TOKEN;

  if (!token) {
    console.error('Error: FIGMA_API_TOKEN environment variable is required');
    console.error('');
    console.error('Get your token from: Figma → Settings → Personal Access Tokens');
    process.exit(1);
  }

  console.error(`Fetching components from Figma file: ${fileKey}...`);

  const components = await fetchComponents(fileKey, token);

  console.error(`Found ${components.length} components`);

  // Build icon mapping
  const icons: Record<string, string> = {};
  const duplicates: string[] = [];

  for (const component of components) {
    const normalizedName = normalizeIconName(component.name);

    if (icons[normalizedName]) {
      duplicates.push(`${normalizedName} (${component.name})`);
      // Keep the first one, but could also use containing_frame to disambiguate
      continue;
    }

    icons[normalizedName] = component.key;
  }

  if (duplicates.length > 0) {
    console.error(`Warning: ${duplicates.length} duplicate names (kept first occurrence):`);
    duplicates.slice(0, 10).forEach(d => console.error(`  - ${d}`));
    if (duplicates.length > 10) {
      console.error(`  ... and ${duplicates.length - 10} more`);
    }
  }

  // Determine library display name from first component's frame or file
  const figmaLibraryName = components[0]?.containing_frame?.name || libraryName;

  const registry: IconRegistry = {
    type: 'icon-registry',
    library: libraryName.toLowerCase(),
    figmaLibraryName,
    fileKey,
    extractedAt: new Date().toISOString().split('T')[0],
    iconCount: Object.keys(icons).length,
    icons,
  };

  // Output to stdout (can be redirected to file)
  console.log(JSON.stringify(registry, null, 2));

  console.error(`\nSuccess! Extracted ${registry.iconCount} icons for "${libraryName}"`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
