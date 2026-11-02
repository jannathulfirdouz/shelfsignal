// Shared Base44 request pacing, used by the model runs and the summary refresh.
// Base44 caps list pages at 5000, so large pages mean far fewer requests.
export const PAGE = 5000;
// Stay under the 140 req/60s list limit (with headroom) within one invocation.
const REQ_BUDGET = 110;
const RATE_WINDOW_MS = 60000;
export const MAX_RETRIES = 5;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const msgOf = (e) => e?.data?.message || e?.message || "";
export const isDailyLimit = (e) => /daily entity write limit/i.test(msgOf(e));
export const isRateLimit = (e) => !isDailyLimit(e) && (e?.status === 429 || /rate limit|too many requests|retry after/i.test(msgOf(e)));
function retryAfterMs(e) { const m = /retry after (\d+)\s*s/i.exec(msgOf(e)); return m ? Number(m[1]) * 1000 : 10000; }
// Seconds a caller should pause when a rate limit outlasts the automatic retries.
export const retryAfterSec = (e) => Math.max(1, Math.round(retryAfterMs(e) / 1000));

// Sliding-window throttle so one invocation stays under the request budget.
const _reqTimes = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (_reqTimes.length && now - _reqTimes[0] >= RATE_WINDOW_MS) _reqTimes.shift();
    if (_reqTimes.length < REQ_BUDGET) { _reqTimes.push(now); return; }
    await sleep(RATE_WINDOW_MS - (now - _reqTimes[0]) + 50);
  }
}
// Throttle + automatic 429 retry: wait the seconds in the message, up to MAX_RETRIES.
export async function withRate(fn) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    try { return await fn(); }
    catch (e) {
      if (!isRateLimit(e) || attempt >= MAX_RETRIES) throw e;
      await sleep(retryAfterMs(e));
    }
  }
}

export async function readAll(b, name, query, fields) {
  const rows = []; let cursor;
  do {
    const p = await withRate(() => b.entities[name].filter(query, { limit: PAGE, cursor, fields }));
    rows.push(...(p.items ?? []));
    cursor = p.has_more ? p.next_cursor : undefined;
  } while (cursor);
  return rows;
}