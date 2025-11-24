import * as esbuild from 'esbuild';
import * as fs from 'fs';

const isWatch = process.argv.includes('--watch');

// Build main.ts (Figma sandbox)
const mainConfig = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
};

// Build ui.ts and inline into HTML
const uiConfig = {
  entryPoints: ['src/ui.ts'],
  bundle: true,
  outfile: 'dist/ui.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
};

async function buildUI() {
  await esbuild.build(uiConfig);
  const uiJs = fs.readFileSync('dist/ui.js', 'utf8');
  const uiHtml = fs.readFileSync('src/ui.html', 'utf8');
  const finalHtml = uiHtml.replace('<!-- SCRIPT -->', `<script>${uiJs}</script>`);
  fs.writeFileSync('dist/ui.html', finalHtml);
  fs.unlinkSync('dist/ui.js');
}

async function build() {
  await esbuild.build(mainConfig);
  await buildUI();
  console.log('Build complete');
}

if (isWatch) {
  const ctx1 = await esbuild.context(mainConfig);
  const ctx2 = await esbuild.context(uiConfig);
  await ctx1.watch();
  console.log('Watching for changes...');
  // For watch mode, rebuild UI on change
  fs.watch('src', { recursive: true }, async () => {
    await build();
  });
} else {
  await build();
}
