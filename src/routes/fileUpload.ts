import { Router, Request, Response } from 'express';
import multer from 'multer';
import { unlink } from 'node:fs/promises';
import { countMP3Frames } from '../services/mp3Parser';
import { Mp3ParseError } from '../utils/errors';

const router = Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
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

    const allowedMimeTypes = ['audio/mpeg', 'audio/mp3', 'application/octet-stream'];
    const isValidExtension = originalname.toLowerCase().endsWith('.mp3');

    if (!allowedMimeTypes.includes(mimetype) && !isValidExtension) {
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
