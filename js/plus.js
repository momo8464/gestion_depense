'use strict';
/* =====================================================================
   Onglet « Plus » : comptes, objectifs d'épargne, dettes et prêts,
   bilan annuel et relevé PDF du mois.
   ===================================================================== */

function subHead(title, extra = '') {
  return `<div class="subhead">
    <button class="link-btn" data-sub="">‹ Retour</button>
    <h2>${title}</h2>${extra}
  </div>`;
}

function renderPlus() {
  const pages = { accounts: accountsPage, goals: goalsPage, debts: debtsPage, year: yearPage };
  $('#tab-plus').innerHTML = (pages[view.sub] || plusMenu)();
}

function plusMenu() {
  const total = state.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
  const goalsOpen = state.goals.filter((g) => g.saved < g.target).length;
  const { owedToMe, iOwe } = debtTotals();
  const tile = (sub, icon, title, text, action = '') => `
    <button class="tile" ${action ? `data-action="${action}"` : `data-sub="${sub}"`}>
      <span class="tile-icon">${icon}</span>
      <b>${title}</b>
      <small>${text}</small>
    </button>`;
  return `
    <div class="tiles">
      ${tile('accounts', '💳', 'Comptes', `${state.accounts.length} compte${state.accounts.length > 1 ? 's' : ''} · ${fmt(total)}`)}
      ${tile('goals', '🎯', "Objectifs d'épargne", goalsOpen ? `${goalsOpen} en cours` : 'Aucun en cours')}
      ${tile('debts', '🤝', 'Dettes et prêts', owedToMe || iOwe
        ? [owedToMe ? `On te doit ${fmt(owedToMe)}` : '', iOwe ? `Tu dois ${fmt(iOwe)}` : ''].filter(Boolean).join(' · ')
        : 'Rien en cours')}
      ${tile('year', '📅', 'Bilan annuel', `Ton année ${new Date().getFullYear()} en un coup d'œil`)}
      ${tile('', '🧾', 'Relevé PDF', `Relevé de ${monthLabel(view.month)}`, 'pdf')}
    </div>`;
}

/* =====================================================================
   Comptes
   ===================================================================== */

function accountsPage() {
  const total = state.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
  const rows = state.accounts.map((a) => {
    const b = accountBalance(a.id);
    return `
      <div class="acc-row">
        <span class="bubble sm">${a.icon}</span>
        <span class="info"><b>${escapeHtml(a.name)}</b><small>Solde de départ : ${fmt(a.initial || 0)}</small></span>
        <span class="amt ${b < 0 ? 'out' : ''}">${fmt(b)}</span>
        <button class="icon-btn sm" data-acc-edit="${a.id}" aria-label="Modifier ${escapeHtml(a.name)}">✏️</button>
      </div>`;
  }).join('');
  return `
    ${subHead('Comptes')}
    <div class="card total-card"><span class="label">Total sur tes comptes</span>
      <div class="balance ${total < 0 ? 'out' : ''}">${fmt(total)}</div></div>
    <div class="card">${rows}</div>
    <div class="btn-col">
      <button class="btn primary" data-action="acc-add">+ Nouveau compte</button>
      ${multiAccounts() ? '<button class="btn ghost" data-action="transfer">🔄 Faire un virement</button>' : ''}
    </div>
    <p class="hint pad">Exemples : Banque, Espèces, Mobile money, Épargne.
      Les virements entre tes comptes ne comptent ni comme dépense ni comme revenu.</p>`;
}

function accountFields(a = {}) {
  return [
    { id: 'name', label: 'Nom du compte', type: 'text', value: a.name, required: true, maxlength: 30, placeholder: 'Ex. : Banque, Espèces' },
    { id: 'icon', label: 'Emoji', type: 'text', value: a.icon || '🏦', maxlength: 4 },
    { id: 'initial', label: 'Solde de départ', type: 'amount', value: amountInput(a.initial), placeholder: '0',
      hint: "L'argent présent sur ce compte avant de commencer à utiliser l'appli" },
  ];
}

async function addAccount() {
  const v = await askDialog({ title: 'Nouveau compte', fields: accountFields(), ok: 'Créer' });
  if (!v) return;
  state.accounts.push({ id: uid(), name: v.name, icon: v.icon || '🏦', initial: v.initial || 0 });
  save();
  render();
  toast(`Compte « ${v.name} » créé`);
}

async function editAccount(id) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return;
  const fields = accountFields(a);
  if (multiAccounts()) {
    fields.push({ id: 'remove', label: 'Supprimer ce compte ?', type: 'select', value: 'no',
      options: [{ value: 'no', label: 'Non, le garder' }, { value: 'yes', label: 'Oui, le supprimer' }] });
  }
  const v = await askDialog({ title: `Modifier « ${a.name} »`, fields, ok: 'Enregistrer' });
  if (!v) return;
  if (v.remove === 'yes') return removeAccount(a);
  Object.assign(a, { name: v.name, icon: v.icon || a.icon, initial: v.initial || 0 });
  save();
  render();
  toast('Compte modifié');
}

async function removeAccount(a) {
  const target = state.accounts.find((x) => x.id !== a.id);
  const used = state.tx.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
  const ok = await askConfirm(`Supprimer « ${a.name} » ?`,
    used ? `Ses ${used} opération(s) seront déplacées vers « ${target.name} ». Les virements entre ces deux comptes seront supprimés.`
      : 'Ce compte ne contient aucune opération.', 'Supprimer');
  if (!ok) return;
  const move = (o) => {
    if (o.accountId === a.id) o.accountId = target.id;
    if (o.toAccountId === a.id) o.toAccountId = target.id;
  };
  state.tx.forEach(move);
  state.recurring.forEach(move);
  state.favorites.forEach(move);
  // un virement d'un compte vers lui-même n'a plus de sens
  state.tx = state.tx.filter((t) => !(t.type === 'transfer' && t.accountId === t.toAccountId));
  state.recurring = state.recurring.filter((r) => !(r.type === 'transfer' && r.accountId === r.toAccountId));
  state.accounts = state.accounts.filter((x) => x.id !== a.id);
  if (view.filter.account === a.id) view.filter.account = '';
  save();
  render();
  toast('Compte supprimé');
}

/* =====================================================================
   Objectifs d'épargne
   ===================================================================== */

function monthsUntil(iso) {
  const now = new Date();
  const d = parseIso(iso);
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}

function goalsPage() {
  const list = state.goals.slice().sort((a, b) => (a.saved >= a.target) - (b.saved >= b.target));
  const cards = list.map((g) => {
    const pct = g.target ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
    const done = g.saved >= g.target;
    let plan = '';
    if (!done && g.deadline) {
      const months = monthsUntil(g.deadline);
      plan = months > 0
        ? `Avant le ${shortDate(g.deadline)} · mets de côté <b>${fmt((g.target - g.saved) / months)}</b> par mois`
        : `<span class="over-text">⚠️ Date dépassée (${shortDate(g.deadline)})</span>`;
    }
    return `
      <div class="card goal ${done ? 'done' : ''}">
        <div class="goal-head">
          <span class="bubble sm">${g.icon}</span>
          <span class="info"><b>${escapeHtml(g.name)}</b><small>${fmt(g.saved)} sur ${fmt(g.target)}</small></span>
          <span class="pct-big">${pct} %</span>
        </div>
        <div class="bar ${done ? 'ok' : ''}"><i style="width:${pct}%"></i></div>
        <small class="goal-plan">${done ? '🎉 Objectif atteint, bravo !' : plan || `Il reste ${fmt(g.target - g.saved)}`}</small>
        <div class="row-actions">
          ${done ? '' : `<button class="btn primary small" data-goal-add="${g.id}">+ Ajouter</button>`}
          ${g.saved > 0 ? `<button class="btn ghost small" data-goal-take="${g.id}">− Retirer</button>` : ''}
          <button class="btn ghost small" data-goal-edit="${g.id}">✏️ Modifier</button>
        </div>
      </div>`;
  }).join('');
  return `
    ${subHead("Objectifs d'épargne")}
    ${cards || `<div class="empty"><div>🎯</div>Aucun objectif pour l'instant.<br>Ex. : un téléphone, des vacances, une réserve de sécurité.</div>`}
    <div class="btn-col"><button class="btn primary" data-action="goal-new">+ Nouvel objectif</button></div>
    <p class="hint pad">Les sommes mises de côté ici sont un suivi personnel : elles ne modifient pas tes comptes.
      Pour déplacer réellement l'argent, fais un virement vers un compte « Épargne ».</p>`;
}

