// script.js — Sleepy Hollow Media
// Manifest-driven content + article hero + reading time + share + next/prev

// ---- Config & Paths ----
const MANIFEST = 'newsletters/index.json';
const NEWS_DIR = 'newsletters/';
const DEFAULT_THUMB = 'thumbnails/placeholder.png';
const LATEST_LIMIT = 8; // homepage grid

// ---- Utils ----
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const normalized = filename.replace(/\\/g, '/').trim();
  if (
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    normalized.startsWith('http:') ||
    normalized.startsWith('https:')
  ) {
    return '';
  }
  return normalized || '';
}
function parseFrontmatter(text) {
  let src = String(text ?? '')
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/^\s+/, '');
  if (!src.startsWith('---\n') && src !== '---') {
    return { meta: {}, body: src.trim() };
  }
  const lines = src.split('\n');
  const meta = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') { i++; break; }
    if (!line) continue;
    const m = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if (m) meta[m[1].trim()] = m[2].trim();
  }
  const body = lines.slice(i).join('\n').trim();
  return { meta, body };
}
async function loadManifest() {
  try {
    const res = await fetch(MANIFEST, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Manifest not found: ${MANIFEST}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(sanitizeFilename).filter(Boolean);
  } catch (err) {
    console.warn('Could not load manifest:', err);
    return [];
  }
}
async function loadNewsletter(filename) {
  const sanitized = sanitizeFilename(filename);
  if (!sanitized) throw new Error('Invalid filename');
  const path = `${NEWS_DIR}${sanitized}`;
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  const text = await res.text();
  return parseFrontmatter(text);
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}
function renderParagraphs(text) {
  const paragraphs = String(text ?? '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
  return paragraphs.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}
function renderMarkdownSafe(text) {
  if (typeof window !== 'undefined' && window.marked && window.DOMPurify) {
    const raw = window.marked.parse(String(text ?? ''));
    return window.DOMPurify.sanitize(raw, {
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
    });
  }
  return renderParagraphs(text);
}
function resolveThumbPath(thumbValue) {
  if (!thumbValue) return DEFAULT_THUMB;
  const t = String(thumbValue).trim();
  if (/^(https?:)?\/\//i.test(t)) return t;
  if (t.startsWith('/')) return t;
  if (t.startsWith('thumbnails/') || t.startsWith('newsletters/')) return t;
  return t;
}
function isTruthy(val) {
  if (val === true) return true;
  if (typeof val === 'string') return /^(true|yes|1)$/i.test(val.trim());
  if (typeof val === 'number') return val !== 0;
  return false;
}

// ---- UI helpers ----
function markCurrentNav() {
  const path = location.pathname.split('/').pop() || 'index.html';
  const map = { 'index.html': 'home', 'newsletters.html': 'newsletters' };
  const key = map[path];
  if (!key) return;
  document.querySelectorAll(`[data-nav="${key}"]`).forEach(a => {
    a.setAttribute('aria-current', 'page');
  });
}
function readingTimeFromText(text, wpm = 200) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / wpm));
  return `${mins} min read`;
}

// ---- Cards for list/featured/grid ----
function createCard(filename, meta) {
  const el = document.createElement('article');
  el.className = 'news-card';
  el.dataset.file = filename;
  el.style.cursor = 'pointer';

  const thumbEl = document.createElement('div');
  thumbEl.className = 'news-thumb';
  const thumbUrl = resolveThumbPath(meta.Thumbnail);
  thumbEl.style.backgroundImage = `url("${encodeURI(thumbUrl)}")`;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'news-body';

  const metaEl = document.createElement('div');
  metaEl.className = 'news-meta';
  const date = formatDate(meta.Date);
  const author = meta.Author || 'Staff';
  metaEl.textContent = `${date}${date ? ' • ' : ''}${author}`;

  const titleEl = document.createElement('h3');
  titleEl.className = 'news-title';
  titleEl.textContent = meta.Title || filename;

  const subEl = document.createElement('p');
  subEl.className = 'news-sub';
  subEl.textContent = meta.Subtitle || '';

  bodyEl.append(metaEl, titleEl, subEl);
  el.append(thumbEl, bodyEl);
  el.addEventListener('click', () => {
    location.href = `article.html?article=${encodeURIComponent(filename)}`;
  });
  return el;
}
function createGridCard(filename, meta) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `article.html?article=${encodeURIComponent(filename)}`;
  a.setAttribute('aria-label', meta.Title || filename);

  const img = document.createElement('div');
  img.className = 'card-img';
  img.style.backgroundImage = `url("${encodeURI(resolveThumbPath(meta.Thumbnail))}")`;

  const body = document.createElement('div');
  body.className = 'card-body';

  const metaLine = document.createElement('div');
  metaLine.className = 'card-meta';
  const date = formatDate(meta.Date);
  const author = meta.Author || 'Staff';
  metaLine.textContent = `${date}${date ? ' • ' : ''}${author}`;

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = meta.Title || filename;

  const sub = document.createElement('p');
  sub.className = 'card-sub';
  sub.textContent = meta.Subtitle || '';

  if (meta.Category) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = meta.Category;
    body.appendChild(chip);
  }

  body.append(metaLine, title, sub);
  a.append(img, body);
  return a;
}

