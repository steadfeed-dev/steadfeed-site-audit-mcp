// Tool catalogue: each MCP tool maps to one public Actor on Apify.
import { z } from 'zod';

export const ACTOR_OWNER = 'steadfeed';

const urls = (max, what = 'pages') => z.array(z.string().url()).min(1).max(max).describe(`Public http(s) URLs of the ${what} to check (1-${max}).`);
const maxCost = z.number().min(0.05).max(5).optional().describe('Optional hard cap in USD for this call. The underlying Actor stops when the cap is reached. Minimum 0.05 (the Apify per-run minimum). Default: a small amount computed from the number of URLs, never below 0.05.');
const dryRun = z.boolean().optional().describe('Preview with built-in sample data; no website is contacted and the cost is minimal.');

/** Unit prices (USD) of the underlying Actors, used only to size the default spend cap. */
export const TOOLS = [
    {
        name: 'audit_schema_ai_readiness',
        actor: 'schema-ai-readiness-validator',
        unitPriceUsd: 0.003,
        title: 'Schema and AI-readiness audit',
        description: 'Check public pages for JSON-LD structured data, Open Graph, canonical/SEO signals, llms.txt and AI-crawler robots.txt cues. Returns a plain-English readiness score per page. Informational only; not a ranking or citation guarantee.',
        shape: { urls: urls(50), checkLlmsTxt: z.boolean().optional().describe('Also fetch /llms.txt once per site (default true).'), checkRobots: z.boolean().optional().describe('Also read robots.txt once per site (default true).'), maxCostUsd: maxCost, dryRun },
        buildInput: (a) => ({ urls: a.urls, ...(a.checkLlmsTxt !== undefined && { checkLlmsTxt: a.checkLlmsTxt }), ...(a.checkRobots !== undefined && { checkRobots: a.checkRobots }), ...(a.dryRun && { dryRun: true }) }),
        unitsOf: (a) => a.urls.length,
    },
    {
        name: 'audit_accessibility',
        actor: 'accessibility-wcag-checker',
        unitPriceUsd: 0.005,
        title: 'Accessibility (WCAG) check',
        description: 'Run axe-core accessibility checks (WCAG 2.x A/AA by default) on public pages and list violations by impact. Static HTML only (no login, no JavaScript rendering). Useful for EAA readiness reviews; not a legal compliance certificate.',
        shape: { urls: urls(40), includeBestPractice: z.boolean().optional().describe('Also run axe best-practice rules (default false).'), maxViolationsListed: z.number().int().min(5).max(100).optional().describe('Cap on violations listed per page (default 25).'), maxCostUsd: maxCost, dryRun },
        buildInput: (a) => ({ urls: a.urls, ...(a.includeBestPractice !== undefined && { includeBestPractice: a.includeBestPractice }), ...(a.maxViolationsListed && { maxViolationsListed: a.maxViolationsListed }), ...(a.dryRun && { dryRun: true }) }),
        unitsOf: (a) => a.urls.length,
    },
    {
        name: 'detect_tech_stack',
        actor: 'website-tech-stack-detector',
        unitPriceUsd: 0.002,
        title: 'Website tech-stack detector',
        description: 'Detect CMS, JavaScript frameworks, analytics, marketing tags and CDNs from public HTML and response headers, using curated fingerprints.',
        shape: { urls: urls(50, 'homepages or pages'), maxCostUsd: maxCost, dryRun },
        buildInput: (a) => ({ urls: a.urls, ...(a.dryRun && { dryRun: true }) }),
        unitsOf: (a) => a.urls.length,
    },
    {
        name: 'audit_pagespeed',
        actor: 'bulk-pagespeed-audit',
        unitPriceUsd: 0.004,
        title: 'Bulk PageSpeed / Lighthouse audit',
        description: 'Run Google PageSpeed Insights (Lighthouse) on a list of URLs, a sitemap, or a same-domain crawl, on mobile and/or desktop, with aggregated scores. Requires your own free Google PageSpeed Insights API key (googleApiKey, or the GOOGLE_PSI_API_KEY environment variable when running locally). Each URL x device is one billed audit.',
        shape: {
            urls: z.array(z.string().url()).max(50).optional().describe('Pages to audit.'),
            sitemapUrls: z.array(z.string().url()).max(5).optional().describe('Sitemap URLs to discover pages from.'),
            crawlStartUrls: z.array(z.string().url()).max(5).optional().describe('Start pages for a same-domain crawl.'),
            maxCrawlPages: z.number().int().min(1).max(100).optional().describe('Max pages from the crawl (default 20).'),
            strategy: z.array(z.enum(['mobile', 'desktop'])).optional().describe('Devices to test (default mobile).'),
            googleApiKey: z.string().min(20).optional().describe('Your Google PageSpeed Insights API key (free).'),
            maxAudits: z.number().int().min(1).max(500).optional().describe('Safety cap on audits (default 20 here).'),
            maxCostUsd: maxCost,
            dryRun,
        },
        buildInput: (a, env) => {
            const key = a.googleApiKey || env.GOOGLE_PSI_API_KEY;
            return {
                ...(a.urls && { urls: a.urls }), ...(a.sitemapUrls && { sitemapUrls: a.sitemapUrls }), ...(a.crawlStartUrls && { crawlStartUrls: a.crawlStartUrls }),
                ...(a.maxCrawlPages && { maxCrawlPages: a.maxCrawlPages }), strategy: a.strategy ?? ['mobile'], maxAudits: a.maxAudits ?? 20,
                ...(key && { googleApiKey: key }), ...(a.dryRun && { dryRun: true }),
            };
        },
        validate: (a, env) => {
            if (!a.urls?.length && !a.sitemapUrls?.length && !a.crawlStartUrls?.length) return 'Provide urls, sitemapUrls or crawlStartUrls.';
            if (!a.dryRun && !a.googleApiKey && !env.GOOGLE_PSI_API_KEY) return 'googleApiKey is required (free key from Google Cloud with the PageSpeed Insights API enabled), or set dryRun to preview.';
            return null;
        },
        unitsOf: (a) => Math.min(a.maxAudits ?? 20, ((a.urls?.length ?? 0) + (a.sitemapUrls?.length ? 20 : 0) + (a.crawlStartUrls?.length ? (a.maxCrawlPages ?? 20) : 0)) * (a.strategy?.length ?? 1)),
    },
    {
        name: 'audit_ai_crawler_access',
        actor: 'ai-crawler-access-auditor',
        unitPriceUsd: 0.005,
        title: 'AI crawler access audit',
        description: 'Check whether ChatGPT, Perplexity, Claude, Apple and Google AI crawlers can reach a website: robots.txt (RFC 9309), noindex tags and optional simulated live requests. Returns per-crawler allow/block results and fixes.',
        shape: { urls: urls(25, 'websites'), extraPaths: z.array(z.string()).max(4).optional().describe('Up to 4 extra paths per site, e.g. /pricing.'), liveChecks: z.boolean().optional().describe('Send one polite request per crawler user-agent to the homepage and compare with a normal browser (default true).'), maxCostUsd: maxCost, dryRun: z.boolean().optional().describe('Not supported by this Actor; ignored.') },
        buildInput: (a) => ({ urls: a.urls, ...(a.extraPaths && { extraPaths: a.extraPaths }), ...(a.liveChecks !== undefined && { liveChecks: a.liveChecks }), aiSummary: false, saveReports: false }),
        unitsOf: (a) => a.urls.length,
    },
    {
        name: 'monitor_page_changes',
        actor: 'page-change-monitor',
        unitPriceUsd: 0.002,
        title: 'Page change monitor',
        description: 'Check public pages against their previous snapshot and report new/unchanged/changed with a plain-words summary of what changed (price, date and number changes, added/removed sections) and routine noise (timestamps, ads) filtered out. The first call for a watchlist stores the baseline; later calls report changes. Use the same watchlistId each time.',
        shape: { pages: z.array(z.object({ url: z.string().url(), selector: z.string().max(300).optional(), label: z.string().max(100).optional() })).min(1).max(50).describe('Pages to watch; optional CSS selector limits the watched region.'), watchlistId: z.string().regex(/^[a-zA-Z0-9_.-]{1,60}$/).optional().describe('Name of the watchlist (default "mcp"). Keep it the same between calls.'), skipNoiseOnlyChanges: z.boolean().optional().describe('Report noise-only changes (timestamps, ads) as unchanged.'), maxCostUsd: maxCost, dryRun: z.boolean().optional().describe('Not supported by this Actor; ignored.') },
        buildInput: (a) => ({ pages: a.pages, watchlistId: a.watchlistId ?? 'mcp', emitUnchanged: true, ...(a.skipNoiseOnlyChanges !== undefined && { skipNoiseOnlyChanges: a.skipNoiseOnlyChanges }) }),
        unitsOf: (a) => a.pages.length,
    },
    {
        // GATED: ship only after the Actor steadfeed/pay-transparency-compliance-monitor is PUBLIC (see PUBLISH-GATE.md).
        name: 'monitor_pay_transparency',
        actor: 'pay-transparency-compliance-monitor',
        unitPriceUsd: 0.02, // worst case per posting (initial or changed check); an unchanged recheck of the same watchlist costs $0.005. The default cap uses the worst case.
        recheckPriceUsd: 0.005,
        title: 'Pay-transparency posting monitor',
        description: 'Screen the public job postings on Greenhouse, Lever or Ashby careers boards for POTENTIAL pay-transparency issues (missing, open-ended or unparseable pay ranges, missing benefits or close-date wording where a law asks for it) under US state and city laws, with Canadian and EU notes. Every flagged item is a potential issue that needs human review, not a finding of violation, and this is not legal advice. Re-run with the same watchlistId to get changes since the last run. Pay per event: $0.02 per initial or changed posting check, $0.005 per verified unchanged recheck (maxJobsPerCompany bounds the cost).',
        shape: { boardUrls: z.array(z.string().url()).min(1).max(20).describe('Public Greenhouse, Lever or Ashby board URLs, for example https://job-boards.greenhouse.io/acme (1-20).'), watchlistId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/).optional().describe('Name of the watchlist (default "mcp"). Keep it the same between calls to get changes.'), maxJobsPerCompany: z.number().int().min(1).max(200).optional().describe('Cap on postings audited per board (default 25). Each posting is billed: $0.02 first check or changed, $0.005 unchanged recheck.'), hiringStates: z.array(z.string().min(2).max(3)).max(30).optional().describe('US state codes you hire in (for example CA, NY, WA, CO, or NYC) to screen remote roles against; default all in-force state laws.'), employeeCount: z.number().int().min(1).optional().describe('Employer size, to skip laws with higher thresholds.'), maxCostUsd: maxCost, dryRun: z.boolean().optional().describe('Not supported by this Actor; ignored.') },
        buildInput: (a) => ({ boardUrls: a.boardUrls, watchlistId: a.watchlistId ?? 'mcp', maxJobsPerCompany: a.maxJobsPerCompany ?? 25, ...(a.hiringStates && { hiringStates: a.hiringStates }), ...(a.employeeCount && { employeeCount: a.employeeCount }) }),
        unitsOf: (a) => a.boardUrls.length * (a.maxJobsPerCompany ?? 25),
    },
];

export const START_FEE_USD = 0.00005;
export const DEFAULT_CAP_PADDING_USD = 0.01;
/** Apify rejects runs whose maxTotalChargeUsd is below $0.05 for some Actors. */
export const MIN_CAP_USD = 0.05;

export function defaultCapUsd(tool, args) {
    const units = Math.max(1, tool.unitsOf(args));
    const est = Math.round((units * tool.unitPriceUsd + START_FEE_USD * 2 + DEFAULT_CAP_PADDING_USD) * 10000) / 10000;
    return Math.max(MIN_CAP_USD, est);
}