function goalFields(g = {}) {
  return [
    { id: 'name', label: 'Objectif', type: 'text', value: g.name, required: true, maxlength: 40, placeholder: 'Ex. : Nouveau téléphone' },
    { id: 'icon', label: 'Emoji', type: 'text', value: g.icon || '🎯', maxlength: 4 },
    { id: 'target', label: 'Montant à atteindre', type: 'amount', value: amountInput(g.target), required: true },
    { id: 'saved', label: 'Déjà mis de côté', type: 'amount', value: amountInput(g.saved), placeholder: '0' },
    { id: 'deadline', label: 'Date limite (facultatif)', type: 'date', value: g.deadline || '' },
  ];
}

async function newGoal() {
  const v = await askDialog({ title: 'Nouvel objectif', fields: goalFields(), ok: 'Créer',
    validate: (x) => (x.target > 0 ? null : 'Le montant à atteindre doit être supérieur à 0') });
  if (!v) return;
  state.goals.push({ id: uid(), name: v.name, icon: v.icon || '🎯', target: v.target, saved: v.saved || 0, deadline: v.deadline || '', created: Date.now() });
  save();
  render();
  toast('Objectif créé 🎯');
}

async function editGoal(id) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) return;
  const fields = goalFields(g);
  fields.push({ id: 'remove', label: 'Supprimer cet objectif ?', type: 'select', value: 'no',
    options: [{ value: 'no', label: 'Non, le garder' }, { value: 'yes', label: 'Oui, le supprimer' }] });
  const v = await askDialog({ title: 'Modifier l\'objectif', fields, ok: 'Enregistrer',
    validate: (x) => (x.target > 0 ? null : 'Le montant à atteindre doit être supérieur à 0') });
  if (!v) return;
  if (v.remove === 'yes') {
    state.goals = state.goals.filter((x) => x.id !== id);
    toast('Objectif supprimé');
  } else {
    Object.assign(g, { name: v.name, icon: v.icon || g.icon, target: v.target, saved: v.saved || 0, deadline: v.deadline || '' });
    toast('Objectif modifié');
  }
  save();
  render();
}

