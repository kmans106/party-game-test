import { io } from "socket.io-client";

export const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001";

export const createGameSocket = () => {
  return io(serverUrl, {
    autoConnect: false
  });
};
