
import { app, auth, db } from './firebase.js';

import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

import {
  ref, get, onValue, push, set, update, serverTimestamp, query, orderByChild, equalTo
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const $ = id => document.getElementById(id);
const functions = getFunctions(app, 'asia-south1');
const getLoginTeams = httpsCallable(functions, 'getLoginTeams');
const signInWithWorkerId = httpsCallable(functions, 'signInWithWorkerId');

async function loadLoginTeams() {
  const select = $('workerTeam');
  try {
    const { data } = await getLoginTeams();
    select.replaceChildren(new Option('Select assigned team', ''));
    for (const team of data) select.add(new Option(team.name, team.id));
    select.disabled = data.length === 0;
    if (!data.length) $('loginError').textContent = 'No active teams are configured. Contact your administrator.';
  } catch {
    select.replaceChildren(new Option('Teams unavailable', ''));
    select.disabled = true;
    $('loginError').textContent = 'Worker ID sign-in is unavailable until the secure login service is deployed. Existing email sign-in remains available.';
  }
}
$('workerLoginForm').onsubmit = async event => {
  event.preventDefault();
  const button = $('workerSignIn');
  button.disabled = true;
  button.textContent = 'Signing in…';
  $('loginError').textContent = '';
  try {
    await setPersistence(auth, browserLocalPersistence);
    const { data } = await signInWithWorkerId({
      workerId: $('workerId').value.trim(),
      teamId: $('workerTeam').value,
      password: $('workerPassword').value
    });
    $('workerPassword').value = '';
    await signInWithCustomToken(auth, data.customToken);
  } catch (error) {
    $('loginError').textContent = workerLoginError(error.code);
  } finally {
    button.disabled = false;
    button.textContent = 'Secure Login';
  }
};

function workerLoginError(code) {
  if (code === 'functions/resource-exhausted') return 'Too many sign-in attempts. Try again later.';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return 'Sign-in service is temporarily unavailable. Try again shortly.';
  if (code === 'functions/unauthenticated') return 'Worker ID, assigned team, or password is incorrect, or the account is inactive.';
  if (code === 'functions/not-found') return 'Worker ID sign-in is not deployed yet. Use email sign-in or ask your administrator to deploy the secure login service.';
  return 'Worker ID sign-in failed. Check your connection and try again.';
}

let offTasks = () => {};
let offShift = () => {};
let offRequests = () => {};
let offTickets = () => {};
let offAnnouncements = () => {};
let offMessages = () => {};

let userId = null;
let workerShifts = {};
function workDate(ts) {
  if (!Number.isFinite(ts)) return '';
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts));
  const part = type => parts.find(p => p.type === type)?.value || '';
  return part('year')+'-'+part('month')+'-'+part('day');
}
function showDailyAttendance() {
  const day = $('workerHistoryDate').value;
  const box = $('workerHistoryList'); box.replaceChildren();
  const entries = Object.values(workerShifts).filter(s => workDate(s.startedAt) === day).sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
  if (!entries.length) { box.textContent='No attendance records for this date.'; return; }
  const time = ts => Number.isFinite(ts) ? new Date(ts).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}) : '—';
  for (const shift of entries) {
    const row = document.createElement('article'); row.className='task';
    row.textContent='Start: '+time(shift.startedAt)+' · End: '+time(shift.endedAt)+' · '+(shift.status||'Unknown');
    box.append(row);
  }
}
$('workerHistoryDate').value = workDate(Date.now());
$('workerHistoryDate').onchange = showDailyAttendance;

let shiftActive = false;
let activeShiftId = null;
let employeeTasks = [];
const OUTBOX_DB = 'kb-workforce-offline';

