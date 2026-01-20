// Unified client script for list view, modal view (legacy), and article page.
// Hardened and with optional Markdown support.

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
  return filename.replace(/\\/g, '/').replace(/(^\/+|\.\.\/+)/g, '').trim();
}

function renderParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return paragraphs.map(p => {
    const html = escapeHtml(p).replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }).join('\n');
}

function renderMarkdownSafe(text) {
  if (typeof window !== 'undefined' && window.marked && window.DOMPurify) {
    try {
      const raw = window.marked.parse(text || '');
      return window.DOMPurify.sanitize(raw, {ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style']});
    } catch (e) {
      console.warn('Markdown render failed, falling back to plain text.', e);
      return renderParagraphs(text);
    }
  }
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

  const isListPage = document.body && document.body.dataset && document.body.dataset.page === 'list';
  const hasModal = !!document.getElementById('article-view');
  if (isListPage) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      location.href = `article.html?article=${encodeURIComponent(sanitizeFilename(filename))}`;
    });
  } else if (hasModal) {
    el.addEventListener('click', () => openArticle(filename, meta));
  } else {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      location.href = `article.html?article=${encodeURIComponent(sanitizeFilename(filename))}`;
    });
  }

  return el;
}

async function openArticle(filename, metaAndBody) {
  const aside = document.getElementById('article-view');
  const content = document.getElementById('article-content');
  const isModal = !!aside && content && aside.contains(content);

  let prevFocus;
  let cleanup = () => {};
  if (isModal) {
    prevFocus = document.activeElement;
    const closeBtn = document.getElementById('close-article');
    if (closeBtn) closeBtn.focus();

    function onKey(e) {
      if (e.key === 'Escape') closeArticle();
    }
    document.addEventListener('keydown', onKey);
    cleanup = () => {
      document.removeEventListener('keydown', onKey);
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
  }

  const doRender = async () => {
    let meta = {};
    let body = '';
    if (typeof metaAndBody === 'string') {
      try { const parsed = await loadNewsletter(metaAndBody); meta = parsed.meta; body = parsed.body; } catch (e) { meta = {}; body = ''; }
    } else if (metaAndBody && metaAndBody.meta) { meta = metaAndBody.meta; body = metaAndBody.body || ''; }
    else if (metaAndBody && typeof metaAndBody === 'object') { meta = metaAndBody; }

    const thumbHtml = meta.Thumbnail ? `<img src="${escapeHtml(meta.Thumbnail)}" alt="${escapeHtml(meta.Title || '')}" style="max-width:100%;border-radius:4px;margin-bottom:12px">` : '';
    const dateStr = meta.Date ? new Date(meta.Date).toLocaleDateString() : '';
    const metaLine = `${escapeHtml(dateStr)}${dateStr ? ' • ' : ''}${escapeHtml(meta.Author || 'Staff')}`;

    const articleBodyHtml = (window.marked && window.DOMPurify) ? renderMarkdownSafe(body) : renderParagraphs(body);

    const html = `
      ${thumbHtml}
      <h1>${escapeHtml(meta.Title || filename)}</h1>
      <div class="lead">${escapeHtml(meta.Subtitle || '')}</div>
      <div class="news-meta" style="margin-top:8px">${metaLine}</div>
      <hr>
      <div class="article-body">${articleBodyHtml}</div>
    `;

    if (isModal) {
      content.innerHTML = html;
      aside.hidden = false;
      history.replaceState(null, '', `?article=${encodeURIComponent(sanitizeFilename(filename))}`);
      const closeBtn = document.getElementById('close-article');
      if (closeBtn) closeBtn.addEventListener('click', () => { cleanup(); }, { once: true });
    } else if (content) {
      content.innerHTML = html;
      document.title = `${meta.Title ? meta.Title + ' — ' : ''}The Gazette`;
      const base = location.pathname.endsWith('article.html') ? 'article.html' : location.pathname;
      history.replaceState(null, '', `${base}?article=${encodeURIComponent(sanitizeFilename(filename))}`);
    } else {
      location.href = `article.html?article=${encodeURIComponent(sanitizeFilename(filename))}`;
    }
  };

  await doRender();
}

function closeArticle() {
  const aside = document.getElementById('article-view');
  if (aside) aside.hidden = true;
  history.replaceState(null, '', '/');
}

function parseFrontmatter(text) {
  text = text.replace(/\r/g, '');
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.trim() };
  }
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

  if (newsListEl) {
    const manifestToUse = manifest;
    if (!manifestToUse.length) {
      newsListEl.innerHTML = '<p>No newsletters found. Add .txt files to newsletters/ and list them in newsletters/index.json.</p>';
    } else {
      const promises = manifestToUse.map(async (f) => {
        try { const parsed = await loadNewsletter(f); return { file: f, meta: parsed.meta, body: parsed.body }; }
        catch (err) { console.warn('Skip', f, err); return null; }
      });
      const results = (await Promise.all(promises)).filter(Boolean);

      results.sort((a,b) => {
        if (a.meta.Date && b.meta.Date) return new Date(b.meta.Date) - new Date(a.meta.Date);
        return a.file.localeCompare(b.file);
      });

      for (const r of results) {
        const card = createCard(r.file, r.meta);
        newsListEl.appendChild(card);
      }
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('article');
  if (q) {
    openArticle(q);
  }

  const closeBtn = document.getElementById('close-article');
  if (closeBtn) closeBtn.addEventListener('click', closeArticle);
}

document.addEventListener('DOMContentLoaded', init);