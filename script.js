// Simple newsletter manifest + txt loader and renderer (hardened, markdown support)
// Format for each newsletter .txt:
// ---
// Title: Headline here
// Subtitle: Short subtitle here
// Author: Jane Reporter
// Thumbnail: thumbnails/example.jpg
// Date: 2026-01-20
// ---
// Body lines follow here. Blank lines become paragraphs.

const MANIFEST = 'newsletters/index.json';
const NEWS_DIR = 'newsletters/';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return ''; 
  return filename.replace(/\\/g, '/').replace(/(^\/+|\.\.+\/+)/g, '').trim();
}

function renderParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return paragraphs.map(p => {
    const html = escapeHtml(p).replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }).join('\n');
}

function renderMarkdownSafe(text) {
  // If marked + DOMPurify are available (loaded via CDN), use them to render + sanitize
  if (typeof window !== 'undefined' && window.marked && window.DOMPurify) {
    try {
      const raw = window.marked.parse(text || '');
      return window.DOMPurify.sanitize(raw, {ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style']});
    } catch (e) {
      console.warn('Markdown render failed, falling back to plain text.', e);
      return renderParagraphs(text);
    }
  }
  // fallback to plain-text paragraphs
  return renderParagraphs(text);
}

async function loadManifest() {
  try {
    const res = await fetch(MANIFEST);
    if (!res.ok) throw new Error('Manifest not found');
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter(item => typeof item === 'string').map(sanitizeFilename);
  } catch (err) {
    console.warn('Could not load manifest:', err);
    return [];
  }
}

async function loadNewsletter(filename) {
  const sanitized = sanitizeFilename(filename);
  if (!sanitized) throw new Error('Invalid filename');
  const path = NEWS_DIR + sanitized;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  const text = await res.text();
  return parseFrontmatter(text);
}

function createCard(filename, meta) {
  const thumb = meta.Thumbnail ? escapeHtml(meta.Thumbnail) : 'thumbnails/placeholder.png';
  const date = meta.Date ? new Date(meta.Date).toLocaleDateString() : '';
  const el = document.createElement('article');
  el.className = 'news-card';
  el.dataset.file = filename;

  const thumbEl = document.createElement('div');
  thumbEl.className = 'news-thumb';
  try { thumbEl.style.backgroundImage = `url("${encodeURI(thumb)}")`; } catch(e) { thumbEl.style.backgroundImage = '' }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'news-body';

  const metaEl = document.createElement('div');
  metaEl.className = 'news-meta';
  metaEl.textContent = `${date}${date ? ' • ' : ''}${meta.Author || 'Staff'}`;

  const titleEl = document.createElement('h3');
  titleEl.className = 'news-title';
  titleEl.textContent = meta.Title || filename;

  const subEl = document.createElement('p');
  subEl.className = 'news-sub';
  subEl.textContent = meta.Subtitle || '';

  bodyEl.appendChild(metaEl);
  bodyEl.appendChild(titleEl);
  bodyEl.appendChild(subEl);

  el.appendChild(thumbEl);
  el.appendChild(bodyEl);

  el.addEventListener('click', () => openArticle(filename, meta));
  return el;
}

function openArticle(filename, metaAndBody) {
  const aside = document.getElementById('article-view');
  const content = document.getElementById('article-content');

  const prevFocus = document.activeElement;
  document.getElementById('close-article').focus();

  function onKey(e) {
    if (e.key === 'Escape') closeArticle();
  }
  document.addEventListener('keydown', onKey);

  const cleanup = () => {
    document.removeEventListener('keydown', onKey);
    if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
  };

  const doRender = async () => {
    let meta = {};
    let body = '';
    if (typeof metaAndBody === 'string') {
      try { const parsed = await loadNewsletter(metaAndBody); meta = parsed.meta; body = parsed.body; }
      catch (err) { meta = {}; body = ''; }
    } else if (metaAndBody && metaAndBody.meta) { meta = metaAndBody.meta; body = metaAndBody.body || ''; }
    else if (metaAndBody && typeof metaAndBody === 'object') { meta = metaAndBody; }

    const thumbHtml = meta.Thumbnail ? `<img src="${escapeHtml(meta.Thumbnail)}" alt="${escapeHtml(meta.Title || '')}" style="max-width:100%;border-radius:4px;margin-bottom:12px">` : '';
    const date = meta.Date ? new Date(meta.Date).toLocaleDateString() : '';

    const articleBodyHtml = (typeof window !== 'undefined' && window.marked && window.DOMPurify) ? renderMarkdownSafe(body) : renderParagraphs(body);

    content.innerHTML = `
      ${thumbHtml}
      <h1>${escapeHtml(meta.Title || filename)}</h1>
      <div class="lead">${escapeHtml(meta.Subtitle || '')}</div>
      <div class="news-meta" style="margin-top:8px">${escapeHtml(date)}${date ? ' • ' : ''}${escapeHtml(meta.Author || 'Staff')}</div>
      <hr>
      <div class="article-body">${articleBodyHtml}</div>
    `;

    aside.hidden = false;
    history.replaceState(null, '', `?article=${encodeURIComponent(sanitizeFilename(filename))}`);

    const closeBtn = document.getElementById('close-article');
    const onClose = () => { cleanup(); closeBtn.removeEventListener('click', onClose); };
    closeBtn.addEventListener('click', onClose, { once: true });
  };
  doRender();
}

function closeArticle() {
  const aside = document.getElementById('article-view');
  aside.hidden = true;
  history.replaceState(null, '', '/');
}

function parseFrontmatter(text) {
  text = text.replace(/\r/g, '');
  if (!text.startsWith('---')) { return { meta: {}, body: text.trim() }; }
  const parts = text.split('\n');
  let i = 1;
  const meta = {};
  for (; i < parts.length; i++) {
    const line = parts[i].trim();
    if (line === '---') { i++; break; }
    if (!line) continue;
    const m = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if (m) meta[m[1].trim()] = m[2].trim();
  }
  const body = parts.slice(i).join('\n').trim();
  return { meta, body };
}

async function init() {
  const newsListEl = document.getElementById('news-list');
  const manifest = await loadManifest();
  if (!manifest.length) {
    newsListEl.innerHTML = '<p>No newsletters found. Add .txt files to newsletters/ and list them in newsletters/index.json.</p>';
    return;
  }

  const promises = manifest.map(async (f) => {
    try { const parsed = await loadNewsletter(f); return { file: f, meta: parsed.meta, body: parsed.body }; }
    catch (err) { console.warn('Skip', f, err); return null; }
  });

  const results = (await Promise.all(promises)).filter(Boolean);
  results.sort((a,b) => {
    if (a.meta.Date && b.meta.Date) return new Date(b.meta.Date) - new Date(b.meta.Date);
    return a.file.localeCompare(b.file);
  });

  for (const r of results) {
    const card = createCard(r.file, r.meta);
    card.addEventListener('click', () => openArticle(r.file, r));
    newsListEl.appendChild(card);
  }

  document.getElementById('close-article').addEventListener('click', closeArticle);

  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('article');
  if (q) {
    const sanitized = sanitizeFilename(q);
    const found = results.find(r => r.file === sanitized);
    if (found) openArticle(found.file, found);
    else openArticle(sanitized);
  }
}

document.addEventListener('DOMContentLoaded', init);
