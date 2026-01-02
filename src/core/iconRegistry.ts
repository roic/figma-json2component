// src/core/iconRegistry.ts

import { IconRegistry, parseIconRef } from '../types/iconRegistry';

export interface IconResolveResult {
  componentKey: string | null;
  library: string;
  iconName: string;
  libraryDisplayName?: string;
  error?: string;
}

export class IconRegistryResolver {
  private registries: Map<string, IconRegistry> = new Map();

  constructor(registries: IconRegistry[] = []) {
    for (const registry of registries) {
      this.addRegistry(registry);
    }
  }

  addRegistry(registry: IconRegistry): void {
    this.registries.set(registry.library.toLowerCase(), registry);
  }

  getAvailableLibraries(): string[] {
    return [...this.registries.keys()];
  }

  getLibraryDisplayName(library: string): string {
    return this.registries.get(library.toLowerCase())?.figmaLibraryName || library;
  }

  resolve(iconRef: string): IconResolveResult {
    const parsed = parseIconRef(iconRef);

    if (!parsed) {
      return {
        componentKey: null,
        library: '',
        iconName: '',
        error: `Invalid iconRef format: '${iconRef}'. Expected 'library:iconName' (e.g., 'lucide:search')`,
      };
    }

    const registry = this.registries.get(parsed.library);

    if (!registry) {
      const available = this.getAvailableLibraries();
      const availableText = available.length > 0
        ? `Available: ${available.join(', ')}`
        : 'No icon registries loaded';

      return {
        componentKey: null,
        library: parsed.library,
        iconName: parsed.iconName,
        error: `Unknown icon library '${parsed.library}'. ${availableText}. Load a registry file for this library.`,
      };
    }

    const componentKey = registry.icons[parsed.iconName];

    if (!componentKey) {
      const suggestions = this.findSuggestions(registry, parsed.iconName);
      const suggestionText = suggestions.length > 0
        ? ` Did you mean: ${suggestions.join(', ')}?`
        : '';

      return {
        componentKey: null,
        library: parsed.library,
        iconName: parsed.iconName,
        libraryDisplayName: registry.figmaLibraryName,
        error: `Icon '${parsed.iconName}' not found in ${registry.figmaLibraryName}.${suggestionText}`,
      };
    }

    return {
      componentKey,
      library: parsed.library,
      iconName: parsed.iconName,
      libraryDisplayName: registry.figmaLibraryName,
    };
  }

  private findSuggestions(registry: IconRegistry, iconName: string): string[] {
    const allIcons = Object.keys(registry.icons);

    // Find icons that contain the search term or vice versa
    const matches = allIcons.filter(name =>
      name.includes(iconName) || iconName.includes(name)
    );

    // Sort by length similarity and return top 3
    return matches
      .sort((a, b) => Math.abs(a.length - iconName.length) - Math.abs(b.length - iconName.length))
      .slice(0, 3);
  }
}
