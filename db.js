// Tiny IndexedDB wrapper: one store of task objects keyed by id.

const opened = new Promise((resolve, reject) => {
  const req = indexedDB.open('proof', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('tasks', { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function run(mode, work) {
  return opened.then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', mode);
    const req = work(tx.objectStore('tasks'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const loadTasks = () => run('readonly', (store) => store.getAll());
export const saveTask = (task) => run('readwrite', (store) => store.put(task));
export const removeTask = (id) => run('readwrite', (store) => store.delete(id));
export const replaceAll = (tasks) => run('readwrite', (store) => {
  store.clear();
  for (const t of tasks) store.put(t);
});
