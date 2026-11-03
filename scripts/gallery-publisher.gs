/**
 * PUDRUS.XYZ — gallery publisher (Google Apps Script)
 * ====================================================
 * Lives inside the form's responses Sheet (Extensions → Apps Script).
 *
 *   Tick "Publicar" on a row  → the uploaded image is resized (Drive thumbnails),
 *                               committed to GitHub (gallery/img/ + gallery/gallery.json)
 *                               and GitHub Pages updates the site in ~1–2 minutes.
 *   Untick "Publicar"         → the image is removed from the gallery.
 *
 * One-time setup (see the instructions in the chat / README):
 *   1. Paste this file into Apps Script and save.
 *   2. Project Settings → Script Properties → add GITHUB_TOKEN (fine-grained token,
 *      only repo fercat77/pudrus, permission "Contents: read and write").
 *   3. Run setup() once and accept the permissions.
 *
 * No secrets live in this file: the token is read from Script Properties.
 */

const CONFIG = {
  owner: 'fercat77',
  repo: 'pudrus',
  branch: 'main',
  sheetName: 'Respuestas de formulario 1',
  headers: {
    name: 'Tu nombre o usuario de Instagram:',
    image: 'Tu imagen:',
    publish: 'Publicar',
    tools: 'Herramientas',
    link: 'Link',
    status: 'Estado',
  },
  sizes: { full: 1600, thumb: 600 },
};

// File names exported by the tools look like "pudrus_<tool>_<timestamp>.png"
const TOOL_FROM_FILENAME = {
  glitch: 'glitch', dithering: 'dithering', halftone: 'halftone', triangulation: 'triangulation',
  'crt-bend': 'crt-bend', flyer: 'flyer', 'pixel-sort': 'pixel-sort', 'ascii-canvas': 'ascii-canvas',
  constellation: 'constellation', pattern: 'pattern',
};
// Names you can type in the "Herramientas" column (comma separated)
const TOOL_FROM_NAME = {
  'glitch': 'glitch', 'glitch fx': 'glitch', 'dithering': 'dithering', 'halftone': 'halftone',
  'triangulation': 'triangulation', 'triangulación': 'triangulation', 'crt': 'crt-bend', 'crt bend': 'crt-bend',
  'flyer': 'flyer', 'flyer forge': 'flyer', 'pixel sort': 'pixel-sort', 'pixel sorter': 'pixel-sort',
  'ascii': 'ascii-canvas', 'ascii canvas': 'ascii-canvas', 'constellation': 'constellation',
  'pattern': 'pattern', 'pattern generator': 'pattern', 'generador de patrones': 'pattern',
};

/* ── Setup ─────────────────────────────────────────────── */

function setup() {
  const ss = SpreadsheetApp.getActive();
  const sh = sheet_();
  const head = headerMap_(sh);
  // Extra columns for moderation
  [CONFIG.headers.publish, CONFIG.headers.tools, CONFIG.headers.link, CONFIG.headers.status].forEach(h => {
    if (!head[h]) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(h).setFontWeight('bold');
      head[h] = col;
    }
  });
  const rows = Math.max(1, sh.getMaxRows() - 1);
  sh.getRange(2, head[CONFIG.headers.publish], rows, 1).insertCheckboxes();

  // Triggers (remove old copies first)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['onPublishEdit', 'onNewSubmission'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onPublishEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onNewSubmission').forSpreadsheet(ss).onFormSubmit().create();

  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')) {
    throw new Error('Falta GITHUB_TOKEN en Configuración del proyecto → Propiedades del script.');
  }
  // Touch Drive once so the permission prompt includes it
  DriveApp.getRootFolder();
  gh_('GET', 'gallery/gallery.json');   // fails early if the token is wrong
  SpreadsheetApp.getActive().toast('Listo: tildá "Publicar" en una fila para publicarla.', 'PUDRUS', 8);
}

/* ── Triggers ──────────────────────────────────────────── */

function onNewSubmission(e) {
  const sh = sheet_();
  const head = headerMap_(sh);
  const row = e && e.range ? e.range.getRow() : sh.getLastRow();
  if (head[CONFIG.headers.publish]) sh.getRange(row, head[CONFIG.headers.publish]).insertCheckboxes();
  if (head[CONFIG.headers.status]) sh.getRange(row, head[CONFIG.headers.status]).setValue('Pendiente de revisión');
}

function onPublishEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== CONFIG.sheetName) return;
  const head = headerMap_(sh);
  const col = head[CONFIG.headers.publish];
  if (!col || e.range.getColumn() > col || e.range.getLastColumn() < col) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    for (let row = Math.max(2, e.range.getRow()); row <= e.range.getLastRow(); row++) {
      const on = sh.getRange(row, col).getValue() === true;
      setStatus_(sh, head, row, on ? 'Publicando…' : 'Quitando…');
      try {
        const msg = on ? publishRow_(sh, head, row) : unpublishRow_(sh, head, row);
        setStatus_(sh, head, row, msg);
      } catch (err) {
        setStatus_(sh, head, row, 'Error: ' + err.message);
      }
    }
  } finally {
    lock.release();
  }
}

/* ── Publish / unpublish ───────────────────────────────── */

function publishRow_(sh, head, row) {
  const get = h => (head[h] ? String(sh.getRange(row, head[h]).getValue() || '').trim() : '');
  const fileId = driveId_(get(CONFIG.headers.image));
  if (!fileId) throw new Error('no encuentro el link de la imagen en esta fila');
  const file = DriveApp.getFileById(fileId);
  const key = keyFor_(fileId);

  const author = get(CONFIG.headers.name).slice(0, 60) || 'Anónimo';
  const linkRaw = get(CONFIG.headers.link);
  const link = /^https?:\/\//i.test(linkRaw) ? linkRaw : (/^@?[\w.]{2,30}$/.test(linkRaw) ? 'https://instagram.com/' + linkRaw.replace(/^@/, '') : '');
  const tools = toolsFor_(get(CONFIG.headers.tools), file.getName());

  const full = thumbnail_(fileId, CONFIG.sizes.full);
  const small = thumbnail_(fileId, CONFIG.sizes.thumb);
  const ext = b => (/png/.test(b.getContentType()) ? 'png' : /webp/.test(b.getContentType()) ? 'webp' : 'jpg');
  const fullPath = 'img/' + key + '.' + ext(full);
  const thumbPath = 'img/' + key + '-t.' + ext(small);

  putFile_('gallery/' + fullPath, full.getBytes(), 'Galería: imagen de ' + author);
  putFile_('gallery/' + thumbPath, small.getBytes(), 'Galería: miniatura de ' + author);

  const date = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  let previous = null;
  updateJson_(data => {
    previous = (data.items || []).find(i => i.id === key) || null;
    data.items = (data.items || []).filter(i => i.id !== key);
    const item = { id: key, file: fullPath, thumb: thumbPath, author: author, date: date };
    if (link) item.link = link;
    if (tools.length) item.tools = tools;
    data.items.push(item);
    return data;
  }, 'Galería: publica la imagen de ' + author);
  // republished with a different format: remove the old files
  if (previous) {
    [previous.file, previous.thumb].filter(p => p && p !== fullPath && p !== thumbPath)
      .forEach(p => deleteFile_('gallery/' + p, 'Galería: borra ' + p));
  }
  return 'Publicada ✓ ' + date + ' (aparece en 1–2 min)';
}

function unpublishRow_(sh, head, row) {
  const raw = head[CONFIG.headers.image] ? String(sh.getRange(row, head[CONFIG.headers.image]).getValue() || '') : '';
  const fileId = driveId_(raw);
  if (!fileId) return 'Sin publicar';
  const key = keyFor_(fileId);
  let removed = null;
  updateJson_(data => {
    removed = (data.items || []).find(i => i.id === key) || null;
    data.items = (data.items || []).filter(i => i.id !== key);
    return data;
  }, 'Galería: quita una imagen');
  if (removed) {
    [removed.file, removed.thumb].filter(Boolean).forEach(p => deleteFile_('gallery/' + p, 'Galería: borra ' + p));
    return 'Quitada de la galería';
  }
  return 'Sin publicar';
}

/* ── Helpers ───────────────────────────────────────────── */

function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheetName);
  if (!sh) throw new Error('No encuentro la hoja "' + CONFIG.sheetName + '"');
  return sh;
}

