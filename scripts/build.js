/**
 * build.js — esbuild bundler with Content-Hashing & Service Worker Generator
 * ══════════════════════════════════════════════════════════════════════════
 * Usage:
 *   node scripts/build.js             → one-time build
 *   node scripts/build.js --watch     → rebuild on file changes
 *
 * Outputs to public/dist/ with content hashes, generates manifest.json,
 * updates index.html script tag, and compiles public/sw.js.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isWatch = process.argv.includes('--watch');
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'public/dist');
const indexHtmlPath = path.resolve(rootDir, 'public/index.html');
const swTemplatePath = path.resolve(rootDir, 'scripts/sw-template.js');
const swDestPath = path.resolve(rootDir, 'public/sw.js');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const entryPoints = [
  { name: 'core.js', path: 'public/js/core.js' },
  { name: 'admin.js', path: 'public/js/admin.js' },
  { name: 'student.js', path: 'public/js/student.js' },
  { name: 'evaluator.js', path: 'public/js/evaluator.js' },
];

async function runBuild() {
  const isProd = process.env.NODE_ENV === 'production';
  // Never emit sourcemaps in production (Vercel sets NODE_ENV=production)
  // so esbuild does not produce .map output files that would otherwise be missing
  const enableSourcemap = !isProd;
  const manifest = {};
  const precacheUrls = [];
  const combinedHash = crypto.createHash('md5');

  // Clean old files in public/dist
  const existingFiles = fs.readdirSync(outDir);
  for (const file of existingFiles) {
    if (file.endsWith('.js') || file.endsWith('.map') || file === 'manifest.json') {
      try {
        fs.unlinkSync(path.join(outDir, file));
      } catch {}
    }
  }

  for (const entry of entryPoints) {
    const entryFullPath = path.resolve(rootDir, entry.path);
    const result = await esbuild.build({
      entryPoints: [entryFullPath],
      outdir: 'public/dist',
      bundle: false,
      minify: true,
      target: ['chrome90', 'firefox90', 'safari14'],
      write: false,
      sourcemap: enableSourcemap,
    });

    for (const out of result.outputFiles) {
      if (out.path.endsWith('.js')) {
        const hash = crypto.createHash('md5').update(out.contents).digest('hex').slice(0, 8);
        combinedHash.update(hash);
        const baseName = path.basename(entry.name, '.js');
        const hashedFilename = `${baseName}.${hash}.js`;

        // Write hashed file
        fs.writeFileSync(path.join(outDir, hashedFilename), out.contents);
        // Also write unhashed file for direct fallback if needed
        fs.writeFileSync(path.join(outDir, `${baseName}.js`), out.contents);

        manifest[entry.name] = `/dist/${hashedFilename}`;
        precacheUrls.push(`/dist/${hashedFilename}`);
      } else if (out.path.endsWith('.map')) {
        const mapName = path.basename(out.path);
        fs.writeFileSync(path.join(outDir, mapName), out.contents);
      }
    }
  }

  const cacheVersion = combinedHash.digest('hex').slice(0, 8);

  // Write manifest.json
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Update public/index.html to point to hashed core script
  if (fs.existsSync(indexHtmlPath) && manifest['core.js']) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const updatedHtml = indexHtml.replace(
      /<script src="\/dist\/core(\.[a-f0-9]+)?\.js"[^>]*><\/script>/g,
      `<script src="${manifest['core.js']}" defer></script>`
    );
    if (updatedHtml !== indexHtml) {
      fs.writeFileSync(indexHtmlPath, updatedHtml);
    }
  }

  // Generate public/sw.js from template
  if (fs.existsSync(swTemplatePath)) {
    let swContent = fs.readFileSync(swTemplatePath, 'utf8');
    const formattedUrls = precacheUrls.map(u => `  '${u}',`).join('\n');
    swContent = swContent
      .replace('{{CACHE_VERSION}}', cacheVersion)
      .replace(/\/\*\s*\{\{PRECACHE_URLS\}\}\s*\*\/|\{\{PRECACHE_URLS\}\}/g, formattedUrls);
    if (!fs.existsSync(swDestPath) || fs.readFileSync(swDestPath, 'utf8') !== swContent) {
      fs.writeFileSync(swDestPath, swContent);
    }
  }

  console.log(`[esbuild] Build complete (version: ${cacheVersion}) → ${outDir}`);
  for (const [key, val] of Object.entries(manifest)) {
    console.log(`  ${key.padEnd(14)} → ${val}`);
  }
}

if (isWatch) {
  runBuild().catch(console.error);
  console.log('[esbuild] Watching for changes in public/js/...');
  fs.watch(path.resolve(rootDir, 'public/js'), { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
      console.log(`[esbuild] Detected change in ${filename}, rebuilding...`);
      runBuild().catch(console.error);
    }
  });
} else {
  runBuild()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[esbuild] Build failed:', err);
      process.exit(1);
    });
}
