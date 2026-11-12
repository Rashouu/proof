import * as db from './db.js';
import {
  dayKey, addDays, weekdayName, dayMonth, monthShort, shortDate, dueLabel, sortPending,
  countsByDay, doneOn, streaks, yearWeeks, searchDone, tallyStrokes, makeBackup, readBackup,
} from './logic.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let tasks = [];
let today = dayKey(new Date());

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svg(markup, size, box = 24) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', `0 0 ${box} ${box}`);
  node.setAttribute('width', size);
  node.setAttribute('height', size);
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = markup;
  return node;
}

// ---------- Saving ----------

function commit(task) {
  const i = tasks.findIndex((t) => t.id === task.id);
  if (i === -1) tasks.push(task);
  else tasks[i] = task;
  db.saveTask(task).catch(saveFailed);
}

function discard(id) {
  tasks = tasks.filter((t) => t.id !== id);
  db.removeTask(id).catch(saveFailed);
}

function saveFailed() {
  showToast("Couldn't save that change. Check your iPhone's free storage.");
}

// ---------- Tasks view ----------

function renderTasks() {
  $('date-ink').textContent = $('date-pink').textContent = `${weekdayName(today)}\n${dayMonth(today)}`;
  const pending = sortPending(tasks);
  const doneToday = countsByDay(tasks).get(today) || 0;
  $('summary').textContent = `${pending.length} to do, ${doneToday} done today`;
  $('tasks-empty').hidden = pending.length > 0;
  $('task-list').replaceChildren(...pending.map(taskRow));
}

function taskRow(t) {
  const li = el('li', 'task');

  const check = el('button', 'check');
  check.type = 'button';
  check.setAttribute('aria-label', `Mark "${t.title}" done`);
  check.append(el('span', 'ink'), el('span', 'ring'));
  check.addEventListener('click', () => complete(t, li));

  const main = el('button', 'task-main');
  main.type = 'button';
  const title = el('span', 'title', t.title);
  title.append(el('span', 'strike'));
  main.append(title);
  if (t.notes) main.append(svg('<path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', 18));
  if (t.due) {
    const due = dueLabel(t.due, today);
    main.append(el('span', due.overdue ? 'due overdue' : 'due', due.text));
  }
  main.addEventListener('click', () => openTask(t));

  li.append(check, main);
  return li;
}

function complete(t, li) {
  if (li.classList.contains('done')) return;
  haptic();
  const now = new Date();
  commit({ ...t, doneAt: now.toISOString(), doneDay: dayKey(now) });
  li.classList.add('done');
  showToast(`Done: ${t.title}`, () => commit(t));
  setTimeout(() => foldAway(li), reduceMotion.matches ? 0 : 650);
}

// Collapse a row, then redraw the list.
function foldAway(li) {
  if (reduceMotion.matches) return render();
  li.style.height = `${li.offsetHeight}px`;
  li.offsetHeight; // apply the fixed height before animating it away
  li.classList.add('folding');
  setTimeout(render, 220); // a timer, not transitionend: that event can be skipped if the app is backgrounded
}

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('add-input').value.trim();
  if (!title) return;
  commit({ id: crypto.randomUUID(), title, notes: '', due: null, createdAt: new Date().toISOString(), doneAt: null, doneDay: null });
  $('add-input').value = '';
  render();
});

// ---------- Task details sheet ----------

let editing = null;

function openTask(t) {
  editing = t;
  $('task-title').value = t.title;
  $('task-due').value = t.due || '';
  $('task-notes').value = t.notes;
  $('task-sheet').showModal();
}

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('task-title').value.trim();
  if (!title) {
    $('task-title').value = '';
    $('task-title').reportValidity();
    return;
  }
  commit({ ...editing, title, due: $('task-due').value || null, notes: $('task-notes').value.trim() });
  $('task-sheet').close();
  render();
});

$('task-cancel').addEventListener('click', () => $('task-sheet').close());
$('task-due-clear').addEventListener('click', () => { $('task-due').value = ''; });

$('task-delete').addEventListener('click', () => {
  const t = editing;
  $('task-sheet').close();
  discard(t.id);
  render();
  showToast(`Deleted: ${t.title}`, () => commit(t));
});

// Sheets close on Close buttons and on taps outside them.
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}

