'use strict';
/* =====================================================================
   Formulaire d'ajout / modification d'une opération :
   dépense, revenu ou virement entre comptes, avec favoris et photo du ticket.
   ===================================================================== */

const MAX_FAVORITES = 12;

function fillAccountSelect(sel, value) {
  sel.innerHTML = state.accounts
    .map((a) => `<option value="${a.id}" ${a.id === value ? 'selected' : ''}>${a.icon} ${escapeHtml(a.name)}</option>`)
    .join('');
}

function renderCats() {
  const type = view.formType;
  const list = cats(type).slice();
  // une ancienne opération dont la catégorie est masquée garde sa catégorie
  const current = allCats(type).find((c) => c.id === view.formCat);
  if (current && !list.includes(current)) list.push(current);
  $('#fCats').innerHTML = list.map((c) => `
    <button type="button" class="cat ${c.id === view.formCat ? 'active' : ''}" data-cat="${c.id}"
      role="radio" aria-checked="${c.id === view.formCat}"><span>${c.icon}</span>${escapeHtml(c.name)}</button>`).join('');
}

function renderFavs() {
  const favs = state.favorites.filter((f) => f.type === view.formType);
  const show = !view.editingId && view.formType !== 'transfer' && favs.length > 0;
  $('#fFavs').hidden = !show;
  if (!show) return;
  $('#fFavs').innerHTML = `<span class="favs-label">⭐ Favoris</span>${favs.map((f) => {
    const c = findCat(f.type, f.category);
    return `<button type="button" class="fav" data-fav="${f.id}">${c.icon} ${escapeHtml(f.note || c.name)} <b>${fmt(f.amount)}</b></button>`;
  }).join('')}`;
}

function setFormType(type) {
  if (type === 'transfer' && !multiAccounts()) type = 'expense';
  view.formType = type;
  const isTransfer = type === 'transfer';
  if (!isTransfer && !allCats(type).some((c) => c.id === view.formCat)) view.formCat = cats(type)[0].id;
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  $('#fCats').hidden = isTransfer;
  $('#fTransfer').hidden = !isTransfer;
  $('#fAccountWrap').hidden = isTransfer || !multiAccounts();
  $('#fFavWrap').hidden = isTransfer || !!view.editingId;
  $('#fPhotoWrap').hidden = isTransfer;
  if (!isTransfer) renderCats();
  renderFavs();
}

/* ---------- Photo du ticket ---------- */

let photoUrl = null;
function showPhotoPreview(blob) {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = blob ? URL.createObjectURL(blob) : null;
  $('#fPhotoImg').src = photoUrl || '';
  $('#fPhotoPreview').hidden = !blob;
  $('#fPhotoBtn').hidden = !!blob;
}

async function onPhotoChosen(file) {
  if (!file) return;
  try {
    $('#fPhotoBtn').textContent = '⏳ Préparation de la photo…';
    const blob = await compressImage(file);
    view.formPhoto = blob;
    showPhotoPreview(blob);
  } catch (_) {
    toast("Impossible de lire cette photo");
  } finally {
    $('#fPhotoBtn').textContent = '📷 Ajouter la photo du ticket';
  }
}

/* ---------- Ouverture / fermeture ---------- */

function openForm(tx = null, preset = {}) {
  view.editingId = tx ? tx.id : null;
  $('#sheetTitle').textContent = tx ? "Modifier l'opération" : 'Nouvelle opération';
  $('#fDelete').hidden = !tx;
  $('#fCurrency').textContent = currency().symbol;
  $('#fAmount').value = tx ? amountInput(tx.amount) : '';
  $('#fNote').value = tx ? tx.note || '' : '';
  const today = new Date();
  $('#fDate').value = tx ? tx.date : (view.month === monthKey(today) ? isoDate(today) : `${view.month}-01`);
  view.formCat = tx ? tx.category : null;

  const first = state.accounts[0].id;
  const second = (state.accounts[1] || state.accounts[0]).id;
  fillAccountSelect($('#fAccount'), tx ? tx.accountId : (view.filter.account || first));
  fillAccountSelect($('#fFrom'), tx && tx.type === 'transfer' ? tx.accountId : first);
  fillAccountSelect($('#fTo'), tx && tx.type === 'transfer' ? tx.toAccountId : second);
  $('#segTransfer').hidden = !multiAccounts();

  $('#fRepeatWrap').hidden = !!tx; // la répétition se choisit seulement à la création
  $('#fRepeat').value = '';
  updateRepeatHint();
  $('#fFav').checked = false;

  view.formPhoto = undefined;
  showPhotoPreview(null);
  if (tx && tx.photo) {
    getPhoto(tx.id).then((b) => { if (b && view.editingId === tx.id) showPhotoPreview(b); }).catch(() => {});
  }

  setFormType(preset.type || (tx ? tx.type : 'expense'));
  $('#backdrop').hidden = false;
  $('#sheet').hidden = false;
  $('#sheet').scrollTop = 0;
  if (!tx) setTimeout(() => $('#fAmount').focus(), 50);
}

function closeForm() {
  $('#backdrop').hidden = true;
  $('#sheet').hidden = true;
  view.editingId = null;
  showPhotoPreview(null);
}

/* ---------- Enregistrement ---------- */

