'use strict';

/* ---------- Données de base ---------- */

const STORE_KEY = 'mes-depenses.v1';

const CATEGORIES = {
  expense: [
    { id: 'food',      name: 'Courses',     icon: '🛒', color: '#16a34a' },
    { id: 'resto',     name: 'Restaurant',  icon: '🍽️', color: '#ea580c' },
    { id: 'transport', name: 'Transport',   icon: '🚌', color: '#2563eb' },
    { id: 'home',      name: 'Logement',    icon: '🏠', color: '#7c3aed' },
    { id: 'bills',     name: 'Factures',    icon: '💡', color: '#ca8a04' },
    { id: 'health',    name: 'Santé',       icon: '💊', color: '#dc2626' },
    { id: 'fun',       name: 'Loisirs',     icon: '🎮', color: '#db2777' },
    { id: 'shopping',  name: 'Shopping',    icon: '🛍️', color: '#0891b2' },
    { id: 'phone',     name: 'Téléphone',   icon: '📱', color: '#4f46e5' },
    { id: 'school',    name: 'Éducation',   icon: '📚', color: '#0d9488' },
    { id: 'gift',      name: 'Cadeaux',     icon: '🎁', color: '#be185d' },
    { id: 'other',     name: 'Autre',       icon: '📦', color: '#64748b' },
  ],
  income: [
    { id: 'salary',    name: 'Salaire',     icon: '💼', color: '#15803d' },
    { id: 'sales',     name: 'Ventes',      icon: '💰', color: '#0f766e' },
    { id: 'giftin',    name: 'Cadeau reçu', icon: '🎁', color: '#9333ea' },
    { id: 'otherin',   name: 'Autre',       icon: '➕', color: '#64748b' },
  ],
};

const CURRENCIES = [
  { symbol: '€',    decimals: 2 },
  { symbol: 'FCFA', decimals: 0 },
  { symbol: '$',    decimals: 2 },
  { symbol: 'DH',   decimals: 2 },
  { symbol: 'DA',   decimals: 2 },
  { symbol: 'DT',   decimals: 3 },
  { symbol: 'CHF',  decimals: 2 },
  { symbol: '£',    decimals: 2 },
];

const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Stockage ---------- */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && Array.isArray(raw.tx)) {
      return { tx: raw.tx, settings: { currency: '€', budget: 0, ...raw.settings } };
    }
  } catch (_) { /* données illisibles : on repart de zéro */ }
  return { tx: [], settings: { currency: '€', budget: 0 } };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = load();
const view = {
  month: monthKey(new Date()),
  tab: 'list',
  editingId: null,
  formType: 'expense',
  formCat: null,
};

/* ---------- Formatage ---------- */

function currency() {
  return CURRENCIES.find((c) => c.symbol === state.settings.currency) || CURRENCIES[0];
}

function fmt(n, sign = false) {
  const c = currency();
  const s = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(Math.abs(n));
  const prefix = sign ? (n < 0 ? '− ' : '+ ') : (n < 0 ? '−' : '');
  return `${prefix}${s} ${c.symbol}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

function dayLabel(iso) {
  const today = isoDate(new Date());
  const yest = isoDate(new Date(Date.now() - 864e5));
  if (iso === today) return "aujourd'hui";
  if (iso === yest) return 'hier';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function findCat(type, id) {
  const list = CATEGORIES[type] || CATEGORIES.expense;
  return list.find((c) => c.id === id) || list[list.length - 1];
}

function parseAmount(str) {
  const clean = String(str).replace(/\s/g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(clean)) return NaN;
  return parseFloat(clean);
}

/* ---------- Calculs ---------- */

function monthTx(key = view.month) {
  return state.tx
    .filter((t) => t.date.startsWith(key))
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.created || 0) - (a.created || 0));
}

function totals(list) {
  let income = 0, expense = 0;
  for (const t of list) t.type === 'income' ? (income += t.amount) : (expense += t.amount);
  return { income, expense, balance: income - expense };
}

/* ---------- Affichage ---------- */

function render() {
  $('#monthLabel').textContent = monthLabel(view.month);
  renderSummary();
  for (const tab of ['list', 'stats', 'settings']) {
    $(`#tab-${tab}`).hidden = view.tab !== tab;
  }
  document.querySelectorAll('.bottom button').forEach((b) => b.classList.toggle('active', b.dataset.tab === view.tab));
  $('#summary').hidden = view.tab === 'settings';
  $('#fab').hidden = view.tab === 'settings';
  if (view.tab === 'list') renderList();
  if (view.tab === 'stats') renderStats();
  if (view.tab === 'settings') renderSettings();
}

