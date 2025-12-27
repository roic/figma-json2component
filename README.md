# JSON2Components

A Figma plugin that generates components from JSON schema with design token references.

## Quick Start

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. In Figma: Plugins → Development → Import plugin from manifest
4. Select `manifest.json`

## Development

- `npm run build` - Build once
- `npm run watch` - Watch for changes
- `npm test` - Run tests

## JSON Schema

**📖 [Complete Schema Reference Guide](docs/SCHEMA.md)** - Comprehensive specification with examples

**📄 Example:** See `examples/buttons.json` for a working example

**🎨 Design Spec:** See `docs/plans/2025-11-24-json2components-design.md` for architecture details

## Usage

1. Create a JSON file following the schema
2. Open the plugin in Figma
3. Click "Select JSON File" and choose your file
4. Review the components list
5. Click "Generate Components"

## Prerequisites

- Figma variables must exist for all token references (use Tokens Studio)
- Text styles must exist for `textStyleToken` references
