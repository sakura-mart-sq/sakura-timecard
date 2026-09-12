import {
  DEFAULT_ADMIN_PASSCODE,
  DEFAULT_STORE_NAME,
} from "./constants.js";
import {
  dateKey,
  dateTimeFromDateKeyAndMinutes,
  dateTimeFromFields,
  dateToMinutes,
  minutesToTime,
  timeLabel,
} from "./time.js";

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function generateStaffCode(used = new Set()) {
  let code = "";
  do {
    code = String(Math.floor(10000 + Math.random() * 90000));
  } while (used.has(code));
  return code;
}

export function staffWithCodes(staff) {
  const used = new Set(staff.map((person) => person.code).filter(Boolean));
  return staff.map((person) => {
    if (person.code) return person;
    const code = generateStaffCode(used);
    used.add(code);
    return { ...person, code };
  });
}

export function createDefaultState(today = dateKey(new Date())) {
  return {
    staff: staffWithCodes([
      { id: newId(), name: "Aさん", wage: 18.25 },
      { id: newId(), name: "Bさん", wage: 18.25 },
      { id: newId(), name: "Cさん", wage: 19.0 },
    ]),
    shifts: [],
    punches: [],
    storeName: DEFAULT_STORE_NAME,
    shiftNotes: {},
    adminPasscode: DEFAULT_ADMIN_PASSCODE,
    today,
  };
}

export function normalizeState(raw) {
  return {
    ...createDefaultState(),
    ...raw,
    staff: staffWithCodes(raw.staff || []),
    shifts: Array.isArray(raw.shifts) ? raw.shifts : [],
    punches: Array.isArray(raw.punches) ? raw.punches : [],
    shiftNotes: raw.shiftNotes || {},
    storeName: raw.storeName || DEFAULT_STORE_NAME,
    adminPasscode: raw.adminPasscode || DEFAULT_ADMIN_PASSCODE,
  };
}

export function staffName(state, id) {
  return state.staff.find((person) => person.id === id)?.name || "未登録";
}

export function openPunchFor(state, staffId) {
  return state.punches.find((punch) => punch.staffId === staffId && !punch.endAt);
}

export function shiftPunch(state, shiftOrId) {
  const shift = typeof shiftOrId === "string"
    ? state.shifts.find((item) => item.id === shiftOrId)
    : shiftOrId;
  if (!shift) return undefined;

  const exact = state.punches.find((punch) => punch.shiftId === shift.id);
  if (exact) return exact;

  const candidates = state.punches.filter((punch) => {
    const scheduledStaffId = punch.scheduledStaffId || punch.staffId;
    const pointsToKnownShift = punch.shiftId && state.shifts.some((item) => item.id === punch.shiftId);
    if (pointsToKnownShift && punch.shiftId !== shift.id) return false;
    if (scheduledStaffId !== shift.staffId || !punch.startAt) return false;
    const started = new Date(punch.startAt);
    if (Number.isNaN(started.getTime()) || dateKey(started) !== shift.date) return false;
    return true;
  });

  const overlaps = candidates.filter((punch) => {
    const start = dateToMinutes(new Date(punch.startAt));
    const end = punch.endAt ? dateToMinutes(new Date(punch.endAt)) : start + 15;
    return end > shift.start && start < shift.end;
  });

  const matched = overlaps[0] || candidates
    .sort((a, b) => Math.abs(dateToMinutes(new Date(a.startAt)) - shift.start)
      - Math.abs(dateToMinutes(new Date(b.startAt)) - shift.start))[0];

  if (matched) return { ...matched, shiftId: shift.id };
  return undefined;
}

export function todaysShifts(state, now = new Date()) {
  return state.shifts
    .filter((shift) => shift.date === dateKey(now))
    .sort((a, b) => a.start - b.start);
}

export function todaysTimelineShifts(state, now = new Date()) {
  const today = dateKey(now);
  const scheduled = todaysShifts(state, now);
  const unscheduled = state.punches
    .filter((punch) => {
      if (punch.shiftId || !punch.startAt) return false;
      const started = new Date(punch.startAt);
      if (Number.isNaN(started.getTime()) || dateKey(started) !== today) return false;
      return !scheduled.some((shift) => shift.staffId === punch.staffId);
    })
    .map((punch) => {
      const actual = actualShiftTimes(punch, now);
      return {
        id: `unscheduled-${punch.id}`,
        date: today,
        staffId: punch.staffId,
        start: actual.start,
        end: actual.end,
      };
    });

  return [...scheduled, ...unscheduled].sort((a, b) => a.start - b.start);
}

