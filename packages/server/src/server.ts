import { createServer } from "node:http";
import express from "express";
import { Server as SocketIOServer } from "socket.io";

import { registerSocketHandlers } from "./socket.js";

export const createAppServer = () => {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*"
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
