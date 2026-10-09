import Link from 'next/link';
import { Card, H1, Status, btnPrimary, btnQuiet } from '@/components/admin/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { Icon } from '@/components/Icon';

const PAGE = 30;

export const metadata = { title: 'Questions' };

export default async function QuestionsList({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = await ensureReady();
  const page = Math.max(1, Number(sp.page) || 1);
  const status = ['draft', 'review', 'approved', 'archived'].includes(sp.status ?? '') ? sp.status! : null;
  const difficulty = ['easy', 'medium', 'hard'].includes(sp.difficulty ?? '') ? sp.difficulty! : null;
  const category = sp.category || null;
  const search = (sp.q ?? '').trim().slice(0, 100) || null;
  const pending = sp.pending === '1';
  const categories = await db.query<{ id: string; name: string }>('select id, name from public.categories order by sort_order');
  const where = `where ($1::text is null or q.status = $1) and ($2::text is null or v.difficulty = $2) and ($3::text is null or v.category_id = $3)
                   and ($4::text is null or v.text ilike '%' || $4 || '%' or $4 = any(v.tags) or q.id::text = $4)
                   and (not $5 or q.latest_version_id is distinct from q.live_version_id)`;
  const params = [status, difficulty, category, search, pending];
  const rows = await db.query<{ id: string; status: string; text: string; difficulty: string; category: string; version: number; updated_at: Date; is_fixture: boolean; has_pending: boolean; open_reports: number }>(
    `select q.id, q.status, v.text, v.difficulty, c.name as category, v.version, q.updated_at, q.is_fixture,
            (q.live_version_id is not null and q.latest_version_id <> q.live_version_id) as has_pending,
            (select count(*)::int from public.question_reports r where r.question_id = q.id and r.status = 'open') as open_reports
       from public.questions q join public.question_versions v on v.id = q.latest_version_id join public.categories c on c.id = v.category_id
       ${where} order by q.updated_at desc limit ${PAGE} offset $6`,
    [...params, (page - 1) * PAGE],
  );
  const [{ n }] = await db.query<{ n: number }>(
    `select count(*)::int as n from public.questions q join public.question_versions v on v.id = q.latest_version_id ${where}`,
    params,
  );
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/admin/questions?${u}`;
  };
  return (
    <div>
      <H1 actions={<Link className={btnPrimary} href="/admin/questions/new">New question</Link>}>Questions</H1>
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-6" role="search">
          <label className="text-sm font-semibold md:col-span-2">
            Search
            <input name="q" defaultValue={search ?? ''} className="field mt-1" placeholder="Text, tag or id" />
          </label>
          <label className="text-sm font-semibold">
            Status
            <select name="status" defaultValue={status ?? ''} className="field mt-1">
              <option value="">Any</option>
              {['draft', 'review', 'approved', 'archived'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Difficulty
            <select name="difficulty" defaultValue={difficulty ?? ''} className="field mt-1">
              <option value="">Any</option>
              {['easy', 'medium', 'hard'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Category
            <select name="category" defaultValue={category ?? ''} className="field mt-1">
              <option value="">Any</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="pending" value="1" defaultChecked={pending} /> Unpublished edits
            </label>
          </div>
          <div className="md:col-span-6">
            <button className={btnPrimary}>Filter</button>{' '}
            <Link href="/admin/questions" className={btnQuiet}>
              Reset
            </Link>
          </div>
        </form>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Questions</caption>
          <thead className="bg-ivory-100 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2">Question</th>
              <th scope="col" className="px-3 py-2">Category</th>
              <th scope="col" className="px-3 py-2">Difficulty</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-500">
                  No questions match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-ivory-200 hover:bg-ivory-50">
                  <td className="px-3 py-2">
                    <Link href={`/admin/questions/${r.id}`} className="font-semibold text-stage-700 underline-offset-2 hover:underline">
                      {r.text}
                    </Link>
                    <span className="ml-2 space-x-1 text-xs">
                      {r.is_fixture ? <span className="rounded bg-amber-100 px-1 text-amber-800">fixture</span> : null}
                      {r.has_pending ? <span className="rounded bg-blue-100 px-1 text-blue-800">v{r.version} pending</span> : null}
                      {r.open_reports ? <span className="rounded bg-red-100 px-1 text-red-800">{r.open_reports} report(s)</span> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2 capitalize">{r.difficulty}</td>
                  <td className="px-3 py-2">
                    <Status value={r.status} />
                  </td>
                  <td className="px-3 py-2 text-ink-500">{r.updated_at.toISOString().slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <nav aria-label="Pages" className="mt-3 flex items-center justify-between text-sm">
        {page > 1 ? <Link className={btnQuiet} href={qs(page - 1)}><Icon name="arrow-left" size={16} /> Previous</Link> : <span />}
        <span className="text-ink-500">
          {n} questions · page {page} of {Math.max(1, Math.ceil(n / PAGE))}
        </span>
        {page * PAGE < n ? <Link className={btnQuiet} href={qs(page + 1)}>Next <Icon name="arrow-right" size={16} /></Link> : <span />}
      </nav>
    </div>
  );
}
