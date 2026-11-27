import {connection} from "next/server";
import {query} from "@/lib/server/database";
import {getSmsSettings, smsParts} from "@/lib/server/student-attendance-settings";
import {schoolDate} from "@/lib/server/attendance-event";

function validDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number) {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
    await connection();
    const params = new URL(request.url).searchParams;
    const period = params.get("period") === "monthly" ? "monthly" : "weekly";
    const selectedDate = params.get("date") || schoolDate(new Date(), "Africa/Nairobi");
    if (!validDate(selectedDate)) return Response.json({error: "Choose a valid date."}, {status: 400});
    const date = new Date(`${selectedDate}T00:00:00.000Z`);
    const start = period === "weekly"
        ? addDays(selectedDate, -((date.getUTCDay() + 6) % 7))
        : `${selectedDate.slice(0, 7)}-01`;
    const end = period === "weekly"
        ? addDays(start, 6)
        : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    try {
        const settings = await getSmsSettings();
        const {rows} = await query<{
            created_at: string; message_body: string; status: string;
        }>(
            `SELECT to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at, message_body, status
             FROM sms_notifications
             WHERE date(created_at) BETWEEN ? AND ?
             ORDER BY created_at LIMIT 20000`,
            [start, end],
        );
        const byDate = new Map<string, {
            date: string; total: number; sent: number; failed: number; pending: number; parts: number; cost: number;
        }>();
        const totals = {total: 0, sent: 0, failed: 0, pending: 0, parts: 0, cost: 0};
        for (const message of rows) {
            const day = message.created_at.slice(0, 10);
            const entry = byDate.get(day) ?? {date: day, total: 0, sent: 0, failed: 0, pending: 0, parts: 0, cost: 0};
            const parts = smsParts(message.message_body, settings.charactersPerPart);
            entry.total += 1;
            entry.parts += parts;
            entry.cost += parts * settings.costPerPart;
            if (message.status === "submitted" || message.status === "delivered") entry.sent += 1;
            else if (message.status === "failed") entry.failed += 1;
            else if (message.status === "pending" || message.status === "processing") entry.pending += 1;
            byDate.set(day, entry);
        }
        for (const entry of byDate.values()) {
            totals.total += entry.total;
            totals.sent += entry.sent;
            totals.failed += entry.failed;
            totals.pending += entry.pending;
            totals.parts += entry.parts;
            totals.cost += entry.cost;
        }
        return Response.json({
            period, selectedDate, start, end, currency: settings.currency, totals,
            deliveryRate: totals.sent + totals.failed ? Math.round(totals.sent / (totals.sent + totals.failed) * 100) : 0,
            breakdown: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load SMS billing summary:", error);
        return Response.json({error: "SMS billing summary could not be loaded."}, {status: 503});
    }
}
