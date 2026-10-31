import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Safe DOM builder: children are always text nodes, never HTML.
const h = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...c.filter(x => x != null));
  return e;
};

// <PURE> (no DOM/Supabase access below this line until </PURE>; tests/logic.test.mjs evaluates this region)
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const OPT = {
  website_status: ['No Website Found', 'Active Website', 'Broken Website', 'Outdated Website', 'Website Status Unverified'],
  contact_channel: ['Facebook Messenger', 'WhatsApp', 'Email', 'Instagram DM', 'Other'],
  lead_status: ['New', 'Researching', 'Ready to Contact', 'Contacted', 'Replied', 'Interested', 'Follow-up Needed', 'Not Interested', 'No Response', 'Not a Suitable Lead', 'Closed']
};
// The 24 user-facing fields, in exact order.
const FIELDS = [
  ['lead_id', 'Lead ID', 'text'], ['date_added', 'Date Added', 'date'], ['business_name', 'Business Name', 'text'],
  ['business_category', 'Business Category', 'text'], ['country', 'Country', 'text'], ['state', 'State', 'text'],
  ['city', 'City', 'text'], ['full_business_address', 'Full Business Address', 'text'],
  ['google_maps_profile_link', 'Google Maps Profile Link', 'url'], ['facebook_profile_link', 'Facebook Profile Link', 'url'],
  ['instagram_profile_link', 'Instagram Profile Link', 'url'], ['website_url', 'Website URL', 'url'],
  ['website_status', 'Website Status', 'select'], ['contact_person_owner', 'Contact Person / Owner', 'text'],
  ['phone_number_1', 'Phone Number 1', 'tel'], ['phone_number_2', 'Phone Number 2', 'tel'],
  ['email_address', 'Email Address', 'email'], ['contact_channel', 'Contact Channel', 'select'],
  ['research_notes', 'Research Notes', 'textarea'], ['personalized_first_message', 'Personalized First Message', 'textarea'],
  ['message_sent_date', 'Message Sent Date', 'date'], ['response_conversation_notes', 'Response / Conversation Notes', 'textarea'],
  ['lead_status', 'Lead Status', 'select'], ['next_follow_up_date', 'Next Follow-up Date', 'date']
];
const FD = Object.fromEntries(FIELDS.map(f => [f[0], { label: f[1], type: f[2] }]));
const SECTIONS = [
  ['Business Details', ['date_added', 'business_name', 'business_category', 'country', 'state', 'city', 'full_business_address']],
  ['Online Presence', ['google_maps_profile_link', 'facebook_profile_link', 'instagram_profile_link', 'website_url', 'website_status']],
  ['Contact Details', ['contact_person_owner', 'phone_number_1', 'phone_number_2', 'email_address', 'contact_channel']],
  ['Outreach', ['research_notes', 'personalized_first_message', 'message_sent_date', 'response_conversation_notes']],
  ['Status & Follow-up', ['lead_status', 'next_follow_up_date']]
];
const INACTIVE = ['Closed', 'Not Interested', 'Not a Suitable Lead'];
const KEYS = FIELDS.map(f => f[0]);
const DATE_KEYS = ['date_added', 'message_sent_date', 'next_follow_up_date'];
const URL_KEYS = ['google_maps_profile_link', 'facebook_profile_link', 'instagram_profile_link', 'website_url'];
const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const validUrl = s => { try { const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.'); } catch { return false; } };
const realDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/['\u2019`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const phoneKey = s => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : null; };
const nameKey = r => r && r.business_name ? [norm(r.business_name), norm(r.city), norm(r.country)].join('|') : null;

// Validate one imported record. Returns {rec, errors, warnings}. Never mutates input.
function validateRecord(raw) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { rec: null, errors: ['Record is not a JSON object.'], warnings };
  const extra = Object.keys(raw).filter(k => !KEYS.includes(k));
  if (extra.length) warnings.push('Unknown fields not imported: ' + extra.join(', '));
  const missing = KEYS.filter(k => k !== 'lead_id' && !(k in raw));
  if (missing.length) warnings.push('Missing fields left empty: ' + missing.join(', '));
  const rec = {};
  for (const k of KEYS) {
    if (k === 'lead_id') continue;
    let v = raw[k];
    if (v == null) { rec[k] = null; continue; }
    if (typeof v !== 'string') { errors.push(`${FD[k].label} must be text (got ${typeof v}).`); rec[k] = null; continue; }
    if (FD[k].type !== 'textarea') v = v.trim();
    rec[k] = v.trim() === '' ? null : v;
  }
  if (!rec.business_name) errors.push('Business Name is required.');
  for (const k of DATE_KEYS) if (rec[k] && !realDate(rec[k])) errors.push(`${FD[k].label} must be a valid date (YYYY-MM-DD), got "${rec[k]}".`);
  for (const k of Object.keys(OPT)) if (rec[k] && !OPT[k].includes(rec[k])) errors.push(`${FD[k].label} "${rec[k]}" is not an allowed value.`);
  if (rec.email_address && !emailOk(rec.email_address)) warnings.push('Email address looks invalid (kept as-is).');
  for (const k of URL_KEYS) if (rec[k] && !validUrl(rec[k])) warnings.push(`${FD[k].label} looks invalid (kept as-is).`);
  rec.date_added ||= today(); rec.website_status ||= 'Website Status Unverified'; rec.lead_status ||= 'New';
  return { rec, errors, warnings };
}
function parseJsonText(text) {
  text = String(text).replace(/^\uFEFF/, '').trim();
  if (!text) return { error: 'The file is empty.' };
  let d; try { d = JSON.parse(text); } catch (e) { return { error: 'Invalid JSON: ' + e.message }; }
  if (Array.isArray(d)) return d.length ? { records: d } : { error: 'The JSON array is empty - nothing to import.' };
  if (d && typeof d === 'object') return { records: [d] };
  return { error: 'JSON must be an array of lead objects or a single lead object.' };
}
const newIndex = () => ({ names: new Map(), phones: new Map() });
function addToIndex(idx, r, ref) {
  const nk = nameKey(r); if (nk && !idx.names.has(nk)) idx.names.set(nk, ref);
  for (const p of [r.phone_number_1, r.phone_number_2]) { const pk = phoneKey(p); if (pk && !idx.phones.has(pk)) idx.phones.set(pk, ref); }
}
function findDup(r, idx) {
  const nk = nameKey(r); if (nk && idx.names.has(nk)) return 'Same business name, city and country as ' + idx.names.get(nk);
  for (const p of [r.phone_number_1, r.phone_number_2]) { const pk = phoneKey(p); if (pk && idx.phones.has(pk)) return 'Same phone number as ' + idx.phones.get(pk); }
  return null;
}
// Exact normalized matching only; similar-but-different names are never treated as duplicates.
function analyzeImport(records, dbIdx) {
  const fileIdx = newIndex();
  return records.map((raw, i) => {
    const v = validateRecord(raw);
    const it = { n: i + 1, raw, rec: v.rec, errors: v.errors, warnings: v.warnings, dup: null, action: 'invalid', done: false, failed: null, hadLeadId: !!(raw && typeof raw === 'object' && raw.lead_id) };
    if (v.errors.length) return it;
    let reason = findDup(v.rec, dbIdx);
    if (reason) it.dup = { where: 'database', reason };
    else if ((reason = findDup(v.rec, fileIdx))) it.dup = { where: 'file', reason };
    addToIndex(fileIdx, v.rec, `file row #${i + 1}`);
    it.action = it.dup ? 'skip' : 'import';
    return it;
  });
}
function summarize(items) {
  const ok = items.filter(i => !i.errors.length);
  return { total: items.length, fresh: ok.filter(i => !i.dup).length, dupDb: ok.filter(i => i.dup?.where === 'database').length, dupFile: ok.filter(i => i.dup?.where === 'file').length,
    invalid: items.length - ok.length, done: items.filter(i => i.done).length, failed: items.filter(i => i.failed && !i.done).length,
    withLeadId: items.filter(i => i.hadLeadId).length, toImport: items.filter(i => i.action === 'import' && !i.done && !i.errors.length).length };
}

// ---- export builders (libraries are passed in so they can be tested in Node) ----
const rowOf = l => FIELDS.map(([k]) => l[k] == null ? '' : String(l[k]));
const toExportJson = leads => JSON.stringify(leads.map(l => Object.fromEntries(FIELDS.map(([k]) => [k, l[k] ?? null]))), null, 2);
function buildXlsx(XLSX, leads) {
  const aoa = [FIELDS.map(f => f[1]), ...leads.map(rowOf)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const a of Object.keys(ws)) if (a[0] !== '!') { const c = ws[a]; c.t = 's'; c.v = String(c.v ?? ''); c.z = '@'; delete c.w; }
  ws['!cols'] = FIELDS.map(([k, , t], c) => ({ wch: t === 'textarea' ? 60 : Math.min(40, Math.max(14, ...aoa.slice(0, 200).map(r => String(r[c]).length))) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: FIELDS.length - 1 } }) };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Leads'); return wb;
}
function buildPdf(jsPDF, leads, { details = true, gen = '' } = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const single = leads.length === 1 && details;
  doc.setFontSize(18); doc.text(single ? 'Lead Report' : 'Lead Manager - Leads Report', 40, 48);
  doc.setFontSize(10); doc.text(`Generated: ${gen}   |   Records: ${leads.length}`, 40, 66);
  let first = true;
  if (!single) {
    doc.autoTable({ startY: 82, theme: 'striped', styles: { fontSize: 8, overflow: 'linebreak', cellPadding: 3 }, headStyles: { fillColor: [59, 91, 219] },
      head: [['ID', 'Business', 'Category', 'City', 'Country', 'Website', 'Channel', 'Status', 'Follow-up']],
      body: leads.map(l => [l.lead_id, l.business_name, l.business_category, l.city, l.country, l.website_status, l.contact_channel, l.lead_status, l.next_follow_up_date].map(v => v ?? '-')) });
    first = false;
  }
  if (details) leads.forEach(l => {
    if (!first || !single) doc.addPage();
    const y = single ? 90 : 48;
    doc.setFontSize(14); doc.text(`${l.business_name} (${l.lead_id})`, 40, y, { maxWidth: 760 });
    doc.autoTable({ startY: y + 12, theme: 'grid', head: [['Field', 'Value']], headStyles: { fillColor: [59, 91, 219] },
      styles: { fontSize: 9, overflow: 'linebreak', cellPadding: 4 }, columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold' } },
      body: FIELDS.map(([k, label]) => [label, l[k] == null || l[k] === '' ? '-' : String(l[k])]) });
    first = false;
  });
  const n = doc.getNumberOfPages(), w = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`Page ${i} of ${n}`, w - 40, ph - 18, { align: 'right' }); }
  return doc;
}
function buildDocx(docx, leads, gen = '') {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, Footer, PageNumber, AlignmentType } = docx;
  const runs = t => String(t).split(/\r?\n/).map((s, i) => new TextRun({ text: s, break: i ? 1 : 0 }));
  const kids = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(leads.length === 1 ? 'Lead Report' : 'Lead Manager - Leads Report')] }),
    new Paragraph({ children: [new TextRun({ text: `Generated: ${gen}   |   Records: ${leads.length}`, color: '666666' })] })];
  leads.forEach((l, i) => {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: i > 0, spacing: { before: 240, after: 160 }, children: [new TextRun(`${l.business_name} (${l.lead_id})`)] }));
    kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [2800, 6560],
      rows: FIELDS.map(([k, label]) => new TableRow({ cantSplit: false, children: [
        new TableCell({ width: { size: 2800, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: 'EEF1F6' }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
        new TableCell({ width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: runs(l[k] == null || l[k] === '' ? '-' : l[k]) })] })] })) }));
  });
  return new Document({ creator: 'Lead Manager', title: 'Leads Report', sections: [{ children: kids,
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })] })] }) } }] });
}
// </PURE>

