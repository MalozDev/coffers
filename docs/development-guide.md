# Coffers — Development Guide

## 1. Project Overview

Coffers is a personal finance tracker that builds a financial memory of the user and uses historical patterns to help them make better decisions. Built with **Next.js (App Router)**, **MongoDB**, and **Tailwind CSS**.

### Core Philosophy

> Money comes in → user plans → user spends → Coffers observes → analyzes → remembers → helps with the next decision.

The application is NOT just an expense tracker. It is a **financial decision system** that answers three questions:

1. How much money do I have right now?
2. What money is expected to come in?
3. What should I do with my money before I spend it?

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | MongoDB (via Mongoose) |
| Validation | Zod |
| Auth | NextAuth.js or custom JWT + bcrypt |
| Deployment | Vercel (frontend) + MongoDB Atlas (database) |
| PWA | next-pwa or manual service worker |

---

## 3. Design Tokens

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#fbfff1` | Background, light surfaces |
| Secondary | `#090c9b` | Primary brand color, headers, CTAs |
| Accent | `#3066be` | Links, interactive elements |
| Neutral | `#3c3744` | Text, borders, secondary elements |
| Soft Blue | `#b4c5e4` | Subtle backgrounds, hover states |

### Tailwind Config

```js
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#fbfff1",
        secondary: "#090c9b",
        accent: "#3066be",
        neutral: "#3c3744",
        "soft-blue": "#b4c5e4",
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 4. Project Structure

```
coffers/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard / Home
│   │   ├── income/
│   │   │   └── page.tsx
│   │   ├── expenses/
│   │   │   └── page.tsx
│   │   ├── activity/
│   │   │   └── page.tsx          # Transaction history
│   │   ├── budgets/
│   │   │   └── page.tsx
│   │   ├── goals/
│   │   │   └── page.tsx          # Savings & financial goals
│   │   ├── reminders/
│   │   │   └── page.tsx
│   │   ├── analysis/
│   │   │   └── page.tsx
│   │   ├── categories/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register/route.ts
│   │   │   ├── login/route.ts
│   │   │   └── logout/route.ts
│   │   ├── accounts/route.ts
│   │   ├── transactions/route.ts
│   │   ├── budgets/route.ts
│   │   ├── goals/route.ts
│   │   ├── reminders/route.ts
│   │   ├── expected-income/route.ts
│   │   ├── categories/route.ts
│   │   └── analysis/route.ts
│   ├── layout.tsx
│   └── page.tsx                  # Landing / redirect
├── components/
│   ├── ui/                       # Reusable primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   └── ProgressBar.tsx
│   ├── dashboard/
│   │   ├── BalanceCard.tsx
│   │   ├── QuickActions.tsx
│   │   ├── MonthlySummary.tsx
│   │   ├── InsightCard.tsx
│   │   └── RecentTransactions.tsx
│   ├── forms/
│   │   ├── AddIncomeForm.tsx
│   │   ├── AddExpenseForm.tsx
│   │   ├── BudgetForm.tsx
│   │   └── GoalForm.tsx
│   ├── charts/
│   │   ├── SpendingByCategory.tsx
│   │   ├── IncomeVsExpense.tsx
│   │   └── TrendLine.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── TopBar.tsx
│       └── BottomNav.tsx
├── lib/
│   ├── db/
│   │   └── connect.ts            # MongoDB connection singleton
│   ├── auth/
│   │   ├── session.ts
│   │   ├── hash.ts
│   │   └── middleware.ts
│   ├── models/
│   │   ├── User.ts
│   │   ├── Account.ts
│   │   ├── Transaction.ts
│   │   ├── Category.ts
│   │   ├── Budget.ts
│   │   ├── Goal.ts
│   │   ├── Reminder.ts
│   │   └── ExpectedIncome.ts
│   ├── utils/
│   │   ├── formatCurrency.ts
│   │   ├── dateHelpers.ts
│   │   └── analytics.ts
│   └── validations/
│       ├── auth.ts
│       ├── transaction.ts
│       └── budget.ts
├── docs/
│   ├── architecture-document.md
│   ├── design-document.md
│   ├── development-guide.md
│   ├── coffer_initial_idea.txt
│   └── color_palate.txt
├── public/
│   ├── manifest.json
│   ├── icons/
│   └── sw.js
├── middleware.ts                  # Route protection
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── package.json
└── .env.local
```

---

## 5. Data Models

### Core Principle

> **Transactions are the source of truth.** Balances are calculated from `openingBalance + sum(transactions)`, never stored as a static value. This creates a financial ledger that allows reconstructing any historical state.

### 5.1 User

```typescript
interface IUser {
  _id: ObjectId;
  name: string;
  email: string;            // unique
  phoneNumber: string;
  passwordHash: string;
  defaultCurrency: "ZMK";   // fixed for this version
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.2 Account

```typescript
interface IAccount {
  _id: ObjectId;
  userId: ObjectId;
  name: string;             // e.g. "Cash", "MTN Money", "Bank"
  type: "cash" | "bank" | "mobile_money" | "savings" | "custom";
  openingBalance: number;   // starting balance
  currency: "ZMK";
  createdAt: Date;
}
// Current balance = openingBalance + sum(transactions for this account)
```

### 5.3 Transaction

```typescript
interface ITransaction {
  _id: ObjectId;
  userId: ObjectId;
  type: "income" | "expense" | "transfer";
  amount: number;
  categoryId?: ObjectId;     // required for income/expense
  accountId: ObjectId;       // source account
  toAccountId?: ObjectId;    // destination for transfers
  description: string;
  note?: string;
  date: Date;
  createdAt: Date;
}
```

### 5.4 Category

```typescript
interface ICategory {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  type: "income" | "expense";
  color: string;
  icon?: string;
  isDefault: boolean;
  createdAt: Date;
}
```

### 5.5 Budget

```typescript
interface IBudget {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  categoryId: ObjectId;
  amount: number;            // spending cap
  period: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
}
```

### 5.6 Goal (Savings)

```typescript
interface IGoal {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  monthlyContribution: number;
  status: "active" | "completed" | "paused";
  createdAt: Date;
}
```

### 5.7 Reminder

```typescript
interface IReminder {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  dueDate: Date;
  amount: number;
  categoryId?: ObjectId;
  recurrence?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  isCompleted: boolean;
  createdAt: Date;
}
```

### 5.8 Expected Income

```typescript
interface IExpectedIncome {
  _id: ObjectId;
  userId: ObjectId;
  source: string;
  amount: number;
  expectedDate: Date;
  status: "pending" | "received" | "cancelled";
  note?: string;
  createdAt: Date;
}
```

---

## 6. Default Data (Onboarding)

When a new user registers, the system should create:

### Default Categories

**Expense:**
| Category | Color | Icon |
|----------|-------|------|
| Food & Groceries | `#E85D04` | 🍔 |
| Transport | `#3066be` | 🚗 |
| Housing | `#090c9b` | 🏠 |
| Utilities | `#3c3744` | ⚡ |
| Health | `#2D6A4F` | 🏥 |
| Education | `#7B2CBF` | 📚 |
| Entertainment | `#9B5DE5` | 🎮 |
| Family & Giving | `#F15BB5` | 👨‍👩‍👧 |
| Shopping | `#FEE440` | 🛒 |
| Personal Care | `#00BBF9` | 💇 |
| Financial | `#00F5D4` | 💰 |
| Other | `#9B9B9B` | 📦 |

**Income:**
| Category | Color | Icon |
|----------|-------|------|
| Salary | `#2D6A4F` | 💼 |
| Freelance | `#3066be` | 💻 |
| Business | `#090c9b` | 🏪 |
| Credit/Loan | `#F15BB5` | 🏦 |
| Gift | `#9B5DE5` | 🎁 |
| Other | `#9B9B9B` | 📦 |

### Default Accounts

| Account | Type | Opening Balance |
|---------|------|----------------|
| Cash | cash | 0 |
| Mobile Money | mobile_money | 0 |
| Bank | bank | 0 |

---

## 7. Navigation Structure

### Bottom Navigation (Mobile)

```
┌───────────────────────────────────┐
│ Home │ Activity │ Plans │ More    │
└───────────────────────────────────┘
```

| Tab | Contains |
|-----|----------|
| **Home** | Dashboard overview, balance, quick actions, insights |
| **Activity** | Transaction history, filters, search |
| **Plans** | Budgets + Savings goals + Reminders + Expected income |
| **More** | Accounts, Categories, Analysis, Settings |

### Sidebar (Desktop)

- Dashboard
- Income
- Expenses
- Activity
- Budgets
- Goals
- Reminders
- Analysis
- Categories
- Accounts
- Settings

---

## 8. API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/register` | Create new user account |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | End session |
| GET/POST | `/api/accounts` | List / create accounts |
| PATCH | `/api/accounts/[id]` | Update account |
| GET/POST | `/api/transactions` | List / create transactions |
| PATCH | `/api/transactions/[id]` | Update transaction |
| DELETE | `/api/transactions/[id]` | Delete transaction |
| GET/POST | `/api/budgets` | List / create budgets |
| PATCH | `/api/budgets/[id]` | Update budget |
| GET/POST | `/api/goals` | List / create savings goals |
| PATCH | `/api/goals/[id]` | Update goal |
| GET/POST | `/api/reminders` | List / create reminders |
| PATCH | `/api/reminders/[id]` | Complete / update reminder |
| GET/POST | `/api/expected-income` | List / create expected income |
| GET/POST | `/api/categories` | List / create categories |
| GET | `/api/analysis` | Get analysis data (daily/weekly/monthly) |

### API Response Format

```typescript
// Success
{
  success: true,
  data: T,
}

// Error
{
  success: false,
  error: string,
  details?: Record<string, string>,
}
```

---

## 9. Development Phases

### Phase 1: Scaffolding & Foundation

**Goal:** Running Next.js app with Tailwind, design tokens, project structure.

- [x] Initialize Next.js with App Router, TypeScript, Tailwind CSS
- [x] Configure color palette in `tailwind.config.ts`
- [x] Set up project directory structure
- [x] Create reusable UI components (shadcn/ui)
- [x] Set up MongoDB connection in `lib/db/connect.ts`
- [x] Define all Mongoose schemas in `lib/models/`
- [x] Set up Zod validation schemas
- [x] Configure environment variables (`.env.local`)

### Phase 2: Authentication

**Goal:** Secure sign-up and login flow.

- [x] Register endpoint (name, email, password, phone)
- [x] Password hashing with bcrypt
- [x] Login endpoint with session/JWT
- [x] Auth middleware for protected routes
- [x] Login page
- [x] Register page
- [x] Logout functionality
- [x] Route protection via `middleware.ts`

### Phase 3: Onboarding & Defaults

**Goal:** New users get a working app immediately.

- [x] Create default categories on registration
- [x] Create default accounts on registration
- [x] Set default currency to ZMK
- [x] Redirect to dashboard after onboarding

### Phase 4: Dashboard (Home)

**Goal:** First screen answers "Where am I financially right now?"

- [x] Balance card (available balance across accounts)
- [x] Expected income total
- [x] Today summary (income / expenses)
- [x] Monthly summary (income / expenses)
- [x] Quick actions (+ Income, − Expense)
- [x] Recent transactions list
- [x] One insight card

### Phase 5: Accounts

**Goal:** Manage where money lives.

- [x] Account list with balances
- [x] Create new account
- [x] Edit account
- [x] Transfer between accounts
- [x] Balance calculation from transactions

### Phase 6: Transactions

**Goal:** Fast income/expense entry.

- [x] Quick expense flow (amount → category → save)
- [x] Full income entry form
- [x] Full expense entry form
- [x] Category selection
- [x] Date/time picker
- [x] Optional notes
- [x] Account selection
- [x] Edit and delete transactions

### Phase 7: Activity Feed

**Goal:** Clean, searchable transaction history.

- [x] Transaction list grouped by date
- [x] Income/expense/transfer color coding
- [x] Search by description/note
- [x] Filter by type, category, date range, account
- [x] Infinite scroll or pagination

### Phase 8: Budgets

**Goal:** Plan spending with caps and alerts.

- [x] Create budget for category with period (daily/weekly/monthly)
- [x] Budget list with spending progress
- [x] Progress bar showing used vs remaining
- [x] Alert thresholds: 60%, 80%, 100%
- [x] Overspend warning notifications

### Phase 9: Expected Income

**Goal:** Track money that hasn't arrived yet.

- [x] Add expected income (source, amount, date, status)
- [x] Expected income list
- [x] Mark as received (auto-creates income transaction)
- [x] Mark as cancelled

### Phase 10: Reminders

**Goal:** Never forget financial obligations.

- [x] Create reminder (title, amount, date, recurrence)
- [x] Reminder list with due dates
- [x] Complete reminder
- [x] Recurring reminder auto-generation
- [x] Upcoming reminders on dashboard

### Phase 11: Savings & Goals

**Goal:** Track progress toward financial targets.

- [x] Create savings goal (name, target, deadline, monthly contribution)
- [x] Goal list with progress bars
- [x] Contribution tracking
- [x] Projected completion date calculation
- [x] Pause/resume goal

### Phase 12: Analysis Engine

**Goal:** Financial memory and insights.

- [x] Daily summary (income, expenses, net, top category)
- [x] Weekly summary (compared to previous week)
- [x] Monthly summary (income, expenses, savings rate, category breakdown)
- [x] Category spending trends
- [x] Period comparisons (this month vs last, this year vs last year)
- [x] Historical month browser

### Phase 13: Settings & Profile

**Goal:** User preferences and account management.

- [x] Update name and email
- [x] Notification preferences
- [x] Currency display (ZMK / Kwacha)
- [x] Account deletion
- [x] Password change

### Phase 14: PWA

**Goal:** Offline support and installability.

- [x] `manifest.json` configuration
- [x] Service worker for offline caching
- [x] App icons (multiple sizes)
- [ ] Splash screen

### Phase 15: Polish & Deploy

**Goal:** Production-ready application.

- [x] Loading states and skeletons
- [x] Error boundaries
- [x] Responsive design (mobile-first)
- [x] Form validation UX
- [x] Empty states
- [ ] Deploy to Vercel
- [x] MongoDB Atlas production cluster
- [ ] Environment variables in Vercel
- [ ] Error monitoring (Sentry or similar)

---

## 10. Development Rules

### Code Style

- Use **TypeScript** for all files
- Use **functional components** with hooks
- Follow Next.js App Router conventions (layouts, loading, error files)
- Keep components small and focused (single responsibility)
- Colocate related files (page, components, types)

### Git Workflow

- One feature per branch
- Descriptive commit messages
- No secrets in code (use `.env.local`)

### Performance

- Use server components where possible
- Lazy-load charts and heavy components
- Paginate transaction lists
- Index MongoDB fields: `userId`, `email`, `date`, `categoryId`, `accountId`

### Security

- Hash passwords with bcrypt (12+ rounds)
- Validate all API input with Zod
- Enforce user-based data isolation (every query filtered by `userId`)
- Sanitize user-generated content
- Use HTTPS only in production

### Currency

- Default and only currency for this version: **ZMK (Kwacha)**
- Display as `K` prefix (e.g., `K4,820`)
- All amounts stored as numbers (no floating point issues — use integer cents if needed)

---

## 11. MVP Success Criteria

The MVP is complete when:

- [x] User can sign up with name, email, password, and phone
- [x] Currency defaults to ZMK / Kwacha
- [x] User sees a clean dashboard after sign-up
- [x] User can add and view income and expense entries
- [x] User can manage multiple accounts
- [x] User can create budgets with category caps
- [x] User can track savings goals
- [x] User can set reminders for upcoming expenses
- [x] Analysis screen shows summaries and trends
- [x] Transaction history is searchable and filterable
- [x] App works offline (PWA)
- [ ] App is deployed and accessible via URL

---

## 12. Future Considerations (Post-MVP)

These are explicitly **not** in the MVP but are part of the product vision:

- **Pattern Detection:** Coffers learns recurring income, spending habits, and payday patterns
- **Intelligent Notifications:** Context-aware reminders based on historical data
- **"Ask Coffers" Feature:** Natural language financial questions
- **Financial Simulations:** "What happens if I buy this?" projections
- **Spending Forecast:** Predict month-end balance based on current trends
- **Financial Health Dashboard:** Multi-dimensional health indicators (not a single score)
- **Multi-currency Support:** For users with multiple income sources
- **Export Features:** CSV/PDF export of financial data
- **Data Import:** Import from other finance apps
- **Social Features:** Shared budgets or group savings (future consideration)

---

## 13. References

- [Architecture Document](./architecture-document.md)
- [Design Document](./design-document.md)
- [Color Palette](./color_palate.txt)
- [Initial Brainstorm](./coffer_initial_idea.txt)

---

*This document is the source of truth for all development work on Coffers. Update it as the project evolves.*
