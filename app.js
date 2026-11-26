'use strict';

/* ---------- Données de base ---------- */

const STORE_KEY = 'mes-depenses.v1';

const DEFAULT_SETTINGS = {
  currency: '€',
  budget: 0,
  catBudgets: {},    // budget maximum par catégorie de dépense : { food: 150, ... }
  reminderDays: 7,   // rappel de sauvegarde (0 = jamais)
  lastBackup: 0,     // date de la dernière sauvegarde
  backupSnooze: 0,   // « Plus tard » : pas de rappel avant cette date
};

const REMINDER_CHOICES = [
  { value: 7,  label: 'Chaque semaine' },
  { value: 14, label: 'Tous les 15 jours' },
  { value: 30, label: 'Chaque mois' },
  { value: 0,  label: 'Jamais' },
];

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
      return {
        tx: raw.tx,
        recurring: Array.isArray(raw.recurring) ? raw.recurring : [],
        settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      };
    }
  } catch (_) { /* données illisibles : on repart de zéro */ }
  return { tx: [], recurring: [], settings: { ...DEFAULT_SETTINGS } };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = load();
let pendingToast = null; // message à afficher au prochain affichage (ex. après déverrouillage)
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
  if (pendingToast) { toast(pendingToast); pendingToast = null; }
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
  let html = overBudgetBanner() + backupBanner();
  for (const [date, items] of groups) {
    const dayTotal = totals(items).balance;
    html += `<div class="day"><span>${dayLabel(date)}</span><span>${fmt(dayTotal, true)}</span></div><div class="list">`;
    for (const t of items) {
      const c = findCat(t.type, t.category);
      const isIn = t.type === 'income';
      html += `
        <button class="tx" data-id="${t.id}">
          <span class="bubble" style="background:${c.color}22">${c.icon}</span>
          <span class="info"><b>${escapeHtml(c.name)}</b>${txSubtitle(t)}</span>
          <span class="amt ${isIn ? 'in' : ''}">${fmt(isIn ? t.amount : -t.amount, true)}</span>
        </button>`;
    }
    html += '</div>';
  }
  $('#tab-list').innerHTML = html;
}

