/* Gig Saathi — vanilla frontend. No build step. */
(() => {
  const LS_LANG = 'gs_lang';
  const LS_THEME = 'gs_theme';
  const LS_ENTRIES = 'gs_entries';
  const SUPPORTED = ['en', 'hi', 'pa'];
  let lang = localStorage.getItem(LS_LANG) || 'en';
  if (!SUPPORTED.includes(lang)) lang = 'en';
  let i18n = {};
  const entries = loadEntries();
  let pendingImage = null; // { mimeType, imageBase64 }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function t(path, vars = {}) {
    const parts = path.split('.');
    let v = i18n;
    for (const p of parts) v = v && v[p];
    if (typeof v !== 'string') return path;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : `{${k}}`));
  }

  /** Local YYYY-MM-DD (not UTC), so late-night IST entries get today's date. */
  /** Local-calendar YYYY-MM-DD (never toISOString, which shifts to UTC and breaks dates in IST). */
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function todayLocal() {
    return ymd(new Date());
  }
  const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  /** One currency format everywhere: ₹2,430 (Indian grouping). */
  const inr = (n) => `₹${inrFmt.format(Math.round(Number(n) || 0))}`;

  /** Load entries and drop anything the API would reject (e.g. a ₹0 / 0h entry from an older build). */
  function loadEntries() {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(LS_ENTRIES) || '[]');
    } catch {
      raw = [];
    }
    const clean = window.GigEntries.sanitizeEntries(raw, todayLocal());
    if (!Array.isArray(raw) || clean.length !== raw.length) localStorage.setItem(LS_ENTRIES, JSON.stringify(clean));
    return clean;
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
    // Every static label in index.html carries data-i18n / data-i18n-placeholder / data-i18n-aria.
    $$('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    $$('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    $$('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    $('#app-name').textContent = t('app.name');
    $('#app-tagline').textContent = t('app.tagline');
    $('#lang-select').value = lang;
    const navMap = {
      earnings: 'nav.earnings',
      safety: 'nav.safety',
      schemes: 'nav.schemes',
      document: 'nav.document',
      grievance: 'nav.grievance',
    };
    $$('.tab').forEach((btn) => {
      btn.textContent = t(navMap[btn.dataset.tab]);
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

  let schemesRequested = false;
  function setTab(name) {
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.panel').forEach((p) => {
      p.hidden = p.dataset.panel !== name;
    });
    // Lazy-load the curated schemes list the first time its tab opens (keeps first load small).
    if (name === 'schemes' && !schemesRequested) {
      schemesRequested = true;
      loadSchemes();
    }
  }

  function showLoading(msg) {
    const el = $('#loading');
    $('#loading-text').textContent = msg || t('common.loading');
    el.hidden = false;
  }
  function hideLoading() {
    $('#loading').hidden = true;
  }

  // Server error codes -> i18n keys (+ placeholder values). Unknown codes fall back to server_error.
  const ERROR_ALIASES = {
    image_too_large: 'payload_too_large',
    unsupported_image: 'unsupported_media_type',
    invalid_input: 'invalidInput',
    invalid_json: 'invalidInput',
    invalid_lang: 'invalidLang',
    wrong_language: 'model_bad_output',
  };
  function showError(boxId, code, retryFn, info = {}) {
    const box = $(boxId);
    const mapped = ERROR_ALIASES[code] || code;
    const key =
      mapped && i18n.error && i18n.error[mapped] ? `error.${mapped}` : code === 'network' ? 'error.network' : 'error.server_error';
    let msg = t(info.status === 400 && key === 'error.server_error' ? 'error.invalidInput' : key, {
      maxMb: 4,
      seconds: info.retryAfter || 60,
    });
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
      btn.addEventListener('click', () => {
        box.hidden = true;
        retryFn();
      });
      box.appendChild(btn);
    }
    box.hidden = false;
  }
  /**
   * Mark invalid fields: aria-invalid, an inline ⚠ message linked by aria-describedby, and a form-level alert.
   * @param {HTMLFormElement} form
   * @param {Record<string,string>} errors field name -> i18n key
   * @returns {boolean} true when there were errors
   */
  function setFieldErrors(form, errors) {
    clearFieldErrors(form);
    const names = Object.keys(errors);
    if (!names.length) return false;
    names.forEach((name) => {
      let el = form.elements[name];
      if (el && !el.tagName && el.length) el = el[0];
      if (!el) return;
      const id = `${form.id}-${name}-err`;
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('aria-describedby', id);
      const msg = document.createElement('span');
      msg.className = 'field-error';
      msg.id = id;
      msg.textContent = `⚠ ${t(errors[name], { max: 100000 })}`;
      el.insertAdjacentElement('afterend', msg);
    });
    const box = $(`#${form.id}-error`);
    if (box) {
      box.textContent = t(form.id === 'earnings-form' ? 'earnings.form.fixErrors' : 'error.invalidInput');
      box.hidden = false;
    }
    const first = form.querySelector('[aria-invalid="true"]');
    if (first) first.focus();
    return true;
  }
  function clearFieldErrors(form) {
    $$('.field-error', form).forEach((n) => n.remove());
    $$('[aria-invalid]', form).forEach((n) => {
      n.removeAttribute('aria-invalid');
      n.removeAttribute('aria-describedby');
    });
    const box = $(`#${form.id}-error`);
    if (box) box.hidden = true;
  }

  function clearError(boxId) {
    const b = $(boxId);
    if (b) {
      b.hidden = true;
      b.innerHTML = '';
    }
  }

  /**
   * Wrap an async action so a second tap is ignored while one request is in flight
   * (no duplicate Gemini calls); the button is disabled and marked aria-busy meanwhile.
   */
  function singleFlight(btnSel, fn) {
    let busy = false;
    return async () => {
      if (busy) return;
      busy = true;
      const btn = $(btnSel);
      const wasDisabled = btn ? btn.disabled : false;
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }
      try {
        await fn();
      } finally {
        busy = false;
        if (btn) {
          btn.disabled = wasDisabled;
          btn.removeAttribute('aria-busy');
        }
      }
    };
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json;
    try {
      json = await res.json();
    } catch {
      const e = new Error('network');
      e.code = 'network';
      throw e;
    }
    if (!json.ok) {
      const e = new Error(json.error?.code || 'server_error');
      e.code = json.error?.code || 'server_error';
      e.status = res.status;
      e.fields = Array.isArray(json.error?.fields) ? json.error.fields : [];
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        const m = /t=(\d+)/.exec(res.headers.get('ratelimit') || '');
        e.retryAfter = ra > 0 ? ra : m ? Number(m[1]) : 60;
      }
      throw e;
    }
    return json.data;
  }

  function mondayOf(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (x.getDay() + 6) % 7; // Mon=0
    x.setDate(x.getDate() - day);
    return ymd(x);
  }

  function netOf(e) {
    return (Number(e.gross) || 0) + (Number(e.tips) || 0) - (Number(e.expenses) || 0);
  }

  function weekEntries() {
    const start = mondayOf();
    const endDate = new Date(start + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 7);
    const end = ymd(endDate);
    return entries.filter((e) => e.date >= start && e.date < end);
  }

  function renderEarnings() {
    const list = $('#earnings-list');
    list.innerHTML = '';
    const week = weekEntries().sort((a, b) => b.date.localeCompare(a.date));
    let totalNet = 0,
      totalHours = 0;
    week.forEach((e) => {
      totalNet += netOf(e);
      totalHours += Number(e.hours) || 0;
    });
    $('#earnings-totals').innerHTML = week.length
      ? `<p><strong>${t('earnings.weekTotal', { amount: inrFmt.format(Math.round(totalNet)), hours: totalHours.toFixed(1) })}</strong> · ${t('earnings.entriesCount', { count: week.length })}</p><p class="hint">${t('earnings.stats.computedNote')}</p>`
      : `<p>${t('earnings.empty.title')}</p><p class="hint">${t('earnings.empty.body')}</p>`;
    week.forEach((e) => {
      const li = document.createElement('li');
      const net = netOf(e);
      const label = document.createElement('span');
      label.textContent = `${e.date} · ${t('earnings.entryLine', { platform: t(`enum.platform.${e.platform}`), shift: t(`enum.shift.${e.shift}`), net: inrFmt.format(Math.round(net)), hours: e.hours })}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn secondary tap';
      del.textContent = t('common.delete');
      del.setAttribute('aria-label', t('earnings.deleteLabel', { date: e.date, net: inrFmt.format(Math.round(net)) }));
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
    entries
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 31)
      .forEach((e, i) => {
        const id = `ev-${i}-${e.date}`;
        const wrap = document.createElement('label');
        wrap.className = 'evidence-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = String(entries.indexOf(e));
        cb.id = id;
        const span = document.createElement('span');
        span.textContent = `${e.date} ${t(`enum.platform.${e.platform}`)} ${inr(netOf(e))}`;
        wrap.append(cb, span);
        box.appendChild(wrap);
      });
  }

  // ---- Earnings form ----
  $('#earnings-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const raw = Object.fromEntries(['date', 'platform', 'shift', 'gross', 'tips', 'expenses', 'hours', 'trips'].map((k) => [k, fd.get(k)]));
    const v = window.GigEntries.validateEntry(raw, todayLocal());
    if (v.ok && window.GigEntries.hoursOn(entries, v.entry.date) + v.entry.hours > 24) v.errors.hours = 'earnings.form.dayOver24';
    if (setFieldErrors(form, v.errors)) return; // nothing is stored
    entries.push(v.entry);
    saveEntries();
    form.reset();
    form.date.value = todayLocal();
    renderEarnings();
    renderEvidence();
  });

  async function runSummaryOnce() {
    clearError('#summary-error');
    const weekStart = mondayOf();
    // include previous week too (API allows up to 200)
    const prev = new Date(weekStart + 'T00:00:00');
    prev.setDate(prev.getDate() - 7);
    const prevStart = ymd(prev);
    const payloadEntries = window.GigEntries.sanitizeEntries(entries, todayLocal()).filter((e) => e.date >= prevStart);
    showLoading(t('earnings.summary.loading'));
    try {
      const data = await api('/api/summary', { lang, weekStart, entries: payloadEntries });
      const box = $('#summary-result');
      box.hidden = false;
      let html = `<h3>${t('earnings.summary.title')}</h3>`;
      html += `<p class="hint">${t('common.aiNote')}</p>`;
      if (data.stats?.totals) {
        const tot = data.stats.totals;
        html += `<p>${t('earnings.summary.totalsLine', { net: inrFmt.format(Math.round(tot.net || 0)), hours: tot.hours ?? '—', trips: tot.trips ?? '—' })}</p>`;
      }
      if (!data.ai) {
        html += `<p>${t('earnings.summary.lowData')}</p>`;
      } else {
        if (data.ai.headline) html += `<p><strong>${escapeHtml(data.ai.headline)}</strong></p>`;
        if (data.ai.insights?.length) {
          html += `<h4>${t('earnings.summary.insightsTitle')}</h4><ul>`;
          data.ai.insights.forEach((i) => {
            html += `<li>${escapeHtml(i.text)}</li>`;
          });
          html += '</ul>';
        }
        if (data.ai.suggestions?.length) {
          html += '<ul>';
          data.ai.suggestions.forEach((s) => {
            html += `<li>${escapeHtml(s)}</li>`;
          });
          html += '</ul>';
        }
      }
      box.innerHTML = html;
    } catch (err) {
      showError('#summary-error', err.code || 'network', runSummary, err);
    } finally {
      hideLoading();
    }
  }
  const runSummary = singleFlight('#summary-btn', runSummaryOnce);
  $('#summary-btn').addEventListener('click', runSummary);

  // ---- Safety ----
  async function runSafetyOnce() {
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
      html += `<p class="risk-${g.riskLevel || 'low'}"><strong>${escapeHtml(g.riskLevel ? t(`safety.risk.${g.riskLevel}`) : '')}</strong>${g.riskReason ? ' — ' + escapeHtml(g.riskReason) : ''}</p>`;
      if (g.tips?.length) {
        html += '<ul>';
        g.tips.forEach((tip) => {
          html += `<li><strong>${escapeHtml(tip.title)}</strong>: ${escapeHtml(tip.detail)}</li>`;
        });
        html += '</ul>';
      }
      if (g.checklist?.length) {
        html += `<h4>${t('safety.checklistTitle')}</h4><ul>`;
        g.checklist.forEach((c) => {
          html += `<li>${escapeHtml(c)}</li>`;
        });
        html += '</ul>';
      }
      box.innerHTML = html;
    } catch (err) {
      showError('#safety-error', err.code || 'network', runSafety, err);
    } finally {
      hideLoading();
    }
  }
  const runSafety = singleFlight('#safety-submit', runSafetyOnce);
  $('#safety-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runSafety();
  });

  // ---- Schemes ----
  async function loadSchemes() {
    const list = $('#schemes-list');
    try {
      const res = await fetch('/data/schemes.json');
      const data = await res.json();
      const schemes = Array.isArray(data) ? data : data.schemes || [];
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

  async function runSchemesAskOnce() {
    clearError('#schemes-error');
    const question = $('#schemes-question').value.trim();
    if (setFieldErrors($('#schemes-form'), question.length < 3 ? { question: 'schemes.ask.questionMin' } : {})) return;
    showLoading(t('schemes.ask.loading'));
    try {
      const data = await api('/api/schemes/ask', { lang, question, profile: {} });
      const box = $('#schemes-result');
      box.hidden = false;
      let html = `<h3>${t('schemes.ask.title')}</h3><p class="hint">${t('schemes.ask.groundedNote')}</p><p class="hint">${t('common.aiNote')}</p>`;
      if (!data.found) html += `<p>${t('schemes.ask.notFound')}</p>`;
      else {
        html += `<p>${escapeHtml(data.answer || '')}</p>`;
        if (data.cited_scheme_ids?.length)
          html += `<p class="hint">${t('schemes.ask.citedFrom', { schemes: data.cited_scheme_ids.join(', ') })}</p>`;
      }
      box.innerHTML = html;
    } catch (err) {
      showError('#schemes-error', err.code || 'network', runSchemesAsk, err);
    } finally {
      hideLoading();
    }
  }
  const runSchemesAsk = singleFlight('#schemes-submit', runSchemesAskOnce);
  $('#schemes-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runSchemesAsk();
  });

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
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('blob'));
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result;
              const b64 = dataUrl.split(',')[1];
              resolve({ mimeType: 'image/jpeg', imageBase64: b64, preview: dataUrl });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.85,
        );
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  $('#document-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    // A new pick always clears the previous answer and error, so a rejected upload never shows a stale result.
    clearError('#document-error');
    const old = $('#document-result');
    old.hidden = true;
    old.innerHTML = '';
    if (!file) return;
    try {
      pendingImage = await resizeImage(file);
      const prev = $('#document-preview');
      prev.src = pendingImage.preview;
      prev.hidden = false;
      $('#document-submit').disabled = false;
    } catch {
      pendingImage = null;
      $('#document-preview').hidden = true;
      $('#document-submit').disabled = true;
      showError('#document-error', 'unsupported_media_type');
    }
  });

  async function runDocumentOnce() {
    clearError('#document-error');
    if (!pendingImage) {
      const box = $('#document-error');
      box.textContent = t('documents.chooseFirst');
      box.hidden = false;
      return;
    }
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
          data.actions.forEach((a) => {
            html += `<li>${escapeHtml(a)}</li>`;
          });
          html += '</ul>';
        }
        if (data.unclear?.length) {
          html += '<ul>';
          data.unclear.forEach((u) => {
            html += `<li>${escapeHtml(u)}</li>`;
          });
          html += '</ul>';
        }
        if (data.grievance_hint?.suggested) {
          html += `<p><button type="button" class="btn secondary tap" id="to-grievance-chip">→ ${t('grievance.title')}</button></p>`;
        }
      }
      box.innerHTML = html;
      const chip = $('#to-grievance-chip');
      if (chip)
        chip.addEventListener('click', () => {
          setTab('grievance');
          if (data.grievance_hint?.details) {
            const f = $('#grievance-form');
            if (data.grievance_hint.issue) {
              /* leave issue as-is */
            }
            f.details.value = data.grievance_hint.details;
            if (data.grievance_hint.platform) f.against.value = data.grievance_hint.platform;
          }
        });
    } catch (err) {
      const code = err.code === 'unsupported_image' ? 'unsupported_media_type' : err.code || 'network';
      $('#document-result').hidden = true;
      $('#document-result').innerHTML = '';
      showError('#document-error', code, runDocument, err);
    } finally {
      hideLoading();
    }
  }
  const runDocument = singleFlight('#document-submit', runDocumentOnce);
  $('#document-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runDocument();
  });

  // ---- Grievance ----
  $('#grievance-form').issue.addEventListener('change', (e) => {
    const wrap = $('#issue-other-wrap');
    wrap.hidden = e.target.value !== 'other';
  });

  async function runGrievanceOnce() {
    clearError('#grievance-error');
    const form = $('#grievance-form');
    const fd = new FormData(form);
    const evidence = $$('#grievance-evidence input:checked')
      .map((cb) => entries[Number(cb.value)])
      .filter(Boolean);
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
    const errs = {};
    if (!/^[\p{L}\p{M}\p{N} .&-]{2,60}$/u.test(body.against)) errs.against = 'grievance.form.againstInvalid';
    if (body.issue === 'other' && (body.issueOther || '').length < 3) errs.issueOther = 'grievance.form.issueOtherRequired';
    if (!body.incidentDate || body.incidentDate > todayLocal()) errs.incidentDate = 'grievance.form.dateRequired';
    if (body.endDate && body.incidentDate && body.endDate < body.incidentDate) errs.endDate = 'grievance.form.endBeforeStart';
    if (body.details.length < 20) errs.details = 'grievance.form.detailsMin';
    if (body.workerId && !/^[A-Za-z0-9-]*$/.test(body.workerId)) errs.workerId = 'grievance.form.idInvalid';
    if (setFieldErrors(form, errs)) return;
    showLoading(t('grievance.loading'));
    try {
      const data = await api('/api/grievance', body);
      const box = $('#grievance-result');
      box.hidden = false;
      const text = `${t('grievance.subjectLabel')}: ${data.subject}\n\n${data.body}`;
      let html = `<h3>${t('grievance.draftTitle')}</h3><p class="hint">${t('common.aiNote')}</p><p class="hint">${t('grievance.reviewNote')}</p>`;
      html += `<pre class="draft" id="draft-text">${escapeHtml(text)}</pre>`;
      html += `<button type="button" class="btn primary tap" id="copy-draft">${t('grievance.copy')}</button>`;
      html += `<button type="button" class="btn secondary tap" id="dl-draft">${t('grievance.download')}</button>`;
      if (data.channels?.length) {
        html += `<h4>${t('grievance.channels.title')}</h4><ul>`;
        data.channels.forEach((c) => {
          html += `<li>${escapeHtml(c.label)}: ${escapeHtml(c.value)}</li>`;
        });
        html += '</ul>';
      }
      box.innerHTML = html;
      $('#copy-draft').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          $('#copy-draft').textContent = t('grievance.copied');
        } catch {
          /* ignore */
        }
      });
      $('#dl-draft').addEventListener('click', () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = t('grievance.downloadFileName', { date: todayLocal() });
        a.click();
      });
    } catch (err) {
      if (err.status === 400 && err.fields?.length) {
        // Map server field errors (incl. sanitised/rejected text) onto the matching inputs.
        const map = {
          against: 'grievance.form.againstInvalid',
          details: 'grievance.form.detailsMin',
          issueOther: 'grievance.form.issueOtherRequired',
          incidentDate: 'grievance.form.dateRequired',
          endDate: 'grievance.form.endBeforeStart',
          workerId: 'grievance.form.idInvalid',
          workerName: 'grievance.form.textInvalid',
          desiredOutcome: 'grievance.form.textInvalid',
        };
        const fe = {};
        err.fields.forEach((f) => {
          const name = String(f.path).split('.')[0];
          if (form.elements[name]) fe[name] = map[name] || 'error.fieldInvalid';
        });
        if (setFieldErrors(form, fe)) return;
      }
      showError('#grievance-error', err.code || 'network', runGrievance, err);
    } finally {
      hideLoading();
    }
  }
  const runGrievance = singleFlight('#grievance-submit', runGrievanceOnce);
  $('#grievance-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runGrievance();
  });

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---- Light/dark theme (saved choice, else the OS preference). Applied before boot so there is no flash of the wrong theme after load. ----
  /** @param {'light'|'dark'} theme */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-checked', String(theme === 'light'));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b1f33');
  }
  const savedTheme = localStorage.getItem(LS_THEME);
  applyTheme(
    savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark',
  );
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(LS_THEME, next);
    applyTheme(next);
  });

  // ---- Lang + tabs + boot ----
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  $('#lang-select').addEventListener('change', async (e) => {
    lang = e.target.value;
    localStorage.setItem(LS_LANG, lang);
    await loadI18n(lang);
    // Drop messages rendered in the previous language, then re-render language-dependent lists.
    $$('form').forEach(clearFieldErrors);
    ['#summary-error', '#safety-error', '#schemes-error', '#document-error', '#grievance-error'].forEach(clearError);
    applyI18n();
    if (schemesRequested) loadSchemes();
  });

  (async function boot() {
    try {
      await loadI18n(lang);
    } catch {
      i18n = {
        app: { name: 'Gig Saathi', tagline: '' },
        common: { loading: 'Please wait…', retry: 'Try again', save: 'Save', delete: 'Delete', aiNote: 'Written by Gemini AI.' },
        error: { server_error: 'Something went wrong.', network: 'Could not connect.' },
      };
    }
    applyI18n();
    const today = todayLocal();
    const df = $('#earnings-form');
    if (df.date) df.date.value = today;
    const gf = $('#grievance-form');
    if (gf.incidentDate) gf.incidentDate.value = today;
    setTab('earnings');
  })();
})();
