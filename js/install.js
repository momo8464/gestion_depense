'use strict';
/* =====================================================================
   Proposition d'installation.
   Quand l'appli est ouverte dans le navigateur (et pas depuis l'icône
   installée), on propose de l'installer à chaque visite.
   ===================================================================== */

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
let installEvent = null; // fourni par Chrome quand l'installation en un clic est possible

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // on garde la proposition pour notre propre bouton
  installEvent = e;
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  hideInstall();
  toast("Application installée ! Ouvre-la depuis ton écran d'accueil.");
});

function manualInstallText() {
  if (isIOS) {
    return "Dans Safari, touche le bouton Partager (le carré avec une flèche ↑), puis « Sur l'écran d'accueil ».";
  }
  return "Ouvre le menu ⋮ du navigateur (en haut à droite), puis « Installer l'application » ou « Ajouter à l'écran d'accueil ». "
    + "Si elle est déjà installée, ouvre-la depuis ton écran d'accueil.";
}

function showInstall() {
  if (isInstalled()) return;
  // Sur iPhone il n'y a pas d'installation en un clic : on affiche directement la marche à suivre
  $('#installHow').textContent = isIOS ? manualInstallText() : '';
  $('#installHow').hidden = !isIOS;
  $('#installBtn').hidden = isIOS;
  $('#installBackdrop').hidden = false;
  $('#install').hidden = false;
}

function hideInstall() {
  $('#installBackdrop').hidden = true;
  $('#install').hidden = true;
}

async function installApp() {
  if (installEvent) {
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    if (outcome === 'accepted') hideInstall();
  } else {
    // Installation en un clic impossible ici : on explique comment faire à la main
    $('#installHow').textContent = manualInstallText();
    $('#installHow').hidden = false;
    $('#installBtn').hidden = true;
  }
}

function initInstall() {
  $('#installBtn').addEventListener('click', installApp);
  $('#installLater').addEventListener('click', hideInstall);
  $('#installBackdrop').addEventListener('click', hideInstall);
}
