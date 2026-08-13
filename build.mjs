// Bundles src/ into dist/ (the unpacked extension folder) and copies public/ verbatim.
//   node build.mjs           one-shot build + typecheck
//   node build.mjs --watch   rebuild on every change to src/ or public/
//
// background + popup are ES modules; the content script must be a classic script
// (IIFE), so they're built with two esbuild configs sharing the same options.
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync, watch as fsWatch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const outdir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
const watch = process.argv.includes('--watch');

async function copyStatic() {
  await cp(publicDir, outdir, { recursive: true });
}

function typecheck() {
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tsc)) return Promise.resolve();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsc, '--noEmit', '--pretty'], {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code !== 0) console.error('[fabrarian] typecheck failed — dist/ still written');
      resolve();
    });
  });
}

const shared = {
  bundle: true,
  target: 'chrome120',
  platform: 'browser',
  outdir,
  outbase: src,
  entryNames: '[dir]/[name]',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions[]} */
const configs = [
  // ES modules: service worker + popup.
  {
    ...shared,
    format: 'esm',
    entryPoints: [path.join(src, 'background.ts'), path.join(src, 'popup', 'popup.ts')],
  },
  // Classic script: content script (injected into the page's isolated world).
  {
    ...shared,
    format: 'iife',
    entryPoints: [path.join(src, 'content.ts')],
  },
];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyStatic();

if (watch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }

  let pending = null;
  fsWatch(publicDir, { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      copyStatic().then(() => console.log('[fabrarian] copied public/'));
    }, 50);
  });

  spawn(
    process.execPath,
    [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--watch', '--preserveWatchOutput'],
    { cwd: root, stdio: 'inherit' },
  );

  console.log('[fabrarian] watching — load dist/ as an unpacked extension');
} else {
  for (const config of configs) await esbuild.build(config);
  await typecheck();
  console.log('[fabrarian] built dist/');
}