// ---------- Toast with Undo ----------

let toastTimer = null;
let undoAction = null;

function showToast(text, undo = null) {
  clearTimeout(toastTimer);
  undoAction = undo;
  $('toast-text').textContent = text;
  $('toast-undo').hidden = !undo;
  // A popover sits in the top layer; re-showing it draws it above any open sheet
  // (an open sheet still makes it unclickable, so toasts over sheets carry no Undo).
  if ($('toast').matches(':popover-open')) $('toast').hidePopover();
  $('toast').showPopover();
  const life = $('toast-life');
  life.classList.remove('running');
  life.offsetWidth; // restart the countdown bar
  life.classList.add('running');
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  if ($('toast').matches(':popover-open')) $('toast').hidePopover();
  undoAction = null;
}

$('toast-undo').addEventListener('click', () => {
  const undo = undoAction;
  hideToast();
  if (undo) {
    undo();
    render();
  }
});

// ---------- Year view ----------

function renderYear() {
  const counts = countsByDay(tasks);
  const { current, best } = streaks(counts, today);
  $('streak').textContent =
    current === 0 ? 'Finish a task to start a run.'
    : current === 1 ? `You finished something ${counts.has(today) ? 'today' : 'yesterday'}.`
    : `You've finished something ${current} days running.`;
  $('best').textContent = best > 1 ? `Your best run is ${best} days.` : '';

  const cells = [];
  let prevLabel = null;
  for (const monday of yearWeeks(today, [...counts.keys()].sort()[0])) {
    const sunday = addDays(monday, 6);
    const label = monthShort(sunday) + (sunday.slice(5, 7) === '01' ? `\n${sunday.slice(0, 4)}` : '');
    cells.push(el('span', 'month', label === prevLabel ? '' : label));
    prevLabel = label;
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      cells.push(day > today ? el('span') : dayCell(day, counts.get(day) || 0));
    }
  }
  $('year-grid').replaceChildren(...cells);
  renderSearch();
}

function dayCell(day, n) {
  const cell = el('button', day === today ? 'day today' : 'day');
  cell.type = 'button';
  cell.dataset.day = day;
  cell.setAttribute('aria-label', `${fullDate(day)}, ${n} done`);
  cell.append(tallySvg(n));
  return cell;
}

function tallySvg(n) {
  if (n === 0) return svg('<circle class="empty-dot" cx="24" cy="24" r="1.8"/>', '100%', 48);
  const { strokes, more } = tallyStrokes(n);
  const lines = strokes.map(([x1, y1, x2, y2]) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  if (more) lines.push('<path d="M40 6v7M36.5 9.5h7"/>');
  return svg(`<g class="tally">${lines.join('')}</g>`, '100%', 48);
}

$('year-grid').addEventListener('click', (e) => {
  const cell = e.target.closest('.day');
  if (cell) openDay(cell.dataset.day);
});

// ---------- Day panel ----------

function fullDate(day) {
  return `${weekdayName(day)} ${dayMonth(day)}${day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`}`;
}

function openDay(day) {
  const list = doneOn(tasks, day);
  $('day-title').textContent = fullDate(day);
  $('day-count').textContent = list.length ? `${list.length} finished` : 'Nothing finished on this day.';
  $('day-list').replaceChildren(...list.map((t) => doneRow(t, day)));
  if (!$('day-sheet').open) $('day-sheet').showModal();
}

function doneRow(t, day) {
  const li = el('li', 'done-row');
  const time = new Date(t.doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const body = el('div', 'done-body');
  body.append(el('div', '', t.title));
  if (t.notes) body.append(el('div', 'faded', t.notes));

  const restore = el('button', 'btn', 'Restore');
  restore.type = 'button';
  restore.addEventListener('click', () => {
    commit({ ...t, doneAt: null, doneDay: null });
    render();
    openDay(day);
    showToast(`Restored to your list: ${t.title}`);
  });
  const remove = el('button', 'btn highlight', 'Delete');
  remove.type = 'button';
  // Confirm instead of Undo: an open sheet makes the toast's Undo button unreachable.
  remove.addEventListener('click', () => {
    if (!confirm(`Delete "${t.title}" from your history? This can't be undone.`)) return;
    discard(t.id);
    render();
    openDay(day);
    showToast(`Deleted: ${t.title}`);
  });
  const actions = el('div', 'done-actions');
  actions.append(restore, remove);
  body.append(actions);

  li.append(el('span', 'time faded', time), body);
  return li;
}

