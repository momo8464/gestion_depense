'use strict';
/* =====================================================================
   Onglet Réglages : général, budgets par catégorie, catégories
   personnalisées, favoris, récurrentes, sécurité, sauvegarde.
   ===================================================================== */

// Section repliable qui garde son état ouvert/fermé quand l'écran se redessine
function foldCard(key, title, summaryText, body) {
  return `
    <details class="card fold" data-fold="${key}" ${view.open.has(key) ? 'open' : ''}>
      <summary><h3>${title}</h3><span class="hint">${summaryText} ›</span></summary>
      ${body}
    </details>`;
}

function categoriesBody() {
  const hidden = state.settings.hiddenCats || [];
  const group = (type, title) => `
    <h4>${title}</h4>
    ${allCats(type).map((c) => {
      const isHidden = hidden.includes(c.id);
      const custom = state.customCats.some((x) => x.id === c.id);
      return `
        <div class="cat-row ${isHidden ? 'muted-row' : ''}">
          <span class="bubble sm" style="background:${c.color}22">${c.icon}</span>
          <span class="info"><b>${escapeHtml(c.name)}</b>${custom ? '<small>Personnalisée</small>' : ''}</span>
          ${custom ? `<button class="icon-btn sm" data-cat-edit="${c.id}" aria-label="Modifier ${escapeHtml(c.name)}">✏️</button>` : ''}
          <button class="btn ghost small" data-cat-toggle="${c.id}" data-type="${type}">${isHidden ? 'Afficher' : 'Masquer'}</button>
        </div>`;
    }).join('')}`;
  return `
    <p class="hint">Masque les catégories inutiles ou crée les tiennes. Une catégorie masquée reste visible
      dans tes anciennes opérations.</p>
    ${group('expense', 'Dépenses')}
    ${group('income', 'Revenus')}
    <button class="btn primary" data-action="cat-new" style="width:100%;margin-top:12px">+ Nouvelle catégorie</button>`;
}

function favoritesBody() {
  if (!state.favorites.length) {
    return `<p class="hint">Aucun favori. Pour en créer un, coche « ⭐ Ajouter aux favoris » en enregistrant une opération
      (ex. : café, ticket de bus). Il apparaîtra en haut du formulaire pour l'ajouter en un geste.</p>`;
  }
  return state.favorites.map((f) => {
    const c = findCat(f.type, f.category);
    return `
      <div class="cat-row">
        <span class="bubble sm" style="background:${c.color}22">${c.icon}</span>
        <span class="info"><b>${escapeHtml(f.note || c.name)}</b><small>${f.type === 'income' ? 'Revenu' : 'Dépense'} · ${escapeHtml(c.name)}</small></span>
        <span class="amt ${f.type === 'income' ? 'in' : ''}">${fmt(f.amount)}</span>
        <button class="icon-btn sm" data-fav-del="${f.id}" aria-label="Supprimer ce favori">🗑</button>
      </div>`;
  }).join('');
}

function budgetsBody() {
  return `
    <p class="hint">Montant maximum à dépenser par mois dans chaque catégorie. Laisse vide pour ne pas en mettre.</p>
    ${cats('expense').map((c) => `
      <label class="setting">
        <span>${c.icon} ${escapeHtml(c.name)}</span>
        <input data-catbudget="${c.id}" inputmode="decimal" placeholder="Aucun" value="${amountInput(catBudget(c.id))}">
      </label>`).join('')}`;
}

function securityCard() {
  return `
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
    </div>`;
}

