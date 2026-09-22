# Ask Coffers — Financial Reasoning Engine
### Detailed System Design (v1.0)

**Stack:** Next.js (App Router) · MongoDB · TypeScript
**Scope:** Finance Engine contracts, Intelligence layer, real-time data accuracy model, performance safeguards, phased implementation plan.

---

## 1. Design Goals

1. Any financial question → understood → resolved into required data → retrieved from a trusted source → calculated deterministically → explained by an LLM.
2. The LLM never touches MongoDB directly. It only calls typed tools.
3. Data shown to the user (dashboard) and data reasoned about by Ask Coffers must **never disagree** — same source, same math, same freshness rules.
4. The system must stay fast as transaction volume grows — no full-history rescans on every question.
5. Real-time updates (a transaction added mid-conversation) must not produce stale or contradictory answers.

---

## 2. Layered Architecture

```
UI (Dashboard / Ask Coffers)
        │
        ▼
API Routes (thin controllers)
        │
        ▼
Intelligence Layer   (understands questions, plans, calls tools)
        │
        ▼
Finance Engine       (deterministic calculations, the ONLY source of truth math)
        │
        ▼
Data Access Layer    (repositories, caching, freshness control)
        │
        ▼
MongoDB
```

Dashboard pages call the Finance Engine directly (bypassing Intelligence). Ask Coffers calls the Finance Engine through Tools. **Both paths converge on the same Finance Engine functions**, so numbers can never diverge between the UI and the AI.

---

## 3. Real-Time Data Accuracy Model

This is the part that determines whether Ask Coffers can be trusted. Three problems have to be solved together: **freshness**, **consistency**, and **concurrency**.

### 3.1 The core rule: no derived number is cached without a freshness contract

Every value the Finance Engine returns carries an implicit or explicit "as-of" timestamp. There are three tiers of data, each with a different accuracy strategy:

| Tier | Examples | Strategy |
|---|---|---|
| **Live facts** | current balance, this month's expenses, today's transactions | Always computed from MongoDB at request time (or served from a cache invalidated on write — never time-based expiry) |
| **Derived analysis** | spending patterns, recurring expense detection, category trends | Computed on a schedule or on-demand, tagged with `computedAt`; recomputed if stale relative to new transactions |
| **Historical snapshots** | "your situation in June" | Immutable once the period closes; never recomputed |

### 3.2 Write-through invalidation (not time-based cache expiry)

Never use a TTL cache for balances or expenses. Instead:

```
Transaction created/updated/deleted
        │
        ▼
Data Access Layer writes to MongoDB
        │
        ▼
Emit domain event: transaction.changed { userId, accountId, period }
        │
        ▼
Invalidate:
   - cached balance for that account
   - cached expense/income aggregates for that period
   - "dirty" flag on FinancialSnapshot for that period (not deleted — flagged)
        │
        ▼
Background worker recomputes affected aggregates (or next read recomputes lazily)
```

This guarantees: **the moment a transaction is written, every subsequent read (dashboard or Ask Coffers) reflects it.** There is no cache-expiry window where stale data could be served.

### 3.3 Read consistency inside a single conversation turn

A single Ask Coffers answer may call 3–6 tools (`get_income`, `get_expenses`, `get_recurring_expenses`...). If a transaction is written by the user in another tab *while* the engine is mid-reasoning, tool calls could read two different "versions" of reality.

Solution — **snapshot-per-turn**:

```ts
// lib/intelligence/context/financialContext.ts
interface ReasoningSnapshot {
  asOf: Date;              // fixed the moment the turn starts
  userId: string;
  cacheKey: string;        // scoped cache for this turn only
}
```

* At the start of every `askCoffers()` call, the orchestrator stamps `asOf = now()`.
* Every tool call within that turn is required to pass `asOf`.
* The Data Access Layer serves reads consistent with that timestamp (MongoDB reads with `$lte: asOf` on `createdAt`/`updatedAt` where relevant, or a short-lived in-memory cache scoped to the turn).
* This prevents "torn reads" where `get_income()` and `get_expenses()` reflect different moments in time within the same answer.

