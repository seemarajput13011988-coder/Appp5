
import { auth, db } from './firebase.js';

import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

import {
  ref, get, onValue, push, set, update, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const $ = id => document.getElementById(id);

let unsub = [];
let employees = {};
let tasksCache = {};
let requestsCache = {};
let accessCache = {};
let ticketCache = {};
let announcementCache = {};
let auditCache = {};
let shiftCache = {};
let correctionCache = {};
let offSelectedMessages = () => {};
$('signIn').onclick = async () => {
  const button = $('signIn');
  button.disabled = true;
  $('loginError').textContent = '';
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
  } catch (e) {
    $('loginError').textContent = authErrorMessage(e.code);
  } finally {
    button.disabled = false;
  }
};

$('passwordReset').onclick = async () => {
  const email = $('email').value.trim();
  if (!email) {
    $('loginError').textContent = 'Enter your admin email first.';
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

function authErrorMessage(code) {
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.';
  if (code === 'auth/user-disabled') return 'This account is disabled. Contact an administrator.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a while and try again.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'auth/operation-not-allowed') return 'Email/password sign-in is not enabled in Firebase.';
  return 'Sign-in failed. Check your account and Firebase configuration.';
}

for (const button of document.querySelectorAll('.nav')) {
  button.onclick = () => {
    const page = button.dataset.page;

    document.querySelectorAll('.page').forEach(el => {
      el.classList.toggle('hidden', el.id !== page);
    });

    document.querySelectorAll('.nav').forEach(el => {
      el.classList.toggle('bg-indigo-600', el === button);
      if (el === button) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });

    $('pageTitle').textContent =
      button.dataset.title || (page[0].toUpperCase() + page.slice(1));
  };
}

function makeRow(text) {
  const el = document.createElement('div');
  el.className = 'border-b py-3';
  el.textContent = text;
  return el;
}

function filterEmployeeDirectory() {
  const search = ($('employeeSearch')?.value || '').trim().toLowerCase();
  const status = $('employeeStatusFilter')?.value || 'all';
  const cards = [...($('employeeList')?.querySelectorAll('article') || [])];
  let visible = 0;
  for (const card of cards) {
    const matchesText = !search || (card.dataset.search || '').includes(search);
    const matchesStatus = status === 'all' || card.dataset.status === status;
    card.hidden = !(matchesText && matchesStatus);
    if (!card.hidden) visible++;
  }
  const summary = $('employeeFilterSummary');
  if (summary) summary.textContent = visible + ' of ' + cards.length + ' employee record' + (cards.length === 1 ? '' : 's');
}
$('employeeSearch')?.addEventListener('input', filterEmployeeDirectory);
$('employeeStatusFilter')?.addEventListener('change', filterEmployeeDirectory);

async function loadDashboardData(user) {
  unsub.forEach(fn => fn());
  unsub = [];

  try {
    unsub.push(onValue(ref(db, 'profiles'), snap => {
      employees = Object.fromEntries(
        Object.entries(snap.val() || {})
          .filter(([, p]) => p.role === 'employee')
      );

      $('employeeCount').textContent = Object.values(employees).filter(p => p.active !== false && p.status !== 'archived' && p.status !== 'inactive').length;

      $('employeeList').replaceChildren();
      $('assignee').replaceChildren(
        new Option('Select employee', '')
      );
      $('adminTicketAssignee').replaceChildren(new Option('Assign employee', ''));
      $('messageEmployee').replaceChildren(new Option('Select employee', ''));
      const recordSelection = $('recordEmployee').value;
      $('recordEmployee').replaceChildren(new Option('Select worker', ''));
      $('attendanceCorrectionEmployee').replaceChildren(new Option('Select employee', ''));


      for (const [uid, profile] of Object.entries(employees)) {
        const isActive = profile.active !== false && profile.status !== 'archived' && profile.status !== 'inactive';
        const card = document.createElement('article');
        card.className = 'border-b py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';
        card.dataset.search = [profile.name || '', profile.email || '', profile.team || '', uid, profile.status || '', isActive ? 'active' : 'inactive suspended archived'].join(' ').toLowerCase();
        card.dataset.status = isActive ? 'active' : 'inactive';
        const details = document.createElement('div');
        details.className = 'min-w-0';
        const name = document.createElement('strong');
        name.className = 'block';
        name.textContent = profile.name || uid;
        const meta = document.createElement('p');
        meta.className = 'text-xs text-slate-500 mt-1';
        meta.textContent = (profile.team || 'Unassigned') + ' · ' + (isActive ? 'Active' : 'Suspended / archived') + ' · ' + (profile.email || uid);
        details.append(name, meta);
        const actions = document.createElement('div');
        actions.className = 'flex flex-wrap gap-2';
        const statusButton = document.createElement('button');
        statusButton.type = 'button';
        statusButton.className = 'rounded-lg border px-3 py-2 text-xs font-semibold';
        statusButton.textContent = profile.status === 'archived' ? 'Restore' : isActive ? 'Suspend' : 'Reactivate';
        statusButton.onclick = async () => {
          if (!auth.currentUser) return;
          const operation = profile.status === 'archived' ? 'Restore' : isActive ? 'Suspend' : 'Reactivate';
          if (!confirm(operation + ' ' + (profile.name || uid) + '?')) return;
          statusButton.disabled = true;
          try {
            await update(ref(db, 'profiles/' + uid), {
              active: !isActive,
              status: isActive ? 'inactive' : 'active',
              updatedAt: serverTimestamp(),
              updatedBy: auth.currentUser.uid
            });
            await writeAudit(profile.status === 'archived' ? 'employee.restored' : isActive ? 'employee.suspended' : 'employee.reactivated', uid);
          } catch {
            $('actionError').textContent = 'Employee status could not be changed. Check Firebase rules.';
          } finally {
            statusButton.disabled = false;
          }
        };
        const archiveButton = document.createElement('button');
        archiveButton.type = 'button';
        archiveButton.className = 'rounded-lg border px-3 py-2 text-xs font-semibold text-rose-700';
        archiveButton.textContent = 'Archive';
        archiveButton.disabled = profile.status === 'archived';
        archiveButton.onclick = async () => {
          if (!auth.currentUser || profile.status === 'archived') return;
          if (!confirm('Archive ' + (profile.name || uid) + '? This disables app access but preserves historical records.')) return;
          archiveButton.disabled = true;
          try {
            await update(ref(db, 'profiles/' + uid), {
              active: false,
              status: 'archived',
              archivedAt: serverTimestamp(),
              archivedBy: auth.currentUser.uid
            });
            await writeAudit('employee.archived', uid);
          } catch {
            $('actionError').textContent = 'Employee could not be archived. Check Firebase rules.';
            archiveButton.disabled = false;
          }
        };
        actions.append(statusButton, archiveButton);
        card.append(details, actions);
        $('employeeList').append(card);

        if (isActive) {
          $('assignee').add(new Option(profile.name || uid, uid));
          $('adminTicketAssignee').add(new Option(profile.name || uid, uid));
          $('messageEmployee').add(new Option(profile.name || uid, uid));
          $('attendanceCorrectionEmployee').add(new Option(profile.name || uid, uid));
        }
        $('recordEmployee').add(new Option((isActive ? '' : '[Inactive] ') + (profile.name || uid), uid));
      }

      filterEmployeeDirectory();
      if (employees[recordSelection]) $('recordEmployee').value = recordSelection;
      renderWorkerRecords();
      renderTaskReviews();
      renderTeamManagement();
      renderGpsLocations();
      renderAttendanceCorrections();
    }, error => databaseError(error, 'employee profiles')));

    unsub.push(onValue(ref(db, 'tasks'), snap => {
      tasksCache = snap.val() || {};
      $('taskCount').textContent =
        Object.keys(tasksCache).length;
      renderTaskReviews();
      renderWorkerRecords();
    }, error => databaseError(error, 'tasks')));

    unsub.push(onValue(ref(db, 'taskRequests'), snap => {
      requestsCache = snap.val() || {};
      renderTaskReviews();
    }, error => databaseError(error, 'task requests')));

    unsub.push(onValue(ref(db, 'accessRequests'), snap => {
      accessCache = snap.val() || {};
      renderAccessRequests();
    }, error => databaseError(error, 'access requests')));

    unsub.push(onValue(ref(db, 'tickets'), snap => { ticketCache = snap.val() || {}; $('ticketCount').textContent = Object.keys(ticketCache).length; renderTickets(); renderWorkerRecords(); }, databaseError));
    unsub.push(onValue(ref(db, 'announcements'), snap => { announcementCache = snap.val() || {}; renderAnnouncementList(); }, databaseError));
    unsub.push(onValue(ref(db, 'auditLogs'), snap => { auditCache = snap.val() || {}; renderAudit(); }, databaseError));

    unsub.push(onValue(ref(db, 'shifts'), snap => {
      shiftCache = snap.val() || {};
      let active = 0;
      const rows = [];

      for (const [uid, records] of Object.entries(shiftCache)) {
        for (const [id, shift] of Object.entries(records || {})) {
          if (shift.status === 'active') active++;

          const date = shift.startedAt
            ? new Date(shift.startedAt).toLocaleString(
                'en-IN', { timeZone: 'Asia/Kolkata' }
              )
            : 'Pending';

          const gps = shift.location && Number.isFinite(shift.location.latitude) && Number.isFinite(shift.location.longitude) ? ` · GPS ${shift.location.latitude.toFixed(5)}, ${shift.location.longitude.toFixed(5)} ±${shift.location.accuracy}m` : '';
          const endGps = shift.endLocation && Number.isFinite(shift.endLocation.latitude) && Number.isFinite(shift.endLocation.longitude) ? ` · End GPS ${shift.endLocation.latitude.toFixed(5)}, ${shift.endLocation.longitude.toFixed(5)} ±${shift.endLocation.accuracy}m` : '';
          rows.push(makeRow(`${employees[uid]?.name || uid} · ${shift.status} · ${date}${gps}${endGps}`));
        }
      }

      $('activeCount').textContent = active;
      $('attendanceList').replaceChildren(...rows);
      renderGpsLocations();
      renderWorkerRecords();
    }, error => databaseError(error, 'attendance / shifts')));
    unsub.push(onValue(ref(db, 'attendanceCorrections'), snap => {
      correctionCache = snap.val() || {};
      renderAttendanceCorrections();
    }, error => databaseError(error, 'attendance corrections')));

  } catch (e) {
    $('actionError').textContent =
      'Unable to load admin data. Check Firebase database rules and connectivity.';
  }
}

onAuthStateChanged(auth, async user => {
  unsub.forEach(fn => fn());
  unsub = [];
  if (!user) {
    document.querySelectorAll('#dashboard form').forEach(form => form.reset());
    $('login').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    return;
  }
  try {
    const profileSnapshot = await get(ref(db, `profiles/${user.uid}`));
    if (!profileSnapshot.exists()) {
      await signOut(auth);
      $('loginError').textContent = 'Your Firebase Authentication account signed in, but its database profile is missing. In Firebase Console, find your own account under Authentication > Users and confirm a matching profiles/<UID> record exists with role set to "admin".';
      return;
    }
    const profile = profileSnapshot.val();
    if (profile?.role !== 'admin' || profile?.active === false || profile?.disabled === true) {
      await signOut(auth);
      $('loginError').textContent = 'Your database profile exists, but admin access is not enabled. Confirm role is "admin" and the profile is active for your own administrator account.';
      return;
    }
    $('login').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('adminEmail').textContent = user.email || 'Administrator';
    await loadDashboardData(user);
  } catch (e) {
    const code = String(e?.code || 'unknown').replace(/^database\//, '');
    await signOut(auth);
    if (code.toUpperCase().includes('PERMISSION_DENIED')) {
      $('loginError').textContent = 'Firebase denied access to your admin profile. Confirm that your signed-in account has a profiles/<UID> record with role set to "admin", and that the deployed database rules allow users to read their own profile.';
    } else if (code.toUpperCase().includes('NETWORK')) {
      $('loginError').textContent = 'Could not reach Firebase to verify admin access. Check your internet connection and Firebase project status.';
    } else {
      $('loginError').textContent = 'Unable to verify admin access (' + code + '). Check the admin profile record, deployed database rules, and Firebase connectivity.';
    }
  }
});



function renderAttendanceCorrections() {
  const box = $('attendanceCorrectionList');
  if (!box) return;
  box.replaceChildren();
  const entries = [];
  for (const [uid, records] of Object.entries(correctionCache || {})) {
    for (const [id, record] of Object.entries(records || {})) entries.push({uid,id,record});
  }
  entries.sort((a,b) => (b.record.createdAt || 0) - (a.record.createdAt || 0));
  if (!entries.length) { box.textContent = 'No attendance corrections have been recorded.'; return; }
  for (const item of entries) {
    const card = document.createElement('article');
    card.className = 'border-b py-3';
    const title = document.createElement('strong');
    title.textContent = (employees[item.uid]?.name || item.uid) + ' · ' + item.record.workDate;
    const times = document.createElement('p');
    times.className = 'text-sm text-slate-600 mt-1';
    times.textContent = 'Corrected start: ' + (item.record.correctedStart || 'unchanged') + ' · Corrected end: ' + (item.record.correctedEnd || 'unchanged');
    const reason = document.createElement('p');
    reason.className = 'text-sm mt-1';
    reason.textContent = 'Reason: ' + item.record.reason + ' · Recorded by ' + (employees[item.record.createdBy]?.name || item.record.createdBy || 'admin');
    card.append(title,times,reason);
    box.append(card);
  }
}
$('attendanceCorrectionDate').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
$('attendanceCorrectionForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!user) return;
  const uid = $('attendanceCorrectionEmployee').value;
  const workDate = $('attendanceCorrectionDate').value;
  const correctedStart = $('attendanceCorrectionStart').value;
  const correctedEnd = $('attendanceCorrectionEnd').value;
  const reason = $('attendanceCorrectionReason').value.trim();
  if (!uid || !workDate || (!correctedStart && !correctedEnd) || !reason) {
    $('attendanceCorrectionFeedback').textContent = 'Choose an employee and date, enter at least one corrected time, and explain the reason.';
    return;
  }
  const button = $('attendanceCorrectionForm').querySelector('button[type="submit"], button:not([type])');
  if (button) button.disabled = true;
  try {
    await set(push(ref(db, 'attendanceCorrections/' + uid)), {
      workDate, correctedStart, correctedEnd, reason,
      createdAt: serverTimestamp(), createdBy: user.uid
    });
    await writeAudit('attendance.correction_recorded', uid + '/' + workDate);
    $('attendanceCorrectionForm').reset();
    $('attendanceCorrectionDate').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    $('attendanceCorrectionFeedback').textContent = 'Correction recorded separately. The original shift event remains unchanged.';
    $('actionError').textContent = '';
  } catch {
    $('attendanceCorrectionFeedback').textContent = 'Could not save correction. Verify the attendanceCorrections rules.';
  } finally {
    if (button) button.disabled = false;
  }
});

function renderGpsLocations() {
  const box = $('gpsMapList');
  if (!box) return;
  box.replaceChildren();
  const locations = [];
  for (const [uid, records] of Object.entries(shiftCache)) {
    for (const [shiftId, shift] of Object.entries(records || {})) {
      for (const [kind, location] of [['Shift start', shift.location], ['Shift end', shift.endLocation]]) {
        if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
        locations.push({
          uid, shiftId, kind, location,
          name: employees[uid]?.name || uid,
          team: employees[uid]?.team || 'Unassigned',
          timestamp: kind === 'Shift start' ? shift.startedAt : shift.endedAt
        });
      }
    }
  }
  locations.sort((a,b) => (b.location.capturedAt || b.timestamp || 0) - (a.location.capturedAt || a.timestamp || 0));
  $('gpsMapSummary').textContent = locations.length
    ? locations.length + ' recorded GPS point' + (locations.length === 1 ? '' : 's') + ' · newest first'
    : 'No GPS points recorded yet. Workers must allow location access during a shift action.';
  if (!locations.length) {
    const empty = document.createElement('p');
    empty.className = 'muted mt-3';
    empty.textContent = 'No location data available.';
    box.append(empty);
    return;
  }
  for (const item of locations) {
    const lat = item.location.latitude, lon = item.location.longitude;
    const card = document.createElement('article');
    card.className = 'gps-card';
    const title = document.createElement('h3');
    title.className = 'font-bold';
    title.textContent = item.name + ' · ' + item.kind;
    const team = document.createElement('p');
    team.className = 'muted text-sm mt-1';
    team.textContent = 'Team: ' + item.team;
    const pill = document.createElement('span');
    pill.className = 'gps-pill';
    pill.textContent = item.location.accuracy ? 'Accuracy ±' + Math.round(item.location.accuracy) + ' m' : 'Accuracy not reported';
    const time = document.createElement('p');
    time.className = 'muted text-sm mt-2';
    const timestamp = item.location.capturedAt || item.timestamp;
    time.textContent = 'Recorded: ' + (timestamp ? new Date(timestamp).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : 'time unavailable');
    const coordinates = document.createElement('p');
    coordinates.className = 'text-sm mt-2';
    coordinates.textContent = lat.toFixed(6) + ', ' + lon.toFixed(6);
    const link = document.createElement('a');
    link.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lon);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in Google Maps';
    const map = document.createElement('iframe');
    map.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(lat + ',' + lon) + '&z=16&output=embed';
    map.loading = 'lazy';
    map.title = 'Recorded location for ' + item.name;
    map.referrerPolicy = 'no-referrer';
    card.append(title,team,pill,time,coordinates,link,map);
    box.append(card);
  }
}


function indiaDate(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
  const get = type => parts.find(part => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}
function workerRecordCard(title, items, format) {
  const article = document.createElement('article');
  const heading = document.createElement('h3'); heading.textContent = title + ' (' + items.length + ')';
  article.append(heading);
  if (!items.length) { const empty = document.createElement('p'); empty.className='muted'; empty.textContent='No records for this date.'; article.append(empty); }
  for (const item of items) { const row = document.createElement('p'); row.textContent = format(item); article.append(row); }
  return article;
}
function renderWorkerRecords() {
  const uid = $('recordEmployee')?.value;
  const day = $('recordDate')?.value;
  const summary = $('workerRecordSummary'), details = $('workerRecordDetails');
  if (!summary || !details) return;
  details.replaceChildren();
  if (!uid || !employees[uid]) { summary.textContent = 'Select a worker to view individual records.'; return; }
  if (!day) { summary.textContent = 'Choose a work date.'; return; }
  const profile = employees[uid];
  const shifts = Object.values(shiftCache[uid] || {}).filter(s => indiaDate(s.startedAt) === day);
  const tasks = Object.values(tasksCache).filter(t => (t.assignedTo === uid || t.assigneeUid === uid || t.employeeUid === uid) && indiaDate(t.createdAt || t.assignedAt || t.startedAt) === day);
  const tickets = Object.values(ticketCache).filter(t => (t.assignedTo === uid || t.assigneeUid === uid || t.employeeUid === uid || t.createdBy === uid) && indiaDate(t.createdAt) === day);
  summary.textContent = (profile.name || uid) + ' · ' + (profile.team || 'Unassigned') + ' · ' + day + ' · ' + shifts.length + ' shifts, ' + tasks.length + ' tasks, ' + tickets.length + ' tickets';
  const fmt = ts => typeof ts === 'number' ? new Date(ts).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}) : '—';
  details.append(
    workerRecordCard('Attendance',shifts,s => 'Start: '+fmt(s.startedAt)+' · End: '+fmt(s.endedAt)+' · '+(s.status || 'Unknown')),
    workerRecordCard('Tasks created on this date',tasks,t => (t.title || 'Task')+' · '+(t.status || 'Pending')),
    workerRecordCard('Tickets created on this date',tickets,t => (t.customer || t.customerName || t.title || 'Ticket')+' · '+(t.status || 'Open'))
  );
}
$('recordEmployee').onchange = renderWorkerRecords;
$('recordDate').onchange = renderWorkerRecords;
$('recordDate').value = indiaDate(Date.now());

