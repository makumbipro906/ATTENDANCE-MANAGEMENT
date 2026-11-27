import {connection} from "next/server";
import {query} from "@/lib/server/database";
import {schoolDate} from "@/lib/server/attendance-event";

export async function GET(request: Request) {
    await connection();
    const params = new URL(request.url).searchParams;
    const date = params.get("date") || schoolDate(new Date(), "Africa/Nairobi");
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        return Response.json({error: "Choose a valid attendance date."}, {status: 400});
    }
    try {
        const {rows} = await query<{
            id: string; full_name: string; admission_number: string; class_name: string; stream: string;
            sign_in: string | null; sign_out: string | null;
        }>(
            `SELECT s.id, s.full_name, s.admission_number,
                    COALESCE(c.name, '—') AS class_name, COALESCE(st.name, '—') AS stream,
                    MIN(CASE WHEN a.event_type IN ('fingerprint_check_in', 'check_in', 'sign_in') THEN a.occurred_at END) AS sign_in,
                    MAX(CASE WHEN a.event_type IN ('fingerprint_check_out', 'check_out', 'sign_out') THEN a.occurred_at END) AS sign_out
             FROM attendance_records a
             JOIN students s ON s.id = a.student_id
             LEFT JOIN student_enrollments e ON e.id = a.enrollment_id
             LEFT JOIN streams st ON st.id = e.stream_id
             LEFT JOIN classes c ON c.id = st.class_id
             WHERE a.attendance_date = ?
             GROUP BY s.id
             ORDER BY sign_in DESC, s.full_name`,
            [date],
        );
        return Response.json({date, records: rows}, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load attendance records:", error);
        return Response.json({error: "Attendance records could not be loaded."}, {status: 503});
    }
}
