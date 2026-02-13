import express, { Request, Response, NextFunction } from 'express';
import { fileUploadRouter } from './routes/fileUpload';

const app = express();

app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });
}
app.use('/', fileUploadRouter);

export default app;
