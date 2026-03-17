import { io } from "socket.io-client";

const getFallbackServerUrl = () => {
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "127.0.0.1";
  return `${protocol}//${hostname}:3001`;
};

export const serverUrl = import.meta.env.VITE_SERVER_URL ?? getFallbackServerUrl();

export const createGameSocket = () => {
  return io(serverUrl, {
    autoConnect: false
  });
};
