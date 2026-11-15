// One-call "AI visibility report": runs the audit Actors in parallel on the caller's account and turns the results
// into a plain-English summary with prioritized fixes. No LLM is used here; the wording is rule-based and repeatable.
import { z } from 'zod';
import { runActorSync, ApifyCallError } from './apify.js';
import { ACTOR_OWNER, AI_VISIBILITY_TOOL } from './tools.js';

export const REPORT_TOOL_NAME = 'ai_visibility_report';
export const REPORT_EVENT = 'ai-visibility-report';
const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export const reportShape = {
    url: z.string().url().describe('Your website, e.g. https://example.com (the homepage is checked).'),
    extraPages: z.array(z.string().url()).max(4).optional().describe('Up to 4 more important pages on the same site (pricing, product, about).'),
    includeAccessibility: z.boolean().optional().describe('Include a WCAG accessibility scan of the checked pages (default true).'),
    includeTechStack: z.boolean().optional().describe('Include CMS / framework / analytics detection (default true).'),
    includePageSpeed: z.boolean().optional().describe('Include Google PageSpeed (mobile) for the homepage (default true). Uses googleApiKey if given; otherwise one keyless attempt that Google may rate-limit.'),
    googleApiKey: z.string().min(20).max(200).optional().describe('Optional free Google PageSpeed Insights API key for reliable speed results.'),
    brand: z.string().min(1).max(80).optional().describe('Optional: your brand name, to also measure whether ChatGPT/Perplexity actually name you (needs your own AI key).'),
    competitors: z.array(z.string().min(1).max(80)).max(10).optional().describe('Optional competitor names for the AI answers check.'),
    prompts: z.array(z.string().min(5).max(300)).max(5).optional().describe('Optional: up to 5 buyer questions for the AI answers check. Default: 2 generic questions built from the brand.'),
    openaiApiKey: z.string().min(20).max(300).optional().describe('Optional: your OpenAI API key for the AI answers check (billed by OpenAI to you).'),
    perplexityApiKey: z.string().min(20).max(300).optional().describe('Optional: your Perplexity API key for the AI answers check.'),
    maxCostUsd: z.number().min(0.1).max(5).optional().describe('Optional overall spend cap in USD across the underlying checks (default 0.25).'),
};

export const REPORT_TOOL = {
    name: REPORT_TOOL_NAME,
    title: 'AI visibility report for my site',
    description: 'One call: check whether AI assistants (ChatGPT, Claude, Perplexity, Google AI, Apple) can reach, read and understand a website, and return a plain-English report with a 0-100 readiness score and prioritized fixes. Combines AI-crawler access (robots.txt, noindex, firewall signals), schema/llms.txt/meta readiness, mobile PageSpeed, accessibility and tech stack; optionally measures real ChatGPT/Perplexity answers if you supply your own AI key and brand. Typical cost about $0.03 per site. Informational only; it does not guarantee rankings or AI citations.',
    shape: reportShape,
};

const pct = (x) => `${Math.round(x * 100)}%`;
const sameOrigin = (a, b) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };

async function psiCall({ url, key, fetchImpl }) {
    const u = new URL(PSI_ENDPOINT);
    u.searchParams.set('url', url); u.searchParams.set('strategy', 'mobile'); u.searchParams.append('category', 'performance');
    if (key) u.searchParams.set('key', key);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60_000);
    try {
        const res = await fetchImpl(u.href, { signal: ctl.signal });
        const body = JSON.parse(await res.text());
        if (body.error) {
            if (body.error.code === 429) throw new Error(key ? 'Google PageSpeed quota is used up for today (429).' : 'Google\'s shared free PageSpeed quota is used up (429). Add a free googleApiKey for speed results.');
            throw new Error(`Google PageSpeed could not test this page (${body.error.code}).`);
        }
        const lh = body.lighthouseResult || {}; const a = lh.audits || {};
        const opp = Object.entries(a).filter(([, v]) => v?.details?.type === 'opportunity' && v.numericValue > 0 && (v.score ?? 0) < 0.9).sort((x, y) => y[1].numericValue - x[1].numericValue).slice(0, 3).map(([id, v]) => ({ id, title: v.title, displayValue: v.displayValue || null }));
        return { status: 'ok', url, strategy: 'mobile', scores: { performance: Math.round((lh.categories?.performance?.score ?? 0) * 100) }, metrics: { lcp: a['largest-contentful-paint']?.displayValue ?? null, cls: a['cumulative-layout-shift']?.displayValue ?? null, tbt: a['total-blocking-time']?.displayValue ?? null }, topOpportunities: opp };
    } finally { clearTimeout(t); }
}

