import { getPeriod } from "./time.js";
import { load, save, addRecord } from "./storage.js";
import { createCountdown, formatClock } from "./timer.js";
import {
  formatDate,
  formatLength,
  summarize,
  yesterdayPractice,
  syncChallenge,
  restartChallenge,
  buildMonth,
} from "./record.js";
import { Ambient, SESSION_TRACK_IDS, trackById } from "./audio.js";

const ACTIVE_KEY = "todays-breath-active";
const LAST_KEY = "todays-breath-last";
const DURATIONS = [5, 10, 20];
const VIEWS = ["home", "setup", "session", "complete", "music", "record"];
const RING = 2 * Math.PI * 46;

const MUSIC_LINKS = [
  {
    title: "잔잔한 피아노",
    text: "곱게 깔리는 피아노 선율",
    href: youtube("잔잔한 피아노 명상"),
  },
  {
    title: "싱잉볼",
    text: "잔향이 길게 남는 싱잉볼",
    href: youtube("싱잉볼 명상"),
  },
  {
    title: "수면 명상",
    text: "잠들기 전 듣기 좋은 음악",
    href: youtube("수면 명상 음악"),
  },
  {
    title: "집중 명상",
    text: "조용히 집중하고 싶을 때",
    href: youtube("집중 명상 음악"),
  },
];

const PLAYLISTS = [
  {
    title: "깊은 휴식을 위한 명상 음악",
    text: "잔잔한 자연의 소리와 함께 듣는 명상 음악",
    href: youtube("깊은 휴식 명상 음악 자연"),
  },
  {
    title: "편안한 수면 음악",
    text: "잠들기 전 듣기 좋은 잔잔한 음악",
    href: youtube("편안한 수면 음악"),
  },
  {
    title: "아침 명상 플레이리스트",
    text: "하루를 차분하게 시작하는 명상 음악",
    href: youtube("아침 명상 플레이리스트"),
  },
];

const now = new Date();
const state = {
  data: load(),
  draftDuration: 10,
  draftMusic: "forest",
  session: null,
  timer: null,
  ambient: null,
  wasRunning: false,
  viewYear: now.getFullYear(),
  viewMonth: now.getMonth(),
  selectedDate: formatDate(now),
  audioBlocked: false,
  shownBg: "a",
  bgUrl: "",
};

