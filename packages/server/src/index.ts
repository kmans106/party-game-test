import { createAppServer } from "./server.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3001);
const { httpServer } = createAppServer();

httpServer.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
