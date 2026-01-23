// script.js — fixed, GitHub Pages friendly
const MANIFEST = 'newsletters/index.json';
const NEWS_DIR = 'newsletters/';
const DEFAULT_THUMB = `thumbnails/placeholder.png`;

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
  const normalized = filename.replace(/\\/g, '/').trim();
  // block traversal and absolute paths
  if (normalized.includes('..') || normalized.startsWith('/')) return '';
  return normalized;
}

function parseFrontmatter(text) {
  // tolerate BOM + leading whitespace/newlines
  let src = String(text || '').replace(/\r/g, '');
  src = src.replace(/^\uFEFF/, '').replace(/^\s+/, '');

  if (!src.startsWith('---\n') && src !== '---') {
    return { meta: {}, body: src.trim() };
  }

  const lines = src.split('\n');
  const meta = {};
  let i = 1;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') {
      i++;
      break;
    }
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
  const paragraphs = String(text || '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  return paragraphs
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function renderMarkdownSafe(text) {
  if (typeof window !== 'undefined' && window.marked && window.DOMPurify) {
    const raw = window.marked.parse(String(text || ''));
    return window.DOMPurify.sanitize(raw, {
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style']
    });
  }
  return renderParagraphs(text);
}

function resolveThumbPath(thumbValue) {
  if (!thumbValue) return DEFAULT_THUMB;
  // If they wrote "thumbnails/x.jpg", make it "/thumbnails/x.jpg"
  const t = String(thumbValue).trim();
  if (/^(https?:)?\/\//i.test(t) || t.startsWith('/')) return t;
  if (t.startsWith('newsletters/')) return t;
  if (t.startsWith('thumbnails/')) return t;
  return t;
}

function createCard(filename, meta) {
  const el = document.createElement('article');
  el.className = 'news-card';
  el.dataset.file = filename;
  el.style.cursor = 'pointer';

  const thumbEl = document.createElement('div');
  thumbEl.className = 'news-thumb';
  thumbEl.style.backgroundImage = `url("${encodeURI(resolveThumbPath(meta.Thumbnail))}")`;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'news-body';

  const metaEl = document.createElement('div');
  metaEl.className = 'news-meta';
  const date = formatDate(meta.Date);
  metaEl.textContent = `${date}${date ? ' • ' : ''}${meta.Author || 'Staff'}`;

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

function renderArticle(container, filename, meta, body) {
  const title = meta.Title || filename;
  const subtitle = meta.Subtitle || '';
  const date = formatDate(meta.Date);
  const author = meta.Author || 'Staff';
  const metaLine = `${date}${date ? ' • ' : ''}${author}`;


  const thumbUrl = resolveThumbPath(meta.Thumbnail);
  const thumbAlt = `${title} thumbnail`;
  const bodyHtml =
    (window.marked && window.DOMPurify) ? renderMarkdownSafe(body) : renderParagraphs(body);

  container.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="lead">${escapeHtml(subtitle)}</p>` : ''}
    <p class="news-meta">${escapeHtml(metaLine)}</p>
    <hr />
    ${bodyHtml}
  `;

  document.title = `${title} — The Gazette`;
}

async function initListPage() {
  const newsListEl = document.getElementById('news-list');
  if (!newsListEl) return;

  const manifest = await loadManifest();
  if (!manifest.length) {
    newsListEl.innerHTML = `<p>No newsletters found.</p>`;
    return;
  }

  const results = (await Promise.all(
    manifest.map(async f => {
      try {
        const parsed = await loadNewsletter(f);
        return { file: f, meta: parsed.meta, body: parsed.body };
      } catch (e) {
        console.warn('Skipping', f, e);
        return null;
      }
    })
  )).filter(Boolean);

  results.sort((a, b) => {
    if (a.meta.Date && b.meta.Date) return new Date(b.meta.Date) - new Date(a.meta.Date);
    return a.file.localeCompare(b.file);
  });

  for (const r of results) {
    newsListEl.appendChild(createCard(r.file, r.meta));
  }
}

async function initArticlePage() {
  const content = document.getElementById('article-content');
  if (!content) return;

  const params = new URLSearchParams(window.location.search);
  const file = sanitizeFilename(params.get('article'));
  if (!file) {
    content.innerHTML = `<p>Missing or invalid article parameter.</p>`;
    return;
  }

  try {
    const parsed = await loadNewsletter(file);
    renderArticle(content, file, parsed.meta, parsed.body);
  } catch (e) {
    console.error(e);
    content.innerHTML = `<p>Could not load article: <strong>${escapeHtml(file)}</strong></p>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initListPage();
  await initArticlePage();
});