function renderSummary() {
  const t = totals(monthTx());
  const budget = Number(state.settings.budget) || 0;
  let budgetHtml = '';
  if (budget > 0) {
    const pct = Math.round((t.expense / budget) * 100);
    const left = budget - t.expense;
    budgetHtml = `
      <div class="budget ${pct > 100 ? 'over' : ''}">
        <div class="meta"><span>Budget : ${pct} % utilisé</span>
          <span>${left >= 0 ? `reste ${fmt(left)}` : `dépassé de ${fmt(-left)}`}</span></div>
        <div class="bar"><i style="width:${Math.min(pct, 100)}%"></i></div>
      </div>`;
  }
  $('#summary').innerHTML = `
    <div class="label">Solde du mois</div>
    <div class="balance ${t.balance < 0 ? 'out' : ''}">${fmt(t.balance)}</div>
    <div class="split">
      <div><span class="label">Revenus</span><strong class="in">${fmt(t.income)}</strong></div>
      <div><span class="label">Dépenses</span><strong class="out">${fmt(t.expense)}</strong></div>
    </div>
    ${budgetHtml}`;
}

function renderList() {
  const list = monthTx();
  if (!list.length) {
    $('#tab-list').innerHTML = `
      <div class="empty"><div>🧾</div>Aucune opération ce mois-ci.<br>Touche <b>+</b> pour ajouter ta première dépense.</div>`;
    return;
  }
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  let html = '';
  for (const [date, items] of groups) {
    const dayTotal = totals(items).balance;
    html += `<div class="day"><span>${dayLabel(date)}</span><span>${fmt(dayTotal, true)}</span></div><div class="list">`;
    for (const t of items) {
      const c = findCat(t.type, t.category);
      const isIn = t.type === 'income';
      html += `
        <button class="tx" data-id="${t.id}">
          <span class="bubble" style="background:${c.color}22">${c.icon}</span>
          <span class="info"><b>${escapeHtml(c.name)}</b>${t.note ? `<small>${escapeHtml(t.note)}</small>` : ''}</span>
          <span class="amt ${isIn ? 'in' : ''}">${fmt(isIn ? t.amount : -t.amount, true)}</span>
        </button>`;
    }
    html += '</div>';
  }
  $('#tab-list').innerHTML = html;
}

function donutSvg(parts, total) {
  const r = 70, sw = 22, circ = 2 * Math.PI * r;
  let offset = 0, arcs = '';
  for (const p of parts) {
    const len = (p.value / total) * circ;
    // petit espace entre les segments quand il y en a plusieurs
    const gap = parts.length > 1 ? Math.min(2, len / 2) : 0;
    arcs += `<circle r="${r}" cx="90" cy="90" fill="none" stroke="${p.color}" stroke-width="${sw}"
      stroke-dasharray="${len - gap} ${circ - len + gap}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 90 90)"/>`;
    offset += len;
  }
  return `<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Répartition des dépenses">
    <circle r="${r}" cx="90" cy="90" fill="none" stroke="var(--line)" stroke-width="${sw}"/>${arcs}</svg>`;
}