async function moveGoal(id, sign) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) return;
  const v = await askDialog({
    title: sign > 0 ? `Ajouter à « ${g.name} »` : `Retirer de « ${g.name} »`,
    fields: [{ id: 'amount', label: 'Montant', type: 'amount', required: true }],
    ok: sign > 0 ? 'Ajouter' : 'Retirer',
    validate: (x) => (x.amount > 0 ? null : 'Entre un montant supérieur à 0'),
  });
  if (!v) return;
  const before = g.saved;
  g.saved = Math.max(0, Math.round((g.saved + sign * v.amount) * 1000) / 1000);
  save();
  render();
  toast(before < g.target && g.saved >= g.target ? '🎉 Objectif atteint, bravo !' : `${g.name} : ${fmt(g.saved)} / ${fmt(g.target)}`);
}

/* =====================================================================
   Dettes et prêts
   ===================================================================== */

function debtRemaining(d) {
  return Math.max(0, d.amount - d.payments.reduce((s, p) => s + p.amount, 0));
}

function debtTotals() {
  let owedToMe = 0, iOwe = 0;
  for (const d of state.debts) {
    const r = debtRemaining(d);
    if (d.direction === 'lent') owedToMe += r; else iOwe += r;
  }
  return { owedToMe, iOwe };
}

const debtLate = (d) => d.due && d.due < todayIso() && debtRemaining(d) > 0;

function debtSentence(d) {
  const r = fmt(debtRemaining(d));
  return d.direction === 'lent' ? `${d.person} doit te rendre ${r}` : `Tu dois rendre ${r} à ${d.person}`;
}

function debtBanner() {
  const late = state.debts.filter(debtLate);
  if (!late.length) return '';
  return `
    <div class="card reminder over-banner" role="status">
      <div class="reminder-text">
        <b>⏰ ${late.length === 1 ? 'Remboursement en retard' : `${late.length} remboursements en retard`}</b>
        <small>${late.map((d) => escapeHtml(debtSentence(d))).join(' · ')}</small>
      </div>
      <div class="reminder-actions"><button class="btn ghost" data-action="debts">Voir</button></div>
    </div>`;
}

