import { unlink } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { countMP3Frames } from '../services/mp3Parser';
import { Mp3ParseError } from '../utils/errors';

const router = Router();

const MAX_FILE_SIZE = 500;

mkdirSync('uploads', { recursive: true });

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: MAX_FILE_SIZE * 1024 * 1024 }, // 500MB
});

router.post(
  '/file-upload',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { originalname, mimetype, path: filePath } = req.file;

    const isValidMimeType = ['audio/mpeg', 'audio/mp3'].includes(mimetype);
    const isValidExtension = originalname.toLowerCase().endsWith('.mp3');

    if (!isValidMimeType && !isValidExtension) {
      await cleanupFile(filePath);
      res.status(400).json({ error: 'Invalid file type. Only MP3 files are accepted' });
      return;
    }

    try {
      const frameCount = await countMP3Frames(filePath);
      res.status(200).json({ frameCount });
    } catch (error) {
      if (error instanceof Mp3ParseError) {
        res.status(422).json({ error: error.message });
      } else {
        console.error('Unexpected error processing MP3 file:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    } finally {
      await cleanupFile(filePath);
    }
  },
);

router.use(
  '/file-upload',
  (error: Error, req: Request, res: Response, next: NextFunction): void => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE}MB` });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  },
);

const cleanupFile = async (filePath: string): Promise<void> => {
  try {
    await unlink(filePath);
  } catch (error) {
    // ENOENT (file not found) is expected — file may already be cleaned up
    const isFileNotFound =
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isFileNotFound) {
      console.error(`Failed to cleanup temporary file ${filePath}:`, error);
    }
  }
};

export { router as fileUploadRouter };
