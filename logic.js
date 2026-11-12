// Pure helpers: no DOM, no storage.
// A "day key" is a local calendar date written as "YYYY-MM-DD".

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// Whole days from a to b, unaffected by daylight-saving shifts.
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Monday of the week that contains the given day.
export function weekStart(key) {
  return addDays(key, -((parseDay(key).getDay() + 6) % 7));
}

export const weekdayName = (key) => WEEKDAYS[parseDay(key).getDay()];
export const monthShort = (key) => MONTHS[parseDay(key).getMonth()].slice(0, 3);

export function dayMonth(key) {
  const d = parseDay(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// "Fri 20 Nov", plus the year when it isn't the current one.
export function shortDate(key, today) {
  const d = parseDay(key);
  const text = `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return key.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${d.getFullYear()}`;
}

export function dueLabel(due, today) {
  const diff = daysBetween(today, due);
  if (diff < 0) return { text: `${-diff} ${diff === -1 ? 'day' : 'days'} overdue`, overdue: true };
  if (diff === 0) return { text: 'Today', overdue: false };
  if (diff === 1) return { text: 'Tomorrow', overdue: false };
  return { text: shortDate(due, today), overdue: false };
}

// Pending tasks: dated first by soonest due (overdue naturally first), then undated; newest first on ties.
export function sortPending(tasks) {
  return tasks
    .filter((t) => !t.doneAt)
    .sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (!a.due !== !b.due) return a.due ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function countsByDay(tasks) {
  const counts = new Map();
  for (const t of tasks) if (t.doneDay) counts.set(t.doneDay, (counts.get(t.doneDay) || 0) + 1);
  return counts;
}

export function doneOn(tasks, day) {
  return tasks.filter((t) => t.doneDay === day).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
}

// A run doesn't break until a whole day passes with nothing finished.
export function streaks(counts, today) {
  let current = 0;
  for (let day = counts.has(today) ? today : addDays(today, -1); counts.has(day); day = addDays(day, -1)) current++;
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of [...counts.keys()].sort()) {
    run = prev && daysBetween(prev, key) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return { current, best };
}

// Mondays from this week back to the week holding 365 days ago, or the earliest finished day if older.
export function yearWeeks(today, earliest) {
  let from = addDays(today, -364);
  if (earliest && earliest < from) from = earliest;
  const first = weekStart(from);
  const weeks = [];
  for (let w = weekStart(today); w >= first; w = addDays(w, -7)) weeks.push(w);
  return weeks;
}

export function searchDone(tasks, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tasks
    .filter((t) => t.doneAt && `${t.title}\n${t.notes}`.toLowerCase().includes(q))
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt));
}

// Tally strokes inside a 48x48 box: up to 5 per row (the 5th crosses the four), two rows max.
const LEAN = [0.6, -0.4, 0.3, -0.7, 0.5];
export function tallyStrokes(n) {
  const shown = Math.min(n, 10);
  const rows = shown > 5 ? 2 : 1;
  const strokes = [];
  for (let r = 0; r < rows; r++) {
    const count = r === 0 ? Math.min(shown, 5) : shown - 5;
    const cy = rows === 1 ? 24 : r === 0 ? 13.5 : 34.5;
    const h = rows === 1 ? 20 : 15;
    const x0 = 24 - 1.5 * 5.6;
    for (let i = 0; i < Math.min(count, 4); i++) {
      const x = x0 + i * 5.6;
      const lean = LEAN[(i + r) % LEAN.length];
      strokes.push([x - lean, cy - h / 2, x + lean, cy + h / 2]);
    }
    if (count === 5) strokes.push([x0 - 3.5, cy + h / 2 - 2, x0 + 3 * 5.6 + 3.5, cy - h / 2 + 2]);
  }
  return { strokes, more: n > 10 };
}

export function makeBackup(tasks, now) {
  return { app: 'proof', version: 1, exportedAt: now.toISOString(), tasks };
}

const isDay = (v) => typeof v === 'string' && DAY_KEY.test(v);
const isText = (v) => typeof v === 'string';

function validTask(t) {
  return t && isText(t.id) && t.id && isText(t.title) && t.title.trim() && isText(t.notes)
    && (t.due === null || isDay(t.due)) && isText(t.createdAt)
    && ((t.doneAt === null && t.doneDay === null) || (isText(t.doneAt) && isDay(t.doneDay)));
}

// Returns the tasks from a backup file's text, or throws an Error with a message for the user.
export function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Proof backup.");
  }
  if (!data || data.app !== 'proof' || data.version !== 1 || !Array.isArray(data.tasks)) {
    throw new Error("That file isn't a Proof backup.");
  }
  if (!data.tasks.every(validTask)) throw new Error('That backup file is damaged, so nothing was imported.');
  return data.tasks;
}
