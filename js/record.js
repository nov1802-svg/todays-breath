export const MIN_CHALLENGE_SECONDS = 5 * 60;

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso, delta) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  return formatDate(date);
}

export function formatLength(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}분 ${secs}초` : `${minutes}분`;
  }
  return `${secs}초`;
}

export function qualifyingDates(records) {
  const totals = new Map();
  for (const record of records) {
    totals.set(record.date, (totals.get(record.date) || 0) + (record.actualSeconds || 0));
  }
  return [...totals.entries()]
    .filter(([, seconds]) => seconds >= MIN_CHALLENGE_SECONDS)
    .map(([date]) => date)
    .sort();
}

export function currentStreak(dates, today) {
  const set = new Set(dates);
  let cursor = today;
  if (!set.has(cursor)) {
    cursor = addDays(today, -1);
    if (!set.has(cursor)) return { count: 0, dates: [] };
  }
  const list = [];
  while (set.has(cursor) && list.length < 4000) {
    list.push(cursor);
    cursor = addDays(cursor, -1);
  }
  list.reverse();
  return { count: list.length, dates: list };
}

function cycleDates(records, meta) {
  return qualifyingDates(records).filter((date) => !meta.restartAfter || date > meta.restartAfter);
}

export function syncChallenge(records, meta, today = formatDate(new Date())) {
  const dates = cycleDates(records, meta);
  const streak = currentStreak(dates, today);
  if (!meta.completed && streak.count >= 7) meta.completed = true;
  return {
    daysDone: meta.completed ? 7 : streak.count,
    completed: Boolean(meta.completed),
    restartAfter: meta.restartAfter || null,
    todayDone: dates.includes(today),
    streak: streak.count,
  };
}

export function restartChallenge(records, meta, today = formatDate(new Date())) {
  const dates = cycleDates(records, meta);
  const candidate = dates.length ? dates[dates.length - 1] : meta.restartAfter || addDays(today, -1);
  if (!meta.restartAfter || candidate > meta.restartAfter) meta.restartAfter = candidate;
  meta.completed = false;
  return meta;
}

export function summarize(records, today = new Date()) {
  const todayIso = formatDate(today);
  const monthPrefix = todayIso.slice(0, 7);
  const monthCount = records.filter((record) => record.date.startsWith(monthPrefix)).length;
  const totalSeconds = records.reduce((sum, record) => sum + (record.actualSeconds || 0), 0);
  const streak = currentStreak(qualifyingDates(records), todayIso);
  return { monthCount, totalSeconds, streak: streak.count };
}

export function yesterdayPractice(records, today = new Date()) {
  const yesterday = addDays(formatDate(today), -1);
  const sessions = records.filter((record) => record.date === yesterday);
  if (!sessions.length) return null;
  const seconds = sessions.reduce((sum, record) => sum + (record.actualSeconds || 0), 0);
  return { seconds, count: sessions.length };
}

export function buildMonth(year, month, records, today = new Date()) {
  const todayIso = formatDate(today);
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = formatDate(new Date(year, month, day));
    const sessions = records.filter((record) => record.date === date);
    const musics = [];
    for (const session of sessions) {
      if (!musics.includes(session.music)) musics.push(session.music);
    }
    cells.push({
      date,
      day,
      count: sessions.length,
      seconds: sessions.reduce((sum, record) => sum + (record.actualSeconds || 0), 0),
      musics,
      isToday: date === todayIso,
      isFuture: date > todayIso,
    });
  }
  const cursor = new Date(year, month, 1);
  const max = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    label: `${year}년 ${month + 1}월`,
    cells,
    canNext: cursor < max,
  };
}

export function sessionsOn(records, date) {
  return records.filter((record) => record.date === date);
}
