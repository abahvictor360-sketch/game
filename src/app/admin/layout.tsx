import Link from 'next/link';
import { BrandMark } from '@/components/Brand';
import { requireStaff } from '@/lib/server/staff';

export const metadata = { title: { default: 'Admin', template: '%s · Fastora Admin' }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const links = [
    ['/admin', 'Overview'],
    ['/admin/questions', 'Questions'],
    ['/admin/import', 'Import'],
    ['/admin/reports', 'Reports'],
    ...(staff.role === 'admin' ? [['/admin/settings', 'Settings']] : []),
  ];
  return (
    <div className="ivory relative z-10 min-h-dvh" style={{ colorScheme: 'light' }}>
      <header className="border-b border-ivory-200 bg-stage-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-display font-black">
            <BrandMark size={30} /> Fastora Admin
          </Link>
          <nav aria-label="Admin" className="flex flex-wrap gap-1 text-sm font-semibold">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-2 hover:bg-white/10">
                {label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-blue-100/80">
            {staff.displayName} · {staff.role}
          </span>
          <Link href="/" className="text-xs underline">
            Back to game
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