function renderTeamManagement() {
  const employeeSelect = $('teamEmployee');
  const selectedUid = employeeSelect.value;
  employeeSelect.replaceChildren(new Option('Select employee', ''));
  for (const [uid, profile] of Object.entries(employees).sort((a, b) =>
    String(a[1].name || a[0]).localeCompare(String(b[1].name || b[0]))
  )) {
    employeeSelect.add(new Option(profile.name || uid, uid));
  }
  if (employees[selectedUid]) employeeSelect.value = selectedUid;

  const groups = Object.create(null);
  for (const [uid, profile] of Object.entries(employees)) {
    const team = String(profile.team || 'Unassigned').trim() || 'Unassigned';
    if (!groups[team]) groups[team] = [];
    groups[team].push({ uid, name: profile.name || uid, email: profile.email || '' });
  }

  const box = $('teamList');
  box.replaceChildren();
  for (const [team, members] of Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))) {
    const section = document.createElement('section');
    section.className = 'border rounded-xl p-4 mb-3';
    const heading = document.createElement('h3');
    heading.className = 'font-bold';
    heading.textContent = team + ' · ' + members.length + (members.length === 1 ? ' employee' : ' employees');
    const list = document.createElement('div');
    list.className = 'mt-2';
    for (const member of members.sort((a, b) => a.name.localeCompare(b.name))) {
      const row = document.createElement('p');
      row.className = 'list-row';
      row.textContent = member.name + (member.email ? ' · ' + member.email : '');
      list.append(row);
    }
    section.append(heading, list);
    box.append(section);
  }
  if (!Object.keys(employees).length) box.textContent = 'No employee profiles found.';
}