function debtRow(d) {
  const r = debtRemaining(d);
  const done = r <= 0;
  const late = debtLate(d);
  const status = done ? '✅ Soldé'
    : d.due ? (late ? `<span class="over-text">⚠️ En retard depuis le ${shortDate(d.due)}</span>` : `À rendre avant le ${shortDate(d.due)}`)
      : `Depuis le ${shortDate(d.date)}`;
  return `
    <div class="debt-row ${done ? 'done' : ''}">
      <span class="bubble sm">${d.direction === 'lent' ? '📤' : '📥'}</span>
      <span class="info">
        <b>${escapeHtml(d.person)}${d.note ? ` · ${escapeHtml(d.note)}` : ''}</b>
        <small>${status}${d.payments.length ? ` · ${d.payments.length} remboursement(s)` : ''}</small>
      </span>
      <span class="amt ${d.direction === 'lent' ? 'in' : 'out'}">${done ? fmt(d.amount) : `${fmt(r)}<small> / ${fmt(d.amount)}</small>`}</span>
      <div class="row-actions">
        ${done ? '' : `<button class="btn primary small" data-debt-pay="${d.id}">Remboursement</button>`}
        <button class="btn ghost small" data-debt-del="${d.id}" aria-label="Supprimer">🗑</button>
      </div>
    </div>`;
}

function debtsPage() {
  const { owedToMe, iOwe } = debtTotals();
  const open = state.debts.filter((d) => debtRemaining(d) > 0)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const closed = state.debts.filter((d) => debtRemaining(d) <= 0);
  const section = (title, list) => (list.length ? `<div class="card"><h3>${title}</h3>${list.map(debtRow).join('')}</div>` : '');
  return `
    ${subHead('Dettes et prêts')}
    <div class="facts">
      <div><small>On te doit</small><strong class="in">${fmt(owedToMe)}</strong></div>
      <div><small>Tu dois</small><strong class="out">${fmt(iOwe)}</strong></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" data-action="debt-lent">📤 J'ai prêté</button>
      <button class="btn ghost" data-action="debt-borrowed">📥 J'ai emprunté</button>
    </div>
    ${section("On me doit de l'argent", open.filter((d) => d.direction === 'lent'))}
    ${section("Je dois de l'argent", open.filter((d) => d.direction === 'borrowed'))}
    ${closed.length ? `<details class="card"><summary><h3>Soldés (${closed.length})</h3></summary>${closed.map(debtRow).join('')}</details>` : ''}
    ${state.debts.length ? '' : `<div class="empty"><div>🤝</div>Note ici l'argent que tu prêtes ou que tu empruntes, pour ne rien oublier.</div>`}
    <p class="hint pad">Ce suivi est indépendant de tes opérations : il ne modifie pas ton solde.</p>`;
}

async function newDebt(direction) {
  const lent = direction === 'lent';
  const v = await askDialog({
    title: lent ? "J'ai prêté de l'argent" : "J'ai emprunté de l'argent",
    fields: [
      { id: 'person', label: lent ? 'À qui ?' : 'À qui ?', type: 'text', required: true, maxlength: 40, placeholder: 'Prénom' },
      { id: 'amount', label: 'Montant', type: 'amount', required: true },
      { id: 'date', label: 'Date', type: 'date', value: todayIso() },
      { id: 'due', label: 'À rendre avant le (facultatif)', type: 'date' },
      { id: 'note', label: 'Note (facultatif)', type: 'text', maxlength: 60, placeholder: 'Ex. : pour le loyer' },
    ],
    ok: 'Enregistrer',
    validate: (x) => (x.amount > 0 ? null : 'Entre un montant supérieur à 0'),
  });
  if (!v) return;
  state.debts.push({ id: uid(), direction, person: v.person, amount: v.amount, date: v.date || todayIso(), due: v.due || '', note: v.note, payments: [] });
  save();
  render();
  toast('Enregistré');
}

async function payDebt(id) {
  const d = state.debts.find((x) => x.id === id);
  if (!d) return;
  const remaining = debtRemaining(d);
  const v = await askDialog({
    title: d.direction === 'lent' ? `${d.person} t'a remboursé` : `Tu as remboursé ${d.person}`,
    text: `Reste à rembourser : ${fmt(remaining)}`,
    fields: [
      { id: 'amount', label: 'Montant remboursé', type: 'amount', value: amountInput(remaining), required: true },
      { id: 'date', label: 'Date', type: 'date', value: todayIso() },
    ],
    ok: 'Enregistrer',
    validate: (x) => (x.amount > 0 ? null : 'Entre un montant supérieur à 0'),
  });
  if (!v) return;
  d.payments.push({ id: uid(), amount: Math.min(v.amount, remaining), date: v.date || todayIso() });
  save();
  render();
  toast(debtRemaining(d) <= 0 ? '✅ Soldé !' : `Reste ${fmt(debtRemaining(d))}`);
}

