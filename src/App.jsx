import { useEffect, useMemo, useState } from "react";
import { APP_VERSION, DEFAULT_ADMIN_PASSCODE, DEFAULT_STORE_NAME } from "./lib/constants.js";
import { exportFullBackup, exportPdf, exportSheet } from "./lib/export.js";
import {
  actualShiftTimes,
  applyClockIn,
  applyClockOut,
  applyEmergencyClockIn,
  compactShiftStyle,
  createPunchRecord,
  deleteStaffRecord,
  displayShiftLabel,
  displayShiftTimes,
  generateStaffCode,
  normalizeState,
  openPunchFor,
  payrollRows,
  punchRows,
  recentPunches,
  restoreBackupPayload,
  shiftCoverageLabel,
  shiftPunch,
  shiftStatusLabel,
  signinChoicesForStaff,
  staffName,
  timelineBounds,
  timelineStyle,
  todaysTimelineShifts,
  updateAdminPasscode,
  updatePunchRecord,
  updateShiftNote,
  updateStoreSettings,
  upsertShift,
  upsertStaff,
} from "./lib/model.js";
import { loadState, saveState } from "./lib/storage.js";
import {
  fetchManagerSnapshot,
  fetchManagerPayrollSnapshot,
  fetchStaffSnapshot,
  fetchTerminalSnapshot,
  findTerminalStaff,
  importLegacyBackup,
  acceptOnlineShiftSwap,
  onlinePayrollRows,
  onlinePunchRows,
  saveOnlineShiftRequest,
  saveOnlineShiftSwap,
  saveOnlinePunch,
  saveTerminalPunch,
  saveOnlineSettings,
  saveOnlinePayroll,
  saveOnlineShift,
  saveOnlineStaff,
  updateOnlineShiftRequest,
  withdrawOnlineShiftRequest,
  cancelOnlineShiftSwap,
} from "./lib/online.js";
import { supabase, supabaseConfigured, supabaseMode } from "./lib/supabase.js";
import {
  addDays,
  dateKey,
  dateTimeLabel,
  dateTimeFromFields,
  formatter,
  minutesToTime,
  mondayOf,
  staffFormatter,
  timeLabel,
  timeToMinutes,
  weekDates,
  weekDayLabel,
} from "./lib/time.js";

const terminalMode = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("terminal") === "1";

const emptyShiftForm = (startDate) => ({
  id: "",
  date: startDate,
  staffId: "",
  start: "09:00",
  end: "17:00",
});

const emptyPunchForm = {
  mode: "create",
  id: "",
  staffId: "",
  staffName: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  payrollFromActualStart: false,
};

const emptyStaffForm = () => ({
  id: "",
  name: "",
  wage: "17.40",
  code: "",
});

const emptyOnlineStaffForm = () => ({ id: "", name: "", wage: "17.40", code: "", email: "", active: true });
const emptyOnlineShiftForm = (date, staffId = "") => ({
  id: "",
  date,
  staffId,
  start: "09:00",
  end: "17:00",
  note: "",
  status: "published",
});
const emptyOnlineRequestForm = (date) => ({ date, start: "09:00", end: "17:00", note: "" });