$('teamEmployee').onchange = () => {
  const uid = $('teamEmployee').value;
  $('teamName').value = employees[uid]?.team || '';
  $('teamFeedback').textContent = '';
};

$('teamAssignmentForm').onsubmit = async event => {
  event.preventDefault();
  const uid = $('teamEmployee').value;
  const team = $('teamName').value.trim();
  if (!uid || !employees[uid] || !team) {
    $('teamFeedback').textContent = 'Choose an employee and enter a team name.';
    return;
  }

  const button = $('teamAssignmentForm').querySelector('button[type="submit"]');
  button.disabled = true;
  $('teamFeedback').textContent = '';
  $('actionError').textContent = '';
  try {
    await update(ref(db, 'profiles/' + uid), { team });
    await writeAudit('employee.team_assigned', uid + ':' + team);
    $('teamFeedback').textContent = 'Team assignment saved.';
  } catch (error) {
    $('teamFeedback').textContent = 'Could not save the team assignment. Check the admin profile and deployed Firebase rules.';
    databaseError(error, 'employee team assignment');
  } finally {
    button.disabled = false;
  }
};

$('taskForm').onsubmit = async event => {
  event.preventDefault();

  try {
    $('actionError').textContent = '';

    await set(push(ref(db, 'tasks')), {
      title: $('taskTitle').value.trim(),
      description: $('taskDescription').value.trim(),
      assigneeUid: $('assignee').value,
      status: 'Assigned',
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    await writeAudit('task.created', auth.currentUser.uid);

    $('taskForm').reset();

  } catch (e) {
    $('actionError').textContent =
      'Unable to assign task. Check permissions.';
  }
};

$('adminTicketForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const id = push(ref(db, 'tickets')).key;
    await set(ref(db, `tickets/${id}`), {
      customerName: $('adminTicketCustomer').value.trim(), contact: $('adminTicketContact').value.trim(), address: $('adminTicketAddress').value.trim(),
      category: $('adminTicketCategory').value, description: $('adminTicketDescription').value.trim(), priority: $('adminTicketPriority').value,
      status: 'Assigned', assignedTo: $('adminTicketAssignee').value, createdBy: auth.currentUser.uid, createdAt: serverTimestamp()
    });
    await writeAudit('ticket.created', id); $('adminTicketForm').reset();
  } catch { $('actionError').textContent = 'Could not create ticket.'; }
};

function renderTickets() {
  const box = $('ticketList'); box.replaceChildren();
  for (const [id, ticket] of Object.entries(ticketCache).sort((a,b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))) {
    const row = document.createElement('article'); row.className = 'task-card';
    const title = document.createElement('strong'); title.textContent = `${ticket.category}: ${ticket.customerName}`;
    const detail = document.createElement('p'); detail.textContent = `${ticket.status} · ${ticket.priority} · ${employees[ticket.assignedTo]?.name || ticket.assignedTo} · ${ticket.description}`;
    row.append(title, detail);
    if (ticket.location && Number.isFinite(ticket.location.latitude) && Number.isFinite(ticket.location.longitude)) { const loc = document.createElement('p'); loc.textContent = `Reported GPS: ${ticket.location.latitude.toFixed(5)}, ${ticket.location.longitude.toFixed(5)} (±${ticket.location.accuracy}m)`; row.append(loc); }
    const selector = document.createElement('select');
    for (const status of ['Open','Assigned','In Progress','Waiting for Customer','Escalated','Resolved','Closed']) selector.add(new Option(status,status));
    selector.value = ticket.status; selector.onchange = async () => { try { await update(ref(db, `tickets/${id}`), { status: selector.value, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid }); await writeAudit('ticket.status_changed', id); } catch { $('actionError').textContent = 'Could not update ticket status.'; } };
    row.append(selector); box.append(row);
  }
  if (!Object.keys(ticketCache).length) box.textContent = 'No tickets yet.';
}

$('announcementForm').onsubmit = async event => {
  event.preventDefault();
  try { const id = push(ref(db,'announcements')).key; await set(ref(db,`announcements/${id}`), { title: $('announcementTitle').value.trim(), body: $('announcementBody').value.trim(), createdAt: serverTimestamp(), createdBy: auth.currentUser.uid }); await writeAudit('announcement.published', id); $('announcementForm').reset(); }
  catch { $('actionError').textContent = 'Could not publish announcement.'; }
};

function renderAnnouncementList() {
  const box = $('announcementList'); box.replaceChildren();
  for (const item of Object.values(announcementCache).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0))) { const row = document.createElement('article'); row.className='task-card'; const title=document.createElement('strong'); title.textContent=item.title; const body=document.createElement('p'); body.textContent=item.body; row.append(title,body); box.append(row); }
  if (!Object.keys(announcementCache).length) box.textContent='No announcements published.';
}