function txSubtitle(t) {
  const parts = [];
  if (t.recurringId) parts.push('🔁 Récurrent');
  if (t.note) parts.push(escapeHtml(t.note));
  return parts.length ? `<small>${parts.join(' · ')}</small>` : '';
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

/* ---------- Budgets par catégorie ---------- */

function catBudget(id) {
  return Number((state.settings.catBudgets || {})[id]) || 0;
}

function spentByCat(key = view.month) {
  const m = new Map();
  for (const t of monthTx(key)) {
    if (t.type === 'expense') m.set(t.category, (m.get(t.category) || 0) + t.amount);
  }
  return m;
}

function budgetRows(key = view.month) {
  const spent = spentByCat(key);
  return CATEGORIES.expense
    .filter((c) => catBudget(c.id) > 0)
    .map((c) => {
      const budget = catBudget(c.id);
      const s = spent.get(c.id) || 0;
      return { ...c, budget, spent: s, pct: Math.round((s / budget) * 100) };
    });
}

function budgetsCard() {
  const rows = budgetRows().sort((a, b) => b.pct - a.pct);
  if (!rows.length) {
    return `
      <div class="card">
        <h3>Budgets par catégorie</h3>
        <p class="hint">Aucun budget défini. Fixe un maximum par catégorie dans
          <b>Réglages → Budgets par catégorie</b> (ex. 150 € pour les restaurants).</p>
      </div>`;
  }
  return `
    <div class="card">
      <h3>Budgets par catégorie</h3>
      ${rows.map((r) => {
        const level = r.pct > 100 ? 'over' : r.pct >= 80 ? 'warn' : '';
        const status = r.pct > 100
          ? `⚠️ Dépassé de ${fmt(r.spent - r.budget)}`
          : r.pct >= 80 ? `⚠️ Presque atteint · reste ${fmt(r.budget - r.spent)}` : `Reste ${fmt(r.budget - r.spent)}`;
        return `
          <div class="cb-row">
            <div class="cb-head"><span>${r.icon} ${r.name}</span><span>${fmt(r.spent)} / ${fmt(r.budget)}</span></div>
            <div class="bar ${level}"><i style="width:${Math.min(r.pct, 100)}%"></i></div>
            <small class="${level}">${status} · ${r.pct} %</small>
          </div>`;
      }).join('')}
    </div>`;
}

function overBudgetBanner() {
  const over = budgetRows().filter((r) => r.pct > 100);
  if (!over.length) return '';
  return `
    <div class="card reminder over-banner" role="status">
      <div class="reminder-text">
        <b>⚠️ ${over.length === 1 ? 'Budget dépassé' : `${over.length} budgets dépassés`}</b>
        <small>${over.map((r) => `${r.icon} ${r.name} (${fmt(r.spent)} / ${fmt(r.budget)})`).join(' · ')}</small>
      </div>
      <div class="reminder-actions"><button class="btn ghost" data-action="stats">Voir les budgets</button></div>
    </div>`;
}

// Message après l'ajout d'une dépense si elle fait dépasser (ou presque) le budget de sa catégorie
function budgetAlert(t) {
  if (t.type !== 'expense') return null;
  const budget = catBudget(t.category);
  if (!budget) return null;
  const spent = spentByCat(t.date.slice(0, 7)).get(t.category) || 0;
  const name = findCat('expense', t.category).name;
  const pct = Math.round((spent / budget) * 100);
  if (spent > budget) return `⚠️ Budget ${name} dépassé : ${fmt(spent)} / ${fmt(budget)}`;
  if (pct >= 80) return `Attention : ${pct} % du budget ${name} utilisé`;
  return null;
}

/* ---------- Graphique d'évolution ---------- */

function barPath(x, base, w, h) {
  // barre avec les coins du haut arrondis (4 px), posée sur la ligne de base
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  const y = base - h;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

function evolutionCard() {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(view.month, -i));
  const data = months.map((k) => ({ k, ...totals(monthTx(k)) }));
  const max = Math.max(0, ...data.map((d) => Math.max(d.income, d.expense)));
  if (!max) {
    return `<div class="card"><h3>Évolution sur 6 mois</h3>
      <p class="hint">Pas encore de données sur les 6 derniers mois.</p></div>`;
  }
  const W = 320, base = 130, plotH = 112, groupW = W / 6, barW = 15, gap = 2;
  const label = (k) => {
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  };
  let bars = '';
  data.forEach((d, i) => {
    const cx = groupW * i + groupW / 2;
    const hIn = (d.income / max) * plotH;
    const hOut = (d.expense / max) * plotH;
    const selected = d.k === view.month;
    bars += `
      <g class="evo-group${selected ? ' sel' : ''}" data-month="${d.k}">
        <title>${monthLabel(d.k)} : revenus ${fmt(d.income)}, dépenses ${fmt(d.expense)}</title>
        <rect class="evo-hit" x="${groupW * i}" y="0" width="${groupW}" height="${base + 26}"/>
        <path d="${barPath(cx - barW - gap / 2, base, barW, hIn)}" fill="var(--chart-in)"/>
        <path d="${barPath(cx + gap / 2, base, barW, hOut)}" fill="var(--chart-out)"/>
        <text x="${cx}" y="${base + 18}" text-anchor="middle" class="evo-label">${label(d.k)}</text>
      </g>`;
  });
  const sel = data[data.length - 1];
  const avg = data.reduce((s, d) => s + d.expense, 0) / data.length;
  return `
    <div class="card">
      <h3>Évolution sur 6 mois</h3>
      <div class="legend">
        <span><i style="background:var(--chart-in)"></i>Revenus</span>
        <span><i style="background:var(--chart-out)"></i>Dépenses</span>
      </div>
      <svg class="evo" viewBox="0 0 ${W} ${base + 26}" width="100%" role="img"
        aria-label="Revenus et dépenses des 6 derniers mois">
        <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="evo-base"/>
        ${bars}
      </svg>
      <p class="evo-detail"><b>${monthLabel(sel.k)}</b> : revenus <b>${fmt(sel.income)}</b> · dépenses <b>${fmt(sel.expense)}</b></p>
      <p class="hint" style="margin:0">Dépense moyenne : ${fmt(avg)} par mois. Touche un mois pour l'afficher.</p>
    </div>`;
}

function renderStats() {
  const list = monthTx().filter((t) => t.type === 'expense');
  const total = list.reduce((s, t) => s + t.amount, 0);
  if (!total) {
    $('#tab-stats').innerHTML = `
      ${budgetsCard()}
      ${evolutionCard()}
      <div class="empty" style="padding:24px"><div>📊</div>Pas encore de dépenses ce mois-ci.</div>`;
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
    ${budgetsCard()}
    ${evolutionCard()}
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
    <details class="card budgets-set">
      <summary><h3>Budgets par catégorie</h3>
        <span class="hint">${budgetRows().length ? `${budgetRows().length} budget(s) défini(s)` : 'Aucun'} ›</span></summary>
      <p class="hint">Montant maximum à dépenser par mois dans chaque catégorie. Laisse vide pour ne pas en mettre.</p>
      ${CATEGORIES.expense.map((c) => `
        <label class="setting">
          <span>${c.icon} ${c.name}</span>
          <input data-catbudget="${c.id}" inputmode="decimal" placeholder="Aucun"
            value="${catBudget(c.id) ? String(catBudget(c.id)).replace('.', ',') : ''}">
        </label>`).join('')}
    </details>
    <div class="card">
      <h3>Opérations récurrentes</h3>
      ${state.recurring.length ? state.recurring
        .slice().sort((a, b) => a.next.localeCompare(b.next))
        .map((r) => {
          const c = findCat(r.type, r.category);
          const isIn = r.type === 'income';
          return `
            <div class="rec-row">
              <span class="bubble" style="background:${c.color}22;width:36px;height:36px;font-size:1.05rem">${c.icon}</span>
              <span class="info">
                <b>${escapeHtml(c.name)}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</b>
                <small>${describeRule(r)} · prochaine : ${shortDate(r.next)}</small>
              </span>
              <span class="amt ${isIn ? 'in' : ''}">${fmt(isIn ? r.amount : -r.amount, true)}</span>
              <button class="btn danger small" data-stop="${r.id}">Arrêter</button>
            </div>`;
        }).join('') : `
        <p class="hint">Aucune pour l'instant. Pour en créer une (loyer, abonnement, salaire…),
          ajoute une opération avec <b>+</b> et choisis « Répéter : chaque mois ».</p>`}
    </div>
    <div class="card">
      <h3>Sécurité</h3>
      ${pinData ? `
        <p class="hint">🔒 Code PIN activé : il est demandé à chaque ouverture de l'appli.</p>
        <div class="setting">
          <span>Verrouiller en arrière-plan</span>
          <select id="sLockDelay">
            ${LOCK_DELAYS.map((d) => `<option value="${d.value}" ${d.value === pinData.delay ? 'selected' : ''}>${d.label}</option>`).join('')}
          </select>
        </div>
        <div class="btn-col" style="margin-top:10px">
          <button class="btn ghost" id="sPinChange">🔑 Changer le code PIN</button>
          <button class="btn ghost" id="sPinOff">🔓 Désactiver le code PIN</button>
        </div>` : `
        <p class="hint">Demande un code à ${PIN_LEN} chiffres à l'ouverture de l'appli.
          Attention : si tu l'oublies, il faudra effacer tes données (garde une sauvegarde).</p>
        <button class="btn primary" id="sPinOn" style="width:100%">🔒 Activer le code PIN</button>`}
    </div>
    <div class="card">
      <h3>Sauvegarde</h3>
      <p class="hint">Tes données restent uniquement sur ce téléphone. Fais une sauvegarde de temps en temps.<br>
        Dernière sauvegarde : <b>${lastBackupText()}</b></p>
      <div class="setting">
        <span>Me rappeler de sauvegarder</span>
        <select id="sReminder">
          ${REMINDER_CHOICES.map((c) => `<option value="${c.value}" ${c.value === Number(s.reminderDays) ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="btn-col" style="margin-top:10px">
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

/* ---------- Opérations récurrentes ---------- */

// Une règle = { id, type, amount, category, note, freq: 'monthly' | 'weekly', day, next }
// « next » est la date de la prochaine opération à créer. À chaque ouverture de l'appli,
// toutes les opérations dont la date est arrivée sont ajoutées (y compris celles manquées).

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function advanceRule(r) {
  const d = parseIso(r.next);
  if (r.freq === 'weekly') {
    r.next = isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
  } else {
    // même jour le mois suivant ; le 31 devient le 30 (ou le 28/29) si le mois est plus court
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    r.next = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(r.day, lastDay)));
  }
}

function applyRecurring() {
  const today = isoDate(new Date());
  let added = 0;
  for (const r of state.recurring) {
    let guard = 0;
    while (r.next <= today && guard++ < 500) {
      state.tx.push({
        id: uid(), created: Date.now() + added,
        type: r.type, amount: r.amount, category: r.category,
        date: r.next, note: r.note, recurringId: r.id,
      });
      added++;
      advanceRule(r);
    }
  }
  if (added) save();
  return added;
}

function describeRule(r, nextIso = r.next) {
  if (r.freq === 'weekly') {
    return `Chaque ${parseIso(nextIso).toLocaleDateString('fr-FR', { weekday: 'long' })}`;
  }
  return `Chaque mois, le ${r.day === 1 ? '1er' : r.day}`;
}

function shortDate(iso) {
  return parseIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function updateRepeatHint() {
  const freq = $('#fRepeat').value;
  const date = $('#fDate').value;
  $('#fRepeatHint').textContent = freq && date
    ? `${describeRule({ freq, day: parseIso(date).getDate() }, date)}, à partir du ${shortDate(date)}`
    : '';
}

function stopRecurring(id) {
  const r = state.recurring.find((x) => x.id === id);
  if (!r) return;
  const name = findCat(r.type, r.category).name;
  if (!confirm(`Arrêter « ${name}${r.note ? ' – ' + r.note : ''} » ?\n\nLes opérations déjà ajoutées restent dans ta liste.`)) return;
  state.recurring = state.recurring.filter((x) => x.id !== id);
  save();
  render();
  toast('Opération récurrente arrêtée');
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
  $('#fRepeatWrap').hidden = !!tx; // la répétition se choisit seulement à la création
  $('#fRepeat').value = '';
  updateRepeatHint();
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
  } else if ($('#fRepeat').value) {
    // Opération récurrente : on crée la règle, puis on ajoute celles dont la date est arrivée
    const rule = {
      id: uid(), ...data,
      freq: $('#fRepeat').value,
      day: parseIso(data.date).getDate(),
      next: data.date,
    };
    state.recurring.push(rule);
    applyRecurring();
    toast(rule.next !== data.date
      ? 'Opération récurrente créée'
      : `Opération récurrente programmée pour le ${shortDate(data.date)}`);
  } else {
    state.tx.push({ id: uid(), created: Date.now(), ...data });
    toast(data.type === 'income' ? 'Revenu ajouté' : 'Dépense ajoutée');
  }
  save();
  view.month = data.date.slice(0, 7);
  closeForm();
  render();
  const alert = budgetAlert(data);
  if (alert) toast(alert);
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
  state.settings.lastBackup = Date.now();
  state.settings.backupSnooze = 0;
  save();
  download(`sauvegarde-depenses-${isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
  render();
  toast('Sauvegarde enregistrée dans tes téléchargements');
}

/* ---------- Rappel de sauvegarde ---------- */

function daysSince(ts) {
  return Math.floor((Date.now() - ts) / 864e5);
}

function lastBackupText() {
  const s = state.settings;
  if (!s.lastBackup) return 'jamais';
  const d = daysSince(s.lastBackup);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  return `il y a ${d} jours`;
}

function backupDue() {
  const s = state.settings;
  if (!s.reminderDays || !state.tx.length) return false;  // rappel désactivé ou rien à sauvegarder
  if (Date.now() < (s.backupSnooze || 0)) return false;   // « Plus tard » encore actif
  // Jamais sauvegardé : on attend d'avoir quelques opérations pour ne pas déranger dès la première
  if (!s.lastBackup) return state.tx.length >= 5;
  return daysSince(s.lastBackup) >= s.reminderDays;
}

function backupBanner() {
  if (!backupDue()) return '';
  const text = state.settings.lastBackup
    ? `Dernière sauvegarde : ${lastBackupText()}.`
    : "Tu n'as encore jamais sauvegardé tes données.";
  return `
    <div class="card reminder" role="status">
      <div class="reminder-text"><b>💾 Pense à sauvegarder</b><small>${text}</small></div>
      <div class="reminder-actions">
        <button class="btn ghost" data-action="snooze">Plus tard</button>
        <button class="btn primary" data-action="backup">Sauvegarder</button>
      </div>
    </div>`;
}

function snoozeBackup() {
  state.settings.backupSnooze = Date.now() + 864e5; // on redemande demain
  save();
  render();
  toast('Rappel reporté à demain');
}

function restore(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.tx)) throw new Error('format');
      const valid = data.tx.filter((t) => t && t.id && t.date && typeof t.amount === 'number' && CATEGORIES[t.type]);
      if (!confirm(`Remplacer tes données actuelles par cette sauvegarde (${valid.length} opérations) ?`)) return;
      const recurring = Array.isArray(data.recurring)
        ? data.recurring.filter((r) => r && r.id && r.next && typeof r.amount === 'number' && CATEGORIES[r.type])
        : [];
      state = { tx: valid, recurring, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
      applyRecurring();
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

/* ---------- Code PIN ---------- */

// Le code n'est jamais enregistré tel quel : on garde seulement une empreinte
// (PBKDF2 + sel aléatoire). Il bloque l'accès à l'appli, mais ne chiffre pas les données.
const PIN_KEY = 'mes-depenses.pin';
const PIN_FAIL_KEY = 'mes-depenses.pin-fails';
const PIN_LEN = 4;
const MAX_TRIES = 5;          // essais avant une attente
const WAIT_SECONDS = 30;      // durée de l'attente après trop d'erreurs
const LOCK_DELAYS = [
  { value: 0,      label: 'Immédiatement' },
  { value: 60000,  label: 'Après 1 minute' },
  { value: 300000, label: 'Après 5 minutes' },
];

let pinData = null;
try { pinData = JSON.parse(localStorage.getItem(PIN_KEY)); } catch (_) { pinData = null; }
let locked = false;
const pinPad = { entry: '', onComplete: null, onAlt: null, busy: false };

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations: 150000 }, key, 256);
  return toB64(new Uint8Array(bits));
}

async function checkPin(pin) {
  return !!pinData && (await hashPin(pin, pinData.salt)) === pinData.hash;
}

async function savePin(pin) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const delay = pinData ? pinData.delay : 60000;
  pinData = { salt, hash: await hashPin(pin, salt), delay };
  localStorage.setItem(PIN_KEY, JSON.stringify(pinData));
}

// Compteur d'erreurs enregistré pour qu'un simple rechargement ne le remette pas à zéro.
function getFails() {
  try { return JSON.parse(localStorage.getItem(PIN_FAIL_KEY)) || { count: 0, until: 0 }; }
  catch (_) { return { count: 0, until: 0 }; }
}
function waitRemaining() {
  return Math.max(0, Math.ceil((getFails().until - Date.now()) / 1000));
}
function registerFail() {
  const f = getFails();
  f.count += 1;
  if (f.count % MAX_TRIES === 0) f.until = Date.now() + WAIT_SECONDS * 1000;
  localStorage.setItem(PIN_FAIL_KEY, JSON.stringify(f));
  const wait = waitRemaining();
  return wait > 0
    ? `Trop d'essais. Réessaie dans ${wait} s.`
    : `Code incorrect (${MAX_TRIES - (f.count % MAX_TRIES)} essai(s) avant attente)`;
}
function clearFails() { localStorage.removeItem(PIN_FAIL_KEY); }

function setPadMsg(msg, isError = false) {
  const el = $('#lockMsg');
  el.textContent = msg;
  el.classList.toggle('err', isError);
}

function updateDots() {
  document.querySelectorAll('#lockDots i').forEach((d, i) => d.classList.toggle('on', i < pinPad.entry.length));
}

function showPad({ title, msg = '', alt = null, onComplete }) {
  $('#lockTitle').textContent = title;
  setPadMsg(msg);
  pinPad.entry = '';
  pinPad.onComplete = onComplete;
  pinPad.onAlt = alt ? alt.action : null;
  $('#lockAlt').hidden = !alt;
  if (alt) $('#lockAlt').textContent = alt.label;
  updateDots();
  closeForm();
  $('#lock').hidden = false;
}

function hidePad() {
  $('#lock').hidden = true;
  pinPad.onComplete = null;
  pinPad.entry = '';
}

function padError(msg) {
  setPadMsg(msg, true);
  pinPad.entry = '';
  updateDots();
  const dots = $('#lockDots');
  dots.classList.remove('shake');
  void dots.offsetWidth; // relance l'animation
  dots.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate(120);
}

async function pressKey(k) {
  if (pinPad.busy || !pinPad.onComplete) return;
  if (k === 'del') { pinPad.entry = pinPad.entry.slice(0, -1); updateDots(); return; }
  if (pinPad.entry.length >= PIN_LEN) return;
  pinPad.entry += k;
  updateDots();
  if (pinPad.entry.length === PIN_LEN) {
    pinPad.busy = true;
    const pin = pinPad.entry;
    // petite pause pour que le 4e point s'affiche avant la vérification
    await new Promise((r) => setTimeout(r, 120));
    try { await pinPad.onComplete(pin); } finally { pinPad.busy = false; }
  }
}

// Vérifie le code, puis appelle onSuccess (gère les erreurs et l'attente).
async function verifyPin(pin, onSuccess) {
  const wait = waitRemaining();
  if (wait > 0) return padError(`Trop d'essais. Réessaie dans ${wait} s.`);
  if (await checkPin(pin)) { clearFails(); onSuccess(); }
  else padError(registerFail());
}

function lockApp() {
  if (!pinData) return;
  locked = true;
  showPad({
    title: 'Entre ton code PIN',
    alt: { label: 'Code PIN oublié ?', action: forgotPin },
    onComplete: (pin) => verifyPin(pin, () => { locked = false; hidePad(); render(); }),
  });
}

function forgotPin() {
  if (!confirm("Sans le code PIN, la seule solution est d'effacer TOUTES tes données (dépenses et réglages).\n\nSi tu as une sauvegarde, tu pourras la restaurer ensuite.\n\nContinuer ?")) return;
  if (!confirm('Dernière confirmation : tout effacer définitivement ?')) return;
  [STORE_KEY, PIN_KEY, PIN_FAIL_KEY].forEach((k) => localStorage.removeItem(k));
  state = load();
  pinData = null;
  locked = false;
  hidePad();
  render();
  toast('Données effacées. Tu peux restaurer une sauvegarde dans Réglages.');
}

function setupPin() {
  const cancel = { label: 'Annuler', action: hidePad };
  showPad({
    title: 'Choisis un code PIN',
    msg: `${PIN_LEN} chiffres, faciles à retenir pour toi`,
    alt: cancel,
    onComplete: (first) => showPad({
      title: 'Confirme ton code PIN',
      alt: cancel,
      onComplete: async (second) => {
        if (second !== first) {
          setupPin();
          setPadMsg('Les deux codes sont différents. Recommence.', true);
          return;
        }
        await savePin(first);
        clearFails();
        hidePad();
        render();
        toast('Code PIN activé');
      },
    }),
  });
}

function askCurrentPin(next) {
  showPad({
    title: 'Entre ton code PIN actuel',
    alt: { label: 'Annuler', action: hidePad },
    onComplete: (pin) => verifyPin(pin, next),
  });
}

function disablePin() {
  askCurrentPin(() => {
    localStorage.removeItem(PIN_KEY);
    pinData = null;
    hidePad();
    render();
    toast('Code PIN désactivé');
  });
}

/* ---------- Proposition d'installation ---------- */

// Quand l'appli est ouverte dans le navigateur (et pas depuis l'icône installée),
// on propose de l'installer à chaque visite.
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
let installEvent = null; // fourni par Chrome quand l'installation en un clic est possible

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // on garde la proposition pour notre propre bouton
  installEvent = e;
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  hideInstall();
  toast("Application installée ! Ouvre-la depuis ton écran d'accueil.");
});