// ---- Homepage Featured ----
async function initFeaturedArticle() {
  const featuredEl = document.getElementById('featured-article');
  if (!featuredEl) return;
  const manifest = await loadManifest();
  if (!manifest.length) {
    featuredEl.innerHTML = `<p class="news-meta">No newsletters found.</p>`;
    return;
  }
  const results = (await Promise.all(
    manifest.map(async (f) => {
      try { const parsed = await loadNewsletter(f); return { file: f, meta: parsed.meta }; }
      catch (e) { console.warn('Skipping', f, e); return null; }
    })
  )).filter(Boolean);

  const visible = results.filter(r => !isTruthy(r.meta.Hidden));
  if (!visible.length) {
    featuredEl.innerHTML = `<p class="news-meta">No visible newsletters found.</p>`;
    return;
  }
  visible.sort((a, b) => {
    const ad = a.meta.Date ? new Date(a.meta.Date) : null;
    const bd = b.meta.Date ? new Date(b.meta.Date) : null;
    const aOk = ad && !Number.isNaN(ad.getTime());
    const bOk = bd && !Number.isNaN(bd.getTime());
    if (aOk && bOk) return bd - ad;
    if (aOk) return -1;
    if (bOk) return 1;
    return b.file.localeCompare(a.file);
  });
  featuredEl.innerHTML = '';
  featuredEl.appendChild(createCard(visible[0].file, visible[0].meta));
}

// ---- Homepage Latest grid ----
async function initLatestGrid() {
  const grid = document.getElementById('latest-grid');
  if (!grid) return;

  const manifest = await loadManifest();
  if (!manifest.length) {
    grid.innerHTML = `<p class="news-meta">No newsletters found.</p>`;
    return;
  }

  const results = (await Promise.all(
    manifest.map(async (f) => {
      try { const parsed = await loadNewsletter(f); return { file: f, meta: parsed.meta }; }
      catch (e) { console.warn('Skipping', f, e); return null; }
    })
  )).filter(Boolean);

  const visible = results.filter(r => !isTruthy(r.meta.Hidden));
  if (!visible.length) {
    grid.innerHTML = `<p class="news-meta">No visible newsletters.</p>`;
    return;
  }

  visible.sort((a, b) => {
    const ad = a.meta.Date ? new Date(a.meta.Date) : null;
    const bd = b.meta.Date ? new Date(b.meta.Date) : null;
    const aOk = ad && !Number.isNaN(ad.getTime());
    const bOk = bd && !Number.isNaN(bd.getTime());
    if (aOk && bOk) return bd - ad;
    if (aOk) return -1;
    if (bOk) return 1;
    return b.file.localeCompare(a.file);
  });

  const top = visible.slice(0, LATEST_LIMIT);
  grid.innerHTML = '';
  for (const r of top) grid.appendChild(createGridCard(r.file, r.meta));
}

// ---- Newsletters list page ----
async function initListPage() {
  const newsListEl = document.getElementById('news-list');
  if (!newsListEl) return;
  const manifest = await loadManifest();
  if (!manifest.length) {
    newsListEl.innerHTML = `<p class="news-meta">No newsletters found.</p>`;
    return;
  }
  const results = (await Promise.all(
    manifest.map(async (f) => {
      try { const parsed = await loadNewsletter(f); return { file: f, meta: parsed.meta }; }
      catch (e) { console.warn('Skipping', f, e); return null; }
    })
  )).filter(Boolean);

  const visible = results.filter(r => !isTruthy(r.meta.Hidden));
  if (!visible.length) {
    newsListEl.innerHTML = `<p class="news-meta">No newsletters to display.</p>`;
    return;
  }
  visible.sort((a, b) => {
    if (a.meta.Date && b.meta.Date) return new Date(b.meta.Date) - new Date(a.meta.Date);
    return a.file.localeCompare(b.file);
  });
  for (const r of visible) newsListEl.appendChild(createCard(r.file, r.meta));
}

