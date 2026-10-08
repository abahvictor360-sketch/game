import { ImageResponse } from 'next/og';
import { IconArt } from '@/lib/shared/icon-art';

export async function GET(req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const px = size === '512' ? 512 : 192;
  const maskable = new URL(req.url).searchParams.has('maskable');
  const res = new ImageResponse(<IconArt size={px} padded={maskable} />, { width: px, height: px });
  res.headers.set('Cache-Control', 'public, max-age=86400, immutable');
  return res;
}