This costs nothing in accuracy and is cheap: the scoped cache lives only for the duration of one request.

### 3.4 Optimistic concurrency on writes

Balances are **never stored as a mutable field that drifts**. Balance is always *derived* (`SUM` over transactions), not decremented/incremented imperatively. This eliminates an entire class of race-condition bugs (double-submits, concurrent writes from two devices) because the source of truth is the transaction log, not a counter.

```ts
// Never do this:
account.balance -= amount; account.save();

// Always do this:
getAvailableBalance(accountId, asOf) // = SUM(transactions WHERE accountId AND date <= asOf)
```

Where full re-summation would be expensive at scale (see §4), use **incremental materialized balances** with a version field, reconciled against the transaction log periodically (§3.6).

### 3.5 Simulations must never touch real data

`simulate_purchase`, `simulate_goal`, `project_cash_flow` operate on a **read-only working copy** of the user's current financial state (an in-memory object built from live reads), never on the database. This is a safety property, not just a performance one — a simulation must be guaranteed to be incapable of mutating real balances, goals, or transactions.

### 3.6 Reconciliation job (accuracy safety net)

Even with write-through invalidation, drift can theoretically creep in (failed event, partial write, race). A scheduled job (hourly or nightly, per user, incremental) recomputes materialized balances/aggregates from the raw transaction log and compares against the cached/materialized value. Mismatches are logged and self-healed. This is the accuracy backstop layer — cheap because it's incremental (only recently-touched accounts) and asynchronous (never blocks a user request).

### 3.7 Freshness disclosure to the LLM

Every tool result includes metadata the LLM can reason with and, if needed, surface to the user:

```json
{
  "data": { "balance": 4820 },
  "meta": {
    "asOf": "2026-09-22T14:03:11Z",
    "source": "live",
    "stale": false
  }
}
```

If `source: "cached_snapshot"` and the snapshot is more than a defined threshold old for a *live fact* tier, the orchestrator forces a live recomputation before answering rather than letting the LLM present outdated numbers.

---

## 4. Performance Safeguards

Accuracy guarantees above (write-through invalidation, per-turn snapshots) must not become a performance tax as transaction history grows. Concrete measures:

### 4.1 Never re-scan full transaction history for common questions

* Maintain **period-level materialized aggregates** (`MonthlyAggregate` collection: `{ userId, period, totalIncome, totalExpenses, byCategory, txCount }`), updated incrementally on write (§3.2), not recomputed from scratch.
* `get_expenses({period})` reads the materialized aggregate — O(1) — falling back to a live aggregation query only for the *current, still-open* period, which is bounded (typically < 200 transactions/month).

### 4.2 Indexing

Minimum required MongoDB indexes:

```
Transaction:      { userId: 1, date: -1 }
Transaction:      { userId: 1, accountId: 1, date: -1 }
Transaction:      { userId: 1, category: 1, date: -1 }
MonthlyAggregate: { userId: 1, period: 1 }  (unique)
FinancialSnapshot:{ userId: 1, date: -1 }
Conversation:     { userId: 1, updatedAt: -1 }
```

### 4.3 Aggregation pushed to MongoDB, not application code

Use MongoDB aggregation pipelines (`$group`, `$sum`, `$bucket`) for category totals, averages, and comparisons instead of pulling raw transaction arrays into Node and summing in JavaScript. This keeps memory flat regardless of transaction count and lets MongoDB use indexes for the grouping.

### 4.4 Tool-call budget per conversation turn

The orchestrator caps tool calls per turn (e.g., max 6–8) and requires the planner to request only the tools actually needed for the current question — not a blanket "fetch everything." This bounds both LLM latency and DB load per question.

### 4.5 LLM cost/latency isolation from calculation

