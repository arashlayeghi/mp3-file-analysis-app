import { open, FileHandle } from 'node:fs/promises';
import { Mp3ParseError } from '../utils/errors';

/**
 * Bitrate lookup table for MPEG1 Layer III (kbps)
 * This lookup table is defined by the MPEG standard.
 * The bitrate index (4 bits = values 0-15) maps to a bitrate in kbps.
 * Index 0 and 15 are reserved/invalid, so they're 0.
 * Our sample file uses index 5 → 64 kbps.
 */
const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

/**
 * Sample rate lookup table for MPEG1 (Hz)
 * Sample rate index (2 bits = values 0-3) maps to Hz. Index 3 is reserved and invalid.
 * Our sample uses index 0 → 44100 Hz (CD quality).
 */
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];

/** The exact size of an ID3v2 header */
const ID3V2_HEADER_SIZE = 10;

/** Every frame header is exactly 4 bytes */
const FRAME_HEADER_SIZE = 4;

/**
 * Read buffer size for chunked file processing.
 * 64KB balances between minimising I/O syscalls and keeping memory footprint low.
 * Memory usage remains constant O(1) regardless of file size.
 */
const CHUNK_SIZE = 64 * 1024; // 64KB

/**
 *   Version bits:
 *   00 = MPEG Version 2.5  (added later as an extension)
 *   01 = Reserved
 *   10 = MPEG Version 2    (came second)
 *   11 = MPEG Version 1    (came first, was the original - the one we want: Decimal 3)
 */
const MPEG_VERSION_1 = 3;

/**
 *   Layer bits:
 *   00 = Reserved
 *   01 = Layer III   (MP3 — the one we want: Decimal 1)
 *   10 = Layer II
 *   11 = Layer I
 */
const LAYER_III = 1;

export interface FrameHeader {
  frameSize: number;
}

/**
 * An MP3 file is not one big blob of compressed audio.
 * It's a sequence of independent **frames**, each containing
 * a tiny chunk of sound (about 26 milliseconds).
 * Think of it like a film strip — each frame is one snapshot,
 * and playing them in sequence gives you continuous audio.
 *
 * ┌──────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 * │  ID3v2 Tag   │ Frame 1 │ Frame 2 │ Frame 3 │  . . .  │Frame N  │
 * │  (metadata)  │         │         │         │         │         │
 * └──────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
 *
 * This function reads the ID3v2 tag size from a file handle.
 * Returns the byte offset where audio data begins.
 *
 * ID3v2 header structure (10 bytes):
 *   Bytes 0-2:  "ID3" identifier (the literal text — this is how we know it's there)
 *   Byte  3:    Version major (e.g. 4 for ID3v2.4)
 *   Byte  4:    Version minor
 *   Byte  5:    Flags
 *   Bytes 6-9:  Size of the tag body (syncsafe integer — each byte uses only 7 bits)
 */
export const getID3v2TagSize = async (handle: FileHandle): Promise<number> => {
  const header = Buffer.alloc(ID3V2_HEADER_SIZE);
  const { bytesRead } = await handle.read(header, 0, ID3V2_HEADER_SIZE, 0);

  if (bytesRead < ID3V2_HEADER_SIZE) return 0;
  if (header.subarray(0, 3).toString('ascii') !== 'ID3') return 0;

  const tagSize = (header[6] << 21) | (header[7] << 14) | (header[8] << 7) | header[9];

  /** Add the 10-byte header itself. This is where the first audio frame begins. */
  return tagSize + ID3V2_HEADER_SIZE;
};