function manualInstallText() {
  if (isIOS) {
    return "Dans Safari, touche le bouton Partager (le carré avec une flèche ↑), puis « Sur l'écran d'accueil ».";
  }
  return "Ouvre le menu ⋮ du navigateur (en haut à droite), puis « Installer l'application » ou « Ajouter à l'écran d'accueil ». "
    + "Si elle est déjà installée, ouvre-la depuis ton écran d'accueil.";
}

function showInstall() {
  if (isInstalled()) return;
  // Sur iPhone il n'y a pas d'installation en un clic : on affiche directement la marche à suivre
  $('#installHow').textContent = isIOS ? manualInstallText() : '';
  $('#installHow').hidden = !isIOS;
  $('#installBtn').hidden = isIOS;
  $('#installBackdrop').hidden = false;
  $('#install').hidden = false;
}

function hideInstall() {
  $('#installBackdrop').hidden = true;
  $('#install').hidden = true;
}

async function installApp() {
  if (installEvent) {
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    if (outcome === 'accepted') hideInstall();
  } else {
    // Installation en un clic impossible ici : on explique comment faire à la main
    $('#installHow').textContent = manualInstallText();
    $('#installHow').hidden = false;
    $('#installBtn').hidden = true;
  }
}

$('#installBtn').addEventListener('click', installApp);
$('#installLater').addEventListener('click', hideInstall);
$('#installBackdrop').addEventListener('click', hideInstall);