async function deleteDebt(id) {
  const d = state.debts.find((x) => x.id === id);
  if (!d) return;
  if (!(await askConfirm('Supprimer ?', debtSentence(d), 'Supprimer'))) return;
  state.debts = state.debts.filter((x) => x.id !== id);
  save();
  render();
  toast('Supprimé');
}

/* =====================================================================
   Bilan annuel
   ===================================================================== */

function yearPage() {
  const y = view.year;
  const nav = `<div class="year-nav">
    <button class="icon-btn sm" data-year="-1" aria-label="Année précédente">‹</button>
    <b>${y}</b>
    <button class="icon-btn sm" data-year="1" aria-label="Année suivante">›</button></div>`;
  const list = state.tx.filter((t) => t.date.startsWith(`${y}-`));
  const t = totals(list);
  if (!t.income && !t.expense) {
    return `${subHead('Bilan annuel', nav)}<div class="empty"><div>📅</div>Aucune opération en ${y}.</div>`;
  }
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const data = months.map((k) => ({ k, ...totals(list.filter((x) => x.date.startsWith(k))) }));
  const rate = t.income ? Math.round((t.balance / t.income) * 100) : null;
  const priciest = data.reduce((a, b) => (b.expense > a.expense ? b : a));
  const elapsed = y === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;

  const byCat = new Map();
  for (const x of list) if (x.type === 'expense') byCat.set(x.category, (byCat.get(x.category) || 0) + x.amount);
  const top = [...byCat.entries()].map(([id, v]) => ({ ...findCat('expense', id), v })).sort((a, b) => b.v - a.v).slice(0, 6);
  const topMax = top.length ? top[0].v : 1;

  return `
    ${subHead('Bilan annuel', nav)}
    <div class="facts three">
      <div><small>Revenus</small><strong class="in">${fmt(t.income)}</strong></div>
      <div><small>Dépenses</small><strong class="out">${fmt(t.expense)}</strong></div>
      <div><small>Épargne</small><strong class="${t.balance < 0 ? 'out' : ''}">${fmt(t.balance)}</strong></div>
    </div>
    <div class="card">
      <h3>Mois par mois</h3>
      ${barChart(data, view.month)}
      <p class="hint" style="margin:8px 0 0">Touche un mois pour voir ses opérations.</p>
    </div>
    ${top.length ? `<div class="card">
      <h3>Où part ton argent</h3>
      ${top.map((c) => `
        <div class="hbar-row">
          <span class="hbar-name">${c.icon} ${escapeHtml(c.name)}</span>
          <span class="hbar"><i style="width:${Math.max(2, (c.v / topMax) * 100)}%;background:${c.color}"></i></span>
          <span class="hbar-val">${fmt(c.v)}<small>${Math.round((c.v / t.expense) * 100)} %</small></span>
        </div>`).join('')}
    </div>` : ''}
    <div class="facts">
      <div><small>Taux d'épargne</small><strong>${rate === null ? '—' : `${rate} %`}</strong></div>
      <div><small>Dépense moyenne / mois</small><strong>${fmt(t.expense / elapsed)}</strong></div>
      <div><small>Mois le plus cher</small><strong class="cap">${priciest.expense ? monthLabel(priciest.k).split(' ')[0] : '—'}</strong></div>
      <div><small>Nombre d'opérations</small><strong>${list.length}</strong></div>
    </div>`;
}

