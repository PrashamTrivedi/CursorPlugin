---
name: kshetra
description: Job-hunt and client-prospect tracker MCP (Kshetra). Use when ingesting JDs, scoring jobs, updating tracker status, draining JD comments, client evidence/scoring, or LinkedIn ingest auth walls. Never click Submit on applications.
---

# Kshetra

Ops MCP at `https://kshetra.prashamhtrivedi.app/mcp`. Tools are prefixed `job_*`, `client_*`, `linkedin_session_*`.

If the `kshetra` namespace is missing or needs auth, authenticate via `mcp_auth` — do not invent tracker state.

Repo: `/root/Code/kshetra` on the author's machine. Invariants live in that `CLAUDE.md`.

## Hard rules

- **Prasham submits.** Fill forms; never click Submit / Apply / Send as a final action.
- **Tracker-first.** Query the company/JD in kshetra before ingesting, recovering, or declaring "unanswered".
- **Comments are instructions, not questions.** Drain via `job_intents_list` then `job_intents_resolve`. Never draft a reply to a JD comment.
- **Client evidence is verbatim + append-only.** `client_score` after `client_store_evidence`; justifications must cite evidence ids.
- **LinkedIn `li_at` is a credential.** Never echo it. Auth wall + cookie present → sign in to LinkedIn in the normal browser (extension re-pushes).
- Stored JD bodies can be stubs. Re-fetch before claiming a posting lacks a requirement.

## Job tools (high-traffic)

Ingest: `job_ingest_jd`, `job_ingest_batch`, `job_ingest_url`, `job_ingest_browser`, `job_set_url`

Read/score: `job_get`, `job_run_liveness`, `job_check_comp_gate`, `job_score`, `job_set_recommendation`, `job_suggest_recommendation`, `job_referral_check`

Tracker: `job_tracker_list`, `job_tracker_update`

Digest/dashboard: `job_build_digest`, `job_send_digest`, `job_dashboard_refresh`, `job_dashboard_get`, `job_get_mode`, `job_set_mode`

Artifacts: `job_store_artifact`, `job_send_artifact`, `job_inbox_list`

Comments: `job_intents_list`, `job_intents_resolve`

LinkedIn: `linkedin_session_get`, `linkedin_session_set`

## Client tools

`client_ingest_prospect`, `client_get`, `client_get_full`, `client_store_evidence`, `client_score`, `client_tracker_list`, `client_tracker_update`, `client_draft_outreach`, `client_hitl_approve`, `client_hitl_decline`, `client_send_digest`, `client_inbox_list`, `client_run_pipeline`

## Prompts on the server

`triage_job_queue`, `drain_jd_comments`, `linkedin_auth_wall_recovery`, `score_client_prospect`, `outreach_to_gate`
