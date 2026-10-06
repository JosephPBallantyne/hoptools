function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const pageMap = {
    'home': 'page-home',
    'revit': 'page-revit',
    'pocket-copy': 'page-pocket-copy',
    'samh': 'page-samh',
    'contact': 'page-contact',
    'privacy': 'page-privacy',
    'terms': 'page-terms'
  };
  const navMap = {
    'home': 'nav-home',
    'revit': 'nav-revit',
    'pocket-copy': 'nav-mac',
    'samh': 'nav-android',
    'contact': 'nav-contact',
    'privacy': '',
    'terms': ''
  };

  const page = document.getElementById(pageMap[id]);
  const navId = navMap[id];
  const nav = navId ? document.getElementById(navId) : null;
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');
  updateAccent();
  window.scrollTo(0, 0);

  // Bookmarkable URLs: hash routes work for file:// (e.g. index.html#contact); clean / on http(s) for home
  if (id === 'home') {
    if (location.protocol === 'file:') {
      history.pushState(null, '', location.pathname + location.search);
    } else {
      history.pushState(null, '', '/');
    }
  } else {
    history.pushState(null, '', '#' + id);
  }
}

// Handle back/forward browser navigation
window.addEventListener('popstate', () => {
  const hash = window.location.hash.replace('#', '') || 'home';
  showPage(hash);
});

// On load, show correct page from hash
document.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.replace('#', '') || 'home';
  showPage(hash);
});

// Theme: light by default; dark only when the visitor picks it
function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  if (next === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try {
    localStorage.setItem('theme', next);
  } catch (e) {}
}

// Home tabs: sámh is the default, Document Controller is one click away
let homeTab = 'samh';

function showHomeTab(tab) {
  homeTab = tab;
  document.querySelectorAll('.home-tab').forEach(t => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  document.querySelectorAll('.home-panel').forEach(p => {
    p.hidden = p.dataset.panel !== tab;
  });
  updateAccent();
}

// sámh gets its own palette whenever it's what's on screen
function updateAccent() {
  const onSamh =
    document.getElementById('page-samh').classList.contains('active') ||
    (document.getElementById('page-home').classList.contains('active') && homeTab === 'samh');
  if (onSamh) document.documentElement.dataset.accent = 'samh';
  else delete document.documentElement.dataset.accent;
}

const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('.lightbox-img');
let lightboxShots = [];
let lightboxIndex = 0;

function openLightbox(shots, index) {
  lightboxShots = shots;
  lightboxIndex = index;
  renderLightbox();
  lightbox.showModal();
}

function closeLightbox() {
  lightbox.close();
}

function stepLightbox(delta) {
  lightboxIndex = (lightboxIndex + delta + lightboxShots.length) % lightboxShots.length;
  renderLightbox();
}

function renderLightbox() {
  const shot = lightboxShots[lightboxIndex];
  lightboxImg.src = shot.src;
  lightboxImg.alt = shot.alt;
}

document.querySelectorAll('.samh-shots').forEach((gallery) => {
  const shots = [...gallery.querySelectorAll('img')];
  shots.forEach((img, i) => img.addEventListener('click', () => openLightbox(shots, i)));
});

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

lightbox.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') stepLightbox(-1);
  if (e.key === 'ArrowRight') stepLightbox(1);
});

let touchStartX = null;
lightbox.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
});
lightbox.addEventListener('touchend', (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1);
  touchStartX = null;
});
