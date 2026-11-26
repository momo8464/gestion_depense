'use strict';
/* =====================================================================
   Socle commun : constantes, stockage, calculs et formatage.
   Ce fichier est chargé en premier : tous les autres l'utilisent.
   ===================================================================== */

const STORE_KEY = 'mes-depenses.v1';

const DEFAULT_SETTINGS = {
  currency: '€',
  theme: 'auto',      // auto | light | dark
  ink: 'navy',        // couleur d'encre : navy | forest | plum | ocean | slate
  budget: 0,          // budget mensuel global (0 = aucun)
  catBudgets: {},     // budget maximum par catégorie de dépense : { food: 150, ... }
  hiddenCats: [],     // catégories masquées (ids)
  reminderDays: 7,    // rappel de sauvegarde (0 = jamais)
  lastBackup: 0,      // date de la dernière sauvegarde
  backupSnooze: 0,    // « Plus tard » : pas de rappel avant cette date
};

const REMINDER_CHOICES = [
  { value: 7,  label: 'Chaque semaine' },
  { value: 14, label: 'Tous les 15 jours' },
  { value: 30, label: 'Chaque mois' },
  { value: 0,  label: 'Jamais' },
];

// Catégories fournies avec l'appli (on peut les masquer et en créer d'autres dans Réglages)
const BUILTIN_CATS = {
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

const TRANSFER_CAT = { id: 'transfer', name: 'Virement', icon: '🔄', color: '#64748b' };

// Couleurs proposées pour les catégories personnalisées
const CAT_COLORS = ['#16a34a', '#ea580c', '#2563eb', '#7c3aed', '#ca8a04', '#dc2626',
  '#db2777', '#0891b2', '#4f46e5', '#0d9488', '#be185d', '#64748b'];

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

// Couleurs d'encre proposées (voir style.css)
const INKS = [
  { id: 'navy',   name: 'Marine', color: '#1d2a44' },
  { id: 'forest', name: 'Forêt',  color: '#1e3b32' },
  { id: 'plum',   name: 'Prune',  color: '#3a2340' },
  { id: 'ocean',  name: 'Océan',  color: '#0e4a57' },
  { id: 'slate',  name: 'Ardoise', color: '#2c3038' },
];

const THEMES = [
  { value: 'auto',  label: 'Comme le téléphone' },
  { value: 'light', label: 'Clair' },
  { value: 'dark',  label: 'Sombre' },
];

const TX_TYPES = ['expense', 'income', 'transfer'];
const DEFAULT_ACCOUNT = { id: 'main', name: 'Principal', icon: '💳', initial: 0 };

/* ---------- Petits outils ---------- */

const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayIso = () => isoDate(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const arr = (v) => (Array.isArray(v) ? v : []);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Conversion binaire <-> texte (base64), par morceaux pour supporter les gros fichiers
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

/* ---------- Stockage ---------- */

// Remet les données dans un format propre (anciennes versions, fichiers de sauvegarde…)
function normalize(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const accounts = arr(raw.accounts)
    .filter((a) => a && a.id && a.name)
    .map((a) => ({ ...a, initial: Number(a.initial) || 0 }));
  if (!accounts.length) accounts.push({ ...DEFAULT_ACCOUNT });
  const firstId = accounts[0].id;
  const okTx = (t) => t && t.id && t.date && typeof t.amount === 'number' && TX_TYPES.includes(t.type);

  const tx = arr(raw.tx).filter(okTx);
  const recurring = arr(raw.recurring).filter((r) => okTx({ ...r, date: r && r.next }));
  for (const t of [...tx, ...recurring]) if (!t.accountId) t.accountId = firstId;

  return {
    tx,
    recurring,
    accounts,
    customCats: arr(raw.customCats).filter((c) => c && c.id && c.name && (c.type === 'expense' || c.type === 'income')),
    favorites: arr(raw.favorites).filter((f) => f && f.id && typeof f.amount === 'number'),
    goals: arr(raw.goals).filter((g) => g && g.id && g.name),
    debts: arr(raw.debts).filter((d) => d && d.id && d.person).map((d) => ({ ...d, payments: arr(d.payments) })),
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
  };
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORE_KEY)));
  } catch (_) {
    return normalize({}); // données illisibles : on repart de zéro
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = load();
let pendingToast = null; // message à afficher au prochain affichage (ex. après déverrouillage)

// Ce qui est affiché à l'écran (non enregistré)
const view = {
  month: monthKey(new Date()),
  tab: 'list',            // list | stats | plus | settings
  sub: null,              // sous-page de « Plus » : accounts | goals | debts | year
  year: new Date().getFullYear(),
  q: '',                  // recherche
  filter: { type: '', cat: '', account: '', period: 'month' },
  open: new Set(),        // sections dépliées dans Réglages
  stamp: null,            // objectif qui vient d'être atteint (tampon animé)
  editingId: null,
  formType: 'expense',
  formCat: null,
  formPhoto: undefined,   // undefined = inchangée, null = retirée, Blob = nouvelle photo
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

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function shortMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

function dayLabel(iso) {
  if (iso === todayIso()) return "aujourd'hui";
  if (iso === isoDate(new Date(Date.now() - 864e5))) return 'hier';
  const d = parseIso(iso);
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('fr-FR', opts);
}

function shortDate(iso) {
  const d = parseIso(iso);
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('fr-FR', opts);
}

function parseAmount(str) {
  const clean = String(str ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return NaN;
  return parseFloat(clean);
}

const amountInput = (n) => (n ? String(n).replace('.', ',') : '');

/* ---------- Catégories ---------- */

// Toutes les catégories d'un type (y compris masquées) : pour retrouver celles des anciennes opérations
function allCats(type) {
  if (type === 'transfer') return [TRANSFER_CAT];
  const base = BUILTIN_CATS[type] || BUILTIN_CATS.expense;
  return [...base, ...state.customCats.filter((c) => c.type === type)];
}

// Catégories visibles (proposées dans le formulaire)
function cats(type) {
  const hidden = state.settings.hiddenCats || [];
  const list = allCats(type).filter((c) => !hidden.includes(c.id));
  return list.length ? list : allCats(type);
}

function findCat(type, id) {
  if (type === 'transfer') return TRANSFER_CAT;
  const found = allCats(type).find((c) => c.id === id);
  if (found) return found;
  const base = BUILTIN_CATS[type === 'income' ? 'income' : 'expense'];
  return base[base.length - 1]; // « Autre »
}

/* ---------- Comptes ---------- */

function account(id) {
  return state.accounts.find((a) => a.id === id) || state.accounts[0];
}

const multiAccounts = () => state.accounts.length > 1;

function accountLabel(id) {
  const a = account(id);
  return `${a.icon} ${a.name}`;
}

// Solde d'un compte depuis le début : solde initial + revenus − dépenses ± virements
function accountBalance(id) {
  let b = Number(account(id).initial) || 0;
  for (const t of state.tx) {
    if (t.type === 'transfer') {
      if (t.accountId === id) b -= t.amount;
      if (t.toAccountId === id) b += t.amount;
    } else if (t.accountId === id) {
      b += t.type === 'income' ? t.amount : -t.amount;
    }
  }
  return b;
}

/* ---------- Calculs ---------- */

function sortTx(list) {
  return list.sort((a, b) => (b.date.localeCompare(a.date)) || (b.created || 0) - (a.created || 0));
}

function monthTx(key = view.month) {
  return sortTx(state.tx.filter((t) => t.date.startsWith(key)));
}

// Les virements ne sont ni des dépenses ni des revenus : ils sont ignorés ici
function totals(list) {
  let income = 0, expense = 0;
  for (const t of list) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

function txTitle(t) {
  return t.type === 'transfer' ? 'Virement' : findCat(t.type, t.category).name;
}

/* ---------- Messages et fichiers ---------- */

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
