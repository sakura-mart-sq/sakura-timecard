import { describe, expect, it } from "vitest";
import {
  applyClockIn,
  applyClockOut,
  applyEmergencyClockIn,
  createPunchRecord,
  createDefaultState,
  payrollRows,
  paidMinutes,
  recentPunches,
  shiftPunch,
  signinChoicesForStaff,
  todaysTimelineShifts,
  updatePunchRecord,
} from "./model.js";

function buildState() {
  return {
    ...createDefaultState("2026-08-27"),
    staff: [
      { id: "staff-a", name: "Aさん", wage: 20, code: "12345" },
      { id: "staff-b", name: "Bさん", wage: 21, code: "23456" },
      { id: "staff-c", name: "Cさん", wage: 22, code: "34567" },
    ],
    shifts: [
      { id: "shift-a", date: "2026-08-27", staffId: "staff-a", start: 10 * 60, end: 16 * 60 },
      { id: "shift-b", date: "2026-08-27", staffId: "staff-b", start: 12 * 60, end: 18 * 60 },
    ],
    punches: [],
  };
}

describe("model helpers", () => {
  it("offers only today's unsatisfied shifts for sign in", () => {
    const state = buildState();
    const choices = signinChoicesForStaff(state, "staff-a", new Date("2026-08-27T17:00:00.000Z"));
    expect(choices.own).toHaveLength(1);
    expect(choices.own[0].id).toBe("shift-a");
    expect(choices.swaps).toHaveLength(1);
  });

  it("includes emergency help in today's timeline", () => {
    const state = buildState();
    state.punches.push({
      id: "emergency-c",
      staffId: "staff-c",
      shiftId: "",
      scheduledStaffId: "staff-c",
      startAt: "2026-08-27T19:02:00.000Z",
      endAt: null,
    });
    const timeline = todaysTimelineShifts(state, new Date("2026-08-27T19:05:00.000Z"));
    expect(timeline.map((item) => item.staffId)).toEqual(["staff-a", "staff-b", "staff-c"]);
    expect(timeline[2]).toMatchObject({
      staffId: "staff-c",
      date: "2026-08-27",
      start: 12 * 60 + 2,
      end: 12 * 60 + 17,
    });
  });

  it("records sign in and sign out timestamps", () => {
    const signedIn = applyClockIn(buildState(), "staff-a", "shift-a", new Date("2026-08-27T17:02:41.250Z"));
    expect(signedIn.punches).toHaveLength(1);
    expect(signedIn.punches[0].startAt).toBe("2026-08-27T17:02:00.000Z");

    const signedOut = applyClockOut(signedIn, "staff-a", new Date("2026-08-27T21:03:59.750Z"));
    expect(signedOut.punches[0].endAt).toBe("2026-08-27T21:03:00.000Z");
  });

  it("allows manager-approved emergency help sign in without a scheduled shift", () => {
    const emergency = applyEmergencyClockIn(buildState(), "staff-c", new Date("2026-08-27T19:02:00.000Z"));
    expect(emergency.punches).toHaveLength(1);
    expect(emergency.punches[0]).toMatchObject({
      staffId: "staff-c",
      shiftId: "",
      scheduledStaffId: "staff-c",
      startAt: "2026-08-27T19:02:00.000Z",
      endAt: null,
    });
  });

  it("matches older punches back to the scheduled shift", () => {
    const state = buildState();
    state.punches.push({
      id: "punch-a",
      staffId: "staff-a",
      shiftId: "",
      scheduledStaffId: "staff-a",
      startAt: "2026-08-27T17:00:00.000Z",
      endAt: null,
    });
    expect(shiftPunch(state, state.shifts[0])?.id).toBe("punch-a");
  });

  it("updates edited punches and includes them in payroll", () => {
    const signedIn = applyClockIn(buildState(), "staff-a", "shift-a", new Date("2026-08-27T17:02:00.000Z"));
    const edited = updatePunchRecord(signedIn, signedIn.punches[0].id, "2026-08-27", "10:00", "2026-08-27", "16:00");
    expect(edited.error).toBeUndefined();
    const payroll = payrollRows(edited.state, "2026-08-27", "2026-08-27", "staff-a");
    expect(payroll[0].hours).toBe(6);
    expect(payroll[0].pay).toBe(120);
  });

  it("starts ordinary early arrivals at the scheduled shift time for payroll", () => {
    const state = buildState();
    state.punches.push({
      id: "early",
      staffId: "staff-a",
      shiftId: "shift-a",
      scheduledStaffId: "staff-a",
      startAt: "2026-08-27T16:50:00.000Z",
      endAt: "2026-08-27T23:05:00.000Z",
    });
    expect(paidMinutes(state, state.punches[0])).toBe(365);
  });

  it("counts an approved early arrival from its actual punch time", () => {
    const state = buildState();
    state.punches.push({
      id: "approved-early",
      staffId: "staff-a",
      shiftId: "shift-a",
      scheduledStaffId: "staff-a",
      startAt: "2026-08-27T16:50:00.000Z",
      endAt: "2026-08-27T23:05:00.000Z",
      payrollFromActualStart: true,
    });
    expect(paidMinutes(state, state.punches[0])).toBe(375);
  });

  it("shows active punches first in manager lists", () => {
    const state = buildState();
    state.punches = [
      {
        id: "done",
        staffId: "staff-b",
        shiftId: "shift-b",
        scheduledStaffId: "staff-b",
        startAt: "2026-08-27T19:00:00.000Z",
        endAt: "2026-08-27T23:00:00.000Z",
      },
      {
        id: "active",
        staffId: "staff-a",
        shiftId: "shift-a",
        scheduledStaffId: "staff-a",
        startAt: "2026-08-27T17:00:00.000Z",
        endAt: null,
      },
    ];
    expect(recentPunches(state).map((item) => item.id)).toEqual(["active", "done"]);
  });

  it("allows a manager to create a manual punch for a missed shift", () => {
    const result = createPunchRecord(buildState(), "staff-a", "2026-08-27", "10:00", "2026-08-27", "16:00");
    expect(result.error).toBeUndefined();
    expect(result.state.punches).toHaveLength(1);
    expect(result.state.punches[0].shiftId).toBe("shift-a");
    expect(result.state.punches[0].scheduledStaffId).toBe("staff-a");
  });

  it("prevents duplicate manual punches for the same scheduled shift", () => {
    const state = buildState();
    state.punches.push({
      id: "existing",
      staffId: "staff-a",
      shiftId: "shift-a",
      scheduledStaffId: "staff-a",
      startAt: "2026-08-27T17:00:00.000Z",
      endAt: "2026-08-27T23:00:00.000Z",
    });
    const result = createPunchRecord(state, "staff-a", "2026-08-27", "10:00", "2026-08-27", "16:00");
    expect(result.error).toBe("このシフトには既に勤務記録があります。既存の記録を修正してください。");
  });
});
