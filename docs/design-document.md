# Coffers Design Document

## 1. Product Overview

Coffers is a modern personal finance tracker designed for users who want clarity on where their money is going, what is coming in, and what financial decisions they should make next. The application is built around a simple idea: financial tools should help people make better decisions before they overspend.

The product is not only an expense tracker. It is a financial memory system that learns from previous spending, income cycles, budgets, and goals to give useful guidance.

### Product promise

Coffers helps the user answer three questions quickly:

- How much money do I have right now?
- What money is expected to come in?
- What should I do with my money before I spend it?

---

## 2. Core User Experience

### Primary experience goals

1. Fast financial visibility
2. Calm, minimal interface
3. Simple data capture
4. Smart reminders and warnings
5. Long-term insight and planning

### UX principle

The first screen should not overwhelm the user with charts and metrics. The user should be greeted with a clear overview of current money status, expected money, and useful insight.

---

## 3. Sign-up and Account Setup

### Initial setup requirements

When a user creates an account, the setup includes the following required fields:

- Name
- Email
- Password
- Number
- Currency: ZMK / Kwacha (default and fixed for this product version)

### Sign-up form specification

Field requirements:

- Name: full name or preferred name
- Email: valid email format and unique across users
- Password: minimum 8 characters, hashed on server
- Number: valid mobile phone number for contact and secure recovery
- Currency: default to ZMK, displayed as Kwacha in the UI

### Account setup behavior

- User signs up with name, email, password, and number
- System creates a new profile with default currency set to ZMK
- App initializes default categories and wallet accounts
- App creates a default monthly budget skeleton
- User is redirected to the overview page

### Default currency rule

For this product, the default and primary currency is:

- ZMK
- Label shown to users: Kwacha

This should be a user-visible currency choice and data layer default for all financial values.

---

## 4. User Personas

### 1. Everyday income earner

Needs:
- track daily spend
- avoid overspending
- know how much is left after bills
- receive reminders for subscriptions and obligations

### 2. Small business or side-income user

Needs:
- track business and personal cash flow separately
- log irregular income
- monitor profits and budgets
- understand expected money

### 3. Savers and goal planners

Needs:
- plan future goals
- save systematically
- use budgets and financial insights
- track progress against targets

---

## 5. Functional Scope

### Core modules

1. Account and profile setup
2. Wallet and balance tracking
3. Income management
4. Expense management
5. Budget planning
6. Reminder and planned spending
7. Savings and goals
8. Financial analysis and insights
9. Transactions history
10. Settings and preferences

---

## 6. Primary User Flow

### Flow A: New user sign-up

1. User lands on sign-up screen
2. Enters name, email, password, and number
3. Currency is set to ZMK / Kwacha by default
4. User confirms account creation
5. App creates profile and default data
6. User sees the dashboard overview

### Flow B: Daily money management

1. User opens overview screen
2. Sees available balance, expected money, and month summary
3. Adds income or expense
4. Receives insight or warning if overspending risk is detected
5. Reviews budget and reminder status
6. Continues planning or saving

### Flow C: Monthly review

1. User opens analysis screen
2. Sees category spend, income trend, and spending forecast
3. Reviews budget completion and savings progress
4. Makes planning changes for the next cycle

---

## 7. Core Pages and Screens

### 1. Sign-up / Create account
Contains:
- name
- email
- password
- number
- currency defaulted to ZMK / Kwacha
- sign-up CTA
- terms or privacy note

### 2. Login
Contains:
- email
- password
- remember me
- forgot password

### 3. Overview / Dashboard
Contains:
- available balance
- expected income
- current month summary
- spending insights
- quick actions
- recent transactions

### 4. Add income
Contains:
- amount
- source
- account
- date
- expected date
- note
- save action

### 5. Add expense
Contains:
- amount
- category
- date
- note
- account or wallet
- save action

### 6. Budget planner
Contains:
- monthly or payday budget
- category allocations
- remaining amount
- alerts when close to limit

### 7. Planned spending / reminders
Contains:
- recurring expenses
- bills due soon
- subscriptions
- user-added reminders

### 8. Savings and goals
Contains:
- list of goals
- target values
- deadline
- progress bar
- contribution suggestion

### 9. Analysis dashboard
Contains:
- daily, weekly, and monthly views
- category breakdown
- forecast summary
- spending trend comparisons
- recommendations

### 10. Transactions ledger
Contains:
- searchable transaction history
- filters by category and date
- income and expense entries

### 11. Categories settings
Contains:
- default category list
- custom categories
- category management
- cap settings

### 12. Settings and profile
Contains:
- name and email update
- locale preferences
- notifications
- default currency visibility
- account deletion and security controls

---

## 8. Information Architecture

### Navigation structure

- Overview
- Income
- Expenses
- Budget
- Reminders
- Savings
- Analysis
- Transactions
- Categories
- Settings

### Mental model

The app should feel like a personal money system, not a spreadsheet. The user should understand the flow clearly:

Money comes in -> plan it -> spend it -> review it -> learn from it

---

## 9. Design System Guidelines

### Visual direction

Based on the current palette:

- primary: #fbfff1
- secondary: #090c9b
- accent: #3066be
- neutral: #3c3744
- soft blue: #b4c5e4

### Style principles

- clean and premium
- minimal but trustworthy
- modern, strong contrast
- high readability on small screens
- high clarity for financial numbers

### Interface tone

- calm and confident
- supportive, not judgmental
- precise and simple
- helpful without being noisy

---

## 10. Functional Requirements

### Required

- User registration with name, email, password, default currency set to ZMK
- Login and session management
- Add income items
- Add expense items
- Budget categories and limits
- Savings goals
- Analysis summaries
- Transaction history
- Notifications and reminders

### Nice to have

- recurring transactions
- AI-style insights
- category suggestions
- spending predictions
- export features

---

## 11. Acceptance Criteria

A feature is considered complete when:

- user can sign up with name, email, password
- currency defaults to ZMK / Kwacha
- user sees a clean overview after sign-up
- user can add and view income and expense entries
- user can create budgets and goals
- analysis screen displays summaries and trends
- reminders help users manage upcoming obligations

---

## 12. Design Decision Summary

Coffers should be designed to feel premium, calm, and useful. The central objective is not to show raw data only, but to guide users toward better money decisions.

This design document is the source of truth for all future product and UI development.