/** Runs the checks. Each section can fail on its own; the report covers what succeeded. */
export async function runReport(args, { token, env = {}, fetchImpl = fetch, runImpl = runActorSync }) {
    const home = new URL(args.url).origin + '/';
    const pages = [home, ...(args.extraPages ?? []).filter((p) => sameOrigin(p, home) && p !== home)].slice(0, 5);
    const extraPaths = pages.slice(1).map((p) => { const u = new URL(p); return u.pathname + u.search; }).slice(0, 4);
    const budget = Math.min(args.maxCostUsd ?? 0.25, 5);
    const run = (actor, input, cap) => runImpl({ token, actorOwner: ACTOR_OWNER, actor, input, maxTotalChargeUsd: Math.max(0.05, Math.min(cap, budget)), timeoutSecs: 180, fetchImpl }).then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: e instanceof ApifyCallError ? e.message : String(e?.message ?? e).slice(0, 200) }));
    const jobs = {
        crawler: run('ai-crawler-access-auditor', { urls: [home], ...(extraPaths.length && { extraPaths }), aiSummary: false, saveReports: false }, 0.05),
        schema: run('schema-ai-readiness-validator', { urls: pages }, 0.05),
    };
    if (args.includeAccessibility !== false) jobs.accessibility = run('accessibility-wcag-checker', { urls: pages, maxViolationsListed: 10 }, 0.05);
    if (args.includeTechStack !== false) jobs.techStack = run('website-tech-stack-detector', { urls: [home] }, 0.05);
    if (args.includePageSpeed !== false) {
        // Called directly from this server (never passed into a run input), so a server-side key is never exposed to callers.
        const key = args.googleApiKey || env.GOOGLE_PSI_API_KEY;
        jobs.pageSpeed = psiCall({ url: home, key, fetchImpl }).then((r) => ({ ok: true, items: [r], runId: null, keyless: !key }), (e) => ({ ok: false, error: e.message }));
    }
    let aiCheckNote = null;
    if (args.brand) {
        const host = new URL(home).hostname.replace(/^www\./, '');
        const a = { brand: args.brand, brandDomain: host, competitors: args.competitors, prompts: args.prompts?.length ? args.prompts : [`What are the best options like ${args.brand}?`, `Is ${args.brand} (${host}) a good choice, and what are the alternatives?`], openaiApiKey: args.openaiApiKey, perplexityApiKey: args.perplexityApiKey };
        const keys = AI_VISIBILITY_TOOL.resolveKeys(a, env);
        a.providers = Object.keys(keys).filter((k) => keys[k]);
        if (a.providers.length) jobs.aiAnswers = run(AI_VISIBILITY_TOOL.actor, AI_VISIBILITY_TOOL.buildInput(a, env), 0.05 + 0.011 * a.prompts.length * a.providers.length);
        else aiCheckNote = 'Real AI answers were not measured (no OpenAI or Perplexity key supplied).';
    }
    const names = Object.keys(jobs);
    const results = {};
    const settled = await Promise.all(names.map((n) => jobs[n]));
    names.forEach((n, i) => { results[n] = settled[i]; });
    return summarize({ home, pages, results, aiCheckNote });
}

