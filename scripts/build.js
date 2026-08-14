/**
 * build.js — esbuild bundler for the Assessment Platform
 * ════════════════════════════════════════════════════════
 * Usage:
 *   node scripts/build.js             → one-time build
 *   node scripts/build.js --watch     → rebuild on file changes
 *
 * Outputs to public/dist/ — four independent minified scripts:
 *   core.js, admin.js, student.js, evaluator.js
 *
 * NOTE: These are plain scripts (not ES modules), so bundle:false.
 * esbuild still minifies, strips whitespace, and shortens identifiers.
 */

const esbuild  = require('esbuild');
const path     = require('path');
const fs       = require('fs');

const isWatch  = process.argv.includes('--watch');
const outDir   = path.resolve(__dirname, '../public/dist');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const entryPoints = [
  'public/js/core.js',
  'public/js/admin.js',
  'public/js/student.js',
  'public/js/evaluator.js',
];

const buildOptions = {
  entryPoints,
  bundle:   false,     // plain scripts — no import/export to resolve
  minify:   true,
  target:   ['chrome90', 'firefox90', 'safari14'],
  outdir:   'public/dist',
  logLevel: 'info',
  // Source maps in dev mode only — controlled by NODE_ENV
  sourcemap: process.env.NODE_ENV !== 'production',
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('[esbuild] Watching for changes in public/js/...');
  }).catch(err => {
    console.error('[esbuild] Watch failed:', err);
    process.exit(1);
  });
} else {
  esbuild.build(buildOptions)
    .then(result => {
      console.log('[esbuild] Build complete →', outDir);
    })
    .catch(err => {
      console.error('[esbuild] Build failed:', err);
      process.exit(1);
    });
}