export function signinChoicesForStaff(state, staffId, now = new Date()) {
  const today = todaysShifts(state, now);
  return {
    own: today.filter((shift) => shift.staffId === staffId && !shiftPunch(state, shift)),
    swaps: today.filter((shift) => shift.staffId !== staffId && !shiftPunch(state, shift)),
  };
}

export function actualShiftTimes(punch, now = new Date()) {
  const start = dateToMinutes(new Date(punch.startAt));
  const end = punch.endAt ? dateToMinutes(new Date(punch.endAt)) : dateToMinutes(now);
  return { start, end: Math.max(end, start + 15) };
}

export function shiftCoverageLabel(state, shift, punch, locale = "ja") {
  if (locale === "en") {
    if (!punch) return `${staffName(state, shift.staffId)}'s scheduled shift`;
    if (punch.staffId === shift.staffId) return `${staffName(state, shift.staffId)} checked in`;
    return `${staffName(state, punch.staffId)} covered this shift`;
  }
  if (!punch) return `${staffName(state, shift.staffId)}さんの予定シフト`;
  if (punch.staffId === shift.staffId) return `${staffName(state, shift.staffId)}さん本人が入りました`;
  return `${staffName(state, punch.staffId)}さんが代わりに入りました`;
}

export function shiftStatusLabel(punch, locale = "ja") {
  if (locale === "en") return punch ? (punch.endAt ? "Done" : "Working") : "Scheduled";
  return punch ? (punch.endAt ? "完了" : "勤務中") : "予定";
}

export function timelineBounds(state, shifts, includeActual = false, now = new Date()) {
  const starts = shifts.map((shift) => shift.start);
  const ends = shifts.map((shift) => shift.end);
  if (includeActual) {
    shifts.forEach((shift) => {
      const punch = shiftPunch(state, shift);
      if (!punch) return;
      const actual = actualShiftTimes(punch, now);
      starts.push(actual.start);
      ends.push(actual.end);
    });
  }
  return {
    start: Math.min(8 * 60, ...starts),
    end: Math.max(22 * 60, ...ends),
  };
}

export function compactShiftStyle(item) {
  const startBound = 8 * 60;
  const endBound = 20 * 60;
  const total = endBound - startBound;
  const start = Math.max(0, Math.min(total, item.start - startBound));
  const end = Math.max(0, Math.min(total, (item.end || item.start + 15) - startBound));
  const width = Math.max(2, end - start);
  return {
    left: `${(start / total) * 100}%`,
    width: `${(width / total) * 100}%`,
  };
}

export function timelineStyle(shift, bounds) {
  const total = Math.max(15, bounds.end - bounds.start);
  const end = shift.end || shift.start + 15;
  const visibleStart = Math.max(bounds.start, shift.start);
  const visibleEnd = Math.min(bounds.end, Math.max(end, shift.start + 15));
  const start = Math.min(100, Math.max(0, ((visibleStart - bounds.start) / total) * 100));
  const width = Math.max(2, ((visibleEnd - visibleStart) / total) * 100);
  return {
    left: `${start}%`,
    width: `${Math.min(width, 100 - start)}%`,
  };
}

export function displayShiftTimes(punch, shift) {
  if (!punch) return { start: shift.start, end: shift.end };
  const start = dateToMinutes(new Date(punch.startAt));
  const end = punch.endAt ? dateToMinutes(new Date(punch.endAt)) : null;
  return { start, end };
}

function minutePrecision(date) {
  const result = new Date(date);
  result.setSeconds(0, 0);
  return result;
}

export function applyClockIn(state, staffId, shiftId, now = new Date()) {
  if (!staffId || openPunchFor(state, staffId)) return state;
  const shift = state.shifts.find((item) => item.id === shiftId);
  if (!shift || shiftPunch(state, shift)) return state;
  const startAt = minutePrecision(now);
  return {
    ...state,
    punches: [
      ...state.punches,
      {
        id: newId(),
        staffId,
        shiftId,
        scheduledStaffId: shift.staffId || staffId,
        startAt: startAt.toISOString(),
        endAt: null,
      },
    ],
  };
}

export function applyEmergencyClockIn(state, staffId, now = new Date()) {
  if (!staffId || openPunchFor(state, staffId)) return state;
  const person = state.staff.find((item) => item.id === staffId);
  if (!person) return state;
  const startAt = minutePrecision(now);
  return {
    ...state,
    punches: [
      ...state.punches,
      {
        id: newId(),
        staffId,
        shiftId: "",
        scheduledStaffId: staffId,
        startAt: startAt.toISOString(),
        endAt: null,
      },
    ],
  };
}

