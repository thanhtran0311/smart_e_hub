// Transactions resolve on completion so the next lock holder can read the committed value.
let connection;

function openDatabase() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const open = indexedDB.open("smart_e_hub", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("snapshots");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

export async function sharedSnapshot(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const writing = value !== undefined;
    const tx = db.transaction("snapshots", writing ? "readwrite" : "readonly");
    const snapshots = tx.objectStore("snapshots");
    const request = writing ? snapshots.put(value, key) : snapshots.get(key);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error || new Error("Giao dịch lưu dữ liệu bị hủy."));
  });
}
