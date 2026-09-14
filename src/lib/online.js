import { addDays, dateTimeFromDateKeyAndMinutes, dateTimeFromFields, dateKey, timeLabel } from "./time.js";

function toShift(row) {
  return {
    id: row.id,
    date: row.work_date,
    staffId: row.staff_id,
    start: row.start_minute,
    end: row.end_minute,
    note: row.note || "",
    status: row.status,
  };
}

function toStaff(row, code = "") {
  return {
    id: row.id,
    name: row.name,
    wage: Number(row.hourly_wage),
    active: row.active,
    code,
  };
}

function toPunch(row) {
  return {
    id: row.id,
    staffId: row.staff_id,
    shiftId: row.shift_id,
    scheduledStaffId: row.scheduled_staff_id,
    startAt: row.clock_in,
    endAt: row.clock_out,
    payrollFromActualStart: row.payroll_from_actual_start,
  };
}

function toShiftRequest(row) {
  return {
    id: row.id,
    staffId: row.staff_id,
    date: row.work_date,
    start: row.requested_start,
    end: row.requested_end,
    note: row.note || "",
    status: row.status,
    managerNote: row.manager_note || "",
    createdAt: row.created_at,
  };
}

function toShiftSwap(row) {
  const shift = row.shifts || {};
  return {
    id: row.id,
    shiftId: row.shift_id,
    fromStaffId: row.from_staff_id,
    acceptedBy: row.accepted_by,
    status: row.status,
    note: row.note || "",
    date: shift.work_date,
    start: shift.start_minute,
    end: shift.end_minute,
    createdAt: row.created_at,
  };
}

export async function fetchManagerSnapshot(client, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const start = dateTimeFromFields(weekStart, "00:00").toISOString();
  const end = dateTimeFromFields(addDays(weekEnd, 1), "00:00").toISOString();
  const [staffResult, codeResult, shiftResult, punchResult, payrollResult, requestResult, swapResult] = await Promise.all([
    client.from("staff").select("id, name, hourly_wage, active").order("name"),
    client.from("staff_codes").select("staff_id, code"),
    client
      .from("shifts")
      .select("id, work_date, staff_id, start_minute, end_minute, note, status")
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date")
      .order("start_minute"),
    client
      .from("punches")
      .select("id, staff_id, shift_id, scheduled_staff_id, clock_in, clock_out, payroll_from_actual_start")
      .gte("clock_in", start)
      .lt("clock_in", end)
      .order("clock_in"),
    client
      .from("payrolls")
      .select("id, staff_id, period_start, period_end, total_minutes, total_pay, status, finalized_at")
      .eq("period_start", weekStart)
      .eq("period_end", weekEnd),
    client
      .from("shift_requests")
      .select("id, staff_id, work_date, requested_start, requested_end, note, status, manager_note, created_at")
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date")
      .order("created_at", { ascending: false }),
    client
      .from("shift_swaps")
      .select("id, shift_id, from_staff_id, accepted_by, status, note, created_at, shifts!inner(work_date, start_minute, end_minute)")
      .order("created_at", { ascending: false }),
  ]);

  if (staffResult.error) throw staffResult.error;
  if (codeResult.error) throw codeResult.error;
  if (shiftResult.error) throw shiftResult.error;
  if (punchResult.error) throw punchResult.error;
  if (payrollResult.error) throw payrollResult.error;
  if (requestResult.error) throw requestResult.error;
  if (swapResult.error) throw swapResult.error;

  return {
    staff: (staffResult.data || []).map((row) => toStaff(row, (codeResult.data || []).find((item) => item.staff_id === row.id)?.code || "")),
    shifts: (shiftResult.data || []).map(toShift),
    punches: (punchResult.data || []).map(toPunch),
    payrolls: payrollResult.data || [],
    shiftRequests: (requestResult.data || []).map(toShiftRequest),
    shiftSwaps: (swapResult.data || []).map(toShiftSwap),
    weekStart,
    weekEnd,
    loadedAt: new Date(),
  };
}

