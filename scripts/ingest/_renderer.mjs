// scripts/ingest/_renderer.mjs
// Minimal wrapper around Playwright for headless rendering.
// Dynamically imports playwright if installed; otherwise returns null.

export async function renderPage(url, opts = {}) {
  let playwright;
  try {
    // Prefer chromium only
    playwright = await import('playwright');
  } catch {
    return { ok: false, reason: 'playwright-not-installed' };
  }
  const { chromium } = playwright;
  const timeout = opts.timeoutMs ?? 25000;
  const headers = opts.headers || {};
  const ua = headers['user-agent'] || headers['User-Agent'] || 'Mozilla/5.0 (GreenSaverBot)';
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: ua, extraHTTPHeaders: headers });
    const page = await context.newPage();

    const urls = Array.isArray(url) ? url : [url];
    let html = null, apollo = null, apolloCache = null, nextData = null;
    for (const u of urls) {
      try {
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout });
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
        try {
          await page.waitForFunction(() => !!(window.__APOLLO_STATE__ || document.getElementById('__NEXT_DATA__')), { timeout: 8000 });
        } catch {}
        html = await page.content();
        apollo = await page.evaluate(() => { try { return window.__APOLLO_STATE__ || null; } catch { return null; } });
        apolloCache = await page.evaluate(() => { try { return (window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache && window.__APOLLO_CLIENT__.cache.extract && window.__APOLLO_CLIENT__.cache.extract()) || null; } catch { return null; } });
        nextData = await page.evaluate(() => { try { const el = document.getElementById('__NEXT_DATA__'); return el ? JSON.parse(el.textContent) : null; } catch { return null; } });
        if (apollo || apolloCache || (nextData && (nextData.props?.pageProps?.apolloState || nextData.apolloState))) break;
      } catch {}
    }
    await context.close();
    await browser.close();
    return { ok: true, html, apollo, apolloCache, nextData };
  } catch (e) {
    try { if (browser) await browser.close(); } catch {}
    return { ok: false, reason: e?.message || String(e) };
  }
}
