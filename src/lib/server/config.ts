import 'server-only';
import { DEFAULT_FLAGS, DEFAULT_RULES, FlagsSchema, RulesSchema, type Flags, type Rules } from '@/lib/game/rules';
import { pgJson, type Queryable } from './db';

export type ConfigVersion = { version: number; rules: Rules; flags: Flags; createdAt: Date; note: string | null };

const cache = new Map<number, ConfigVersion>();

function parse(row: { version: number; rules: unknown; flags: unknown; created_at: Date; note: string | null }): ConfigVersion {
  // Merge with defaults so older rows stay readable after new settings are added.
  const rules = RulesSchema.parse(deepMerge(DEFAULT_RULES, row.rules));
  const flags = FlagsSchema.parse({ ...DEFAULT_FLAGS, ...(row.flags as object) });
  return { version: row.version, rules, flags, createdAt: row.created_at, note: row.note };
}

function deepMerge<T>(base: T, over: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (over ?? base) as T;
  if (typeof over !== 'object' || over === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Environment overrides for feature flags, e.g. FEATURE_FLAGS=friendChallenges,ghostOpponents */
export function applyEnvFlags(flags: Flags): Flags {
  const forced = (process.env.FEATURE_FLAGS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!forced.length) return flags;
  const out = { ...flags };
  for (const f of forced) if (f in out) (out as Record<string, boolean>)[f] = true;
  return out;
}

export async function getConfigVersion(q: Queryable, version: number): Promise<ConfigVersion> {
  const hit = cache.get(version);
  if (hit) return hit;
  const [row] = await q.query<{ version: number; rules: unknown; flags: unknown; created_at: Date; note: string | null }>(
    'select version, rules, flags, created_at, note from public.game_config where version = $1',
    [version],
  );
  if (!row) throw new Error(`Missing game_config version ${version}`);
  const parsed = parse(row);
  cache.set(version, parsed);
  return parsed;
}

export async function getActiveConfig(q: Queryable): Promise<ConfigVersion> {
  const [row] = await q.query<{ version: number }>('select max(version)::int as version from public.game_config');
  if (!row?.version) throw new Error('No game configuration found; bootstrap has not run.');
  const cfg = await getConfigVersion(q, row.version);
  return { ...cfg, flags: applyEnvFlags(cfg.flags) };
}

export async function ensureDefaultConfig(q: Queryable) {
  await q.query(
    `insert into public.game_config(version, rules, flags, note) values (1, $1::jsonb, $2::jsonb, 'Proposed defaults')
     on conflict (version) do nothing`,
    [pgJson(DEFAULT_RULES), pgJson(DEFAULT_FLAGS)],
  );
}

export async function saveNewConfig(
  q: Queryable,
  input: { rules: Rules; flags: Flags; note: string | null; actorId: string },
): Promise<number> {
  const [row] = await q.query<{ version: number }>(
    `insert into public.game_config(version, rules, flags, note, created_by)
     select coalesce(max(version), 0) + 1, $1::jsonb, $2::jsonb, $3, $4 from public.game_config
     returning version`,
    [pgJson(input.rules), pgJson(input.flags), input.note, input.actorId],
  );
  return row.version;
}