function youtube(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function route() {
  const hash = location.hash;
  if (hash === "#/meditate") return "setup";
  if (hash === "#/session") return "session";
  if (hash === "#/complete") return "complete";
  if (hash === "#/music") return "music";
  if (hash === "#/record") return "record";
  return "home";
}

function go(hash) {
  const current = location.hash || "#/";
  if (current === hash) {
    render();
    return;
  }
  location.hash = hash;
}

function persistData() {
  try {
    save(state.data);
    return true;
  } catch {
    return false;
  }
}

function remember() {
  state.data.preferences.duration = state.draftDuration;
  state.data.preferences.music = state.draftMusic;
  persistData();
}

function sessionInProgress() {
  return Boolean(state.session && !state.session.committed && state.timer && state.timer.remaining > 0);
}

function persistActive() {
  if (!state.session || state.session.committed || !state.timer) {
    sessionStorage.removeItem(ACTIVE_KEY);
    return;
  }
  sessionStorage.setItem(
    ACTIVE_KEY,
    JSON.stringify({
      id: state.session.id,
      plannedMinutes: state.session.plannedMinutes,
      music: state.session.music,
      startedAt: state.session.startedAt,
      remainingMs: state.timer.remaining,
      running: state.timer.running,
      savedAt: Date.now(),
    }),
  );
}

function loadLast() {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function elapsedSeconds(plannedMinutes, remainingMs) {
  const planned = plannedMinutes * 60;
  const remainingSec = Math.round(remainingMs / 1000);
  return Math.max(0, Math.min(planned, planned - remainingSec));
}

function commitSession(session, remainingMs, natural) {
  const actualSeconds = elapsedSeconds(session.plannedMinutes, remainingMs);
  if (actualSeconds <= 0) return null;
  const before = state.data.challenge.completed;
  const record = {
    id: session.id,
    date: formatDate(new Date(session.startedAt)),
    startedAt: session.startedAt,
    duration: session.plannedMinutes,
    actualDuration: Math.round((actualSeconds / 60) * 10) / 10,
    actualSeconds,
    music: session.music,
    completed: natural,
  };
  let saveError = false;
  try {
    addRecord(state.data, record);
    syncChallenge(state.data.records, state.data.challenge);
    save(state.data);
  } catch {
    saveError = true;
  }
  return {
    ...record,
    saveError,
    challengeJustCompleted: !before && state.data.challenge.completed,
  };
}

function finish(natural) {
  if (!state.session || state.session.committed) return;
  const remainingMs = natural ? 0 : state.timer?.remaining ?? 0;
  if (state.timer?.running) state.timer.pause();
  state.session.committed = true;
  const summary = commitSession(state.session, remainingMs, natural);
  closeModal();
  state.ambient.stop();
  sessionStorage.removeItem(ACTIVE_KEY);
  if (!summary) {
    go("#/");
    return;
  }
  sessionStorage.setItem(LAST_KEY, JSON.stringify(summary));
  go("#/complete");
}

function armTimer(remaining, running) {
  state.timer = createCountdown(remaining, {
    onTick: updateTimerFace,
    onDone: () => finish(true),
  });
  if (running) state.timer.start();
}

function restoreActive() {
  const raw = sessionStorage.getItem(ACTIVE_KEY);
  if (!raw) return;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return;
  }
  let remaining = Number(saved.remainingMs) || 0;
  if (saved.running) remaining -= Date.now() - Number(saved.savedAt || Date.now());
  state.session = {
    id: saved.id,
    plannedMinutes: saved.plannedMinutes,
    music: saved.music,
    startedAt: saved.startedAt,
    committed: false,
  };
  if (remaining <= 400) {
    state.session.committed = true;
    const summary = commitSession(state.session, 0, true);
    sessionStorage.removeItem(ACTIVE_KEY);
    if (summary) {
      sessionStorage.setItem(LAST_KEY, JSON.stringify(summary));
      history.replaceState(null, "", "#/complete");
    }
    return;
  }
  armTimer(remaining, false);
  if (saved.running) {
    state.timer.start();
    state.ambient.play(saved.music, state.data.preferences.volume);
  }
  if (location.hash !== "#/session") history.replaceState(null, "", "#/session");
}

function startSession() {
  const duration = DURATIONS.includes(state.draftDuration) ? state.draftDuration : 10;
  const music = trackById(state.draftMusic) ? state.draftMusic : "forest";
  state.draftDuration = duration;
  state.draftMusic = music;
  remember();
  state.session = {
    id: uid(),
    plannedMinutes: duration,
    music,
    startedAt: new Date().toISOString(),
    committed: false,
  };
  armTimer(duration * 60 * 1000, false);
  state.ambient.play(music, state.data.preferences.volume);
  state.timer.start();
  persistActive();
  go("#/session");
}

function toggleTimer() {
  if (!state.timer || !state.session || state.session.committed) return;
  if (state.timer.running) {
    state.timer.pause();
    state.ambient.pause();
  } else {
    state.timer.start();
    state.ambient.resume();
  }
  persistActive();
  updateTimerFace();
}

function askEnd() {
  if (!sessionInProgress()) return;
  state.wasRunning = state.timer.running;
  if (state.timer.running) {
    state.timer.pause();
    state.ambient.pause();
    persistActive();
    updateTimerFace();
  }
  const seconds = elapsedSeconds(state.session.plannedMinutes, state.timer.remaining);
  const modal = document.getElementById("modal");
  document.getElementById("modal-title").textContent = "명상을 종료하시겠어요?";
  document.getElementById("modal-body").textContent =
    seconds <= 0
      ? "아직 명상이 거의 시작되지 않았어요."
      : `현재까지 ${formatLength(seconds)} 동안 명상했습니다.`;
  modal.hidden = false;
  document.getElementById("modal-continue").focus();
}

function closeModal() {
  document.getElementById("modal").hidden = true;
}

function cancelEnd() {
  closeModal();
  if (state.wasRunning && sessionInProgress()) {
    state.timer.start();
    state.ambient.resume();
    persistActive();
    updateTimerFace();
  }
}

function updateTimerFace() {
  const remaining = state.timer?.remaining ?? 0;
  const digits = document.getElementById("timer-digits");
  if (digits) {
    const next = formatClock(remaining);
    if (digits.textContent !== next) digits.textContent = next;
  }
  const ring = document.getElementById("ring");
  if (ring && state.session) {
    const total = state.session.plannedMinutes * 60 * 1000;
    const progress = total > 0 ? 1 - remaining / total : 1;
    ring.style.strokeDashoffset = String(RING * Math.min(1, Math.max(0, progress)));
  }
  const toggle = document.getElementById("toggle-label");
  if (toggle && state.timer) toggle.textContent = state.timer.running ? "일시정지" : "다시 시작";
  document.body.dataset.running = state.timer?.running ? "yes" : "no";
}

function musicName(id) {
  return trackById(id)?.name || "음악";
}

function dots(count) {
  const cells = Array.from({ length: 7 }, (_, index) => {
    const on = index < count;
    return `<span class="dot${on ? " is-on" : ""}">${on ? "🌿" : ""}</span>`;
  }).join("");
  return `<div class="dots" aria-hidden="true">${cells}</div><p class="sr-only">7일 중 ${count}일 완료</p>`;
}

function challengeModel() {
  const before = state.data.challenge.completed;
  const model = syncChallenge(state.data.records, state.data.challenge);
  if (state.data.challenge.completed !== before) persistData();
  return model;
}

function challengeCopy(model, full) {
  const today = formatDate(new Date());
  if (model.completed) {
    return {
      title: full ? "7일, 나를 위한 호흡" : "7일 명상 챌린지",
      status: "7일 명상 챌린지를 완료했습니다.",
      body: "일주일 동안 매일 나를 위한 시간을 만들었습니다.",
      restart: true,
      celebrate: true,
    };
  }
  if (model.daysDone === 0 && model.restartAfter === today) {
    return {
      title: full ? "7일, 나를 위한 호흡" : "7일 명상 챌린지",
      status: "새로운 7일을 준비했어요.",
      body: "내일의 명상부터 새로운 7일이 시작됩니다.",
      restart: false,
      celebrate: false,
    };
  }
  if (model.daysDone === 0) {
    return {
      title: full ? "7일, 나를 위한 호흡" : "7일 명상 챌린지",
      status: full ? "아직 시작 전이에요." : "오늘 5분으로 첫날을 시작해요.",
      body: full
        ? "매일 5분 이상 명상하며 일주일 동안 나를 위한 시간을 만들어 보세요."
        : "매일 5분이면 충분해요.",
      restart: false,
      celebrate: false,
    };
  }
  return {
    title: full ? "7일, 나를 위한 호흡" : "7일 명상 챌린지",
    status: `${model.daysDone}일째 명상 중`,
    body: full
      ? `매일 5분 이상 명상하며 일주일 동안 나를 위한 시간을 만들어 보세요. 앞으로 ${7 - model.daysDone}일 남았어요.`
      : `앞으로 ${7 - model.daysDone}일 남았어요.`,
    restart: false,
    celebrate: false,
  };
}

function challengeCard(model, full) {
  const copy = challengeCopy(model, full);
  return `
    <section class="${full ? "panel" : "challenge-card"}">
      ${copy.celebrate ? '<p class="mark-pop" aria-hidden="true">🎉</p>' : ""}
      <h2>${copy.title}</h2>
      ${dots(model.daysDone)}
      <p class="challenge-status">${copy.status}</p>
      <p class="challenge-body">${copy.body}</p>
      ${copy.restart ? '<button type="button" class="primary" data-action="restart">새로운 7일 시작하기</button>' : ""}
    </section>
  `;
}

function durationButtons(selected, goSetup) {
  return DURATIONS.map((minutes) => {
    const classes = ["choice"];
    if (selected === minutes) classes.push("is-selected");
    else if (minutes === 10) classes.push("is-recommended");
    return `<button type="button" class="${classes.join(" ")}" data-action="duration" data-value="${minutes}" data-go="${goSetup ? "setup" : ""}">${minutes}분</button>`;
  }).join("");
}

function homeHtml() {
  const period = getPeriod();
  const records = state.data.records;
  let eyebrow = "오늘의 숨";
  let title = "오늘부터 작은 명상 습관을 시작해 볼까요?";
  let sub = period.title;
  if (records.length) {
    const yesterday = yesterdayPractice(records);
    const stats = summarize(records);
    const bits = [];
    if (yesterday) bits.push(`어제 ${formatLength(yesterday.seconds)} 동안 명상했어요.`);
    if (stats.streak > 0) bits.push(`🔥 ${stats.streak}일 연속 명상 중.`);
    bits.push("오늘도 이어가 볼까요?");
    eyebrow = "다시 만나 반가워요.";
    title = period.title;
    sub = bits.join(" ");
  }
  return `
    <p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
    <p class="prompt">오늘 몇 분 동안 나에게 집중해 볼까요?</p>
    <div class="choices">${durationButtons(null, true)}</div>
    ${challengeCard(challengeModel(), false)}
  `;
}

function setupHtml() {
  const musicButtons = SESSION_TRACK_IDS.map((id) => {
    const track = trackById(id);
    const selected = state.draftMusic === id ? " is-selected" : "";
    return `<button type="button" class="choice choice-wide${selected}" data-action="pick-music" data-music="${id}"><span class="emoji" aria-hidden="true">${track.emoji}</span>${track.name}</button>`;
  }).join("");
  return `
    <p class="eyebrow">명상하기</p>
    <h1>오늘의 명상을 준비해 볼까요?</h1>
    <div class="step">
      <p class="step-label">시간</p>
      <div class="choices">${durationButtons(state.draftDuration, false)}</div>
    </div>
    <div class="step">
      <p class="step-label">소리</p>
      <div class="choices">${musicButtons}</div>
    </div>
    <button type="button" class="primary start-btn" data-action="start">명상 시작</button>
  `;
}

function sessionHtml() {
  const music = state.session?.music;
  const playing = music && music !== "none" ? `현재 재생 중 · ${musicName(music)}` : "음악 없이 진행 중";
  const volume = Math.round((state.data.preferences.volume ?? 0.7) * 100);
  const volumeControl =
    music && music !== "none"
      ? `<label class="volume">볼륨 <input type="range" min="0" max="100" value="${volume}" data-volume="1" /></label>`
      : "";
  return `
    <p class="breath">호흡에 천천히 집중해 보세요.</p>
    <div class="timer-wrap">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-bg" cx="50" cy="50" r="46"></circle>
        <circle id="ring" class="ring-fg" cx="50" cy="50" r="46" stroke-dasharray="${RING}"></circle>
      </svg>
      <p class="timer-digits" id="timer-digits">${formatClock(state.timer?.remaining ?? 0)}</p>
    </div>
    <p class="now-playing">${playing}</p>
    <p class="hint" id="audio-note" ${state.audioBlocked ? "" : "hidden"}>소리를 켜려면 아래 버튼을 눌러 주세요.</p>
    ${state.audioBlocked ? '<button type="button" class="ghost" data-action="resume-audio">소리 켜기</button>' : ""}
    <div class="session-controls">
      <button type="button" class="primary" data-action="toggle"><span id="toggle-label">${state.timer?.running ? "일시정지" : "다시 시작"}</span></button>
      <button type="button" class="ghost" data-action="end">종료</button>
      ${volumeControl}
    </div>
  `;
}

function completeHtml() {
  const last = loadLast();
  if (!last) return "";
  const celebrate = last.challengeJustCompleted
    ? `<p class="challenge-status">7일 명상 챌린지를 완료했습니다.</p>
       <p class="sub">일주일 동안 매일 나를 위한 시간을 만들었습니다.</p>`
    : "";
  const underFive = last.actualSeconds < 300
    ? "<p class=\"hint\">5분 이상 머무르면 오늘의 챌린지에 이어집니다.</p>"
    : "";
  const saved = last.saveError
    ? "이 브라우저에 기록을 저장하지 못했어요."
    : "기록이 저장되었습니다.";
  return `
    <p class="mark-pop" aria-hidden="true">🌿</p>
    <h1>오늘도 잘 쉬어가셨습니다.</h1>
    <p class="prompt">오늘의 명상</p>
    <p class="length">${formatLength(last.actualSeconds)}</p>
    <p class="sub">나를 위해 잠시 멈춘 시간도 충분히 의미 있습니다.</p>
    ${underFive}
    ${celebrate}
    <div class="actions">
      <a class="primary" href="#/record">나의 기록 보기</a>
      <a class="ghost" href="#/meditate">다시 명상하기</a>
    </div>
    <p class="saved-note">${saved}</p>
  `;
}

function playableCard(track) {
  const on = state.ambient.current === track.id && state.ambient.isPlaying();
  return `
    <button type="button" class="music-card" data-action="preview" data-music="${track.id}" aria-pressed="${on ? "true" : "false"}">
      <span class="card-kicker">${track.emoji} ${track.group === "nature" ? "자연의 소리" : "명상 음악"}</span>
      <strong>${track.name}</strong>
      <span class="play-label" data-play-label>${on ? "멈추기" : "들어보기"}</span>
    </button>
  `;
}

function linkCard(item) {
  return `
    <a class="link-card" href="${item.href}" target="_blank" rel="noopener noreferrer">
      <span>
        <strong>${item.title}</strong>
        <p class="card-text">${item.text}</p>
      </span>
      <span class="play-label">YouTube에서 듣기 ▶</span>
    </a>
  `;
}

function musicHtml() {
  const nature = ["forest", "ocean", "rain", "fire"].map((id) => playableCard(trackById(id))).join("");
  const calm = playableCard(trackById("calm"));
  return `
    <div class="page-intro">
      <p class="eyebrow">명상 음악</p>
      <h1>오늘의 기분에 맞는 소리를 선택해 보세요.</h1>
    </div>
    <div class="stack">
      <section>
        <h2 class="section-title">자연의 소리</h2>
        <div class="cards">${nature}</div>
      </section>
      <section>
        <h2 class="section-title">명상 음악</h2>
        <div class="cards">${calm}${MUSIC_LINKS.map(linkCard).join("")}</div>
      </section>
      <section>
        <h2 class="section-title">YouTube에서 듣기</h2>
        <div class="cards">${PLAYLISTS.map(linkCard).join("")}</div>
      </section>
    </div>
  `;
}

function recordHtml() {
  const records = state.data.records;
  const stats = summarize(records);
  const month = buildMonth(state.viewYear, state.viewMonth, records);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
    .map((day) => `<span>${day}</span>`)
    .join("");
  const cells = month.cells
    .map((cell) => {
      if (!cell) return '<span class="cal-pad"></span>';
      const classes = ["cal-day"];
      if (cell.count) classes.push("has");
      if (cell.isToday) classes.push("is-today");
      if (cell.isFuture) classes.push("is-future");
      if (cell.date === state.selectedDate) classes.push("is-selected");
      return `<button type="button" class="${classes.join(" ")}" data-action="day" data-date="${cell.date}" aria-pressed="${cell.date === state.selectedDate ? "true" : "false"}"><span class="num">${cell.day}</span><span class="mark">${cell.count ? "🌿" : ""}</span></button>`;
    })
    .join("");
  const selected = month.cells.find((cell) => cell && cell.date === state.selectedDate);
  let detail = "<p class=\"hint\">날짜를 누르면 그날의 기록을 볼 수 있어요.</p>";
  if (selected) {
    const [year, monthNum, day] = selected.date.split("-").map(Number);
    if (!selected.count) {
      detail = `<div class="day-detail"><h3>${year}년 ${monthNum}월 ${day}일</h3><p>이 날의 기록이 없습니다.</p></div>`;
    } else {
      const names = selected.musics.map(musicName).join(", ");
      detail = `<div class="day-detail"><h3>${year}년 ${monthNum}월 ${day}일</h3><p>명상 횟수 ${selected.count}회</p><p>명상 시간 ${formatLength(selected.seconds)}</p><p>음악 ${names}</p></div>`;
    }
  }
  const empty = records.length
    ? ""
    : `<p class="sub">아직 기록이 없습니다. 오늘의 첫 호흡을 남겨 보세요.</p><div class="actions"><a class="primary" href="#/meditate">명상하러 가기</a></div>`;
  const today = new Date();
  const viewingNow = state.viewYear === today.getFullYear() && state.viewMonth === today.getMonth();
  return `
    <div class="page-intro">
      <p class="eyebrow">나의 기록</p>
      <h1>나의 명상 기록</h1>
      ${empty}
    </div>
    <div class="stats" style="margin-top:28px">
      <article class="stat"><span>이번 달 명상</span><strong>${stats.monthCount}회</strong></article>
      <article class="stat"><span>총 명상 시간</span><strong>${stats.totalSeconds ? formatLength(stats.totalSeconds) : "0분"}</strong></article>
      <article class="stat"><span>연속 명상</span><strong>${stats.streak}일</strong></article>
    </div>
    <p class="fine">연속 일수는 하루에 5분 이상 명상한 날을 기준으로 이어집니다.</p>
    <section class="stack">
      <div class="sheet">
        <div class="cal-head">
          <h2>${month.label}</h2>
          <div class="cal-nav">
            ${viewingNow ? "" : '<button type="button" class="today-btn" data-action="today-month">오늘</button>'}
            <button type="button" data-action="month" data-delta="-1" aria-label="이전 달">‹</button>
            <button type="button" data-action="month" data-delta="1" aria-label="다음 달" ${month.canNext ? "" : "disabled"}>›</button>
          </div>
        </div>
        <div class="weekdays">${weekdays}</div>
        <div class="cal">${cells}</div>
        ${detail}
      </div>
      ${challengeCard(challengeModel(), true)}
    </section>
    <p class="fine">기록은 이 브라우저에만 저장됩니다.</p>
  `;
}

function renderView(name) {
  const leavingAudio = name !== "music" && name !== "session";
  if (leavingAudio && state.ambient?.current && state.ambient.current !== "none" && name !== "complete") {
    state.ambient.stop();
  }
  if (name === "complete") state.ambient.stop();

  const html = {
    home: homeHtml,
    setup: setupHtml,
    session: sessionHtml,
    complete: completeHtml,
    music: musicHtml,
    record: recordHtml,
  }[name]();

  for (const view of VIEWS) {
    const section = document.getElementById(`view-${view}`);
    const active = view === name;
    section.innerHTML = active ? html : "";
    section.hidden = !active;
    if (active) {
      section.classList.remove("is-enter");
      void section.offsetWidth;
      section.classList.add("is-enter");
    }
  }

  document.body.dataset.mode = name === "session" ? "session" : name === "complete" ? "complete" : "browse";
  document.body.dataset.running = state.timer?.running ? "yes" : "no";
  const titles = {
    home: "오늘의 숨",
    setup: "명상 준비 · 오늘의 숨",
    session: "명상 중 · 오늘의 숨",
    complete: "명상 완료 · 오늘의 숨",
    music: "명상 음악 · 오늘의 숨",
    record: "나의 기록 · 오늘의 숨",
  };
  document.title = titles[name];
  const navKey = name === "setup" || name === "session" || name === "complete" ? "meditate" : name === "music" ? "music" : name === "record" ? "record" : "home";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === navKey) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (name === "session") updateTimerFace();
}

