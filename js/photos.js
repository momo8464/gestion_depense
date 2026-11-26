'use strict';
/* =====================================================================
   Photos des tickets de caisse.
   Elles sont trop lourdes pour le stockage habituel : on les range dans
   IndexedDB (une petite base de données du navigateur), réduites et
   compressées. Elles ne sont pas incluses dans les sauvegardes .json.
   ===================================================================== */

const PHOTO_DB = 'mes-depenses-photos';
let photoDbPromise = null;

function photoDb() {
  if (!photoDbPromise) {
    photoDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(PHOTO_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return photoDbPromise;
}

async function photoStore(mode, action) {
  const db = await photoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const req = action(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

const putPhoto = (id, blob) => photoStore('readwrite', (s) => s.put(blob, id));
const getPhoto = (id) => photoStore('readonly', (s) => s.get(id));
const deletePhoto = (id) => photoStore('readwrite', (s) => s.delete(id)).catch(() => {});
const clearPhotos = () => photoStore('readwrite', (s) => s.clear()).catch(() => {});

// Réduit la photo (1280 px maximum) et la compresse en JPEG : environ 100 à 200 Ko
async function compressImage(file, max = 1280, quality = 0.75) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- Affichage en grand ---------- */

function openPhotoViewer(src) {
  $('#photoViewImg').src = src;
  $('#photoView').hidden = false;
}

function closePhotoViewer() {
  $('#photoView').hidden = true;
  $('#photoViewImg').removeAttribute('src');
}

function initPhotos() {
  $('#photoClose').addEventListener('click', closePhotoViewer);
  $('#photoView').addEventListener('click', (e) => { if (e.target.id === 'photoView') closePhotoViewer(); });
}
