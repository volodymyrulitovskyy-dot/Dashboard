import pino from "pino";

export const logger = pino({
  name: "netsuite-portal",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "*.password",
      "*.secret",
      "*.api_key",
      "*.apiKey",
      "*.access_token",
      "*.refresh_token",
      "*.client_secret",
      "*.private_key",
      "*.privateKey",
      "*.NETSUITE_PRIVATE_KEY_PEM",
      "*.SUPABASE_SECRET_KEY",
    ],
    remove: true,
  },
});
