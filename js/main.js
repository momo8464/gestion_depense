'use strict';
/* =====================================================================
   Fichier principal : affichage général, navigation et démarrage.
   Chargé en dernier, une fois toutes les fonctions définies.
   ===================================================================== */

const TABS = ['list', 'stats', 'plus', 'settings'];

function render() {
  $('#monthLabel').textContent = monthLabel(view.month);
  for (const tab of TABS) $(`#tab-${tab}`).hidden = view.tab !== tab;
  document.querySelectorAll('.bottom button').forEach((b) => {
    const on = b.dataset.tab === view.tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const withSummary = view.tab === 'list' || view.tab === 'stats';
  $('#summary').hidden = !withSummary;
  $('#fab').hidden = !withSummary;
  if (withSummary) renderSummary();
  if (view.tab === 'list') renderList();
  if (view.tab === 'stats') renderStats();
  if (view.tab === 'plus') renderPlus();
  if (view.tab === 'settings') renderSettings();
  if (pendingToast) { toast(pendingToast); pendingToast = null; }
}

// Aller à un onglet (et éventuellement à une sous-page de « Plus »)
function goTo(tab, sub = null) {
  view.tab = tab;
  view.sub = sub;
  render();
  window.scrollTo(0, 0);
}

function initMain() {
  $('#prevMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, 1); render(); });

  document.querySelector('.bottom').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) goTo(b.dataset.tab);
  });

  document.addEventListener('keydown', (e) => {
    if (!$('#lock').hidden) {
      if (/^[0-9]$/.test(e.key)) pressKey(e.key);
      if (e.key === 'Backspace') pressKey('del');
      return;
    }
    if (e.key !== 'Escape') return;
    if (!$('#photoView').hidden) return closePhotoViewer();
    if (!$('#dlg').hidden) return closeDialog(null);
    if (!$('#install').hidden) return hideInstall();
    if (!$('#sheet').hidden) closeForm();
  });

  // Si l'appli reste ouverte d'un jour à l'autre, on vérifie les récurrentes en revenant dessus.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const n = applyRecurring();
    if (n) {
      pendingToast = recurringMessage(n);
      if (!locked) render(); // si l'appli est verrouillée, le message s'affichera après le code PIN
    }
  });
}

/* ---------- Démarrage ---------- */

initDialog();
initPhotos();
initList();
initStats();
initForm();
initPlus();
initSettings();
initSecurity();
initInstall();
initMain();

const addedAtStart = applyRecurring();
if (addedAtStart) pendingToast = recurringMessage(addedAtStart);

if (pinData) lockApp();
else render();

// Proposition d'installation, un court instant après l'ouverture (si on est dans le navigateur).
// Avec un code PIN, elle apparaît derrière l'écran de verrouillage, donc juste après le déverrouillage.
if (location.protocol.startsWith('http')) setTimeout(showInstall, 800);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Demande au navigateur de ne pas effacer les données de l'appli quand il manque de place
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