function displayAdminMessages(data, uid) {
  const box = $('adminMessages');
  box.replaceChildren();
  const messages = Object.values(data).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!messages.length) {
    const empty = document.createElement('p'); empty.className = 'muted';
    empty.textContent = 'No messages yet. Send the first message to this employee.';
    box.append(empty); return;
  }
  for (const item of messages) {
    const mine = item.senderRole === 'admin';
    const bubble = document.createElement('article');
    bubble.className = 'chat-message' + (mine ? ' mine' : '');
    const meta = document.createElement('div'); meta.className = 'chat-meta';
    const when = typeof item.createdAt === 'number' ? ' · ' + new Date(item.createdAt).toLocaleString('en-IN') : '';
    meta.textContent = (mine ? 'You' : employees[uid]?.name || 'Employee') + when;
    const body = document.createElement('p'); body.textContent = item.text || '';
    bubble.append(meta,body); box.append(bubble);
  }
  box.scrollTop = box.scrollHeight;
}
$('messageEmployee').onchange = () => {
  offSelectedMessages();
  const uid = $('messageEmployee').value;
  $('adminMessages').replaceChildren();
  if (!uid) { $('adminMessages').textContent = 'Select an employee to view messages.'; return; }
  offSelectedMessages = onValue(ref(db, `messages/${uid}`),
    snap => displayAdminMessages(snap.val() || {}, uid),
    error => { $('adminMessages').textContent = 'Unable to load messages. Check Firebase access.'; databaseError(error, 'employee messages'); });
};
$('adminMessageForm').onsubmit = async event => {
  event.preventDefault();
  const uid = $('messageEmployee').value;
  const message = $('adminMessageText').value.trim();
  if (!uid || !employees[uid]) { $('actionError').textContent = 'Select an employee before sending.'; return; }
  if (!message) return;
  const button = $('adminMessageForm').querySelector('button');
  button.disabled = true;
  try {
    await set(push(ref(db,`messages/${uid}`)), { text:message, senderUid:auth.currentUser.uid, senderRole:'admin', createdAt:serverTimestamp() });
    $('adminMessageText').value = '';
    $('actionError').textContent = '';
    try { await writeAudit('message.sent', uid); } catch (auditError) { databaseError(auditError, 'message audit'); }
  } catch (error) { databaseError(error, 'send employee message'); }
  finally { button.disabled = false; }
};

