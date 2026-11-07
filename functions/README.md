# Scheduled attendance function

The scheduled function closes every active shift at 7:00 PM Asia/Kolkata and records
`endedBy: system` plus `endReason: automatic_1900_ist`.

Deploy separately only after reviewing the Firebase project and billing plan:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:automaticallyEndActiveShiftsAt1900
```

Cloud Scheduler-backed scheduled functions require a Firebase project on the Blaze
(pay-as-you-go) plan. Review Google Cloud billing and quotas before deployment.
This repository change does not deploy the function or alter production data.
