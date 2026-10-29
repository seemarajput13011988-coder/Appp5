# K&B Enterprise OS — implementation plan

This plan intentionally extends the existing K&B Workforce app and Firebase project. It is not permission to replace production data or publish unfinished changes.

## Release approach

- Work on an isolated feature branch and submit changes for review; do not merge or deploy automatically.
- Preserve existing Firebase paths and employee records unless a migration is explicitly designed, reviewed, backed up, and tested.
- Keep the current employee and admin entry points working during each release.
- Separate interface improvements from security-rule changes and data migrations.
- Validate syntax and static checks locally where available; record any Firebase, browser, GPS, or deployment tests that could not be run.

## Audit before implementation

- Confirm which branch and publish directory Netlify deploys.
- Map each page to its JavaScript modules, Firebase paths, Cloud Functions, and security rules.
- Check employee approval transitions, suspended-account handling, and role enforcement.
- Verify that employees can only read or update their own permitted records.
- Identify current schema for profiles, shifts, tasks, tickets, messages, announcements, teams, and audit records.
- Confirm backup and restore options before changing production data.

## Planned modules

1. Shared responsive application shell, accessible forms, consistent loading/empty/error states.
2. Authentication, approval status tracker, account suspension, role and permission enforcement.
3. Employee directory, teams, employee-specific history, and auditable administrative corrections.
4. Attendance with timestamped GPS coordinates, accuracy, permission/error state, and Google Maps views of recorded points. Continuous tracking must be separately designed and tested; last-known points must not be described as live tracking.
5. ISP customers, plans, renewals, installations, tickets, and inventory.
6. Double-entry-aware accounting foundation: chart of accounts, dated journal entries, ledgers, receipts/payments, expenses, salary liabilities, and reports. Financial totals must be derived from validated transactions; avoid silently editing posted entries.
7. Employee messaging, groups, announcements, and notification state.
8. CSV/PDF reports, audit log, backup/restore procedure, and mobile usability.

## Release gates

- Existing admin login and worker login work.
- Pending, approved, rejected, and suspended account flows are tested.
- Security rules are reviewed against employee/admin access cases.
- No destructive schema changes without a migration and backup plan.
- Attendance start/end and GPS-denied cases are tested on a deployed HTTPS preview.
- Financial reports reconcile to underlying transactions and have test fixtures.
- CSV/PDF exports are checked for correct employee separation and encoding.
- Service-worker cache is versioned whenever shell assets change.
- Deployment preview is reviewed before merging or publishing.

## Current verified scope

- The repository has employee and admin portals, Firebase configuration, database rules, and a service worker.
- Branch `repair/admin-portal` has an open, unmerged pull request touching `admin.html`, `admin.js`, `employee.js`, `index.html`, and `sw.js`.
- This document is planning guidance, not proof that any listed module is implemented or tested.
