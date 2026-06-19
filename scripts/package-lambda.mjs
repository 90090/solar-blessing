#!/usr/bin/env node
// scripts/package-lambda.mjs
//
// Builds the Lambda in output:'server' mode (BUILD_TARGET=lambda) and packages
// dist/server/ + run.sh + PRODUCTION-ONLY node_modules into function.zip, which
// terraform/lambda.tf expects at the project root.
//
// IMPORTANT: this runs its OWN build with BUILD_TARGET=lambda rather than
// reusing whatever dist/ happens to be sitting there. That matters because the
// Lambda needs the 'server' output mode (every route on-demand, no prerendered
// routes) — a 'hybrid' build would reintroduce the Astro 4.16 routing bug where
// /api/* requests get mis-routed to the 404 page, AND would prerender the admin
// pages (stripping their request-time auth code). Packaging the wrong build is
// the easiest way to silently break this, so we always rebuild in the right
// mode here.
//
// Why a separate prod-only node_modules: the full node_modules includes dev
// dependencies (@types/*, Astro's build toolchain, Vite, TypeScript, etc.)
// that are never imported at runtime but bulk up the zip considerably. We
// install a clean, production-only copy into a temp folder instead.
//
// Usage: npm run package:lambda   (no separate build step needed)

import { execSync } from 'node:child_process';
import { existsSync, copyFileSync, chmodSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const distServer = join(root, 'dist', 'server');
const stageDir = join(root, '.lambda-stage');

// Build in server mode first — always, so the zip can't contain a stale or
// wrong-mode dist.
console.log('Building Lambda (output: server)...');
execSync('npm run build:lambda', { cwd: root, stdio: 'inherit' });

if (!existsSync(distServer)) {
  console.error('dist/server not found after build — something went wrong.');
  process.exit(1);
}

// Clean slate for the staging directory every time
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

console.log('Installing production-only dependencies into staging dir...');
// Copy just package.json + package-lock.json, then install --omit=dev there.
// This guarantees devDependencies (@types/*, etc.) never make it into the zip,
// regardless of what's installed in your local node_modules for development.
copyFileSync(join(root, 'package.json'), join(stageDir, 'package.json'));
const lockFile = join(root, 'package-lock.json');
if (existsSync(lockFile)) copyFileSync(lockFile, join(stageDir, 'package-lock.json'));

execSync('npm install --omit=dev --no-audit --no-fund', {
  cwd: stageDir,
  stdio: 'inherit',
});

console.log('Copying dist/ and run.sh into staging dir...');
execSync(`cp -R "${join(root, 'dist')}" "${stageDir}/dist"`, { stdio: 'inherit' });
copyFileSync(join(root, 'run.sh'), join(stageDir, 'run.sh'));
chmodSync(join(stageDir, 'run.sh'), 0o755);

console.log('Packaging function.zip...');
rmSync(join(root, 'function.zip'), { force: true });
execSync(
  `cd "${stageDir}" && zip -ryq "${join(root, 'function.zip')}" dist node_modules package.json run.sh`,
  { stdio: 'inherit' }
);

const sizeBytes = execSync(`stat -f%z "${join(root, 'function.zip')}" 2>/dev/null || stat -c%s "${join(root, 'function.zip')}"`).toString().trim();
const sizeMB = (Number(sizeBytes) / 1024 / 1024).toFixed(1);
console.log(`function.zip created at project root (${sizeMB} MB).`);
if (Number(sizeBytes) > 70 * 1024 * 1024) {
  console.warn('⚠ Still over Lambda\'s 70MB direct-upload limit — see DEPLOYMENT.md for the S3 upload path instead.');
}
console.log('Next: cd terraform && terraform apply');

// Clean up staging dir — function.zip is the only artifact that matters
rmSync(stageDir, { recursive: true, force: true });