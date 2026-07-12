# Viatica Finance Loop

## Purpose

The finance loop turns isolated transaction capture into a repeatable daily
workflow while keeping true ledger mutations inside Viatica:

```text
record or backfill
-> reuse familiar entries
-> review upcoming recurring items
-> confirm what actually happened
-> inspect deterministic recap signals
```

The ledger remains the source of truth. Templates, memory, reminders, and recap
signals assist capture and review; they are not a second transaction store.
This does not prevent autonomous aggregate analysis or reporting; it prevents an
Agent inference from silently becoming a real financial record.

## User Flow

### Dates and day details

- Add exposes compact built-in date and time-period wheels rather than native
  browser/OS pickers. Their state survives background sync renders, and the
  confirmed date writes back into the transaction draft.
- Calendar can move between months and return to the current month.
- Tapping a day opens its income, expense, and transaction list.
- "Backfill this day" opens Add with that date preselected.
- Project-only backfills stay out of normal day totals.

### Repeat and recent templates

- Long-pressing a ledger row or using a day-detail action can open a repeat
  draft.
- Add shows up to six recent deterministic templates derived from saved
  transactions.
- A template copies type, category, title, merchant, amount, and currency, then
  waits for an explicit save.
- Bookkeeping memory records saved merchant/title and category associations
  for review in Settings. It does not currently rewrite new entries
  automatically.

### Projects

- Calendar -> Projects owns the project catalog. Its first row keeps the
  project chips and a compact `+` action for creation and management.
- Add selects an existing project from Viatica's internal picker. It does not
  accept a second free-text project name.
- Renaming a project updates the project tags on every linked transaction and
  refreshes their `updatedAt` values so the normal transaction sync path carries
  the rename. Only empty catalog projects can be deleted directly.
- The catalog itself syncs through `viatica_projects`, so empty projects,
  renames, and deletion tombstones converge across PWA and App instead of being
  inferred only from transaction rows.
- The selected chip is the sole project name/amount summary. Project detail
  shows an entry-count badge beside Project Entries and the related rows below.

### Recurring reminders

- A saved transaction can become a monthly recurring rule.
- Calendar -> Pending shows overdue occurrences and those due within 30 days.
- Confirm creates a normal transaction and advances the rule.
- Skip advances the rule without creating a transaction.
- Modify This Time opens a transaction draft; saving it advances the rule.
- No recurring rule silently writes an official ledger row.

### Review

Calendar -> Review is local, read-only, and deterministic. It reports:

- current week and month expense totals;
- category increases versus the previous month;
- categories at or above 80% of their monthly budget;
- possible duplicates with the same date, type, amount, and title/merchant;
- likely recurring entries seen at least twice with the same type, amount, and
  title/merchant.

These are heuristics, not financial advice or AI conclusions.

## Data And Sync Boundary

The local state keeps these collections under `preferences`:

- `merchantRules`
- `recurringTransactions`

They are normalized by the relevant core modules and persisted inside the
active `viatica:v1` or account-specific local cache. The current
`viatica_preferences` cloud row stores only supported scalar preferences such
as locale and starting assets. Bookkeeping memory and recurring rules therefore
do not sync across devices yet. Project catalog metadata is also cached locally
under `projectCatalogEntries`, but syncs independently through
`viatica_projects`; transaction-linked project names continue to sync with the
transaction itself.

Confirmed recurring occurrences are ordinary transactions. They save locally
first and use the normal cloud transaction mutation path when signed in.

## Cross-device transaction deletion

Deleting a transaction records a local timestamped tombstone immediately. With
the `viatica_transactions.deleted_at` migration applied, cloud sync keeps the
row as a tombstone instead of physically deleting it. Every device receives
that tombstone and compares it with the transaction's `updated_at`; the newer
state wins. Visible ledger lists exclude winning tombstones, while retained
tombstones prevent an offline device from uploading a stale copy later.

`preferences.deletedTransactionIds` remains as a compatibility index for old
local caches. New clients also store `deletedTransactionTombstones` with the
deletion timestamp. If the cloud schema has not been migrated yet, the client
falls back to the previous physical-delete path without blocking bookkeeping.

`buildAevumOverview()` is an aggregate-only candidate boundary: it exposes
period totals and top-category totals, not recent transaction rows. It is not
wired to Aevum at runtime yet.

The target Agent connection keeps three channels separate:

- **Query**: Aevum requests a current aggregate recap; temporary by default.
- **Report**: Viatica proactively sends a meaningful aggregate change, budget
  risk, anomaly candidate, or minimal policy-authorized fact.
- **Action**: Aevum requests a Viatica-owned operation. Payments, transfers,
  source-row deletion, and material budget/recurring-rule changes require Wilf;
  explicitly authorized reversible classification or housekeeping may be
  automatic with audit and undo.

Scheduled Reports must be generated server-side from a watermark and only after
a deterministic significance check. They do not include raw transaction rows,
unrestricted merchant/note text, or credentials. A Report is evidence for
Aevum policy, not permission to write Aevum memory directly.

## Implementation Map

- `src/core/financeLoop.js`: pure date, template, memory, recurrence, and recap
  logic.
- `src/core/financeLoop.test.js`: boundary and heuristic coverage.
- `src/main.js`: capture, Calendar, Settings, persistence, and confirmation UI.
- `src/core/storage.js`: local preference defaults.
- `src/core/cloudSync.js`: current cloud boundary; it does not serialize the
  three local collections above.

## Verification

Run:

```bash
npm run test
npm run lint
npm run build
```

For a browser smoke test, verify date backfill, repeat draft, recurring Confirm
/ Skip / Modify, Settings memory editing, and Review with a mobile viewport.
Never reset real browser storage to prepare a test.

## Known Gaps

- Bookkeeping memory, recurring rules, and empty project placeholders are
  device-local.
- JSON restore preview and conflict-safe recovery are not implemented.
- Recurring rules are monthly only.
- Review signals do not explain causal relationships beyond their deterministic
  matching rules.
- No AI service is involved.