function renderStats() {
  const list = monthTx().filter((t) => t.type === 'expense');
  const total = list.reduce((s, t) => s + t.amount, 0);
  if (!total) {
    $('#tab-stats').innerHTML = `<div class="empty"><div>📊</div>Pas encore de dépenses à analyser ce mois-ci.</div>`;
    return;
  }
  const byCat = new Map();
  for (const t of list) byCat.set(t.category, (byCat.get(t.category) || 0) + t.amount);
  const parts = [...byCat.entries()]
    .map(([id, value]) => ({ ...findCat('expense', id), value }))
    .sort((a, b) => b.value - a.value);

  // Comparaison avec le mois précédent
  const prev = totals(monthTx(shiftMonth(view.month, -1))).expense;
  let compare = '—';
  if (prev > 0) {
    const diff = Math.round(((total - prev) / prev) * 100);
    compare = `<span class="${diff > 0 ? 'out' : 'in'}">${diff > 0 ? '+' : ''}${diff} %</span>`;
  }

  // Moyenne par jour (jours écoulés si c'est le mois en cours)
  const [y, m] = view.month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = view.month === monthKey(new Date()) ? new Date().getDate() : daysInMonth;
  const biggest = list.reduce((a, b) => (b.amount > a.amount ? b : a));

  $('#tab-stats').innerHTML = `
    <div class="card">
      <h3>Dépenses par catégorie</h3>
      <div class="donut-wrap">${donutSvg(parts, total)}
        <div class="center"><small>Total</small><strong>${fmt(total)}</strong></div>
      </div>
      ${parts.map((p) => `
        <div class="legend-row">
          <span class="bubble" style="background:${p.color}22;width:32px;height:32px;font-size:1rem">${p.icon}</span>
          <span class="name">${p.name}</span>
          <span class="pct">${Math.round((p.value / total) * 100)} %</span>
          <span class="val">${fmt(p.value)}</span>
        </div>`).join('')}
    </div>
    <div class="facts">
      <div><small>Moyenne par jour</small><strong>${fmt(total / days)}</strong></div>
      <div><small>vs mois précédent</small><strong>${compare}</strong></div>
      <div><small>Nombre de dépenses</small><strong>${list.length}</strong></div>
      <div><small>Plus grosse dépense</small><strong>${fmt(biggest.amount)}</strong></div>
    </div>`;
}

function renderSettings() {
  const s = state.settings;
  $('#tab-settings').innerHTML = `
    <div class="card">
      <h3>Général</h3>
      <div class="setting">
        <span>Devise</span>
        <select id="sCurrency">
          ${CURRENCIES.map((c) => `<option ${c.symbol === s.currency ? 'selected' : ''}>${c.symbol}</option>`).join('')}
        </select>
      </div>
      <div class="setting">
        <span>Budget mensuel<br><small class="label" style="color:var(--muted)">0 = pas de budget</small></span>
        <input id="sBudget" inputmode="decimal" value="${s.budget || ''}" placeholder="0">
      </div>
    </div>
    <div class="card">
      <h3>Sauvegarde</h3>
      <p class="hint">Tes données restent uniquement sur ce téléphone. Fais une sauvegarde de temps en temps.</p>
      <div class="btn-col">
        <button class="btn ghost" id="sExportCsv">📄 Exporter en tableur (CSV)</button>
        <button class="btn ghost" id="sBackup">💾 Sauvegarder (fichier .json)</button>
        <button class="btn ghost" id="sRestore">📂 Restaurer une sauvegarde</button>
      </div>
    </div>
    <div class="card">
      <h3>Zone dangereuse</h3>
      <p class="hint">${state.tx.length} opération(s) enregistrée(s).</p>
      <button class="btn danger" id="sReset" style="width:100%">Tout effacer</button>
    </div>`;
}

/* ---------- Formulaire ---------- */

function renderCats() {
  $('#fCats').innerHTML = CATEGORIES[view.formType].map((c) => `
    <button type="button" class="cat ${c.id === view.formCat ? 'active' : ''}" data-cat="${c.id}"
      role="radio" aria-checked="${c.id === view.formCat}"><span>${c.icon}</span>${c.name}</button>`).join('');
}

function setFormType(type) {
  view.formType = type;
  if (!CATEGORIES[type].some((c) => c.id === view.formCat)) view.formCat = CATEGORIES[type][0].id;
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  renderCats();
}

function openForm(tx = null) {
  view.editingId = tx ? tx.id : null;
  $('#sheetTitle').textContent = tx ? "Modifier l'opération" : 'Nouvelle opération';
  $('#fDelete').hidden = !tx;
  $('#fCurrency').textContent = currency().symbol;
  $('#fAmount').value = tx ? String(tx.amount).replace('.', ',') : '';
  $('#fNote').value = tx ? tx.note || '' : '';
  const today = new Date();
  $('#fDate').value = tx ? tx.date
    : (view.month === monthKey(today) ? isoDate(today) : `${view.month}-01`);
  view.formCat = tx ? tx.category : null;
  setFormType(tx ? tx.type : 'expense');
  $('#backdrop').hidden = false;
  $('#sheet').hidden = false;
  if (!tx) setTimeout(() => $('#fAmount').focus(), 50);
}

