# MP3 File Analysis App

A TypeScript REST API that accepts an MP3 file upload and returns the number of MPEG Version 1 Audio Layer 3 frames in the file.

## Prerequisites

- Node.js v24 (see `.nvmrc`)
- npm

## Installation

```bash
nvm use
npm install
```

## Running the Application

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

The server starts on `http://localhost:3000` by default. Set the `PORT` environment variable to change it.

### Docker

```bash
docker compose up --build
```

## API

### POST /file-upload

Accepts an MP3 file and returns the frame count.

**Request:**

```bash
curl -X POST http://localhost:3000/file-upload \
  -F "file=@./sample.mp3"
```

**Success Response (200):**

```json
{
  "frameCount": 6090
}
```

**Error Responses:**

| Status | Reason                        | Example                                           |
|--------|-------------------------------|---------------------------------------------------|
| 400    | No file uploaded              | `{ "error": "No file uploaded" }`                 |
| 400    | Invalid file type             | `{ "error": "Invalid file type. Only MP3 files are accepted" }` |
| 413    | File too large                | `{ "error": "File too large. Maximum size is 500MB" }` |
| 422    | File cannot be parsed as MP3  | `{ "error": "File is too small to be a valid MP3" }` |
| 500    | Unexpected server error       | `{ "error": "Internal server error" }`            |

## Testing

```bash
npm test
```

## Technical Approach

### MP3 Frame Parsing

The parser implements the [MPEG Audio Frame Header](http://www.mp3-tech.org/programmer/frame_header.html) specification. It reads the file in 64KB chunks for constant memory usage regardless of file size. For each chunk, it:

1. Skips the ID3v2 metadata tag (if present) by reading the syncsafe integer size
2. Scans for the 11-bit sync word (`0xFF` followed by `0xE0` mask) that marks each frame header
3. Validates the frame is MPEG Version 1, Layer III
4. Calculates the frame size using `floor(144 × bitrate / sampleRate) + padding`
5. Jumps to the next frame by the calculated size

### Design Decisions

- **Streaming I/O:** The file is read in 64KB chunks using `FileHandle.read()` rather than loading entirely into memory. This keeps memory usage at O(1) regardless of file size.
- **Disk storage for uploads:** Multer writes uploads to disk rather than memory, avoiding large memory spikes for big files.
- **Custom error classes:** `Mp3ParseError` distinguishes client errors (malformed files → 422) from unexpected server errors (→ 500).
- **No MP3 parsing libraries:** Frame header parsing is implemented from scratch per the MPEG Audio specification.

### Possible Improvements

- Validate frame consistency across consecutive frames to prevent false sync detection in corrupted files
- Add request rate limiting for production use

## Scripts

| Script                | Description                    |
|-----------------------|--------------------------------|
| `npm run dev`         | Start development server       |
| `npm start`           | Build and start production     |
| `npm test`            | Run tests                      |
| `npm run test:watch`  | Run tests in watch mode        |
| `npm run lint`        | Run ESLint                     |
| `npm run format`      | Run Prettier                   |

## Git Hooks

Pre-commit and pre-push hooks are configured via Husky. Commits are automatically linted and formatted, and tests run before each push.