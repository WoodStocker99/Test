#!/usr/bin/env node
// Validates newsletters/index.json and each .txt frontmatter keys

const fs = require('fs').promises;
const path = require('path');

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

async function loadManifest() {
  const p = path.join(__dirname, '..', 'newsletters', 'index.json');
  try {
    const raw = await fs.readFile(p, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('index.json is not an array');
    return arr;
  } catch (e) {
    throw new Error('Failed to load newsletters/index.json: ' + e.message);
  }
}

function validateDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

async function main() {
  let ok = true;
  try {
    const manifest = await loadManifest();
    if (manifest.length === 0) {
      console.warn('Warning: manifest is empty');
    }
    for (const file of manifest) {
      if (typeof file !== 'string') {
        console.error('Manifest contains non-string entry:', file);
        ok = false;
        continue;
      }
      const filePath = path.join(__dirname, '..', 'newsletters', file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const { meta } = parseFrontmatter(raw);
        if (meta.Date && !validateDate(meta.Date)) {
          console.error(`${file}: Date value is not YYYY-MM-DD: ${meta.Date}`);
          ok = false;
        }
        if (!meta.Title) {
          console.warn(`${file}: missing Title in frontmatter`);
        }
      } catch (e) {
        console.error(`Missing or unreadable file listed in manifest: ${file}`);
        ok = false;
      }
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (!ok) process.exit(2);
  console.log('Validation passed');
}

main();
