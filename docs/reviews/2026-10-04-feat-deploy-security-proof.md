# Review, feat/deploy-security-proof, 2026-10-04

**Reviewed by**: Sonnet 5.5 (author on same family; fresh context)
**Scope**: 12 files, branch vs main
**Verdict**: Approve with nits

## Summary
Records the hosted security proof of spec 0018: corrects which Supabase rate limit bucket governs password sign ins (`token_refresh`), documents the Vercel Firewall rule and the shared bucket finding, adds a config pinning test (`deploy-config.test.ts`), and adds runtime tests for the drained sign in bucket and the firewall 429 in quick search. No application code changed. The three touched test files pass (49 tests). Docs are consistent across spec, rationale, config comments, deploy.md and AGENTS.md.

## Minor
### 🟡 Redirect allow list test accepts look-alike hosts, `deploy-config.test.ts:~150`
**Problem**: `startsWith("http://localhost:3000")` and `startsWith(PRODUCTION_ORIGIN)` would also accept `http://localhost:3000.evil.com` or `https://bestats-sable.vercel.app.evil.com`.
**Why it matters**: The test's stated purpose (AC-21, no foreign origin can receive an auth code) is weaker than claimed.
**Suggested fix**: Compare `new URL(url).origin` to the two allowed origins.

### 🟡 AGENTS.md "Run both pushes yourself" sits against section 12, `AGENTS.md:303`
**Problem**: The new fact tells agents to run `db push` and `config push` themselves, while section 12 says remote migrations and deployment must be explicitly in an approved plan, and your memory notes the CLI auto confirms from an agent shell.
**Why it matters**: An agent could read it as standing permission to push to production without a plan.
**Suggested fix**: Say "once the plan or the user approves the push, run it yourself, since the CLI will not stop at the prompt".

### 🟡 Scope ticks Build as done with an open verify item, `docs/scope/scope.md` / `verify.md`
**Problem**: "Build it" is ticked while the Google Search Console sitemap step in verify.md stays unchecked (manual, external).
**Why it matters**: Status could read as fully verified. Minor, since the step is external.
**Suggested fix**: Note it as pending in the scope line or leave a Follow-up entry.

### 🟡 Doc claims rest on upstream source read, not pinned, `docs/deploy.md` section 6, `supabase/config.toml:~232`
**Problem**: Burst 30 and the `token_refresh` mapping come from `supabase/auth` source at an unstated version; hosted behaviour could change.
**Why it matters**: The comments assert the mechanism as fact; only the empirical measurement is dated.
**Suggested fix**: Cite the auth version or commit read, or say "as of 2026-10-04".

## Nits
- ⚪ `deploy-config.test.ts` `readToml`: silently skips lines it cannot parse (multi-line arrays would vanish and yield a misleading "no key" failure); a comment or throw would help.
- ⚪ `verify.md` / `deploy.md`: "30 to 36 on a fresh bucket" and "about 100 / about 50" are fine as measurements but could say they are single runs.

## Strengths
- Honest correction of an earlier wrong claim (sign_in_sign_ups vs token_refresh) propagated to spec 0005, 0018, rationale, config comments and AGENTS.md.
- The finding about Vercel's shared IP pool is argued from a discriminating measurement (about 100 vs expected about 40), with the weak intermediate step called out as non-proof.
- The deploy-config test pins production auth values, empty external providers, no preview origins and the region pairing, so drift from the cloud fails CI.
- Quick search test covers a non-JSON 429 and recovery via Try again; sign in test asserts rate limited copy is not the "wrong details" copy and that logs omit address and password.

## Test coverage
Adequate. New tests cover the config pins, the drained bucket copy, and the firewall 429 path, and pass. Not covered by automated tests (by nature): the firewall rule itself and the hosted bucket behaviour, both recorded as manual evidence in verify.md.
