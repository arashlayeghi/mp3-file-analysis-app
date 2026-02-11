import express from 'express';
import { fileUploadRouter } from './routes/fileUpload';

const app = express();

app.use(express.json());
app.use('/', fileUploadRouter);

export default app;
