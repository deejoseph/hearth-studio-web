const INITIAL = { students: 128, coaches: 12 };
const LIMITS = {
  students: { min: 118, max: 138 },
  coaches: { min: 9, max: 15 },
};

function step(value, key, random) {
  const { min, max } = LIMITS[key];
  let delta = [-2, -1, 1, 2][Math.floor(random() * 4)];
  if ((delta < 0 && value - min < 2) || (delta > 0 && max - value < 2)) delta *= -1;
  return value + delta;
}

export function nextPresence(current, random = Math.random) {
  return {
    students: step(current.students, 'students', random),
    coaches: step(current.coaches, 'coaches', random),
  };
}

export function mountCommunityPresence() {
  const students = document.getElementById('presence-students');
  const coaches = document.getElementById('presence-coaches');
  if (!students || !coaches) return () => {};
  let current = { ...INITIAL };
  const timer = window.setInterval(() => {
    current = nextPresence(current);
    students.textContent = String(current.students);
    coaches.textContent = String(current.coaches);
  }, 7000);
  return () => window.clearInterval(timer);
}
