export function collectAutomaticShiftEndUpdates(shifts, endedAt) {
  const timestamp = Number(endedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new TypeError('endedAt must be a positive finite timestamp');
  }

  const updates = {};
  for (const [uid, records] of Object.entries(shifts || {})) {
    if (!records || typeof records !== 'object') continue;
    for (const [shiftId, shift] of Object.entries(records)) {
      if (!shift || shift.status !== 'active') continue;
      const startedAt = Number(shift.startedAt);
      if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > timestamp) continue;

      const base = `shifts/${uid}/${shiftId}`;
      updates[base + '/status'] = 'ended';
      updates[base + '/endedAt'] = timestamp;
      updates[base + '/endedBy'] = 'system';
      updates[base + '/endReason'] = 'automatic_1900_ist';
    }
  }
  return updates;
}
