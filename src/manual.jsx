import React from "react";
import ReactDOM from "react-dom/client";
import { Dialog, OnlineManagerPanel, OnlineStaffPanel, OnlineTerminalPanel, TimeSelect } from "./App.jsx";
import { APP_VERSION } from "./lib/constants.js";
import "../styles.css";

const noop = () => {};
const prevent = (event) => event?.preventDefault?.();

const staff = [
  { id: "staff-alex", name: "Alex", wage: 18.5, active: true, email: "alex@example.com", code: "18426" },
  { id: "staff-maya", name: "Maya", wage: 19, active: true, email: "maya@example.com", code: "52731" },
  { id: "staff-jordan", name: "Jordan", wage: 20, active: true, email: "jordan@example.com", code: "90345" },
];

const shifts = [
  { id: "shift-1", date: "2026-09-14", staffId: "staff-alex", start: 540, end: 900, note: "Delivery", status: "published" },
  { id: "shift-2", date: "2026-09-14", staffId: "staff-maya", start: 660, end: 1140, note: "", status: "published" },
  { id: "shift-3", date: "2026-09-15", staffId: "staff-jordan", start: 480, end: 780, note: "", status: "published" },
  { id: "shift-4", date: "2026-09-16", staffId: "staff-alex", start: 720, end: 1200, note: "Market event", status: "published" },
  { id: "shift-5", date: "2026-09-17", staffId: "staff-maya", start: 540, end: 1020, note: "", status: "draft" },
  { id: "shift-6", date: "2026-09-18", staffId: "staff-jordan", start: 600, end: 1080, note: "", status: "published" },
  { id: "shift-7", date: "2026-09-19", staffId: "staff-alex", start: 600, end: 960, note: "", status: "published" },
];

const managerData = {
  staff,
  shifts,
  punches: [
    { id: "punch-1", staffId: "staff-alex", shiftId: "shift-1", scheduledStaffId: "staff-alex", startAt: "2026-09-14T16:00:00.000Z", endAt: "2026-09-14T22:04:00.000Z", payrollFromActualStart: false },
    { id: "punch-2", staffId: "staff-maya", shiftId: "shift-2", scheduledStaffId: "staff-maya", startAt: "2026-09-14T18:02:00.000Z", endAt: "2026-09-15T02:58:00.000Z", payrollFromActualStart: false },
  ],
  payrolls: [],
  shiftRequests: [
    { id: "request-1", staffId: "staff-maya", date: "2026-09-19", start: 540, end: 900, note: "Available in the morning", status: "submitted" },
  ],
  shiftSwaps: [
    { id: "swap-1", fromStaffId: "staff-alex", acceptedBy: "staff-jordan", date: "2026-09-20", start: 600, end: 960, note: "Appointment", status: "accepted" },
  ],
  settings: { store_name: "Sakura Mart", admin_passcode: "1968" },
  weekStart: "2026-09-14",
  weekEnd: "2026-09-20",
  loadedAt: new Date("2026-09-16T10:30:00-07:00"),
};

const staffData = {
  person: staff[0],
  shifts: shifts.filter((shift) => shift.staffId === "staff-alex" && shift.status === "published"),
  payrolls: [{ id: "payroll-1", period_start: "2026-09-01", period_end: "2026-09-15", total_minutes: 4080, total_pay: 1258.0, status: "published" }],
  shiftRequests: [{ id: "request-2", staffId: "staff-alex", date: "2026-09-20", start: 600, end: 960, note: "", status: "submitted" }],
  shiftSwaps: [{ id: "swap-2", fromStaffId: "staff-maya", acceptedBy: null, date: "2026-09-18", start: 600, end: 1080, note: "Class schedule", status: "open" }],
  weekStart: "2026-09-14",
  weekEnd: "2026-09-20",
};

const terminalData = {
  staff,
  shifts: [shifts[0]],
  punches: [],
  date: "2026-09-14",
};

