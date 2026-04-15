export function parseClockToSeconds(clock: string) {
  const match = /^(?<minutes>\d{1,2}):(?<seconds>\d{2})$/.exec(clock);

  if (!match?.groups) {
    throw new Error(`Invalid clock value: ${clock}`);
  }

  const minutes = Number(match.groups.minutes);
  const seconds = Number(match.groups.seconds);

  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) {
    throw new Error(`Invalid clock value: ${clock}`);
  }

  return minutes * 60 + seconds;
}

export function formatClock(clockSeconds: number) {
  const safeSeconds = Math.max(0, Math.min(900, Math.trunc(clockSeconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
