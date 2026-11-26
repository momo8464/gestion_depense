'use strict';
/* =====================================================================
   Code PIN.
   Le code n'est jamais enregistré tel quel : on garde seulement une empreinte
   (PBKDF2 + sel aléatoire). Il bloque l'accès à l'appli, mais ne chiffre pas
   les données enregistrées sur le téléphone.
   ===================================================================== */

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
  closeDialog(null);
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
  clearPhotos();
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

function initSecurity() {
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
}