const sharedManagerProps = {
  data: managerData,
  error: "",
  loading: false,
  onAddPunch: noop,
  onAddShift: noop,
  onAddStaff: noop,
  onDeleteStaff: noop,
  onEditPunch: noop,
  onEditShift: noop,
  onEditStaff: noop,
  onNextWeek: noop,
  onPreviousWeek: noop,
  onRefresh: noop,
  onCalculatePayroll: prevent,
  onSavePayroll: noop,
  onExportPayroll: noop,
  onExportPayrollPdf: noop,
  onExportBackup: noop,
  onImportBackup: noop,
  onSaveSettings: prevent,
  onChangePassword: prevent,
  onUpdateRequest: noop,
  onToggleAllSwaps: noop,
  showAllSwaps: false,
  payrollResult: [
    { person: staff[0], hours: 68, pay: 1258.0 },
    { person: staff[1], hours: 72.5, pay: 1377.5 },
    { person: staff[2], hours: 61.25, pay: 1225.0 },
  ],
};

function Frame({ children, language = "ja", account }) {
  return <div className="app-shell manual-capture">
    <header className="topbar">
      <div><h1>Sakura Mart</h1><p>{language === "ja" ? "2026年9月16日（水）" : "Wednesday, September 16, 2026"}</p></div>
    </header>
    {account ? <div className="online-bar"><span>{account}</span><div className="account-menu"><button aria-label="Account menu" className="ghost account-menu-button" type="button">☰</button></div></div> : null}
    {children}
    <footer className="footer">Version {APP_VERSION}</footer>
  </div>;
}

function StaffFrame({ children }) {
  return <Frame language="en" account="Hello, Alex (alex@example.com)">
    <OnlineStaffPanel {...{
      data: staffData, error: "", loading: false, onNextWeek: noop, onPreviousWeek: noop,
      onRefresh: noop, onRequest: noop, onWithdrawRequest: noop, onRequestSwap: noop,
      onCancelSwap: noop, onAcceptSwap: noop, staffId: "staff-alex",
    }} />
    {children}
  </Frame>;
}

function ShiftRequestDialog() {
  return <Dialog onClose={noop}>
    <form className="dialog-panel" onSubmit={prevent}>
      <h2>Submit a Shift Request</h2>
      <p className="note">Your request will be reviewed by the manager.</p>
      <label className="field"><span>Date</span><input defaultValue="2026-09-20" name="date" required type="date" /></label>
      <label className="field"><span>Start</span><TimeSelect name="start" onChange={noop} value="10:00" /></label>
      <label className="field"><span>End</span><TimeSelect name="end" onChange={noop} value="16:00" /></label>
      <label className="field"><span>Note</span><input defaultValue="Available for an extra shift" name="note" /></label>
      <div className="dialog-actions"><button className="ghost" type="button">Cancel</button><button type="submit">Submit</button></div>
    </form>
  </Dialog>;
}

function ShiftSwapDialog() {
  return <Dialog onClose={noop}>
    <form className="dialog-panel" onSubmit={prevent}>
      <h2>Request a Shift Swap</h2>
      <p className="note">Other staff members can volunteer to cover this shift.</p>
      <label className="field"><span>Note</span><input defaultValue="I have an appointment" /></label>
      <div className="dialog-actions"><button className="ghost" type="button">Cancel</button><button type="submit">Submit Request</button></div>
    </form>
  </Dialog>;
}

function ManualApp() {
  const view = new URLSearchParams(window.location.search).get("view") || "manager";
  if (view === "staff") {
    return <StaffFrame />;
  }
  if (view === "shift-request") {
    return <StaffFrame><ShiftRequestDialog /></StaffFrame>;
  }
  if (view === "shift-swap") {
    return <StaffFrame><ShiftSwapDialog /></StaffFrame>;
  }
  if (view === "terminal") {
    return <Frame language="en"><OnlineTerminalPanel {...{
      data: terminalData, error: "", loading: false, staffId: "staff-alex", code: "18426",
      codeError: false, onCodeChange: noop, onCodeSubmit: prevent, onClockIn: noop,
      onClockOut: noop, onRefresh: noop,
    }} /></Frame>;
  }
  return <Frame account="管理者 (manager@example.com)"><OnlineManagerPanel {...sharedManagerProps} /></Frame>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ManualApp />);
