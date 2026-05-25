function playYouTube(el) {
  var videoId = el.dataset.videoId;
  var iframe = document.createElement('iframe');
  iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&rel=0';
  iframe.title = 'Document Controller demo';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
  el.onclick = null;
  el.style.cursor = 'default';
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(iframe);
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const pageMap = {
    'home': 'page-home',
    'revit': 'page-revit',
    'pocket-copy': 'page-pocket-copy',
    'contact': 'page-contact',
    'privacy': 'page-privacy',
    'terms': 'page-terms'
  };
  const navMap = {
    'home': 'nav-home',
    'revit': 'nav-revit',
    'pocket-copy': 'nav-mac',
    'contact': 'nav-contact',
    'privacy': '',
    'terms': ''
  };

  const page = document.getElementById(pageMap[id]);
  const navId = navMap[id];
  const nav = navId ? document.getElementById(navId) : null;
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