function render() {
  const name = route();
  if (name === "session" && (!state.session || state.session.committed)) {
    history.replaceState(null, "", "#/meditate");
    renderView("setup");
    return;
  }
  if (name === "complete" && !loadLast()) {
    history.replaceState(null, "", "#/");
    renderView("home");
    return;
  }
  renderView(name);
}

function onHash() {
  if (sessionInProgress() && route() !== "session") {
    history.replaceState(null, "", "#/session");
    if (document.getElementById("modal").hidden) askEnd();
    return;
  }
  render();
}

function shiftMonth(delta) {
  const next = new Date(state.viewYear, state.viewMonth + delta, 1);
  const today = new Date();
  const max = new Date(today.getFullYear(), today.getMonth(), 1);
  if (next > max) return;
  state.viewYear = next.getFullYear();
  state.viewMonth = next.getMonth();
  render();
}

function syncPlayButtons() {
  document.querySelectorAll("[data-action='preview']").forEach((button) => {
    const on = state.ambient.current === button.dataset.music && state.ambient.isPlaying();
    button.setAttribute("aria-pressed", on ? "true" : "false");
    const label = button.querySelector("[data-play-label]");
    if (label) label.textContent = on ? "멈추기" : "들어보기";
  });
  state.audioBlocked = state.ambient.mode === "blocked";
  const note = document.getElementById("audio-note");
  if (note) note.hidden = !state.audioBlocked;
}

