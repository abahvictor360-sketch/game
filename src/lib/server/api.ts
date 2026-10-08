import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { ensureReady } from './bootstrap';
import type { Db } from './db';
import { AppError } from './errors';
import { captureException } from './monitoring';

export function jsonError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, reason: err.reason ?? null } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Invalid request.', reason: null } }, { status: 400 });
  }
  captureException(err);
  return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.', reason: null } }, { status: 500 });
}

/** Reject cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients; cookies still required
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (new URL(origin).host !== host) throw new AppError('forbidden', 'Cross-site request blocked.');
}

export function api<C>(handler: (req: NextRequest, db: Db, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      assertSameOrigin(req);
      const db = await ensureReady();
      return await handler(req, db, ctx);
    } catch (err) {
      return jsonError(err);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new AppError('bad_request', 'Invalid JSON body.');
  }
  return schema.parse(data);
}

/** For form-based starts: redirect with 303 so the browser follows with GET. */
export function redirect303(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url), 303);
}
