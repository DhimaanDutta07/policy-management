import type { VercelRequest, VercelResponse } from "@vercel/node";

let app: any;

async function getApp() {
  if (!app) {
    const server = await import("../src/server");
    app = server.default;
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expressApp = await getApp();
    return new Promise<void>((resolve, reject) => {
      expressApp(req, res);
      res.once("finish", resolve);
      res.once("error", reject);
    });
  } catch (err: any) {
    console.error("Initialization error:", err);
    res.status(500).json({
      error: "Initialization Error",
      message: err.message,
      stack: err.stack,
    });
  }
}
