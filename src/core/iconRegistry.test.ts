import { describe, it, expect } from 'vitest';
import { IconRegistryResolver } from './iconRegistry';
import { IconRegistry } from '../types/iconRegistry';

describe('IconRegistryResolver', () => {
  const lucideRegistry: IconRegistry = {
    type: 'icon-registry',
    library: 'lucide',
    figmaLibraryName: 'Lucide Icons',
    icons: {
      'search': 'key-search-123',
      'home': 'key-home-456',
      'settings': 'key-settings-789',
    }
  };

  const materialRegistry: IconRegistry = {
    type: 'icon-registry',
    library: 'material',
    figmaLibraryName: 'Material Design Icons',
    icons: {
      'search': 'mat-search-abc',
      'home': 'mat-home-def',
    }
  };

  it('resolves valid iconRef', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('lucide:search');

    expect(result.componentKey).toBe('key-search-123');
    expect(result.error).toBeUndefined();
  });

  it('resolves from correct library when multiple loaded', () => {
    const resolver = new IconRegistryResolver([lucideRegistry, materialRegistry]);

    const lucideResult = resolver.resolve('lucide:search');
    expect(lucideResult.componentKey).toBe('key-search-123');

    const materialResult = resolver.resolve('material:search');
    expect(materialResult.componentKey).toBe('mat-search-abc');
  });

  it('returns error for unknown library', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('unknown:search');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('unknown');
    expect(result.error).toContain('lucide');  // Should list available
  });

  it('returns error for unknown icon with suggestions', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('lucide:sear');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('sear');
    expect(result.error).toContain('search');  // Should suggest similar
  });

  it('handles case insensitivity', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);

    expect(resolver.resolve('LUCIDE:SEARCH').componentKey).toBe('key-search-123');
    expect(resolver.resolve('Lucide:Search').componentKey).toBe('key-search-123');
  });

  it('returns error for invalid format', () => {
    const resolver = new IconRegistryResolver([lucideRegistry]);
    const result = resolver.resolve('invalid-format');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('format');
  });
});
