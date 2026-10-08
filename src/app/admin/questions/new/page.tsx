import { QuestionForm } from '@/components/admin/QuestionForm';
import { Card, H1 } from '@/components/admin/ui';
import { ensureReady } from '@/lib/server/bootstrap';

export const metadata = { title: 'New question' };

export default async function NewQuestion() {
  const db = await ensureReady();
  const categories = await db.query<{ id: string; name: string }>('select id, name from public.categories order by sort_order');
  return (
    <div className="max-w-3xl">
      <H1>New question</H1>
      <Card>
        <QuestionForm questionId={null} initial={null} categories={categories} editsLive={false} />
      </Card>
    </div>
  );
}
