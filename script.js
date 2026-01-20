// Simple newsletter manifest + txt loader and renderer
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

function parseFrontmatter(text) {
  // returns {meta: {...}, body: "..." }
  text = text.replace(/\r/g, '');
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.trim() };
  }
  const parts = text.split('\n');
  // find closing ---
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

function renderParagraphs(text) {
  // simple: split on blank lines to paragraphs, preserve single line breaks within paragraph
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return paragraphs.map(p => {
    const html = p.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }).join('\n');
}

async function loadManifest() {
  try {
    const res = await fetch(MANIFEST);
    if (!res.ok) throw new Error('Manifest not found');
    return res.json();
  } catch (err) {
    console.warn('Could not load manifest:', err);
    return [];
  }
}

async function loadNewsletter(filename) {
  const path = NEWS_DIR + filename;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  const text = await res.text();
  return parseFrontmatter(text);
}

function createCard(filename, meta) {
  const thumb = meta.Thumbnail || 'thumbnails/placeholder.png';
  const date = meta.Date ? new Date(meta.Date).toLocaleDateString() : '';
  const el = document.createElement('article');
  el.className = 'news-card';
  el.dataset.file = filename;
  el.innerHTML = `
    <div class="news-thumb" style="background-image:url('${thumb}')"></div>
    <div class="news-body">
      <div class="news-meta">${date} • ${meta.Author || 'Staff'}</div>
      <h3 class="news-title">${meta.Title || filename}</h3>
      <p class="news-sub">${meta.Subtitle || ''}</p>
    </div>
  `;
  el.addEventListener('click', () => openArticle(filename, meta));
  return el;
}

function openArticle(filename, metaAndBody) {
  const aside = document.getElementById('article-view');
  const content = document.getElementById('article-content');
  document.getElementById('close-article').focus();

  // If metaAndBody is a string|object:
  const doRender = async () => {
    let meta = {};
    let body = '';
    if (typeof metaAndBody === 'string') {
      const parsed = await loadNewsletter(metaAndBody).catch(() => ({meta:{},body:''}));
      meta = parsed.meta; body = parsed.body;
    } else if (metaAndBody.meta) { meta = metaAndBody.meta; body = metaAndBody.body; }
    const thumb = meta.Thumbnail ? `<img src="${meta.Thumbnail}" alt="" style="max-width:100%;border-radius:4px;margin-bottom:12px">` : '';
    const date = meta.Date ? new Date(meta.Date).toLocaleDateString() : '';
    content.innerHTML = `
      ${thumb}
      <h1>${meta.Title || filename}</h1>
      <div class="lead">${meta.Subtitle || ''}</div>
      <div class="news-meta" style="margin-top:8px">${date} • ${meta.Author || 'Staff'}</div>
      <hr>
      <div class="article-body">${renderParagraphs(body)}</div>
    `;
    aside.hidden = false;
    history.replaceState(null, '', `?article=${encodeURIComponent(filename)}`);
  };
  doRender();
}

function closeArticle() {
  const aside = document.getElementById('article-view');
  aside.hidden = true;
  history.replaceState(null, '', '/');
}

async function init() {
  const newsListEl = document.getElementById('news-list');
  const manifest = await loadManifest();
  if (!manifest.length) {
    newsListEl.innerHTML = '<p>No newsletters found. Add .txt files to newsletters/ and list them in newsletters/index.json.</p>';
    return;
  }

  // load meta for each file (but don't render body yet)
  const promises = manifest.map(async (f) => {
    try {
      const parsed = await loadNewsletter(f);
      return { file: f, meta: parsed.meta, body: parsed.body };
    } catch (err) {
      console.warn('Skip', f, err);
      return null;
    }
  });

  const results = (await Promise.all(promises)).filter(Boolean);
  // Show newest first if Date present
  results.sort((a,b) => {
    if (a.meta.Date && b.meta.Date) return new Date(b.meta.Date) - new Date(a.meta.Date);
    return a.file.localeCompare(b.file);
  });

  for (const r of results) {
    const card = createCard(r.file, r.meta);
    // clicking card opens with already loaded meta + body
    card.addEventListener('click', () => openArticle(r.file, r));
    newsListEl.appendChild(card);
  }

  // article close
  document.getElementById('close-article').addEventListener('click', closeArticle);

  // support opening via URL ?article=filename
  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('article');
  if (q) {
    const found = results.find(r => r.file === q);
    if (found) openArticle(found.file, found);
    else {
      // try to fetch directly
      openArticle(q);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);