/**
 * Attempts to parse a valid MPEG1 (Version 1) Layer III frame header at the given offset.
 * Returns the frame info if valid, or null if not a valid frame.
 *
 *  Every frame starts with a 4-byte header followed by the compressed audio data:
 * ┌──────────────────────────────┬────────────────────────┐
 * │  Header (4 bytes)            │  Audio data            │
 * │  Contains: sync, bitrate,    │  (compressed sound)    │
 * │  sample rate, padding, etc.  │                        │
 * └──────────────────────────────┴────────────────────────┘
 * │◄──────────── frameSize (e.g. 208 bytes) ─────────────►│
 *
 * The header tells us everything about the frame — its size, encoding parameters, etc.
 * Here's the bit layout across all 4 bytes:
 *
 * MP3 frame structure (4-byte header):
 *   Byte 0:  [SSSS SSSS]  — 8 sync bits (all 1s = 0xFF)
 *   Byte 1:  [SSSV VLLP]  — 3 sync, 2 version, 2 layer, 1 protection
 *   Byte 2:  [BBBB SSPO]  — 4 bitrate, 2 sample rate, 1 padding, 1 private
 *   Byte 3:  [CCMM EIJJ]  — 2 channel, 2 mode ext, 1 copyright, 1 original, 2 emphasis
 *
 * Where:
 *  S = Sync bits (11 bits, all must be 1)
 *  V = MPEG Version (2 bits)
 *  L = Layer (2 bits)
 *  P = Protection/CRC (1 bit)
 *  B = Bitrate index (4 bits)
 *  S = Sample rate index (2 bits)
 *  P = Padding (1 bit)
 *  O = Private bit (1 bit)
 *  C = Channel mode (2 bits)
 *  M = Mode extension (2 bits)
 *  E = Copyright (1 bit)
 *  I = Original (1 bit)
 *  J = Emphasis (2 bits)
 *
 * We only care about: sync, version, layer, bitrate, sample rate, and padding.
 */
export const parseFrameHeader = (buffer: Buffer, offset: number): FrameHeader | null => {
  if (offset + FRAME_HEADER_SIZE > buffer.length) return null;

  const byte0 = buffer[offset];
  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];

  // Check sync word: 11 bits all set
  if (byte0 !== 0xff || (byte1 & 0xe0) !== 0xe0) return null;

  const version = (byte1 >> 3) & 0x03;
  const layer = (byte1 >> 1) & 0x03;

  // Only handle MPEG1 (version=3) Layer III (layer=1) and consider others out of scope
  if (version !== MPEG_VERSION_1 || layer !== LAYER_III) return null;

  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const padding = (byte2 >> 1) & 0x01;

  const bitrate = MPEG1_LAYER3_BITRATES[bitrateIndex];
  const sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex];

  if (bitrate === 0 || sampleRate === 0) return null;

  const frameSize = Math.floor((144 * (bitrate * 1000)) / sampleRate) + padding;

  return { frameSize };
};

/**
 * Counts the number of MPEG1 Layer III frames in an MP3 file.
 * Reads the file in chunks for memory efficiency.
 */
export const countMP3Frames = async (filePath: string): Promise<number> => {
  const handle = await open(filePath, 'r');

  try {
    const { size: fileSize } = await handle.stat();

    if (fileSize < FRAME_HEADER_SIZE) {
      throw new Mp3ParseError('File is too small to be a valid MP3');
    }

    let fileOffset = await getID3v2TagSize(handle);
    let frameCount = 0;
    // We reuse the same buffer for every chunk read instead of allocating new ones.
    // This is memory efficient.
    const chunk = Buffer.alloc(CHUNK_SIZE);

    /**
     * NOTE: A more robust approach would validate frame consistency
     * by checking that consecutive frames share the same sample rate,
     * MPEG version, and layer. This would prevent false sync detection
     * in heavily corrupted files.
     */
    while (fileOffset < fileSize) {
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_SIZE, fileOffset);
      if (bytesRead < FRAME_HEADER_SIZE) break;

      let pos = 0;

      while (pos <= bytesRead - FRAME_HEADER_SIZE) {
        const frame = parseFrameHeader(chunk, pos);

        if (frame) {
          // If the frame extends beyond this chunk,
          // don't count it — re-read from this position in the next chunk
          if (pos + frame.frameSize > bytesRead) {
            break;
          }

          frameCount++;
          pos += frame.frameSize;
        } else {
          // If it's not a valid frame header, advance by just 1 byte and try again.
          // This handles garbage data between frames.
          pos++;
        }
      }

      fileOffset += pos;
    }

    return frameCount;
  } finally {
    await handle.close();
  }
};
