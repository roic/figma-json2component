# JASOTI Icon Registries

Pre-built icon registries for popular Figma libraries. Load these alongside your component schemas to use `iconRef` references without manual extraction.

## Usage

1. Download the registry JSON for your library
2. Load it with your component schema in JASOTI
3. Use `iconRef` in your components:

```json
{
  "nodeType": "instance",
  "name": "SearchIcon",
  "iconRef": "lucide:search"
}
```

## Available Registries

| Library | File | Icons | Last Updated |
|---------|------|-------|--------------|
| *Coming soon* | | | |

## Extracting Your Own Registry

If you need a library not listed here, or want the latest version:

### Prerequisites

1. Get a Figma API token: Figma → Settings → Personal Access Tokens
2. Duplicate the library's community file to your drafts
3. Copy the file key from the URL: `figma.com/file/<FILE_KEY>/...`

### Run Extraction

```bash
# From the repo root
FIGMA_API_TOKEN=your_token npx tsx scripts/extract-registry.ts <file-key> <library-name>

# Example: Extract Lucide icons
FIGMA_API_TOKEN=xxx npx tsx scripts/extract-registry.ts abc123def lucide > registries/lucide.json
```

### Output

The script outputs a JASOTI-compatible registry:

```json
{
  "type": "icon-registry",
  "library": "lucide",
  "figmaLibraryName": "Lucide Icons",
  "fileKey": "abc123def",
  "extractedAt": "2026-01-04",
  "iconCount": 1400,
  "icons": {
    "search": "component-key-1",
    "home": "component-key-2",
    ...
  }
}
```

## Contributing Registries

To add a registry for a popular library:

1. Extract using the script above
2. Save to `registries/<library-name>.json`
3. Update the table in this README
4. Submit a PR

## Notes

- Component keys are stable across library updates (existing icons keep their keys)
- New icons added to libraries will need re-extraction
- The `extractedAt` field helps track when a registry was last updated
