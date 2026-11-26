'use strict';
/* =====================================================================
   Onglet Opérations : résumé du mois, liste, recherche et filtres.
   ===================================================================== */

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
  const accountsLine = multiAccounts()
    ? `<button class="accounts-line" data-goto="accounts">💳 Sur tes comptes : <b>${fmt(state.accounts.reduce((s, a) => s + accountBalance(a.id), 0))}</b> ›</button>`
    : '';
  $('#summary').innerHTML = `
    <div class="label">Solde du mois</div>
    <div class="balance ${t.balance < 0 ? 'out' : ''}">${fmt(t.balance)}</div>
    <div class="split">
      <div><span class="label">Revenus</span><strong class="in">${fmt(t.income)}</strong></div>
      <div><span class="label">Dépenses</span><strong class="out">${fmt(t.expense)}</strong></div>
    </div>
    ${budgetHtml}
    ${accountsLine}`;
}

/* ---------- Recherche et filtres ---------- */

function filtersActive() {
  const f = view.filter;
  return !!(view.q.trim() || f.type || f.cat || f.account || f.period === 'all');
}

function searchText(t) {
  const parts = [txTitle(t), t.note || '', fmt(t.amount), String(t.amount).replace('.', ',')];
  parts.push(account(t.accountId).name);
  if (t.type === 'transfer') parts.push(account(t.toAccountId).name);
  return parts.join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function filteredTx() {
  const f = view.filter;
  let list = f.period === 'all' ? sortTx([...state.tx]) : monthTx();
  if (f.type) list = list.filter((t) => t.type === f.type);
  if (f.cat) list = list.filter((t) => t.category === f.cat);
  if (f.account) list = list.filter((t) => t.accountId === f.account || t.toAccountId === f.account);
  const q = view.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (q) {
    const words = q.split(/\s+/);
    list = list.filter((t) => {
      const text = searchText(t);
      return words.every((w) => text.includes(w));
    });
  }
  return list;
}

function renderFilters() {
  const f = view.filter;
  const catOptions = (type, label) => `<optgroup label="${label}">${allCats(type)
    .map((c) => `<option value="${c.id}" ${c.id === f.cat ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</optgroup>`;
  $('#flCat').innerHTML = `<option value="">Toutes</option>${catOptions('expense', 'Dépenses')}${catOptions('income', 'Revenus')}`;
  $('#flAcc').innerHTML = `<option value="">Tous</option>${state.accounts
    .map((a) => `<option value="${a.id}" ${a.id === f.account ? 'selected' : ''}>${a.icon} ${escapeHtml(a.name)}</option>`).join('')}`;
  $('#flAccWrap').hidden = !multiAccounts();
  $('#flType').value = f.type;
  $('#flPeriod').value = f.period;
  const count = [f.type, f.cat, f.account, f.period === 'all'].filter(Boolean).length;
  $('#filterBtn').classList.toggle('on', count > 0);
  $('#filterBtn').setAttribute('aria-label', count ? `Filtres (${count} actif${count > 1 ? 's' : ''})` : 'Filtres');
}

function clearFilters() {
  view.q = '';
  view.filter = { type: '', cat: '', account: '', period: 'month' };
  $('#q').value = '';
  renderList();
}

/* ---------- Liste ---------- */

function txSubtitle(t) {
  const parts = [];
  if (t.type === 'transfer') parts.push(`${escapeHtml(account(t.accountId).name)} → ${escapeHtml(account(t.toAccountId).name)}`);
  else if (multiAccounts()) parts.push(escapeHtml(account(t.accountId).name));
  if (t.recurringId) parts.push('🔁 Récurrent');
  if (t.photo) parts.push('📎 Ticket');
  if (t.note) parts.push(escapeHtml(t.note));
  return parts.length ? `<small>${parts.join(' · ')}</small>` : '';
}

function txRow(t) {
  const c = findCat(t.type, t.category);
  const amount = t.type === 'transfer'
    ? `<span class="amt neutral">${fmt(t.amount)}</span>`
    : `<span class="amt ${t.type === 'income' ? 'in' : ''}">${fmt(t.type === 'income' ? t.amount : -t.amount, true)}</span>`;
  return `
    <button class="tx" data-id="${t.id}">
      <span class="bubble" style="background:${c.color}22">${c.icon}</span>
      <span class="info"><b>${escapeHtml(txTitle(t))}</b>${txSubtitle(t)}</span>
      ${amount}
    </button>`;
}

function overBudgetBanner() {
  const over = budgetRows().filter((r) => r.pct > 100);
  if (!over.length) return '';
  return `
    <div class="card reminder over-banner" role="status">
      <div class="reminder-text">
        <b>⚠️ ${over.length === 1 ? 'Budget dépassé' : `${over.length} budgets dépassés`}</b>
        <small>${over.map((r) => `${r.icon} ${escapeHtml(r.name)} (${fmt(r.spent)} / ${fmt(r.budget)})`).join(' · ')}</small>
      </div>
      <div class="reminder-actions"><button class="btn ghost" data-action="stats">Voir les budgets</button></div>
    </div>`;
}

function renderList() {
  renderFilters();
  const active = filtersActive();
  const list = filteredTx();
  let html = '';

  if (active) {
    const t = totals(list);
    html += `
      <div class="results">
        <span>${list.length} résultat${list.length > 1 ? 's' : ''}${view.filter.period === 'all' ? ' · toutes périodes' : ''}
          ${t.income ? ` · <b class="in">${fmt(t.income, true)}</b>` : ''}${t.expense ? ` · <b class="out">${fmt(-t.expense, true)}</b>` : ''}</span>
        <button class="link-btn" data-action="clear-filters">Effacer</button>
      </div>`;
  } else {
    html += overBudgetBanner() + debtBanner() + backupBanner();
  }

  if (!list.length) {
    html += active
      ? `<div class="empty"><div>🔍</div>Aucune opération ne correspond.</div>`
      : `<div class="empty"><div>🧾</div>Aucune opération ce mois-ci.<br>Touche <b>+</b> pour ajouter ta première dépense.</div>`;
    $('#listBody').innerHTML = html;
    return;
  }

  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  for (const [date, items] of groups) {
    const dayTotal = totals(items).balance;
    html += `<div class="day"><span>${dayLabel(date)}</span><span>${dayTotal ? fmt(dayTotal, true) : ''}</span></div>
      <div class="list">${items.map(txRow).join('')}</div>`;
  }
  $('#listBody').innerHTML = html;
}

function initList() {
  $('#q').addEventListener('input', (e) => { view.q = e.target.value; renderList(); });
  $('#filterBtn').addEventListener('click', () => {
    $('#filters').hidden = !$('#filters').hidden;
    $('#filterBtn').setAttribute('aria-expanded', String(!$('#filters').hidden));
  });
  $('#filters').addEventListener('change', (e) => {
    const map = { flType: 'type', flCat: 'cat', flAcc: 'account', flPeriod: 'period' };
    if (map[e.target.id]) { view.filter[map[e.target.id]] = e.target.value; renderList(); }
  });

  $('#listBody').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'backup') return backupFlow();
    if (action === 'snooze') return snoozeBackup();
    if (action === 'clear-filters') return clearFilters();
    if (action === 'stats') return goTo('stats');
    if (action === 'debts') return goTo('plus', 'debts');
    const b = e.target.closest('.tx');
    if (b) openForm(state.tx.find((t) => t.id === b.dataset.id));
  });

  $('#summary').addEventListener('click', (e) => {
    if (e.target.closest('[data-goto="accounts"]')) goTo('plus', 'accounts');
  });
}
