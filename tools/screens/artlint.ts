/**
 * art:lint (ART_BIBLE §5.16 step 5): measured art gates computed by the real painter in Chromium.
 * Usage: npx tsx tools/screens/artlint.ts [baseUrl]
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node-tools/node_modules/playwright');
  }
}

async function main() {
  const base = process.argv[2] ?? 'http://127.0.0.1:5173';
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript('window.__name = (f) => f');
  const page = await ctx.newPage();
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !!(window as unknown as { __ws?: unknown }).__ws);
  const rows: { id: string; factionShare: number; midTone: number; laneGap: number }[] = await page.evaluate(() => (window as unknown as { __ws: { artLint(): Promise<unknown> } }).__ws.artLint());
  await browser.close();
  let fail = 0;
  for (const r of rows) {
    const okF = r.factionShare >= 0.2;
    const okL = r.laneGap >= 0.2 || r.laneGap <= -0.2;
    if (!okF || !okL) fail++;
    console.log(`${okF && okL ? 'PASS' : 'FAIL'}  ${r.id.padEnd(16)} faction ${(r.factionShare * 100).toFixed(0)}% (≥ 20%)  mid-tone L ${r.midTone.toFixed(2)}  lane gap ${r.laneGap.toFixed(2)} (|gap| ≥ 0.20)`);
  }
  if (fail) {
    console.error(`${fail} art check(s) failed`);
    process.exit(1);
  }
  console.log('art lint passed');
}
main();
