# Backend Server Setup

This guide covers installing, configuring, and running the Meeting Copilot backend server.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18+ (20 recommended) | Runtime for the server |
| **npm** | 9+ | Comes with Node.js |
| **Docker + Docker Compose** | Docker 20+, Compose v2+ | For the quick-start path (runs PostgreSQL automatically) |
| **PostgreSQL** | 16+ | Only if running without Docker |

---

## Quick Start with Docker Compose

The fastest way to get the backend running, including PostgreSQL:

```bash
cd server
cp .env.example .env          # Uses mock transcription by default -- no API keys needed
docker-compose up -d
```

This starts two containers:

| Service | Port | Description |
|---|---|---|
| `postgres` | `5432` | PostgreSQL 16 (Alpine) with a `meeting_copilot` database |
| `server` | `3001` | The Meeting Copilot backend (runs migrations on startup) |

Verify the server is running:

```bash
curl http://localhost:3001/health
```

To view logs:

```bash
docker-compose logs -f server
```

To stop everything:

```bash
docker-compose down
```

To stop and remove all data (including the database):

```bash
docker-compose down -v
```

---

## Manual Setup (Without Docker)

If you prefer to run the server directly on your machine:

### 1. Install and Start PostgreSQL

Install PostgreSQL 16 using your system's package manager (Homebrew, apt, etc.) and start the service. Then create the database:

```bash
createdb meeting_copilot
```

Or connect to PostgreSQL and run:

```sql
CREATE DATABASE meeting_copilot;
```

### 2. Configure Environment Variables

```bash
cd server
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point to your PostgreSQL instance:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meeting_copilot
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Push the Database Schema

For development, use `prisma db push` to synchronize the schema without creating migration files:

```bash
npx prisma db push
```

This creates all tables defined in `prisma/schema.prisma`.

### 5. Start the Development Server

```bash
npm run dev
```

This uses `tsx watch` to run the TypeScript source directly with hot reloading. The server starts on `http://localhost:3001` by default.

---

## Environment Variables

All configuration is done through environment variables. Copy `.env.example` to `.env` and customize as needed.

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/meeting_copilot` | Yes | PostgreSQL connection string. Must include username, password, host, port, and database name. |
| `PORT` | `3001` | No | HTTP and WebSocket server port. |
| `HOST` | `0.0.0.0` | No | Server bind address. Use `0.0.0.0` for Docker or remote access, `127.0.0.1` for local-only. |
| `JWT_SECRET` | `change-me-in-production` | Yes (production) | Secret key for signing JWT tokens. **Must be changed in production.** Use a random string of at least 32 characters. |
| `TRANSCRIPTION_PROVIDER` | `mock` | No | Transcription backend. Options: `mock` (simulated transcripts, no API key needed), `deepgram` (real speech-to-text). |
| `DEEPGRAM_API_KEY` | _(empty)_ | When provider is `deepgram` | API key from [Deepgram Console](https://console.deepgram.com/). Required only when `TRANSCRIPTION_PROVIDER=deepgram`. |
| `OPENAI_API_KEY` | _(empty)_ | No | API key from [OpenAI Platform](https://platform.openai.com/). Used for rolling and global summaries. Summarization is skipped gracefully if not set. |
| `ENCRYPTION_KEY` | _(empty)_ | No | 32-byte hex-encoded key (64 hex characters) for AES-256-GCM encryption of transcript text at rest. When empty, transcripts are stored in plaintext. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `LOG_LEVEL` | `info` | No | Pino log level. Options: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |

---

## Demo Mode

Demo mode lets you run the entire stack without any API keys. This is the default configuration:

```env
TRANSCRIPTION_PROVIDER=mock
DEEPGRAM_API_KEY=
OPENAI_API_KEY=
```

In demo mode:

- The **mock transcription provider** generates simulated transcript segments at regular intervals. No real audio processing occurs.
- **Summarization is skipped** because no OpenAI key is configured. The server logs a debug message but does not error.
- All other features work normally: session management, WebSocket communication, database persistence, encryption (if key is set).

Demo mode is ideal for:
- Initial evaluation of the system
- Frontend/extension development
- CI/CD pipelines and integration testing
- Demos and presentations

---

## Production Mode

For production use with real transcription and summarization:

```env
TRANSCRIPTION_PROVIDER=deepgram
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=a-long-random-secret-string-minimum-32-chars
ENCRYPTION_KEY=64_hex_chars_here
LOG_LEVEL=warn
```

> **Important:** Always change `JWT_SECRET` from its default value in production. The default value is intentionally insecure to remind you to set a proper secret.

### Generating an Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (64 hex characters) into `ENCRYPTION_KEY`. Once set, all new transcript segments will be encrypted with AES-256-GCM before being stored in the database.

---

## Database Management

### Prisma Schema

The database schema is defined in `server/prisma/schema.prisma`. It includes five models:

| Model | Table | Description |
|---|---|---|
| `User` | `users` | User accounts with email, watched names, and settings |
| `Session` | `sessions` | Meeting sessions with status, source, and timestamps |
| `TranscriptSegment` | `transcript_segments` | Individual transcript lines with speaker, timestamp, and confidence |
| `Summary` | `summaries` | Rolling and global summaries tied to sessions |
| `Mention` | `mentions` | Name mention detections with context and sentiment |

### Common Commands

**Push schema changes (development):**
```bash
npx prisma db push
```
Synchronizes the Prisma schema with the database without creating migration files. Useful during rapid development but may cause data loss on schema changes.

**Create a migration (production):**
```bash
npx prisma migrate dev --name describe_your_change
```
Creates a versioned migration file in `prisma/migrations/`. Use this when you need reproducible, tracked schema changes.

**Apply pending migrations (production):**
```bash
npx prisma migrate deploy
```
Applies all pending migrations. This is what the Docker container runs on startup.

**Generate Prisma Client:**
```bash
npx prisma generate
```
Regenerates the TypeScript client after schema changes. This runs automatically during `npm install` and `prisma db push`.

**Reset the database (destroys all data):**
```bash
npx prisma migrate reset
```
Drops the database, recreates it, and applies all migrations. Use with caution.

**Open Prisma Studio (database browser):**
```bash
npx prisma studio
```
Opens a web UI at `http://localhost:5555` for browsing and editing database records.

