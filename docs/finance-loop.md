# Viatica Finance Loop

## Purpose

The finance loop turns isolated transaction capture into a repeatable daily
workflow without giving an Agent permission to mutate the ledger:

```text
record or backfill
-> reuse familiar entries
-> review upcoming recurring items
-> confirm what actually happened
-> inspect deterministic recap signals
```

The ledger remains the source of truth. Templates, memory, reminders, and recap
signals assist capture and review; they are not a second transaction store.

## User Flow

### Dates and day details

- Add exposes a compact date control.
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

They are normalized by `src/core/financeLoop.js` and persisted inside the
active `viatica:v1` or account-specific local cache. The current
`viatica_preferences` cloud row stores only supported scalar preferences such
as locale and starting assets. Bookkeeping memory and recurring rules therefore
do not sync across devices yet.

Confirmed recurring occurrences are ordinary transactions. They save locally
first and use the normal cloud transaction mutation path when signed in.

`buildAevumOverview()` is an aggregate-only candidate boundary: it exposes
period totals and top-category totals, not recent transaction rows. It is not
wired to Aevum at runtime yet.

## Implementation Map

- `src/core/financeLoop.js`: pure date, template, memory, recurrence, and recap
  logic.
- `src/core/financeLoop.test.js`: boundary and heuristic coverage.
- `src/main.js`: capture, Calendar, Settings, persistence, and confirmation UI.
- `src/core/storage.js`: local preference defaults.
- `src/core/cloudSync.js`: current cloud boundary; it does not serialize the two
  local collections above.

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

- Bookkeeping memory and recurring rules are device-local.
- JSON restore preview and conflict-safe recovery are not implemented.
- Recurring rules are monthly only.
- Review signals do not explain causal relationships beyond their deterministic
  matching rules.
- No AI service is involved.
