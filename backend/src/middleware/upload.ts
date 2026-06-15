import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function diskStorage(subfolder: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dest = path.join(STORAGE_PATH, subfolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  });
}

function imageOnly(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont acceptées'));
  }
}

export const uploadPhoto = multer({
  storage: diskStorage('photos'),
  fileFilter: imageOnly,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadSignature = multer({
  storage: diskStorage('signatures'),
  fileFilter: imageOnly,
  limits: { fileSize: 5 * 1024 * 1024 },
});
