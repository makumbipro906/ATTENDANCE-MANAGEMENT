import {connection} from "next/server";
import {query} from "@/lib/server/database";
import {schoolDate} from "@/lib/server/attendance-event";
import {getSmsSettings, smsParts} from "@/lib/server/student-attendance-settings";

function isValidDate(date: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
}

export async function GET(request: Request) {
    await connection();
    const date = new URL(request.url).searchParams.get("date") || schoolDate(new Date(), "Africa/Nairobi");
    if (!isValidDate(date)) return Response.json({error: "Choose a valid date."}, {status: 400});
    try {
        const settings = await getSmsSettings();
        const {rows} = await query<{
            id: string; created_at: string; full_name: string; admission_number: string;
            recipient_phone: string | null; message_body: string; status: string; provider_message_id: string | null;
        }>(
            `SELECT n.id, to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
                    s.full_name, s.admission_number, n.recipient_phone,
                    n.message_body, n.status, n.provider_message_id
             FROM sms_notifications n
             JOIN students s ON s.id = n.student_id
             WHERE date(n.created_at) = ?
             ORDER BY n.created_at DESC LIMIT 500`,
            [date],
        );
        const counts = {queued: 0, sent: 0, failed: 0, pending: 0, blocked: 0, parts: 0, cost: 0};
        for (const message of rows) {
            const parts = smsParts(message.message_body, settings.charactersPerPart);
            counts.parts += parts;
            counts.cost += parts * settings.costPerPart;
            if (message.status === "pending" || message.status === "processing") counts.queued += 1;
            if (message.status === "pending") counts.pending += 1;
            if (message.status === "submitted" || message.status === "delivered") counts.sent += 1;
            if (message.status === "failed") counts.failed += 1;
            if (message.status === "blocked") counts.blocked += 1;
        }
        const deliveryRate = counts.sent + counts.failed
            ? Math.round(counts.sent / (counts.sent + counts.failed) * 100)
            : 0;
        return Response.json({
            date,
            settings: {enabled: settings.enabled, currency: settings.currency},
            summary: {...counts, deliveryRate},
            messages: rows.map((message) => ({
                ...message,
                parts: smsParts(message.message_body, settings.charactersPerPart),
                cost: smsParts(message.message_body, settings.charactersPerPart) * settings.costPerPart,
            })),
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load SMS dashboard:", error);
        return Response.json({error: "SMS dashboard could not be loaded."}, {status: 503});
    }
}