function onClick(event) {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  if (action === "duration") {
    const minutes = Number(el.dataset.value);
    if (!DURATIONS.includes(minutes)) return;
    state.draftDuration = minutes;
    remember();
    if (el.dataset.go === "setup") go("#/meditate");
    else render();
    return;
  }
  if (action === "pick-music") {
    state.draftMusic = el.dataset.music;
    remember();
    render();
    return;
  }
  if (action === "start") {
    startSession();
    return;
  }
  if (action === "toggle") {
    toggleTimer();
    return;
  }
  if (action === "end") {
    askEnd();
    return;
  }
  if (action === "end-cancel") {
    cancelEnd();
    return;
  }
  if (action === "end-confirm") {
    finish(false);
    return;
  }
  if (action === "resume-audio") {
    state.ambient.play(state.session?.music, state.data.preferences.volume);
    return;
  }
  if (action === "restart") {
    restartChallenge(state.data.records, state.data.challenge);
    persistData();
    render();
    return;
  }
  if (action === "preview") {
    const id = el.dataset.music;
    if (state.ambient.current === id && state.ambient.isPlaying()) state.ambient.stop();
    else state.ambient.play(id, state.data.preferences.volume);
    syncPlayButtons();
    return;
  }
  if (action === "month") {
    shiftMonth(Number(el.dataset.delta));
    return;
  }
  if (action === "today-month") {
    state.viewYear = now.getFullYear();
    state.viewMonth = now.getMonth();
    state.selectedDate = formatDate(new Date());
    render();
    return;
  }
  if (action === "day") {
    state.selectedDate = el.dataset.date;
    render();
  }
}