function addFavorite(d) {
  const same = state.favorites.find((f) => f.type === d.type && f.category === d.category
    && f.amount === d.amount && (f.note || '') === (d.note || ''));
  if (same) return false;
  if (state.favorites.length >= MAX_FAVORITES) {
    toast(`${MAX_FAVORITES} favoris maximum : supprime-en dans Réglages`);
    return false;
  }
  state.favorites.push({ id: uid(), type: d.type, amount: d.amount, category: d.category, note: d.note, accountId: d.accountId });
  return true;
}

let submitting = false;

async function submitForm(e) {
  e.preventDefault();
  if (submitting) return; // évite un double enregistrement pendant la sauvegarde de la photo
  submitting = true;
  const btn = $('#sheet [type=submit]');
  btn.disabled = true;
  try {
    await saveForm();
  } finally {
    submitting = false;
    btn.disabled = false;
  }
}

async function saveForm() {
  const amount = parseAmount($('#fAmount').value);
  if (!(amount > 0)) {
    toast('Entre un montant valide');
    $('#fAmount').focus();
    return;
  }
  const type = view.formType;
  const data = {
    type,
    amount: Math.round(amount * 1000) / 1000,
    date: $('#fDate').value || todayIso(),
    note: $('#fNote').value.trim(),
  };
  if (type === 'transfer') {
    data.category = 'transfer';
    data.accountId = $('#fFrom').value;
    data.toAccountId = $('#fTo').value;
    if (data.accountId === data.toAccountId) { toast('Choisis deux comptes différents'); return; }
  } else {
    data.category = view.formCat;
    data.accountId = multiAccounts() ? $('#fAccount').value : state.accounts[0].id;
  }

  let saved = null;
  let message;
  if (view.editingId) {
    saved = state.tx.find((x) => x.id === view.editingId);
    if (type !== 'transfer') delete saved.toAccountId;
    Object.assign(saved, data);
    message = 'Opération modifiée';
  } else if ($('#fRepeat').value) {
    // Opération récurrente : on crée la règle, puis on ajoute celles dont la date est arrivée
    const rule = { id: uid(), ...data, freq: $('#fRepeat').value, day: parseIso(data.date).getDate(), next: data.date };
    state.recurring.push(rule);
    applyRecurring();
    message = rule.next !== data.date
      ? 'Opération récurrente créée'
      : `Opération récurrente programmée pour le ${shortDate(data.date)}`;
  } else {
    saved = { id: uid(), created: Date.now(), ...data };
    state.tx.push(saved);
    message = { income: 'Revenu ajouté', expense: 'Dépense ajoutée', transfer: 'Virement enregistré' }[type];
  }

  // Photo du ticket
  if (saved && type !== 'transfer') {
    try {
      if (view.formPhoto instanceof Blob) { await putPhoto(saved.id, view.formPhoto); saved.photo = true; }
      else if (view.formPhoto === null) { await deletePhoto(saved.id); delete saved.photo; }
    } catch (_) {
      message = "Opération enregistrée, mais la photo n'a pas pu être gardée";
    }
  }

  if (!view.editingId && type !== 'transfer' && $('#fFav').checked && addFavorite(data)) {
    message += ' · ajoutée aux favoris ⭐';
  }

  save();
  view.month = data.date.slice(0, 7);
  if (saved) freshId = saved.id;
  closeForm();
  render();
  toast(budgetAlert(data) || message);
}

function quickAddFavorite(id) {
  const f = state.favorites.find((x) => x.id === id);
  if (!f) return;
  const t = {
    id: uid(), created: Date.now(),
    type: f.type, amount: f.amount, category: f.category, note: f.note || '',
    accountId: account(f.accountId).id,
    date: $('#fDate').value || todayIso(),
  };
  state.tx.push(t);
  save();
  view.month = t.date.slice(0, 7);
  freshId = t.id;
  closeForm();
  render();
  toast(budgetAlert(t) || `Ajouté : ${f.note || findCat(f.type, f.category).name} ${fmt(f.amount)}`);
}

async function deleteTx() {
  const id = view.editingId;
  const t = state.tx.find((x) => x.id === id);
  if (!t) return;
  const ok = await askConfirm('Supprimer cette opération ?', `${txTitle(t)} · ${fmt(t.amount)} · ${shortDate(t.date)}`, 'Supprimer');
  if (!ok) return;
  state.tx = state.tx.filter((x) => x.id !== id);
  if (t.photo) deletePhoto(id);
  save();
  closeForm();
  render();
  toast('Opération supprimée');
}

function initForm() {
  $('#fab').addEventListener('click', () => openForm());
  $('#backdrop').addEventListener('click', closeForm);
  $('#fCancel').addEventListener('click', closeForm);
  $('#fDelete').addEventListener('click', deleteTx);
  $('#sheet').addEventListener('submit', submitForm);
  $('#fRepeat').addEventListener('change', updateRepeatHint);
  $('#fDate').addEventListener('change', updateRepeatHint);

  document.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (b) setFormType(b.dataset.type);
  });
  $('#fCats').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (b) { view.formCat = b.dataset.cat; renderCats(); }
  });
  $('#fFavs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (b) quickAddFavorite(b.dataset.fav);
  });

  $('#fPhotoBtn').addEventListener('click', () => $('#fPhotoInput').click());
  $('#fPhotoInput').addEventListener('change', (e) => { onPhotoChosen(e.target.files[0]); e.target.value = ''; });
  $('#fPhotoRemove').addEventListener('click', () => { view.formPhoto = null; showPhotoPreview(null); });
  $('#fPhotoImg').addEventListener('click', () => { if (photoUrl) openPhotoViewer(photoUrl); });
}