function headerMap_(sh) {
  const values = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const map = {};
  values.forEach((v, i) => { if (v) map[String(v).trim()] = i + 1; });
  return map;
}

function setStatus_(sh, head, row, text) {
  if (head[CONFIG.headers.status]) sh.getRange(row, head[CONFIG.headers.status]).setValue(text);
  SpreadsheetApp.flush();
}

function driveId_(text) {
  const m = String(text).match(/[?&]id=([\w-]{20,})/) || String(text).match(/\/d\/([\w-]{20,})/);
  return m ? m[1] : '';
}

// Public, non-reversible name for the image (the Drive id itself is never published)
function keyFor_(fileId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, fileId + ':pudrus');
  return digest.slice(0, 6).map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function toolsFor_(typed, fileName) {
  const out = [];
  String(typed).split(/[,;·]/).map(s => s.trim().toLowerCase()).filter(Boolean).forEach(name => {
    const id = TOOL_FROM_NAME[name] || TOOL_FROM_FILENAME[name];
    if (id && out.indexOf(id) < 0) out.push(id);
  });
  if (!out.length) {
    const m = String(fileName).toLowerCase().match(/pudrus_([a-z-]+)_\d+/);
    if (m && TOOL_FROM_FILENAME[m[1]]) out.push(TOOL_FROM_FILENAME[m[1]]);
  }
  return out;
}

// Resized copy made by Google Drive itself (no image library needed)
function thumbnail_(fileId, size) {
  const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const meta = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=thumbnailLink', { headers: auth, muteHttpExceptions: true });
  if (meta.getResponseCode() !== 200) throw new Error('Drive no devolvió la miniatura (' + meta.getResponseCode() + ')');
  const link = JSON.parse(meta.getContentText()).thumbnailLink;
  if (!link) throw new Error('Drive todavía no generó la vista previa; probá de nuevo en un minuto');
  const base = link.replace(/=s\d+(-[a-z0-9-]+)?$/i, '');
  // "-rj" asks Google for a JPEG (a 1600px PNG can weigh several MB); fall back to whatever Drive returns
  const urls = [base + '=s' + size + '-rj', base + '=s' + size];
  for (const url of urls) {
    for (const opts of [{ headers: auth, muteHttpExceptions: true }, { muteHttpExceptions: true }]) {   // some hosts reject the auth header
      const res = UrlFetchApp.fetch(url, opts);
      if (res.getResponseCode() === 200) return res.getBlob();
    }
  }
  throw new Error('no pude descargar la imagen redimensionada');
}

function gh_(method, path, body) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('falta GITHUB_TOKEN en las propiedades del script');
  const url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/contents/' + encodeURI(path) +
    (method === 'GET' ? '?ref=' + CONFIG.branch : '');
  const opts = {
    method: method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true,
  };
  if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  const res = UrlFetchApp.fetch(url, opts);
  const code = res.getResponseCode();
  if (code === 404 && method === 'GET') return null;
  if (code >= 300) throw new Error('GitHub ' + code + ': ' + res.getContentText().slice(0, 160));
  return code === 204 ? {} : JSON.parse(res.getContentText());
}

function putFile_(path, bytes, message) {
  const existing = gh_('GET', path);
  const body = { message: message, content: Utilities.base64Encode(bytes), branch: CONFIG.branch };
  if (existing && existing.sha) body.sha = existing.sha;
  gh_('PUT', path, body);
}

function deleteFile_(path, message) {
  const existing = gh_('GET', path);
  if (existing && existing.sha) gh_('DELETE', path, { message: message, sha: existing.sha, branch: CONFIG.branch });
}

function updateJson_(change, message) {
  const path = 'gallery/gallery.json';
  const existing = gh_('GET', path);
  if (!existing) throw new Error('no encuentro gallery/gallery.json en GitHub');
  const text = Utilities.newBlob(Utilities.base64Decode(existing.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  const data = change(JSON.parse(text));
  const out = JSON.stringify(data, null, 2) + '\n';
  gh_('PUT', path, {
    message: message,
    content: Utilities.base64Encode(out, Utilities.Charset.UTF_8),
    sha: existing.sha,
    branch: CONFIG.branch,
  });
}