export function summarize({ home, pages, results, aiCheckNote }) {
    const fixes = []; const good = []; const sections = {}; const skipped = [];
    const add = (priority, area, fix, why) => fixes.push({ priority, area, fix, why });
    const runIds = {};
    const label = { crawler: 'AI crawler access', schema: 'Structured data', accessibility: 'Accessibility', techStack: 'Tech stack', pageSpeed: 'Mobile speed', aiAnswers: 'Real AI answers' };
    for (const [k, r] of Object.entries(results)) {
        if (r?.runId) runIds[k] = r.runId;
        if (r && !r.ok) skipped.push(`${label[k] ?? k}: ${r.error}`);
        else for (const it of r?.items ?? []) if (it?.status === 'error') skipped.push(`${label[k] ?? k}: ${it.url ?? it.site ?? 'page'} ${it.httpStatus ? `answered HTTP ${it.httpStatus} to our checker` : `could not be checked (${String(it.error ?? 'error').slice(0, 80)})`}.`);
    }
    const blocked = Object.values(results).some((r) => r?.items?.some((it) => it?.httpStatus === 403 || it?.httpStatus === 429));
    if (blocked) add('high', 'Bot protection', 'Your site refused our automated checker (HTTP 403/429). Check that your firewall or bot protection lets verified AI and search crawlers through (by user-agent plus their published IP ranges).', 'If AI crawlers get the same refusal, assistants cannot read or cite your pages.');

    // 1. AI crawler access (35 points)
    const c = results.crawler?.ok ? results.crawler.items.find((i) => i.status === 'ok') ?? results.crawler.items[0] : null;
    let crawlerPts = null;
    if (c && c.verdict) {
        const map = { open: 35, 'some-pages-restricted': 22, 'possible-firewall-block': 18, noindex: 8, 'ai-search-partly-blocked': 15, 'ai-search-blocked': 0, 'robots-unreadable': 5 };
        crawlerPts = map[c.verdict] ?? 20;
        sections.crawlerAccess = { verdict: c.verdict, headline: c.headline, aiSearch: c.aiSearchAccess, assistantFetch: c.userFetchAccess, training: c.trainingAccess, searchEngines: c.searchEngineAccess, cdn: c.cdn ?? null };
        if (c.verdict === 'open') good.push('AI search crawlers (ChatGPT, Claude, Perplexity, Apple, Google) are allowed to read the site.');
        for (const s of c.suggestedActions ?? []) if (['high', 'medium'].includes(s.priority)) add(s.priority, 'AI crawler access', s.action, 'If AI crawlers cannot fetch your pages, assistants cannot quote or recommend them.');
    } else if (c) { sections.crawlerAccess = { error: c.error ?? 'Could not audit this site.' }; }

    // 2. Schema / meta / llms.txt (30 points, scaled from the validator's 0-100 score, averaged over pages)
    const sp = results.schema?.ok ? results.schema.items.filter((i) => i.status === 'ok' && i.readiness) : [];
    let schemaPts = null;
    if (sp.length) {
        const avg = sp.reduce((s, i) => s + i.readiness.score, 0) / sp.length;
        schemaPts = Math.round(avg * 0.30);
        const h = sp[0];
        sections.schemaReadiness = { averageScore: Math.round(avg), pages: sp.map((i) => ({ url: i.url, score: i.readiness.score, band: i.readiness.band, jsonLdTypes: i.jsonLd?.types ?? [] })), llmsTxt: h.llmsTxt?.present ?? null };
        const codes = new Set(sp.flatMap((i) => i.readiness.findings.map((f) => f.code)));
        if (codes.has('meta_noindex')) add('high', 'Indexing', 'Remove "noindex" from pages you want found.', 'noindex tells search engines and AI search to leave the page out.');
        if (codes.has('no_jsonld')) add('high', 'Structured data', 'Add schema.org JSON-LD (Organization and WebSite on the homepage; Product, Service, Article or FAQPage where they fit).', 'Structured data tells AI systems plainly who you are and what you offer.');
        if (codes.has('jsonld_parse_error')) add('high', 'Structured data', 'Fix the JSON-LD blocks that fail to parse.', 'Broken JSON-LD is ignored.');
        if (codes.has('missing_title') || codes.has('missing_description')) add('medium', 'Page basics', 'Give every checked page a unique <title> and meta description.', 'These are the first lines AI and search tools read and quote.');
        if (codes.has('jsonld_missing_field') || codes.has('jsonld_product_no_offers')) add('medium', 'Structured data', 'Complete the missing JSON-LD fields reported by the schema check.', 'Incomplete markup is often skipped.');
        if (codes.has('no_llms_txt')) add('low', 'llms.txt', 'Publish /llms.txt: a short plain-text summary of the site with links to key pages.', 'Optional, emerging convention some AI tools read; cheap to add.');
        if (codes.has('missing_canonical')) add('low', 'Page basics', 'Add a rel=canonical link to each page.', 'Avoids duplicate versions splitting attention.');
        if (codes.has('thin_open_graph')) add('low', 'Sharing previews', 'Complete Open Graph title/description/image/url.', 'Better previews when links are shared in chats and assistants.');
        if (!codes.has('no_jsonld')) good.push(`Structured data found (${[...new Set(sp.flatMap((i) => i.jsonLd?.types ?? []))].slice(0, 5).join(', ') || 'JSON-LD'}).`);
        if (h.meta?.title && h.meta?.description) good.push('Homepage has a title and meta description.');
    }

    // 3. Speed (15 points)
    let speedPts = null;
    const ps = results.pageSpeed?.ok ? results.pageSpeed.items.find((i) => i.status === 'ok') : null;
    if (ps) {
        const perf = ps.scores?.performance ?? null;
        if (perf !== null) {
            speedPts = Math.round(perf * 0.15);
            sections.pageSpeed = { mobilePerformance: perf, metrics: ps.metrics, topOpportunities: (ps.topOpportunities ?? []).slice(0, 3).map((o) => o.title), source: results.pageSpeed.keyless ? 'Google PageSpeed (keyless)' : 'Google PageSpeed' };
            if (perf < 50) add('high', 'Speed', `Mobile speed is ${perf}/100. Start with: ${(ps.topOpportunities ?? []).slice(0, 2).map((o) => o.title).join('; ') || 'image and script size'}.`, 'Slow pages are crawled less and lose visitors who click through from AI answers.');
            else if (perf < 80) add('medium', 'Speed', `Mobile speed is ${perf}/100; worth improving${ps.topOpportunities?.length ? ` (${ps.topOpportunities[0].title})` : ''}.`, 'Faster pages are easier to crawl and convert better.');
            else good.push(`Fast on mobile (${perf}/100).`);
        }
    }

    // 4. Accessibility (10 points)
    let a11yPts = null;
    const ap = results.accessibility?.ok ? results.accessibility.items.filter((i) => i.status === 'ok' && i.accessibility) : [];
    if (ap.length) {
        const crit = ap.reduce((s, i) => s + (i.accessibility.byImpact?.critical ?? 0) + (i.accessibility.byImpact?.serious ?? 0), 0);
        const avg = ap.reduce((s, i) => s + (i.accessibility.score ?? 0), 0) / ap.length;
        a11yPts = Math.round(avg * 0.10);
        const top = [...new Map(ap.flatMap((i) => i.accessibility.violations ?? []).map((v) => [v.id, v])).values()].slice(0, 3);
        sections.accessibility = { averageScore: Math.round(avg), criticalOrSerious: crit, topIssues: top.map((v) => v.description) };
        if (crit > 0) add('medium', 'Accessibility', `Fix ${crit} critical/serious accessibility issue(s), starting with: ${top.map((v) => v.id).join(', ')}.`, 'Accessible HTML (labels, alt text, headings) is also easier for machines to read.');
        else good.push('No critical or serious accessibility problems in the static HTML.');
    }

    // Tech stack (context only)
    const ts = results.techStack?.ok ? results.techStack.items.find((i) => i.status === 'ok') : null;
    if (ts) sections.techStack = { technologies: (ts.stack?.technologies ?? []).map((t) => t.name ?? t).slice(0, 12), server: ts.serverHeader ?? null };

    // Real AI answers (reported, not scored)
    const aiRows = results.aiAnswers?.ok ? results.aiAnswers.items.filter((r) => r.status === 'ok' && r.provider) : [];
    if (aiRows.length) {
        const by = {};
        for (const r of aiRows) { (by[r.provider] ??= { answers: 0, named: 0, cited: 0 }); by[r.provider].answers++; if (r.brandMentioned) by[r.provider].named++; if (r.brandDomainCited) by[r.provider].cited++; }
        const named = aiRows.filter((r) => r.brandMentioned).length;
        sections.aiAnswers = { answers: aiRows.length, namedShare: named / aiRows.length, perProvider: by, sample: aiRows.slice(0, 2).map((r) => ({ provider: r.provider, prompt: r.prompt, brandMentioned: r.brandMentioned, snippet: r.snippet ?? null })) };
        if (named === 0) add('high', 'AI answers', 'AI assistants did not name you for these questions. Publish clear pages that answer them directly (comparison, pricing, "best X for Y"), and get listed on sites those answers cite.', 'Being readable is step one; being named needs content and third-party mentions.');
    } else if (aiCheckNote) skipped.push(aiCheckNote);

    // Score over measured parts only
    const parts = [[crawlerPts, 35], [schemaPts, 30], [speedPts, 15], [a11yPts, 10]].filter(([p]) => p !== null);
    const max = parts.reduce((s, [, m]) => s + m, 0);
    const score = max ? Math.round((parts.reduce((s, [p]) => s + p, 0) / max) * 100) : null;
    const band = score === null ? 'unknown' : score >= 80 ? 'strong' : score >= 60 ? 'fair' : score >= 40 ? 'weak' : 'poor';
    const order = { high: 0, medium: 1, low: 2 };
    fixes.sort((a, b) => order[a.priority] - order[b.priority]);
    const dedup = [...new Map(fixes.map((f) => [f.fix, f])).values()].slice(0, 10);

    const lines = [];
    lines.push(`AI visibility report for ${home}`);
    lines.push(score === null ? 'Score: not available (the checks did not complete).' : `AI-readiness score: ${score}/100 (${band}), based on ${parts.length} of 4 checks.`);
    if (sections.crawlerAccess?.headline) lines.push(`Crawler access: ${sections.crawlerAccess.headline}`);
    if (sections.schemaReadiness) lines.push(`Structured data and page basics: ${sections.schemaReadiness.averageScore}/100 across ${sections.schemaReadiness.pages.length} page(s).`);
    if (sections.pageSpeed) lines.push(`Mobile speed: ${sections.pageSpeed.mobilePerformance}/100.`);
    if (sections.accessibility) lines.push(`Accessibility: ${sections.accessibility.averageScore}/100, ${sections.accessibility.criticalOrSerious} critical/serious issue(s).`);
    if (sections.aiAnswers) lines.push(`Real AI answers: named in ${pct(sections.aiAnswers.namedShare)} of ${sections.aiAnswers.answers} answer(s).`);
    if (good.length) lines.push('', 'What is working:', ...good.map((g) => `- ${g}`));
    lines.push('', dedup.length ? 'Fix next (most important first):' : 'No fixes needed from these checks.', ...dedup.map((f, i) => `${i + 1}. [${f.priority}] ${f.fix} Why: ${f.why}`));
    if (skipped.length) lines.push('', 'Not included this time:', ...skipped.map((s) => `- ${s}`));
    lines.push('', 'Note: this measures whether AI systems can reach and understand the site. It does not guarantee rankings or AI citations.');

    return { site: home, pagesChecked: pages, score, band, summary: lines.join('\n'), fixes: dedup, working: good, sections, notIncluded: skipped, runIds, coreOk: crawlerPts !== null || schemaPts !== null };
}