export function applyClockOut(state, staffId, now = new Date()) {
  const active = openPunchFor(state, staffId);
  if (!active) return state;
  return {
    ...state,
    punches: state.punches.map((punch) => (
      punch.id === active.id
        ? { ...punch, endAt: minutePrecision(now).toISOString() }
        : punch
    )),
  };
}

export function upsertStaff(state, staffInput) {
  const { id, name, wage, code } = staffInput;
  const duplicate = state.staff.find((person) => person.code === code && person.id !== id);
  if (duplicate) {
    return { state, error: "このスタッフコードは既に使われています。" };
  }

  if (id) {
    return {
      state: {
        ...state,
        staff: state.staff.map((person) => (
          person.id === id ? { ...person, name, wage, code } : person
        )),
      },
    };
  }

  return {
    state: {
      ...state,
      staff: [...state.staff, { id: newId(), name, wage, code }],
    },
  };
}

export function deleteStaffRecord(state, staffId) {
  const hasRecords = state.shifts.some((shift) => shift.staffId === staffId)
    || state.punches.some((punch) => punch.staffId === staffId || punch.scheduledStaffId === staffId);
  if (hasRecords) {
    return {
      state,
      error: "このスタッフにはシフトまたは勤務記録があるため削除できません。名前や時給は編集できます。",
    };
  }
  return {
    state: {
      ...state,
      staff: state.staff.filter((person) => person.id !== staffId),
    },
  };
}

export function upsertShift(state, shiftInput) {
  const nextShift = {
    id: shiftInput.id || newId(),
    date: shiftInput.date,
    staffId: shiftInput.staffId,
    start: shiftInput.start,
    end: shiftInput.end,
  };

  if (shiftInput.id) {
    return {
      ...state,
      shifts: state.shifts.map((shift) => (shift.id === shiftInput.id ? nextShift : shift)),
    };
  }

  return {
    ...state,
    shifts: [...state.shifts, nextShift],
  };
}

export function updatePunchRecord(state, punchId, startDate, startTime, endDate, endTime, payrollFromActualStart = false) {
  const start = dateTimeFromFields(startDate, startTime);
  if (!start) return { state, error: "開始日時が正しくありません。" };
  const hasPartialEnd = (endDate && !endTime) || (!endDate && endTime);
  if (hasPartialEnd) return { state, error: "終了日時は日付と時刻を両方入力してください。" };
  const end = endDate && endTime ? dateTimeFromFields(endDate, endTime) : null;
  if (end && end <= start) return { state, error: "終了時刻は開始時刻より後にしてください。" };

  return {
    state: {
      ...state,
      punches: state.punches.map((punch) => (
        punch.id === punchId
          ? {
            ...punch,
            startAt: start.toISOString(),
            endAt: end ? end.toISOString() : null,
            payrollFromActualStart,
          }
          : punch
      )),
    },
  };
}

export function createPunchRecord(state, staffId, startDate, startTime, endDate, endTime, payrollFromActualStart = false) {
  const person = state.staff.find((item) => item.id === staffId);
  if (!person) return { state, error: "スタッフを選択してください。" };

  const start = dateTimeFromFields(startDate, startTime);
  if (!start) return { state, error: "開始日時が正しくありません。" };
  const hasPartialEnd = (endDate && !endTime) || (!endDate && endTime);
  if (hasPartialEnd) return { state, error: "終了日時は日付と時刻を両方入力してください。" };
  const end = endDate && endTime ? dateTimeFromFields(endDate, endTime) : null;
  if (end && end <= start) return { state, error: "終了時刻は開始時刻より後にしてください。" };

  const startMinutes = dateToMinutes(start);
  const endMinutes = end ? dateToMinutes(end) : startMinutes + 15;
  const matchingShift = state.shifts.find((shift) => (
    shift.staffId === staffId
    && shift.date === startDate
    && endMinutes > shift.start
    && startMinutes < shift.end
  ));

  if (matchingShift && shiftPunch(state, matchingShift)) {
    return { state, error: "このシフトには既に勤務記録があります。既存の記録を修正してください。" };
  }

  const nextPunch = {
    id: newId(),
    staffId,
    shiftId: matchingShift?.id || "",
    scheduledStaffId: matchingShift?.staffId || staffId,
    startAt: start.toISOString(),
    endAt: end ? end.toISOString() : null,
    payrollFromActualStart,
  };

  return {
    state: {
      ...state,
      punches: [...state.punches, nextPunch],
    },
  };
}

