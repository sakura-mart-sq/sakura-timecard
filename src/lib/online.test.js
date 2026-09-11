import { describe, expect, it, vi } from "vitest";
import { fetchManagerSnapshot } from "./online.js";

function queryResult(data, error = null) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    then: (resolve) => Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

describe("online manager data", () => {
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
