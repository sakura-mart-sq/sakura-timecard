import { describe, expect, it, vi } from "vitest";
import {
  fetchManagerSnapshot,
  fetchOnlineBackup,
  fetchStaffSnapshot,
  importLegacyBackup,
  acceptOnlineShiftSwap,
  cancelOnlineShiftSwap,
  saveOnlineShiftRequest,
  saveOnlineShiftSwap,
  saveOnlinePayroll,
  saveOnlineStaff,
  updateOnlineShiftRequest,
  withdrawOnlineShiftRequest,
} from "./online.js";

function queryResult(data, error = null) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    lt: vi.fn(() => query),
    eq: vi.fn(() => query),
    range: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] || null : data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] || null : data, error }),
    then: (resolve) => Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

describe("online manager data", () => {
  it("removes a newly inserted staff when its code cannot be saved", async () => {
    const deleteQuery = { eq: vi.fn(() => Promise.resolve({ error: null })) };
    const insertedQuery = {
      select: vi.fn(() => insertedQuery),
      single: vi.fn().mockResolvedValue({ data: { id: "staff-new" }, error: null }),
    };
    const codeQuery = {
      upsert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
    };
    const client = {
      from: vi.fn((table) => table === "staff" ? {
        insert: vi.fn(() => insertedQuery),
        delete: vi.fn(() => deleteQuery),
      } : codeQuery),
    };

    await expect(saveOnlineStaff(client, {
      name: "新規スタッフ",
      wage: "18.00",
      code: "12345",
      active: true,
    })).rejects.toMatchObject({ code: "23505" });
    expect(client.from).toHaveBeenCalledWith("staff");
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", "staff-new");
  });

  it("creates, withdraws, and updates a shift request", async () => {
    const calls = [];
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn((payload) => {
          calls.push({ type: "insert", payload });
          return Promise.resolve({ error: null });
        }),
        update: vi.fn((payload) => {
          calls.push({ type: "update", payload });
          return { eq: vi.fn((field, value) => {
            calls.push({ type: "eq", field, value });
            return Promise.resolve({ error: null });
          }) };
        }),
      })),
    };

    await saveOnlineShiftRequest(client, { date: "2026-09-18", start: "600", end: "960", note: "イベント" }, "staff-a");
    await saveOnlineShiftRequest(client, { id: "request-a", date: "2026-09-19", start: "540", end: "900", note: "変更" }, "staff-a");
    await withdrawOnlineShiftRequest(client, "request-a");
    await updateOnlineShiftRequest(client, "request-a", "approved");

    expect(calls).toEqual([
      { type: "insert", payload: {
        staff_id: "staff-a",
        work_date: "2026-09-18",
        requested_start: 600,
        requested_end: 960,
        note: "イベント",
        status: "submitted",
        manager_note: "",
      } },
      { type: "update", payload: {
        work_date: "2026-09-19",
        requested_start: 540,
        requested_end: 900,
        note: "変更",
      } },
      { type: "eq", field: "id", value: "request-a" },
      { type: "update", payload: { status: "withdrawn" } },
      { type: "eq", field: "id", value: "request-a" },
      { type: "update", payload: { status: "approved", manager_note: "" } },
      { type: "eq", field: "id", value: "request-a" },
    ]);
  });

  it("creates, cancels, and accepts a shift swap", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const rpc = vi.fn().mockResolvedValue({ data: { id: "swap-a" }, error: null });
    const client = { from: vi.fn(() => ({ insert, update })), rpc };

    await saveOnlineShiftSwap(client, "shift-a", "staff-a", "よろしくお願いします");
    await cancelOnlineShiftSwap(client, "swap-a");
    await acceptOnlineShiftSwap(client, "swap-a");

    expect(insert).toHaveBeenCalledWith({
      shift_id: "shift-a",
      from_staff_id: "staff-a",
      status: "open",
      note: "よろしくお願いします",
    });
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(rpc).toHaveBeenCalledWith("accept_shift_swap", { p_swap_id: "swap-a" });
  });

  it("loads and maps staff and one week's shifts", async () => {
    const client = {
      from: vi.fn((table) => table === "staff"
        ? queryResult([{ id: "staff-a", name: "Aさん", hourly_wage: "18.25", active: true }])
        : queryResult([{
          id: "shift-a",
          work_date: "2026-09-14",
          staff_id: "staff-a",
          start_minute: 600,
          end_minute: 960,
          note: "イベント",
          status: "published",
        }])),
    };

    const result = await fetchManagerSnapshot(client, "2026-09-14");

    expect(result.weekEnd).toBe("2026-09-20");
    expect(result.staff[0]).toMatchObject({ id: "staff-a", name: "Aさん", wage: 18.25, active: true });
    expect(result.shifts[0]).toMatchObject({ id: "shift-a", date: "2026-09-14", start: 600, end: 960, status: "published" });
  });

  it("returns a database error to the caller", async () => {
    const client = {
      from: vi.fn(() => queryResult(null, { message: "permission denied" })),
    };

    await expect(fetchManagerSnapshot(client, "2026-09-14")).rejects.toMatchObject({ message: "permission denied" });
  });

  it("loads the signed-in staff profile and published payroll", async () => {
    const rows = {
      staff: [{ id: "staff-a", name: "Alex", hourly_wage: "18.50", active: true, email: "alex@example.com" }],
      payrolls: [{ id: "pay-a", staff_id: "staff-a", period_start: "2026-09-01", period_end: "2026-09-15", total_minutes: 360, total_pay: "111.00", status: "published" }],
      shifts: [],
      shift_requests: [],
      shift_swaps: [],
    };
    const client = { from: vi.fn((table) => queryResult(rows[table] || [])) };

    const snapshot = await fetchStaffSnapshot(client, "staff-a", "2026-09-14");

    expect(snapshot.person).toMatchObject({ name: "Alex", email: "alex@example.com", wage: 18.5 });
    expect(snapshot.payrolls[0]).toMatchObject({ id: "pay-a", status: "published" });
  });

  it("saves payroll for the manager-selected period and status", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const row = { person: { id: "staff-a" }, minutes: 360, pay: 111 };

    await saveOnlinePayroll(client, row, "2026-09-01", "2026-09-15", "published", "manager-a");

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      staff_id: "staff-a",
      period_start: "2026-09-01",
      period_end: "2026-09-15",
      status: "published",
      total_minutes: 360,
      total_pay: 111,
    }), { onConflict: "staff_id,period_start,period_end" });
  });

  it("builds a complete online backup including payroll and settings", async () => {
    const rows = {
      staff: [{ id: "staff-a", name: "Alex", hourly_wage: "18.50", active: false, email: "alex@example.com" }],
      staff_codes: [{ staff_id: "staff-a", code: "12345" }],
      shifts: [{ id: "shift-a", work_date: "2026-09-14", staff_id: "staff-a", start_minute: 540, end_minute: 900, note: "", status: "published" }],
      punches: [{ id: "punch-a", staff_id: "staff-a", shift_id: "shift-a", scheduled_staff_id: "staff-a", clock_in: "2026-09-14T16:00:00Z", clock_out: "2026-09-14T22:00:00Z", payroll_from_actual_start: false }],
      payrolls: [{ id: "pay-a", staff_id: "staff-a", period_start: "2026-09-01", period_end: "2026-09-15", total_minutes: 360, total_pay: "111.00", status: "published", finalized_at: "2026-09-16T00:00:00Z" }],
      shift_requests: [],
      shift_swaps: [],
      app_settings: [{ store_name: "Sakura Mart", admin_passcode: "1968" }],
    };
    const client = { from: vi.fn((table) => queryResult(rows[table])) };

    const backup = await fetchOnlineBackup(client);

    expect(backup).toMatchObject({ app: "sakura-mart-timecard", version: 2, source: "supabase" });
    expect(backup.data.staff[0]).toMatchObject({ code: "12345", wage: 18.5, active: false });
    expect(backup.data.payrolls[0]).toMatchObject({ totalMinutes: 360, totalPay: 111, status: "published" });
    expect(backup.data).toMatchObject({ storeName: "Sakura Mart", adminPasscode: "1968" });
  });

  it("restores inactive staff and published payroll from an online backup", async () => {
    const upserts = [];
    const success = { error: null };
    const client = {
      from: vi.fn((table) => ({
        select: vi.fn(() => ({ not: vi.fn().mockResolvedValue({ data: [], error: null }) })),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue(success),
          not: vi.fn().mockResolvedValue(success),
        })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue(success) })),
        upsert: vi.fn((payload) => {
          upserts.push({ table, payload });
          return Promise.resolve(success);
        }),
      })),
    };
    const staffId = "68da96e3-d037-4019-88a0-32c4aaaf4088";
    const shiftId = "7f0e2ec4-1a18-4d6b-ad67-f064e8223c51";
    const result = await importLegacyBackup(client, { data: {
      staff: [{ id: staffId, name: "Alex", wage: 18.5, code: "12345", active: false }],
      shifts: [{ id: shiftId, date: "2026-09-14", staffId, start: 540, end: 900, status: "published" }],
      punches: [],
      payrolls: [{ id: "2432f292-17a7-4e09-83d8-d429ba3b9300", staffId, periodStart: "2026-09-01", periodEnd: "2026-09-15", totalMinutes: 360, totalPay: 111, status: "published" }],
      shiftRequests: [],
      shiftSwaps: [],
      storeName: "Sakura Mart",
      adminPasscode: "1968",
    } });

    expect(upserts.find((entry) => entry.table === "staff").payload[0].active).toBe(false);
    expect(upserts.find((entry) => entry.table === "payrolls").payload[0]).toMatchObject({
      staff_id: staffId,
      total_minutes: 360,
      total_pay: 111,
      status: "published",
    });
    expect(result).toMatchObject({ staff: 1, shifts: 1, punches: 0, payrolls: 1 });
  });
});
