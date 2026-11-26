'use strict';
/* =====================================================================
   Opérations récurrentes (loyer, abonnement, salaire, virement d'épargne…)

   Une règle = { id, type, amount, category, note, accountId, toAccountId,
                 freq: 'monthly' | 'weekly', day, next }
   « next » est la date de la prochaine opération à créer. À chaque ouverture
   de l'appli, toutes celles dont la date est arrivée sont ajoutées
   (y compris celles manquées pendant que l'appli était fermée).
   ===================================================================== */

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
  const today = todayIso();
  let added = 0;
  for (const r of state.recurring) {
    let guard = 0;
    while (r.next <= today && guard++ < 500) {
      const t = {
        id: uid(), created: Date.now() + added,
        type: r.type, amount: r.amount, category: r.category,
        date: r.next, note: r.note, accountId: r.accountId, recurringId: r.id,
      };
      if (r.type === 'transfer') t.toAccountId = r.toAccountId;
      state.tx.push(t);
      added++;
      advanceRule(r);
    }
  }
  if (added) save();
  return added;
}

function recurringMessage(n) {
  return n === 1 ? '1 opération récurrente ajoutée' : `${n} opérations récurrentes ajoutées`;
}

function describeRule(r, nextIso = r.next) {
  if (r.freq === 'weekly') {
    return `Chaque ${parseIso(nextIso).toLocaleDateString('fr-FR', { weekday: 'long' })}`;
  }
  return `Chaque mois, le ${r.day === 1 ? '1er' : r.day}`;
}

function ruleTitle(r) {
  if (r.type === 'transfer') return `Virement ${account(r.accountId).name} → ${account(r.toAccountId).name}`;
  return `${findCat(r.type, r.category).name}${r.note ? ` · ${r.note}` : ''}`;
}

function updateRepeatHint() {
  const freq = $('#fRepeat').value;
  const date = $('#fDate').value;
  $('#fRepeatHint').textContent = freq && date
    ? `${describeRule({ freq, day: parseIso(date).getDate() }, date)}, à partir du ${shortDate(date)}`
    : '';
}

async function stopRecurring(id) {
  const r = state.recurring.find((x) => x.id === id);
  if (!r) return;
  const ok = await askConfirm(`Arrêter « ${ruleTitle(r)} » ?`,
    'Les opérations déjà ajoutées restent dans ta liste.', 'Arrêter');
  if (!ok) return;
  state.recurring = state.recurring.filter((x) => x.id !== id);
  save();
  render();
  toast('Opération récurrente arrêtée');
}

function recurringCard() {
  if (!state.recurring.length) {
    return `
      <div class="card">
        <h3>Opérations récurrentes</h3>
        <p class="hint">Aucune pour l'instant. Pour en créer une (loyer, abonnement, salaire…),
          ajoute une opération avec <b>+</b> et choisis « Répéter : chaque mois ».</p>
      </div>`;
  }
  const rows = state.recurring.slice().sort((a, b) => a.next.localeCompare(b.next)).map((r) => {
    const c = findCat(r.type, r.category);
    const isIn = r.type === 'income';
    const amount = r.type === 'transfer' ? fmt(r.amount) : fmt(isIn ? r.amount : -r.amount, true);
    return `
      <div class="rec-row">
        <span class="bubble sm" style="background:${c.color}22">${c.icon}</span>
        <span class="info">
          <b>${escapeHtml(ruleTitle(r))}</b>
          <small>${describeRule(r)} · prochaine : ${shortDate(r.next)}</small>
        </span>
        <span class="amt ${isIn ? 'in' : ''}">${amount}</span>
        <button class="btn danger small" data-stop="${r.id}">Arrêter</button>
      </div>`;
  }).join('');
  return `<div class="card"><h3>Opérations récurrentes</h3>${rows}</div>`;
}
