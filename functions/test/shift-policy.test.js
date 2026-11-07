import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAutomaticShiftEndUpdates } from '../shift-policy.js';

test('ends active shifts and preserves existing shift fields', () => {
  const updates = collectAutomaticShiftEndUpdates({
    employeeA: {
      shift1: { status: 'active', startedAt: 1000, location: { latitude: 1 } },
      shift2: { status: 'ended', startedAt: 500, endedAt: 900 }
    }
  }, 2000);
  assert.deepEqual(updates, {
    'shifts/employeeA/shift1/status': 'ended',
    'shifts/employeeA/shift1/endedAt': 2000,
    'shifts/employeeA/shift1/endedBy': 'system',
    'shifts/employeeA/shift1/endReason': 'automatic_1900_ist'
  });
});

test('ignores future-dated and malformed active shifts', () => {
  const updates = collectAutomaticShiftEndUpdates({
    employeeA: {
      future: { status: 'active', startedAt: 3000 },
      invalid: { status: 'active', startedAt: 'unknown' },
      inactive: { status: 'ended', startedAt: 1000 }
    }
  }, 2000);
  assert.deepEqual(updates, {});
});

test('rejects invalid closure timestamps', () => {
  assert.throws(() => collectAutomaticShiftEndUpdates({}, NaN), /positive finite timestamp/);
});
