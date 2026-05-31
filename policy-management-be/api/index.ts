import { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  try {
    const server = await import('../src/server');
    const app = server.default;
    return app(req, res);
  } catch (err: any) {
    console.error('Initialization error:', err);
    res.status(500).json({
      error: 'Initialization Error',
      message: err.message,
      stack: err.stack,
    });
  }
}
