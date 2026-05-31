import type { IncomingMessage, ServerResponse } from "http";

let app: any;

async function getApp() {
  if (!app) {
    const server = await import("../src/server");
    app = server.default;
  }
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const expressApp = await getApp();
    return new Promise<void>((resolve, reject) => {
      expressApp(req, res);
      res.once("finish", resolve);
      res.once("error", reject);
    });
  } catch (err: any) {
    console.error("Initialization error:", err);
    (res as any).status(500).json({
      error: "Initialization Error",
      message: err.message,
      stack: err.stack,
    });
  }
}