const S = { user: null, page: 1, size: 25, q: '', f: {}, sort: 'date_added', dir: 'desc', total: 0, editing: null, saving: false, entered: false, sel: new Set() };

// ---------- helpers ----------
const configured = SUPABASE_URL && !SUPABASE_URL.includes('YOUR_') && SUPABASE_KEY && !SUPABASE_KEY.includes('YOUR_');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
function toast(msg, type = 'ok') {
  const t = h('div', { class: 't ' + (type === 'err' ? 'err' : '') }, msg);
  $('#toast').append(t); setTimeout(() => t.remove(), type === 'err' ? 7000 : 3500);
}
function fail(e, ctx) {
  const m = e?.message || String(e);
  if (/jwt|expired|not authenticated/i.test(m)) { toast('Session expired. Please sign in again.', 'err'); sb.auth.signOut(); return; }
  if (/fetch|network|failed to load/i.test(m)) return toast('Network problem. Check your connection and try again.', 'err');
  toast(`${ctx}: ${m}`, 'err');
}
const authMsg = (m, t = 'err') => { const e = $('#authMsg'); e.textContent = m; e.className = 'msg ' + t; };
const badge = s => h('span', { class: 'badge' }, s || '-');

// ---------- auth ----------
function showAuth(which = 'login') {
  S.entered = false; $('#app').hidden = true; $('#authView').hidden = false;
  $('#loginForm').hidden = which !== 'login'; $('#resetForm').hidden = which !== 'reset'; $('#newPassForm').hidden = which !== 'new';
}
function enterApp() {
  if (S.entered) return; S.entered = true;
  $('#authView').hidden = true; $('#app').hidden = false;
  $('#userEmail').textContent = $('#setEmail').textContent = S.user.email || '';
  buildForm(); show('dashboard');
}
async function initAuth() {
  $('#showReset').onclick = () => { authMsg(''); showAuth('reset'); };
  $$('[data-back]').forEach(b => b.onclick = () => { authMsg(''); showAuth('login'); });
  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target), btn = $('button[type=submit]', e.target);
    btn.disabled = true; authMsg('');
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    btn.disabled = false;
    if (error) authMsg(/invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message);
  };
  $('#resetForm').onsubmit = async e => {
    e.preventDefault(); const btn = $('button[type=submit]', e.target); btn.disabled = true;
    const { error } = await sb.auth.resetPasswordForEmail(new FormData(e.target).get('email').trim(), { redirectTo: location.origin + location.pathname });
    btn.disabled = false;
    error ? authMsg(error.message) : authMsg('If that account exists, a reset link has been sent.', 'ok');
  };
  $('#newPassForm').onsubmit = async e => {
    e.preventDefault(); const btn = $('button[type=submit]', e.target); btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('password') });
    btn.disabled = false;
    if (error) return authMsg(error.message);
    authMsg('Password updated.', 'ok'); const { data } = await sb.auth.getSession();
    S.user = data.session?.user ?? null; S.user ? enterApp() : showAuth('login');
  };
  $('#logoutBtn').onclick = () => sb.auth.signOut();
  sb.auth.onAuthStateChange((ev, session) => {
    // Defer: calling supabase inside this callback can deadlock.
    setTimeout(() => {
      if (ev === 'PASSWORD_RECOVERY') return showAuth('new');
      S.user = session?.user ?? null;
      if (!S.user) { showAuth('login'); if (ev === 'SIGNED_OUT') authMsg(''); }
      else if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN') enterApp();
    }, 0);
  });
}

