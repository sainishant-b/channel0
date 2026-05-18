#!/usr/bin/env node
// Build + pack dist/ into a Chrome Web Store-ready zip.
//
// Cross-platform: uses PowerShell's `Compress-Archive` on Windows and
// `zip` on macOS / Linux. Both ship by default on those systems.

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`>>> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, shell: true, ...opts });
}

run('npm run build');

const manifest = JSON.parse(readFileSync(resolve(root, 'dist/manifest.json'), 'utf8'));
const version = manifest.version;
const outDir = resolve(root, 'dist-package');
const outFile = resolve(outDir, `watch-party-v${version}.zip`);

mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) rmSync(outFile);

const isWindows = process.platform === 'win32';
if (isWindows) {
  // PowerShell's Compress-Archive zips dir contents into a single file.
  // Use single-quoted paths because Windows paths contain backslashes.
  const psCmd =
    `powershell -NoProfile -Command "` +
    `Compress-Archive -Path 'dist\\*' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force` +
    `"`;
  run(psCmd);
} else {
  run(`cd dist && zip -rX "${outFile}" . -x "*.DS_Store" "*.map"`);
}

console.log(`\n>>> Wrote ${outFile}`);
console.log('Upload it at https://chrome.google.com/webstore/devconsole');
