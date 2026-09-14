import { describe, expect, it, vi } from "vitest";
import {
  fetchManagerSnapshot,
  acceptOnlineShiftSwap,
  cancelOnlineShiftSwap,
  inviteOnlineStaff,
  saveOnlineShiftRequest,
  saveOnlineShiftSwap,
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
    then: (resolve) => Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

describe("online manager data", () => {
  it("invokes the server-side staff invitation function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, invited: true, staffId: "staff-a" },
      error: null,
    });

    const result = await inviteOnlineStaff({ functions: { invoke } }, {
      staffId: "staff-a",
      email: "  staff@example.com ",
    });

    expect(invoke).toHaveBeenCalledWith("invite-staff", {
      body: { staffId: "staff-a", email: "staff@example.com" },
    });
    expect(result).toMatchObject({ ok: true, invited: true });
  });

  it("surfaces invitation function errors", async () => {
    await expect(inviteOnlineStaff({
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: new Error("network") }) },
    }, { staffId: "staff-a", email: "staff@example.com" })).rejects.toThrow("network");
  });

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
});