Because arithmetic never happens inside the LLM (§ Finance Engine, below), the LLM's job is always: *interpret → decide which tools → explain results*. This keeps prompts small (structured JSON results, not raw transaction dumps) and keeps latency dominated by 1–2 fast DB calls rather than large context processing.

### 4.6 Background computation for expensive analysis

Pattern detection, recurring-expense detection, and anomaly detection (§ Analysis Engine) run as background jobs (cron / queue worker), not inline during a user's question. Ask Coffers reads their *output* (`Pattern`, `Insight` documents), never triggers the analysis itself synchronously.

### 4.7 Conversation memory stays bounded

Only the structured `subject` / `context` state (§5) is carried between turns — not full transaction data and not the full message history. Raw data is re-fetched fresh per turn (accuracy) but the LLM's working context stays small (performance).

---

## 5. Finance Engine Contracts (TypeScript)

```ts
// lib/finance/types.ts

export interface AsOf {
  asOf: Date; // snapshot timestamp for the whole reasoning turn (§3.3)
}

export interface MetaEnvelope<T> {
  data: T;
  meta: {
    asOf: string;
    source: "live" | "materialized" | "snapshot";
    stale: boolean;
  };
}

export interface Balance {
  accountId: string;
  amount: number;
  currency: "ZMW";
}

export interface ExpenseQuery extends AsOf {
  userId: string;
  period?: string;          // "2026-09"
  category?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ExpenseSummary {
  total: number;
  byCategory: Record<string, number>;
  count: number;
}

export interface SimulatePurchaseInput extends AsOf {
  userId: string;
  price: number;
  paymentMethod: "cash" | "finance";
  targetDate?: Date;
  financing?: { deposit: number; termMonths: number; interestRate: number };
}

export interface SimulationResult {
  feasible: boolean;
  resultingBalance: number;
  impactOnGoals: { goalId: string; delayDays: number }[];
  warnings: string[];
}
```

```ts
// lib/finance/calculations/balance.ts
export async function getAvailableBalance(userId: string, opts: AsOf): Promise<MetaEnvelope<Balance>>;

// lib/finance/queries/transactions.ts
export async function getExpenses(query: ExpenseQuery): Promise<MetaEnvelope<ExpenseSummary>>;
export async function getIncome(query: ExpenseQuery): Promise<MetaEnvelope<ExpenseSummary>>;

// lib/finance/analysis/cashflow.ts
export async function analyzeCashflow(userId: string, opts: AsOf): Promise<MetaEnvelope<CashflowObservation[]>>;

// lib/finance/simulations/purchase.ts
export async function simulatePurchase(input: SimulatePurchaseInput): Promise<SimulationResult>;
```

Every function signature carries `asOf` — this is what makes §3.3's per-turn consistency enforceable at the type level, not just by convention.

---

## 6. Tool Registry (Intelligence Layer)

```ts
// lib/intelligence/tools/types.ts
export interface CoffersTool<Input, Output> {
  name: string;
  description: string;   // shown to the LLM for tool selection
  inputSchema: JSONSchema;
  execute(userId: string, input: Input, ctx: ReasoningSnapshot): Promise<MetaEnvelope<Output>>;
}
```

```ts
// lib/intelligence/tools/index.ts
export const toolRegistry: CoffersTool<any, any>[] = [
  getCurrentBalanceTool,
  getExpensesTool,
  getIncomeTool,
  getBudgetStatusTool,
  getGoalProgressTool,
  getRecurringExpensesTool,
  analyzeSpendingTool,
  compareperiodsTool,
  simulatePurchaseTool,
  simulateGoalTool,
  projectCashflowTool,
];
```

The LLM is given only tool *names + descriptions + schemas* — never raw data — and selects/calls them. Every tool internally calls the Finance Engine (§5), which is the only layer allowed to query MongoDB.

---

## 7. Conversation State

