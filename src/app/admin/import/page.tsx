import { Card, H1 } from '@/components/admin/ui';
import { CSV_COLUMNS, MAX_ROWS } from '@/lib/server/csv';
import { ImportClient } from './ImportClient';

export const metadata = { title: 'Import questions' };

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <H1>Import questions (CSV)</H1>
      <Card>
        <p className="text-sm">
          Upload a UTF-8 CSV with one question per row (max {MAX_ROWS} rows, 2 MB). Rows are validated first — nothing is saved until you confirm. Imported questions start as drafts or in review; they are never published automatically.
        </p>
        <p className="mt-2 text-sm">
          Columns: <code className="text-xs">{CSV_COLUMNS.join(', ')}</code>. Use semicolons inside a cell for lists; sources are <code>Title|URL</code>.
        </p>
        <a href="/admin/import/template" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-ink-500/30 px-4 text-sm font-bold">
          Download CSV template
        </a>
      </Card>
      <ImportClient />
    </div>
  );
}