/* =====================================================================
   Relevé PDF du mois (via l'impression du navigateur → « Enregistrer en PDF »)
   ===================================================================== */

function printStatement() {
  const key = view.month;
  const list = monthTx(key).slice().reverse();
  const t = totals(list);
  const multi = multiAccounts();
  const byCat = new Map();
  for (const x of list) if (x.type === 'expense') byCat.set(x.category, (byCat.get(x.category) || 0) + x.amount);
  const catRows = [...byCat.entries()].map(([id, v]) => ({ c: findCat('expense', id), v })).sort((a, b) => b.v - a.v);

  $('#print').innerHTML = `
    <h1>Relevé de ${monthLabel(key)}</h1>
    <p class="p-sub">Mes Dépenses · édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <table class="p-sum">
      <tr><td>Revenus</td><td class="num">${fmt(t.income)}</td></tr>
      <tr><td>Dépenses</td><td class="num">${fmt(t.expense)}</td></tr>
      <tr class="strong"><td>Solde du mois</td><td class="num">${fmt(t.balance)}</td></tr>
    </table>
    <h2>Opérations (${list.length})</h2>
    ${list.length ? `<table>
      <thead><tr><th>Date</th><th>Catégorie</th><th>Note</th>${multi ? '<th>Compte</th>' : ''}<th class="num">Montant</th></tr></thead>
      <tbody>${list.map((x) => `
        <tr>
          <td>${parseIso(x.date).toLocaleDateString('fr-FR')}</td>
          <td>${escapeHtml(txTitle(x))}</td>
          <td>${escapeHtml(x.note || '')}</td>
          ${multi ? `<td>${escapeHtml(x.type === 'transfer' ? `${account(x.accountId).name} → ${account(x.toAccountId).name}` : account(x.accountId).name)}</td>` : ''}
          <td class="num">${x.type === 'transfer' ? fmt(x.amount) : fmt(x.type === 'income' ? x.amount : -x.amount, true)}</td>
        </tr>`).join('')}</tbody>
    </table>` : '<p>Aucune opération ce mois-ci.</p>'}
    ${catRows.length ? `<h2>Dépenses par catégorie</h2>
    <table><tbody>${catRows.map((r) => `<tr><td>${escapeHtml(r.c.name)}</td>
      <td class="num">${Math.round((r.v / t.expense) * 100)} %</td><td class="num">${fmt(r.v)}</td></tr>`).join('')}</tbody></table>` : ''}`;

  const title = document.title;
  document.title = `Releve-${key}`; // nom proposé pour le fichier PDF
  const restore = () => { document.title = title; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  setTimeout(restore, 3000); // sécurité si le navigateur ne signale pas la fin de l'impression
  try {
    window.print();
  } catch (_) {
    restore();
    toast("L'impression n'est pas disponible ici");
  }
}

/* =====================================================================
   Événements de l'onglet
   ===================================================================== */

function initPlus() {
  $('#tab-plus').addEventListener('click', (e) => {
    const el = (attr) => e.target.closest(`[${attr}]`);
    let b;
    if ((b = el('data-sub'))) { view.sub = b.dataset.sub || null; render(); window.scrollTo(0, 0); return; }
    if ((b = el('data-year'))) { view.year += Number(b.dataset.year); render(); return; }
    if ((b = el('data-month'))) { view.month = b.dataset.month; goTo('list'); return; }
    if ((b = el('data-acc-edit'))) return editAccount(b.dataset.accEdit);
    if ((b = el('data-goal-add'))) return moveGoal(b.dataset.goalAdd, 1);
    if ((b = el('data-goal-take'))) return moveGoal(b.dataset.goalTake, -1);
    if ((b = el('data-goal-edit'))) return editGoal(b.dataset.goalEdit);
    if ((b = el('data-debt-pay'))) return payDebt(b.dataset.debtPay);
    if ((b = el('data-debt-del'))) return deleteDebt(b.dataset.debtDel);
    const action = el('data-action')?.dataset.action;
    if (action === 'acc-add') addAccount();
    if (action === 'transfer') openForm(null, { type: 'transfer' });
    if (action === 'goal-new') newGoal();
    if (action === 'debt-lent') newDebt('lent');
    if (action === 'debt-borrowed') newDebt('borrowed');
    if (action === 'pdf') printStatement();
  });
}