function onInput(event) {
  if (event.target.dataset.volume == null) return;
  const volume = Number(event.target.value) / 100;
  state.data.preferences.volume = volume;
  persistData();
  state.ambient.setVolume(volume);
}

function swapBackground(url) {
  if (!url || url === state.bgUrl) return;
  state.bgUrl = url;
  const next = state.shownBg === "a" ? "b" : "a";
  const enter = document.getElementById(`bg-${next}`);
  const leave = document.getElementById(`bg-${state.shownBg}`);
  enter.style.backgroundImage = `url("${url}")`;
  enter.classList.add("is-visible");
  leave.classList.remove("is-visible");
  state.shownBg = next;
}

function applyBackground() {
  const period = getPeriod();
  document.body.dataset.period = period.id;
  const local = new Image();
  local.onload = () => swapBackground(period.image);
  local.onerror = () => swapBackground(period.fallback);
  local.src = period.image;
}

function init() {
  state.draftDuration = DURATIONS.includes(state.data.preferences.duration)
    ? state.data.preferences.duration
    : 10;
  state.draftMusic = trackById(state.data.preferences.music) ? state.data.preferences.music : "forest";
  state.ambient = new Ambient();
  state.ambient.onChange = syncPlayButtons;
  restoreActive();
  applyBackground();
  setInterval(applyBackground, 60 * 1000);
  setInterval(() => {
    if (state.timer?.running) persistActive();
  }, 5000);
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  window.addEventListener("hashchange", onHash);
  window.addEventListener("beforeunload", persistActive);
  window.addEventListener("pagehide", persistActive);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("modal").hidden) cancelEnd();
  });
  render();
}

init();
