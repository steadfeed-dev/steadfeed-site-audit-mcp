# Changelog

## Unreleased
- Hosted endpoint serves a public GET at `/mcp/.well-known/glama.json` and `/.well-known/glama.json` so Glama can verify connector ownership. Tools, pricing and input schema are unchanged.


## 0.3.0 (2026-11-15)
- New `ai_visibility_report`: one call runs AI-crawler access, schema/llms.txt, mobile PageSpeed, accessibility and tech-stack checks in parallel and returns a plain-English summary with a 0-100 readiness score and prioritized fixes. Not charged when the core checks fail.
- New `check_ai_search_visibility`: wraps the AI Search Visibility Tracker (caller's own OpenAI/Perplexity key; refuses without a key unless dryRun).
- Tool profiles (`MCP_TOOL_PROFILE`): `all` (Site Audit MCP) and `ai-visibility` (the focused AI Visibility connector), one codebase.
- Reports with fewer than 2 of the 4 core checks are labeled "limited result" and not charged.
- Read-only audit tools are now annotated `readOnlyHint: true` (helps ChatGPT accounts limited to read/fetch tools).


## 0.2.2
- Security: override `basic-ftp` to 6.2.6 and `minimatch` to 11.0.7 to clear npm audit findings in production transitive dependencies. Tool names, pricing and behavior are unchanged.
- The remaining `zod` audit finding is not patched here: the only published fix is Zod 4.6.6+, a breaking major upgrade. This package stays on Zod 3; the advisory describes a Zod 4 parser path (`$ZodArray`), and our tool schemas already cap array lengths.

## 0.2.1
- Hosted (Standby) endpoint: caller identity now comes from the single-tenant run token (Apify removes the Authorization header before forwarding), so tool calls work on the hosted URL.
- Result now includes the underlying run id (runs are started via the runs API instead of run-sync).

## 0.2.0
- Adds 7th tool `monitor_pay_transparency` (potential issues for human review, sources kept).
- Brand-neutral public wording.