function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('actions')) request.result.createObjectStore('actions', { keyPath: 'key' });
      if (!request.result.objectStoreNames.contains('cache')) request.result.createObjectStore('cache', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cacheValue(key, value) {
  const database = await openOutbox();
  return new Promise((resolve, reject) => { const tx=database.transaction('cache','readwrite'); const req=tx.objectStore('cache').put({key,value}); req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error); });
}
async function readCache(key) {
  const database = await openOutbox();
  return new Promise((resolve, reject) => { const tx=database.transaction('cache','readonly'); const req=tx.objectStore('cache').get(key); req.onsuccess=()=>resolve(req.result?.value); req.onerror=()=>reject(req.error); });
}
async function outbox(op, value) {
  const database = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('actions', op === 'getAll' ? 'readonly' : 'readwrite');
    const request = op === 'put' ? tx.objectStore('actions').put(value) : op === 'delete' ? tx.objectStore('actions').delete(value) : tx.objectStore('actions').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function flushOutbox() {
  if (!navigator.onLine || !userId) return;
  try {
    const actions = await outbox('getAll');
    for (const item of actions.filter(action => action.uid === userId)) {
      await set(ref(db, item.path), { ...item.payload, createdAt: serverTimestamp() });
      await outbox('delete', item.key);
    }
    updateConnectionStatus();
  } catch { $('connectionStatus').textContent = 'Online · queued updates remain saved because synchronization failed.'; }
}

$('signIn').onclick = async () => {
  const button = $('signIn');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    $('loginError').textContent = '';
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(
      auth, $('email').value.trim(), $('password').value
    );
  } catch (e) {
    $('loginError').textContent = authErrorMessage(e.code);
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in securely';
  }
};

$('resetPassword').onclick = async () => {
  const email = $('email').value.trim();
  if (!email) {
    $('loginError').textContent = 'Enter your account email first.';
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    $('loginError').textContent = 'If this account is registered, a password reset email has been sent.';
  } catch (e) {
    $('loginError').textContent = authErrorMessage(e.code);
  }
};

$('signOut').onclick = () => signOut(auth);

$('googleSignIn').onclick = async () => {
  const button = $('googleSignIn');
  button.disabled = true;
  try {
    $('loginError').textContent = '';
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    $('loginError').textContent = authErrorMessage(e.code);
  } finally {
    button.disabled = false;
  }
};

function authErrorMessage(code) {
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.';
  if (code === 'auth/user-disabled') return 'This account is deactivated. Contact your administrator.';
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Wait a while and try again.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'auth/operation-not-allowed') return 'This sign-in method is not enabled in Firebase.';
  if (code === 'auth/invalid-api-key' || code === 'auth/app-not-authorized') return 'Firebase sign-in is not configured for this website.';
  return 'Sign-in failed. Check your account and try again.';
}

