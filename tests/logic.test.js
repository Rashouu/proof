import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, parseDay, addDays, daysBetween, weekStart, dayMonth, shortDate, dueLabel,
  sortPending, countsByDay, doneOn, streaks, yearWeeks, searchDone, tallyStrokes,
  makeBackup, readBackup,
} from '../logic.js';

const task = (over) => ({
  id: over.id, title: over.title || over.id, notes: '', due: null,
  createdAt: '2026-11-01T09:00:00.000Z', doneAt: null, doneDay: null, ...over,
});
const done = (id, day, time = '10:00') => task({ id, doneAt: `${day}T${time}:00.000Z`, doneDay: day });

test('day keys round-trip and step across months and years', () => {
  assert.equal(dayKey(new Date(2026, 10, 13)), '2026-11-13');
  assert.equal(dayKey(parseDay('2026-01-05')), '2026-01-05');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('daysBetween counts calendar days, even across daylight saving', () => {
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-11-13', '2026-11-11'), -2);
});

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-11-13'), '2026-11-09'); // Friday
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Monday
});

test('date text', () => {
  assert.equal(dayMonth('2026-11-13'), '13 November');
  assert.equal(shortDate('2026-11-20', '2026-11-13'), 'Fri 20 Nov');
  assert.equal(shortDate('2027-01-04', '2026-11-13'), 'Mon 4 Jan 2027');
});

test('due labels', () => {
  const today = '2026-11-13';
  assert.deepEqual(dueLabel('2026-11-12', today), { text: '1 day overdue', overdue: true });
  assert.deepEqual(dueLabel('2026-11-11', today), { text: '2 days overdue', overdue: true });
  assert.deepEqual(dueLabel('2026-11-13', today), { text: 'Today', overdue: false });
  assert.deepEqual(dueLabel('2026-11-14', today), { text: 'Tomorrow', overdue: false });
  assert.deepEqual(dueLabel('2026-11-20', today), { text: 'Fri 20 Nov', overdue: false });
});

test('pending sort: overdue, then soonest due, then undated newest first; done tasks excluded', () => {
  const tasks = [
    task({ id: 'undated-old', createdAt: '2026-11-01T00:00:00.000Z' }),
    task({ id: 'later', due: '2026-11-20' }),
    done('finished', '2026-11-12'),
    task({ id: 'undated-new', createdAt: '2026-11-10T00:00:00.000Z' }),
    task({ id: 'overdue', due: '2026-11-11' }),
    task({ id: 'tomorrow', due: '2026-11-14' }),
  ];
  assert.deepEqual(sortPending(tasks).map((t) => t.id), ['overdue', 'tomorrow', 'later', 'undated-new', 'undated-old']);
});

test('counts and the tasks finished on a day', () => {
  const tasks = [done('a', '2026-11-11', '18:05'), done('b', '2026-11-11', '08:12'), done('c', '2026-11-12'), task({ id: 'p' })];
  const counts = countsByDay(tasks);
  assert.equal(counts.get('2026-11-11'), 2);
  assert.equal(counts.get('2026-11-12'), 1);
  assert.equal(counts.size, 2);
  assert.deepEqual(doneOn(tasks, '2026-11-11').map((t) => t.id), ['b', 'a']);
});

test('streaks: current run counts through today, or through yesterday until today ends', () => {
  const counts = new Map([['2026-11-08', 1], ['2026-11-09', 1], ['2026-11-10', 2], ['2026-11-12', 1], ['2026-11-13', 3]]);
  assert.deepEqual(streaks(counts, '2026-11-13'), { current: 2, best: 3 });
  assert.deepEqual(streaks(counts, '2026-11-14'), { current: 2, best: 3 });
  assert.deepEqual(streaks(counts, '2026-11-15'), { current: 0, best: 3 });
  assert.deepEqual(streaks(new Map(), '2026-11-13'), { current: 0, best: 0 });
});

test('year weeks: 53 Monday rows back to 365 days ago, further if history is older', () => {
  const weeks = yearWeeks('2026-11-13', null);
  assert.equal(weeks.length, 53);
  assert.equal(weeks[0], '2026-11-09');
  assert.equal(weeks.at(-1), '2025-11-10');
  assert.equal(yearWeeks('2026-11-13', '2025-06-03').at(-1), '2025-06-02');
  assert.equal(yearWeeks('2026-11-13', '2026-10-01').length, 53);
});

test('search finds finished tasks by title or notes, newest first', () => {
  const tasks = [
    done('old', '2026-10-01'),
    { ...done('new', '2026-11-11'), title: 'Return library books' },
    { ...done('note', '2026-11-05'), title: 'Errand', notes: 'Drop off LIBRARY card' },
    task({ id: 'pending', title: 'library fine' }),
  ];
  assert.deepEqual(searchDone(tasks, '  Library ').map((t) => t.id), ['new', 'note']);
  assert.deepEqual(searchDone(tasks, '   '), []);
});

test('tally strokes', () => {
  const count = (n) => tallyStrokes(n).strokes.length;
  assert.equal(count(0), 0);
  assert.equal(count(1), 1);
  assert.equal(count(4), 4);
  assert.equal(count(5), 5);
  assert.equal(count(7), 7);
  assert.equal(count(10), 10);
  assert.equal(count(12), 10);
  assert.equal(tallyStrokes(10).more, false);
  assert.equal(tallyStrokes(11).more, true);
});

test('backups round-trip and reject bad files', () => {
  const tasks = [task({ id: 'p', due: '2026-11-20', notes: 'n' }), done('d', '2026-11-11')];
  const text = JSON.stringify(makeBackup(tasks, new Date('2026-11-13T10:00:00Z')));
  assert.deepEqual(readBackup(text), tasks);
  assert.throws(() => readBackup('not json'), /isn't a Proof backup/);
  assert.throws(() => readBackup('{"app":"other","version":1,"tasks":[]}'), /isn't a Proof backup/);
  const damaged = JSON.stringify(makeBackup([{ ...tasks[0], due: '20 Nov' }], new Date()));
  assert.throws(() => readBackup(damaged), /damaged/);
  const halfDone = JSON.stringify(makeBackup([{ ...tasks[0], doneAt: '2026-11-11T10:00:00Z' }], new Date()));
  assert.throws(() => readBackup(halfDone), /damaged/);
});
