function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const pageMap = {
    'home': 'page-home',
    'pocket-copy': 'page-pocket-copy',
    'contact': 'page-contact',
    'privacy': 'page-privacy',
    'terms': 'page-terms'
  };
  const navMap = {
    'home': 'nav-home',
    'pocket-copy': 'nav-home',
    'contact': 'nav-contact'
  };

  const page = document.getElementById(pageMap[id]);
  const nav = document.getElementById(navMap[id]);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');
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
