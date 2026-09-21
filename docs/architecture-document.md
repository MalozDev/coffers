# Coffers Architecture Document

## 1. Architecture Overview

Coffers is a personal finance application built with Next.js on the frontend, MongoDB as the database, and Tailwind CSS for styling. The system is designed as a modern web application with a clean separation between presentation, business logic, and data persistence.

### Tech stack

- Frontend: Next.js
- Styling: Tailwind CSS
- Database: MongoDB
- API layer: Next.js API routes or server actions
- Validation: Zod or similar schema validation
- Authentication: secure email/password authentication flow
- Deployment target: Vercel for frontend and MongoDB Atlas for database

---

## 2. High-Level Architecture

### Core layers

1. Client layer
   - Next.js pages and components
   - Tailwind-based UI
   - form handling and client-side validation

2. Application layer
   - auth logic
   - financial processing logic
   - budget and insights rules
   - reminder generation

3. Data layer
   - MongoDB collections
   - query and aggregation logic
   - transaction and category persistence

4. External services
   - email delivery for verification or password recovery
   - optional notifications service
   - cloud hosting and monitoring

---

## 3. System Context

The application manages a user’s financial records and gives decision support based on historical patterns.

Main domains:

- User management
- Financial accounts
- Transactions
- Budgets
- Goals
- Insights
- Reminders

---

## 4. Authentication and Account Model

### User account model

Required fields:

- name
- email
- phoneNumber
- passwordHash
- defaultCurrency
- createdAt
- updatedAt

### Default currency

The product default currency is:

- ZMK
- display label: Kwacha

### Auth approach

Recommended flow:

- sign-up with name, email, password, and phone number
- validate email and phone uniqueness where necessary
- hash password before storage
- issue session token or secure cookie
- protect private routes and API endpoints

This can be implemented with a secure server-side auth mechanism and MongoDB-backed user collection.

---

## 5. Data Model

### Collections

#### Users

- id
- name
- email
- phoneNumber
- passwordHash
- defaultCurrency
- createdAt
- updatedAt

#### Accounts

- id
- userId
- name
- type
- balance
- currency
- createdAt

Example account types:
- cash
- bank
- mobile money
- savings

#### Transactions

- id
- userId
- type (income or expense)
- amount
- categoryId
- accountId
- description
- date
- createdAt

#### Categories

- id
- userId
- name
- type (income or expense)
- color
- isDefault
- createdAt

#### Budgets

- id
- userId
- name
- categoryId
- amount
- period (daily, weekly, monthly)
- startDate
- endDate
- createdAt

#### Goals

- id
- userId
- name
- targetAmount
- currentAmount
- targetDate
- status
- createdAt

#### Reminders

- id
- userId
- title
- dueDate
- amount
- categoryId
- recurrence
- isCompleted

#### ExpectedIncome

- id
- userId
- source
- amount
- expectedDate
- status
- note

---

## 6. Proposed Database Design

### MongoDB structure

MongoDB will store documents in collections, with each document containing user-specific financial data. This suits the product because transactions and budgets are naturally nested by user.

### Design considerations

- Keep user-specific records isolated by userId
- Use indexes on email, userId, date, category, and amount fields
- Use aggregation pipelines for month summaries and category analysis
- Store dates in ISO format for sorting and filtering

---

## 7. API Layer Design

### Recommended route groups

- /api/auth/register
- /api/auth/login
- /api/accounts
- /api/transactions
- /api/budgets
- /api/goals
- /api/analysis
- /api/reminders
- /api/categories

### API responsibilities

- create and update user records
- save transactions
- calculate balances and aggregates
- generate budget warnings
- produce analysis summaries
- manage reminder schedules

---

## 8. Frontend Architecture

### Next.js structure

Suggested structure:

- app/
  - auth/
  - dashboard/
  - income/
  - expenses/
  - budgets/
  - analysis/
  - goals/
  - reminders/
  - settings/
  - api/
- components/
  - ui/
  - dashboard/
  - forms/
  - charts/
- lib/
  - db/
  - auth/
  - utils/
  - validations/

### Styling approach

- Tailwind CSS for component styling
- a small design token system based on the approved color palette
- reusable card, button, and input classes
- consistent spacing and typography for readability

---

## 9. Core Business Logic

### Income logic

- record income item
- assign to account or source
- update expected income if relevant
- update month totals

### Expense logic

- record expense with category
- deduct from account balance
- attach date and note
- trigger budget cap checks

### Budget logic

- calculate actual spend against planned values
- compare current spending to category cap
- show warnings before overspending continues

### Analysis logic

- aggregate monthly totals
- compare to previous periods
- identify category trends
- produce recommendation summaries

### Reminder logic

- detect upcoming or recurring obligations
- alert user based on due date and category
- allow manual add or auto-generation from recurring patterns

---

## 10. Security Considerations

- hash passwords before storage
- use secure session or JWT handling
- validate all API input
- enforce user-based authorization
- prevent cross-user access to records
- sanitize all user-generated content
- protect sensitive financial data

---

## 11. Performance Considerations

- paginate transactions history
- index critical MongoDB fields
- use server-side aggregation for reports
- lazy-load charts and summaries
- avoid expensive queries on the dashboard without caching

---

## 12. Deployment Architecture

### Recommended deployment

- Frontend: Vercel
- Database: MongoDB Atlas
- Environment variables: Vercel environment settings
- Image and asset handling: Vercel-managed static hosting

### Production concerns

- use environment secrets for database and auth credentials
- enable monitoring and error logging
- set up backups for MongoDB
- use staging validation before production deployment

---

## 13. MVP Architecture Scope

### MVP includes

- user registration and login
- default currency set to ZMK / Kwacha
- account overview
- income and expense tracking
- budget categories
- transaction history
- basic analysis dashboard

### Not in MVP

- advanced AI forecasting
- social or collaborative finance sharing
- multi-currency conversion engine
- more complex financial modeling beyond the first release

---

## 14. Technical Recommendation

For the initial build, keep the architecture straightforward and reliable:

- Next.js App Router for modern frontend structure
- Tailwind CSS for a fast premium UI layer
- MongoDB for flexible financial data storage
- server-side validation and secure auth flow
- clean API layer for transaction and analytics operations

This gives the team a clean path to build an MVP quickly while leaving room for insight and analytics features later.

---

## 15. Final Architecture Summary

Coffers should be built as a secure, user-focused personal finance platform with a simple app flow and a strong data model. The system will support account setup, transaction tracking, budgeting, reminders, savings goals, and financial analysis using a Next.js frontend, MongoDB database, and Tailwind CSS styling layer.

This architecture is intended to support continuous evolution from an MVP into a more intelligent financial planning product.
