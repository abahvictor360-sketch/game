import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin } from '@/lib/server/api';
import { COOKIE_NAME } from '@/lib/server/session-cookie';

export async function POST(req: NextRequest) {
  assertSameOrigin(req);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.delete(COOKIE_NAME);
  // Clear Supabase auth cookies too.
  for (const c of req.cookies.getAll()) if (c.name.startsWith('sb-')) res.cookies.delete(c.name);
  return res;
}
