import Link from 'next/link';
import { notFound } from 'next/navigation';
import { questionAction } from '@/app/admin/actions';
import { QuestionForm } from '@/components/admin/QuestionForm';
import { Card, H1, Status, btnDanger, btnGold, btnPrimary, btnQuiet } from '@/components/admin/ui';
import { observedDifficulty } from '@/lib/game/scoring';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { detailToInput, getQuestionDetail } from '@/lib/server/content';
import { requireStaff } from '@/lib/server/staff';

export const metadata = { title: 'Question' };

export default async function QuestionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const staff = await requireStaff();
  const db = await ensureReady();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getQuestionDetail(db, id);
  if (!d) notFound();
  const cfg = await getActiveConfig(db);
  const latest = d.versions[0];
  const live = d.versions.find((v) => v.id === d.liveVersionId) ?? null;
  const categories = await db.query<{ id: string; name: string }>('select id, name from public.categories order by sort_order');
  const history = await db.query<{ action: string; created_at: Date; actor: string | null; data: Record<string, unknown> }>(
    `select a.action, a.created_at, p.display_name as actor, a.data from public.audit_events a left join public.players p on p.id = a.actor_id
      where a.entity_type = 'question' and a.entity_id = $1 order by a.created_at desc limit 50`,
    [id],
  );
  const reports = await db.query<{ id: string; reason: string; details: string | null; status: string; created_at: Date }>(
    'select id, reason, details, status, created_at from public.question_reports where question_id = $1 order by created_at desc limit 20',
    [id],
  );
  const isAdmin = staff.role === 'admin';
  const act = questionAction.bind(null, id);
  const stats = live?.stats ?? latest.stats;
  const observed = observedDifficulty(stats.attempts, stats.correct, cfg.rules.calibration);

  if (sp.edit === '1') {
    return (
      <div className="max-w-3xl">
        <H1>Edit question</H1>
        <Card>
          <QuestionForm questionId={id} initial={detailToInput(latest)} categories={categories} editsLive={latest.state === 'approved'} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <H1
        actions={
          <div className="flex flex-wrap gap-2">
            {d.status !== 'archived' ? (
              <Link href={`/admin/questions/${id}?edit=1`} className={btnQuiet}>
                Edit
              </Link>
            ) : null}
            {['draft', 'rejected'].includes(latest.state) ? (
              <form action={act}>
                <button name="action" value="submit" className={btnPrimary}>
                  Submit for review
                </button>
              </form>
            ) : null}
            {isAdmin && ['draft', 'review'].includes(latest.state) && d.status !== 'archived' ? (
              <form action={act}>
                <button name="action" value="approve" className={btnGold}>
                  Approve & publish v{latest.version}
                </button>
              </form>
            ) : null}
            {isAdmin && d.status !== 'archived' ? (
              <form action={act}>
                <button name="action" value="archive" className={btnDanger}>
                  Archive
                </button>
              </form>
            ) : null}
            {isAdmin && d.status === 'archived' ? (
              <form action={act}>
                <button name="action" value="restore" className={btnPrimary}>
                  Restore
                </button>
              </form>
            ) : null}
          </div>
        }
      >
        Question <Status value={d.status} />
      </H1>
      {sp.saved ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Saved.</p> : null}
      {d.isFixture ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Development fixture: not verified content.</p> : null}

      {latest.state === 'review' ? (
        <Card className="border-amber-300">
          <form action={act} className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-sm font-semibold">
              Review note
              <input name="note" className="field mt-1" placeholder="Required when sending back" />
            </label>
            <button name="action" value="reject" className={btnQuiet}>
              Send back to draft
            </button>
            {isAdmin ? (
              <button name="action" value="approve" className={btnGold}>
                Approve
              </button>
            ) : null}
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <p className="text-label font-bold uppercase text-ink-500">
            Latest version v{latest.version} · <Status value={latest.state} /> {live && live.id !== latest.id ? <> · live is v{live.version}</> : null}
          </p>
          <h2 className="mt-2 text-lg font-bold">{latest.text}</h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {latest.options.map((o) => (
              <li key={o.id} className={`rounded-xl border px-3 py-2 text-sm ${o.label === latest.correctLabel ? 'border-emerald-400 bg-emerald-50 font-semibold' : 'border-ivory-200'}`}>
                <span className="font-bold">{o.label}.</span> {o.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-700">{latest.explanation}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-500">Category</dt>
              <dd>{categories.find((c) => c.id === latest.categoryId)?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Editorial difficulty</dt>
              <dd className="capitalize">{latest.difficulty}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Scope</dt>
              <dd>{latest.countryScope.join(', ') || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Age rating · language</dt>
              <dd>
                {latest.ageRating} · {latest.language}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Verified</dt>
              <dd>{latest.verifiedAt ?? <span className="text-coral-700">not verified</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Author · reviewer</dt>
              <dd>
                {latest.authorName ?? '-'} · {latest.reviewerName ?? '-'}
              </dd>
            </div>
            <div className="col-span-2 md:col-span-3">
              <dt className="text-xs text-ink-500">Sources</dt>
              <dd>
                {latest.sources.length
                  ? latest.sources.map((s, i) => (
                      <a key={i} href={s.url} className="mr-3 underline" target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    ))
                  : '-'}
              </dd>
            </div>
            {latest.tags.length ? (
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs text-ink-500">Tags</dt>
                <dd>{latest.tags.join(', ')}</dd>
              </div>
            ) : null}
            {latest.reviewNote ? (
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs text-ink-500">Review note</dt>
                <dd>{latest.reviewNote}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="font-bold">Calibration (live version)</h2>
            <p className="mt-1 text-sm">
              Unassisted answers: {stats.attempts} · correct {stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0}%
            </p>
            <p className="text-sm">
              Observed difficulty: <strong>{observed ?? `needs ${cfg.rules.calibration.minSample} answers`}</strong>
              {stats.locked ? ' · editorial difficulty locked' : ''}
            </p>
            {isAdmin && live ? (
              <form action={act} className="mt-2">
                <input type="hidden" name="versionId" value={live.id} />
                <button name="action" value={stats.locked ? 'unlock' : 'lock'} className={btnQuiet}>
                  {stats.locked ? 'Use observed difficulty' : 'Lock editorial difficulty'}
                </button>
              </form>
            ) : null}
          </Card>
          <Card>
            <h2 className="font-bold">Versions</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {d.versions.map((v) => (
                <li key={v.id} className="flex justify-between gap-2">
                  <span>
                    v{v.version} {v.id === d.liveVersionId ? '(live)' : ''}
                  </span>
                  <Status value={v.state} />
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <h2 className="font-bold">Reports</h2>
            {reports.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Status value={r.status} /> {r.reason}
                    {r.details ? `: ${r.details}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-500">No reports.</p>
            )}
          </Card>
        </div>
      </div>
      <Card>
        <h2 className="font-bold">Audit history</h2>
        <ul className="mt-2 divide-y divide-ivory-200 text-sm">
          {history.map((h, i) => (
            <li key={i} className="flex justify-between gap-2 py-1.5">
              <span>
                <strong>{h.actor ?? 'System'}</strong> · {h.action}
                {h.data?.note ? `: “${String(h.data.note)}”` : ''}
              </span>
              <span className="text-ink-500">{h.created_at.toISOString().slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
