# Changelog

## 0.2.1
- Hosted (Standby) endpoint: caller identity now comes from the single-tenant run token (Apify removes the Authorization header before forwarding), so tool calls work on the hosted URL.
- Result now includes the underlying run id (runs are started via the runs API instead of run-sync).

## 0.2.0
- Adds 7th tool `monitor_pay_transparency` (potential issues for human review, sources kept).
- Brand-neutral public wording.

