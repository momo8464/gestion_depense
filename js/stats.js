'use strict';
/* =====================================================================
   Onglet Statistiques : répartition par catégorie, budgets par catégorie,
   graphique d'évolution. Le graphique en barres sert aussi au bilan annuel.
   ===================================================================== */

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
  return allCats('expense')
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
            <div class="cb-head"><span>${r.icon} ${escapeHtml(r.name)}</span><span>${fmt(r.spent)} / ${fmt(r.budget)}</span></div>
            <div class="bar ${level}"><i style="width:${Math.min(r.pct, 100)}%"></i></div>
            <small class="${level}">${status} · ${r.pct} %</small>
          </div>`;
      }).join('')}
    </div>`;
}

// Message après l'ajout d'une dépense si elle fait dépasser (ou presque) le budget de sa catégorie
function budgetAlert(t) {
  if (!t || t.type !== 'expense') return null;
  const budget = catBudget(t.category);
  if (!budget) return null;
  const spent = spentByCat(t.date.slice(0, 7)).get(t.category) || 0;
  const name = findCat('expense', t.category).name;
  const pct = Math.round((spent / budget) * 100);
  if (spent > budget) return `⚠️ Budget ${name} dépassé : ${fmt(spent)} / ${fmt(budget)}`;
  if (pct >= 80) return `Attention : ${pct} % du budget ${name} utilisé`;
  return null;
}

/* ---------- Graphique en barres (revenus / dépenses par mois) ---------- */

function barPath(x, base, w, h) {
  // barre avec les coins du haut arrondis (4 px), posée sur la ligne de base
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  const y = base - h;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

// data = [{ k: '2026-11', income, expense }] ; touche un mois → data-month
function barChart(data, selected) {
  const max = Math.max(0, ...data.map((d) => Math.max(d.income, d.expense)));
  const W = 320, base = 130, plotH = 112, n = data.length;
  const groupW = W / n;
  const barW = Math.min(15, groupW / 2 - 3);
  const gap = 2;
  const bars = data.map((d, i) => {
    const cx = groupW * i + groupW / 2;
    const hIn = max ? (d.income / max) * plotH : 0;
    const hOut = max ? (d.expense / max) * plotH : 0;
    return `
      <g class="evo-group${d.k === selected ? ' sel' : ''}" data-month="${d.k}">
        <title>${monthLabel(d.k)} : revenus ${fmt(d.income)}, dépenses ${fmt(d.expense)}</title>
        <rect class="evo-hit" x="${groupW * i}" y="0" width="${groupW}" height="${base + 26}"/>
        <path d="${barPath(cx - barW - gap / 2, base, barW, hIn)}" fill="var(--chart-in)"/>
        <path d="${barPath(cx + gap / 2, base, barW, hOut)}" fill="var(--chart-out)"/>
        <text x="${cx}" y="${base + 18}" text-anchor="middle" class="evo-label">${n > 6 ? shortMonth(d.k).slice(0, 3) : shortMonth(d.k)}</text>
      </g>`;
  }).join('');
  return `
    <div class="legend">
      <span><i style="background:var(--chart-in)"></i>Revenus</span>
      <span><i style="background:var(--chart-out)"></i>Dépenses</span>
    </div>
    <svg class="evo" viewBox="0 0 ${W} ${base + 26}" width="100%" role="img" aria-label="Revenus et dépenses par mois">
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="evo-base"/>
      ${bars}
    </svg>`;
}

function evolutionCard() {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(view.month, -i));
  const data = months.map((k) => ({ k, ...totals(monthTx(k)) }));
  if (!data.some((d) => d.income || d.expense)) {
    return `<div class="card"><h3>Évolution sur 6 mois</h3>
      <p class="hint">Pas encore de données sur les 6 derniers mois.</p></div>`;
  }
  const sel = data[data.length - 1];
  const avg = data.reduce((s, d) => s + d.expense, 0) / data.length;
  return `
    <div class="card">
      <h3>Évolution sur 6 mois</h3>
      ${barChart(data, view.month)}
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
          <span class="bubble sm" style="background:${p.color}22">${p.icon}</span>
          <span class="name">${escapeHtml(p.name)}</span>
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

function initStats() {
  $('#tab-stats').addEventListener('click', (e) => {
    const g = e.target.closest('[data-month]');
    if (g && g.dataset.month !== view.month) { view.month = g.dataset.month; render(); }
  });
}