// ---------- Search ----------

function renderSearch() {
  const query = $('search-input').value.trim();
  const results = searchDone(tasks, query);
  $('year-grid').hidden = $('week-head').hidden = query !== '';
  $('search-results').hidden = results.length === 0;
  $('search-empty').hidden = query === '' || results.length > 0;
  $('search-empty').textContent = `No finished tasks match "${query}".`;
  $('search-results').replaceChildren(...results.map((t) => {
    const button = el('button', 'result');
    button.type = 'button';
    button.append(el('span', 'faded when', shortDate(t.doneDay, today)), el('span', '', t.title));
    button.addEventListener('click', () => openDay(t.doneDay));
    const li = el('li');
    li.append(button);
    return li;
  }));
}

$('search-input').addEventListener('input', renderSearch);
$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('search-input').blur();
});

// ---------- Backup ----------

$('backup-open').addEventListener('click', () => {
  $('backup-msg').textContent = '';
  $('backup-sheet').showModal();
});

$('export-btn').addEventListener('click', async () => {
  const name = `proof-backup-${today}.json`;
  const file = new File([JSON.stringify(makeBackup(tasks, new Date()))], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      $('backup-msg').textContent = 'Backup exported.';
    } catch (e) {
      if (e.name !== 'AbortError') $('backup-msg').textContent = "Couldn't export the backup. Try again.";
    }
    return;
  }
  const link = el('a');
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  $('backup-msg').textContent = 'Backup exported.';
});

$('import-input').addEventListener('change', async () => {
  const file = $('import-input').files[0];
  $('import-input').value = '';
  if (!file) return;
  let incoming;
  try {
    incoming = readBackup(await file.text());
  } catch (e) {
    $('backup-msg').textContent = e.message;
    return;
  }
  if (!confirm(`Replace everything in Proof with this backup (${incoming.length} tasks)? Your current tasks will be removed.`)) return;
  try {
    await db.replaceAll(incoming);
  } catch {
    $('backup-msg').textContent = "Couldn't import the backup. Check your iPhone's free storage.";
    return;
  }
  tasks = incoming;
  render();
  $('backup-msg').textContent = `Imported ${incoming.length} tasks.`;
});

// ---------- Tabs ----------

function show(view) {
  const year = view === 'year';
  $('tasks-view').hidden = year;
  $('year-view').hidden = !year;
  $('add-form').hidden = year;
  $('search-form').hidden = !year;
  $('tab-tasks').setAttribute('aria-current', year ? 'false' : 'page');
  $('tab-year').setAttribute('aria-current', year ? 'page' : 'false');
  render();
  if (year) document.querySelector('.day.today')?.classList.add('fresh'); // today's tally prints in
  scrollTo(0, 0);
}

$('tab-tasks').addEventListener('click', () => show('tasks'));
$('tab-year').addEventListener('click', () => show('year'));

// ---------- Phone niceties ----------

// Toggling a hidden switch makes Safari on iOS 18+ play a light haptic tap.
function haptic() {
  $('haptic').parentElement.click();
}

// Keep the dock above the on-screen keyboard.
if (window.visualViewport) {
  const lift = () => {
    const covered = innerHeight - visualViewport.height - visualViewport.offsetTop;
    $('dock').style.transform = covered > 0 ? `translateY(${-covered}px)` : '';
  };
  visualViewport.addEventListener('resize', lift);
  visualViewport.addEventListener('scroll', lift);
}

// "Today" moves on when the app is reopened after midnight.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && dayKey(new Date()) !== today) {
    today = dayKey(new Date());
    render();
  }
});

function render() {
  renderTasks();
  if (!$('year-view').hidden) renderYear();
}

let loadFailed = false;
try {
  tasks = await db.loadTasks();
} catch {
  loadFailed = true;
}
render();
if (loadFailed) $('summary').textContent = "Your saved tasks couldn't be opened. Close Proof and open it again.";
navigator.storage?.persist?.();
navigator.serviceWorker?.register('sw.js');
