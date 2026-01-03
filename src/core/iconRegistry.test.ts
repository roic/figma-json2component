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

describe('IconRegistryResolver edge cases', () => {
  it('handles empty registry', () => {
    const emptyRegistry: IconRegistry = {
      type: 'icon-registry',
      library: 'empty',
      figmaLibraryName: 'Empty',
      icons: {}
    };

    const resolver = new IconRegistryResolver([emptyRegistry]);
    const result = resolver.resolve('empty:anything');

    expect(result.componentKey).toBeNull();
    expect(result.error).toContain('not found');
  });

  it('handles registry with special characters in icon names', () => {
    const registry: IconRegistry = {
      type: 'icon-registry',
      library: 'test',
      figmaLibraryName: 'Test',
      icons: {
        'arrow-left': 'key1',
        'arrow_right': 'key2',
        'arrow.up': 'key3'
      }
    };

    const resolver = new IconRegistryResolver([registry]);

    expect(resolver.resolve('test:arrow-left').componentKey).toBe('key1');
    expect(resolver.resolve('test:arrow_right').componentKey).toBe('key2');
    expect(resolver.resolve('test:arrow.up').componentKey).toBe('key3');
  });

  it('provides multiple suggestions for partial matches', () => {
    const registry: IconRegistry = {
      type: 'icon-registry',
      library: 'test',
      figmaLibraryName: 'Test',
      icons: {
        'search': 'key1',
        'search-plus': 'key2',
        'search-minus': 'key3'
      }
    };

    const resolver = new IconRegistryResolver([registry]);
    const result = resolver.resolve('test:sear');

    expect(result.error).toContain('search');
  });
});
