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
