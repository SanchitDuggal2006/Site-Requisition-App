import { describe, it, expect } from "vitest";
import {
  canTransition,
  transitions,
  pinSchema,
  phoneSchema,
  today,
  itemStatus,
  overdue,
  requisitionSchema,
} from "../server/domain";
describe("business rules", () => {
  it("permits only one-way requisition transitions", () => {
    for (const from of Object.keys(transitions))
      for (const to of Object.keys(transitions))
        expect(canTransition(from, to)).toBe(
          from === "SUBMITTED" &&
            ["APPROVED", "REJECTED", "CANCELLED"].includes(to),
        );
    const walk = (node: string, path: string[]) => {
      expect(path.includes(node)).toBe(false);
      for (const next of transitions[node]) walk(next, [...path, node]);
    };
    walk("SUBMITTED", []);
  });
  it("normalizes Indian and international phone numbers", () => {
    expect(phoneSchema.parse("98765 04321")).toBe("+919876504321");
    expect(phoneSchema.parse("+44 7700 900123")).toBe("+447700900123");
    expect(phoneSchema.safeParse("123").success).toBe(false);
  });
  it("rejects predictable and malformed PINs", () => {
    for (const pin of [
      "123456",
      "000000",
      "111111",
      "654321",
      "12345",
      "12ab34",
    ])
      expect(pinSchema.safeParse(pin).success).toBe(false);
    expect(pinSchema.safeParse("681429").success).toBe(true);
    expect(pinSchema.safeParse("121212").success).toBe(true);
    expect(pinSchema.safeParse("112233").success).toBe(true);
  });
  it("uses business midnight, not UTC midnight", () => {
    expect(today("Asia/Kolkata", new Date("2026-11-02T18:29:59Z"))).toBe(
      "2026-11-02",
    );
    expect(today("Asia/Kolkata", new Date("2026-11-02T18:30:00Z"))).toBe(
      "2026-11-03",
    );
  });
  it("derives partial, completed and cancelled states", () => {
    const base = {
      quantity: 20,
      cancelled: 0,
      dispatched: 0,
      received: 0,
      ordered: false,
    };
    expect(itemStatus(base)).toBe("TO_ORDER");
    expect(itemStatus({ ...base, ordered: true })).toBe("ORDERED");
    expect(itemStatus({ ...base, dispatched: 12 })).toBe("DISPATCHED");
    expect(itemStatus({ ...base, dispatched: 12, received: 10 })).toBe(
      "PART_RECEIVED",
    );
    expect(
      itemStatus({ ...base, dispatched: 12, received: 12, cancelled: 8 }),
    ).toBe("DELIVERED");
    expect(itemStatus({ ...base, cancelled: 20 })).toBe("CANCELLED");
  });
  it("excludes closed items from overdue", () => {
    expect(overdue("2026-11-01", "ORDERED", "2026-11-02")).toBe(true);
    expect(overdue("2026-11-02", "ORDERED", "2026-11-02")).toBe(false);
    expect(overdue("2026-11-01", "DELIVERED", "2026-11-02")).toBe(false);
  });
  it("validates quantities and real calendar dates", () => {
    const data = {
      key: crypto.randomUUID(),
      siteId: crypto.randomUUID(),
      items: [
        {
          description: "Plywood",
          quantity: 1.125,
          unit: "sheet",
          requiredBy: "2026-11-03",
        },
      ],
    };
    expect(requisitionSchema.safeParse(data).success).toBe(true);
    for (const quantity of [0, -1, 1.0001])
      expect(
        requisitionSchema.safeParse({
          ...data,
          items: [{ ...data.items[0], quantity }],
        }).success,
      ).toBe(false);
    expect(
      requisitionSchema.safeParse({
        ...data,
        items: [{ ...data.items[0], requiredBy: "2026-02-30" }],
      }).success,
    ).toBe(false);
  });
});