---

## API Endpoints Reference

All REST endpoints are served at `http://localhost:3001` (or your configured `HOST:PORT`).

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Create a new user. Body: `{ "email": "...", "names": ["..."] }`. Returns `{ "token": "...", "user": {...} }`. |
| `POST` | `/auth/login` | No | Log in by email. Body: `{ "email": "..." }`. Returns `{ "token": "...", "user": {...} }`. |
| `GET` | `/auth/me` | Yes | Get the current user's profile. Returns `{ "user": {...} }`. |

### Sessions

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sessions` | Yes | List all sessions for the authenticated user, ordered by most recent. Returns `{ "sessions": [...] }` with counts of segments, summaries, and mentions. |
| `GET` | `/sessions/:id` | Yes | Get a single session with all final segments, summaries, and mentions. Returns `{ "session": {...} }`. |
| `DELETE` | `/sessions/:id` | Yes | Delete a session and all related data (cascade). Returns `204 No Content`. |
| `GET` | `/sessions/:id/export` | Yes | Export a session as a Markdown file. Returns `text/markdown` with `Content-Disposition: attachment`. |

### Transcripts

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sessions/:id/transcript` | Yes | Get all transcript segments for a session, ordered by timestamp. Returns `{ "sessionId": "...", "segments": [...] }`. |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check endpoint. Returns `200 OK` when the server is running. |

### Authentication Details

All authenticated endpoints require an `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Tokens are obtained from `/auth/register` or `/auth/login` and expire after 7 days.

---

## WebSocket Endpoint

```
ws://localhost:3001/ws
```

The WebSocket endpoint handles real-time bidirectional communication for audio streaming, transcription, and summarization. See [protocol.md](protocol.md) for the complete message format specification.

**Quick overview:**

- Client sends `start_session` with a JWT token to begin
- Client streams `audio_data` messages with base64-encoded PCM audio
- Server responds with `transcript_partial`, `transcript_final`, `rolling_summary`, `global_summary`, and `mention_detected` messages
- Client sends `stop_session` to end the session

---

## Build for Production

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory. Run the compiled server with:

```bash
npm run start
```

Or use the Docker image, which handles building, migration, and runtime automatically.

---

## Next Steps

- [Extension Setup](extension-setup.md) -- build and install the Chrome extension
- [Protocol](protocol.md) -- detailed WebSocket message format specification
- [Troubleshooting](troubleshooting.md) -- common backend issues and solutions