function closeForm() {
  $('#backdrop').hidden = true;
  $('#sheet').hidden = true;
  view.editingId = null;
}

function submitForm(e) {
  e.preventDefault();
  const amount = parseAmount($('#fAmount').value);
  if (!(amount > 0)) {
    toast('Entre un montant valide');
    $('#fAmount').focus();
    return;
  }
  const data = {
    type: view.formType,
    amount: Math.round(amount * 1000) / 1000,
    category: view.formCat,
    date: $('#fDate').value || isoDate(new Date()),
    note: $('#fNote').value.trim(),
  };
  if (view.editingId) {
    const t = state.tx.find((x) => x.id === view.editingId);
    Object.assign(t, data);
    toast('Opération modifiée');
  } else {
    state.tx.push({ id: uid(), created: Date.now(), ...data });
    toast(data.type === 'income' ? 'Revenu ajouté' : 'Dépense ajoutée');
  }
  save();
  view.month = data.date.slice(0, 7);
  closeForm();
  render();
}

function deleteTx() {
  if (!view.editingId || !confirm('Supprimer cette opération ?')) return;
  state.tx = state.tx.filter((t) => t.id !== view.editingId);
  save();
  closeForm();
  render();
  toast('Opération supprimée');
}

/* ---------- Export / sauvegarde ---------- */

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportCsv() {
  const rows = [['Date', 'Type', 'Catégorie', 'Montant', 'Devise', 'Note']];
  const sorted = [...state.tx].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    rows.push([
      t.date,
      t.type === 'income' ? 'Revenu' : 'Dépense',
      findCat(t.type, t.category).name,
      String(t.type === 'income' ? t.amount : -t.amount).replace('.', ','),
      state.settings.currency,
      t.note || '',
    ]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`depenses-${isoDate(new Date())}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

function backup() {
  download(`sauvegarde-depenses-${isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
}

function restore(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.tx)) throw new Error('format');
      const valid = data.tx.filter((t) => t && t.id && t.date && typeof t.amount === 'number' && CATEGORIES[t.type]);
      if (!confirm(`Remplacer tes données actuelles par cette sauvegarde (${valid.length} opérations) ?`)) return;
      state = { tx: valid, settings: { currency: '€', budget: 0, ...data.settings } };
      save();
      render();
      toast('Sauvegarde restaurée');
    } catch (_) {
      toast("Ce fichier n'est pas une sauvegarde valide");
    }
  };
  reader.readAsText(file);
}

/* ---------- Divers ---------- */

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- Événements ---------- */

$('#prevMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, -1); render(); });
$('#nextMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, 1); render(); });
$('#fab').addEventListener('click', () => openForm());
$('#backdrop').addEventListener('click', closeForm);
$('#fCancel').addEventListener('click', closeForm);
$('#fDelete').addEventListener('click', deleteTx);
$('#sheet').addEventListener('submit', submitForm);

document.querySelector('.bottom').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) { view.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }
});

document.querySelector('.seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (b) setFormType(b.dataset.type);
});

$('#fCats').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (b) { view.formCat = b.dataset.cat; renderCats(); }
});

$('#tab-list').addEventListener('click', (e) => {
  const b = e.target.closest('.tx');
  if (b) openForm(state.tx.find((t) => t.id === b.dataset.id));
});

$('#tab-settings').addEventListener('change', (e) => {
  if (e.target.id === 'sCurrency') {
    state.settings.currency = e.target.value;
    save(); render();
  }
  if (e.target.id === 'sBudget') {
    const v = parseAmount(e.target.value || '0');
    state.settings.budget = v > 0 ? v : 0;
    save(); render();
    toast(state.settings.budget ? 'Budget enregistré' : 'Budget désactivé');
  }
});

$('#tab-settings').addEventListener('click', (e) => {
  const id = e.target.closest('button')?.id;
  if (id === 'sExportCsv') exportCsv();
  if (id === 'sBackup') backup();
  if (id === 'sRestore') $('#importFile').click();
  if (id === 'sReset' && confirm('Effacer TOUTES les opérations ? Cette action est définitive.')) {
    state.tx = [];
    save(); render();
    toast('Toutes les données ont été effacées');
  }
});

$('#importFile').addEventListener('change', (e) => {
  if (e.target.files[0]) restore(e.target.files[0]);
  e.target.value = '';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeForm();
});

/* ---------- Démarrage ---------- */

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
