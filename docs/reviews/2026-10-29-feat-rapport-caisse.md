# Review, feat/rapport-caisse, 2026-10-29

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 43 files, branch vs main (merge base aaab23d)
**Verdict**: Approve with nits

## Summary
The branch adds the cash report (7 query snapshot, late receptions), a contract row lock with an idempotency re-check on versements, avances and retraits, and strict field-date rules (spec 0003) with per-movement conflicts in sync push. I found no blocker and no major. The cash arithmetic is pure, consistent between detail and summary, and tested at unit and integration level. What remains are minors: sub-day edge cases around midnight, a rejected-date movement leaving cash unrecorded server side, and a few untested paths.

## Earlier majors
- Idempotency lookup before lock: fixed correctly and completely. The outer `findUnique` stays as a cheap path; a second `findUnique` runs right after `verrouillerContrat` in all three services (`collecte.service.ts:43-49`, `avances.service.ts:42-50`, `retraits.service.ts:51-59`), before the business rules. The P2002 fallback is kept.
- Avances unlocked: fixed correctly and completely. Avances and retraits now both lock the contract row first; all three writers of contract aggregates (the only `$transaction` users besides caisse) take the lock.
- Unbounded, null or offsetless field dates: fixed correctly. `lireDateTerrain` requires an explicit offset, checks each part (leap years, `-00:00`, 24:00, years 0-99 handled via `setUTCFullYear`), `null` is refused, bounds are re-checked after the lock using the clock read after the wait. The bounds are skipped for a replay, which is right.
- Late syncs invisible on reception day: fixed correctly. `receptionsTardives` (createdAt in D, date terrain before D) is additive, does not alter D totals, is consistent between detail and summary (same function, flat total equals sum of accounts), and the summary membership OR covers an account with only a late reception.

## Minor
### 🟡 Movement dated slightly ahead and received before midnight is shown nowhere as such, `src/modules/caisse/caisse.service.ts:60-70`
**Problem**: the 15 min future tolerance lets a phone with a fast clock date a 23:50 collection as D+1 00:05. It is absent from D (not in `[debut, fin[`), not a late reception (AC-13 states this on purpose), and not flagged in D+1 (`recuServeurA < fin`, so `arriveeTardive` false).
**Why it matters**: the agent hands over the cash on D and the D report is short by that amount, with no hint in either report. Rare, but the pilot criterion is zero discrepancy.
**Suggested fix**: add an "anticipated receptions" counter (dateTerrain >= fin of the reception day) or flag it on the D+1 line; or at least document it in the verify notes.

### 🟡 A date-rejected movement is not stored server side, `src/modules/sync/sync.service.ts:107-122`
**Problem**: a movement whose date is refused (phone clock wrong, offline more than 30 days) becomes a conflict and is dropped. The cash was really collected. A later `TOTAL` retrait in the same batch is computed without it.
**Why it matters**: the money exists in the agent's pocket but in no report until the client resubmits with a corrected date; nothing tells a supervisor.
**Suggested fix**: decide and record how conflicts are surfaced to the supervisor (list or log of date conflicts), or accept the movement with a flag for manual date correction. Confirm the app keeps and re-offers the rejected item.

### 🟡 `createdAt` clock source is assumed, not guaranteed, `prisma/schema.prisma:193`
**Problem**: AC-13 says reception day comes from "the database clock". Prisma `@default(now())` may be set by the query engine (app host clock) while the SQL default `CURRENT_TIMESTAMP` is the transaction start (before a lock wait). Tests use a fake `ClockService` while `createdAt` is real time, so no test exercises a skew.
**Why it matters**: only affects movements near midnight, or a long lock wait that crosses midnight, but it decides late versus not late.
**Suggested fix**: pick one source on purpose (set `createdAt` explicitly from the clock read after the lock, or `clock_timestamp()`), and update AC-13 to match.

### 🟡 Idempotency replay returns another agent's movement, `src/modules/collecte/collecte.service.ts:43-49` (same in avances, retraits)
**Problem**: the lookup is by `idempotencyKey` only, not checked against `agent.id` or `contratId`. A client id that already exists for another agent or contract returns that movement (receipt, amount). Pre-existing behaviour, now repeated in a third place. The lock is also taken on `dto.contratId` before the ownership check, so an AGENT can hold the lock of any contract whose UUID they know (short, DoS only).
**Suggested fix**: on a hit, require the same `agentId` and `contratId` (else 422 or 404); optionally check ownership before locking.

### 🟡 Test gaps
- No test for a replay through `/sync/push` with a valid date older than 30 days (the pre-check only runs for invalid dates; the direct path is tested, AC-8). The code looks right, a regression would be silent.
- No test for the cross-midnight "dated ahead" case above, nor for an exact boundary (+15 min, -30 days) through sync.
- No test for two concurrent reports with a writer in between (the RepeatableRead snapshot is only asserted indirectly by consistency of totals).
- `date-terrain.ts:~95`: offset `+14:59` is accepted (only hours are capped at 14); harmless since the instant is bounds-checked.

## Nits
- ⚪ `src/modules/caisse/caisse.service.ts:222-224`, the sort comparator mixes `localeCompare` and id string compare; fine, but extract it next to `trierLignes`.
- ⚪ `src/modules/caisse/caisse.service.ts:160` and `:236`, the report loads every row of the day in memory; fine for the pilot, note a limit if agents grow.
- ⚪ Spec AC-9 (supervisor reads any account including ADMIN) is explicit and tested (`caisse.int-spec.ts:303-327`), but it reads in tension with the AGENTS.md rule "un SUPERVISEUR ne voit que des comptes AGENT"; consider a line in AGENTS.md saying the rule covers account management only.
- ⚪ `src/modules/sync/AGENTS.md` shows modified but not by this work; no conflict with the code found.

## Strengths
- Pure `domain/caisse.ts` and `domain/date-terrain.ts` with no `new Date()`; detail and summary share the same functions so totals cannot drift.
- Parsing checks pieces rather than re-reading a `Date`, so `+01:00` never shifts the day; Benin day boundaries are exact and tested.
- Sync reads the date per movement and converts a bad one to a conflict instead of failing the batch; replays of existing movements stay idempotent.
- Role scoping is correct: an AGENT gets 404 on another account (same as unknown) and 403 on the summary; late receptions follow the same scope.
- The lock is taken first and the clock is read after the lock wait.

## Test coverage
143 unit and 78 integration tests pass. Covered: pure caisse rules and grouping, date parsing edge cases, direct and sync date bounds, replays without date, late receptions (detail, summary, deleted or deactivated account, agent scope, real sync), lock concurrency for versements, avances and retraits, role scoping. Gaps are listed under Minor.
