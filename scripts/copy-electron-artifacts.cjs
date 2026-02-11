const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..', 'release');
const destinationDir = 'D:\\Proyectos\\MiraxShare_download';
const allowedExtensions = new Set(['.exe', '.blockmap', '.yml', '.yaml']);

if (!fs.existsSync(sourceDir)) {
  console.error(`Release folder not found: ${sourceDir}`);
  process.exit(1);
}

if (!fs.existsSync(destinationDir)) {
  fs.mkdirSync(destinationDir, { recursive: true });
}

const files = fs.readdirSync(sourceDir, { withFileTypes: true });
let copiedCount = 0;

for (const entry of files) {
  if (!entry.isFile()) continue;

  const extension = path.extname(entry.name).toLowerCase();
  const shouldCopy =
    allowedExtensions.has(extension) ||
    entry.name.startsWith('builder-') ||
    entry.name === 'latest.yml' ||
    entry.name === 'app-update.yml';

  if (!shouldCopy) continue;

  const sourcePath = path.join(sourceDir, entry.name);
  const destinationPath = path.join(destinationDir, entry.name);
  fs.copyFileSync(sourcePath, destinationPath);
  copiedCount += 1;
}

console.log(`Copied ${copiedCount} artifacts to ${destinationDir}`);
