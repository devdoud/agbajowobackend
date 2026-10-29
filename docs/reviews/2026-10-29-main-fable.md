# Review, main (uncommitted), 2026-10-29 (second opinion)

**Reviewed by**: Fable 5.1 (author on unknown model; first review by Sonnet 5.5 in `2026-10-29-main.md`)
**Scope**: 25 files (code, tests, migration, specs), uncommitted on main
**Verdict**: Changes requested

## Summary
The cash report itself (spec 0002) is sound: one RepeatableRead snapshot, totals from the returned lines, pure UTC arithmetic for the Benin day, correct role scope, correct cash semantics (advance principal and withdrawal net out, commission and interest stay in the till). The contract lock is correctly placed for Read Committed, does not introduce a deadlock path, and the concurrency tests check invariants in the database. What the first review missed sits on the write side the report depends on: the field-date coercion can silently put cash on 1 January 1970 or on the wrong Benin day depending on the server's timezone, and the offline sync case (the normal case for field agents) leaves a supervisor no signal in today's report that a previous day's figures have changed.

## Position on the first review's majors
- **Idempotency lookup before the lock (collecte/retraits)**: confirmed, Major. I traced it: the second same-id request fails on a business rule only when the first one tripped it (last payment sets TERMINE, TOTAL withdrawal closes, PARTIEL exceeds the new recoverable amount), otherwise it reaches P2002 and replays correctly. TOTAL and last payment are exactly the cases a phone retries after a timeout. The proposed fix (re-check `idempotencyKey` after the lock) is correct under the default Read Committed isolation.
- **Advances take no lock**: confirmed, Major. Two simultaneous advances get the same `rang` and can exceed `maxAvances`, and an advance racing a withdrawal makes the withdrawal miss the advance's principal, so the member is overpaid. Spec 0002's Follow-up tracks it, but the gap is real money.
- **Future-dated movement invisible**: confirmed, Major. It is one instance of a wider problem with field dates; see the first Major below, which is separate and not covered by the proposed "now + tolerance" bound alone.

