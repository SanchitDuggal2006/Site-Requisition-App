import { z } from "zod";
export const roles = ["DIRECTOR", "MANAGER", "SUPERVISOR", "PURCHASE"] as const;
export const units = [
  "nos",
  "kg",
  "bag",
  "sheet",
  "sqft",
  "rft",
  "metre",
  "litre",
  "tin",
  "box",
  "packet",
  "roll",
  "bundle",
  "set",
  "pair",
  "piece",
  "dozen",
  "gram",
  "quintal",
  "tonne",
  "mm",
  "cm",
  "foot",
  "inch",
  "yard",
  "sqm",
  "sqyd",
  "cft",
  "cum",
  "brass",
  "ml",
  "drum",
  "can",
  "bucket",
  "carton",
  "length",
  "coil",
  "truck",
  "trolley",
  "trip",
  "load",
  "running metre",
  "manday",
  "job",
  "lot",
] as const;
export const transitions: Record<string, string[]> = {
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};
export function canTransition(from: string, to: string) {
  return transitions[from]?.includes(to) ?? false;
}
export function today(tz = "Asia/Kolkata", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function normalizePhone(value: string) {
  const s = value.replace(/[\s()-]/g, "");
  return /^\d{10}$/.test(s) ? "+91" + s : s;
}
export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        "Enter a valid mobile number with country code",
      ),
  );
export const pinSchema = z
  .string()
  .regex(/^\d{6}$/, "Use six digits")
  .refine(
    (v) =>
      !/^([0-9])\1{5}$/.test(v) &&
      ![
        "123456",
        "654321",
        "012345",
        "543210",
        "987654",
        "456789",
        "234567",
        "345678",
        "567890",
      ].includes(v),
    "Avoid obvious PINs such as 123456 or six identical digits",
  );
export const qty = z.coerce
  .number()
  .positive()
  .max(999999999)
  .refine(
    (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001,
    "Use at most three decimal places",
  );
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const requisitionSchema = z.object({
  key: z.uuid(),
  siteId: z.uuid(),
  note: z.string().trim().max(300).default(""),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        quantity: qty,
        unit: z
          .string()
          .trim()
          .min(1)
          .max(30)
          .regex(/^[\p{L}\p{N} .()��/\-]+$/u, "Use a short unit name"),
        requiredBy: dateSchema,
      }),
    )
    .min(1)
    .max(50),
});
export const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  role: z.enum(roles),
  siteIds: z.array(z.uuid()).max(100),
  pin: z
    .string()
    .regex(/^\d{6}$/, "Use six digits")
    .optional(),
  active: z.boolean().default(true),
});
export function itemStatus(i: {
  quantity: number | string;
  cancelled: number | string;
  dispatched: number | string;
  received: number | string;
  ordered: boolean;
}) {
  const q = Number(i.quantity),
    c = Number(i.cancelled),
    d = Number(i.dispatched),
    r = Number(i.received);
  if (c === q) return "CANCELLED";
  if (r + c === q) return "DELIVERED";
  if (r > 0) return "PART_RECEIVED";
  if (d > 0) return "DISPATCHED";
  return i.ordered ? "ORDERED" : "TO_ORDER";
}
export function overdue(required: string, status: string, day = today()) {
  return (
    required < day && !["DELIVERED", "CANCELLED", "REJECTED"].includes(status)
  );
}
