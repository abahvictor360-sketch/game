import { describe, expect, it } from 'vitest';
import { normaliseDbUrl } from '@/lib/server/db';

describe('database URL normalisation', () => {
  it('strips integration-only parameters and requires SSL for remote hosts', () => {
    const r = normaliseDbUrl('postgres://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x');
    expect(r.url).toBe('postgres://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres');
    expect(r.ssl).toBe('require');
  });
  it('uses no SSL for local servers', () => {
    expect(normaliseDbUrl('postgres://postgres:postgres@localhost:5432/postgres').ssl).toBe(false);
  });
});