export async function fetchStaffSnapshot(client, staffId, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const [shiftResult, payrollResult, requestResult, swapResult] = await Promise.all([
    client
      .from("shifts")
      .select("id, work_date, staff_id, start_minute, end_minute, note, status")
      .eq("staff_id", staffId)
      .eq("status", "published")
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date")
      .order("start_minute"),
    client
      .from("payrolls")
      .select("id, period_start, period_end, total_minutes, total_pay, status")
      .eq("staff_id", staffId)
      .eq("status", "published")
      .order("period_start", { ascending: false }),
    client
      .from("shift_requests")
      .select("id, staff_id, work_date, requested_start, requested_end, note, status, manager_note, created_at")
      .eq("staff_id", staffId)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date")
      .order("created_at", { ascending: false }),
    client
      .from("shift_swaps")
      .select("id, shift_id, from_staff_id, accepted_by, status, note, created_at, shifts!inner(work_date, start_minute, end_minute)")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);
  if (shiftResult.error) throw shiftResult.error;
  if (payrollResult.error) throw payrollResult.error;
  if (requestResult.error) throw requestResult.error;
  if (swapResult.error) throw swapResult.error;
  return {
    shifts: (shiftResult.data || []).map(toShift),
    payrolls: payrollResult.data || [],
    shiftRequests: (requestResult.data || []).map(toShiftRequest),
    shiftSwaps: (swapResult.data || []).map(toShiftSwap),
    weekStart,
    weekEnd,
    loadedAt: new Date(),
  };
}

export function onlinePayrollRows(snapshot) {
  return (snapshot?.staff || []).map((person) => {
    const minutes = (snapshot.punches || []).reduce((total, punch) => {
      if (punch.staffId !== person.id || !punch.endAt) return total;
      let paidStart = new Date(punch.startAt);
      const ended = new Date(punch.endAt);
      if (!punch.payrollFromActualStart) {
        const shift = snapshot.shifts.find((item) => item.id === punch.shiftId);
        if (shift) {
          const scheduledStart = dateTimeFromDateKeyAndMinutes(shift.date, shift.start);
          if (scheduledStart > paidStart) paidStart = scheduledStart;
        }
      }
      return total + Math.max(0, (ended - paidStart) / 60000);
    }, 0);
    return { person, minutes, hours: minutes / 60, pay: (minutes / 60) * person.wage };
  });
}

export function onlinePunchRows(snapshot) {
  const staffById = new Map((snapshot?.staff || []).map((person) => [person.id, person]));
  return [...(snapshot?.punches || [])].sort((a, b) => new Date(b.startAt) - new Date(a.startAt)).map((punch) => ({
    ...punch,
    staff: staffById.get(punch.staffId)?.name || "未登録",
    date: dateKey(new Date(punch.startAt)),
    start: timeLabel(new Date(punch.startAt)),
    end: punch.endAt ? timeLabel(new Date(punch.endAt)) : "勤務中",
  }));
}

export async function hashStaffCode(code) {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function saveOnlineStaff(client, form) {
  const payload = {
    name: form.name.trim(),
    hourly_wage: Number(form.wage),
    active: form.active !== false,
  };
  if (form.code) payload.staff_code_hash = await hashStaffCode(form.code.trim());
  let staffId = form.id;
  if (form.id) {
    const { error } = await client.from("staff").update(payload).eq("id", form.id);
    if (error) throw error;
  } else {
    const { data, error } = await client.from("staff").insert(payload).select("id").single();
    if (error) throw error;
    staffId = data.id;
  }
  if (form.code) {
    const { error } = await client.from("staff_codes").upsert({ staff_id: staffId, code: form.code.trim() }, { onConflict: "staff_id" });
    if (error) {
      // Do not leave an online staff row without its required code after a failed create.
      if (!form.id) await client.from("staff").delete().eq("id", staffId);
      throw error;
    }
  }
  return staffId;
}

export async function inviteOnlineStaff(client, { staffId, email }) {
  const { data, error } = await client.functions.invoke("invite-staff", {
    body: { staffId, email: email.trim() },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function saveOnlineShift(client, form) {
  const payload = {
    work_date: form.date,
    staff_id: form.staffId,
    start_minute: Number(form.start),
    end_minute: Number(form.end),
    note: form.note?.trim() || "",
    status: form.status === "draft" ? "draft" : "published",
  };
  const query = form.id
    ? client.from("shifts").update(payload).eq("id", form.id)
    : client.from("shifts").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveOnlineShiftRequest(client, form, staffId) {
  const payload = {
    staff_id: staffId,
    work_date: form.date,
    requested_start: Number(form.start),
    requested_end: Number(form.end),
    note: form.note?.trim() || "",
    status: "submitted",
    manager_note: "",
  };
  const { error } = await client.from("shift_requests").insert(payload);
  if (error) throw error;
}

export async function withdrawOnlineShiftRequest(client, requestId) {
  const { error } = await client.from("shift_requests").update({ status: "withdrawn" }).eq("id", requestId);
  if (error) throw error;
}

export async function updateOnlineShiftRequest(client, requestId, status, managerNote = "") {
  const { error } = await client
    .from("shift_requests")
    .update({ status, manager_note: managerNote.trim() })
    .eq("id", requestId);
  if (error) throw error;
}

export async function saveOnlineShiftSwap(client, shiftId, staffId, note = "") {
  const { error } = await client.from("shift_swaps").insert({
    shift_id: shiftId,
    from_staff_id: staffId,
    status: "open",
    note: note.trim(),
  });
  if (error) throw error;
}

export async function cancelOnlineShiftSwap(client, swapId) {
  const { error } = await client.from("shift_swaps").update({ status: "cancelled" }).eq("id", swapId);
  if (error) throw error;
}

export async function acceptOnlineShiftSwap(client, swapId) {
  const { data, error } = await client.rpc("accept_shift_swap", { p_swap_id: swapId });
  if (error) throw error;
  return data;
}

export async function saveOnlinePunch(client, form) {
  const payload = {
    staff_id: form.staffId,
    shift_id: form.shiftId || null,
    scheduled_staff_id: form.scheduledStaffId || form.staffId,
    clock_in: dateTimeFromFields(form.startDate, form.startTime).toISOString(),
    clock_out: form.endDate && form.endTime
      ? dateTimeFromFields(form.endDate, form.endTime).toISOString()
      : null,
    payroll_from_actual_start: Boolean(form.payrollFromActualStart),
  };
  const query = form.id
    ? client.from("punches").update(payload).eq("id", form.id)
    : client.from("punches").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveOnlinePayroll(client, row, periodStart, periodEnd, status, userId) {
  const payload = {
    staff_id: row.person.id,
    period_start: periodStart,
    period_end: periodEnd,
    total_minutes: Math.round(row.minutes),
    total_pay: Number(row.pay.toFixed(2)),
    status,
    finalized_by: status === "finalized" || status === "published" ? userId : null,
    finalized_at: status === "finalized" || status === "published" ? new Date().toISOString() : null,
  };
  const { error } = await client
    .from("payrolls")
    .upsert(payload, { onConflict: "staff_id,period_start,period_end" });
  if (error) throw error;
}
