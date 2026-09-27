export const PERIODS = {
  dawn: {
    id: "dawn",
    label: "새벽",
    title: "천천히 하루를 시작해 볼까요?",
    image: "assets/images/dawn.jpg",
    fallback:
      "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=2000&q=80",
  },
  morning: {
    id: "morning",
    label: "아침",
    title: "오늘의 첫 호흡에 집중해 보세요.",
    image: "assets/images/morning.jpg",
    fallback:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2000&q=80",
  },
  day: {
    id: "day",
    label: "낮",
    title: "잠시 멈추고 마음을 쉬어가세요.",
    image: "assets/images/day.jpg",
    fallback:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80",
  },
  evening: {
    id: "evening",
    label: "저녁",
    title: "오늘 하루를 천천히 내려놓아 보세요.",
    image: "assets/images/evening.jpg",
    fallback:
      "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?auto=format&fit=crop&w=2000&q=80",
  },
  night: {
    id: "night",
    label: "밤",
    title: "이제 몸과 마음을 쉬게 해주세요.",
    image: "assets/images/night.jpg",
    fallback:
      "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=2000&q=80",
  },
};

export function getPeriod(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 5 * 60 && minutes < 8 * 60) return PERIODS.dawn;
  if (minutes >= 8 * 60 && minutes < 12 * 60) return PERIODS.morning;
  if (minutes >= 12 * 60 && minutes < 18 * 60) return PERIODS.day;
  if (minutes >= 18 * 60 && minutes < 21 * 60) return PERIODS.evening;
  return PERIODS.night;
}
