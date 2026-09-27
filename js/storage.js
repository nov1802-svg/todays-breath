const KEY = "todays-breath-v1";

function empty() {
  return {
    records: [],
    challenge: {
      completed: false,
      restartAfter: null,
    },
    preferences: {
      duration: 10,
      music: "forest",
      volume: 0.7,
    },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    const base = empty();
    return {
      records: Array.isArray(data.records) ? data.records : [],
      challenge: { ...base.challenge, ...(data.challenge || {}) },
      preferences: { ...base.preferences, ...(data.preferences || {}) },
    };
  } catch {
    return empty();
  }
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function addRecord(data, record) {
  if (data.records.some((item) => item.id === record.id)) return false;
  data.records.push(record);
  save(data);
  return true;
}
