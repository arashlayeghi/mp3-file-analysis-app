import { resolve } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';

const SAMPLE_PATH = resolve(__dirname, '../sample.mp3');

describe('POST /file-upload', () => {
  it('should return the correct frame count for a valid MP3 file', async () => {
    const res = await request(app).post('/file-upload').attach('file', SAMPLE_PATH);

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

  it('should return 422 for an invalid MP3 file', async () => {
    const tmpPath = resolve(__dirname, '../tmp_invalid.bin');
    await writeFile(tmpPath, Buffer.alloc(2));

    try {
      const res = await request(app).post('/file-upload').attach('file', tmpPath);

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/too small/);
    } finally {
      await unlink(tmpPath);
    }
  });
});
