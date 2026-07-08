import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { getDb } from "./lib/mongodb";
import { seedIfEmpty } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Real bind-error handling (listen callback does NOT receive an error arg)
server.on("error", (err) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Connect to MongoDB and seed questions if collections are empty
  const mongoUri = process.env["MONGODB_URI"];
  if (mongoUri) {
    getDb()
      .then((db) => seedIfEmpty(db))
      .catch((err) => {
        logger.warn({ err }, "MongoDB init failed — questions API will be unavailable");
      });
  } else {
    logger.warn("MONGODB_URI not set — questions API disabled (app will use local fallback)");
  }
});
