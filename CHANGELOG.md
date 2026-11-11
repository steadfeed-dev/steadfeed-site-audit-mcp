# Changelog

## 0.2.2
- Security: override `basic-ftp` to 6.2.6 and `minimatch` to 11.0.7 to clear npm audit findings in production transitive dependencies. Tool names, pricing and behavior are unchanged.
- The remaining `zod` audit finding is not patched here: the only published fix is Zod 4.6.6+, a breaking major upgrade. This package stays on Zod 3; the advisory describes a Zod 4 parser path (`$ZodArray`), and our tool schemas already cap array lengths.

## 0.2.1
- Hosted (Standby) endpoint: caller identity now comes from the single-tenant run token (Apify removes the Authorization header before forwarding), so tool calls work on the hosted URL.
- Result now includes the underlying run id (runs are started via the runs API instead of run-sync).

## 0.2.0
- Adds 7th tool `monitor_pay_transparency` (potential issues for human review, sources kept).
- Brand-neutral public wording.