/* ---------- Événements ---------- */

$('#prevMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, -1); render(); });
$('#nextMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, 1); render(); });
$('#fab').addEventListener('click', () => openForm());
$('#backdrop').addEventListener('click', closeForm);
$('#fCancel').addEventListener('click', closeForm);
$('#fDelete').addEventListener('click', deleteTx);
$('#sheet').addEventListener('submit', submitForm);
$('#fRepeat').addEventListener('change', updateRepeatHint);
$('#fDate').addEventListener('change', updateRepeatHint);

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
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'backup') return backup();
  if (action === 'snooze') return snoozeBackup();
  if (action === 'stats') { view.tab = 'stats'; render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest('.tx');
  if (b) openForm(state.tx.find((t) => t.id === b.dataset.id));
});

$('#tab-stats').addEventListener('click', (e) => {
  const g = e.target.closest('[data-month]');
  if (g && g.dataset.month !== view.month) { view.month = g.dataset.month; render(); }
});

$('#tab-settings').addEventListener('change', (e) => {
  const catId = e.target.dataset.catbudget;
  if (catId) {
    const v = parseAmount(e.target.value || '0');
    state.settings.catBudgets = { ...state.settings.catBudgets };
    if (v > 0) state.settings.catBudgets[catId] = v;
    else delete state.settings.catBudgets[catId];
    save();
    // pas de render() ici : la liste reste ouverte pour saisir les autres catégories
    toast(v > 0 ? `Budget ${findCat('expense', catId).name} : ${fmt(v)} par mois` : `Budget ${findCat('expense', catId).name} supprimé`);
    return;
  }
  if (e.target.id === 'sCurrency') {
    state.settings.currency = e.target.value;
    save(); render();
  }
  if (e.target.id === 'sReminder') {
    state.settings.reminderDays = Number(e.target.value);
    state.settings.backupSnooze = 0;
    save();
    toast(state.settings.reminderDays ? 'Rappel enregistré' : 'Rappel désactivé');
  }
  if (e.target.id === 'sLockDelay' && pinData) {
    pinData.delay = Number(e.target.value);
    localStorage.setItem(PIN_KEY, JSON.stringify(pinData));
    toast('Réglage enregistré');
  }
  if (e.target.id === 'sBudget') {
    const v = parseAmount(e.target.value || '0');
    state.settings.budget = v > 0 ? v : 0;
    save(); render();
    toast(state.settings.budget ? 'Budget enregistré' : 'Budget désactivé');
  }
});

