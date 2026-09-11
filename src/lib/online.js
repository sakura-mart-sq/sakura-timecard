import { addDays } from "./time.js";

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

function toStaff(row) {
  return {
    id: row.id,
    name: row.name,
    wage: Number(row.hourly_wage),
    active: row.active,
  };
}

export async function fetchManagerSnapshot(client, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const [staffResult, shiftResult] = await Promise.all([
    client.from("staff").select("id, name, hourly_wage, active").order("name"),
    client
      .from("shifts")
      .select("id, work_date, staff_id, start_minute, end_minute, note, status")
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date")
      .order("start_minute"),
  ]);

  if (staffResult.error) throw staffResult.error;
  if (shiftResult.error) throw shiftResult.error;

  return {
    staff: (staffResult.data || []).map(toStaff),
    shifts: (shiftResult.data || []).map(toShift),
    weekStart,
    weekEnd,
    loadedAt: new Date(),
  };
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
  const query = form.id
    ? client.from("staff").update(payload).eq("id", form.id)
    : client.from("staff").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveOnlineShift(client, form) {
  const payload = {
    work_date: form.date,
    staff_id: form.staffId,
    start_minute: Number(form.start),
    end_minute: Number(form.end),
    note: form.note?.trim() || "",
    status: form.status || "published",
  };
  const query = form.id
    ? client.from("shifts").update(payload).eq("id", form.id)
    : client.from("shifts").insert(payload);
  const { error } = await query;
  if (error) throw error;
}
