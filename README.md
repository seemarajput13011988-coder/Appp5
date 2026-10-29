# K&B Enterprise OS

K&B NET SERVICE's employee and admin workspace. The current application uses Firebase Authentication and Realtime Database; employee and administrator access is still controlled by the Firebase profile and database rules.

## Run the web app locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`. The root URL opens the employee workspace; `/admin.html` opens the admin command center; `/app.html` is the shared workspace launcher.

## Build the Android APK (direct installation)

The repository includes a GitHub Actions workflow named **Build Android APK**. On the `enterprise-os/foundation` branch, open **Actions → Build Android APK → Run workflow**. When it succeeds, download the `kb-enterprise-os-android-debug-apk` artifact and extract the APK.

This is a debug APK for controlled testing and direct sideloading, not a Play Store release. Android may ask each worker to allow installation from the app used to open the APK. Keep APK distribution private to authorized workers. A signed release build, Android location-permission verification, and real-device testing are still required before relying on it for official attendance.

## Build the Windows desktop app

The **Build Windows Desktop App** workflow packages a portable Windows x64 executable. Run it from **Actions** and download the `kb-enterprise-os-windows-portable` artifact after a successful build.

For local desktop development:

```bash
npm run desktop:dev
```

## Admin modules added on the foundation branch

- **Customer CRM:** add and edit ISP customer contact, address, plan and status records; export the directory to CSV.
- **Finance ledger:** record income and expenses in paise, show totals from recorded entries, and export the ledger to CSV. It is not yet a full double-entry accounting system or audited P&L.
- **Inventory:** maintain stock items, SKU codes, quantities and low-stock thresholds; adjust stock and export to CSV.
- **Employee requests:** employees can submit leave, expense reimbursement, or salary-advance requests; admins can approve/decline with a recorded review and audit event.
- The new modules require the matching rules in `database.rules.json` to be reviewed and manually deployed to Firebase before the screens can read or write those records. Do not replace production rules without a backup and test project.

## Important current limitations

- Android and desktop packaging wrap the existing app; they do not magically add missing business modules.
- Firebase remains the shared online backend. Offline screens may show cached data, but queued operations are not a guarantee of full offline operation.
- Before operational use, verify Firebase authorized domains, security rules, administrator access, GPS permissions, and all login flows with test accounts.
- Do not deploy database rules or overwrite production records without a reviewed backup and a separate validation step.
- The Android workflow currently produces a debug APK for testing. No signed release key is stored in this repository.