// ---------- navigation ----------
function show(view) {
  $$('main > section').forEach(s => s.hidden = s.id !== 'v-' + view);
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#side').classList.remove('open');
  if (view === 'dashboard') loadDash();
  if (view === 'leads') { loadFilterOptions().then(loadLeads); }
  if (view === 'followups') loadFollowups();
  if (view === 'import') setImportTitle();
  if (view === 'export') updateSel();
  if (view === 'form' && !S.editing) openForm(null);
}
function bindNav() {
  $$('#nav button').forEach(b => b.onclick = () => { S.editing = null; show(b.dataset.view); });
  $$('[data-go]').forEach(b => b.onclick = () => { S.editing = null; show(b.dataset.go); });
  $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  $('#themeBtn').onclick = () => {
    const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = d; try { localStorage.setItem('lm-theme', d); } catch { }
  };
  $('#detailClose').onclick = () => $('#detail').close();
}

// ---------- dashboard ----------
async function count(status) {
  let q = sb.from('leads').select('id', { count: 'exact', head: true });
  if (status) q = q.eq('lead_status', status);
  const { count: c, error } = await q; if (error) throw error; return c;
}
async function loadDash() {
  const cards = [['Total Leads', null], ['New Leads', 'New'], ['Ready to Contact', 'Ready to Contact'], ['Contacted', 'Contacted'], ['Interested', 'Interested'], ['Follow-up Needed', 'Follow-up Needed'], ['Not Interested', 'Not Interested']];
  const box = $('#stats'); box.replaceChildren(...cards.map(c => h('div', { class: 'stat' }, h('b', {}, '...'), h('span', {}, c[0]))));
  try {
    const nums = await Promise.all(cards.map(c => count(c[1])));
    $$('.stat b', box).forEach((b, i) => b.textContent = nums[i]);
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    renderRows($('#recentTable'), data, false);
  } catch (e) { fail(e, 'Could not load dashboard'); }
}

