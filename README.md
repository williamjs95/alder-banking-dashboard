# Alder

A business banking dashboard, built as a technical case study for Post Oak Group. It takes its cues from Mercury and Slash, with its own design, data model and implementation.

**Live demo:** _add the deployed URL here_

Open it and you are looking at the accounts of a fictional company, Brightline Labs, Inc. There is no sign-in. Each visitor gets a private copy of the company, seeded with a year of realistic activity, and everything you do to it (send a payment, freeze a card, add a note) is stored in Postgres and is still there when you come back.

## What you can do

| Area             | What works                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**     | Total cash position with a balance history chart (30 days, 90 days, 1 year), balances per account, money in and out against the previous 30 days, net cash flow, burn and runway, a monthly cash flow chart, spend by category, recent transactions and upcoming payments.                                                                          |
| **Transactions** | Search by name, reference, note or exact amount. Filter by date range, account, direction, category, status and amount. Sort, paginate, and export the filtered view as CSV. Every filter lives in the URL, so a view can be bookmarked or shared. Open any transaction to see its status timeline and details, change its category, or add a note. |
| **Accounts**     | Checking, savings and treasury accounts, each with its own balance history, 30-day flow and recent activity. Account and routing numbers stay masked until you ask for them.                                                                                                                                                                        |
| **Payments**     | Send money to a recipient by ACH or wire, now or on a future date, through a form, review and confirmation flow. Transfer instantly between your own accounts. Add recipients. Balances update immediately, and a payment larger than the balance is refused.                                                                                       |
| **Cards**        | Spend against each card's monthly limit, freeze and unfreeze, change limits, issue a virtual card, and jump to a card's transactions.                                                                                                                                                                                                               |
| **Insights**     | Spend by category over six months, top payees, and what changed against the previous 30 days.                                                                                                                                                                                                                                                       |
| **Everywhere**   | A command palette (⌘K or Ctrl+K) for navigation, actions and transaction search. Light and dark themes. A layout that works from phone to desktop. "Reset demo data" in the account menu puts everything back.                                                                                                                                      |

## Run it locally

```bash
yarn install
yarn dev
```

