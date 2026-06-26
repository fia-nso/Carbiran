import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const uploadsRoot = path.join(repoRoot, 'backend', 'uploads');
const photosRoot = path.join(uploadsRoot, 'photos');
const signaturesRoot = path.join(uploadsRoot, 'signatures');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function moveFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));

  if (sourcePath === targetPath) return { status: 'same' };
  if (fs.existsSync(targetPath)) return { status: 'exists', targetPath };

  fs.renameSync(sourcePath, targetPath);
  return { status: 'moved', targetPath };
}

function removeEmptyDirs(rootDir) {
  if (!fs.existsSync(rootDir)) return;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(rootDir, entry.name);
    removeEmptyDirs(fullPath);
    if (fs.readdirSync(fullPath).length === 0) {
      fs.rmdirSync(fullPath);
    }
  }
}

function flattenPhotos() {
  const legacyRoot = path.join(photosRoot, 'ravitaillement-photos');
  if (!fs.existsSync(legacyRoot)) return { moved: 0, skipped: 0 };

  let moved = 0;
  let skipped = 0;

  for (const vehicleDir of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!vehicleDir.isDirectory()) continue;
    const fullVehicleDir = path.join(legacyRoot, vehicleDir.name);

    for (const file of fs.readdirSync(fullVehicleDir, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const sourcePath = path.join(fullVehicleDir, file.name);
      const targetPath = path.join(photosRoot, file.name);
      const result = moveFile(sourcePath, targetPath);
      if (result.status === 'moved') moved += 1;
      else skipped += 1;
    }
  }

  removeEmptyDirs(legacyRoot);
  if (fs.existsSync(legacyRoot) && fs.readdirSync(legacyRoot).length === 0) {
    fs.rmdirSync(legacyRoot);
  }

  return { moved, skipped };
}

function flattenSignatures() {
  if (!fs.existsSync(signaturesRoot)) return { moved: 0, skipped: 0 };

  let moved = 0;
  let skipped = 0;

  for (const userDir of fs.readdirSync(signaturesRoot, { withFileTypes: true })) {
    if (!userDir.isDirectory()) continue;
    const userDirPath = path.join(signaturesRoot, userDir.name);

    for (const file of fs.readdirSync(userDirPath, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const ext = path.extname(file.name);
      const targetName = `${userDir.name}-signature${ext}`;
      const sourcePath = path.join(userDirPath, file.name);
      const targetPath = path.join(signaturesRoot, targetName);
      const result = moveFile(sourcePath, targetPath);
      if (result.status === 'moved') moved += 1;
      else skipped += 1;
    }
  }

  removeEmptyDirs(signaturesRoot);
  return { moved, skipped };
}

const photos = flattenPhotos();
const signatures = flattenSignatures();

console.log(JSON.stringify({ photos, signatures }, null, 2));
