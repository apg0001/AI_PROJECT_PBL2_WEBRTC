// docs/diagrams/src/*.html → docs/diagrams/<이름>.png (2배 해상도)
// 실행: npm run diagrams [이름...]   (설치된 Google Chrome 사용, CHROME 환경변수로 경로 변경 가능)
import puppeteer from 'puppeteer-core';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'docs', 'diagrams', 'src');
const OUT = path.join(ROOT, 'docs', 'diagrams');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const only = process.argv.slice(2);
const files = (await readdir(SRC)).filter((f) => f.endsWith('.html') && (!only.length || only.includes(path.basename(f, '.html'))));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  for (const f of files) {
    await page.goto(pathToFileURL(path.join(SRC, f)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('#diagram');
    const out = path.join(OUT, `${path.basename(f, '.html')}.png`);
    await el.screenshot({ path: out });
    console.log('rendered', path.relative(ROOT, out));
  }
} finally {
  await browser.close();
}