function renderSettings() {
  const s = state.settings;
  const nbBudgets = budgetRows().length;
  const nbCustom = state.customCats.length;
  const nbHidden = (s.hiddenCats || []).length;
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
        <span>Budget mensuel<br><small class="muted">0 = pas de budget</small></span>
        <input id="sBudget" inputmode="decimal" value="${amountInput(s.budget)}" placeholder="0">
      </div>
    </div>
    ${foldCard('budgets', 'Budgets par catégorie', nbBudgets ? `${nbBudgets} défini${nbBudgets > 1 ? 's' : ''}` : 'Aucun', budgetsBody())}
    ${foldCard('cats', 'Catégories', [nbCustom ? `${nbCustom} perso` : '', nbHidden ? `${nbHidden} masquée${nbHidden > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'Personnaliser', categoriesBody())}
    ${foldCard('favs', 'Favoris', state.favorites.length ? `${state.favorites.length}` : 'Aucun', favoritesBody())}
    ${recurringCard()}
    ${securityCard()}
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
        <button class="btn ghost" id="sBackup">💾 Sauvegarder (fichier .json)</button>
        <button class="btn ghost" id="sRestore">📂 Restaurer une sauvegarde</button>
        <button class="btn ghost" id="sExportCsv">📄 Exporter en tableur (CSV)</button>
      </div>
    </div>
    <div class="card">
      <h3>Zone dangereuse</h3>
      <p class="hint">${state.tx.length} opération(s) enregistrée(s).</p>
      <button class="btn danger" id="sReset" style="width:100%">Tout effacer</button>
    </div>`;
}

/* ---------- Catégories personnalisées ---------- */

function catFields(c = {}) {
  return [
    { id: 'name', label: 'Nom', type: 'text', value: c.name, required: true, maxlength: 20, placeholder: 'Ex. : Animaux' },
    { id: 'icon', label: 'Emoji', type: 'text', value: c.icon || '🏷️', maxlength: 4, hint: 'Choisis-en un sur le clavier emoji de ton téléphone' },
    { id: 'color', label: 'Couleur', type: 'color', value: c.color },
  ];
}

async function newCategory() {
  const fields = [
    { id: 'type', label: 'Type', type: 'select', value: 'expense',
      options: [{ value: 'expense', label: 'Dépense' }, { value: 'income', label: 'Revenu' }] },
    ...catFields(),
  ];
  const v = await askDialog({ title: 'Nouvelle catégorie', fields, ok: 'Créer' });
  if (!v) return;
  state.customCats.push({ id: `c-${uid()}`, type: v.type, name: v.name, icon: v.icon || '🏷️', color: v.color || CAT_COLORS[0] });
  save();
  render();
  toast(`Catégorie « ${v.name} » créée`);
}

async function editCategory(id) {
  const c = state.customCats.find((x) => x.id === id);
  if (!c) return;
  const used = state.tx.some((t) => t.category === id) || state.recurring.some((r) => r.category === id)
    || state.favorites.some((f) => f.category === id);
  const fields = catFields(c);
  if (!used) {
    fields.push({ id: 'remove', label: 'Supprimer cette catégorie ?', type: 'select', value: 'no',
      options: [{ value: 'no', label: 'Non, la garder' }, { value: 'yes', label: 'Oui, la supprimer' }] });
  }
  const v = await askDialog({
    title: `Modifier « ${c.name} »`,
    text: used ? 'Cette catégorie est utilisée : tu peux la masquer, mais pas la supprimer.' : '',
    fields, ok: 'Enregistrer',
  });
  if (!v) return;
  if (v.remove === 'yes') {
    state.customCats = state.customCats.filter((x) => x.id !== id);
    delete state.settings.catBudgets[id];
    toast('Catégorie supprimée');
  } else {
    Object.assign(c, { name: v.name, icon: v.icon || c.icon, color: v.color || c.color });
    toast('Catégorie modifiée');
  }
  save();
  render();
}

function toggleCategory(id, type) {
  const hidden = new Set(state.settings.hiddenCats || []);
  if (hidden.has(id)) {
    hidden.delete(id);
  } else {
    const visible = allCats(type).filter((c) => !hidden.has(c.id));
    if (visible.length <= 1) { toast('Il faut garder au moins une catégorie visible'); return; }
    hidden.add(id);
  }
  state.settings.hiddenCats = [...hidden];
  save();
  render();
}

/* ---------- Tout effacer ---------- */

async function resetAll() {
  const ok = await askConfirm('Tout effacer ?',
    'Opérations, récurrentes, comptes, objectifs, dettes, favoris et photos seront supprimés définitivement. '
    + 'Tes réglages (devise, budgets, code PIN) sont conservés.', 'Tout effacer');
  if (!ok) return;
  state = normalize({ settings: state.settings });
  clearPhotos();
  save();
  render();
  toast('Toutes les données ont été effacées');
}

/* ---------- Événements ---------- */

function initSettings() {
  const tab = $('#tab-settings');

  // mémorise les sections ouvertes (l'événement « toggle » ne remonte pas : on l'écoute en capture)
  tab.addEventListener('toggle', (e) => {
    const key = e.target.dataset && e.target.dataset.fold;
    if (!key) return;
    if (e.target.open) view.open.add(key); else view.open.delete(key);
  }, true);

  tab.addEventListener('change', (e) => {
    const catId = e.target.dataset.catbudget;
    if (catId) {
      const v = parseAmount(e.target.value || '0');
      state.settings.catBudgets = { ...state.settings.catBudgets };
      if (v > 0) state.settings.catBudgets[catId] = v;
      else delete state.settings.catBudgets[catId];
      save();
      // pas de render() ici : la liste reste ouverte pour saisir les autres catégories
      const name = findCat('expense', catId).name;
      toast(v > 0 ? `Budget ${name} : ${fmt(v)} par mois` : `Budget ${name} supprimé`);
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

  tab.addEventListener('click', (e) => {
    const el = (attr) => e.target.closest(`[${attr}]`);
    let b;
    if ((b = el('data-stop'))) return stopRecurring(b.dataset.stop);
    if ((b = el('data-cat-edit'))) return editCategory(b.dataset.catEdit);
    if ((b = el('data-cat-toggle'))) return toggleCategory(b.dataset.catToggle, b.dataset.type);
    if ((b = el('data-fav-del'))) {
      state.favorites = state.favorites.filter((f) => f.id !== b.dataset.favDel);
      save(); render(); toast('Favori supprimé');
      return;
    }
    if (el('data-action')?.dataset.action === 'cat-new') return newCategory();
    const id = e.target.closest('button')?.id;
    if (id === 'sPinOn') setupPin();
    if (id === 'sPinChange') askCurrentPin(setupPin);
    if (id === 'sPinOff') disablePin();
    if (id === 'sExportCsv') exportCsv();
    if (id === 'sBackup') backupFlow();
    if (id === 'sRestore') $('#importFile').click();
    if (id === 'sReset') resetAll();
  });

  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) restore(e.target.files[0]);
    e.target.value = '';
  });
}
