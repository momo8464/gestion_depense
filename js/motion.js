'use strict';
/* =====================================================================
   Mouvements de l'interface. Chacun répond à quelque chose :
   - le billet s'incline avec le téléphone, avec un reflet holographique ;
   - le solde défile jusqu'à sa nouvelle valeur après un ajout ;
   - la nouvelle opération est mise en évidence dans la liste ;
   - un tampon « Atteint ! » s'imprime sur un objectif réussi ;
   - un mini-billet reste visible en haut quand on fait défiler la liste.
   Tout est désactivé si le téléphone demande de réduire les animations.
   ===================================================================== */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motionOn = () => !reduceMotion.matches;

let freshId = null; // opération à mettre en évidence au prochain affichage de la liste

/* ---------- Compteur : le montant défile jusqu'à sa nouvelle valeur ---------- */

const counterFrames = new WeakMap();

function countTo(el, from, to, duration = 700) {
  if (!el) return;
  cancelAnimationFrame(counterFrames.get(el));
  if (!motionOn() || from === null || from === to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1) counterFrames.set(el, requestAnimationFrame(step));
  };
  el.textContent = fmt(from);
  counterFrames.set(el, requestAnimationFrame(step));
  // sécurité : si le navigateur met les animations en pause, la bonne valeur s'affiche quand même
  setTimeout(() => { el.textContent = fmt(to); }, duration + 150);
}

// Valeurs affichées la dernière fois : on ne fait défiler que si le mois est le même
const shownSummary = { month: null, balance: null, income: null, expense: null };

function animateSummary(t) {
  const same = shownSummary.month === view.month;
  countTo($('#sumBalance'), same ? shownSummary.balance : null, t.balance);
  countTo($('#sumIncome'), same ? shownSummary.income : null, t.income);
  countTo($('#sumExpense'), same ? shownSummary.expense : null, t.expense);
  Object.assign(shownSummary, { month: view.month, balance: t.balance, income: t.income, expense: t.expense });
}

/* ---------- Nouvelle opération mise en évidence ---------- */

function highlightFresh() {
  if (!freshId) return;
  const row = document.querySelector(`.tx[data-id="${freshId}"]`);
  freshId = null;
  if (!row) return;
  row.classList.add('fresh');
  row.addEventListener('animationend', () => row.classList.remove('fresh'), { once: true });
  const r = row.getBoundingClientRect();
  if (r.top < 80 || r.bottom > innerHeight - 90) {
    row.scrollIntoView({ block: 'center', behavior: motionOn() ? 'smooth' : 'auto' });
  }
}

/* ---------- Tampon ---------- */

function stampFeedback() {
  if (motionOn() && navigator.vibrate) navigator.vibrate([20, 60, 40]);
}

/* ---------- Billet holographique ---------- */

const tilt = { rx: 0, ry: 0, tx: 0, ty: 0, frame: 0, baseB: null, baseG: null };

function tiltLoop() {
  tilt.rx += (tilt.tx - tilt.rx) * 0.12;
  tilt.ry += (tilt.ty - tilt.ry) * 0.12;
  const el = $('#summary');
  el.style.setProperty('--rx', `${tilt.rx.toFixed(2)}deg`);
  el.style.setProperty('--ry', `${tilt.ry.toFixed(2)}deg`);
  // le reflet glisse dans le sens de l'inclinaison
  el.style.setProperty('--holo', `${(50 + tilt.ry * 5 - tilt.rx * 3).toFixed(1)}%`);
  const moving = Math.abs(tilt.tx - tilt.rx) > 0.03 || Math.abs(tilt.ty - tilt.ry) > 0.03;
  tilt.frame = moving ? requestAnimationFrame(tiltLoop) : 0;
}

function setTilt(x, y) {
  const clamp = (v) => Math.max(-9, Math.min(9, v));
  tilt.tx = clamp(x);
  tilt.ty = clamp(y);
  if (!tilt.frame) tilt.frame = requestAnimationFrame(tiltLoop);
}

function onOrientation(e) {
  if (e.beta === null || document.hidden || $('#summary').hidden || !motionOn()) return;
  // la position « normale » du téléphone s'adapte doucement à la façon dont on le tient
  if (tilt.baseB === null) { tilt.baseB = e.beta; tilt.baseG = e.gamma; }
  tilt.baseB += (e.beta - tilt.baseB) * 0.01;
  tilt.baseG += (e.gamma - tilt.baseG) * 0.01;
  setTilt((tilt.baseB - e.beta) * 0.5, (e.gamma - tilt.baseG) * 0.5);
}

function startOrientation() {
  window.addEventListener('deviceorientation', onOrientation);
}

/* ---------- Mini-billet quand la carte du solde sort de l'écran ---------- */

function updateMini(t) {
  $('#miniBalance').textContent = fmt(t.balance);
  $('#miniBalance').classList.toggle('neg', t.balance < 0);
  $('#miniSplit').innerHTML = `<span class="in">${fmt(t.income, true)}</span> <span class="out">${fmt(-t.expense, true)}</span>`;
}

function initMotion() {
  const card = $('#summary');

  // Inclinaison : capteurs du téléphone ; souris sur ordinateur
  if (window.DeviceOrientationEvent) {
    startOrientation(); // suffit sur la plupart des téléphones Android
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // certains navigateurs (iPhone, Chrome récent) demandent l'autorisation après un premier toucher
      document.addEventListener('pointerdown', () => {
        DeviceOrientationEvent.requestPermission().catch(() => {});
      }, { once: true, capture: true });
    }
  }
  card.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !motionOn()) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt(-y * 12, x * 14);
  });
  card.addEventListener('pointerleave', () => setTilt(0, 0));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setTilt(0, 0); });

  // Mini-billet
  const header = $('.top');
  const io = new IntersectionObserver(([entry]) => {
    header.classList.toggle('show-mini', !entry.isIntersecting && !card.hidden && entry.boundingClientRect.top < 0);
  }, { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` });
  io.observe(card);
  $('#miniNote').addEventListener('click', () => window.scrollTo({ top: 0, behavior: motionOn() ? 'smooth' : 'auto' }));
}
