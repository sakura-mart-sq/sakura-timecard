import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("App", () => {
  it("returns to a neutral screen after sign in", () => {
    localStorage.setItem("grocery-timecard-v1", JSON.stringify({
      staff: [{ id: "staff-a", name: "Aさん", wage: 20, code: "12345" }],
      shifts: [{ id: "shift-a", date: "2026-08-27", staffId: "staff-a", start: 600, end: 960 }],
      punches: [],
      storeName: "Sakura Mart",
      shiftNotes: {},
      adminPasscode: "1968",
      today: "2026-08-27",
    }));
    vi.setSystemTime(new Date("2026-08-27T17:00:00.000Z"));

    render(<App />);

    const staffCodeInput = screen.getByLabelText("Staff Code");
    staffCodeInput.focus();
    expect(staffCodeInput).toHaveFocus();
    fireEvent.change(staffCodeInput, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(staffCodeInput).not.toHaveFocus();
    expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull();
    expect(screen.getByText("Enter your staff code.")).toBeInTheDocument();
  });

  it("lets a manager add a manual punch for a missed shift", () => {
    localStorage.setItem("grocery-timecard-v1", JSON.stringify({
      staff: [{ id: "staff-a", name: "Aさん", wage: 20, code: "12345" }],
      shifts: [{ id: "shift-a", date: "2026-08-27", staffId: "staff-a", start: 600, end: 960 }],
      punches: [],
      storeName: "Sakura Mart",
      shiftNotes: {},
      adminPasscode: "1968",
      today: "2026-08-27",
    }));
    vi.setSystemTime(new Date("2026-08-28T17:00:00.000Z"));

    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Manager" })[0]);
    const passcodeDialog = screen.getByRole("dialog");
    fireEvent.change(within(passcodeDialog).getByLabelText("パスコード"), { target: { value: "1968" } });
    fireEvent.click(within(passcodeDialog).getByRole("button", { name: "開く" }));

    fireEvent.click(screen.getAllByRole("button", { name: "勤務記録を追加" })[0]);
    const punchDialog = screen.getByRole("dialog");
    fireEvent.change(within(punchDialog).getByLabelText("スタッフ"), { target: { value: "staff-a" } });
    const dateInputs = punchDialog.querySelectorAll('input[type="date"]');
    const timeInputs = punchDialog.querySelectorAll("select.time-select");
    fireEvent.change(dateInputs[0], { target: { value: "2026-08-27" } });
    fireEvent.change(timeInputs[0], { target: { value: "10:00" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-08-27" } });
    fireEvent.change(timeInputs[1], { target: { value: "16:00" } });
    const submitted = Object.fromEntries(new FormData(punchDialog.querySelector("form")).entries());
    expect(submitted).toEqual({
      staffId: "staff-a",
      startDate: "2026-08-27",
      startTime: "10:00",
      endDate: "2026-08-27",
      endTime: "16:00",
    });
    fireEvent.click(within(punchDialog).getByRole("button", { name: "追加" }));

    const punchList = document.getElementById("punchList");
    expect(punchList?.textContent).toContain("Aさん");
    expect(punchList?.textContent).toContain("2026-08-27 10:00");
    expect(punchList?.textContent).toContain("2026-08-27 16:00");
  });

  it("allows manager-approved help sign in for a staff member without a shift", () => {
    localStorage.setItem("grocery-timecard-v1", JSON.stringify({
      staff: [
        { id: "staff-a", name: "Aさん", wage: 20, code: "12345" },
        { id: "staff-b", name: "Bさん", wage: 21, code: "23456" },
        { id: "staff-c", name: "Cさん", wage: 22, code: "34567" },
      ],
      shifts: [
        { id: "shift-a", date: "2026-08-28", staffId: "staff-a", start: 600, end: 900 },
        { id: "shift-b", date: "2026-08-28", staffId: "staff-b", start: 660, end: 1140 },
      ],
      punches: [
        {
          id: "punch-a",
          staffId: "staff-a",
          shiftId: "shift-a",
          scheduledStaffId: "staff-a",
          startAt: "2026-08-28T17:00:00.000Z",
          endAt: null,
        },
        {
          id: "punch-b",
          staffId: "staff-b",
          shiftId: "shift-b",
          scheduledStaffId: "staff-b",
          startAt: "2026-08-28T18:00:00.000Z",
          endAt: null,
        },
      ],
      storeName: "Sakura Mart",
      shiftNotes: {},
      adminPasscode: "1968",
      today: "2026-08-28",
    }));
    vi.setSystemTime(new Date("2026-08-28T19:05:00.000Z"));

    render(<App />);

    fireEvent.change(screen.getByLabelText("Staff Code"), { target: { value: "34567" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("button", { name: "Manager-approved help sign in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manager-approved help sign in" }));

    const passcodeDialog = screen.getByRole("dialog");
    expect(passcodeDialog.textContent).toContain("Cさんを予定外ヘルプ勤務でサインインさせます。");
    fireEvent.change(within(passcodeDialog).getByLabelText("パスコード"), { target: { value: "1968" } });
    fireEvent.click(within(passcodeDialog).getByRole("button", { name: "許可してサインイン" }));

    expect(screen.getByText("Enter your staff code.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Manager" })[0]);
    const managerPasscodeDialog = screen.getByRole("dialog");
    fireEvent.change(within(managerPasscodeDialog).getByLabelText("パスコード"), { target: { value: "1968" } });
    fireEvent.click(within(managerPasscodeDialog).getByRole("button", { name: "開く" }));

    const punchList = document.getElementById("punchList");
    expect(punchList?.textContent).toContain("Cさん");
    expect(punchList?.textContent).toContain("2026-08-28 12:05");
    expect(punchList?.textContent).toContain("勤務中");
  });

  it("shows emergency help staff in Today's Shifts after manager-approved sign in", () => {
    localStorage.setItem("grocery-timecard-v1", JSON.stringify({
      staff: [
        { id: "staff-a", name: "Aさん", wage: 20, code: "12345" },
        { id: "staff-b", name: "Bさん", wage: 21, code: "23456" },
        { id: "staff-c", name: "Cさん", wage: 22, code: "34567" },
      ],
      shifts: [
        { id: "shift-a", date: "2026-08-28", staffId: "staff-a", start: 600, end: 900 },
        { id: "shift-b", date: "2026-08-28", staffId: "staff-b", start: 660, end: 1140 },
      ],
      punches: [
        {
          id: "punch-a",
          staffId: "staff-a",
          shiftId: "shift-a",
          scheduledStaffId: "staff-a",
          startAt: "2026-08-28T17:00:00.000Z",
          endAt: null,
        },
        {
          id: "punch-b",
          staffId: "staff-b",
          shiftId: "shift-b",
          scheduledStaffId: "staff-b",
          startAt: "2026-08-28T18:00:00.000Z",
          endAt: null,
        },
        {
          id: "punch-c",
          staffId: "staff-c",
          shiftId: "",
          scheduledStaffId: "staff-c",
          startAt: "2026-08-28T19:00:00.000Z",
          endAt: null,
        },
      ],
      storeName: "Sakura Mart",
      shiftNotes: {},
      adminPasscode: "1968",
      today: "2026-08-28",
    }));
    vi.setSystemTime(new Date("2026-08-28T19:05:00.000Z"));

    render(<App />);

    expect(screen.getByText("Today's Shifts")).toBeInTheDocument();
    expect(screen.getAllByText("Cさん").length).toBeGreaterThan(0);
    expect(screen.getByText("Cさん checked in")).toBeInTheDocument();
    expect(screen.getByText("Scheduled 12:00 - 12:15")).toBeInTheDocument();
    expect(screen.getByText("Actual 12:00 - 12:15")).toBeInTheDocument();
  });
});
