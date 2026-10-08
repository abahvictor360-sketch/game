import { Card, H1 } from '@/components/admin/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { requireStaff } from '@/lib/server/staff';
import { SettingsForm } from './SettingsForm';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireStaff('admin');
  const db = await ensureReady();
  const cfg = await getActiveConfig(db);
  const versions = await db.query<{ version: number; note: string | null; created_at: Date; actor: string | null }>(
    `select c.version, c.note, c.created_at, p.display_name as actor from public.game_config c left join public.players p on p.id = c.created_by order by c.version desc limit 10`,
  );
  return (
    <div className="space-y-4">
      <H1>Game settings</H1>
      <p className="max-w-3xl text-sm text-ink-700">
        Saving creates a new ruleset version. Every game records the version it started with, so games in progress are never affected. Changing scoring, timers or the question ladder starts a fresh all-time leaderboard, so results under different rules are never mixed.
      </p>
      <SettingsForm rules={cfg.rules} flags={cfg.flags} envFlags={process.env.FEATURE_FLAGS ?? ''} />
      <Card>
        <h2 className="font-bold">Ruleset history</h2>
        <ul className="mt-2 divide-y divide-ivory-200 text-sm">
          {versions.map((v) => (
            <li key={v.version} className="flex justify-between py-1.5">
              <span>
                v{v.version} {v.version === cfg.version ? '(active)' : ''} — {v.note ?? 'no note'}
              </span>
              <span className="text-ink-500">
                {v.actor ?? 'System'} · {v.created_at.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
