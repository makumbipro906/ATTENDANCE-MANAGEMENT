import { z } from "zod";

export const deviceEventSchema = z.object({
  deviceKey: z.string().trim().min(1).max(80),
  eventId: z.string().trim().min(1).max(160),
  deviceUserId: z.string().trim().min(1).max(100),
  occurredAt: z.string().datetime({ offset: true }),
  eventType: z.enum(["fingerprint_check_in"]),
  result: z.enum(["verified", "rejected"]),
}).strict();

export type DeviceEvent = z.infer<typeof deviceEventSchema>;

export function schoolDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