That is all. With no `DATABASE_URL` set, the app runs on [PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly, stored in `.data/`. The schema is created and the demo company is seeded on first load. Requires Node 22 or newer.

To use a Postgres server instead, copy `.env.example` to `.env.local`, set `DATABASE_URL`, and run `yarn db:migrate`.

| Command                                | What it does                                             |
| -------------------------------------- | -------------------------------------------------------- |
| `yarn dev`                             | Development server on port 3000                          |
| `yarn build` / `yarn start`            | Production build and server                              |
| `yarn eslint`                          | Lint                                                     |
| `yarn typecheck`                       | Type-check the app, tests and tooling                    |
| `yarn test` / `yarn test:coverage`     | Unit and integration tests (Vitest), with coverage       |
| `yarn e2e`                             | End-to-end tests (Playwright) against a production build |
| `yarn db:generate` / `yarn db:migrate` | Create a migration from the schema / apply migrations    |

## Technology

| Concern     | Choice                                                                    | Why                                                                                                                                |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Framework   | Next.js 16 (App Router), React 19, TypeScript in strict mode              | One codebase for UI and API. Partial prerendering sends the page shell immediately and streams the data in.                        |
| Database    | Postgres via Drizzle ORM. Neon in production, PGlite locally and in tests | Typed queries and SQL migrations. The same dialect everywhere, so tests run against a real Postgres without Docker.                |
| API         | Route handlers under `/api`, validated with Zod                           | The request schemas are shared with the client's forms, so both sides enforce the same rules.                                      |
| Client data | TanStack Query                                                            | Server-rendered data is handed to the client cache, so the first paint is complete and later interactions fetch only what changed. |
| UI          | Tailwind CSS 4, shadcn/ui on Radix primitives, Lucide icons               | Accessible building blocks with full control over the design.                                                                      |
| Charts      | Recharts                                                                  | Composable SVG charts that read their colors from the theme's CSS variables.                                                       |
| Forms       | React Hook Form with Zod resolvers                                        | Validation messages come from the same schemas the API uses.                                                                       |
| Tests       | Vitest and Testing Library, Playwright                                    | Fast unit and integration tests, plus real-browser tests of whole flows.                                                           |

## How it is built

```
src/
  proxy.ts            Assigns each visitor an anonymous workspace cookie
  app/
    (dashboard)/      Pages: thin Server Components that load data and hand it to a view
    api/              REST route handlers: parse, call a service, respond
  server/
    db/               Schema and the database client (Postgres or PGlite)
    seed/             Deterministic generator for the demo company
    services/         Business logic: accounts, transactions, payments, cards, analytics
    http/             Request wrapper, typed errors, error-to-response mapping
  features/           One folder per product area: its views, dialogs and hooks
  components/         Layout shell, shared components, charts, vendored UI primitives
  lib/                Domain vocabulary, API contracts, money, dates, query definitions
drizzle/              SQL migrations
e2e/                  Playwright specs
```

A request flows one way: route handler or page → service → database. Services take the database handle, the workspace id and the current time as arguments, which keeps them free of framework imports and easy to test.

### Decisions worth explaining

**Every visitor gets their own tenant.** A cookie holds a random workspace id, and every table row belongs to a workspace. Every query filters by it, so one visitor can never read or change another's data, which the tests check directly. This is what lets a public demo have real, persistent writes without sign-in. Workspaces older than seven days are deleted to keep the database small.

**Money is integer cents, everywhere.** The database stores `bigint` cents, the API sends integers, and formatting happens only at the edge of the UI. There is no floating-point arithmetic on money.

**Moving money is atomic and safe to retry.** A payment or transfer runs in one database transaction: the balance update and the ledger rows either all happen or none do. The balance check is part of the `UPDATE` statement itself, so two concurrent payments cannot both spend the same funds. The client sends an `Idempotency-Key` with each submission. Replaying a key with the same request returns the original result instead of paying twice, and reusing a key for a different request is refused.

**Charts reconcile with the ledger.** Balance history is not stored. It is derived by walking back from the current balance through each day's net movement, so the chart cannot drift from the transactions. Aggregations run in SQL.

**Filters live in the URL.** The transactions page reads its state from the query string and writes changes with the History API. A filtered view survives a reload, the back button works, and links from other pages (a spend category, a card, a payee) are just URLs.

**Every chart has a table.** Each chart card can switch to a table of the same numbers, so no value depends on hovering or on telling colors apart. The five series colors were checked with a color-vision-deficiency validator against the exact card backgrounds of both themes. Status is always an icon and a word, never color alone.

**Sensitive numbers are fetched on demand.** Lists return only the last four digits of an account number. The full number is a separate request made when you click "Show numbers", sent with `Cache-Control: no-store`. CSV export escapes text that a spreadsheet would run as a formula.

## Testing

| Suite                         | Scope                                                                                                                                                                                                                                                                                                                  | Result                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unit and integration (Vitest) | Services against an in-memory Postgres, API route handlers, Zod contracts, utilities, and every component and view                                                                                                                                                                                                     | 1,569 tests in 98 files. 100% of statements, branches, functions and lines                     |
| End-to-end (Playwright)       | 67 tests in a real browser against a production build: payments, transfers, scheduling, filters, sorting, export, cards, account numbers, themes, the command palette, mobile layout, tenant isolation, demo reset, what happens when the server fails, and an automated WCAG 2.1 AA scan of every page in both themes | 96% of lines, 95% of statements, 91% of functions and 83% of branches of the app's client code |

The unit coverage threshold is 100% and is enforced by `yarn test:coverage`. Three kinds of file are excluded from it, and covered by the end-to-end suite instead: the vendored shadcn/ui primitives in `src/components/ui`, the thin Server Component files (`page.tsx`, `layout.tsx`, error and not-found pages), and the two framework entry points (`proxy.ts` and `server/session.ts`).

End-to-end coverage is measured in the browser and mapped back to source files, so it covers client code only. Each test runs in a fresh browser context, which means a fresh workspace, so tests are independent and run in parallel.

## Deploying

The app is set up for Vercel with a Neon Postgres database.

1. Import the repository in Vercel.
2. In the project's Storage tab, add a Neon Postgres database. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Deploy. Vercel runs the `vercel-build` script, which applies migrations and then builds.

In production the app returns an error instead of data when `DATABASE_URL` is missing, rather than silently falling back to a database that would not persist.

## AI tools

This project was built with [Claude Code](https://claude.com/claude-code), Anthropic's coding agent, working from the brief.

- **Planning first.** The work started in plan mode: the agent proposed the scope, architecture and verification approach, and I chose between options on the questions that mattered (how deep the backend should go, whether to include an AI feature, how to ship) before any code was written.
- **Reading before writing.** Next.js 16 changed caching and rendering substantially, so the agent read the documentation bundled with the installed version instead of relying on what it remembered, and built to the new model (partial prerendering, request-time data behind Suspense).
- **Verification in the loop.** Each stage was checked before moving on: type-check, lint and a production build, screenshots of every page in light, dark and mobile layouts, and the end-to-end suite. That loop caught real problems, including a constant imported from a client module into a server page, which arrives as a reference instead of a value and broke the Payments page.
- **Parallel agents for tests.** Once the application code was stable, three sub-agents wrote unit tests in parallel (server and API, shared library and components, feature views) against a shared brief, fixtures and rules, while the main session wrote the end-to-end suite. Writing those tests surfaced real defects, which were then fixed: a malformed cookie caused a server error instead of a clean rejection, a long digit string in search overflowed a database comparison, and a failed list load looked the same as an empty list.
- **Automated accessibility checks.** An axe scan of every page found that the accent color fell just short of the contrast requirement when used for text, which led to a separate, darker text color.
- **Guidance for charts.** A data-visualization skill supplied the chart rules used here: choose the form before the color, one hue for magnitude, a validated categorical palette, and a table view for every chart.

## What I would do next

- Real authentication and roles (admin, bookkeeper, cardholder), replacing the anonymous workspace cookie.
- A background worker to settle pending payments and send scheduled ones on their date. Today those statuses are stored and displayed but do not advance on their own.
- Approval rules for large payments, and an audit log of who did what.
- Cursor-based pagination for the ledger once a workspace has far more than a year of history.
- Receipt attachments on transactions, and an accounting export.
