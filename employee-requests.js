import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { ref, get, onValue, push, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const $ = id => document.getElementById(id);
let currentUid = null;
let stopRequests = () => {};
const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format((Number(paise) || 0) / 100);

function renderRequests(data) {
  const box = $('employeeRequestList');
  if (!box) return;
  box.replaceChildren();
  const entries = Object.entries(data || {}).sort((a,b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  if (!entries.length) { box.textContent = 'You have not submitted any requests yet.'; return; }
  for (const [, request] of entries) {
    const card = document.createElement('article');
    card.className = 'task';
    const title = document.createElement('strong');
    title.textContent = ({ leave: 'Leave request', expense: 'Expense reimbursement', advance: 'Salary advance' })[request.type] || 'Employee request';
    const status = document.createElement('span');
    status.className = 'approval-badge' + (request.state === 'pending' ? ' pending' : request.state === 'rejected' ? ' rejected' : '');
    status.textContent = request.state === 'approved' ? 'Approved' : request.state === 'rejected' ? 'Declined' : 'Pending review';
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = (request.date || 'Date not set') + (request.amountPaise > 0 ? ' · ' + money(request.amountPaise) : '');
    const details = document.createElement('p');
    details.textContent = request.details || '';
    const head = document.createElement('div');
    head.className = 'row';
    head.append(title, status);
    card.append(head, meta, details);
    if (request.reviewNote) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Admin note: ' + request.reviewNote;
      card.append(note);
    }
    box.append(card);
  }
}

onAuthStateChanged(auth, async user => {
  stopRequests();
  currentUid = null;
  if (!user) return;
  try {
    const snap = await get(ref(db, 'profiles/' + user.uid));
    const profile = snap.val();
    if (auth.currentUser?.uid !== user.uid) return;
    if (!profile || profile.role !== 'employee' || profile.active === false || profile.disabled === true) return;
    currentUid = user.uid;
    stopRequests = onValue(ref(db, 'employeeRequests/' + user.uid), value => renderRequests(value.val() || {}), () => {
      $('employeeRequestFeedback').textContent = 'Could not load request history. Check connection and database permissions.';
    });
  } catch {
    const feedback = $('employeeRequestFeedback');
    if (feedback) feedback.textContent = 'Could not verify your employee account.';
  }
});

$('employeeRequestType')?.addEventListener('change', () => {
  const type = $('employeeRequestType').value;
  $('employeeRequestAmountWrap').classList.toggle('hidden', type === 'leave');
  $('employeeRequestAmount').required = type !== 'leave';
});
$('employeeRequestForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUid) {
    $('employeeRequestFeedback').textContent = 'Sign in with your approved employee account first.';
    return;
  }
  const type = $('employeeRequestType').value;
  const date = $('employeeRequestDate').value;
  const details = $('employeeRequestDetails').value.trim();
  const amount = type === 'leave' ? 0 : Number($('employeeRequestAmount').value);
  if (!date || !details || details.length > 1000 || (type !== 'leave' && (!Number.isFinite(amount) || amount <= 0 || amount > 1000000))) {
    $('employeeRequestFeedback').textContent = 'Enter the requested date, details, and a valid amount when applicable.';
    return;
  }
  const button = $('employeeRequestSubmit');
  button.disabled = true;
  try {
    await set(push(ref(db, 'employeeRequests/' + currentUid)), {
      type,
      date,
      details,
      amountPaise: Math.round(amount * 100),
      state: 'pending',
      createdAt: serverTimestamp(),
      createdBy: currentUid
    });
    $('employeeRequestForm').reset();
    $('employeeRequestType').dispatchEvent(new Event('change'));
    $('employeeRequestFeedback').textContent = 'Request submitted. You can track its status below.';
  } catch {
    $('employeeRequestFeedback').textContent = 'Request was not saved. Check your connection or ask the administrator to verify database rules.';
  } finally {
    button.disabled = false;
  }
});
