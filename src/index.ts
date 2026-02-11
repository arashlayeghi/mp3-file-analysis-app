import express from 'express';
import { fileUploadRouter } from './routes/fileUpload';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/', fileUploadRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
