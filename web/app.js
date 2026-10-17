/* Gig Saathi — vanilla frontend. No build step. */
(() => {
  const LS_LANG = 'gs_lang';
  const LS_ENTRIES = 'gs_entries';
  const SUPPORTED = ['en', 'hi', 'pa'];
  let lang = localStorage.getItem(LS_LANG) || 'en';
  if (!SUPPORTED.includes(lang)) lang = 'en';
  let i18n = {};
  let entries = loadEntries();
  let pendingImage = null; // { mimeType, imageBase64 }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function t(path, vars = {}) {
    const parts = path.split('.');
    let v = i18n;
    for (const p of parts) v = v && v[p];
    if (typeof v !== 'string') return path;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  }

  function loadEntries() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_ENTRIES) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function saveEntries() {
    localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
  }

  async function loadI18n(l) {
    const res = await fetch(`/i18n/${l}.json`);
    if (!res.ok) throw new Error('i18n');
    i18n = await res.json();
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    $('#app-name').textContent = t('app.name');
    $('#app-tagline').textContent = t('app.tagline');
    $('#lang-select').value = lang;
    const navMap = { earnings: 'nav.earnings', safety: 'nav.safety', schemes: 'nav.schemes', document: 'documents.title', grievance: 'grievance.title' };
    $$('.tab').forEach((btn) => {
      const key = navMap[btn.dataset.tab];
      if (key) btn.textContent = t(key).split(' ')[0] === 'Understand' ? 'Document' : (btn.dataset.tab === 'document' ? t('documents.title').slice(0, 12) : t(key));
      if (btn.dataset.tab === 'document') btn.textContent = 'Document';
      if (btn.dataset.tab === 'grievance') btn.textContent = t('grievance.title').slice(0, 14);
    });
    $('#earnings-title').textContent = t('earnings.title');
    $('#earnings-storage').textContent = t('earnings.storageNote');
    $('#earnings-add-label').textContent = t('earnings.addButton');
    $('#earnings-save').textContent = t('common.save');
    $('#summary-btn').textContent = t('earnings.summary.button');
    $('#safety-title').textContent = t('safety.title');
    $('#safety-shift-label').textContent = t('safety.shiftLabel');
    $('#safety-vehicle-label').textContent = t('safety.vehicleLabel');
    $('#safety-situations-label').textContent = t('safety.situationsLabel');
    $('#safety-submit').textContent = t('safety.submit');
    $('#emergency-title').textContent = t('safety.emergencyTitle');
    $('#schemes-title').textContent = t('schemes.title');
    $('#schemes-ask-title').textContent = t('schemes.ask.title');
    $('#schemes-submit').textContent = t('schemes.ask.submit');
    $('#schemes-question').placeholder = t('schemes.ask.placeholder');
    $('#document-title').textContent = t('documents.title');
    $('#document-intro').textContent = t('documents.intro');
    $('#document-privacy').textContent = t('documents.privacy');
    $('#document-upload-label').textContent = t('documents.upload');
    $('#document-submit').textContent = t('documents.explain');
    $('#document-preview').alt = t('documents.previewAlt');
    $('#grievance-title').textContent = t('grievance.title');
    $('#grievance-submit').textContent = t('grievance.submit');
    renderEarnings();
    renderEvidence();
  }

  function setTab(name) {
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }

  function showLoading(msg) {
    const el = $('#loading');
    $('#loading-text').textContent = msg || t('common.loading');
    el.hidden = false;
  }
  function hideLoading() { $('#loading').hidden = true; }

  function showError(boxId, code, retryFn) {
    const box = $(boxId);
    const key = code && i18n.error && i18n.error[code] ? `error.${code}` : (code === 'network' ? 'error.network' : 'error.server_error');
    let msg = t(key);
    if (msg === key) msg = t('error.server_error');
    box.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = msg;
    box.appendChild(p);
    if (retryFn) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn secondary tap';
      btn.textContent = t('common.retry');
      btn.addEventListener('click', () => { box.hidden = true; retryFn(); });
      box.appendChild(btn);
    }
    box.hidden = false;
  }
  function clearError(boxId) { const b = $(boxId); if (b) { b.hidden = true; b.innerHTML = ''; } }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json;
    try { json = await res.json(); } catch { const e = new Error('network'); e.code = 'network'; throw e; }
    if (!json.ok) {
      const e = new Error(json.error?.code || 'server_error');
      e.code = json.error?.code || 'server_error';
      e.status = res.status;
      throw e;
    }
    return json.data;
  }

  function mondayOf(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (x.getDay() + 6) % 7; // Mon=0
    x.setDate(x.getDate() - day);
    return x.toISOString().slice(0, 10);
  }

  function netOf(e) { return (Number(e.gross) || 0) + (Number(e.tips) || 0) - (Number(e.expenses) || 0); }

  function weekEntries() {
    const start = mondayOf();
    const endDate = new Date(start + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 7);
    const end = endDate.toISOString().slice(0, 10);
    return entries.filter((e) => e.date >= start && e.date < end);
  }

  function renderEarnings() {
    const list = $('#earnings-list');
    list.innerHTML = '';
    const week = weekEntries().sort((a, b) => b.date.localeCompare(a.date));
    let totalNet = 0, totalHours = 0;
    week.forEach((e) => { totalNet += netOf(e); totalHours += Number(e.hours) || 0; });
    $('#earnings-totals').innerHTML = week.length
      ? `<p><strong>₹${Math.round(totalNet)}</strong> · ${totalHours.toFixed(1)} h · ${week.length} entries</p><p class="hint">${t('earnings.stats.computedNote')}</p>`
      : `<p>${t('earnings.empty.title')}</p><p class="hint">${t('earnings.empty.body')}</p>`;
    week.forEach((e, idx) => {
      const li = document.createElement('li');
      const net = netOf(e);
      const label = document.createElement('span');
      label.textContent = `${e.date} · ${e.platform} · ${e.shift}: ₹${net} / ${e.hours}h`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn secondary tap';
      del.textContent = t('common.delete');
      del.setAttribute('aria-label', `Delete ${e.date}`);
      del.addEventListener('click', () => {
        if (!confirm(t('earnings.deleteConfirm'))) return;
        const i = entries.indexOf(e);
        if (i >= 0) entries.splice(i, 1);
        saveEntries();
        renderEarnings();
        renderEvidence();
      });
      li.append(label, del);
      list.appendChild(li);
    });
    $('#summary-btn').disabled = week.length === 0;
  }

  function renderEvidence() {
    const box = $('#grievance-evidence');
    box.innerHTML = '';
    if (!entries.length) {
      box.textContent = t('grievance.form.evidenceNone');
      return;
    }
    entries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31).forEach((e, i) => {
      const id = `ev-${i}-${e.date}`;
      const wrap = document.createElement('label');
      wrap.className = 'evidence-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(entries.indexOf(e));
      cb.id = id;
      const span = document.createElement('span');
      span.textContent = `${e.date} ${e.platform} ₹${netOf(e)}`;
      wrap.append(cb, span);
      box.appendChild(wrap);
    });
  }

  // ---- Earnings form ----
  $('#earnings-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const entry = {
      date: fd.get('date'),
      platform: fd.get('platform'),
      shift: fd.get('shift'),
      gross: Number(fd.get('gross')),
      tips: Number(fd.get('tips') || 0),
      expenses: Number(fd.get('expenses') || 0),
      hours: Number(fd.get('hours')),
      trips: Number(fd.get('trips') || 0),
    };
    entries.push(entry);
    saveEntries();
    ev.target.reset();
    const today = new Date().toISOString().slice(0, 10);
    ev.target.date.value = today;
    renderEarnings();
    renderEvidence();
  });

  async function runSummary() {
    clearError('#summary-error');
    const weekStart = mondayOf();
    // include previous week too (API allows up to 200)
    const prev = new Date(weekStart + 'T00:00:00');
    prev.setDate(prev.getDate() - 7);
    const prevStart = prev.toISOString().slice(0, 10);
    const payloadEntries = entries.filter((e) => e.date >= prevStart);
    showLoading(t('earnings.summary.loading'));
    try {
      const data = await api('/api/summary', { lang, weekStart, entries: payloadEntries });
      const box = $('#summary-result');
      box.hidden = false;
      let html = `<h3>${t('earnings.summary.title')}</h3>`;
      html += `<p class="hint">${t('common.aiNote')}</p>`;
      if (data.stats?.totals) {
        const tot = data.stats.totals;
        html += `<p>Net ₹${tot.net ?? '—'} · ${tot.hours ?? '—'} h · ${tot.trips ?? '—'} trips</p>`;
      }
      if (!data.ai) {
        html += `<p>${t('earnings.summary.lowData')}</p>`;
      } else {
        if (data.ai.headline) html += `<p><strong>${escapeHtml(data.ai.headline)}</strong></p>`;
        if (data.ai.insights?.length) {
          html += `<h4>${t('earnings.summary.insightsTitle')}</h4><ul>`;
          data.ai.insights.forEach((i) => { html += `<li>${escapeHtml(i.text)}</li>`; });
          html += '</ul>';
        }
        if (data.ai.suggestions?.length) {
          html += '<ul>';
          data.ai.suggestions.forEach((s) => { html += `<li>${escapeHtml(s)}</li>`; });
          html += '</ul>';
        }
      }
      box.innerHTML = html;
    } catch (err) {
      showError('#summary-error', err.code || 'network', runSummary);
    } finally { hideLoading(); }
  }
  $('#summary-btn').addEventListener('click', runSummary);

  // ---- Safety ----
  async function runSafety() {
    clearError('#safety-error');
    const form = $('#safety-form');
    const fd = new FormData(form);
    const situations = $$('input[name="situations"]:checked', form).map((el) => el.value);
    const body = {
      lang,
      vehicle: fd.get('vehicle'),
      shift: fd.get('shift'),
      situations,
    };
    showLoading(t('safety.loading'));
    try {
      const data = await api('/api/safety', body);
      const g = data.guidance || {};
      const box = $('#safety-result');
      box.hidden = false;
      let html = `<h3>${t('safety.resultTitle')}</h3><p class="hint">${t('common.aiNote')}</p>`;
      html += `<p class="risk-${g.riskLevel || 'low'}"><strong>${escapeHtml(g.riskLevel || '')}</strong>${g.riskReason ? ' — ' + escapeHtml(g.riskReason) : ''}</p>`;
      if (g.tips?.length) {
        html += '<ul>';
        g.tips.forEach((tip) => { html += `<li><strong>${escapeHtml(tip.title)}</strong>: ${escapeHtml(tip.detail)}</li>`; });
        html += '</ul>';
      }
      if (g.checklist?.length) {
        html += '<h4>Checklist</h4><ul>';
        g.checklist.forEach((c) => { html += `<li>${escapeHtml(c)}</li>`; });
        html += '</ul>';
      }
      box.innerHTML = html;
    } catch (err) {
      showError('#safety-error', err.code || 'network', runSafety);
    } finally { hideLoading(); }
  }
  $('#safety-form').addEventListener('submit', (e) => { e.preventDefault(); runSafety(); });

  // ---- Schemes ----
  async function loadSchemes() {
    const list = $('#schemes-list');
    try {
      const res = await fetch('/data/schemes.json');
      const data = await res.json();
      const schemes = Array.isArray(data) ? data : (data.schemes || []);
      const verified = data.last_verified || '';
      $('#schemes-intro').textContent = t('schemes.intro', { date: verified });
      list.innerHTML = '';
      if (!schemes.length) {
        list.innerHTML = `<li>${t('schemes.empty')}</li>`;
        return;
      }
      schemes.forEach((s) => {
        const li = document.createElement('li');
        const name = (s.name && (s.name[lang] || s.name.en)) || s.id;
        const src = (s.sources && s.sources[0]) || null;
        li.innerHTML = `<div><strong>${escapeHtml(name)}</strong><br/><span class="hint">${escapeHtml(s.ministry || '')}</span></div>`;
        if (src?.url) {
          const a = document.createElement('a');
          a.href = src.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = t('schemes.openSource', { scheme: name });
          li.appendChild(a);
        }
        list.appendChild(li);
      });
    } catch {
      list.innerHTML = `<li>${t('schemes.empty')}</li>`;
    }
  }

  async function runSchemesAsk() {
    clearError('#schemes-error');
    const question = $('#schemes-question').value.trim();
    if (question.length < 3) return;
    showLoading(t('schemes.ask.loading'));
    try {
      const data = await api('/api/schemes/ask', { lang, question, profile: {} });
      const box = $('#schemes-result');
      box.hidden = false;
      let html = `<h3>${t('schemes.ask.title')}</h3><p class="hint">${t('schemes.ask.groundedNote')}</p><p class="hint">${t('common.aiNote')}</p>`;
      if (!data.found) html += `<p>${t('schemes.ask.notFound')}</p>`;
      else {
        html += `<p>${escapeHtml(data.answer || '')}</p>`;
        if (data.cited_scheme_ids?.length) html += `<p class="hint">${t('schemes.ask.citedFrom', { schemes: data.cited_scheme_ids.join(', ') })}</p>`;
      }
      box.innerHTML = html;
    } catch (err) {
      showError('#schemes-error', err.code || 'network', runSchemesAsk);
    } finally { hideLoading(); }
  }
  $('#schemes-form').addEventListener('submit', (e) => { e.preventDefault(); runSchemesAsk(); });

  // ---- Document (resize client-side) ----
  function resizeImage(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, max / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('blob'));
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            const b64 = dataUrl.split(',')[1];
            resolve({ mimeType: 'image/jpeg', imageBase64: b64, preview: dataUrl });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  $('#document-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingImage = await resizeImage(file);
      const prev = $('#document-preview');
      prev.src = pendingImage.preview;
      prev.hidden = false;
      $('#document-submit').disabled = false;
    } catch {
      pendingImage = null;
      $('#document-submit').disabled = true;
      showError('#document-error', 'unsupported_media_type');
    }
  });

  async function runDocument() {
    clearError('#document-error');
    if (!pendingImage) return;
    showLoading(t('documents.loading'));
    try {
      const data = await api('/api/document', {
        lang,
        mimeType: pendingImage.mimeType,
        imageBase64: pendingImage.imageBase64,
      });
      const box = $('#document-result');
      box.hidden = false;
      let html = `<h3>${t('documents.resultTitle')}</h3><p class="hint">${t('common.aiNote')}</p>`;
      if (data.is_document === false) {
        html += `<p>${t('documents.notDocument')}</p>`;
      } else {
        html += `<p><strong>${t('documents.result.whatItIs')}</strong>: ${escapeHtml(data.doc_type || '')} — ${escapeHtml(data.issuer || '')}</p>`;
        html += `<p>${escapeHtml(data.summary || '')}</p>`;
        if (data.actions?.length) {
          html += `<h4>${t('documents.result.whatToDo')}</h4><ul>`;
          data.actions.forEach((a) => { html += `<li>${escapeHtml(a)}</li>`; });
          html += '</ul>';
        }
        if (data.unclear?.length) {
          html += '<ul>';
          data.unclear.forEach((u) => { html += `<li>${escapeHtml(u)}</li>`; });
          html += '</ul>';
        }
        if (data.grievance_hint?.suggested) {
          html += `<p><button type="button" class="btn secondary tap" id="to-grievance-chip">→ ${t('grievance.title')}</button></p>`;
        }
      }
      box.innerHTML = html;
      const chip = $('#to-grievance-chip');
      if (chip) chip.addEventListener('click', () => {
        setTab('grievance');
        if (data.grievance_hint?.details) {
          const f = $('#grievance-form');
          if (data.grievance_hint.issue) {/* leave issue as-is */}
          f.details.value = data.grievance_hint.details;
          if (data.grievance_hint.platform) f.against.value = data.grievance_hint.platform;
        }
      });
    } catch (err) {
      const code = err.code === 'unsupported_image' ? 'unsupported_media_type' : (err.code || 'network');
      showError('#document-error', code, runDocument);
    } finally { hideLoading(); }
  }
  $('#document-form').addEventListener('submit', (e) => { e.preventDefault(); runDocument(); });

  // ---- Grievance ----
  $('#grievance-form').issue.addEventListener('change', (e) => {
    const wrap = $('#issue-other-wrap');
    wrap.hidden = e.target.value !== 'other';
  });

  async function runGrievance() {
    clearError('#grievance-error');
    const form = $('#grievance-form');
    const fd = new FormData(form);
    const evidence = $$('#grievance-evidence input:checked').map((cb) => entries[Number(cb.value)]).filter(Boolean);
    const body = {
      lang,
      against: String(fd.get('against') || '').trim(),
      issue: fd.get('issue'),
      incidentDate: fd.get('incidentDate'),
      details: String(fd.get('details') || '').trim(),
      evidence,
    };
    if (fd.get('issue') === 'other') body.issueOther = String(fd.get('issueOther') || '').trim();
    if (fd.get('endDate')) body.endDate = fd.get('endDate');
    if (fd.get('amount')) body.amount = Number(fd.get('amount'));
    if (fd.get('desiredOutcome')) body.desiredOutcome = String(fd.get('desiredOutcome')).trim();
    if (fd.get('workerName')) body.workerName = String(fd.get('workerName')).trim();
    if (fd.get('workerId')) body.workerId = String(fd.get('workerId')).trim();
    showLoading(t('grievance.loading'));
    try {
      const data = await api('/api/grievance', body);
      const box = $('#grievance-result');
      box.hidden = false;
      const text = `Subject: ${data.subject}\n\n${data.body}`;
      let html = `<h3>${t('grievance.draftTitle')}</h3><p class="hint">${t('common.aiNote')}</p><p class="hint">${t('grievance.reviewNote')}</p>`;
      html += `<pre class="draft" id="draft-text">${escapeHtml(text)}</pre>`;
      html += `<button type="button" class="btn primary tap" id="copy-draft">${t('grievance.copy')}</button>`;
      html += `<button type="button" class="btn secondary tap" id="dl-draft">${t('grievance.download')}</button>`;
      if (data.channels?.length) {
        html += `<h4>${t('grievance.channels.title')}</h4><ul>`;
        data.channels.forEach((c) => { html += `<li>${escapeHtml(c.label)}: ${escapeHtml(c.value)}</li>`; });
        html += '</ul>';
      }
      box.innerHTML = html;
      $('#copy-draft').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(text); $('#copy-draft').textContent = t('grievance.copied'); } catch { /* ignore */ }
      });
      $('#dl-draft').addEventListener('click', () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = t('grievance.downloadFileName', { date: new Date().toISOString().slice(0, 10) });
        a.click();
      });
    } catch (err) {
      showError('#grievance-error', err.code || 'network', runGrievance);
    } finally { hideLoading(); }
  }
  $('#grievance-form').addEventListener('submit', (e) => { e.preventDefault(); runGrievance(); });

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Lang + tabs + boot ----
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  $('#lang-select').addEventListener('change', async (e) => {
    lang = e.target.value;
    localStorage.setItem(LS_LANG, lang);
    await loadI18n(lang);
    applyI18n();
  });

  (async function boot() {
    try {
      await loadI18n(lang);
    } catch {
      i18n = { app: { name: 'Gig Saathi', tagline: '' }, common: { loading: 'Please wait…', retry: 'Try again', save: 'Save', delete: 'Delete', aiNote: 'Written by Gemini AI.' }, error: { server_error: 'Something went wrong.', network: 'Could not connect.' } };
    }
    applyI18n();
    const today = new Date().toISOString().slice(0, 10);
    const df = $('#earnings-form');
    if (df.date) df.date.value = today;
    const gf = $('#grievance-form');
    if (gf.incidentDate) gf.incidentDate.value = today;
    await loadSchemes();
    setTab('earnings');
  })();
})();
