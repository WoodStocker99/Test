// script.js — manifest-driven newsletter loader + safe article rendering
// Works with local thumbnails (thumbnails/foo.jpg) and external URLs.
// Hides items with Hidden: true from the newsletters list and from the Featured block.

// ---- Paths ----
const MANIFEST = 'newsletters/index.json';
const NEWS_DIR = 'newsletters/';
const DEFAULT_THUMB = 'thumbnails/placeholder.png';

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
  // block traversal, absolute paths, and external URLs for filenames taken from URL query
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
    .replace(/\r/g, '') // CRLF -> LF
    .replace(/^\uFEFF/, '') // strip BOM
    .replace(/^\s+/, ''); // tolerate leading whitespace
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
  return paragraphs
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}
function renderMarkdownSafe(text) {
  if (typeof window !== 'undefined' && window.marked && window.DOMPurify) {
    const raw = window.marked.parse(String(text ?? ''));
    return window.DOMPurify.sanitize(raw, {
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'], // conservative
    });
  }
  return renderParagraphs(text);
}
// ---- Thumbnail path resolver ----
function resolveThumbPath(thumbValue) {
  if (!thumbValue) return DEFAULT_THUMB;
  const t = String(thumbValue).trim();
  if (/^(https?:)?\/\//i.test(t)) return t; // external or protocol-relative
  if (t.startsWith('/')) return t; // root-relative
  if (t.startsWith('thumbnails/') || t.startsWith('newsletters/')) return t; // local known
  return t; // other relative paths
}
// ---- Card rendering for lists/featured ----
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
// ---- Soft-hide helpers ----
function isTruthy(val) {
  if (val === true) return true;
  if (typeof val === 'string') return /^(true|yes|1)$/i.test(val.trim());
  if (typeof val === 'number') return val !== 0;
  return false;
}
// ---- Homepage Featured (now excludes Hidden) ----
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

  const visible = results.filter(r => !isTruthy(r.meta.Hidden) /* && !isTruthy(r.meta.Draft) */);
  if (!visible.length) {
    featuredEl.innerHTML = `<p class="news-meta">No visible newsletters found.</p>`;
    return;
  }
  visible.sort((a, b) => {
    const ad = a.meta.Date ? new Date(a.meta.Date) : null;
    const bd = b.meta.Date ? new Date(b.meta.Date) : null;
    const aOk = ad && !Number.isNaN(ad.getTime());
    const bOk = bd && !Number.isNaN(b.getTime?.() ?? bd.getTime());
    if (aOk && bOk) return bd - ad;
    if (aOk) return -1;
    if (bOk) return 1;
    return b.file.localeCompare(a.file);
  });
  featuredEl.innerHTML = '';
  featuredEl.appendChild(createCard(visible[0].file, visible[0].meta));
}
// ---- Newsletters list (excludes Hidden) ----
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

  const visible = results.filter(r => !isTruthy(r.meta.Hidden) /* && !isTruthy(r.meta.Draft) */);
  if (!visible.length) {
    newsListEl.innerHTML = `<p class="news-meta">No newsletters to display.</p>`;
    return;
  }
  visible.sort((a, b) => {
    if (a.meta.Date && b.meta.Date) return new Date(b.meta.Date) - new Date(a.meta.Date);
    return a.file.localeCompare(b.file);
  });
  for (const r of visible) {
    newsListEl.appendChild(createCard(r.file, r.meta));
  }
}
// ---- Article render ----
function renderArticle(container, filename, meta, body) {
  const title = meta.Title || filename;
  const subtitle = meta.Subtitle || '';
  const date = formatDate(meta.Date);
  const author = meta.Author || 'Staff';
  const metaLine = `${date}${date ? ' • ' : ''}${author}`;
  const thumbUrl = resolveThumbPath(meta.Thumbnail);
  const thumbAlt = `${title} thumbnail`;
  const thumbHtml = thumbUrl
    ? `<img src="${escapeHtml(encodeURI(thumbUrl))}" alt="${escapeHtml(thumbAlt)}" class="article-thumb">`
    : '';
  const bodyHtml = renderMarkdownSafe(body);

  container.innerHTML = `
    ${thumbHtml}
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="lead">${escapeHtml(subtitle)}</p>` : ''}
    <p class="news-meta">${escapeHtml(metaLine)}</p>
    <div class="article-body">${bodyHtml}</div>
  `;
  document.title = `${title} — Sleepy Hollow Media`;
}
// ---- Article bootstrap ----
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
  } catch (e) {
    console.error(e);
    content.innerHTML = `<p class="news-meta">Could not load article: ${escapeHtml(file)}</p>`;
  }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  await initFeaturedArticle();
  await initListPage();
  await initArticlePage();

  // --- Sleepy Hollow mobile menu toggle ---
  const toggle = document.querySelector('.sh-nav-toggle');
  const menu = document.getElementById('sh-mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('active');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }
});