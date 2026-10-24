# K&B Workforce 2.0 — Phase 1 starter

This is a **working UI/authentication prototype**, not a production workforce tracker. It has responsive employee/admin interfaces, Firebase Authentication for employees and admins, role checks, task assignment/review, shifts, customer tickets, announcements, employee/admin messaging, admin CSV exports, admin audit events, optional foreground GPS readings, offline task-update queuing, and a basic installable PWA shell. Background GPS, payroll, push notifications, and server-generated reports are not included.

## Setup
1. Back up your existing Firebase Realtime Database and deployed HTML files.
2. Enable **Firebase Authentication > Email/Password** in Firebase Console for employees. Employee accounts stay signed in on their device until they sign out.
3. The admin portal uses Firebase email/password authentication and requires `/profiles/<AUTH_UID>/role` to be `admin`. Provision `seemarajput13011988@gmail.com` in Firebase Authentication, then create its role profile through trusted Firebase Console access or a trusted server. Do not put passwords in app code. Use Firebase password reset to set a fresh password; do not reuse a password shared earlier.
4. Employee account creation and role assignment must be done by an administrator in Firebase Console or a trusted server. Using trusted Firebase Console access, create `/profiles/<AUTH_UID>` entries, e.g. `{ "role": "employee", "name": "Technician A", "team": "Team Alpha" }`. **Never allow clients to assign their own roles.**
5. Review `database.rules.json` against your existing database paths. **Do not blindly overwrite production rules:** these rules deny legacy paths and may interrupt your current site. Test in a separate Firebase test project first.
6. Host this folder through Netlify or a local web server (ES modules cannot reliably load from `file://`). The existing Firebase project is configured in `firebase.js`; ensure your deployed domain is in Firebase Authentication authorized domains.
7. Apply and review `database.rules.json` in a Firebase test project before production. Admin database access is granted only to a signed-in UID whose trusted profile role is `admin`. Test employee features with an employee account.
8. Deploy over HTTPS for geolocation and PWA installation. The service worker caches the application shell and Firebase SDK modules after a successful online load. It queues task start/completion requests locally in IndexedDB; queued actions remain pending until sent to Firebase. GPS is requested only during a shift, task, or ticket action and is not background tracking.

## Secure Worker ID sign-in

The employee page now includes a Worker ID sign-in that calls Firebase callable functions; it does not convert Worker IDs into fake email addresses or expose the Worker ID mapping to browsers. To activate it:

1. Set the Firebase project to the Blaze plan. Cloud Functions deployment requires Blaze; it is usage-based, so configure a budget alert before deployment.
2. Install the Firebase CLI, log in, run `npm install --prefix functions`, and deploy with `firebase deploy --only functions` from this folder. During deployment provide `FIREBASE_WEB_API_KEY` using the public web API key already in `firebase.js`.
3. In trusted Firebase Console access, create active `/teams/<teamId>` records with a `name`, and `/workerIdMap/<UPPERCASE_WORKER_ID>` records containing the Firebase UID, team ID, and `active: true`. Ensure each mapped UID has an active employee profile and an enabled Firebase email/password account. The mapping path is client-denied by the rules; the function reads it with Admin SDK privileges.
4. Firebase Functions and database rules are separate deployments. Review and deploy rules with `firebase deploy --only database` before testing the feature.

This repository still has no admin employee invitation/account-creation screen, so worker account provisioning and Worker ID map updates remain trusted setup work. The existing email login remains available during this transition.

## Login architecture note

The repository and the current live site use email/password login and Google sign-in. They do not contain the Worker ID/team selector, language controls, or fingerprint button described in the repair brief. Secure Worker ID login requires a trusted backend mapping from Worker ID to Firebase UID/email; do not add a public Realtime Database mapping or treat a Worker ID as an email. No backend function or Netlify function exists in this repository, so the current login remains Firebase email/password until that mapping service is provisioned.

## Important limitations
- Shift start and end events use server timestamps and database rules restrict edits to the signed-in employee. The starter rules do not enforce unique active shifts; a trusted backend is needed for strong concurrency guarantees.
- Starting a shift records a server timestamp, but this prototype does not prevent multiple active shifts. Implement server-side uniqueness and business-hours enforcement before real attendance use.
- Browser location tracking is NOT implemented; reliable Android background tracking requires a native app and explicit employee consent.
- The role checks in UI are supplemental; database rules provide authorization. For production, use server-managed custom claims and trusted backend validation, plus rate limits, audit trails, and stronger input validation.
- Admin audit entries are client initiated and protected from edit/delete by the deployed Realtime Database rules. For high assurance auditability, move event creation to a trusted Cloud Function or server.
- The ticket module is a basic queue and status workflow; it does not yet include attachments, SLA timers, customer-facing updates, saved filters, or full reassignment history.
- Offline support is limited to cached non-customer task summaries and queued task start/completion requests. Tickets, messaging, announcements, and shifts require a connection.
- GPS coordinates are optional device readings with browser-reported accuracy, not proof of presence. No map display or background tracking is implemented.
- Firebase web config is not a password. Do not embed service account credentials in these files.
- This is a new data model (`profiles`, `tasks`, `shifts`) and does not automatically migrate old `workers`/`attendance` data.
- Tailwind CDN is used for ease of preview; bundle Tailwind for production.