// ---- Article page ----
function populateArticleHero(meta) {
  const hero = document.getElementById('article-hero');
  const bg = document.querySelector('.article-hero-bg');
  const titleEl = document.getElementById('article-title');
  const subEl = document.getElementById('article-subtitle');
  const metaEl = document.getElementById('article-meta');
  const catEl = document.getElementById('article-category');

  const title = meta.Title || 'Untitled';
  const subtitle = meta.Subtitle || '';
  const date = formatDate(meta.Date);
  const author = meta.Author || 'Staff';
  const cat = meta.Category || '';

  titleEl.textContent = title;
  subEl.textContent = subtitle;
  metaEl.textContent = `${date}${date ? ' • ' : ''}${author}`;
  if (cat) {
    catEl.textContent = cat;
    catEl.hidden = false;
  } else {
    catEl.hidden = true;
  }

  const thumbUrl = resolveThumbPath(meta.Thumbnail);
  bg.style.backgroundImage = `url("${encodeURI(thumbUrl)}")`;
}
function buildShareLinks(title) {
  const url = location.href;
  const email = document.querySelector('[data-share="email"]');
  const reddit = document.querySelector('[data-share="reddit"]');
  const x = document.querySelector('[data-share="x"]');
  const copyBtn = document.querySelector('[data-share="copy"]');
  const feedback = document.getElementById('share-feedback');

  if (email) email.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;
  if (reddit) reddit.href = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
  if (x) x.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        if (feedback) { feedback.textContent = 'Link copied!'; setTimeout(()=>feedback.textContent='', 1500); }
      } catch {
        if (feedback) { feedback.textContent = 'Could not copy.'; setTimeout(()=>feedback.textContent='', 1500); }
      }
    });
  }
}
function setNextPrev(manifest, currentFile) {
  const prevA = document.getElementById('prev-article');
  const nextA = document.getElementById('next-article');
  if (!prevA || !nextA) return;

  const idx = manifest.indexOf(currentFile);
  if (idx > 0) {
    const prevFile = manifest[idx - 1];
    prevA.href = `article.html?article=${encodeURIComponent(prevFile)}`;
    prevA.hidden = false;
  }
  if (idx >= 0 && idx < manifest.length - 1) {
    const nextFile = manifest[idx + 1];
    nextA.href = `article.html?article=${encodeURIComponent(nextFile)}`;
    nextA.hidden = false;
  }
}
function renderArticle(container, filename, meta, body) {
  // Assemble hero first
  populateArticleHero(meta);

  // Compute reading time from *render-stripped* text
  const reading = readingTimeFromText(body, 200);
  const rtEl = document.getElementById('article-reading-time');
  if (rtEl) rtEl.textContent = ` • ${reading}`;

  // Render body with Markdown (sanitized)
  const bodyHtml = renderMarkdownSafe(body);

  // Inject into article content
  const subtitle = meta.Subtitle || '';
  const date = formatDate(meta.Date);
  const author = meta.Author || 'Staff';
  const metaLine = `${date}${date ? ' • ' : ''}${author}`;

  // We hide the first inline image (hero) via CSS, so body starts naturally
  container.innerHTML = `
    ${subtitle ? `<p class="lead">${escapeHtml(subtitle)}</p>` : ''}
    <p class="news-meta">${escapeHtml(metaLine)} • ${escapeHtml(reading)}</p>
    <div class="article-body">${bodyHtml}</div>
  `;

  document.title = `${meta.Title || filename} — Sleepy Hollow Media`;
}
async function initArticlePage() {
  const content = document.getElementById('article-content');
  if (!content) return;

  const params = new URLSearchParams(window.location.search);
  const file = sanitizeFilename(params.get('article'));
  if (!file) {
    content.innerHTML = `<p class="news-meta">Missing or invalid article parameter.</p>`;
    return;
  }

  try {
    const parsed = await loadNewsletter(file);
    renderArticle(content, file, parsed.meta, parsed.body);

    // Share links
    buildShareLinks(parsed.meta.Title || file);

    // Next/Prev: we want filename order DESC by date (newest last? depends).
    // Simpler: use manifest natural order and link neighbors.
    const manifest = await loadManifest();
    setNextPrev(manifest, file);
  } catch (e) {
    console.error(e);
    content.innerHTML = `<p class="news-meta">Could not load article: ${escapeHtml(file)}</p>`;
  }
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', async () => {
  // Header interactions
  const toggle = document.querySelector('.sh-nav-toggle');
  const menu = document.getElementById('sh-mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('active');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }
  markCurrentNav();

  // Pages
  await initFeaturedArticle();
  await initLatestGrid();
  await initListPage();
  await initArticlePage();
});