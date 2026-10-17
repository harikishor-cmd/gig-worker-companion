// Deterministic earnings math. Gemini never computes or invents numbers; it only explains these.
const r2 = (n) => Math.round(n * 100) / 100;
const div = (a, b) => (b > 0 ? r2(a / b) : null);

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function aggregate(entries) {
  let gross = 0,
    tips = 0,
    expenses = 0,
    hours = 0,
    trips = 0,
    nightNet = 0;
  const byDay = new Map();
  const byPlatform = new Map();
  for (const e of entries) {
    const net = r2(e.gross + (e.tips || 0) - (e.expenses || 0));
    gross = r2(gross + e.gross);
    tips = r2(tips + (e.tips || 0));
    expenses = r2(expenses + (e.expenses || 0));
    hours = r2(hours + e.hours);
    trips += e.trips || 0;
    if (e.shift === 'night') nightNet = r2(nightNet + net);
    const d = byDay.get(e.date) || { date: e.date, net: 0, hours: 0 };
    d.net = r2(d.net + net);
    d.hours = r2(d.hours + e.hours);
    byDay.set(e.date, d);
    const p = byPlatform.get(e.platform) || { platform: e.platform, net: 0, hours: 0 };
    p.net = r2(p.net + net);
    p.hours = r2(p.hours + e.hours);
    byPlatform.set(e.platform, p);
  }
  const net = r2(gross + tips - expenses);
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const best = days.length >= 2 ? days.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  return {
    totals: {
      net,
      gross,
      tips,
      expenses,
      hours,
      trips,
      daysWorked: days.length,
      perHour: div(net, hours),
      perTrip: div(net, trips),
      expenseShare: div(expenses, gross + tips),
      nightSharePct: net > 0 ? Math.round((nightNet / net) * 100) : null,
    },
    byDay: days,
    byPlatform: [...byPlatform.values()].map((p) => ({ ...p, perHour: div(p.net, p.hours) })),
    bestDay: best ? best.date : null,
  };
}

/**
 * @param {Array} entries validated entries (this + previous week)
 * @param {string} weekStart YYYY-MM-DD (Monday)
 */
export function computeWeekStats(entries, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(weekStart, -1);
  const cur = entries.filter((e) => e.date >= weekStart && e.date <= weekEnd);
  const prev = entries.filter((e) => e.date >= prevStart && e.date <= prevEnd);
  const now = aggregate(cur);
  const before = prev.length ? aggregate(prev).totals : null;
  return {
    week: { start: weekStart, end: weekEnd },
    ...now,
    prevWeek: before ? { net: before.net, perHour: before.perHour } : null,
    deltaNetPct: before && before.net > 0 ? Math.round(((now.totals.net - before.net) / before.net) * 100) : null,
  };
}

/** All numbers a model output is allowed to mention (raw, rounded, and 1 dp). */
export function allowedNumbers(stats) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'number') {
      [v, Math.round(v), Math.abs(Math.round(v)), r2(Math.round(v * 10) / 10)].forEach((x) => out.add(String(x)));
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-');
      [y, String(+m), String(+d)].forEach((x) => out.add(x));
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(stats);
  return out;
}

/** Numbers in text (handles ₹1,234.50, 45%, Devanagari/Gurmukhi digits). */
export function numbersIn(text) {
  const norm = text
    .replace(/[\u0966-\u096F]/g, (c) => String(c.charCodeAt(0) - 0x0966))
    .replace(/[\u0A66-\u0A6F]/g, (c) => String(c.charCodeAt(0) - 0x0a66));
  return (norm.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => String(Number(n.replace(/,/g, ''))));
}