```ts
interface Conversation {
  _id: string;
  userId: string;
  subject: {
    type: "purchase" | "goal" | "general";
    item?: string;
    price?: number;
    paymentMethod?: "cash" | "finance";
  };
  context: Record<string, unknown>;
  status: "active" | "needs_input" | "resolved";
  updatedAt: Date;
}
```

Missing-parameter handling is part of the planner's output (`status: NEEDS_INPUT`), not a separate chatbot feature — this keeps clarification behavior consistent whether the missing field is `price`, `targetDate`, or something not yet imagined.

---

## 8. Orchestration Flow

```
POST /api/intelligence/ask
        │
        ▼
Load Conversation (or create)
        │
        ▼
Classify: FINANCIAL_PERSONAL | FINANCIAL_EDUCATION | CASUAL | OUT_OF_SCOPE
        │
        ▼
Planner determines required data / missing parameters
        │
   ┌────┴────┐
 missing    complete
   │           │
 ask user   stamp ReasoningSnapshot.asOf
             │
             ▼
        Execute tools (bounded, §4.4)
             │
             ▼
        Finance Engine (deterministic)
             │
             ▼
        LLM explains results (never computes them)
             │
             ▼
        Persist Conversation + Message
             │
             ▼
        Response { text, data, meta.asOf }
```

---

## 9. Data Model Additions

```
FinancialSnapshot   { userId, date, balance, income, expenses, netWorth, dirty }
MonthlyAggregate     { userId, period, totalIncome, totalExpenses, byCategory, version }
Pattern               { userId, type, category, observation, value, baseline, computedAt }
Insight                { userId, type, payload, computedAt }
Conversation           { userId, subject, context, status, updatedAt }
ConversationMessage   { conversationId, role, content, toolCalls, toolResults, createdAt }
```

`dirty` and `version` fields exist specifically to support §3.2 (write-through invalidation) and §3.6 (reconciliation) without full recomputation.

---

## 10. Phased Implementation Plan

**Phase 1 — Financial foundation**
Accounts, transactions, income, expenses, categories, budgets, goals, savings, expected income. Verify all raw data and CRUD is correct before anything else.

**Phase 2 — Finance Engine + accuracy/performance backbone**
Balance/income/expense calculations built as pure, deterministic functions (§5). Materialized `MonthlyAggregate` + write-through invalidation (§3.2, §4.1) implemented *before* Ask Coffers exists — the dashboard should benefit from this immediately.

**Phase 3 — Analysis engine (background)**
Spending patterns, recurring-expense detection, cashflow patterns, snapshots. Runs as scheduled jobs (§4.6), writes `Pattern` / `Insight` / `FinancialSnapshot` documents.

**Phase 4 — Ask Coffers core**
Conversations, classifier, tool registry (8–12 tools), orchestrator with `ReasoningSnapshot` (§3.3), progressive clarification. LLM wired to tools only — no direct DB access.

**Phase 5 — Simulations**
Purchase/goal/cashflow simulation on read-only working copies (§3.5).

**Phase 6 — Advanced intelligence**
Reconciliation job (§3.6) hardened, proactive insights, forecasting, freshness disclosure surfaced in UI where relevant.

---

## 11. Summary of Guarantees

| Guarantee | Mechanism |
|---|---|
| Dashboard and Ask Coffers never disagree | Both call the same Finance Engine functions |
| No stale balance shown after a new transaction | Write-through cache invalidation, not TTL |
| No "torn read" mid-conversation | Per-turn `ReasoningSnapshot.asOf` |
| No drift accumulates silently | Nightly incremental reconciliation job |
| Simulations can't corrupt real data | Read-only working-copy execution |
| Fast at scale | Materialized aggregates + indexed queries, not full-history scans |
| LLM never invents numbers | All arithmetic happens in the Finance Engine; LLM only explains |
| Bounded latency/cost per question | Tool-call budget per turn; heavy analysis runs in the background |