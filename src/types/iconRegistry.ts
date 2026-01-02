// src/types/iconRegistry.ts

export interface IconRegistry {
  library: string;           // e.g., "lucide", "material"
  figmaLibraryName: string;  // e.g., "Lucide Icons" (for error messages)
  fileKey?: string;          // Figma file key (for version tracking)
  extractedAt?: string;      // ISO date string
  icons: Record<string, string>;  // iconName → componentKey
}

export interface IconRef {
  library: string;
  iconName: string;
  raw: string;  // Original "lucide:search" string
}

/**
 * Parse an iconRef string like "lucide:search" into parts.
 */
export function parseIconRef(ref: string): IconRef | null {
  const trimmed = ref.trim();
  const colonIndex = trimmed.indexOf(':');

  if (colonIndex === -1 || colonIndex === 0 || colonIndex === trimmed.length - 1) {
    return null;
  }

  const library = trimmed.slice(0, colonIndex).toLowerCase().trim();
  const iconName = trimmed.slice(colonIndex + 1).toLowerCase().trim();

  if (!library || !iconName) {
    return null;
  }

  return { library, iconName, raw: ref };
}

/**
 * Check if a parsed JSON object is an IconRegistry (vs a component schema).
 */
export function isIconRegistry(obj: unknown): obj is IconRegistry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'library' in obj &&
    'icons' in obj &&
    typeof (obj as IconRegistry).library === 'string' &&
    typeof (obj as IconRegistry).icons === 'object'
  );
}