// ---------- tables ----------
function renderRows(table, rows, withActions = true, withSelect = false) {
  const cols = ['Lead ID', 'Business Name', 'Category', 'City', 'Country', 'Website Status', 'Contact Channel', 'Lead Status', 'Next Follow-up'];
  if (withActions) cols.push('Actions');
  const hc = cols.map(c => h('th', {}, c));
  if (withSelect) {
    const all = h('input', { type: 'checkbox', 'aria-label': 'Select all on this page', onchange: e => { rows.forEach(l => e.target.checked ? S.sel.add(l.id) : S.sel.delete(l.id)); $$('.rowsel', table).forEach(c => c.checked = e.target.checked); updateSel(); } });
    all.checked = rows.length > 0 && rows.every(l => S.sel.has(l.id)); hc.unshift(h('th', {}, all));
  }
  const head = h('thead', {}, h('tr', {}, ...hc));
  const body = h('tbody', {}, ...rows.map(l => {
    const overdue = l.next_follow_up_date && l.next_follow_up_date < today() && !INACTIVE.includes(l.lead_status);
    const tr = h('tr', {},
      h('td', {}, l.lead_id), h('td', {}, l.business_name), h('td', {}, l.business_category || '-'), h('td', {}, l.city || '-'),
      h('td', {}, l.country || '-'), h('td', {}, badge(l.website_status)), h('td', {}, l.contact_channel || '-'),
      h('td', {}, badge(l.lead_status)), h('td', { class: overdue ? 'overdue' : '' }, l.next_follow_up_date || '-'));
    if (withSelect) tr.prepend(h('td', {}, Object.assign(h('input', { type: 'checkbox', class: 'rowsel', 'aria-label': 'Select lead', onchange: e => { e.target.checked ? S.sel.add(l.id) : S.sel.delete(l.id); updateSel(); } }), { checked: S.sel.has(l.id) })));
    if (withActions) tr.append(h('td', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => showDetail(l) }, 'View'),
      h('button', { class: 'btn sm', onclick: () => { S.editing = l; openForm(l); show('form'); } }, 'Edit'),
      h('button', { class: 'btn sm danger', onclick: () => delLead(l) }, 'Delete')));
    return tr;
  }));
  table.replaceChildren(head, body);
}
function showDetail(l) {
  const dl = h('dl', { class: 'dl' });
  FIELDS.forEach(([k, label]) => dl.append(h('dt', {}, label), h('dd', {}, l[k] == null || l[k] === '' ? '-' : String(l[k]))));
  const ex = h('div', { class: 'row', style: 'margin-bottom:14px' }, h('span', { class: 'muted' }, 'Export this lead:'),
    ...[['xlsx', 'Excel'], ['pdf', 'PDF'], ['docx', 'Word'], ['json', 'JSON']].map(([f, n]) => h('button', { class: 'btn sm', onclick: () => doExport(f, 'one', l.id) }, n)));
  $('#detailBody').replaceChildren(h('h3', {}, l.business_name), ex, dl); $('#detail').showModal();
}
async function delLead(l) {
  if (!confirm(`Delete "${l.business_name}" (${l.lead_id})? This cannot be undone.`)) return;
  const { data, error } = await sb.from('leads').delete().eq('id', l.id).select('id');
  if (error) return fail(error, 'Delete failed');
  if (!data?.length) return toast('Delete failed: record not found or not permitted.', 'err');
  toast('Lead deleted.'); loadLeads();
}

