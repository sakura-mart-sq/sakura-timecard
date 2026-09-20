import { TIME_ZONE } from "./constants.js";

export const formatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: TIME_ZONE,
});

export const staffFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: TIME_ZONE,
});

export const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

const zonedPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

const zoneOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "shortOffset",
});

export function zonedParts(date) {
  return zonedPartsFormatter.formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
}

export function dateKey(date) {
  const parts = zonedParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function dateKeyFromUtcDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function plainDateToUtcDate(value) {
  const { year, month, day } = parseDateKey(value);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(dateValue, days) {
  const next = plainDateToUtcDate(dateValue);
  next.setUTCDate(next.getUTCDate() + days);
  return dateKeyFromUtcDate(next);
}

export function mondayOf(dateValue) {
  const monday = plainDateToUtcDate(dateValue);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return dateKeyFromUtcDate(monday);
}

export function weekDates(startDate) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

export function minutesToTime(total) {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getTimeZoneOffsetMinutes(date) {
  const label = zoneOffsetFormatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = label.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

export function dateTimeFromFields(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const { year, month, day } = parseDateKey(dateValue);
  const [hours, minutes] = timeValue.split(":").map(Number);
  let utcMillis = Date.UTC(year, month - 1, day, hours, minutes, 0);
  for (let index = 0; index < 2; index += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(utcMillis));
    const corrected = Date.UTC(year, month - 1, day, hours, minutes, 0) - offset * 60000;
    if (corrected === utcMillis) break;
    utcMillis = corrected;
  }
  const result = new Date(utcMillis);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function dateTimeFromDateKeyAndMinutes(dateValue, minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return dateTimeFromFields(dateValue, `${hours}:${mins}`);
}

export function dateToMinutes(date) {
  const parts = zonedParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function roundToQuarter(date) {
  const minutes = dateToMinutes(date);
  const quarter = Math.round(minutes / 15) * 15;
  const dayOffset = Math.floor(quarter / (24 * 60));
  const normalized = ((quarter % (24 * 60)) + (24 * 60)) % (24 * 60);
  const roundedDateKey = addDays(dateKey(date), dayOffset);
  return dateTimeFromDateKeyAndMinutes(roundedDateKey, normalized);
}

export function timeLabel(date) {
  return timeFormatter.format(date);
}

export function dateTimeLabel(date) {
  return `${dateKey(date)} ${timeLabel(date)}`;
}

export function weekDayLabel(date, locale = "ja") {
  const value = typeof date === "string" ? plainDateToUtcDate(date) : date;
  if (locale === "en") {
    return value.toLocaleDateString("en-US", {
      weekday: "short",
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  const names = ["日", "月", "火", "水", "木", "金", "土"];
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()} (${names[value.getUTCDay()]})`;
}

export function shortDateLabel(date) {
  const value = typeof date === "string" ? plainDateToUtcDate(date) : date;
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()}`;
}
