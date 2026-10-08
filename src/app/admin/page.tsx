import Link from 'next/link';
import { Card, H1, Status } from '@/components/admin/ui';
import { challengeDateFor } from '@/lib/game/dates';
import { modeRules } from '@/lib/game/rules';
import { ensureReady } from '@/lib/server/bootstrap';
import { clock } from '@/lib/server/clock';
import { getActiveConfig } from '@/lib/server/config';
import { availableCounts } from '@/lib/server/game/selection';

export default async function AdminOverview() {
  const db = await ensureReady();
  const cfg = await getActiveConfig(db);
  const [byStatus, byCat, counts, reports, alerts, audit, fixtures, today] = await Promise.all([
    db.query<{ status: string; n: number }>('select status, count(*)::int as n from public.questions group by status order by status'),
    db.query<{ name: string; easy: number; medium: number; hard: number }>(
      `select c.name, count(*) filter (where v.difficulty = 'easy')::int as easy, count(*) filter (where v.difficulty = 'medium')::int as medium,
              count(*) filter (where v.difficulty = 'hard')::int as hard
         from public.categories c left join public.questions q on q.status = 'approved'
         left join public.question_versions v on v.id = q.live_version_id and v.category_id = c.id
        group by c.id, c.name, c.sort_order order by c.sort_order`,
    ),
    availableCounts(db, cfg.rules),
    db.query<{ n: number }>(`select count(*)::int as n from public.question_reports where status = 'open'`),
    db.query<{ id: number; kind: string; message: string; created_at: Date }>('select id, kind, message, created_at from public.ops_alerts where resolved_at is null order by created_at desc limit 5'),
    db.query<{ action: string; entity_type: string; entity_id: string; created_at: Date; actor: string | null }>(
      `select a.action, a.entity_type, a.entity_id, a.created_at, p.display_name as actor from public.audit_events a
         left join public.players p on p.id = a.actor_id order by a.created_at desc limit 12`,
    ),
    db.query<{ n: number }>('select count(*)::int as n from public.questions where is_fixture and status = $1', ['approved']),
    db.query<{ d: string }>(`select to_char(challenge_date, 'YYYY-MM-DD') as d from public.daily_challenges where challenge_date = $1::date`, [challengeDateFor(clock.now(), cfg.rules.daily.timezone)]),
  ]);
  const ladder = modeRules('classic', cfg.rules, cfg.flags).ladder;
  const need = { easy: ladder.filter((d) => d === 'easy').length, medium: ladder.filter((d) => d === 'medium').length, hard: ladder.filter((d) => d === 'hard').length };
  return (
    <div className="space-y-5">
      <H1 actions={<Link className="inline-flex min-h-11 items-center rounded-full bg-stage-700 px-4 text-sm font-bold text-white" href="/admin/questions/new">New question</Link>}>Overview</H1>
      {fixtures[0].n > 0 ? (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {fixtures[0].n} development fixture questions are live. They are <strong>not verified content</strong> and must be archived before launch.
        </p>
      ) : null}
      {alerts.length ? (
        <Card className="border-red-200">
          <h2 className="font-bold text-red-800">Operational alerts</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.id}>
                {a.created_at.toISOString().slice(0, 16).replace('T', ' ')} — {a.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-4">
        {['approved', 'review', 'draft', 'archived'].map((s) => (
          <Card key={s}>
            <Status value={s} />
            <p className="mt-2 font-display text-3xl font-black">{byStatus.find((b) => b.status === s)?.n ?? 0}</p>
            <Link className="text-xs underline" href={`/admin/questions?status=${s}`}>
              View
            </Link>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-bold">Servable pool (effective difficulty)</h2>
          <ul className="mt-2 text-sm">
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <li key={d} className="flex justify-between border-b border-ivory-200 py-1">
                <span className="capitalize">{d}</span>
                <span className={counts[d] < need[d] * 4 ? 'font-bold text-coral-700' : ''}>
                  {counts[d]} {counts[d] < need[d] * 4 ? '(low — repeats likely)' : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Today’s Daily Challenge: {today.length ? <Status value="approved" /> : <span className="font-bold text-coral-700">not published</span>} · Open reports:{' '}
            <Link className="font-bold underline" href="/admin/reports">
              {reports[0].n}
            </Link>
          </p>
          <p className="mt-1 text-xs text-ink-500">Active ruleset: version {cfg.version}</p>
        </Card>
        <Card>
          <h2 className="font-bold">Approved by category</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th scope="col">Category</th>
                <th scope="col" className="text-right">Easy</th>
                <th scope="col" className="text-right">Medium</th>
                <th scope="col" className="text-right">Hard</th>
              </tr>
            </thead>
            <tbody>
              {byCat.map((c) => (
                <tr key={c.name} className="border-t border-ivory-200">
                  <td className="py-1">{c.name}</td>
                  <td className="text-right">{c.easy}</td>
                  <td className="text-right">{c.medium}</td>
                  <td className="text-right">{c.hard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card>
        <h2 className="font-bold">Recent activity</h2>
        <ul className="mt-2 divide-y divide-ivory-200 text-sm">
          {audit.map((a, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <strong>{a.actor ?? 'System'}</strong> · {a.action}{' '}
                {a.entity_type === 'question' ? (
                  <Link className="underline" href={`/admin/questions/${a.entity_id}`}>
                    view
                  </Link>
                ) : null}
              </span>
              <span className="text-ink-500">{a.created_at.toISOString().slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
