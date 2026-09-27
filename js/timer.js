export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function createCountdown(totalMs, { onTick, onDone }) {
  let remaining = Math.max(0, totalMs);
  let endAt = 0;
  let timerId = null;
  let running = false;
  let finished = false;

  function tick() {
    remaining = Math.max(0, endAt - Date.now());
    if (remaining <= 0) {
      remaining = 0;
      running = false;
      clearInterval(timerId);
      timerId = null;
      onTick(0, false);
      if (!finished) {
        finished = true;
        onDone();
      }
      return;
    }
    onTick(remaining, true);
  }

  return {
    start() {
      if (running || remaining <= 0) return;
      running = true;
      endAt = Date.now() + remaining;
      timerId = setInterval(tick, 200);
      tick();
    },
    pause() {
      if (!running) return;
      remaining = Math.max(0, endAt - Date.now());
      running = false;
      clearInterval(timerId);
      timerId = null;
      onTick(remaining, false);
    },
    get remaining() {
      if (running) return Math.max(0, endAt - Date.now());
      return remaining;
    },
    get running() {
      return running;
    },
  };
}
