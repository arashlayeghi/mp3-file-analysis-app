import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { parseFrameHeader, countMP3Frames } from '../src/services/mp3Parser';
import { Mp3ParseError } from '../src/utils/errors';

const SAMPLE_PATH = resolve(__dirname, '../sample.mp3');

describe('parseFrameHeader', () => {
  it('should parse a valid MPEG1 Layer III frame header', () => {
    // 0xFF 0xFB = sync + MPEG1 + Layer III + no CRC
    // 0x50 = bitrate index 5 (64kbps), sample rate index 0 (44100), no padding
    const buffer = Buffer.from([0xff, 0xfb, 0x50, 0x00]);
    const result = parseFrameHeader(buffer, 0);

    expect(result).not.toBeNull();
    expect(result?.frameSize).toBe(208); // floor(144 * 64000 / 44100) + 0
  });

  it('should return null for missing sync word', () => {
    const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(parseFrameHeader(buffer, 0)).toBeNull();
  });

  it('should return null for invalid bitrate index (0)', () => {
    const buffer = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
    expect(parseFrameHeader(buffer, 0)).toBeNull();
  });

  it('should return null for non-MPEG1 version', () => {
    // version bits = 10 (MPEG2 instead of MPEG1)
    const buffer = Buffer.from([0xff, 0xf3, 0x50, 0x00]);
    expect(parseFrameHeader(buffer, 0)).toBeNull();
  });

  it('should return null if buffer is too short', () => {
    const buffer = Buffer.from([0xff, 0xfb]);
    expect(parseFrameHeader(buffer, 0)).toBeNull();
  });

  it('should account for padding bit in frame size', () => {
    // 0x52 = bitrate index 5 (64kbps), sample rate index 0 (44100), padding = 1
    const buffer = Buffer.from([0xff, 0xfb, 0x52, 0x00]);
    const result = parseFrameHeader(buffer, 0);

    expect(result).not.toBeNull();
    expect(result?.frameSize).toBe(209); // floor(144 * 64000 / 44100) + 1
  });

  it('should return null for reserved bitrate index (15)', () => {
    // 0xF0 = bitrate index 15 (reserved), sample rate index 0
    const buffer = Buffer.from([0xff, 0xfb, 0xf0, 0x00]);
    expect(parseFrameHeader(buffer, 0)).toBeNull();
  });

  it('should return null for reserved sample rate index (3)', () => {
    // 0x5C = bitrate index 5 (64kbps), sample rate index 3 (reserved)
    const buffer = Buffer.from([0xff, 0xfb, 0x5c, 0x00]);
    expect(parseFrameHeader(buffer, 0)).toBeNull();
  });

  it('should parse a frame header at a non-zero offset', () => {
    const buffer = Buffer.from([0x00, 0x00, 0xff, 0xfb, 0x50, 0x00]);
    const result = parseFrameHeader(buffer, 2);
    expect(result).not.toBeNull();
    expect(result?.frameSize).toBe(208);
  });
});

describe('countMP3Frames', () => {
  it('should return the correct frame count for the sample MP3 file', async () => {
    const frameCount = await countMP3Frames(SAMPLE_PATH);
    expect(frameCount).toBe(6090);
  });

  it('should throw an error for a file that is too small', async () => {
    const tmpPath = join(tmpdir(), 'test-tiny.bin');
    await writeFile(tmpPath, Buffer.alloc(2));

    try {
      await expect(countMP3Frames(tmpPath)).rejects.toThrow(Mp3ParseError);
    } finally {
      await unlink(tmpPath);
    }
  });

  it('should return 0 for a file with no valid frames', async () => {
    const tmpPath = join(tmpdir(), 'test-empty.bin');
    await writeFile(tmpPath, Buffer.alloc(1024, 0x00));

    try {
      const frameCount = await countMP3Frames(tmpPath);
      expect(frameCount).toBe(0);
    } finally {
      await unlink(tmpPath);
    }
  });
});
