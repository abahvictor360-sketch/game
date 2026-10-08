import { csvTemplate } from '@/lib/server/csv';
import { requireStaff } from '@/lib/server/staff';

export async function GET() {
  await requireStaff();
  return new Response(csvTemplate() + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="fastora-questions-template.csv"' },
  });
}
