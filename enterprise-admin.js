import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { ref, get, onValue, push, set, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const $ = id => document.getElementById(id);
const unsubscribers = [];
let customerCache = {};
let financeCache = {};
let inventoryCache = {};
let requestCache = {};
let profileCache = {};
let activeUid = null;

const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((Number(paise) || 0) / 100);
const safe = value => String(value ?? '').trim();
function showError(message) { const el = $('actionError'); if (el) el.textContent = message; }
function row(container, cells) {
  const line = document.createElement('div');
  line.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-b border-slate-100 py-3 text-sm';
  for (const value of cells) {
    const cell = document.createElement('div');
    cell.className = 'min-w-0 break-words';
    cell.textContent = value || '—';
    line.append(cell);
  }
  container.append(line);
}
function setStatus(id, message) { const el = $(id); if (el) el.textContent = message; }
function csvDownload(filename, records) {
  if (!records.length) { showError('There is no data to export yet.'); return; }
  const keys = [...new Set(records.flatMap(record => Object.keys(record)))];
  const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [keys.map(quote).join(','), ...records.map(record => keys.map(key => quote(record[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    for (const stop of unsubscribers.splice(0)) stop();
    activeUid = null;
    customerCache = {};
    financeCache = {};
    inventoryCache = {};
    requestCache = {};
    profileCache = {};
    renderEmployeeRequests();
    return;
  }
  if (activeUid === user.uid) return;
  for (const stop of unsubscribers.splice(0)) stop();
  activeUid = null;
  try {
    const profileSnap = await get(ref(db, 'profiles/' + user.uid));
    const profile = profileSnap.val();
    if (auth.currentUser?.uid !== user.uid) return;
    if (!profile || profile.role !== 'admin' || profile.active === false || profile.disabled === true) return;
    activeUid = user.uid;
    unsubscribers.push(onValue(ref(db, 'customers'), snap => {
      customerCache = snap.val() || {};
      renderCustomers();
    }, error => showError('Customer records unavailable. Verify the customers database rules.')));
    unsubscribers.push(onValue(ref(db, 'financeEntries'), snap => {
      financeCache = snap.val() || {};
      renderFinance();
    }, error => showError('Finance ledger unavailable. Verify the financeEntries database rules.')));
    unsubscribers.push(onValue(ref(db, 'inventoryItems'), snap => {
      inventoryCache = snap.val() || {};
      renderInventory();
    }, error => showError('Inventory unavailable. Verify the inventoryItems database rules.')));
    unsubscribers.push(onValue(ref(db, 'profiles'), snap => {
      profileCache = snap.val() || {};
      renderEmployeeRequests();
    }, error => showError('Employee names could not be loaded for request review.')));
    unsubscribers.push(onValue(ref(db, 'employeeRequests'), snap => {
      requestCache = snap.val() || {};
      renderEmployeeRequests();
    }, error => showError('Employee requests unavailable. Verify the employeeRequests database rules.')));
  } catch {
    showError('Business modules could not verify administrator access.');
  }
});

function renderCustomers() {
  const box = $('crmCustomerList');
  if (!box) return;
  box.replaceChildren();
  const entries = Object.entries(customerCache).sort((a,b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  if (!entries.length) { box.textContent = 'No customers added yet.'; return; }
  for (const [id, customer] of entries) {
    const card = document.createElement('article');
    card.className = 'rounded-xl border border-slate-200 p-4 mb-3 bg-white';
    const title = document.createElement('h3');
    title.className = 'font-bold text-slate-900';
    title.textContent = customer.name || 'Unnamed customer';
    const details = document.createElement('p');
    details.className = 'text-sm text-slate-600 mt-1';
    details.textContent = [customer.phone, customer.plan, customer.status, customer.address].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2 mt-3';
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'rounded-lg border px-3 py-2 text-sm'; edit.textContent = 'Edit';
    edit.onclick = () => {
      $('customerId').value = id;
      $('customerName').value = customer.name || '';
      $('customerPhone').value = customer.phone || '';
      $('customerAddress').value = customer.address || '';
      $('customerPlan').value = customer.plan || '';
      $('customerStatus').value = customer.status || 'Active';
      $('customerSave').textContent = 'Save customer changes';
      $('customerName').focus();
    };
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'rounded-lg border px-3 py-2 text-sm'; cancel.textContent = 'Clear form';
    cancel.onclick = resetCustomerForm;
    actions.append(edit, cancel);
    card.append(title, details, actions);
    box.append(card);
  }
  setStatus('customerCountLabel', entries.length + ' customer record' + (entries.length === 1 ? '' : 's'));
}
function resetCustomerForm() {
  $('customerForm')?.reset();
  $('customerId').value = '';
  $('customerSave').textContent = 'Add customer';
}
$('customerForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUid) return showError('Sign in with an authorized administrator account first.');
  const id = $('customerId').value;
  const name = safe($('customerName').value);
  const phone = safe($('customerPhone').value);
  const address = safe($('customerAddress').value);
  const plan = safe($('customerPlan').value);
  const status = $('customerStatus').value;
  if (!name || !phone) return showError('Customer name and contact number are required.');
  const payload = { name, phone, address, plan, status, updatedAt: serverTimestamp(), updatedBy: activeUid };
  try {
    if (id) await update(ref(db, 'customers/' + id), payload);
    else await set(push(ref(db, 'customers')), { ...payload, createdAt: serverTimestamp(), createdBy: activeUid });
    resetCustomerForm();
    showError('');
    setStatus('customerFeedback', id ? 'Customer updated.' : 'Customer added.');
  } catch { showError('Customer save failed. Check database rules and connection.'); }
});

function renderFinance() {
  const box = $('financeEntryList');
  if (!box) return;
  box.replaceChildren();
  const entries = Object.entries(financeCache).sort((a,b) => String(b[1].date || '').localeCompare(String(a[1].date || '')));
  let income = 0, expenses = 0;
  for (const [, item] of entries) {
    const amount = Number(item.amountPaise) || 0;
    if (item.type === 'income') income += amount; else expenses += amount;
    row(box, [item.date || '—', item.type === 'income' ? 'Income' : 'Expense', item.category || 'General', money(amount) + (item.note ? ' · ' + item.note : '')]);
  }
  setStatus('financeIncomeTotal', money(income));
  setStatus('financeExpenseTotal', money(expenses));
  setStatus('financeNetTotal', money(income - expenses));
  setStatus('financeCountLabel', entries.length + ' ledger entr' + (entries.length === 1 ? 'y' : 'ies'));
  if (!entries.length) box.textContent = 'No transactions recorded yet.';
}
$('financeForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUid) return showError('Sign in with an authorized administrator account first.');
  const type = $('financeType').value;
  const amount = Number($('financeAmount').value);
  const date = $('financeDate').value;
  const category = safe($('financeCategory').value);
  const note = safe($('financeNote').value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !date || !category) return showError('Enter a valid positive amount, date and category.');
  const amountPaise = Math.round(amount * 100);
  try {
    await set(push(ref(db, 'financeEntries')), { type, amountPaise, date, category, note, createdAt: serverTimestamp(), createdBy: activeUid });
    $('financeForm').reset();
    $('financeDate').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    showError('');
    setStatus('financeFeedback', 'Transaction recorded in the ledger.');
  } catch { showError('Finance entry failed. Check database rules and connection.'); }
});
$('exportFinance')?.addEventListener('click', () => csvDownload('kb-finance-ledger.csv', Object.values(financeCache).map(item => ({ date: item.date, type: item.type, amountINR: ((Number(item.amountPaise)||0)/100).toFixed(2), category: item.category, note: item.note, createdBy: item.createdBy }))));


function renderEmployeeRequests() {
  const box = $('adminEmployeeRequestList');
  if (!box) return;
  box.replaceChildren();
  const requests = [];
  for (const [uid, items] of Object.entries(requestCache || {})) {
    for (const [id, request] of Object.entries(items || {})) requests.push({ uid, id, request });
  }
  requests.sort((a,b) => (b.request.createdAt || 0) - (a.request.createdAt || 0));
  if (!requests.length) { box.textContent = 'No employee requests have been submitted.'; return; }
  for (const item of requests) {
    const { uid, id, request } = item;
    const card = document.createElement('article');
    card.className = 'rounded-xl border border-slate-200 p-4 mb-3 bg-white';
    const title = document.createElement('h3');
    title.className = 'font-bold';
    title.textContent = ({leave:'Leave request',expense:'Expense reimbursement',advance:'Salary advance'})[request.type] || 'Employee request';
    const status = document.createElement('span');
    status.className = 'inline-flex rounded-full px-3 py-1 text-xs font-bold ' + (request.state === 'approved' ? 'bg-emerald-100 text-emerald-800' : request.state === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800');
    status.textContent = request.state === 'approved' ? 'Approved' : request.state === 'rejected' ? 'Declined' : 'Pending';
    const who = document.createElement('p');
    who.className = 'text-sm text-slate-600 mt-2';
    who.textContent = (profileCache[uid]?.name || profileCache[uid]?.email || uid) + ' · ' + (request.date || 'No date') + (request.amountPaise > 0 ? ' · ' + money(request.amountPaise) : '');
    const details = document.createElement('p');
    details.className = 'text-sm mt-2 whitespace-pre-wrap';
    details.textContent = request.details || '';
    card.append(title, status, who, details);
    if (request.reviewNote) {
      const note = document.createElement('p');
      note.className = 'text-sm text-slate-500 mt-2';
      note.textContent = 'Review note: ' + request.reviewNote;
      card.append(note);
    }
    if (request.state === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'flex flex-wrap gap-2 mt-3';
      for (const [label, state] of [['Approve','approved'],['Decline','rejected']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rounded-xl px-4 py-2 text-sm font-semibold ' + (state === 'approved' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white');
        button.textContent = label;
        button.onclick = async () => {
          if (!activeUid) return showError('Sign in as an administrator to review requests.');
          const reviewNote = state === 'rejected' ? (prompt('Reason for declining this request (required):', '') || '').trim() : (prompt('Optional note for the employee:', '') || '').trim();
          if (state === 'rejected' && !reviewNote) {
            setStatus('adminRequestFeedback', 'Please enter a reason before declining a request.');
            return;
          }
          button.disabled = true;
          const auditRef = push(ref(db, 'auditLogs'));
          const changes = {};
          changes['employeeRequests/' + uid + '/' + id + '/state'] = state;
          changes['employeeRequests/' + uid + '/' + id + '/reviewedAt'] = serverTimestamp();
          changes['employeeRequests/' + uid + '/' + id + '/reviewedBy'] = activeUid;
          changes['employeeRequests/' + uid + '/' + id + '/reviewNote'] = reviewNote;
          changes['auditLogs/' + auditRef.key] = { actor: activeUid, action: 'employee_request.' + state, recordId: uid + '/' + id, createdAt: serverTimestamp() };
          try {
            await update(ref(db), changes);
            setStatus('adminRequestFeedback', 'Request decision saved and audit event recorded.');
            showError('');
          } catch {
            setStatus('adminRequestFeedback', 'Could not save the decision. Verify the employeeRequests and auditLogs rules.');
          } finally {
            button.disabled = false;
          }
        };
        actions.append(button);
      }
      card.append(actions);
    }
    box.append(card);
  }
}

function renderInventory() {
  const box = $('inventoryList');
  if (!box) return;
  box.replaceChildren();
  const entries = Object.entries(inventoryCache).sort((a,b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));
  for (const [id, item] of entries) {
    const card = document.createElement('article');
    card.className = 'rounded-xl border border-slate-200 p-4 mb-3 bg-white';
    const title = document.createElement('h3');
    title.className = 'font-bold';
    title.textContent = item.name || 'Unnamed item';
    const details = document.createElement('p');
    details.className = 'text-sm text-slate-600 mt-1';
    details.textContent = 'SKU: ' + (item.sku || '—') + ' · Stock: ' + (Number(item.quantity)||0) + ' ' + (item.unit || 'units') + ' · Reorder at: ' + (Number(item.reorderLevel)||0);
    if ((Number(item.quantity)||0) <= (Number(item.reorderLevel)||0)) {
      const warning = document.createElement('p'); warning.className = 'text-sm font-semibold text-amber-700 mt-2'; warning.textContent = 'Low stock — reorder review needed'; card.append(warning);
    }
    const actions = document.createElement('div'); actions.className = 'flex flex-wrap gap-2 mt-3';
    const edit = document.createElement('button'); edit.type='button'; edit.className='rounded-lg border px-3 py-2 text-sm'; edit.textContent='Edit';
    edit.onclick = () => {
      $('inventoryId').value=id; $('inventoryName').value=item.name||''; $('inventorySku').value=item.sku||'';
      $('inventoryQuantity').value=Number(item.quantity)||0; $('inventoryReorder').value=Number(item.reorderLevel)||0; $('inventoryUnit').value=item.unit||'units';
      $('inventorySave').textContent='Save stock changes'; $('inventoryName').focus();
    };
    const adjust = document.createElement('button'); adjust.type='button'; adjust.className='rounded-lg border px-3 py-2 text-sm'; adjust.textContent='Stock in/out';
    adjust.onclick = async () => {
      const raw = prompt('Enter the new counted stock quantity for ' + (item.name || 'this item') + ':', String(Number(item.quantity)||0));
      if (raw === null) return;
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000000) return showError('Stock quantity must be a whole number of zero or more.');
      try {
        await update(ref(db, 'inventoryItems/' + id), { quantity, updatedAt: serverTimestamp(), updatedBy: activeUid });
        setStatus('inventoryFeedback', 'Stock quantity updated.');
      } catch { showError('Stock adjustment failed.'); }
    };
    actions.append(edit, adjust); card.append(title, details, actions); box.append(card);
  }
  setStatus('inventoryCountLabel', entries.length + ' stock item' + (entries.length === 1 ? '' : 's'));
  if (!entries.length) box.textContent = 'No inventory items added yet.';
}
$('inventoryForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUid) return showError('Sign in with an authorized administrator account first.');
  const id=$('inventoryId').value, name=safe($('inventoryName').value), sku=safe($('inventorySku').value);
  const quantity=Number($('inventoryQuantity').value), reorderLevel=Number($('inventoryReorder').value), unit=safe($('inventoryUnit').value)||'units';
  if (!name || !Number.isInteger(quantity) || quantity<0 || !Number.isInteger(reorderLevel) || reorderLevel<0) return showError('Enter a name and valid whole-number stock levels.');
  const payload={name,sku,quantity,reorderLevel,unit,updatedAt:serverTimestamp(),updatedBy:activeUid};
  try {
    if(id) await update(ref(db,'inventoryItems/'+id),payload);
    else await set(push(ref(db,'inventoryItems')),{...payload,createdAt:serverTimestamp(),createdBy:activeUid});
    $('inventoryForm').reset(); $('inventoryId').value=''; $('inventorySave').textContent='Add inventory item';
    showError(''); setStatus('inventoryFeedback',id?'Inventory item updated.':'Inventory item added.');
  } catch { showError('Inventory save failed. Check database rules and connection.'); }
});
$('exportCustomers')?.addEventListener('click', () => csvDownload('kb-customers.csv', Object.values(customerCache).map(item => ({ name:item.name, phone:item.phone, address:item.address, plan:item.plan, status:item.status }))));
$('exportInventory')?.addEventListener('click', () => csvDownload('kb-inventory.csv', Object.values(inventoryCache).map(item => ({ name:item.name, sku:item.sku, quantity:item.quantity, unit:item.unit, reorderLevel:item.reorderLevel }))));
$('financeDate').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
