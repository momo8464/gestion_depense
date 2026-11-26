'use strict';
/* =====================================================================
   Sauvegarde, restauration (avec mot de passe facultatif), export CSV
   et rappel de sauvegarde.

   Sauvegarde protégée : les données sont chiffrées en AES-GCM avec une clé
   tirée du mot de passe (PBKDF2, 200 000 tours). Sans le mot de passe,
   le fichier est illisible — et personne ne peut le récupérer.
   ===================================================================== */

/* ---------- Chiffrement ---------- */

async function keyFromPassword(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200000 },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  return { app: 'mes-depenses', encrypted: true, v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

async function decryptText(box, password) {
  const key = await keyFromPassword(password, fromB64(box.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
  return new TextDecoder().decode(plain);
}

/* ---------- Sauvegarde ---------- */

async function backupFlow() {
  const v = await askDialog({
    title: 'Sauvegarder mes données',
    text: "Tu peux protéger le fichier par un mot de passe. Note-le bien : sans lui, impossible de restaurer. "
      + "Laisse vide pour une sauvegarde simple. Les photos des tickets ne sont pas incluses.",
    fields: [
      { id: 'pw', label: 'Mot de passe (facultatif)', type: 'password' },
      { id: 'pw2', label: 'Confirme le mot de passe', type: 'password' },
    ],
    ok: 'Sauvegarder',
    validate: (x) => {
      if (x.pw !== x.pw2) return 'Les deux mots de passe sont différents';
      if (x.pw && x.pw.length < 4) return 'Mot de passe trop court (4 caractères minimum)';
      return null;
    },
  });
  if (!v) return;
  state.settings.lastBackup = Date.now();
  state.settings.backupSnooze = 0;
  save();
  const json = JSON.stringify(state, null, 2);
  const date = todayIso();
  if (v.pw) {
    const box = await encryptText(json, v.pw);
    download(`sauvegarde-depenses-${date}-protegee.json`, JSON.stringify(box), 'application/json');
    toast('🔒 Sauvegarde protégée enregistrée dans tes téléchargements');
  } else {
    download(`sauvegarde-depenses-${date}.json`, json, 'application/json');
    toast('Sauvegarde enregistrée dans tes téléchargements');
  }
  render();
}

async function restore(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    toast("Ce fichier n'est pas une sauvegarde valide");
    return;
  }
  if (data && data.encrypted) {
    const v = await askDialog({
      title: 'Sauvegarde protégée',
      text: 'Entre le mot de passe choisi au moment de la sauvegarde.',
      fields: [{ id: 'pw', label: 'Mot de passe', type: 'password', required: true }],
      ok: 'Ouvrir',
    });
    if (!v) return;
    try {
      data = JSON.parse(await decryptText(data, v.pw));
    } catch (_) {
      toast('Mot de passe incorrect');
      return;
    }
  }
  if (!data || !Array.isArray(data.tx)) {
    toast("Ce fichier n'est pas une sauvegarde valide");
    return;
  }
  const next = normalize(data);
  const ok = await askConfirm('Restaurer cette sauvegarde ?',
    `Tes données actuelles seront remplacées par celles du fichier (${next.tx.length} opérations, ${next.accounts.length} compte(s)).`,
    'Restaurer');
  if (!ok) return;
  state = next;
  applyRecurring();
  save();
  render();
  toast('Sauvegarde restaurée');
}

/* ---------- Export tableur ---------- */

function exportCsv() {
  const rows = [['Date', 'Type', 'Catégorie', 'Compte', 'Vers le compte', 'Montant', 'Devise', 'Note']];
  const sorted = [...state.tx].sort((a, b) => a.date.localeCompare(b.date));
  const type = { income: 'Revenu', expense: 'Dépense', transfer: 'Virement' };
  for (const t of sorted) {
    const signed = t.type === 'expense' ? -t.amount : t.amount;
    rows.push([
      t.date,
      type[t.type],
      txTitle(t),
      account(t.accountId).name,
      t.type === 'transfer' ? account(t.toAccountId).name : '',
      String(signed).replace('.', ','),
      state.settings.currency,
      t.note || '',
    ]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`depenses-${todayIso()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
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
