
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
    });

    $('pageTitle').textContent =
      page[0].toUpperCase() + page.slice(1);
  };
}

function makeRow(text) {
  const el = document.createElement('div');
  el.className = 'border-b py-3';
  el.textContent = text;
  return el;
}

async function loadDashboardData(user) {
  unsub.forEach(fn => fn());
  unsub = [];

  try {
    unsub.push(onValue(ref(db, 'profiles'), snap => {
      employees = Object.fromEntries(
        Object.entries(snap.val() || {})
          .filter(([, p]) => p.role === 'employee')
      );

      $('employeeCount').textContent =
        Object.keys(employees).length;

      $('employeeList').replaceChildren();
      $('assignee').replaceChildren(
        new Option('Select employee', '')
      );
      $('adminTicketAssignee').replaceChildren(new Option('Assign employee', ''));
      $('messageEmployee').replaceChildren(new Option('Select employee', ''));

      for (const [uid, profile] of Object.entries(employees)) {
        $('employeeList').append(
          makeRow(`${profile.name || uid} · ${profile.team || 'Unassigned'}`)
        );

        $('assignee').add(
          new Option(profile.name || uid, uid)
        );
      $('adminTicketAssignee').add(new Option(profile.name || uid, uid));
      $('messageEmployee').add(new Option(profile.name || uid, uid));
      }

      renderTaskReviews();
    }, error => databaseError(error, 'employee profiles')));

    unsub.push(onValue(ref(db, 'tasks'), snap => {
      tasksCache = snap.val() || {};
      $('taskCount').textContent =
        Object.keys(tasksCache).length;
      renderTaskReviews();
    }, error => databaseError(error, 'tasks')));

    unsub.push(onValue(ref(db, 'taskRequests'), snap => {
      requestsCache = snap.val() || {};
      renderTaskReviews();
    }, error => databaseError(error, 'task requests')));

    unsub.push(onValue(ref(db, 'accessRequests'), snap => {
      accessCache = snap.val() || {};
      renderAccessRequests();
    }, error => databaseError(error, 'access requests')));

    unsub.push(onValue(ref(db, 'tickets'), snap => { ticketCache = snap.val() || {}; $('ticketCount').textContent = Object.keys(ticketCache).length; renderTickets(); }, databaseError));
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
    }, error => databaseError(error, 'attendance / shifts')));

  } catch (e) {
    $('actionError').textContent =
      'Unable to load admin data. Check Firebase database rules and connectivity.';
  }
}

onAuthStateChanged(auth, async user => {
  unsub.forEach(fn => fn());
  unsub = [];
  if (!user) {
    $('login').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    return;
  }
  try {
    const profileSnapshot = await get(ref(db, `profiles/${user.uid}`));
    if (profileSnapshot.val()?.role !== 'admin' || profileSnapshot.val()?.active === false || profileSnapshot.val()?.disabled === true) {
      await signOut(auth);
      $('loginError').textContent = 'Admin access required. This account may be inactive or not assigned the admin role.';
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

$('messageEmployee').onchange = () => {
  offSelectedMessages();
  const uid = $('messageEmployee').value; $('adminMessages').replaceChildren();
  if (!uid) return;
  offSelectedMessages = onValue(ref(db, `messages/${uid}`), snap => {
    const box=$('adminMessages'); box.replaceChildren();
    for (const item of Object.values(snap.val() || {}).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))) { const p=document.createElement('p'); p.textContent=`${item.senderRole === 'admin' ? 'Admin' : employees[uid]?.name || 'Employee'}: ${item.text}`; box.append(p); }
  }, databaseError);
};
$('adminMessageForm').onsubmit = async event => {
  event.preventDefault(); const uid=$('messageEmployee').value; if (!uid) return;
  try { await set(push(ref(db,`messages/${uid}`)), { text:$('adminMessageText').value.trim(), senderUid:auth.currentUser.uid, senderRole:'admin', createdAt:serverTimestamp() }); $('adminMessageText').value=''; await writeAudit('message.sent', uid); }
  catch { $('actionError').textContent='Could not send message.'; }
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
    .filter(([, request]) => request.state === 'pending');
  box.replaceChildren();

  if (!entries.length) {
    box.textContent = 'No pending access requests.';
    return;
  }

  for (const [uid, request] of entries) {
    const row = document.createElement('div');
    row.className = 'list-row';
    const details = document.createElement('p');
    details.textContent = `${request.name || 'Employee'} · ${request.email || 'No email'}`;
    row.append(details);

    for (const [label, state] of [['Approve', 'approved'], ['Decline', 'rejected']]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.className = 'access-action';
      button.style.marginRight = '8px';
      button.onclick = async () => {
        button.disabled = true;
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
          $('actionError').textContent = 'Could not update access request. Check Firebase rules.';
        } finally {
          button.disabled = false;
        }
      };
      row.append(button);
    }
    box.append(row);
  }
}
