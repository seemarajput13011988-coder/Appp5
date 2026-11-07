import { initializeApp, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { collectAutomaticShiftEndUpdates } from './shift-policy.js';

if (getApps().length === 0) initializeApp();

export const automaticallyEndActiveShiftsAt1900 = onSchedule({
  schedule: '0 19 * * *',
  timeZone: 'Asia/Kolkata',
  region: 'asia-south1',
  retryCount: 2
}, async () => {
  const database = getDatabase();
  const snapshot = await database.ref('shifts').get();
  const updates = collectAutomaticShiftEndUpdates(snapshot.val() || {}, Date.now());
  const paths = Object.keys(updates);
  if (paths.length === 0) {
    logger.info('Automatic 7 PM shift closure: no active shifts found.');
    return;
  }

  await database.ref().update(updates);
  logger.info('Automatically ended active shifts at 7 PM India time.', {
    endedShiftCount: paths.filter(path => path.endsWith('/status')).length
  });
});