export default function App() {
  const legacyLocalMode = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("local") === "1";
  const [state, setState] = useState(() => loadState());
  const [view, setView] = useState("staff");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [activeStaffId, setActiveStaffId] = useState("");
  const [staffCodeInput, setStaffCodeInput] = useState("");
  const [staffCodeError, setStaffCodeError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState(false);
  const [passcodeMode, setPasscodeMode] = useState("manager");
  const [payStart, setPayStart] = useState(() => dateKey(new Date()));
  const [payEnd, setPayEnd] = useState(() => dateKey(new Date()));
  const [payStaff, setPayStaff] = useState("all");
  const [shiftWeekStart, setShiftWeekStart] = useState(() => mondayOf(dateKey(new Date())));
  const [payrollResult, setPayrollResult] = useState([]);
  const [showPasscodeDialog, setShowPasscodeDialog] = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const [showStaffDialog, setShowStaffDialog] = useState(false);
  const [showStaffCodeDialog, setShowStaffCodeDialog] = useState(false);
  const [showPunchDialog, setShowPunchDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedStaffCode, setSelectedStaffCode] = useState({ name: "", code: "" });
  const [shiftForm, setShiftForm] = useState(() => emptyShiftForm(mondayOf(dateKey(new Date()))));
  const [staffForm, setStaffForm] = useState(() => ({
    ...emptyStaffForm(),
    code: generateStaffCode(new Set()),
  }));
  const [punchForm, setPunchForm] = useState(emptyPunchForm);
  const [onlineSession, setOnlineSession] = useState(null);
  const [onlineRole, setOnlineRole] = useState("");
  const [onlineStaffId, setOnlineStaffId] = useState("");
  const [onlineAuthLoading, setOnlineAuthLoading] = useState(supabaseConfigured);
  const [onlineAuthError, setOnlineAuthError] = useState("");
  const [onlineAuthMode, setOnlineAuthMode] = useState("login");
  const [showOnlineLogin, setShowOnlineLogin] = useState(false);
  const [onlineSnapshot, setOnlineSnapshot] = useState(null);
  const [onlineDataLoading, setOnlineDataLoading] = useState(false);
  const [onlineDataError, setOnlineDataError] = useState("");
  const [terminalStaffId, setTerminalStaffId] = useState("");
  const [terminalCode, setTerminalCode] = useState("");
  const [terminalCodeInput, setTerminalCodeInput] = useState("");
  const [terminalCodeError, setTerminalCodeError] = useState(false);
  const [onlineWeekStart, setOnlineWeekStart] = useState(() => mondayOf(dateKey(new Date())));
  const [onlineStaffForm, setOnlineStaffForm] = useState(emptyOnlineStaffForm);
  const [onlineShiftForm, setOnlineShiftForm] = useState(() => emptyOnlineShiftForm(dateKey(new Date())));
  const [showOnlineStaffDialog, setShowOnlineStaffDialog] = useState(false);
  const [showOnlineShiftDialog, setShowOnlineShiftDialog] = useState(false);
  const [onlineRequestForm, setOnlineRequestForm] = useState(() => emptyOnlineRequestForm(dateKey(new Date())));
  const [showOnlineRequestDialog, setShowOnlineRequestDialog] = useState(false);
  const [onlineSwapForm, setOnlineSwapForm] = useState({ shiftId: "", note: "" });
  const [showOnlineSwapDialog, setShowOnlineSwapDialog] = useState(false);
  const [onlinePunchForm, setOnlinePunchForm] = useState(null);
  const [showOnlinePunchDialog, setShowOnlinePunchDialog] = useState(false);
  const [onlinePayrollResult, setOnlinePayrollResult] = useState([]);
  const [onlinePayrollSource, setOnlinePayrollSource] = useState(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    document.title = `Timecard | ${state.storeName || DEFAULT_STORE_NAME}`;
    const appleTitle = document.querySelector("meta[name='apple-mobile-web-app-title']");
    if (appleTitle) appleTitle.setAttribute("content", state.storeName || DEFAULT_STORE_NAME);
  }, [state.storeName]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (terminalMode) {
      setOnlineAuthLoading(false);
      return undefined;
    }
    if (!supabase) {
      setOnlineAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    const loadOnlineSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setOnlineSession(session);
      if (session?.user) await ensureOnlineRole(session.user.id);
      setOnlineAuthLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setOnlineSession(session);
      if (!session) {
        setOnlineRole("");
        setOnlineAuthError("");
      }
      if (event === "SIGNED_IN") setShowOnlineLogin(false);
    });
    loadOnlineSession();
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadOnlineRole(userId) {
    if (!supabase || !userId) return "";
    const { data, error } = await supabase
      .from("profiles")
      .select("role, active, staff_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      setOnlineAuthError("We couldn't verify your account profile.");
      setOnlineRole("");
      return "";
    }
    if (!data) {
      // A new staff account is linked immediately after login by claim_staff_profile.
      // Keep the session alive until that claim has had a chance to run.
      setOnlineRole("");
      setOnlineStaffId("");
      return "";
    }
    const role = data?.active ? data.role : "";
    setOnlineRole(role);
    setOnlineStaffId(data?.active ? data.staff_id || "" : "");
    if (role !== "manager" && role !== "staff" && role !== "terminal") {
      setOnlineAuthError("This account does not have access.");
      await supabase.auth.signOut();
    }
    return role;
  }

  async function ensureOnlineRole(userId) {
    let role = await loadOnlineRole(userId);
    if (!role) {
      const { error: claimError } = await supabase.rpc("claim_staff_profile");
      if (claimError) {
        setOnlineAuthError(claimError.message);
        return "";
      }
      role = await loadOnlineRole(userId);
    }
    return role;
  }

  async function handleOnlineLogin(event) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setOnlineAuthLoading(true);
    setOnlineAuthError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setOnlineAuthLoading(false);
      setOnlineAuthError("Check your email address and password.");
      return;
    }
    const role = await ensureOnlineRole(data.user?.id);
    setOnlineAuthLoading(false);
    if (role !== "manager" && role !== "staff") return;
    event.currentTarget.reset();
  }

  async function handleOnlineSignup(event) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    setOnlineAuthLoading(true);
    setOnlineAuthError("");
    const redirectUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    if (error) {
      setOnlineAuthLoading(false);
      setOnlineAuthError(error.message);
      return;
    }
    if (!data.session) {
      setOnlineAuthLoading(false);
      setOnlineAuthError("A confirmation email was sent. Open the link, then log in.");
      event.currentTarget.reset();
      return;
    }
    await ensureOnlineRole(data.user.id);
    setOnlineAuthLoading(false);
    setShowOnlineLogin(false);
    event.currentTarget.reset();
  }

  async function handleTerminalCodeSubmit(event) {
    event.preventDefault();
    const code = terminalCodeInput.trim();
    if (!supabase) return;
    setTerminalCodeInput("");
    setOnlineDataError("");
    try {
      const person = await findTerminalStaff(supabase, code);
      if (!person) throw new Error("Staff code not found.");
      setTerminalCode(code);
      setTerminalStaffId(person.id);
      setTerminalCodeError(false);
    } catch (error) {
      setTerminalStaffId("");
      setTerminalCode("");
      setTerminalCodeError(true);
    }
  }

  async function handleTerminalClockIn(shift) {
    if (!supabase || !terminalStaffId) return;
    try {
      await saveTerminalPunch(supabase, { code: terminalCode, shiftId: shift.id, action: "in" });
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not sign in.");
    }
  }

  async function handleTerminalClockOut() {
    if (!supabase || !terminalStaffId) return;
    const activePunch = onlineSnapshot?.punches?.find((punch) => punch.staffId === terminalStaffId && !punch.endAt);
    if (!activePunch) return;
    try {
      await saveTerminalPunch(supabase, { code: terminalCode, action: "out" });
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not sign out.");
    }
  }

  async function handleLegacyImport(event) {
    const [file] = event.target.files || [];
    if (!file || !supabase) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!window.confirm("Import this backup into Supabase? Existing records will not be deleted.")) return;
      const result = await importLegacyBackup(supabase, payload);
      await refreshOnlineData();
      window.alert(`Imported ${result.staff} staff, ${result.shifts} shifts, ${result.punches} punches, ${result.shiftRequests} requests, and ${result.shiftSwaps} swaps.`);
    } catch (error) {
      setOnlineDataError(error?.message || "Could not import the backup file.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleOnlineLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setOnlineSession(null);
    setOnlineRole("");
    setOnlineStaffId("");
    setOnlineSnapshot(null);
  }

  function openOnlineStaffDialog(person = null) {
    setOnlineStaffForm(person ? {
      id: person.id,
      name: person.name,
      wage: person.wage.toFixed(2),
      code: "",
      email: person.email || "",
      active: person.active,
    } : emptyOnlineStaffForm());
    setShowOnlineStaffDialog(true);
  }

  function openOnlineShiftDialog(shift = null) {
    setOnlineShiftForm(shift ? {
      id: shift.id,
      date: shift.date,
      staffId: shift.staffId,
      start: minutesToTime(shift.start),
      end: minutesToTime(shift.end),
      note: shift.note,
      status: shift.status,
    } : emptyOnlineShiftForm(onlineWeekStart, onlineSnapshot?.staff[0]?.id || ""));
    setShowOnlineShiftDialog(true);
  }

  function openOnlinePunchDialog(punch = null) {
    const start = punch ? new Date(punch.startAt) : new Date();
    const end = punch?.endAt ? new Date(punch.endAt) : null;
    setOnlinePunchForm({
      id: punch?.id || "",
      staffId: punch?.staffId || onlineSnapshot?.staff[0]?.id || "",
      shiftId: punch?.shiftId || "",
      scheduledStaffId: punch?.scheduledStaffId || punch?.staffId || "",
      startDate: dateKey(start),
      startTime: timeLabel(start),
      endDate: end ? dateKey(end) : "",
      endTime: end ? timeLabel(end) : "",
      payrollFromActualStart: Boolean(punch?.payrollFromActualStart),
    });
    setShowOnlinePunchDialog(true);
  }

  async function handleSaveOnlineStaff(event) {
    event.preventDefault();
    if (!supabase) return;
    if (!onlineStaffForm.id && !/^\d{5}$/.test(onlineStaffForm.code.trim())) {
      setOnlineDataError("新規スタッフのコードは5桁の数字にしてください。");
      return;
    }
    if (!onlineStaffForm.id && onlineSnapshot?.staff.some((person) => person.code === onlineStaffForm.code.trim())) {
      setOnlineDataError("そのスタッフコードはすでに使われています。別の5桁コードを入力してください。");
      return;
    }
    try {
      await saveOnlineStaff(supabase, onlineStaffForm);
      setShowOnlineStaffDialog(false);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.code === "23505"
        ? "そのスタッフコードはすでに使われています。別の5桁コードを入力してください。"
        : error?.message || "スタッフを保存できませんでした。");
    }
  }

  async function handleDeleteOnlineStaff(person) {
    if (!supabase) return;
    const nextActive = !person.active;
    const message = nextActive
      ? `${person.name}を再び有効にしますか？`
      : `${person.name}を削除しますか？既存のシフト・勤怠記録は残ります。`;
    if (!window.confirm(message)) return;
    try {
      await saveOnlineStaff(supabase, { ...person, wage: person.wage, code: "", active: nextActive });
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ active: nextActive })
        .eq("staff_id", person.id);
      if (profileError) throw profileError;
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "スタッフを更新できませんでした。");
    }
  }

  async function handleSaveOnlineSettings(event) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const storeName = String(form.get("storeName") || "").trim();
    const adminPasscode = String(form.get("adminPasscode") || "").trim();
    if (!storeName || !adminPasscode) return;
    try {
      await saveOnlineSettings(supabase, { storeName, adminPasscode });
      setState((current) => ({ ...current, storeName }));
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "設定を保存できませんでした。");
    }
  }

  async function handleSaveOnlineShift(event) {
    event.preventDefault();
    if (!supabase) return;
    const start = timeToMinutes(onlineShiftForm.start);
    const end = timeToMinutes(onlineShiftForm.end);
    if (!onlineShiftForm.staffId || end <= start) {
      setOnlineDataError("スタッフと正しい勤務時間を指定してください。");
      return;
    }
    try {
      await saveOnlineShift(supabase, { ...onlineShiftForm, start, end });
      setShowOnlineShiftDialog(false);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "シフトを保存できませんでした。");
    }
  }

  function openOnlineRequestDialog() {
    setOnlineRequestForm(emptyOnlineRequestForm(dateKey(new Date())));
    setShowOnlineRequestDialog(true);
  }

  async function handleSaveOnlineRequest(event) {
    event.preventDefault();
    if (!supabase || !onlineStaffId) return;
    const form = new FormData(event.currentTarget);
    const values = {
      date: String(form.get("date") || ""),
      start: String(form.get("start") || ""),
      end: String(form.get("end") || ""),
      note: String(form.get("note") || ""),
    };
    if (!values.date || timeToMinutes(values.end) <= timeToMinutes(values.start)) {
      setOnlineDataError("希望日と正しい勤務時間を指定してください。");
      return;
    }
    try {
      await saveOnlineShiftRequest(supabase, values, onlineStaffId);
      setShowOnlineRequestDialog(false);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not submit the shift request.");
    }
  }

  async function handleWithdrawOnlineRequest(requestId) {
    if (!supabase) return;
    try {
      await withdrawOnlineShiftRequest(supabase, requestId);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not withdraw the shift request.");
    }
  }

  async function handleUpdateOnlineRequest(requestId, status) {
    if (!supabase) return;
    try {
      await updateOnlineShiftRequest(supabase, requestId, status);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "シフト希望を更新できませんでした。");
    }
  }

  function openOnlineSwapDialog(shiftId) {
    setOnlineSwapForm({ shiftId, note: "" });
    setShowOnlineSwapDialog(true);
  }

  async function handleSaveOnlineSwap(event) {
    event.preventDefault();
    if (!supabase || !onlineStaffId) return;
    try {
      await saveOnlineShiftSwap(supabase, onlineSwapForm.shiftId, onlineStaffId, onlineSwapForm.note);
      setShowOnlineSwapDialog(false);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not submit the shift swap request.");
    }
  }

  async function handleCancelOnlineSwap(swapId) {
    if (!supabase) return;
    try {
      await cancelOnlineShiftSwap(supabase, swapId);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not cancel the shift swap request.");
    }
  }

  async function handleAcceptOnlineSwap(swapId) {
    if (!supabase) return;
    try {
      await acceptOnlineShiftSwap(supabase, swapId);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "Could not accept the shift swap.");
    }
  }

  async function handleSaveOnlinePunch(event) {
    event.preventDefault();
    if (!supabase || !onlinePunchForm) return;
    const form = new FormData(event.currentTarget);
    const values = {
      ...onlinePunchForm,
      staffId: String(form.get("staffId") || onlinePunchForm.staffId),
      startDate: String(form.get("startDate") || ""),
      startTime: String(form.get("startTime") || ""),
      endDate: String(form.get("endDate") || ""),
      endTime: String(form.get("endTime") || ""),
      payrollFromActualStart: form.get("payrollFromActualStart") === "on",
    };
    const start = dateTimeFromFields(values.startDate, values.startTime);
    const end = values.endDate && values.endTime ? dateTimeFromFields(values.endDate, values.endTime) : null;
    if (!start || (end && end <= start)) {
      setOnlineDataError("勤務開始・終了時刻を確認してください。");
      return;
    }
    try {
      await saveOnlinePunch(supabase, values);
      setShowOnlinePunchDialog(false);
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "勤務記録を保存できませんでした。");
    }
  }

  async function handleSaveOnlinePayroll(row, status) {
    if (!supabase || !onlineSnapshot || !onlineSession) return;
    try {
      await saveOnlinePayroll(
        supabase,
        row,
        onlineSnapshot.weekStart,
        onlineSnapshot.weekEnd,
        status,
        onlineSession.user.id,
      );
      await refreshOnlineData();
    } catch (error) {
      setOnlineDataError(error?.message || "給与データを保存できませんでした。");
    }
  }

  async function handleCalculateOnlinePayroll(event) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") || "");
    const endDate = String(form.get("endDate") || "");
    const staffId = String(form.get("staffId") || "all");
    if (!startDate || !endDate || endDate < startDate) return;
    setPayStart(startDate);
    setPayEnd(endDate);
    setPayStaff(staffId);
    try {
      const snapshot = await fetchManagerPayrollSnapshot(supabase, startDate, endDate);
      setOnlinePayrollSource(snapshot);
      setOnlinePayrollResult(onlinePayrollRows(snapshot).filter((row) => staffId === "all" || row.person.id === staffId));
    } catch (error) {
      setOnlineDataError(error?.message || "給与を計算できませんでした。");
    }
  }

  function handleExportOnlinePayroll() {
    if (!onlinePayrollSource) return;
    exportSheet(onlinePayrollSource, payStart, payEnd, payStaff);
  }

  function handleExportOnlinePayrollPdf() {
    if (!onlinePayrollSource) return;
    exportPdf(onlinePayrollSource, payStart, payEnd, payStaff);
  }

  async function refreshOnlineData() {
    if (!supabase || (!onlineRole && !terminalMode)) return;
    setOnlineDataLoading(true);
    setOnlineDataError("");
    try {
      const nextSnapshot = terminalMode
        ? await fetchTerminalSnapshot(supabase)
        : onlineRole === "manager"
        ? await fetchManagerSnapshot(supabase, onlineWeekStart)
        : onlineRole === "terminal"
          ? await fetchTerminalSnapshot(supabase)
          : await fetchStaffSnapshot(supabase, onlineStaffId, onlineWeekStart);
      if (onlineRole === "manager" && nextSnapshot.settings?.store_name) {
        setState((current) => ({ ...current, storeName: nextSnapshot.settings.store_name }));
      }
      setOnlineSnapshot(nextSnapshot);
    } catch (error) {
      setOnlineDataError(error?.message || "Could not load online data.");
    } finally {
      setOnlineDataLoading(false);
    }
  }

  useEffect(() => {
    if (terminalMode || onlineRole === "manager" || onlineRole === "terminal" || (onlineRole === "staff" && onlineStaffId)) refreshOnlineData();
  }, [onlineRole, onlineStaffId, onlineWeekStart]);

  const today = dateKey(now);
  const weeklyDates = useMemo(() => weekDates(shiftWeekStart), [shiftWeekStart]);
  const activeStaff = state.staff.find((person) => person.id === activeStaffId);
  const activePunch = activeStaff ? openPunchFor(state, activeStaff.id) : null;
  const todayShifts = useMemo(() => todaysTimelineShifts(state, now), [state, now]);
  const signinChoices = useMemo(
    () => (activeStaff ? signinChoicesForStaff(state, activeStaff.id, now) : { own: [], swaps: [] }),
    [state, activeStaff, now],
  );
  const recentPunchRows = useMemo(() => recentPunches(state), [state]);

  function resetStaffSelection() {
    setActiveStaffId("");
    setStaffCodeInput("");
    setStaffCodeError(false);
  }

  function switchToView(nextView) {
    if (nextView === "manager" && !adminUnlocked) {
      setPasscodeMode("manager");
      setShowPasscodeDialog(true);
      setPasscodeError(false);
      setPasscodeInput("");
      return;
    }
    if (nextView !== "manager") setAdminUnlocked(false);
    if (nextView !== "staff") resetStaffSelection();
    setView(nextView);
  }

  function openShiftDialog(shift = null) {
    setShiftForm(shift ? {
      id: shift.id,
      date: shift.date,
      staffId: shift.staffId,
      start: minutesToTime(shift.start),
      end: minutesToTime(shift.end),
    } : emptyShiftForm(weeklyDates[0]));
    setShowShiftDialog(true);
  }

  function openStaffDialog(person = null) {
    setStaffForm(person ? {
      id: person.id,
      name: person.name,
      wage: Number(person.wage).toFixed(2),
      code: person.code,
    } : {
      ...emptyStaffForm(),
      code: generateStaffCode(new Set(state.staff.map((item) => item.code).filter(Boolean))),
    });
    setShowStaffDialog(true);
  }

  function openPunchDialog(punch) {
    const start = new Date(punch.startAt);
    const end = punch.endAt ? new Date(punch.endAt) : null;
    setPunchForm({
      mode: "edit",
      id: punch.id,
      staffId: punch.staffId,
      staffName: staffName(state, punch.staffId),
      startDate: dateKey(start),
      startTime: timeLabel(start),
      endDate: end ? dateKey(end) : "",
      endTime: end ? timeLabel(end) : "",
      payrollFromActualStart: Boolean(punch.payrollFromActualStart),
    });
    setShowPunchDialog(true);
  }

  function openManualPunchDialog() {
    setPunchForm({
      mode: "create",
      id: "",
      staffId: state.staff[0]?.id || "",
      staffName: "",
      startDate: today,
      startTime: "09:00",
      endDate: today,
      endTime: "17:00",
      payrollFromActualStart: false,
    });
    setShowPunchDialog(true);
  }

  function handleStaffCodeSubmit(event) {
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const code = staffCodeInput.trim();
    setStaffCodeInput("");
    const person = state.staff.find((item) => item.code === code);
    if (!person) {
      setActiveStaffId("");
      setStaffCodeError(true);
      return;
    }
    setActiveStaffId(person.id);
    setStaffCodeError(false);
  }

  function handleClockIn(shiftId) {
    setState((current) => normalizeState(applyClockIn(current, activeStaffId, shiftId, now)));
    resetStaffSelection();
  }

  function handleClockOut() {
    setState((current) => normalizeState(applyClockOut(current, activeStaffId, now)));
    resetStaffSelection();
  }

  function requestEmergencyClockIn() {
    setPasscodeMode("emergency");
    setPasscodeError(false);
    setPasscodeInput("");
    setShowPasscodeDialog(true);
  }

  function handleDeleteStaff(staffId) {
    const result = deleteStaffRecord(state, staffId);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    setState(normalizeState(result.state));
  }

  function handleSaveStaff(event) {
    event.preventDefault();
    if (!/^\d{5}$/.test(staffForm.code.trim())) {
      window.alert("スタッフコードは5桁の数字にしてください。");
      return;
    }
    const result = upsertStaff(state, {
      id: staffForm.id,
      name: staffForm.name.trim(),
      wage: Number(staffForm.wage),
      code: staffForm.code.trim(),
    });
    if (result.error) {
      window.alert(result.error);
      return;
    }
    setState(normalizeState(result.state));
    setShowStaffDialog(false);
  }

  function handleSaveShift(event) {
    event.preventDefault();
    const start = timeToMinutes(shiftForm.start);
    const end = timeToMinutes(shiftForm.end);
    if (end <= start) {
      window.alert("終了時刻は開始時刻より後にしてください。");
      return;
    }
    setState((current) => normalizeState(upsertShift(current, {
      id: shiftForm.id,
      date: shiftForm.date,
      staffId: shiftForm.staffId,
      start,
      end,
    })));
    setShowShiftDialog(false);
  }

  function handleSavePunch(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const staffId = String(form.get("staffId") || punchForm.staffId);
    const startDate = String(form.get("startDate") || punchForm.startDate);
    const startTime = String(form.get("startTime") || punchForm.startTime);
    const endDate = String(form.get("endDate") || punchForm.endDate);
    const endTime = String(form.get("endTime") || punchForm.endTime);
    const payrollFromActualStart = form.get("payrollFromActualStart") === "on";

    const result = punchForm.mode === "create"
      ? createPunchRecord(
        state,
        staffId,
        startDate,
        startTime,
        endDate,
        endTime,
        payrollFromActualStart,
      )
      : updatePunchRecord(
        state,
        punchForm.id,
        startDate,
        startTime,
        endDate,
        endTime,
        payrollFromActualStart,
      );
    if (result.error) {
      window.alert(result.error);
      return;
    }
    setState(normalizeState(result.state));
    setShowPunchDialog(false);
  }

  function handleUnlockAdmin(event) {
    event.preventDefault();
    if (passcodeInput === state.adminPasscode) {
      setShowPasscodeDialog(false);
      setPasscodeError(false);
      setPasscodeInput("");
      if (passcodeMode === "emergency") {
        setState((current) => normalizeState(applyEmergencyClockIn(current, activeStaffId, now)));
        resetStaffSelection();
        return;
      }
      setAdminUnlocked(true);
      setView("manager");
      return;
    }
    setPasscodeError(true);
  }

  function handleBackupRestore(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!window.confirm("現在のデータをバックアップの内容で置き換えます。よろしいですか？")) return;
        setState(restoreBackupPayload(payload));
        resetStaffSelection();
        window.alert("バックアップを復元しました。");
      } catch {
        window.alert("バックアップファイルを読み込めませんでした。");
      } finally {
        event.target.value = "";
      }
    });
    reader.readAsText(file);
  }

  const managerVisible = view === "manager";
  const onlinePortalActive = terminalMode || (onlineSession && (onlineRole === "manager" || onlineRole === "staff" || onlineRole === "terminal"));
  const localPunchVisible = legacyLocalMode || (!supabaseConfigured && !terminalMode);
  const staffVisible = view === "staff" && !onlinePortalActive && localPunchVisible;

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <h1 id="storeNameHeading">{state.storeName || DEFAULT_STORE_NAME}</h1>
            <p id="todayLabel">{view === "staff" ? staffFormatter.format(now) : formatter.format(now)}</p>
          </div>
          <nav className="tabs" aria-label="画面切り替え">
            {legacyLocalMode || (!supabaseConfigured && !terminalMode) ? <>
              <button className={`tab ${view === "staff" ? "active" : ""}`} onClick={() => switchToView("staff")} type="button">Staff</button>
              <button className={`tab ${view === "manager" ? "active" : ""}`} onClick={() => switchToView("manager")} type="button">Manager</button>
            </> : null}
          </nav>
        </header>

        {supabaseConfigured && !terminalMode ? (
          <div className="online-bar" role="status">
            {onlinePortalActive ? (
              <>
                <span>{supabaseMode === "test" ? "TEST / " : ""}{onlineRole === "manager" ? "Online manager" : onlineRole === "terminal" ? "Terminal" : "Online staff"}: {onlineSession.user.email}</span>
                <button className="ghost" onClick={handleOnlineLogout} type="button">{onlineRole === "manager" ? "ログアウト" : "Log out"}</button>
              </>
            ) : (
              <>
                <span>{supabaseMode === "test" ? "TEST / Online portal" : "Online portal"}</span>
                <button onClick={() => {
                  setOnlineAuthError("");
                  setShowOnlineLogin(true);
                }} type="button">Log in</button>
              </>
            )}
          </div>
        ) : null}

        {onlineSession && onlineRole === "manager" ? (
          <OnlineManagerPanel
            data={onlineSnapshot}
            error={onlineDataError}
            loading={onlineDataLoading}
            onNextWeek={() => setOnlineWeekStart((current) => addDays(current, 7))}
            onPreviousWeek={() => setOnlineWeekStart((current) => addDays(current, -7))}
            onAddShift={() => openOnlineShiftDialog()}
            onAddStaff={() => openOnlineStaffDialog()}
            onEditShift={openOnlineShiftDialog}
            onEditStaff={openOnlineStaffDialog}
            onDeleteStaff={handleDeleteOnlineStaff}
            onAddPunch={() => openOnlinePunchDialog()}
            onEditPunch={openOnlinePunchDialog}
            onSavePayroll={handleSaveOnlinePayroll}
            onCalculatePayroll={handleCalculateOnlinePayroll}
            onExportPayroll={handleExportOnlinePayroll}
            onExportPayrollPdf={handleExportOnlinePayrollPdf}
            onSaveSettings={handleSaveOnlineSettings}
            payrollResult={onlinePayrollResult}
            onImportBackup={handleLegacyImport}
            onRefresh={refreshOnlineData}
            onRequest={openOnlineRequestDialog}
            onWithdrawRequest={handleWithdrawOnlineRequest}
            onRequestSwap={openOnlineSwapDialog}
            onCancelSwap={handleCancelOnlineSwap}
            onAcceptSwap={handleAcceptOnlineSwap}
            staffId={onlineStaffId}
          />
        ) : null}

        {onlineSession && onlineRole === "staff" ? (
          <OnlineStaffPanel
            data={onlineSnapshot}
            error={onlineDataError}
            loading={onlineDataLoading}
            onNextWeek={() => setOnlineWeekStart((current) => addDays(current, 7))}
            onPreviousWeek={() => setOnlineWeekStart((current) => addDays(current, -7))}
            onRefresh={refreshOnlineData}
            onUpdateRequest={handleUpdateOnlineRequest}
          />
        ) : null}

        {(terminalMode || (onlineSession && onlineRole === "terminal")) ? (
          <OnlineTerminalPanel
            data={onlineSnapshot}
            error={onlineDataError}
            loading={onlineDataLoading}
            staffId={terminalStaffId}
            code={terminalCodeInput}
            codeError={terminalCodeError}
            onCodeChange={setTerminalCodeInput}
            onCodeSubmit={handleTerminalCodeSubmit}
            onClockIn={handleTerminalClockIn}
            onClockOut={handleTerminalClockOut}
            onRefresh={refreshOnlineData}
          />
        ) : null}

        <main>
          <section className={`view ${staffVisible ? "active" : ""}`} id="staffView">
            <div className="panel tablet-panel">
              <div className="panel-heading">
                <h2>Sign In</h2>
                <div className="clock">{timeLabel(now)}</div>
              </div>

              <form className="code-form" onSubmit={handleStaffCodeSubmit}>
                <label className="field">
                  <span>Staff Code</span>
                  <input
                    autoComplete="off"
                    enterKeyHint="done"
                    inputMode="numeric"
                    maxLength="5"
                    pattern="[0-9]{5}"
                    required
                    value={staffCodeInput}
                    onChange={(event) => setStaffCodeInput(event.target.value)}
                  />
                </label>
                <button type="submit">Continue</button>
              </form>
              <p className={`error ${staffCodeError ? "" : "hidden"}`}>Staff code not found.</p>

              {activePunch ? (
                <div className="status-box">
                  <span>{staffName(state, activePunch.staffId)} is signed in</span>
                  <span>Since {timeLabel(new Date(activePunch.startAt))}</span>
                </div>
              ) : null}

              <div className="shift-grid">
                {!activeStaff ? <div className="empty">Enter your staff code.</div> : null}
                {activeStaff && !activePunch ? (
                  <>
                    {signinChoices.own.map((shift) => (
                      <SigninCard key={shift.id} shift={shift} onClockIn={handleClockIn} />
                    ))}
                    {signinChoices.swaps.map((shift) => (
                      <SigninCard key={shift.id} shift={shift} isSwap onClockIn={handleClockIn} assigned={staffName(state, shift.staffId)} />
                    ))}
                    {!signinChoices.own.length && !signinChoices.swaps.length ? (
                      <article className="shift-card">
                        <strong>No available shift</strong>
                        <div className="meta">You can sign in only for a scheduled shift or as coverage.</div>
                        <div className="meta">If a manager approved emergency help, use the manager code below.</div>
                        <button onClick={requestEmergencyClockIn} type="button">Manager-approved help sign in</button>
                      </article>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="actions">
                {activePunch ? <button className="danger" id="clockOutBtn" onClick={handleClockOut} type="button">Sign Out</button> : null}
              </div>
            </div>

            <div className="panel">
              <h2>Today&apos;s Shifts</h2>
              <ShiftTimeline now={now} locale="en" shifts={todayShifts} state={state} />
            </div>
          </section>

          <section className={`view ${managerVisible ? "active" : ""}`} id="adminView">
            <div className="admin-grid">
              <div className="panel">
                <h2>シフト作成</h2>
                <div className="week-switcher">
                  <button aria-label="前の週" className="ghost" id="prevWeekBtn" onClick={() => setShiftWeekStart((current) => addDays(current, -7))} type="button">‹</button>
                  <div>
                    <span>週</span>
                    <strong id="shiftWeekLabel">{weekDayLabel(weeklyDates[0], "ja")} - {weekDayLabel(weeklyDates[6], "ja")}</strong>
                  </div>
                  <button aria-label="次の週" className="ghost" id="nextWeekBtn" onClick={() => setShiftWeekStart((current) => addDays(current, 7))} type="button">›</button>
                </div>
                <div className="panel-actions">
                  <button id="openShiftModalBtn" onClick={() => openShiftDialog()} type="button">シフト追加</button>
                </div>
                <WeeklyShiftTable dates={weeklyDates} onEditShift={openShiftDialog} onNoteChange={(date, value) => setState((current) => normalizeState(updateShiftNote(current, date, value)))} state={state} />
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h2>給与計算・保存</h2>
                <form className="payroll-controls" onSubmit={(event) => {
                  event.preventDefault();
                  setPayrollResult(payrollRows(state, payStart, payEnd, payStaff));
                }}>
                  <input required type="date" value={payStart} onChange={(event) => setPayStart(event.target.value)} />
                  <span>から</span>
                  <input required type="date" value={payEnd} onChange={(event) => setPayEnd(event.target.value)} />
                  <select aria-label="対象スタッフ" value={payStaff} onChange={(event) => setPayStaff(event.target.value)}>
                    <option value="all">全員まとめて</option>
                    {state.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                  <button type="submit">計算</button>
                  <button className="secondary" id="savePayrollBtn" onClick={() => setShowSaveDialog(true)} type="button">保存</button>
                </form>
              </div>
              <div className="payroll" id="payrollResult">
                {payrollResult.map((row) => (
                  <div className="pay-row" key={row.person.id}>
                    <div>
                      <div className="title">{row.person.name}</div>
                      <div className="sub">{row.hours.toFixed(2)} 時間 x ${Number(row.person.wage).toFixed(2)}</div>
                    </div>
                    <div className="amount">${row.pay.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>勤務記録の修正</h2>
              <div className="panel-actions">
                <button onClick={openManualPunchDialog} type="button">勤務記録を追加</button>
              </div>
              <div className="list" id="punchList">
                {!recentPunchRows.length ? <div className="empty">勤務記録はまだありません。</div> : recentPunchRows.map((punch) => (
                  <div className="list-row" key={punch.id}>
                    <div>
                      <div className="title">{staffName(state, punch.staffId)}</div>
                      <div className="sub">{dateTimeLabel(new Date(punch.startAt))} - {punch.endAt ? dateTimeLabel(new Date(punch.endAt)) : "勤務中"}</div>
                    </div>
                    <button className="ghost" onClick={() => openPunchDialog(punch)} type="button">編集</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>スタッフ管理</h2>
              <div className="panel-actions">
                <button id="openStaffModalBtn" onClick={() => openStaffDialog()} type="button">スタッフ追加</button>
              </div>
              <div className="list" id="staffList">
                {!state.staff.length ? <div className="empty">スタッフはまだ登録されていません。</div> : state.staff.map((person) => (
                  <div className="list-row" key={person.id}>
                    <div>
                      <div className="title">{person.name}</div>
                      <div className="sub">
                        コード
                        <button className="code-chip" onClick={() => {
                          setSelectedStaffCode({ name: person.name, code: person.code });
                          setShowStaffCodeDialog(true);
                        }} type="button">
                          {person.code}
                        </button>
                        / ${Number(person.wage).toFixed(2)} / hour
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="ghost" onClick={() => openStaffDialog(person)} type="button">編集</button>
                      <button className="danger" onClick={() => handleDeleteStaff(person.id)} type="button">削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>完全バックアップ</h2>
              <div className="backup-actions">
                <button className="secondary" onClick={() => exportFullBackup(state)} type="button">バックアップ保存</button>
                <label className="ghost backup-upload">
                  バックアップ復元
                  <input className="hidden" onChange={handleBackupRestore} type="file" accept="application/json,.json" />
                </label>
              </div>
              <p className="note">スタッフ、シフト、勤務記録、備考、パスコードをまとめて保存・復元します。</p>
            </div>

            <div className="panel">
              <h2>管理パスコード</h2>
              <form className="passcode-form" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const value = String(form.get("passcode") || "").trim();
                if (!value) return;
                setState((current) => normalizeState(updateAdminPasscode(current, value)));
                event.currentTarget.reset();
                window.alert("管理者パスコードを変更しました。");
              }}>
                <label className="field">
                  <span>新しいパスコード</span>
                  <input name="passcode" required type="password" inputMode="numeric" autoComplete="new-password" />
                </label>
                <button type="submit">変更</button>
              </form>
            </div>

            <div className="panel">
              <h2>店舗設定</h2>
              <form className="passcode-form" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const value = String(form.get("storeName") || "").trim();
                if (!value) return;
                setState((current) => normalizeState(updateStoreSettings(current, value)));
                window.alert("店舗名を保存しました。");
              }}>
                <label className="field">
                  <span>店舗名</span>
                  <input defaultValue={state.storeName} name="storeName" required autoComplete="organization" />
                </label>
                <button type="submit">保存</button>
              </form>
            </div>
          </section>
        </main>
        <footer className="app-footer">
          <span id="appVersion">Version {APP_VERSION}</span>
        </footer>
      </div>

      {showPasscodeDialog ? (
        <Dialog onClose={() => setShowPasscodeDialog(false)} title="管理者パスコード">
          <form className="dialog-panel" onSubmit={handleUnlockAdmin}>
            <h2>{passcodeMode === "emergency" ? "ヘルプ勤務の許可" : "管理者パスコード"}</h2>
            {passcodeMode === "emergency" && activeStaff ? (
              <p className="note">{staffName(state, activeStaff.id)}を予定外ヘルプ勤務でサインインさせます。</p>
            ) : null}
            <label className="field">
              <span>パスコード</span>
              <input
                autoFocus
                autoComplete="current-password"
                enterKeyHint="done"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                type="password"
                value={passcodeInput}
                onChange={(event) => setPasscodeInput(event.target.value)}
              />
            </label>
            <p className={`error ${passcodeError ? "" : "hidden"}`}>
              {passcodeMode === "emergency" ? "管理者コードが違います。" : "パスコードが違います。"}
            </p>
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setShowPasscodeDialog(false)} type="button">キャンセル</button>
              <button type="submit">{passcodeMode === "emergency" ? "許可してサインイン" : "開く"}</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {showOnlineLogin ? (
        <Dialog onClose={() => setShowOnlineLogin(false)} title="Log in">
          <form className="dialog-panel" onSubmit={onlineAuthMode === "signup" ? handleOnlineSignup : handleOnlineLogin}>
            <h2>Log in</h2>
            <p className="note">{onlineAuthMode === "signup" ? "Use the email address registered by your manager." : "Use your registered email address and password."}</p>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <p className={`error ${onlineAuthError ? "" : "hidden"}`}>{onlineAuthError}</p>
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setShowOnlineLogin(false)} type="button">Cancel</button>
              <button disabled={onlineAuthLoading} type="submit">{onlineAuthLoading ? "Please wait..." : "Log in"}</button>
            </div>
            <div className="auth-signup-link">
              <button className="text-link" onClick={() => { setOnlineAuthMode(onlineAuthMode === "signup" ? "login" : "signup"); setOnlineAuthError(""); }} type="button">{onlineAuthMode === "signup" ? "Back to Log in" : "Sign Up"}</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {showOnlineStaffDialog ? (
        <Dialog onClose={() => setShowOnlineStaffDialog(false)} title="オンラインスタッフ管理">
          <form className="dialog-panel" onSubmit={handleSaveOnlineStaff}>
            <h2>{onlineStaffForm.id ? "スタッフ変更" : "スタッフ追加"}</h2>
            <label className="field"><span>名前</span><input required value={onlineStaffForm.name} onChange={(event) => setOnlineStaffForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>時給</span><input min="0" required step="0.01" type="number" value={onlineStaffForm.wage} onChange={(event) => setOnlineStaffForm((current) => ({ ...current, wage: event.target.value }))} /></label>
            <label className="field"><span>{onlineStaffForm.id ? "新しいスタッフコード（変更時のみ）" : "スタッフコード"}</span><input inputMode="numeric" maxLength="5" pattern="[0-9]{5}" required={!onlineStaffForm.id} value={onlineStaffForm.code} onChange={(event) => setOnlineStaffForm((current) => ({ ...current, code: event.target.value }))} /></label>
            <label className="field"><span>スタッフ用メールアドレス{onlineStaffForm.id ? "（本人のアカウント作成に使用）" : ""}</span><input autoComplete="email" required={!onlineStaffForm.id} type="email" value={onlineStaffForm.email} onChange={(event) => setOnlineStaffForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="checkbox-field"><input checked={onlineStaffForm.active} onChange={(event) => setOnlineStaffForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /><span>有効</span></label>
            <div className="dialog-actions"><button className="ghost" onClick={() => setShowOnlineStaffDialog(false)} type="button">キャンセル</button><button type="submit">保存</button></div>
          </form>
        </Dialog>
      ) : null}

      {showOnlineShiftDialog ? (
        <Dialog onClose={() => setShowOnlineShiftDialog(false)} title="オンラインシフト管理">
          <form className="dialog-panel" onSubmit={handleSaveOnlineShift}>
            <h2>{onlineShiftForm.id ? "シフト変更" : "シフト追加"}</h2>
            <label className="field"><span>日付</span><input required type="date" value={onlineShiftForm.date} onChange={(event) => setOnlineShiftForm((current) => ({ ...current, date: event.target.value }))} /></label>
            <label className="field"><span>スタッフ</span><select required value={onlineShiftForm.staffId} onChange={(event) => setOnlineShiftForm((current) => ({ ...current, staffId: event.target.value }))}><option value="">選択してください</option>{(onlineSnapshot?.staff || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="field"><span>開始</span><TimeSelect stepMinutes={15} value={onlineShiftForm.start} onChange={(value) => setOnlineShiftForm((current) => ({ ...current, start: value }))} /></label>
            <label className="field"><span>終了</span><TimeSelect stepMinutes={15} value={onlineShiftForm.end} onChange={(value) => setOnlineShiftForm((current) => ({ ...current, end: value }))} /></label>
            <label className="field"><span>備考</span><input value={onlineShiftForm.note} onChange={(event) => setOnlineShiftForm((current) => ({ ...current, note: event.target.value }))} /></label>
            <label className="field"><span>状態</span><select value={onlineShiftForm.status} onChange={(event) => setOnlineShiftForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">下書き</option><option value="published">公開</option></select></label>
            <div className="dialog-actions"><button className="ghost" onClick={() => setShowOnlineShiftDialog(false)} type="button">キャンセル</button><button type="submit">保存</button></div>
          </form>
        </Dialog>
      ) : null}

      {showOnlineRequestDialog ? (
        <Dialog onClose={() => setShowOnlineRequestDialog(false)} title="シフト希望">
          <form className="dialog-panel" onSubmit={handleSaveOnlineRequest}>
            <h2>シフト希望を提出</h2>
            <p className="note">提出した希望は管理者が確認します。</p>
            <label className="field"><span>希望日</span><input name="date" required type="date" value={onlineRequestForm.date} onChange={(event) => setOnlineRequestForm((current) => ({ ...current, date: event.target.value }))} /></label>
            <label className="field"><span>開始</span><TimeSelect name="start" stepMinutes={15} value={onlineRequestForm.start} onChange={(value) => setOnlineRequestForm((current) => ({ ...current, start: value }))} /></label>
            <label className="field"><span>終了</span><TimeSelect name="end" stepMinutes={15} value={onlineRequestForm.end} onChange={(value) => setOnlineRequestForm((current) => ({ ...current, end: value }))} /></label>
            <label className="field"><span>備考</span><input name="note" value={onlineRequestForm.note} onChange={(event) => setOnlineRequestForm((current) => ({ ...current, note: event.target.value }))} /></label>
            <div className="dialog-actions"><button className="ghost" onClick={() => setShowOnlineRequestDialog(false)} type="button">キャンセル</button><button type="submit">提出</button></div>
          </form>
        </Dialog>
      ) : null}

      {showOnlineSwapDialog ? (
        <Dialog onClose={() => setShowOnlineSwapDialog(false)} title="シフト交代">
          <form className="dialog-panel" onSubmit={handleSaveOnlineSwap}>
            <h2>シフト交代を申請</h2>
            <p className="note">このシフトを他のスタッフへ交代募集します。</p>
            <label className="field"><span>メモ</span><input value={onlineSwapForm.note} onChange={(event) => setOnlineSwapForm((current) => ({ ...current, note: event.target.value }))} /></label>
            <div className="dialog-actions"><button className="ghost" onClick={() => setShowOnlineSwapDialog(false)} type="button">キャンセル</button><button type="submit">交代を申請</button></div>
          </form>
        </Dialog>
      ) : null}

      {showOnlinePunchDialog && onlinePunchForm ? (
        <Dialog onClose={() => setShowOnlinePunchDialog(false)} title="オンライン勤務記録">
          <form className="dialog-panel" onSubmit={handleSaveOnlinePunch}>
            <h2>{onlinePunchForm.id ? "勤務記録修正" : "勤務記録追加"}</h2>
            <label className="field"><span>スタッフ</span><select name="staffId" required value={onlinePunchForm.staffId} onChange={(event) => setOnlinePunchForm((current) => ({ ...current, staffId: event.target.value }))}><option value="">選択してください</option>{(onlineSnapshot?.staff || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="field"><span>開始</span><div className="date-time-fields"><input name="startDate" required type="date" value={onlinePunchForm.startDate} onChange={(event) => setOnlinePunchForm((current) => ({ ...current, startDate: event.target.value }))} /><TimeSelect name="startTime" stepMinutes={1} value={onlinePunchForm.startTime} onChange={(value) => setOnlinePunchForm((current) => ({ ...current, startTime: value }))} /></div></label>
            <label className="field"><span>終了</span><div className="date-time-fields"><input name="endDate" type="date" value={onlinePunchForm.endDate} onChange={(event) => setOnlinePunchForm((current) => ({ ...current, endDate: event.target.value }))} /><TimeSelect allowEmpty name="endTime" stepMinutes={1} value={onlinePunchForm.endTime} onChange={(value) => setOnlinePunchForm((current) => ({ ...current, endTime: value }))} /></div></label>
            <label className="checkbox-field"><input name="payrollFromActualStart" type="checkbox" checked={onlinePunchForm.payrollFromActualStart} onChange={(event) => setOnlinePunchForm((current) => ({ ...current, payrollFromActualStart: event.target.checked }))} /><span>早出として実打刻の開始時刻から給与計算</span></label>
            <div className="dialog-actions"><button className="ghost" onClick={() => setShowOnlinePunchDialog(false)} type="button">キャンセル</button><button type="submit">保存</button></div>
          </form>
        </Dialog>
      ) : null}

      {showShiftDialog ? (
        <Dialog onClose={() => setShowShiftDialog(false)} title="シフト追加">
          <form className="dialog-panel" onSubmit={handleSaveShift}>
            <h2>{shiftForm.id ? "シフト変更" : "シフト追加"}</h2>
            <label className="field">
              <span>曜日</span>
              <select value={shiftForm.date} onChange={(event) => setShiftForm((current) => ({ ...current, date: event.target.value }))}>
                {weeklyDates.map((date) => <option key={date} value={date}>{weekDayLabel(date, "ja")}</option>)}
              </select>
            </label>
            <label className="field">
              <span>スタッフ</span>
              <select value={shiftForm.staffId} onChange={(event) => setShiftForm((current) => ({ ...current, staffId: event.target.value }))}>
                <option value="">選択してください</option>
                {state.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>開始</span>
              <TimeSelect value={shiftForm.start} onChange={(value) => setShiftForm((current) => ({ ...current, start: value }))} />
            </label>
            <label className="field">
              <span>終了</span>
              <TimeSelect value={shiftForm.end} onChange={(value) => setShiftForm((current) => ({ ...current, end: value }))} />
            </label>
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setShowShiftDialog(false)} type="button">キャンセル</button>
              <button type="submit">{shiftForm.id ? "保存" : "追加"}</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {showStaffDialog ? (
        <Dialog onClose={() => setShowStaffDialog(false)} title="スタッフ追加">
          <form className="dialog-panel" onSubmit={handleSaveStaff}>
            <h2>{staffForm.id ? "スタッフ変更" : "スタッフ追加"}</h2>
            <label className="field">
              <span>名前</span>
              <input required value={staffForm.name} onChange={(event) => setStaffForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>時給</span>
              <input min="0" required step="0.01" type="number" value={staffForm.wage} onChange={(event) => setStaffForm((current) => ({ ...current, wage: event.target.value }))} />
            </label>
            <label className="field">
              <span>スタッフコード</span>
              <input inputMode="numeric" maxLength="5" pattern="[0-9]{5}" required value={staffForm.code} onChange={(event) => setStaffForm((current) => ({ ...current, code: event.target.value }))} />
            </label>
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setShowStaffDialog(false)} type="button">キャンセル</button>
              <button type="submit">{staffForm.id ? "保存" : "追加"}</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {showStaffCodeDialog ? (
        <Dialog onClose={() => setShowStaffCodeDialog(false)} title="スタッフコード">
          <div className="dialog-panel code-dialog-panel">
            <h2>スタッフコード</h2>
            <div className="large-code-name">{selectedStaffCode.name}</div>
            <div className="large-code">{selectedStaffCode.code}</div>
            <div className="dialog-actions">
              <button onClick={() => setShowStaffCodeDialog(false)} type="button">Close</button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {showPunchDialog ? (
        <Dialog onClose={() => setShowPunchDialog(false)} title="勤務記録の編集">
          <form className="dialog-panel" onSubmit={handleSavePunch}>
            <h2>{punchForm.mode === "create" ? "勤務記録を追加" : "勤務記録を編集"}</h2>
            <label className="field">
              <span>スタッフ</span>
              {punchForm.mode === "create" ? (
                <select
                  name="staffId"
                  value={punchForm.staffId}
                  onChange={(event) => setPunchForm((current) => ({ ...current, staffId: event.target.value }))}
                >
                  <option value="">選択してください</option>
                  {state.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              ) : (
                <input disabled value={punchForm.staffName} />
              )}
            </label>
            <label className="field">
              <span>開始</span>
              <div className="date-time-fields">
                <input
                  name="startDate"
                  required
                  type="date"
                  value={punchForm.startDate}
                  onChange={(event) => setPunchForm((current) => ({ ...current, startDate: event.target.value }))}
                />
                <TimeSelect
                  name="startTime"
                  stepMinutes={1}
                  value={punchForm.startTime}
                  onChange={(value) => setPunchForm((current) => ({ ...current, startTime: value }))}
                />
              </div>
            </label>
            <label className="field">
              <span>終了</span>
              <div className="date-time-fields">
                <input
                  name="endDate"
                  type="date"
                  value={punchForm.endDate}
                  onChange={(event) => setPunchForm((current) => ({ ...current, endDate: event.target.value }))}
                />
                <TimeSelect
                  allowEmpty
                  name="endTime"
                  stepMinutes={1}
                  value={punchForm.endTime}
                  onChange={(value) => setPunchForm((current) => ({ ...current, endTime: value }))}
                />
              </div>
            </label>
            <label className="checkbox-field">
              <input
                name="payrollFromActualStart"
                type="checkbox"
                checked={punchForm.payrollFromActualStart}
                onChange={(event) => setPunchForm((current) => ({ ...current, payrollFromActualStart: event.target.checked }))}
              />
              <span>早出として実打刻の開始時刻から給与計算</span>
            </label>
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setShowPunchDialog(false)} type="button">キャンセル</button>
              <button type="submit">{punchForm.mode === "create" ? "追加" : "保存"}</button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {showSaveDialog ? (
        <Dialog onClose={() => setShowSaveDialog(false)} title="保存形式">
          <div className="dialog-panel">
            <h2>保存形式</h2>
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setShowSaveDialog(false)} type="button">キャンセル</button>
              <button className="secondary" onClick={() => {
                exportSheet(state, payStart, payEnd, payStaff);
                setShowSaveDialog(false);
              }} type="button">スプレッドシート</button>
              <button onClick={() => {
                exportPdf(state, payStart, payEnd, payStaff);
                setShowSaveDialog(false);
              }} type="button">PDF</button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function OnlineStaffPanel({ data, error, loading, onNextWeek, onPreviousWeek, onRefresh, onRequest, onWithdrawRequest, onRequestSwap, onCancelSwap, onAcceptSwap, staffId }) {
  const dates = data ? weekDates(data.weekStart) : [];
  return (
    <section className="online-manager-panel" aria-labelledby="onlineStaffHeading">
      <div className="online-manager-heading">
        <div>
          <p className="eyebrow">SUPABASE ONLINE</p>
          <h2 id="onlineStaffHeading">My Shifts</h2>
        </div>
        <button className="ghost" disabled={loading} onClick={onRefresh} type="button">{loading ? "Loading..." : "Refresh"}</button>
        <button onClick={onRequest} type="button">Request shift</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!data && loading ? <p className="empty">Loading your shifts.</p> : null}
      {data ? (
        <>
          <div className="online-week-controls">
            <button aria-label="Previous week" className="ghost" onClick={onPreviousWeek} type="button">‹</button>
            <strong>{weekDayLabel(data.weekStart, "en")} - {weekDayLabel(data.weekEnd, "en")}</strong>
            <button aria-label="Next week" className="ghost" onClick={onNextWeek} type="button">›</button>
          </div>
          <div className="online-table-wrap">
            <table className="online-table">
              <thead><tr><th>Date</th><th>Shift</th><th>Note</th></tr></thead>
              <tbody>
                {dates.map((date) => {
                  const shifts = data.shifts.filter((shift) => shift.date === date);
                  return shifts.length ? shifts.map((shift) => (
                    <tr key={shift.id}><td>{weekDayLabel(date, "en")}</td><td>{displayShiftLabel(shift)}</td><td>{shift.note || ""} <button className="compact-edit ghost" onClick={() => onRequestSwap(shift.id)} type="button">Request swap</button></td></tr>
                  )) : <tr key={date}><td>{weekDayLabel(date, "en")}</td><td colSpan="2" className="muted-cell">No shift</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="online-staff-list">
            <h3>Open Shift Swaps</h3>
            {data.shiftSwaps.length ? data.shiftSwaps.map((swap) => (
              <div className="online-staff-row" key={swap.id}>
                <span>{swap.date}</span>
                <span>{minutesToTime(swap.start)} - {minutesToTime(swap.end)}</span>
                <span>{swap.note}</span>
                {swap.fromStaffId === staffId ? <button className="compact-edit ghost" onClick={() => onCancelSwap(swap.id)} type="button">Cancel</button> : <button className="compact-edit ghost" onClick={() => onAcceptSwap(swap.id)} type="button">Accept</button>}
              </div>
            )) : <p className="empty">No open shift swaps.</p>}
          </div>
          <div className="online-staff-list">
            <h3>My Shift Requests</h3>
            {data.shiftRequests.length ? data.shiftRequests.map((request) => (
              <div className="online-staff-row" key={request.id}>
                <span>{request.date}</span>
                <span>{minutesToTime(request.start)} - {minutesToTime(request.end)}</span>
                <span>{request.status}</span>
                {request.status === "submitted" ? <button className="compact-edit ghost" onClick={() => onWithdrawRequest(request.id)} type="button">Withdraw</button> : null}
              </div>
            )) : <p className="empty">No shift requests.</p>}
          </div>
          <div className="online-staff-list">
            <h3>Published Payroll</h3>
            {data.payrolls.length ? data.payrolls.map((payroll) => (
              <div className="online-staff-row" key={payroll.id}>
                <span>{payroll.period_start} - {payroll.period_end}</span>
                <span>{(payroll.total_minutes / 60).toFixed(2)} hours</span>
                <strong>{Number(payroll.total_pay).toFixed(1)}</strong>
              </div>
            )) : <p className="empty">No published payroll.</p>}
          </div>
        </>
      ) : null}
    </section>
  );
}

function OnlineTerminalPanel({ data, error, loading, staffId, code, codeError, onCodeChange, onCodeSubmit, onClockIn, onClockOut, onRefresh }) {
  const person = data?.staff?.find((item) => item.id === staffId);
  const activePunch = data?.punches?.find((punch) => punch.staffId === staffId && !punch.endAt);
  const shifts = data?.shifts?.filter((shift) => shift.staffId === staffId) || [];
  return (
    <section className="online-manager-panel terminal-panel" aria-labelledby="terminalHeading">
      <div className="online-manager-heading">
        <div>
          <p className="eyebrow">SUPABASE TERMINAL</p>
          <h2 id="terminalHeading">Staff Sign In</h2>
        </div>
        <button className="ghost" disabled={loading} onClick={onRefresh} type="button">{loading ? "Loading..." : "Refresh"}</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <form className="code-form" onSubmit={onCodeSubmit}>
        <label className="field">
          <span>Staff Code</span>
          <input autoComplete="off" inputMode="numeric" maxLength="5" pattern="[0-9]{5}" required value={code} onChange={(event) => onCodeChange(event.target.value)} />
        </label>
        <button type="submit">Continue</button>
      </form>
      {codeError ? <p className="error">Staff code not found.</p> : null}
      {person ? <p className="terminal-welcome">Welcome, {person.name}</p> : <p className="empty">Enter your staff code.</p>}
      {activePunch ? (
        <div className="status-box">
          <span>Signed in since {timeLabel(new Date(activePunch.startAt))}</span>
          <button className="danger" onClick={onClockOut} type="button">Sign Out</button>
        </div>
      ) : null}
      {person && !activePunch ? (
        <div className="shift-grid">
          {shifts.length ? shifts.map((shift) => {
            const punch = data.punches.find((item) => item.shiftId === shift.id);
            return (
              <article className="shift-card" key={shift.id}>
                <strong>Your scheduled shift</strong>
                <div className="meta">{minutesToTime(shift.start)} - {minutesToTime(shift.end)}</div>
                {punch ? <div className="meta">Already signed in</div> : <button onClick={() => onClockIn(shift)} type="button">Sign In</button>}
              </article>
            );
          }) : <p className="empty">No shift scheduled for today.</p>}
        </div>
      ) : null}
    </section>
  );
}

function OnlineManagerPanel({ data, error, loading, onAddPunch, onAddShift, onAddStaff, onDeleteStaff, onEditPunch, onEditShift, onEditStaff, onNextWeek, onPreviousWeek, onRefresh, onCalculatePayroll, onExportPayroll, onExportPayrollPdf, onImportBackup, onSaveSettings, onUpdateRequest, payrollResult }) {
  const [activeTab, setActiveTab] = useState("shifts");
  const staffById = new Map((data?.staff || []).map((person) => [person.id, person]));
  const dates = data ? weekDates(data.weekStart) : [];
  return (
    <section className="online-manager-panel" aria-label="管理画面">
      <div className="online-manager-heading">
        <button className="ghost" disabled={loading} onClick={onRefresh} type="button">
          {loading ? "読み込み中..." : "更新"}
        </button>
      </div>
      <nav className="online-manager-tabs" aria-label="管理画面の切り替え">
        {[["shifts", "シフト"], ["attendance", "勤務状況"], ["staff", "スタッフ"], ["payroll", "給与計算"], ["management", "設定"]].map(([id, label]) => (
          <button className={activeTab === id ? "active" : ""} key={id} onClick={() => setActiveTab(id)} type="button">{label}</button>
        ))}
      </nav>
      {error ? <p className="error">{error}</p> : null}
      {!data && loading ? <p className="empty">Supabaseからデータを読み込んでいます。</p> : null}
      {data ? (
        <>
          {activeTab === "shifts" ? <>
            <div className="online-week-controls">
              <button aria-label="オンラインの前の週" className="ghost" onClick={onPreviousWeek} type="button">‹</button>
              <strong>{weekDayLabel(data.weekStart, "ja")} - {weekDayLabel(data.weekEnd, "ja")}</strong>
              <button aria-label="オンラインの次の週" className="ghost" onClick={onNextWeek} type="button">›</button>
            </div>
            <div className="online-summary">
              <span>スタッフ {data.staff.length}名</span>
              <span>シフト {data.shifts.length}件</span>
              <span>取得 {dateTimeLabel(data.loadedAt)}</span>
            </div>
            <div className="online-actions">
              <button onClick={onAddShift} type="button">シフト追加</button>
            </div>
            <div className="online-table-wrap">
              <table className="online-table">
                <thead><tr><th>日付</th><th>スタッフ</th><th>予定</th><th>状態</th><th>備考</th><th>操作</th></tr></thead>
                <tbody>
                  {dates.map((date) => {
                    const shifts = data.shifts.filter((shift) => shift.date === date);
                    if (!shifts.length) return <tr key={date}><td>{weekDayLabel(date, "ja")}</td><td colSpan="5" className="muted-cell">シフトなし</td></tr>;
                    return shifts.map((shift) => <tr key={shift.id}><td>{weekDayLabel(date, "ja")}</td><td>{staffById.get(shift.staffId)?.name || "未登録"}</td><td>{displayShiftLabel(shift)}</td><td>{shift.status === "draft" ? "下書き" : "公開"}</td><td>{shift.note || ""}</td><td><button className="compact-edit ghost" onClick={() => onEditShift(shift)} type="button">変更</button></td></tr>);
                  })}
                </tbody>
              </table>
            </div>
          </> : null}
          <div className="online-staff-list">
            {activeTab === "staff" ? <>
            <div className="online-actions"><button onClick={onAddStaff} type="button">スタッフ追加</button></div>
            {data.staff.length ? data.staff.map((person) => (
              <div className="online-staff-row" key={person.id}>
                <span>{person.name}</span>
                <span>{person.active ? "有効" : "停止中"}</span>
                <span>{person.wage.toFixed(2)} / 時間</span>
                <span>コード {person.code || "未設定"}</span>
                <button className="compact-edit ghost" onClick={() => onEditStaff(person)} type="button">変更</button>
                <button className={person.active ? "compact-edit danger" : "compact-edit ghost"} onClick={() => onDeleteStaff(person)} type="button">{person.active ? "削除" : "有効化"}</button>
              </div>
            )) : <p className="empty">スタッフはまだ登録されていません。</p>}
            </> : null}
          </div>
          <div className="online-staff-list">
            {activeTab === "shifts" ? <>
            <div className="online-manager-heading"><h3>シフト希望</h3></div>
            <div className="online-table-wrap">
              <table className="online-table">
                <thead><tr><th>希望日</th><th>スタッフ</th><th>希望時間</th><th>状態</th><th>備考</th><th>操作</th></tr></thead>
                <tbody>
                  {data.shiftRequests.length ? data.shiftRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.date}</td>
                      <td>{staffById.get(request.staffId)?.name || "未登録"}</td>
                      <td>{minutesToTime(request.start)} - {minutesToTime(request.end)}</td>
                      <td>{request.status}</td>
                      <td>{request.note}</td>
                      <td>{request.status === "submitted" ? <><button className="compact-edit ghost" onClick={() => onUpdateRequest(request.id, "approved")} type="button">承認</button> <button className="compact-edit ghost" onClick={() => onUpdateRequest(request.id, "rejected")} type="button">却下</button></> : "-"}</td>
                    </tr>
                  )) : <tr><td colSpan="6" className="muted-cell">シフト希望はありません。</td></tr>}
                </tbody>
              </table>
            </div>
            </> : null}
          </div>
          <div className="online-staff-list">
            {activeTab === "shifts" ? <>
            <div className="online-manager-heading"><h3>シフト交代</h3></div>
            <div className="online-table-wrap">
              <table className="online-table">
                <thead><tr><th>日付</th><th>元スタッフ</th><th>時間</th><th>状態</th><th>メモ</th></tr></thead>
                <tbody>
                  {data.shiftSwaps.length ? data.shiftSwaps.map((swap) => (
                    <tr key={swap.id}>
                      <td>{swap.date}</td>
                      <td>{staffById.get(swap.fromStaffId)?.name || "未登録"}</td>
                      <td>{minutesToTime(swap.start)} - {minutesToTime(swap.end)}</td>
                      <td>{swap.status}</td>
                      <td>{swap.note}</td>
                    </tr>
                  )) : <tr><td colSpan="5" className="muted-cell">シフト交代の申請はありません。</td></tr>}
                </tbody>
              </table>
            </div>
            </> : null}
          </div>
          <div className="online-staff-list">
            {activeTab === "payroll" ? <>
            <h3>給与計算</h3>
            <form className="payroll-controls online-payroll-controls" onSubmit={onCalculatePayroll}>
              <input name="startDate" required type="date" defaultValue={data.weekStart} />
              <span>から</span>
              <input name="endDate" required type="date" defaultValue={data.weekEnd} />
              <select aria-label="給与計算の対象スタッフ" defaultValue="all" name="staffId">
                <option value="all">全員まとめて</option>
                {data.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
              <button type="submit">計算</button>
              <button className="secondary" onClick={onExportPayroll} type="button">保存</button>
              <button className="secondary" onClick={onExportPayrollPdf} type="button">PDF</button>
            </form>
            <div className="online-payroll-table">
              {payrollResult.map((row) => (
                <div className="online-staff-row online-payroll-row" key={row.person.id}>
                  <span>{row.person.name}</span>
                  <span>{row.hours.toFixed(2)}時間</span>
                  <strong>{row.pay.toFixed(1)}</strong>
                </div>
              ))}
            </div>
            </> : null}
          </div>
          <div className="online-staff-list">
            {activeTab === "attendance" ? <>
            <div className="online-manager-heading">
              <h3>勤務実績</h3>
              <button className="ghost" onClick={onAddPunch} type="button">追加</button>
            </div>
            <div className="online-table-wrap">
              <table className="online-table">
                <thead><tr><th>日付</th><th>スタッフ</th><th>開始</th><th>終了</th><th>操作</th></tr></thead>
                <tbody>
                  {onlinePunchRows(data).length ? onlinePunchRows(data).map((punch) => (
                    <tr key={punch.id}><td>{punch.date}</td><td>{punch.staff}</td><td>{punch.start}</td><td>{punch.end}</td><td><button className="compact-edit ghost" onClick={() => onEditPunch(punch)} type="button">修正</button></td></tr>
                  )) : <tr><td colSpan="5" className="muted-cell">勤務実績はありません。</td></tr>}
                </tbody>
              </table>
            </div>
            </> : null}
          </div>
          <div className="online-staff-list">
            {activeTab === "management" ? <>
              <h3>バックアップ</h3>
              <div className="online-actions">
                <label className="import-button">バックアップから復元<input accept="application/json,.json" onChange={onImportBackup} type="file" /></label>
              </div>
              <form className="passcode-form online-settings-form" onSubmit={onSaveSettings}>
                <label className="field"><span>店舗名</span><input name="storeName" required defaultValue={data.settings?.store_name || "Sakura Mart"} /></label>
                <label className="field"><span>管理者パスコード</span><input name="adminPasscode" required type="password" defaultValue={data.settings?.admin_passcode || "1968"} /></label>
                <button type="submit">保存</button>
              </form>
            </> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function WeeklyShiftTable({ dates, onEditShift, onNoteChange, state }) {
  return (
    <div className="week-table">
      <div className="week-table-head">
        <div>日付</div>
        <div>名前・シフト</div>
        <div>備考</div>
      </div>
      {dates.map((date) => {
        const shifts = state.shifts
          .filter((shift) => shift.date === date)
          .sort((a, b) => a.start - b.start);
        return (
          <div className="week-table-row" key={date}>
            <div className="week-date">{weekDayLabel(date, "ja")}</div>
            <div className="week-shifts">
              <div className="compact-scale"><span>8</span><span>14</span><span>20</span></div>
              {shifts.length ? shifts.map((shift) => {
                const punch = shiftPunch(state, shift);
                const actual = punch ? actualShiftTimes(punch) : null;
                return (
                  <div className="compact-shift" key={shift.id}>
                    <div className="compact-name">{staffName(state, shift.staffId)}</div>
                    <div className="compact-track stacked">
                      <div className="compact-bar planned" style={compactShiftStyle(shift)} />
                      {actual ? <div className="compact-bar actual" style={compactShiftStyle(actual)} /> : null}
                    </div>
                    <div className="compact-time">
                      <span>予定 {displayShiftLabel(shift)}</span>
                      {actual ? <span>実績 {minutesToTime(actual.start)}-{minutesToTime(actual.end)}</span> : null}
                    </div>
                    <button className="compact-edit ghost" onClick={() => onEditShift(shift)} type="button">変更</button>
                  </div>
                );
              }) : <div className="compact-empty">-</div>}
            </div>
            <input className="week-note" data-date={date} onChange={(event) => onNoteChange(date, event.target.value)} placeholder="祝日・イベント" value={state.shiftNotes[date] || ""} />
          </div>
        );
      })}
    </div>
  );
}

function ShiftTimeline({ locale, now, shifts, state }) {
  if (!shifts.length) {
    return <div className="empty">{locale === "en" ? "No shifts." : "シフトはまだありません。"}</div>;
  }

  const grouped = Object.entries(shifts.reduce((result, shift) => {
    result[shift.date] ||= [];
    result[shift.date].push(shift);
    return result;
  }, {}));

  return grouped.map(([date, dateShifts]) => {
    const bounds = timelineBounds(state, dateShifts, locale === "en", now);
    return (
      <section className="timeline-day" key={date}>
        <div className="timeline-date">{locale === "en" ? weekDayLabel(date, "en") : date}</div>
        <div className="timeline-scale">
          <span>{minutesToTime(bounds.start)}</span>
          <span>{minutesToTime(Math.floor((bounds.start + bounds.end) / 2))}</span>
          <span>{minutesToTime(bounds.end)}</span>
        </div>
        {dateShifts.sort((a, b) => a.start - b.start).map((shift) => {
          const punch = shiftPunch(state, shift);
          if (locale === "en") {
            const actual = punch ? actualShiftTimes(punch, now) : null;
            return (
              <div className="timeline-row" key={shift.id}>
                <div className="timeline-person">
                  <div className="title">{staffName(state, shift.staffId)}</div>
                  <div className="sub">{shiftCoverageLabel(state, shift, punch, "en")}</div>
                </div>
                <div className="timeline-track stacked">
                  <div className="timeline-block planned" style={timelineStyle(shift, bounds)}>
                    <strong>Scheduled {displayShiftLabel(shift)}</strong>
                  </div>
                  {actual ? (
                    <div className="timeline-block actual" style={timelineStyle(actual, bounds)}>
                      <strong>Actual {minutesToTime(actual.start)} - {minutesToTime(actual.end)}</strong>
                      <span>{shiftStatusLabel(punch, "en")}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }

          const display = displayShiftTimes(punch, shift);
          return (
            <div className="timeline-row" key={shift.id}>
              <div className="timeline-person">
                <div className="title">{staffName(state, shift.staffId)}</div>
                <div className="sub">{shiftCoverageLabel(state, shift, punch, "ja")}</div>
              </div>
              <div className="timeline-track">
                <div className={`timeline-block ${punch ? "worked" : ""}`} style={timelineStyle({ start: display.start, end: display.end || display.start + 15 }, bounds)}>
                  <strong>{minutesToTime(display.start)} - {display.end ? minutesToTime(display.end) : "..."}</strong>
                  <span>{shiftStatusLabel(punch, "ja")}</span>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    );
  });
}

function SigninCard({ assigned, isSwap = false, onClockIn, shift }) {
  const title = isSwap ? `Cover ${assigned}'s shift` : "Your scheduled shift";
  const note = isSwap ? "This will be recorded as coverage." : "Sign in for your scheduled shift.";
  return (
    <article className={`shift-card ${isSwap ? "swap" : ""}`}>
      <strong>{title}</strong>
      <div className="meta">{displayShiftLabel(shift)}</div>
      <div className="meta">{note}</div>
      <button data-shift-id={shift.id} onClick={() => onClockIn(shift.id)} type="button">Sign In</button>
    </article>
  );
}

function TimeSelect({ allowEmpty = false, name, onChange, stepMinutes = 15, value }) {
  const options = [];
  if (allowEmpty) options.push(<option key="empty" value="">未入力</option>);
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const label = minutesToTime(minutes);
    options.push(<option key={label} value={label}>{label}</option>);
  }
  return <select className="time-select" name={name} value={value} onChange={(event) => onChange(event.target.value)}>{options}</select>;
}

function Dialog({ children, onClose }) {
  return (
    <div className="dialog" role="dialog" aria-modal="true" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
