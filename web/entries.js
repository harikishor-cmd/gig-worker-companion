/* Earnings entry validation + localStorage sanitising. Plain script (no build step): sets globalThis.GigEntries.
   Mirrors the server's zod `entry` schema so the browser never stores or sends an entry the API would reject. */
(function (root) {
  const PLATFORMS = ['zomato', 'swiggy', 'uber', 'ola', 'rapido', 'blinkit', 'zepto', 'urban_company', 'porter', 'other'];
  const SHIFTS = ['day', 'evening', 'night'];
  const MAX_MONEY = 100000;

  /** @param {unknown} v */
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const money = (v) => Number.isFinite(v) && v >= 0 && v <= MAX_MONEY;

  /**
   * Validate one raw entry (form values or a stored object).
   * @param {Record<string, unknown>} raw
   * @param {string} today YYYY-MM-DD (local)
   * @returns {{ ok: boolean, errors: Record<string,string>, entry: object|null }} errors map field -> i18n key
   */
  function validateEntry(raw, today) {
    const r = raw || {};
    const errors = {};
    const date = String(r.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || date > today)
      errors.date = 'earnings.form.dateRequired';
    const platform = PLATFORMS.includes(r.platform) ? r.platform : null;
    if (!platform) errors.platform = 'error.fieldInvalid';
    const shift = SHIFTS.includes(r.shift) ? r.shift : null;
    if (!shift) errors.shift = 'error.fieldInvalid';
    const gross = num(r.gross);
    if (!money(gross) || gross <= 0) errors.gross = 'earnings.form.grossRequired';
    const tips = r.tips === '' || r.tips === undefined || r.tips === null ? 0 : Number(r.tips);
    if (!money(tips)) errors.tips = 'earnings.form.amountInvalid';
    const expenses = r.expenses === '' || r.expenses === undefined || r.expenses === null ? 0 : Number(r.expenses);
    if (!money(expenses)) errors.expenses = 'earnings.form.amountInvalid';
    const hours = num(r.hours);
    if (!(Number.isFinite(hours) && hours > 0 && hours <= 24)) errors.hours = 'earnings.form.hoursInvalid';
    const trips = r.trips === '' || r.trips === undefined || r.trips === null ? 0 : Number(r.trips);
    if (!(Number.isInteger(trips) && trips >= 0 && trips <= 200)) errors.trips = 'earnings.form.tripsInvalid';
    const ok = Object.keys(errors).length === 0;
    return { ok, errors, entry: ok ? { date, platform, shift, gross, tips, expenses, hours, trips } : null };
  }

  /** Sum of hours already logged on a date. */
  function hoursOn(list, date) {
    return list.reduce((s, e) => s + (e.date === date ? Number(e.hours) || 0 : 0), 0);
  }

  /**
   * Drop anything invalid from stored entries (bad shape, ₹0/0h, future dates, >24h on one day).
   * @param {unknown} list parsed localStorage value
   * @param {string} today
   * @returns {object[]} clean entries
   */
  function sanitizeEntries(list, today) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const raw of list) {
      const v = validateEntry(raw, today);
      if (v.ok && hoursOn(out, v.entry.date) + v.entry.hours <= 24) out.push(v.entry);
    }
    return out;
  }

  root.GigEntries = { validateEntry, sanitizeEntries, hoursOn, PLATFORMS, SHIFTS };
})(globalThis);
