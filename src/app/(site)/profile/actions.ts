'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureReady } from '@/lib/server/bootstrap';
import { AppError } from '@/lib/server/errors';
import { requirePlayer } from '@/lib/server/identity';
import { updateProfile } from '@/lib/server/players';

export async function saveProfile(_prev: { error: string | null; ok: boolean }, form: FormData) {
  try {
    const player = await requirePlayer();
    const db = await ensureReady();
    await db.tx((q) =>
      updateProfile(q, player.id, {
        displayName: String(form.get('displayName') ?? ''),
        avatarKey: String(form.get('avatarKey') ?? 'baobab'),
        countryCode: String(form.get('countryCode') ?? '') || null,
        settings: {
          allowGhostReplay: form.get('allowGhostReplay') === 'on',
          helpOthers: form.get('helpOthers') === 'on',
        },
      }),
    );
    revalidatePath('/profile');
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof AppError ? e.message : 'Could not save your profile.', ok: false };
  }
}

export async function goSignIn() {
  redirect('/auth/signin?next=/profile');
}
