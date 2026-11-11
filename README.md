# Site Audit MCP Server

Give your AI agent (Claude, Cursor, VS Code, ChatGPT-style MCP clients, n8n, custom agents) a set of **website-audit tools**. Each tool runs one of public Apify Actors **on your own Apify account**, so you see every run and every cost in your Apify console.

| Tool | What it does | Underlying Actor | Price of that Actor |
|---|---|---|---|
| `audit_schema_ai_readiness` | JSON-LD, Open Graph, canonical, llms.txt, AI-crawler robots cues | [Schema & AI-Readiness Validator](https://apify.com/steadfeed/schema-ai-readiness-validator) | $0.003 / page |
| `audit_accessibility` | axe-core WCAG 2.x checks (static HTML) | [Accessibility WCAG / EAA Checker](https://apify.com/steadfeed/accessibility-wcag-checker) | $0.005 / page |
| `detect_tech_stack` | CMS, frameworks, analytics, tags, CDN | [Website Tech-Stack Detector](https://apify.com/steadfeed/website-tech-stack-detector) | $0.002 / domain |
| `audit_pagespeed` | Lighthouse via Google PageSpeed Insights, URLs / sitemap / crawl, mobile + desktop. Needs your free Google API key | [Bulk PageSpeed Audit](https://apify.com/steadfeed/bulk-pagespeed-audit) | $0.004 / audit |
| `audit_ai_crawler_access` | Can ChatGPT, Perplexity, Claude, Apple, Google AI crawlers reach the site? | [AI Crawler Access Auditor](https://apify.com/steadfeed/ai-crawler-access-auditor) | $0.005 / site |
| `monitor_page_changes` | New / unchanged / changed with a plain-words summary and noise filtering | [Page Change Monitor](https://apify.com/steadfeed/page-change-monitor) | $0.002 / page |
| `monitor_pay_transparency` | Check job postings for pay-range disclosure issues (potential issues for human review, sources kept) | [Pay Transparency Compliance Monitor](https://apify.com/steadfeed/pay-transparency-compliance-monitor) | $0.02 / posting check |

Only **public pages** are checked. Nothing logs in, bypasses paywalls or bot protection. Results are informational: they are not a legal compliance certificate, a ranking prediction or a guarantee of AI-search citations.

## Cost

* The underlying Actor's normal pay-per-event price (table above), billed to **your** Apify account.
* Plus this server's own fee on the hosted version: **$0.001 per successful tool call** (and a $0.00005 start event). Running the open-source package locally (below) has no wrapper fee.
* Every call has a **hard spend cap** (`maxTotalChargeUsd`) sized from the number of URLs (minimum $0.05, Apify's per-run minimum, so a one-page check can never cost more than $0.05). Override it with `maxCostUsd` ($0.05 to $5).
* Add `dryRun: true` to preview with sample data at near-zero cost (not available for the AI-crawler and page-change tools).

## Connect (hosted, no install)

Use the Actor's Standby URL (shown in the **Server / API** tab, `https://steadfeed--steadfeed-site-audit-mcp.apify.actor/mcp`) with your Apify API token ([create one](https://console.apify.com/settings/integrations)):

```json
{
  "mcpServers": {
    "steadfeed-site-audit": {
      "url": "https://steadfeed--steadfeed-site-audit-mcp.apify.actor/mcp",
      "headers": { "Authorization": "Bearer <YOUR_APIFY_API_TOKEN>" }
    }
  }
}
```

## Run locally (open source, MIT; runs straight from GitHub, no npm package)

```json
{
  "mcpServers": {
    "steadfeed-site-audit": {
      "command": "npx",
      "args": ["-y", "github:steadfeed-dev/steadfeed-site-audit-mcp"],
      "env": { "APIFY_TOKEN": "<YOUR_APIFY_API_TOKEN>", "GOOGLE_PSI_API_KEY": "<optional, for audit_pagespeed>" }
    }
  }
}
```

Or clone and run it yourself: `git clone https://github.com/steadfeed-dev/steadfeed-site-audit-mcp && cd steadfeed-site-audit-mcp && npm install`, then point your MCP client at `node /path/to/steadfeed-site-audit-mcp/src/stdio.js` with `APIFY_TOKEN` in the environment.

## Example prompts

* "Audit https://example.com and https://example.com/pricing for structured data and AI readiness, then tell me the three highest-impact fixes."
* "Can AI crawlers read our site? Check example.com."
* "Run an accessibility check on our checkout and landing pages and group the issues by severity."
* "Watch these 5 competitor pricing pages and tell me what meaningfully changed since last time" (call `monitor_page_changes` again with the same `watchlistId`).

## Notes and limits

* Stateless Streamable HTTP; the hosted endpoint is `POST /mcp`.
* Each call waits for the audit run and times out after 240 s; split very large lists. A very large result is truncated with a note.
* The server never stores or logs your token or Google key. Locally, your `APIFY_TOKEN` is used only to start the run you asked for. On the hosted version, the Actor runs in your own Apify account (single-tenant) and uses that run's own credentials, so you see the server run and the audit runs in your Runs tab; the server run idles for up to 5 minutes after the last request, which uses a small amount of platform compute on your account.
* Not affiliated with Apify, Google or any AI vendor. 