onAuthStateChanged(auth, async user => {
  offTasks();
  offShift();
  offRequests();
  offTickets();
  offAnnouncements();
  offMessages();
  userId = null;

  if (!user) {
    $('authLoading').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('workspace').classList.add('hidden');
    loadLoginTeams();
    return;
  }

  $('login').classList.add('hidden');
  $('workspace').classList.add('hidden');
  $('authLoading').classList.remove('hidden');
  try {
    let profile;
    try {
      profile = (await get(ref(db, `profiles/${user.uid}`))).val();
      if (profile) await cacheValue(`profile:${user.uid}`, { role: profile.role, name: profile.name || '', team: profile.team || '' });
    } catch (error) {
      if (!navigator.onLine) profile = await readCache(`profile:${user.uid}`);
      else throw error;
    }

    if (!profile) {
      const requestRef = ref(db, `accessRequests/${user.uid}`);
      const existing = await get(requestRef);
      if (!existing.exists()) {
        await set(requestRef, {
          email: user.email || '',
          name: user.displayName || user.email || 'New employee',
          state: 'pending',
          createdAt: serverTimestamp()
        });
      }
      await signOut(auth);
      $('loginError').textContent = existing.val()?.state === 'rejected'
        ? 'Your access request was declined. Please contact your administrator.'
        : 'Access request submitted. An administrator must approve your account.';
      return;
    }

    if (profile.role !== 'employee') {
      await signOut(auth);
      $('loginError').textContent = 'This account is not registered as an employee.';
      return;
    }

    if (profile.active === false || profile.disabled === true || profile.status === 'inactive') {
      await signOut(auth);
      $('loginError').textContent = 'This employee account is deactivated. Contact your administrator.';
      return;
    }

    userId = user.uid;
    $('userName').textContent = profile.name || user.email;

    $('login').classList.add('hidden');
    $('workspace').classList.remove('hidden');

    offShift = onValue(ref(db, `shifts/${userId}`), snap => {
      const shifts = Object.values(snap.val() || {})
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      const shiftData = snap.val() || {};
      workerShifts = shiftData;
      showDailyAttendance();
      cacheValue(`shifts:${userId}`, Object.fromEntries(Object.entries(shiftData).map(([id, shift]) => [id, { status: shift.status, startedAt: shift.startedAt, endedAt: shift.endedAt }]))).catch(() => {});

      const active = Object.entries(shiftData).filter(([, shift]) => shift.status === 'active').sort((a,b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));
      shiftActive = active.length > 0;
      activeShiftId = active[0]?.[0] || null;
      $('startShift').disabled = shiftActive;
      $('endShift').disabled = !shiftActive;

      $('shiftStatus').textContent =
        shiftActive ? 'On duty' : 'Off duty';
    }, async () => {
      const cached = await readCache(`shifts:${userId}`).catch(() => ({}));
      workerShifts = cached || {};
      showDailyAttendance();
      const shifts = Object.values(cached || {}).sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
      shiftActive = shifts.some(shift => shift.status === 'active');
      activeShiftId = null;
      $('startShift').disabled = true;
      $('endShift').disabled = true;
      $('shiftStatus').textContent = `${shiftActive ? 'On duty' : 'Off duty'} · offline copy`;
    });

    offRequests = onValue(
      ref(db, `taskRequests/${userId}`),
      () => renderEmployeeTasks()
    );

    const assignedTasks = query(
      ref(db, 'tasks'), orderByChild('assigneeUid'), equalTo(userId)
    );
    offTasks = onValue(assignedTasks, snap => {
      employeeTasks = Object.entries(snap.val() || {})
        .filter(([, task]) => task.assigneeUid === userId);
      cacheValue(`tasks:${userId}`, employeeTasks.map(([id, task]) => [id, { title: task.title || '', status: task.status || 'Assigned', priority: task.priority || '', dueAt: task.dueAt || null }])).catch(() => {});

      renderEmployeeTasks();
    }, async () => {
      employeeTasks = await readCache(`tasks:${userId}`).catch(() => []) || [];
      renderEmployeeTasks();
      $('connectionStatus').textContent = 'Offline · showing previously synchronized tasks';
    });

    const assignedTickets = query(ref(db, 'tickets'), orderByChild('assignedTo'), equalTo(userId));
    offTickets = onValue(assignedTickets, snap => renderTickets(snap.val() || {}), err => showDbError(err));
    offAnnouncements = onValue(ref(db, 'announcements'), snap => renderAnnouncements(snap.val() || {}), err => showDbError(err));
    offMessages = onValue(ref(db, `messages/${userId}`), snap => renderMessages(snap.val() || {}), err => showDbError(err));
    updateConnectionStatus();
    flushOutbox();

  } catch (e) {
    $('loginError').textContent = e?.code === 'PERMISSION_DENIED'
      ? 'Your account cannot read its employee profile. Contact your administrator.'
      : 'Unable to verify your account. Check your connection and try again.';
    await signOut(auth);
  } finally {
    $('authLoading').classList.add('hidden');
  }
});

$('startShift').onclick = async () => {
  if (!userId || shiftActive) return;

  try {
    $('actionError').textContent = '';

    const location = await getOptionalLocation();
    await set(push(ref(db, `shifts/${userId}`)), {
      status: 'active',
      startedAt: serverTimestamp(),
      endedAt: null,
      ...(location ? { location } : {})
    });

  } catch (e) {
    $('actionError').textContent = 'Could not start shift.';
  }
};

$('endShift').onclick = () => {
  if (!userId || !shiftActive || !activeShiftId) return;
  const button = $('endShift');
  button.disabled = true;
  getOptionalLocation().then(location => update(ref(db, `shifts/${userId}/${activeShiftId}`), {
    status: 'ended',
    endedAt: serverTimestamp(),
    ...(location ? { endLocation: location } : {})
  })).then(() => {
    $('actionError').textContent = '';
  }).catch(() => {
    $('actionError').textContent = 'Could not end shift.';
  }).finally(() => {
    button.disabled = false;
  });
};

