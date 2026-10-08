import { PageTitle, Panel } from '@/components/ui';

export const metadata = { title: 'Privacy' };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Privacy" subtitle="Draft notice for development — to be replaced by Fastora’s reviewed policy before launch." />
      <Panel className="space-y-3 text-sm text-blue-100/90">
        <p>We store your game results, answers and a pseudonymous player id to run the game, rank results and avoid repeating questions.</p>
        <p>If you create an account we store your email address (from Google or email sign-in). It is never shown publicly. Leaderboards show only your display name, avatar and optional country.</p>
        <p>Guests are identified by a secure cookie on this device. Clearing cookies starts a new guest profile.</p>
        <p>We use privacy-conscious product analytics (no answer content or email addresses) and error monitoring to keep the game working.</p>
        <p>You can switch off replays of your games as a “recorded player” in your profile settings.</p>
      </Panel>
    </div>
  );
}
