// Minimal Apify API client: run one of our Actors synchronously with the CALLER's token.
export const API_BASE = 'https://api.apify.com/v2';
const MAX_TEXT = 90_000;

export class ApifyCallError extends Error {
    constructor(message, status) { super(message); this.status = status; }
}

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

async function apiJson(fetchImpl, url, init) {
    const res = await fetchImpl(url, init);
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new ApifyCallError('Apify rejected the API token (401/403). Check the token and that it can run Actors.', res.status);
    if (res.status === 402) throw new ApifyCallError('Apify reports insufficient credit or the spend cap was too low for this run (402). Add credit or raise maxCostUsd.', 402);
    if (!res.ok) {
        let msg = text.slice(0, 300);
        try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* keep raw */ }
        throw new ApifyCallError(`Apify API error ${res.status}: ${msg}`, res.status);
    }
    try { return JSON.parse(text); } catch { throw new ApifyCallError('Apify returned a non-JSON response.', 502); }
}

/**
 * Starts one of our Actors with the CALLER's token, waits for it to finish, and returns its dataset items plus the run id.
 * @param {{token:string, actorOwner:string, actor:string, input:object, maxTotalChargeUsd:number, maxItems?:number, timeoutSecs?:number, fetchImpl?:typeof fetch}} p
 */
export async function runActorSync({ token, actorOwner, actor, input, maxTotalChargeUsd, maxItems = 200, timeoutSecs = 240, fetchImpl = fetch }) {
    if (!token) throw new ApifyCallError('No Apify API token. Pass your token as "Authorization: Bearer <token>" (remote) or set APIFY_TOKEN (local).', 401);
    const auth = { authorization: `Bearer ${token}` };
    const qs = new URLSearchParams({ timeout: String(timeoutSecs), maxItems: String(maxItems), maxTotalChargeUsd: String(maxTotalChargeUsd), waitForFinish: '55' });
    let run = (await apiJson(fetchImpl, `${API_BASE}/acts/${encodeURIComponent(actorOwner)}~${encodeURIComponent(actor)}/runs?${qs}`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify(input),
    })).data;
    const runId = run?.id ?? null;
    const deadline = Date.now() + (timeoutSecs + 15) * 1000;
    while (run && !TERMINAL.has(run.status)) {
        if (Date.now() > deadline) {
            try { await fetchImpl(`${API_BASE}/actor-runs/${runId}/abort`, { method: 'POST', headers: auth }); } catch { /* best effort */ }
            throw new ApifyCallError(`The Actor did not finish within ${timeoutSecs}s (run ${runId} was stopped). Try fewer URLs.`, 408);
        }
        run = (await apiJson(fetchImpl, `${API_BASE}/actor-runs/${runId}?waitForFinish=55`, { headers: auth })).data;
    }
    if (run.status === 'TIMED-OUT') throw new ApifyCallError(`The Actor did not finish within ${timeoutSecs}s (run ${runId}). Try fewer URLs.`, 408);
    if (run.status !== 'SUCCEEDED') throw new ApifyCallError(`The Actor run ${runId} ended with status ${run.status}.`, 502);
    const items = await apiJson(fetchImpl, `${API_BASE}/datasets/${run.defaultDatasetId}/items?clean=false&limit=${maxItems}`, { headers: auth });
    return { items: Array.isArray(items) ? items : [items], runId };
}

/** Compact text for the model; truncates very large results with a clear note. */
export function formatResult({ tool, items, runId, capUsd }) {
    const payload = { tool: tool.name, actor: `${tool.actor}`, itemCount: items.length, maxCostUsd: capUsd, runId, items };
    let text = JSON.stringify(payload, null, 1);
    let truncated = false;
    if (text.length > MAX_TEXT) {
        truncated = true;
        const kept = [];
        let size = 400;
        for (const it of items) {
            const s = JSON.stringify(it, null, 1);
            if (size + s.length > MAX_TEXT) break;
            kept.push(it); size += s.length;
        }
        text = JSON.stringify({ ...payload, items: kept, truncated: true, note: `Output truncated: showing ${kept.length} of ${items.length} rows. Re-run with fewer URLs.` }, null, 1);
    }
    return { text, truncated };
}
