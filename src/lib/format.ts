/** Formats seconds as m:ss or h:mm:ss (e.g. 212 → "3:32"). */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--';
  const seconds = Math.floor(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "12 videos · 48 min" style summary for a list of durations. */
export function summarizeDurations(durations: (number | undefined)[]): string {
  const count = durations.length;
  const label = `${count} ${count === 1 ? 'video' : 'videos'}`;
  const known = durations.filter((d): d is number => typeof d === 'number' && d > 0);
  if (known.length === 0) return label;
  const total = known.reduce((sum, d) => sum + d, 0);
  const minutes = Math.round(total / 60);
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return `${label} · ${known.length < count ? '~' : ''}${time}`;
}
