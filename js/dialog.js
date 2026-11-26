'use strict';
/* =====================================================================
   Petite fenêtre de saisie réutilisable (créer un compte, un objectif…).

   const v = await askDialog({
     title: 'Nouveau compte',
     fields: [{ id: 'name', label: 'Nom', type: 'text', required: true }],
   });
   → renvoie les valeurs saisies, ou null si l'utilisateur annule.

   Types de champ : text, amount, date, password, select (avec options), color.
   ===================================================================== */

let dialogState = null;

function fieldHtml(f) {
  const id = `dlg-${f.id}`;
  const val = escapeHtml(f.value ?? '');
  const hint = f.hint ? `<small class="field-hint muted">${escapeHtml(f.hint)}</small>` : '';
  if (f.type === 'select') {
    return `<label class="field" for="${id}">${escapeHtml(f.label)}
      <select id="${id}" name="${f.id}">
        ${f.options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === f.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>${hint}</label>`;
  }
  if (f.type === 'color') {
    return `<div class="field"><span>${escapeHtml(f.label)}</span>
      <div class="swatches">
        ${CAT_COLORS.map((c) => `<label class="swatch"><input type="radio" name="${f.id}" value="${c}" ${c === (f.value || CAT_COLORS[0]) ? 'checked' : ''}>
          <i style="background:${c}"></i></label>`).join('')}
      </div></div>`;
  }
  const type = f.type === 'amount' ? 'text' : f.type || 'text';
  const extra = [
    f.type === 'amount' ? 'inputmode="decimal"' : '',
    f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : '',
    f.maxlength ? `maxlength="${f.maxlength}"` : '',
    f.type === 'password' ? 'autocomplete="new-password"' : '',
  ].join(' ');
  return `<label class="field" for="${id}">${escapeHtml(f.label)}
    <input id="${id}" name="${f.id}" type="${type}" value="${val}" ${extra}>${hint}</label>`;
}

function askDialog({ title, text = '', fields = [], ok = 'Valider', danger = false, validate = null }) {
  if (dialogState) closeDialog(null);
  return new Promise((resolve) => {
    $('#dlgTitle').textContent = title;
    $('#dlgText').textContent = text;
    $('#dlgText').hidden = !text;
    $('#dlgOk').textContent = ok;
    $('#dlgOk').className = `btn ${danger ? 'danger' : 'primary'}`;
    $('#dlgFields').innerHTML = fields.map(fieldHtml).join('');
    dialogState = { resolve, fields, validate };
    $('#dlgBackdrop').hidden = false;
    $('#dlg').hidden = false;
    const first = $('#dlgFields input:not([type=radio]), #dlgFields select');
    if (first) setTimeout(() => first.focus(), 50);
  });
}

function closeDialog(result) {
  if (!dialogState) return;
  const { resolve } = dialogState;
  dialogState = null;
  $('#dlgBackdrop').hidden = true;
  $('#dlg').hidden = true;
  resolve(result);
}

function submitDialog(e) {
  e.preventDefault();
  if (!dialogState) return;
  const data = new FormData($('#dlg'));
  const values = {};
  for (const f of dialogState.fields) {
    let v = data.get(f.id);
    v = typeof v === 'string' ? v.trim() : '';
    if (f.required && !v) {
      toast(`${f.label} : à remplir`);
      return;
    }
    if (f.type === 'amount') {
      if (!v) v = f.required ? NaN : 0;
      else v = parseAmount(v);
      if (Number.isNaN(v)) {
        toast(`${f.label} : montant invalide`);
        return;
      }
    }
    values[f.id] = v;
  }
  const error = dialogState.validate ? dialogState.validate(values) : null;
  if (error) { toast(error); return; }
  closeDialog(values);
}

// Confirmation simple avec un bouton rouge
function askConfirm(title, text, ok = 'Confirmer') {
  return askDialog({ title, text, ok, danger: true }).then((v) => v !== null);
}

function initDialog() {
  $('#dlg').addEventListener('submit', submitDialog);
  $('#dlgCancel').addEventListener('click', () => closeDialog(null));
  $('#dlgBackdrop').addEventListener('click', () => closeDialog(null));
}
