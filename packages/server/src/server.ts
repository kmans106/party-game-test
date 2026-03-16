import { createServer } from "node:http";
import express from "express";
import { Server as SocketIOServer } from "socket.io";

import { registerSocketHandlers } from "./socket.js";

const getAllowedOrigins = () => {
  const configuredOrigins = process.env.ALLOWED_ORIGIN
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return configuredOrigins && configuredOrigins.length > 0 ? configuredOrigins : "*";
};

export const createAppServer = () => {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins()
    }
  });

  app.get("/health", (_request, response) => {
    response.json({
      ok: true
    });
  });

  registerSocketHandlers(io);

  return {
    app,
    httpServer,
    io
  };
};
