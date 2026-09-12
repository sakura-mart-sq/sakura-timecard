import { describe, expect, it, vi } from "vitest";
import { fetchManagerSnapshot, inviteOnlineStaff, saveOnlineStaff } from "./online.js";

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
