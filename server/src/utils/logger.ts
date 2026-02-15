/**
 * Application logger built on Pino.
 * Log level is driven by config.logLevel (defaults to "info").
 */

import pino from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.logLevel,
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