// ---------- leads list ----------
const FILTERS = { fCountry: ['country', 'All countries'], fState: ['state', 'All states'], fCity: ['city', 'All cities'], fCategory: ['business_category', 'All categories'], fWebsite: ['website_status', 'All website statuses'], fChannel: ['contact_channel', 'All channels'], fStatus: ['lead_status', 'All lead statuses'] };
async function loadFilterOptions() {
  try {
    const { data, error } = await sb.from('leads').select('country,state,city,business_category').limit(5000);
    if (error) throw error;
    const uniq = k => [...new Set(data.map(r => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const opts = { country: uniq('country'), state: uniq('state'), city: uniq('city'), business_category: uniq('business_category'), ...OPT };
    for (const [id, [k, all]] of Object.entries(FILTERS)) {
      const sel = $('#' + id), cur = S.f[k] || '';
      sel.replaceChildren(h('option', { value: '' }, all), ...opts[k].map(o => h('option', { value: o }, o)));
      sel.value = cur;
    }
  } catch (e) { fail(e, 'Could not load filters'); }
}
function applyFilters(q) {
  const t = S.q.replace(/[,()%*\\]/g, ' ').trim();
  if (t) q = q.or(['business_name', 'city', 'state', 'country', 'phone_number_1', 'phone_number_2', 'email_address', 'research_notes', 'response_conversation_notes'].map(c => `${c}.ilike.%${t}%`).join(','));
  for (const [k, v] of Object.entries(S.f)) if (v) q = q.eq(k, v);
  return q;
}
async function loadLeads() {
  const table = $('#leadsTable'); table.style.opacity = .5;
  let q = applyFilters(sb.from('leads').select('*', { count: 'exact' }));
  const t = S.q.replace(/[,()%*\\]/g, ' ').trim();
  q = q.order(S.sort, { ascending: S.dir === 'asc', nullsFirst: false }).order('created_at', { ascending: false });
  const from = (S.page - 1) * S.size;
  const { data, count: c, error } = await q.range(from, from + S.size - 1);
  table.style.opacity = 1;
  if (error) return fail(error, 'Could not load leads');
  if (!data.length && S.page > 1 && c > 0) { S.page = Math.max(1, Math.ceil(c / S.size)); return loadLeads(); }
  S.total = c; renderRows(table, data, true, true); updateSel();
  const filtered = t || Object.values(S.f).some(Boolean);
  const empty = $('#empty'); empty.hidden = data.length > 0; table.hidden = !data.length;
  empty.textContent = filtered ? 'No leads match your search or filters.' : 'No leads yet. Add your first lead or import a JSON file.';
  const last = Math.min(from + data.length, c);
  $('#pageInfo').textContent = c ? `${from + 1}-${last} of ${c}` : '0 results';
  $('#prevBtn').disabled = S.page <= 1; $('#nextBtn').disabled = last >= c;
}
function bindLeads() {
  let timer; $('#q').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { S.q = e.target.value; S.page = 1; loadLeads(); }, 300); };
  $$('[data-f]').forEach(s => s.onchange = () => { S.f[s.dataset.f] = s.value; S.page = 1; loadLeads(); });
  $('#sortSel').onchange = e => { [S.sort, S.dir] = e.target.value.split('|'); S.page = 1; loadLeads(); };
  $('#pageSize').onchange = e => { S.size = +e.target.value; S.page = 1; loadLeads(); };
  $('#prevBtn').onclick = () => { S.page--; loadLeads(); };
  $('#nextBtn').onclick = () => { S.page++; loadLeads(); };
  $('#clearFilters').onclick = () => { S.q = ''; S.f = {}; S.page = 1; $('#q').value = ''; $$('[data-f]').forEach(s => s.value = ''); loadLeads(); };
}

// ---------- follow-ups ----------
async function loadFollowups() {
  const { data, error } = await sb.from('leads').select('*').not('next_follow_up_date', 'is', null)
    .not('lead_status', 'in', `(${INACTIVE.map(s => `"${s}"`).join(',')})`).order('next_follow_up_date', { ascending: true }).limit(1000);
  if (error) return fail(error, 'Could not load follow-ups');
  const t = today();
  renderRows($('#overdueTable'), data.filter(l => l.next_follow_up_date < t));
  renderRows($('#upcomingTable'), data.filter(l => l.next_follow_up_date >= t));
}

// ---------- form ----------
function buildForm() {
  const f = $('#leadForm'); f.replaceChildren(h('div', { id: 'leadIdLine', class: 'muted', style: 'margin-bottom:12px' }));
  for (const [title, keys] of SECTIONS) {
    const grid = h('div', { class: 'grid' });
    for (const k of keys) {
      const d = FD[k]; let input;
      if (d.type === 'select') input = h('select', { name: k }, ...(k !== 'website_status' && k !== 'lead_status' ? [h('option', { value: '' }, '-')] : []), ...OPT[k].map(o => h('option', { value: o }, o)));
      else if (d.type === 'textarea') input = h('textarea', { name: k });
      else input = h('input', { name: k, type: d.type === 'url' ? 'text' : d.type, inputmode: d.type === 'url' ? 'url' : null, autocomplete: 'off' });
      grid.append(h('label', { class: d.type === 'textarea' || k === 'full_business_address' ? 'wide' : '' }, d.label + (k === 'business_name' ? ' *' : ''), input, h('span', { class: 'ferr', 'data-err': k })));
    }
    f.append(h('fieldset', {}, h('legend', {}, title), grid));
  }
  f.append(h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', id: 'cancelBtn' }, 'Cancel'), h('button', { type: 'submit', class: 'btn primary', id: 'saveBtn' }, 'Save Lead')));
  $('#cancelBtn').onclick = () => { S.editing = null; show('leads'); };
  f.onsubmit = saveLead;
}
function openForm(l) {
  const f = $('#leadForm'); f.reset(); $$('.ferr', f).forEach(e => e.textContent = '');
  $('#formTitle').textContent = l ? 'Edit Lead' : 'Add Lead';
  $('#leadIdLine').textContent = l ? `Lead ID: ${l.lead_id}` : 'Lead ID is generated automatically on save.';
  const v = l || { date_added: today(), website_status: 'Website Status Unverified', lead_status: 'New' };
  for (const [k] of FIELDS) { const el = f.elements[k]; if (el) el.value = v[k] ?? ''; }
}
async function saveLead(e) {
  e.preventDefault(); if (S.saving) return;
  const f = e.target, payload = {}, errs = {};
  for (const [k, , type] of FIELDS) {
    if (k === 'lead_id') continue;
    let v = f.elements[k].value; if (type !== 'textarea') v = v.trim();
    v = v === '' ? null : v; payload[k] = v;
    if (v && type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[k] = 'Enter a valid email address.';
    if (v && type === 'url' && !validUrl(v)) errs[k] = 'Enter a valid web address.';
  }
  if (!payload.business_name) errs.business_name = 'Business name is required.';
  $$('.ferr', f).forEach(x => x.textContent = errs[x.dataset.err] || '');
  const bad = Object.keys(errs)[0]; if (bad) { f.elements[bad].focus(); return toast('Please fix the highlighted fields.', 'err'); }
  payload.date_added ||= today(); payload.website_status ||= 'Website Status Unverified'; payload.lead_status ||= 'New';
  S.saving = true; const btn = $('#saveBtn'); btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const q = S.editing ? sb.from('leads').update(payload).eq('id', S.editing.id) : sb.from('leads').insert({ ...payload, user_id: S.user.id });
    const { data, error } = await q.select().single();
    if (error) throw error; if (!data) throw new Error('Nothing was saved.');
    toast(S.editing ? 'Lead updated.' : `Lead saved (${data.lead_id}).`); S.editing = null; show('leads');
  } catch (err) { fail(err, 'Save failed (your input is kept)'); }  // form NOT reset on failure
  finally { S.saving = false; btn.disabled = false; btn.textContent = 'Save Lead'; }
}

// ---------- selection ----------
function updateSel() {
  const n = S.sel.size;
  $('#bulk').hidden = n === 0; $('#bulkInfo').textContent = `${n} selected`; $('#selCount').textContent = n;
  const active = (S.q ? 1 : 0) + Object.values(S.f).filter(Boolean).length;
  $('#filtHint').textContent = active ? `${active} search/filter condition(s) active in All Leads.` : 'No search/filter is active in All Leads, so this equals all leads.';
}

// ---------- library loader (lazy, pinned versions) ----------
const LIB = {
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  docx: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'
};
const loaded = {};
const loadLib = url => loaded[url] ??= new Promise((res, rej) => {
  const s = h('script', { src: url });
  s.onload = res; s.onerror = () => { delete loaded[url]; s.remove(); rej(new Error('Could not load an export library. Check your internet connection.')); };
  document.head.append(s);
});

// ---------- export ----------
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
}
async function fetchLeads(scope, oneId) {
  const out = [];
  if (scope === 'one') {
    const { data, error } = await sb.from('leads').select('*').eq('id', oneId).single(); if (error) throw error; return [data];
  }
  if (scope === 'selected') {
    const ids = [...S.sel];
    for (let i = 0; i < ids.length; i += 100) { const { data, error } = await sb.from('leads').select('*').in('id', ids.slice(i, i + 100)); if (error) throw error; out.push(...data); }
    return out.sort((a, b) => a.lead_id.localeCompare(b.lead_id));
  }
  for (let from = 0; ; from += 1000) {
    let q = sb.from('leads').select('*'); if (scope === 'filtered') q = applyFilters(q);
    const { data, error } = await q.order('date_added', { ascending: false }).order('created_at', { ascending: true }).order('id').range(from, from + 999);
    if (error) throw error; out.push(...data); if (data.length < 1000) break;
  }
  return out;
}
let exporting = false;
async function doExport(fmt, scope, oneId) {
  if (exporting) return; exporting = true;
  const btns = $$('[data-exp],#bkExport'); btns.forEach(b => b.disabled = true); $('#exportMsg').textContent = 'Preparing export...';
  try {
    if (scope === 'selected' && !S.sel.size) return toast('No leads selected. Tick rows in All Leads first.', 'err');
    const leads = await fetchLeads(scope, oneId);
    if (!leads.length) return toast('There are no leads to export for this selection.', 'err');
    const gen = new Date().toLocaleString(), base = scope === 'one' ? `lead-${leads[0].lead_id}` : `lead-manager-${scope}-${today()}`;
    if (fmt === 'json') download(new Blob([toExportJson(leads)], { type: 'application/json' }), base + '.json');
    else if (fmt === 'xlsx') {
      await loadLib(LIB.xlsx); const wb = buildXlsx(window.XLSX, leads);
      download(new Blob([window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), base + '.xlsx');
    } else if (fmt === 'pdf') {
      await loadLib(LIB.jspdf); await loadLib(LIB.autotable);
      download(buildPdf(window.jspdf.jsPDF, leads, { details: scope === 'one' || $('#pdfDetails').checked, gen }).output('blob'), base + '.pdf');
    } else if (fmt === 'docx') {
      await loadLib(LIB.docx); download(await window.docx.Packer.toBlob(buildDocx(window.docx, leads, gen)), base + '.docx');
    }
    toast(`Exported ${leads.length} lead(s) as ${fmt.toUpperCase()}.`);
  } catch (e) { fail(e, 'Export failed'); }
  finally { exporting = false; btns.forEach(b => b.disabled = false); $('#exportMsg').textContent = ''; }
}

// ---------- import / restore ----------
const IMP = { items: [], mode: 'import', running: false, file: '' };
const templateObj = () => { const o = {}; FIELDS.forEach(([k]) => o[k] = null);
  return Object.assign(o, { date_added: today(), business_name: 'Example Business', business_category: 'Bakery', country: 'Pakistan', city: 'Karachi', website_status: 'No Website Found', phone_number_1: '+92 300 0000000', contact_channel: 'WhatsApp', lead_status: 'New' }); };
function setImportTitle() { $('#importTitle').textContent = IMP.mode === 'restore' ? 'Restore from Backup' : 'Import JSON'; }
async function loadDbIndex() {
  const idx = newIndex();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('leads').select('lead_id,business_name,city,country,phone_number_1,phone_number_2').order('id').range(from, from + 999);
    if (error) throw error; data.forEach(r => addToIndex(idx, r, r.lead_id)); if (data.length < 1000) break;
  }
  return idx;
}
async function handleImportFile(file, mode) {
  if (!file) return; IMP.mode = mode; show('import'); setImportTitle();
  const msg = $('#importMsg'); msg.className = 'msg'; msg.textContent = 'Reading file...';
  try {
    if (file.size > 25e6) throw new Error('File is larger than 25 MB.');
    const p = parseJsonText(await file.text());
    if (p.error) { msg.className = 'msg err'; msg.textContent = p.error; return; }
    msg.textContent = 'Checking for duplicates in your database...';
    IMP.items = analyzeImport(p.records, await loadDbIndex()); IMP.file = file.name; msg.textContent = '';
    $('#importPick').hidden = true; $('#importPreview').hidden = false; renderImport();
  } catch (e) { msg.textContent = ''; fail(e, 'Could not read file'); }
  finally { $('#importFile').value = ''; $('#restoreFile').value = ''; }
}
function resetImport() { IMP.items = []; $('#importPick').hidden = false; $('#importPreview').hidden = true; $('#importMsg').textContent = ''; }
function renderSummary() {
  const s = summarize(IMP.items);
  $('#importSummary').replaceChildren(...[['Records', s.total], ['New', s.fresh], [`Duplicates (db ${s.dupDb} / file ${s.dupFile})`, s.dupDb + s.dupFile], ['Invalid', s.invalid], ['Imported', s.done], ['Failed', s.failed], ['Will import', s.toImport]]
    .map(([l, n]) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, l))));
  const notes = [`File: ${IMP.file}.`];
  if (s.withLeadId) notes.push(`${s.withLeadId} record(s) contain a lead_id; new Lead IDs are generated on import.`);
  if (IMP.mode === 'restore') notes.push('Restore only ADDS records. Existing leads are never changed or deleted. Possible duplicates are skipped unless you choose "Import anyway".');
  $('#importNote').textContent = notes.join(' ');
  const b = $('#importGo'); b.textContent = `Import ${s.toImport} record(s)`; b.disabled = IMP.running || !s.toImport;
}
function renderImport() {
  renderSummary();
  const head = h('thead', {}, h('tr', {}, ...['#', 'Business', 'City', 'Country', 'Status', 'Details', 'Action'].map(c => h('th', {}, c))));
  const body = h('tbody', {}, ...IMP.items.map(it => {
    const r = it.rec || {};
    const status = it.done ? 'Imported' : it.failed ? 'Failed' : it.errors.length ? 'Invalid' : it.dup ? (it.dup.where === 'file' ? 'Duplicate in file' : 'Duplicate') : 'New';
    const details = [...it.errors, it.failed && 'Save failed: ' + it.failed, it.dup?.reason, ...it.warnings].filter(Boolean).join(' | ');
    const act = h('td', { class: 'actions' });
    if (!it.done) {
      if (it.dup && !it.errors.length) act.append(h('select', { class: 'sm', onchange: e => { it.action = e.target.value; renderSummary(); } },
        h('option', { value: 'skip', selected: it.action === 'skip' }, 'Skip duplicate'), h('option', { value: 'import', selected: it.action === 'import' }, 'Import anyway')));
      else if (!it.errors.length) act.append(h('span', { class: 'muted' }, 'Import'));
      act.append(h('button', { class: 'btn sm', onclick: () => showReview(it) }, 'Review record'));
    }
    return h('tr', {}, h('td', {}, it.n), h('td', {}, r.business_name || '-'), h('td', {}, r.city || '-'), h('td', {}, r.country || '-'), h('td', {}, badge(status)), h('td', { class: 'wrap' }, details || '-'), act);
  }));
  $('#importTable').replaceChildren(head, body);
}
function showReview(it) {
  const box = h('div', {}, h('h3', {}, `Record #${it.n}`));
  if (it.errors.length) box.append(h('p', { class: 'overdue' }, 'Errors: ' + it.errors.join(' ')));
  if (it.dup) box.append(h('p', {}, 'Possible duplicate: ' + it.dup.reason));
  if (it.warnings.length) box.append(h('p', { class: 'muted' }, 'Warnings: ' + it.warnings.join(' ')));
  if (it.rec && !it.errors.length) { const dl = h('dl', { class: 'dl' }); FIELDS.forEach(([k, label]) => { if (k !== 'lead_id') dl.append(h('dt', {}, label), h('dd', {}, it.rec[k] ?? '-')); }); box.append(dl); }
  else box.append(h('pre', { class: 'raw' }, JSON.stringify(it.raw, null, 2) ?? String(it.raw)));
  $('#detailBody').replaceChildren(box); $('#detail').showModal();
}
async function runImport() {
  if (IMP.running) return;
  const todo = IMP.items.filter(i => i.action === 'import' && !i.done && !i.errors.length);
  if (!todo.length) return;
  const dups = todo.filter(i => i.dup).length;
  if (!confirm(`Import ${todo.length} record(s)${dups ? `, including ${dups} possible duplicate(s) you chose to import anyway` : ''}?${IMP.mode === 'restore' ? '\nExisting leads will not be changed or deleted.' : ''}`)) return;
  IMP.running = true; renderSummary(); $('#importMsg').textContent = 'Importing...';
  try {
    for (let i = 0; i < todo.length; i += 100) {
      const chunk = todo.slice(i, i + 100);
      const { error } = await sb.from('leads').insert(chunk.map(c => ({ ...c.rec, user_id: S.user.id })));
      if (!error) { chunk.forEach(c => { c.done = true; c.failed = null; }); continue; }
      if (/jwt|expired|fetch|network/i.test(error.message)) { todo.slice(i).forEach(c => c.failed = error.message); fail(error, 'Import interrupted'); break; }
      for (const c of chunk) {  // isolate the bad row(s)
        const { error: e } = await sb.from('leads').insert({ ...c.rec, user_id: S.user.id });
        if (e) c.failed = e.message; else { c.done = true; c.failed = null; }
      }
    }
  } catch (e) { fail(e, 'Import failed'); }
  IMP.running = false; $('#importMsg').textContent = '';
  const s = summarize(IMP.items); renderImport();
  s.failed ? toast(`Imported ${s.done}; ${s.failed} failed. Failed rows are kept in the preview so you can retry.`, 'err') : toast(`Imported ${s.done} record(s).`);
}
function bindImportExport() {
  $$('[data-exp]').forEach(b => b.onclick = () => doExport(b.dataset.exp, $('input[name=scope]:checked').value));
  $('#bkExport').onclick = () => doExport('json', 'all');
  $('#importFile').onchange = e => handleImportFile(e.target.files[0], 'import');
  $('#restoreFile').onchange = e => handleImportFile(e.target.files[0], 'restore');
  $('#tplBtn').onclick = () => download(new Blob([JSON.stringify([templateObj()], null, 2)], { type: 'application/json' }), 'lead-import-template.json');
  $('#sample').textContent = JSON.stringify([templateObj()], null, 2);
  $('#importGo').onclick = runImport;
  $('#importCancel').onclick = () => { if (!IMP.running) resetImport(); };
  $('#dupSkip').onclick = () => { IMP.items.forEach(i => { if (i.dup && !i.done) i.action = 'skip'; }); renderImport(); };
  $('#dupAll').onclick = () => { IMP.items.forEach(i => { if (i.dup && !i.done && !i.errors.length) i.action = 'import'; }); renderImport(); };
  $('#bulkExport').onclick = () => { show('export'); $('input[name=scope][value=selected]').checked = true; };
  $('#bulkClear').onclick = () => { S.sel.clear(); $$('.rowsel').forEach(c => c.checked = false); updateSel(); };
}

// ---------- boot ----------
try { const t = localStorage.getItem('lm-theme'); if (t) document.documentElement.dataset.theme = t; } catch { }
if (!configured) { $('#cfgWarn').hidden = false; showAuth('login'); authMsg('Configuration missing. See config.js.'); }
else { bindNav(); bindLeads(); bindImportExport(); initAuth(); }
