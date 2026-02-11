import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { resolve } from 'path';
import app from '../src/index';

describe('POST /file-upload', () => {
  it('should return the correct frame count for a valid MP3 file', async () => {
    const res = await request(app)
      .post('/file-upload')
      .attach('file', resolve(__dirname, '../sample.mp3'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ frameCount: 6090 });
  });

  it('should return 400 when no file is uploaded', async () => {
    const res = await request(app).post('/file-upload');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No file uploaded' });
  });

  it('should return 400 for a non-MP3 file', async () => {
    const res = await request(app)
      .post('/file-upload')
      .attach('file', resolve(__dirname, '../package.json'));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid file type/);
  });
});
