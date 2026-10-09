import type { Page } from '@playwright/test';

/**
 * Measures the contrast of every visible piece of text against the pixels
 * actually behind it (gradients, patterns and artwork included), which axe
 * cannot judge. Text is hidden, the viewport is screenshotted, and each text
 * box's background is sampled (passing decorations such as confetti are
 * left out); the 5th-percentile ratio is compared with
 * WCAG AA (4.5:1, or 3:1 for large text). Returns the failures.
 */
export type ContrastFailure = { text: string; ratio: number; need: number; size: number; weight: number };

export async function auditContrast(page: Page): Promise<ContrastFailure[]> {
  await page.waitForTimeout(1600); // entrance animations
  const failures: ContrastFailure[] = [];
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let top = 0; top < total; top += Math.floor(vh * 0.8)) {
    await page.evaluate((y) => scrollTo(0, y), top);
    await page.waitForTimeout(250);
    const items = await page.evaluate(() => {
      const out: { text: string; color: string; size: number; weight: number; op: number; x: number; y: number; w: number; h: number }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode;
        if (!t.textContent?.trim()) continue;
        const el = t.parentElement;
        if (!el || el.closest('.sr-only,script,style,noscript,title,option,svg,:disabled')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const r of range.getClientRects()) {
          if (r.width < 3 || r.height < 3 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
          const covered = [0.15, 0.5, 0.85].some((fy) => {
            const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * fy);
            return h && !el.contains(h) && !h.contains(el);
          });
          if (covered) continue;
          let op = 1;
          for (let e: Element | null = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
          out.push({ text: t.textContent.trim().slice(0, 40), color: cs.color, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight), op, x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
      return out;
    });
    if (!items.length) continue;
    const hide = await page.addStyleTag({ content: '*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important} .confetti,.tap-ripple{display:none!important}' });
    await page.waitForTimeout(60);
    const shot = (await page.screenshot()).toString('base64');
    await hide.evaluate((n) => (n as HTMLElement).remove());
    const res = await page.evaluate(
      async ({ shot, items }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + shot;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const dpr = img.width / innerWidth;
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const ratio = (a: number[], b: number[]) => {
          const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
          return (x + 0.05) / (y + 0.05);
        };
        // Let the browser convert any CSS colour (oklab, lab, …) to sRGB + alpha.
        const one = document.createElement('canvas');
        one.width = one.height = 1;
        const oc = one.getContext('2d', { willReadFrequently: true })!;
        const parse = (s: string) => {
          oc.clearRect(0, 0, 1, 1);
          oc.fillStyle = s;
          oc.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = oc.getImageData(0, 0, 1, 1).data;
          return a ? { rgb: [r, g, b].map((v) => Math.round((v * 255) / a)), a: a / 255 } : { rgb: [0, 0, 0], a: 0 };
        };
        return items.map((it) => {
          const { rgb, a } = parse(it.color);
          const alpha = a * it.op;
          const d = ctx.getImageData(Math.round(it.x * dpr), Math.round(it.y * dpr), Math.max(1, Math.round(it.w * dpr)), Math.max(1, Math.round(it.h * dpr))).data;
          const ratios: number[] = [];
          for (let i = 0; i < d.length; i += 12) {
            const bg = [d[i], d[i + 1], d[i + 2]];
            ratios.push(ratio(rgb.map((v, k) => v * alpha + bg[k] * (1 - alpha)), bg));
          }
          ratios.sort((m, n) => m - n);
          const p5 = ratios[Math.floor(ratios.length * 0.05)] ?? 99;
          const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
          return { text: it.text, ratio: Math.round(p5 * 100) / 100, need: large ? 3 : 4.5, size: it.size, weight: it.weight };
        });
      },
      { shot, items },
    );
    for (const r of res) if (r.ratio < r.need) failures.push(r);
  }
  await page.evaluate(() => scrollTo(0, 0));
  return failures;
}
