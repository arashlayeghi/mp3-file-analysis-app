import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { countMP3Frames } from '../src/services/mp3Parser';

describe('countMP3Frames', () => {
  it('should return the correct frame count for the sample file', () => {
    const buffer = readFileSync(resolve(__dirname, '../sample.mp3'));
    expect(countMP3Frames(buffer)).toBe(6090);
  });

  it('should throw for a buffer that is too small', () => {
    const buffer = Buffer.alloc(2);
    expect(() => countMP3Frames(buffer)).toThrow('File is too small to be a valid MP3');
  });

  it('should return 0 for a buffer with no valid frames', () => {
    const buffer = Buffer.alloc(1024, 0x00);
    expect(countMP3Frames(buffer)).toBe(0);
  });

  it('should handle an MP3 without an ID3 tag', () => {
    const fullBuffer = readFileSync(resolve(__dirname, '../sample.mp3'));
    const strippedBuffer = fullBuffer.subarray(44);
    expect(countMP3Frames(strippedBuffer)).toBe(6090);
  });

  it('should not count frames with invalid bitrate index', () => {
    const buffer = Buffer.from([0xff, 0xfb, 0x00, 0x00, ...new Array(200).fill(0x00)]);
    expect(countMP3Frames(buffer)).toBe(0);
  });
});
