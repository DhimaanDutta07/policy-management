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
  // Handle CORS preflight directly
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, role");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

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
