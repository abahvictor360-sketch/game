'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { commitImport, previewImport, type ImportState } from '@/app/admin/actions';
import { Card, btnGold, btnPrimary } from '@/components/admin/ui';

const initial: ImportState = { stage: 'idle', fatal: null, rows: [], valid: 0, csv: '', filename: null };

export function ImportClient() {
  const [preview, doPreview, previewing] = useActionState(previewImport, initial);
  const [done, doCommit, committing] = useActionState(commitImport, initial);
  const errors = preview.rows.filter((r) => r.errors.length);
  if (done.stage === 'done') {
    return (
      <Card>
        <p role="status" className="font-bold text-emerald-800">
          Imported {done.created} question{done.created === 1 ? '' : 's'}.
        </p>
        {done.rows.length ? <p className="mt-1 text-sm">{done.rows.length} row(s) were skipped because of errors.</p> : null}
        <Link className={`${btnPrimary} mt-3`} href="/admin/questions?status=review">
          Review imported questions
        </Link>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <form action={doPreview} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">
            CSV file
            <input type="file" name="file" accept=".csv,text/csv" required className="mt-1 block text-sm" />
          </label>
          <button className={btnPrimary} disabled={previewing}>
            {previewing ? 'Checking…' : 'Validate'}
          </button>
        </form>
      </Card>
      {preview.stage === 'preview' ? (
        <Card>
          {preview.fatal ? (
            <p role="alert" className="font-semibold text-red-800">
              {preview.fatal}
            </p>
          ) : (
            <>
              <p className="font-bold">
                {preview.valid} of {preview.rows.length} rows are ready to import. {errors.length ? `${errors.length} row(s) have problems and will be skipped.` : ''}
              </p>
              {errors.length ? (
                <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-red-200">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Rows with errors</caption>
                    <thead className="sticky top-0 bg-red-50 text-left text-xs">
                      <tr>
                        <th scope="col" className="px-2 py-1">Line</th>
                        <th scope="col" className="px-2 py-1">Question</th>
                        <th scope="col" className="px-2 py-1">Problems</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((r) => (
                        <tr key={r.line} className="border-t border-red-100 align-top">
                          <td className="px-2 py-1 font-mono">{r.line}</td>
                          <td className="px-2 py-1">{r.text || <em>empty</em>}</td>
                          <td className="px-2 py-1 text-red-800">
                            <ul>
                              {r.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {preview.valid ? (
                <form action={doCommit} className="mt-4 flex flex-wrap items-center gap-3">
                  <input type="hidden" name="csv" value={preview.csv} />
                  <input type="hidden" name="filename" value={preview.filename ?? ''} />
                  <label className="text-sm font-semibold">
                    Import as
                    <select name="state" className="field ml-2 inline-block w-auto">
                      <option value="review">In review</option>
                      <option value="draft">Draft</option>
                    </select>
                  </label>
                  <button className={btnGold} disabled={committing}>
                    {committing ? 'Importing…' : `Import ${preview.valid} question${preview.valid === 1 ? '' : 's'}`}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </Card>
      ) : null}
    </>
  );
}
