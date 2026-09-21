import { createGameServer } from "./app.ts";

// A --port argument wins over the PORT variable, so the dev script can pin the API port next to Vite.
const portFlag = process.argv.indexOf("--port");
const port = Number(portFlag !== -1 ? process.argv[portFlag + 1] : (process.env.PORT ?? 3001));
const server = createGameServer({
  botDelayMs: Number(process.env.BOT_DELAY_MS ?? 900),
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS ?? 30_000),
  hostGraceMs: Number(process.env.HOST_GRACE_MS ?? 120_000),
});

server.http.listen(port, () => {
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "listening", port }));
});

function stop(): void {
  void server.close().finally(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("unhandledRejection", (reason) => console.error("unhandledRejection", reason));
