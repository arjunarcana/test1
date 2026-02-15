/**
 * Typed configuration object.
 * Reads from process.env with sensible defaults for local development.
 */

export interface Config {
  /** PostgreSQL connection string */
  databaseUrl: string;
  /** Server port */
  port: number;
  /** Server bind host */
  host: string;
  /** Secret used to sign JWTs */
  jwtSecret: string;
  /** Transcription provider: "mock" | "deepgram" */
  transcriptionProvider: "mock" | "deepgram";
  /** Deepgram API key (required when transcriptionProvider is "deepgram") */
  deepgramApiKey: string;
  /** OpenAI API key (optional; summarization degrades gracefully without it) */
  openaiApiKey: string;
  /** 32-byte hex key for AES-256-GCM encryption. Empty string disables encryption. */
  encryptionKey: string;
  /** Pino log level */
  logLevel: string;
}

export const config: Config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/meeting_copilot",
  port: parseInt(process.env.PORT ?? "3001", 10),
  host: process.env.HOST ?? "0.0.0.0",
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  transcriptionProvider:
    (process.env.TRANSCRIPTION_PROVIDER as Config["transcriptionProvider"]) ??
    "mock",
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
