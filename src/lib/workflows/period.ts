const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type PeriodWindow = {
  periodKey: string;
  periodStartDate: string;
  periodEndDate: string;
  periodStartIso: string;
  periodEndIso: string;
};

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getCurrentPeriodKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function buildPeriodWindow(periodKey: string): PeriodWindow {
  if (!PERIOD_KEY_PATTERN.test(periodKey)) {
    throw new Error("Period key must be in YYYY-MM format");
  }

  const [yearString, monthString] = periodKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  return {
    periodKey,
    periodStartDate: toDateOnlyString(start),
    periodEndDate: toDateOnlyString(end),
    periodStartIso: `${toDateOnlyString(start)}T00:00:00Z`,
    periodEndIso: `${toDateOnlyString(end)}T23:59:59Z`,
  };
}
