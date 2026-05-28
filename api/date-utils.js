export const APP_TIME_ZONE = "Asia/Shanghai";

export function getTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
