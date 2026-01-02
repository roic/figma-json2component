#!/usr/bin/env npx ts-node
/**
 * Validate all JSON schema files in a folder.
 * Usage: npx ts-node scripts/validate-schemas.ts <folder-path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseSchema, parseSchemas } from '../src/core/parser';

const folder = process.argv[2];

if (!folder) {
  console.error('Usage: npx ts-node scripts/validate-schemas.ts <folder-path>');
  process.exit(1);
}

const absoluteFolder = path.resolve(folder);

if (!fs.existsSync(absoluteFolder)) {
  console.error(`Folder not found: ${absoluteFolder}`);
  process.exit(1);
}

// Find all JSON files
const files = fs.readdirSync(absoluteFolder)
  .filter(f => f.endsWith('.json'))
  .map(f => path.join(absoluteFolder, f));

if (files.length === 0) {
  console.error(`No JSON files found in: ${absoluteFolder}`);
  process.exit(1);
}

console.log(`Found ${files.length} JSON file(s) in ${absoluteFolder}\n`);

// Test 1: Validate each file individually
console.log('=== Individual File Validation ===\n');

let individualErrors = 0;
let individualWarnings = 0;

for (const file of files) {
  const filename = path.basename(file);
  const content = fs.readFileSync(file, 'utf-8');
  const result = parseSchema(content);

  if (result.valid) {
    const componentCount = (result.schema?.components?.length || 0) +
                          (result.schema?.componentSets?.length || 0);
    const warningText = result.warnings.length > 0
      ? ` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`
      : '';
    console.log(`✅ ${filename} - ${componentCount} component(s)${warningText}`);

    if (result.warnings.length > 0) {
      individualWarnings += result.warnings.length;
      result.warnings.forEach(w => console.log(`   ⚠️  ${w.path}: ${w.message}`));
    }
  } else {
    console.log(`❌ ${filename}`);
    result.errors.forEach(e => console.log(`   ${e.path}: ${e.message}`));
    individualErrors += result.errors.length;
  }
}

// Test 2: Validate all files merged together
console.log('\n=== Merged Schema Validation ===\n');

const allContents = files.map(f => fs.readFileSync(f, 'utf-8'));
const mergedResult = parseSchemas(allContents);

if (mergedResult.valid) {
  const totalComponents = (mergedResult.schema?.components?.length || 0);
  const totalSets = (mergedResult.schema?.componentSets?.length || 0);
  console.log(`✅ All files merge successfully`);
  console.log(`   Total: ${totalComponents} component(s), ${totalSets} componentSet(s)`);

  if (mergedResult.warnings.length > 0) {
    console.log(`   ⚠️  ${mergedResult.warnings.length} warning(s):`);
    mergedResult.warnings.forEach(w => console.log(`      ${w.path}: ${w.message}`));
  }
} else {
  console.log(`❌ Merge failed with ${mergedResult.errors.length} error(s):`);
  mergedResult.errors.forEach(e => console.log(`   ${e.path}: ${e.message}`));
}

// Summary
console.log('\n=== Summary ===\n');
console.log(`Files: ${files.length}`);
console.log(`Individual errors: ${individualErrors}`);
console.log(`Individual warnings: ${individualWarnings}`);
console.log(`Merge: ${mergedResult.valid ? 'OK' : 'FAILED'}`);

process.exit(mergedResult.valid && individualErrors === 0 ? 0 : 1);