$('#tab-settings').addEventListener('click', (e) => {
  const stop = e.target.closest('[data-stop]');
  if (stop) return stopRecurring(stop.dataset.stop);
  const id = e.target.closest('button')?.id;
  if (id === 'sPinOn') setupPin();
  if (id === 'sPinChange') askCurrentPin(setupPin);
  if (id === 'sPinOff') disablePin();
  if (id === 'sExportCsv') exportCsv();
  if (id === 'sBackup') backup();
  if (id === 'sRestore') $('#importFile').click();
  if (id === 'sReset' && confirm('Effacer TOUTES les opérations (et les opérations récurrentes) ? Cette action est définitive.')) {
    state.tx = [];
    state.recurring = [];
    save(); render();
    toast('Toutes les données ont été effacées');
  }
});

$('#importFile').addEventListener('change', (e) => {
  if (e.target.files[0]) restore(e.target.files[0]);
  e.target.value = '';
});

document.addEventListener('keydown', (e) => {
  if (!$('#lock').hidden) {
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    if (e.key === 'Backspace') pressKey('del');
    return;
  }
  if (e.key === 'Escape' && !$('#install').hidden) return hideInstall();
  if (e.key === 'Escape' && !$('#sheet').hidden) closeForm();
});

$('#keypad').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-key]');
  if (b) pressKey(b.dataset.key);
});

