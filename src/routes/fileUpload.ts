import { Router, Request, Response } from 'express';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/file-upload', upload.single('file'), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const allowedMimeTypes = ['audio/mpeg', 'audio/mp3', 'application/octet-stream'];
  const isValidExtension = req.file.originalname.toLowerCase().endsWith('.mp3');

  if (!allowedMimeTypes.includes(req.file.mimetype) && !isValidExtension) {
    res.status(400).json({ error: 'Invalid file type. Only MP3 files are accepted' });
    return;
  }

  const buffer = req.file.buffer;

  // TODO: Parse MP3 frames and count them
  const frameCount = 0;

  res.status(200).json({ frameCount });
});

export { router as fileUploadRouter };