function csvCell(value) { const text = value == null ? '' : String(value); return `"${text.replaceAll('"','""')}"`; }
function exportCsv(name, rows) {
  if (!rows.length) { $('actionError').textContent='There is no data to export.'; return; }
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csv = [headers.map(csvCell).join(','), ...rows.map(row => headers.map(key => csvCell(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff',csv], { type:'text/csv;charset=utf-8' }));
  const link=document.createElement('a'); link.href=url; link.download=`kb-${name}-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
  writeAudit(`export.${name}`, name);
}
document.querySelectorAll('[data-export]').forEach(button => button.onclick = () => {
  const key=button.dataset.export;
  if (key==='tasks') exportCsv('tasks',Object.entries(tasksCache).map(([id,t])=>({id,...t,createdAt:formatDate(t.createdAt)})));
  if (key==='tickets') exportCsv('tickets',Object.entries(ticketCache).map(([id,t])=>({id,...t,createdAt:formatDate(t.createdAt),resolvedAt:formatDate(t.resolvedAt)})));
  if (key==='shifts') exportCsv('shifts',Object.entries(shiftCache).flatMap(([uid,records])=>Object.entries(records||{}).map(([id,s])=>({employee:employees[uid]?.name || uid,id,status:s.status,startedAt:formatDate(s.startedAt),endedAt:formatDate(s.endedAt),startLatitude:s.location?.latitude,startLongitude:s.location?.longitude,locationAccuracy:s.location?.accuracy,endLatitude:s.endLocation?.latitude,endLongitude:s.endLocation?.longitude}))));
  if (key==='attendanceCorrections') exportCsv('attendance-corrections',Object.entries(correctionCache).flatMap(([uid,records])=>Object.entries(records||{}).map(([id,item])=>({employee:employees[uid]?.name||uid,uid,id,workDate:item.workDate,correctedStart:item.correctedStart,correctedEnd:item.correctedEnd,reason:item.reason,createdAt:formatDate(item.createdAt),createdBy:item.createdBy}))));
  if (key==='audit') exportCsv('audit',Object.entries(auditCache).map(([id,item])=>({id,...item,createdAt:formatDate(item.createdAt)})));
});
function formatDate(value) { return value ? new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : ''; }
async function writeAudit(action, recordId) { try { await set(push(ref(db,'auditLogs')), { actor:auth.currentUser.uid, action, recordId:String(recordId), createdAt:serverTimestamp() }); } catch { $('actionError').textContent='Action completed but audit log could not be saved.'; } }
function renderAudit() { const box=$('auditList'); box.replaceChildren(); for (const item of Object.values(auditCache).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,100)) { const p=document.createElement('p'); p.className='list-row'; p.textContent=`${formatDate(item.createdAt)} · ${item.action} · ${item.recordId} · ${item.actor}`; box.append(p); } if (!Object.keys(auditCache).length) box.textContent='No audit events yet.'; }
function databaseError(error, section = 'data') {
  const code = String(error?.code || 'unknown').replace(/^database\//, '');
  if (code.toUpperCase().includes('PERMISSION_DENIED')) {
    $('actionError').textContent = 'Firebase denied access to ' + section + '. Check the deployed database rules for this data path and confirm your account has the admin role.';
    return;
  }
  $('actionError').textContent = 'Could not load ' + section + ' (' + code + '). Check the network connection and Firebase status.';
}

function renderTaskReviews() {
  const box = $('taskList');
  box.replaceChildren();

  for (const [id, task] of Object.entries(tasksCache)) {
    const card = document.createElement('article');
    card.className = 'border rounded-xl p-4 mb-3';

    const heading = document.createElement('h3');
    heading.className = 'font-bold';
    heading.textContent = task.title;

    const meta = document.createElement('p');
    meta.className = 'text-slate-500 text-xs mt-1';
    meta.textContent =
      `${employees[task.assigneeUid]?.name || task.assigneeUid} · ${task.status || 'Assigned'}`;

    card.append(heading, meta);

    const requests = Object.entries(
      requestsCache[task.assigneeUid] || {}
    )
      .filter(([, request]) => request.taskId === id)
      .sort((a, b) =>
        (b[1].createdAt || 0) - (a[1].createdAt || 0)
      );

    for (const [requestId, request] of requests) {
      const line = document.createElement('div');
      line.className = 'mt-3 border-t pt-3';

      const description = document.createElement('p');
      description.className = 'text-xs';

      const date = request.createdAt
        ? new Date(request.createdAt).toLocaleString(
            'en-IN', { timeZone: 'Asia/Kolkata' }
          )
        : 'Pending timestamp';

      description.textContent =
        `${request.kind === 'complete' ? 'Completion' : 'Start'} request · ` +
        `${request.state || 'pending'} · ` +
        `${request.notes || 'No notes'} · ${date}`;
      if (request.location && Number.isFinite(request.location.latitude) && Number.isFinite(request.location.longitude)) {
        description.textContent += ` · GPS ${request.location.latitude.toFixed(5)}, ${request.location.longitude.toFixed(5)} ±${request.location.accuracy}m`;
      }

      line.append(description);

      if (request.state === 'pending') {
        const buttons = document.createElement('div');
        buttons.className = 'flex gap-2 mt-2';

        const actions = [
          [
            'Approve',
            request.kind === 'complete' ? 'Approved' : 'In Progress',
            'bg-emerald-600'
          ],
          [
            'Return for rework',
            'Rework Required',
            'bg-amber-600'
          ]
        ];

        for (const [label, status, css] of actions) {
          const button = document.createElement('button');
          button.textContent = label;
          button.className =
            `${css} text-white rounded-lg px-3 py-2 text-xs`;

          button.onclick = async () => {
            button.disabled = true;

            try {
              await update(ref(db), {
                [`tasks/${id}/status`]: status,
                [`tasks/${id}/reviewedAt`]: serverTimestamp(),
                [`tasks/${id}/reviewedBy`]: auth.currentUser.uid,
                [`taskRequests/${task.assigneeUid}/${requestId}/state`]:
                  status === 'Rework Required'
                    ? 'rejected'
                    : 'approved',
                [`taskRequests/${task.assigneeUid}/${requestId}/reviewedAt`]:
                  serverTimestamp(),
                [`taskRequests/${task.assigneeUid}/${requestId}/reviewedBy`]:
                  auth.currentUser.uid
              });
              await writeAudit(status === 'Rework Required' ? 'task.rework_requested' : 'task.approved', id);

              $('reviewFeedback').textContent = 'Review saved.';

            } catch (e) {
              $('reviewFeedback').textContent =
                'Review failed. Check database rules.';
            } finally {
              button.disabled = false;
            }
          };

          buttons.append(button);
        }

        line.append(buttons);
      }

      card.append(line);
    }

    box.append(card);
  }

  if (!Object.keys(tasksCache).length) {
    box.textContent = 'No tasks yet.';
  }
}

function renderAccessRequests() {
  const box = $('accessRequests');
  const entries = Object.entries(accessCache)
    .filter(([, request]) => request.state === 'pending')
    .sort((a, b) => (Number(b[1].createdAt) || 0) - (Number(a[1].createdAt) || 0));
  box.replaceChildren();

  if (!entries.length) {
    box.textContent = 'No pending access requests.';
    return;
  }

  for (const [uid, request] of entries) {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.style.display = 'grid';
    row.style.gap = '8px';

    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = request.name || 'Employee';
    const email = document.createElement('p');
    email.className = 'muted';
    email.textContent = request.email || 'No email provided';
    const submitted = document.createElement('p');
    submitted.className = 'muted';
    submitted.textContent = Number.isFinite(Number(request.createdAt)) && Number(request.createdAt) > 0
      ? 'Requested ' + new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(Number(request.createdAt)))
      : 'Request date unavailable';
    details.append(name, email, submitted);
    row.append(details);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';
    const buttons = [];
    for (const [label, state] of [['Approve', 'approved'], ['Decline', 'rejected']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = 'access-action';
      button.onclick = async () => {
        if (!auth.currentUser) {
          $('actionError').textContent = 'Your admin session has expired. Sign in again.';
          return;
        }
        for (const actionButton of buttons) actionButton.disabled = true;
        $('actionError').textContent = '';
        const changes = {
          [`accessRequests/${uid}/state`]: state,
          [`accessRequests/${uid}/reviewedAt`]: serverTimestamp(),
          [`accessRequests/${uid}/reviewedBy`]: auth.currentUser.uid
        };
        if (state === 'approved') {
          changes[`profiles/${uid}`] = {
            role: 'employee',
            name: request.name || request.email || 'Employee',
            email: request.email || '',
            team: 'Unassigned'
          };
        }

        try {
          await update(ref(db), changes);
          await writeAudit(`access.${state}`, uid);
        } catch (e) {
          $('actionError').textContent = 'Could not update access request. Check Firebase rules and your connection.';
          for (const actionButton of buttons) actionButton.disabled = false;
        }
      };
      buttons.push(button);
      actions.append(button);
    }
    row.append(actions);
    box.append(row);
  }
}
