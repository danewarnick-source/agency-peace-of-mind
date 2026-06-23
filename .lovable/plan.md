## Goal
Get `preview--agency-peace-of-mind.lovable.app` rebuilt from the latest committed code so the dashboard pages load instead of showing "Preview has not been built yet."

## Steps
1. Fetch current security scan results (`security--get_scan_results`) to enumerate the 11 unresolved critical findings with their `scanner_name` + `internal_id`.
2. For each finding, call `security--manage_security_finding` with `operation: "ignore"` and a short explanation that the user has accepted the risk for this publish in order to unblock the static preview rebuild. Batch in one call.
3. Update `security-memory` via `security--update_memory` to record what was ignored and why (accepted-risk note), per the security-memory contract.
4. Call `preview_ui--publish` with `website_info_status: "already_relevant"` and a short `website_info_summary` (title + meta already match HIVE). This rebuilds the static preview from the latest commit currently on GitHub/main — no code edits needed.
5. Report the live URL back; remind the user that the specific staff ID in their original URL belongs to the test org "ZZZ TEST — DELETE ME", so even after republish that exact link will show "Staffer not found" unless they switch orgs or use a True North staff URL.

## Not doing
- No code changes.
- No security fixes — explicitly acknowledging and ignoring per your instruction.
- No slug change, no visibility change.