## Major
### 🟠 Field-date coercion puts cash on 1970 or on the wrong Benin day, `src/modules/collecte/dto/encaisser.dto.ts:7` (same in `effectuer-retrait.dto.ts`, `accorder-avance.dto.ts`, `src/modules/sync/dto/push.dto.ts:36,44,52`)
**Problem**: `z.coerce.date().optional()` lets `null` through to `new Date(null)`, so `{"paidAt": null}` is accepted and stored as `1970-01-01T00:00:00Z` (I checked this in Node with the project's zod 3). The same coercion parses an ISO string with no offset (`"2026-10-29T23:30:00"`) in the server process's local timezone. On this dev machine (UTC+1) that gives 22:30Z (Benin day J). In the production container (no `TZ` set, so UTC) it gives 23:30Z, which is 00:30 on J+1 in Benin.
**Why it matters**: Mobile serializers (Dart, Kotlin, Gson) often emit `null` for an unset optional field. That payment is recorded with a receipt but appears in no report anyone will open, so a cash discrepancy has no trace. The offset-less case breaks spec 0002's claim that the report is "identique quel que soit le serveur": the integration tests always pass `Date` objects through the fabriques and so cannot see it, and the same payload lands on different days locally and in production. Both are failures of AC-3 on the write path the report reads.
**Suggested fix**: In the three movement DTOs and in the push DTO, accept only an ISO 8601 string with an explicit offset or `Z` (zod 3 `z.string().datetime({ offset: true })`, then transform to `Date`), or a number. Reject `null` explicitly, or map it to "absent" if that is what the app means. Combine this with the first review's upper bound (no later than now plus a tolerance) and add a lower bound (for example no more than N days before now). Add an integration test that posts `paidAt: null` and an offset-less string through `POST /versements` and `POST /sync/push`.

### 🟠 Today's report does not show that a past day changed, which is the normal offline case, `src/modules/caisse/caisse.service.ts:85-180`, spec `docs/specs/0002-rapport-caisse/index.md` AC-6
**Problem**: `arriveesTardives` is counted only on the day of the field date. An agent who works offline on day J and syncs on J+1 adds movements to J's report after J was reconciled. The J+1 report (detail or summary) says nothing about it, so the supervisor only finds out by reopening J. The user story "savoir si un chiffre a bougé après coup" is met only if the supervisor re-reads every past day.
**Why it matters**: Offline sync is the app's main mode, so this is the most common way a day's figure moves. Under the zero-discrepancy criterion, a supervisor who reconciled J against cash received will see a shortfall or surplus with no explanation unless they go back to J.
**Suggested fix**: In both routes, also return what the server received during the requested day for earlier days: a count and amounts (or the lines) for movements with `createdAt` in `[debut, fin[` and a field date `< debut`, grouped by field day. This is a spec change (AC-6 addendum) to be decided through /architect. It is cheap with the existing snapshot, but needs an index or a bounded scan on `created_at`.

## Minor
### 🟡 The report never goes through the real write path in its tests, `test/integration/caisse.int-spec.ts:134-530`
Every caisse test seeds movements through `creerVersement` / `creerAvance` / `creerRetrait`, which bypass the services and set `createdAt = dateTerrain`. No test creates a movement through `POST /versements`, `/avances`, `/retraits` or `/sync/push` and then reads it in the report. Such a test would have caught the date-coercion Major above, and would prove that `agentId`, `amount` and `montantNet` as written by the services match what the report reads. One end-to-end case per type would be enough.

### 🟡 The lock queue can surface as a 500 or a raw Prisma message in a sync conflict, `src/common/verrou-contrat.ts:15`
The waits are bounded by Prisma's interactive transaction timeout (5 s by default). On a P2028 the direct routes return a 500, and `sync.service.ts:20-29` copies Prisma's internal message into `conflicts[].reason`. The first review raised the 500. What it missed is the sync side: the app gets a non-business conflict reason it cannot tell apart from a rejected movement. Map timeout and lock errors to a retryable code (409 or 503) and to a stable reason such as `RETRY` in sync.

### 🟡 Pre-existing, now more important: replay ignores the payload and the owner, `src/modules/collecte/collecte.service.ts:31-34`, `retraits.service.ts:143-146`, `avances.service.ts:29-32`
A replay with a known `id` returns the stored row even when `contratId`, `misesCount` or `montant` differ, and even when the row belongs to another agent. A client bug that reuses an id for a different payment is reported as applied, so the cash is not recorded, and an AGENT can read another agent's movement by its id. Compare the payload (and `agentId` for an AGENT) and return a 409 when they differ. This is not new code, but the in-transaction re-check the first review recommends is the natural place to add it.

### 🟡 `pushContrat` changes financial parameters with no lock, `src/modules/sync/sync.service.ts:190-225`
It counts movements, then updates `miseAmount` and `targetMises` without a lock, so a payment committed between the two leaves a versement priced at the old `miseAmount` on a contract carrying the new one. `verrouillerContrat` now exists, so wrap the count and the update in one transaction that starts with it. This is pre-existing, outside the diff, and cheap to fix while the lock is being introduced.

## Nits
- ⚪ `src/modules/caisse/caisse.service.ts:85-90`, `clock.now()` is read twice (`resoudreJour` then `genereA`). Around midnight in Benin, `date` and `genereA` can fall on different days. Read it once and pass it down.
- ⚪ `src/common/verrou-contrat.ts:3-9`, the doc comment says the lock prevents "double retrait" but does not say it relies on Read Committed. Under RepeatableRead, the snapshot would be taken before the lock wait, and the second transaction would fail with a serialization error instead of seeing the first one's writes. Say so, so nobody later adds `isolationLevel` to these transactions.

## Strengths
- The cash semantics are right and deliberate: the advance principal goes out once at advance time and is netted out of the later withdrawal's `montantNet`, so the report never counts it twice, and commission and interest correctly stay in the till.
- The lock is taken first, on one row per transaction, while the advance and FK paths only take `FOR KEY SHARE`. I found no deadlock cycle, and the concurrency tests assert database invariants, not just HTTP codes.
- `estJourValide` rejects the `Date.UTC` two-digit-year trap (`0050-01-01`), and string comparison of `YYYY-MM-DD` for "future" is correct within the regex's domain.

## Test coverage
Configured, and broad for the report's read side: domain, DTO, 21 caisse, 9 retrait and 4 concurrency integration tests. Gaps that let real bugs through: no write-path-to-report test (it would have caught the date coercion), no `null` or offset-less date test, no concurrent same-id test (first review), and no advance concurrency test (first review).