$('#lockAlt').addEventListener('click', () => { if (pinPad.onAlt) pinPad.onAlt(); });

// Verrouillage automatique quand l'appli passe en arrière-plan.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!pinData || locked) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    if (!pinData.delay) lockApp(); // « Immédiatement » : on masque tout de suite
  } else if (hiddenAt && Date.now() - hiddenAt >= pinData.delay) {
    lockApp();
  }
});

/* ---------- Démarrage ---------- */

// Si l'appli reste ouverte d'un jour à l'autre, on vérifie les récurrentes en revenant dessus.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const n = applyRecurring();
  if (n) {
    pendingToast = recurringMessage(n);
    if (!locked) render(); // si l'appli est verrouillée, le message s'affichera après le code PIN
  }
});

function recurringMessage(n) {
  return n === 1 ? '1 opération récurrente ajoutée' : `${n} opérations récurrentes ajoutées`;
}

const addedAtStart = applyRecurring();
if (addedAtStart) pendingToast = recurringMessage(addedAtStart);

if (pinData) lockApp();
else render();

// Proposition d'installation, un court instant après l'ouverture (si on est dans le navigateur).
// Avec un code PIN, elle apparaît derrière l'écran de verrouillage, donc juste après le déverrouillage.
if (location.protocol.startsWith('http')) setTimeout(showInstall, 800);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