function scheduledShiftForPunch(state, punch, started) {
  const scheduledStaffId = punch.scheduledStaffId || punch.staffId;
  const candidates = state.shifts.filter((shift) => (
    shift.date === dateKey(started) && shift.staffId === scheduledStaffId
  ));
  if (punch.shiftId) {
    const exact = candidates.find((shift) => shift.id === punch.shiftId);
    if (exact) return exact;
  }
  return candidates.sort((a, b) => Math.abs(a.start - dateToMinutes(started)) - Math.abs(b.start - dateToMinutes(started)))[0];
}

export function paidMinutes(state, punch) {
  if (!punch.endAt) return 0;
  const started = new Date(punch.startAt);
  const ended = new Date(punch.endAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return 0;
  let paidStart = started;
  if (!punch.payrollFromActualStart) {
    const shift = scheduledShiftForPunch(state, punch, started);
    if (shift) {
      const scheduledStart = dateTimeFromDateKeyAndMinutes(shift.date, shift.start);
      if (scheduledStart > paidStart) paidStart = scheduledStart;
    }
  }
  return Math.max(0, (ended - paidStart) / 60000);
}

export function updateShiftNote(state, date, value) {
  return {
    ...state,
    shiftNotes: {
      ...state.shiftNotes,
      [date]: value,
    },
  };
}

export function updateStoreSettings(state, storeName) {
  return { ...state, storeName };
}

export function updateAdminPasscode(state, adminPasscode) {
  return { ...state, adminPasscode };
}

export function payrollRows(state, startDate, endDate, staffId = "all") {
  const start = dateTimeFromFields(startDate, "00:00");
  const end = dateTimeFromFields(endDate, "23:59");
  return state.staff
    .filter((person) => staffId === "all" || person.id === staffId)
    .map((person) => {
      const punches = state.punches.filter((punch) => {
        if (!punch.endAt || punch.staffId !== person.id) return false;
        const punchStart = new Date(punch.startAt);
        return punchStart >= start && punchStart <= end;
      });
      const minutes = punches.reduce((sum, punch) => sum + paidMinutes(state, punch), 0);
      const hours = minutes / 60;
      return { person, hours, pay: hours * Number(person.wage) };
    });
}

export function punchRows(state, startDate, endDate, staffId = "all") {
  const start = dateTimeFromFields(startDate, "00:00");
  const end = dateTimeFromFields(endDate, "23:59");
  return state.punches
    .filter((punch) => {
      if (staffId !== "all" && punch.staffId !== staffId) return false;
      const punchStart = new Date(punch.startAt);
      return punchStart >= start && punchStart <= end;
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .map((punch) => {
      const started = new Date(punch.startAt);
      const ended = punch.endAt ? new Date(punch.endAt) : null;
      const minutes = ended ? paidMinutes(state, punch) : 0;
      const person = state.staff.find((item) => item.id === punch.staffId);
      return {
        date: dateKey(started),
        staff: staffName(state, punch.staffId),
        staffCode: person?.code || "",
        scheduled: staffName(state, punch.scheduledStaffId),
        swapped: punch.scheduledStaffId !== punch.staffId ? "Yes" : "No",
        start: timeLabel(started),
        end: ended ? timeLabel(ended) : "",
        hours: minutes / 60,
        wage: Number(person?.wage || 0),
        pay: (minutes / 60) * Number(person?.wage || 0),
      };
    });
}

export function recentPunches(state) {
  return [...state.punches]
    .sort((a, b) => {
      if (!a.endAt && b.endAt) return -1;
      if (a.endAt && !b.endAt) return 1;
      return new Date(b.startAt) - new Date(a.startAt);
    })
    .slice(0, 30);
}

export function buildBackup(state) {
  return {
    app: "sakura-mart-timecard",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

export function restoreBackupPayload(payload) {
  const data = payload.data || payload;
  if (!Array.isArray(data.staff) || !Array.isArray(data.shifts) || !Array.isArray(data.punches)) {
    throw new Error("Invalid backup");
  }
  return normalizeState(data);
}

export function exportStaffSuffix(state, staffId) {
  if (staffId === "all") return "all-staff";
  return staffName(state, staffId)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]/g, "");
}

export function reportTable(headers, rows) {
  if (!rows.length) return "<p>データはありません。</p>";
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

export function displayShiftLabel(shift) {
  return `${minutesToTime(shift.start)} - ${minutesToTime(shift.end)}`;
}

export function startAndEndFromShift(shift) {
  return {
    start: dateTimeFromDateKeyAndMinutes(shift.date, shift.start),
    end: dateTimeFromDateKeyAndMinutes(shift.date, shift.end),
  };
}
