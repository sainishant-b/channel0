import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

// Ensure dist/public/icons exists
const iconsDir = join(dist, 'public', 'icons');
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// Copy manifest
copyFileSync(
  join(root, 'manifest.json'),
  join(dist, 'manifest.json')
);

// Copy icons
const icons = ['icon16.png', 'icon48.png', 'icon128.png'];
for (const icon of icons) {
  copyFileSync(
    join(root, 'public', 'icons', icon),
    join(dist, 'public', 'icons', icon)
  );
}

console.log('✓ Copied manifest and icons to dist');