function getOptionalLocation() {
  const status = $('gpsStatus');
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      status.textContent = 'GPS unavailable: this browser does not support location services.';
      return resolve(null);
    }
    if (!window.isSecureContext) {
      status.textContent = 'GPS needs a secure HTTPS connection (or localhost).';
      return resolve(null);
    }
    status.textContent = 'Requesting one-time location permission…';
    navigator.geolocation.getCurrentPosition(
      position => {
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Math.round(position.coords.accuracy), capturedAt: Date.now() };
        status.textContent = 'GPS captured · accuracy ±' + location.accuracy + ' m · ' + location.latitude.toFixed(5) + ', ' + location.longitude.toFixed(5);
        return resolve(location);
      },
      error => {
        const message = error.code === 1 ? 'Location permission denied. Allow location access in your browser settings.' :
          error.code === 2 ? 'Your device could not determine a location. Check device location services.' :
          'Location request timed out. Try again where GPS reception is better.';
        status.textContent = message + ' Attendance can continue, but no GPS point was saved.';
        return resolve(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function renderTickets(tickets) {
  const box = $('myTickets'); box.replaceChildren();
  const items = Object.entries(tickets).sort((a,b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  if (!items.length) { box.textContent = 'No tickets assigned to you.'; return; }
  for (const [id, ticket] of items) {
    const row = document.createElement('article'); row.className = 'task';
    const title = document.createElement('strong'); title.textContent = `${ticket.category}: ${ticket.customerName}`;
    const detail = document.createElement('p'); detail.textContent = `${ticket.status} · ${ticket.priority} priority · ${ticket.description}`;
    row.append(title, detail);
    if (ticket.status !== 'Resolved' && ticket.status !== 'Closed') {
      const action = document.createElement('button');
      const start = ticket.status === 'Open' || ticket.status === 'Assigned';
      action.textContent = start ? 'Start work' : 'Mark resolved';
      action.onclick = async () => { action.disabled = true; try { await update(ref(db, `tickets/${id}`), start ? { status: 'In Progress' } : { status: 'Resolved', resolutionNotes: 'Resolved by technician', resolvedAt: serverTimestamp() }); } catch { $('actionError').textContent = 'Could not update ticket.'; } finally { action.disabled = false; } };
      row.append(action);
    }
    box.append(row);
  }
}

$('ticketForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const location = await getOptionalLocation();
    const ticket = {
      customerName: $('ticketCustomer').value.trim(), contact: $('ticketContact').value.trim(), address: $('ticketAddress').value.trim(),
      category: $('ticketCategory').value, description: $('ticketDescription').value.trim(), priority: 'Normal', status: 'Open',
      createdBy: userId, assignedTo: userId, createdAt: serverTimestamp(), ...(location ? { location } : {})
    };
    await set(push(ref(db, 'tickets')), ticket);
    $('ticketForm').reset(); $('taskFeedback').textContent = 'Ticket created.';
  } catch { $('actionError').textContent = 'Could not create ticket. Check database access.'; }
};

function renderAnnouncements(data) {
  const box = $('announcements'); box.replaceChildren();
  const entries = Object.values(data).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!entries.length) { box.textContent = 'No announcements.'; return; }
  for (const item of entries) { const row = document.createElement('article'); row.className = 'task'; const h = document.createElement('strong'); h.textContent = item.title; const p = document.createElement('p'); p.textContent = item.body; row.append(h,p); box.append(row); }
}

function renderMessages(data) {
  const box = $('employeeMessages'); box.replaceChildren();
  const messages = Object.values(data).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!messages.length) {
    const empty = document.createElement('p'); empty.className = 'muted';
    empty.textContent = 'No messages yet. You can contact your administrator here.';
    box.append(empty); return;
  }
  for (const item of messages) {
    const mine = item.senderRole === 'employee';
    const bubble = document.createElement('article');
    bubble.className = 'chat-message' + (mine ? ' mine' : '');
    const meta = document.createElement('div'); meta.className = 'chat-meta';
    const when = typeof item.createdAt === 'number' ? ' · ' + new Date(item.createdAt).toLocaleString('en-IN') : '';
    meta.textContent = (mine ? 'You' : 'Administrator') + when;
    const body = document.createElement('p'); body.textContent = item.text || '';
    bubble.append(meta,body); box.append(bubble);
  }
  box.scrollTop = box.scrollHeight;
}
$('employeeMessageForm').onsubmit = async event => {
  event.preventDefault();
  const message = $('employeeMessageText').value.trim();
  if (!userId || !message) return;
  const button = $('employeeMessageForm').querySelector('button');
  button.disabled = true;
  try {
    await set(push(ref(db, `messages/${userId}`)), { text:message, senderUid:userId, senderRole:'employee', createdAt:serverTimestamp() });
    $('employeeMessageText').value = '';
    $('actionError').textContent = '';
  } catch (error) { showDbError(error); }
  finally { button.disabled = false; }
};

async function updateConnectionStatus() {
  const count = (await outbox('getAll').catch(() => [])).filter(action => action.uid === userId).length;
  $('connectionStatus').textContent = `${navigator.onLine ? 'Online' : 'Offline'} · ${count} pending ${count === 1 ? 'update' : 'updates'}`;
}
addEventListener('online', flushOutbox); addEventListener('offline', updateConnectionStatus);
function showDbError(error) { $('actionError').textContent = error?.code === 'PERMISSION_DENIED' ? 'You do not have permission to view this data.' : 'Connection problem loading data.'; }

function renderEmployeeTasks() {
  const box = $('tasks');
  box.replaceChildren();

  if (!employeeTasks.length) {
    box.textContent = 'No tasks assigned yet.';
    return;
  }

  for (const [id, task] of employeeTasks) {
    const card = document.createElement('article');
    card.className =
      'border rounded-xl p-4 mb-3 bg-slate-50';

    const heading = document.createElement('h4');
    heading.className = 'font-bold text-slate-900';
    heading.textContent = task.title;

    const detail = document.createElement('p');
    detail.className = 'text-xs text-slate-500 mt-1';
    detail.textContent =
      `${task.status || 'Assigned'} · ${task.description || 'No description'}`;

    card.append(heading, detail);

    if (!['Approved', 'Rework Required'].includes(task.status)) {
      const notes = document.createElement('textarea');
      notes.placeholder = 'Work update / completion notes';
      notes.maxLength = 1000;
      notes.className =
        'border rounded-lg p-2 w-full mt-3 text-sm';

      card.append(notes);

      const buttons = document.createElement('div');
      buttons.className = 'flex gap-2 mt-2';

      for (const [label, kind] of [
        ['Start work', 'start'],
        ['Submit completion', 'complete']
      ]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.className =
          'rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold';

        button.onclick = async () => {
          if (kind === 'complete' && !notes.value.trim()) {
            $('taskFeedback').textContent =
              'Add completion notes first.';
            return;
          }

          button.disabled = true;

          try {
            const requestRef = push(ref(db, `taskRequests/${userId}`));
            const location = await getOptionalLocation();
            const requestData = {
              taskId: id,
              kind,
              notes: notes.value.trim(),
              state: 'pending',
              ...(location ? { location } : {})
            };
            if (!navigator.onLine) {
              await outbox('put', { key: requestRef.key, uid: userId, path: `taskRequests/${userId}/${requestRef.key}`, payload: requestData });
              $('taskFeedback').textContent = 'Saved offline. This update is pending synchronization.';
              notes.value = '';
              updateConnectionStatus();
              return;
            }
            await set(requestRef, { ...requestData, createdAt: serverTimestamp() });

            $('taskFeedback').textContent =
              'Update submitted for admin review.';

            notes.value = '';

          } catch (e) {
            $('taskFeedback').textContent =
              'Could not submit update. Check your permissions.';
          } finally {
            button.disabled = false;
          }
        };

        buttons.append(button);
      }

      card.append(buttons);
    }

    box.append(card);
  }
}
