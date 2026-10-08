import Link from 'next/link';
import { resolveReport } from '@/app/admin/actions';
import { Card, H1, Status, btnPrimary, btnQuiet } from '@/components/admin/ui';
import { ensureReady } from '@/lib/server/bootstrap';

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: s } = await searchParams;
  const status = ['open', 'resolved', 'dismissed'].includes(s ?? '') ? s! : 'open';
  const db = await ensureReady();
  const rows = await db.query<{ id: string; question_id: string; reason: string; details: string | null; created_at: Date; text: string; version: number; resolution_note: string | null; reporter: string | null }>(
    `select r.id, r.question_id, r.reason, r.details, r.created_at, v.text, v.version, r.resolution_note, p.display_name as reporter
       from public.question_reports r join public.question_versions v on v.id = r.version_id left join public.players p on p.id = r.player_id
      where r.status = $1 order by r.created_at desc limit 100`,
    [status],
  );
  return (
    <div>
      <H1>Player reports</H1>
      <nav className="mb-4 flex gap-2" aria-label="Report status">
        {['open', 'resolved', 'dismissed'].map((x) => (
          <Link key={x} href={`/admin/reports?status=${x}`} className={x === status ? btnPrimary : btnQuiet} aria-current={x === status ? 'page' : undefined}>
            {x}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card>
          <p className="text-ink-500">No {status} reports.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <Status value={status} /> <strong className="capitalize">{r.reason}</strong> · v{r.version} · {r.reporter ?? 'player'} · {r.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                  </span>
                  <Link className="underline" href={`/admin/questions/${r.question_id}`}>
                    Open question
                  </Link>
                </div>
                <p className="mt-2 font-semibold">{r.text}</p>
                {r.details ? <p className="mt-1 text-sm text-ink-700">“{r.details}”</p> : null}
                {status === 'open' ? (
                  <form action={resolveReport.bind(null, r.id)} className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="flex-1 text-sm font-semibold">
                      Resolution note
                      <input name="note" className="field mt-1" placeholder="What was done?" />
                    </label>
                    <button name="status" value="resolved" className={btnPrimary}>
                      Resolve
                    </button>
                    <button name="status" value="dismissed" className={btnQuiet}>
                      Dismiss
                    </button>
                  </form>
                ) : r.resolution_note ? (
                  <p className="mt-2 text-sm text-ink-500">Note: {r.resolution_note}</p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
