import {connection} from "next/server";

import {getAttendanceReportData} from "@/lib/server/attendance-reports";
import {query} from "@/lib/server/database";
import {schoolDate} from "@/lib/server/attendance-event";
import {getExpectedSchoolDates} from "@/lib/server/student-attendance-settings";

function validDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
    await connection();
    const params = new URL(request.url).searchParams;
    const date = params.get("date") || schoolDate(new Date(), "Africa/Nairobi");
    if (!validDate(date)) return Response.json({error: "Choose a valid attendance date."}, {status: 400});
    try {
        const report = await getAttendanceReportData(date, date);
        const isSchoolDay = (await getExpectedSchoolDates(date, date)).length > 0;
        const ids = report.students.map(({id}) => id);
        const presentIds = new Set(report.attendance.map(({student_id}) => student_id));
        const byGender = new Map<string, {gender: string; total: number; present: number}>();
        const byStream = new Map<string, {className: string; stream: string; total: number; present: number}>();
        for (const student of report.students) {
            const gender = student.gender || "Unspecified";
            const genderGroup = byGender.get(gender) ?? {gender, total: 0, present: 0};
            genderGroup.total += 1;
            if (presentIds.has(student.id)) genderGroup.present += 1;
            byGender.set(gender, genderGroup);

            const key = `${student.class_name}\u0000${student.stream}`;
            const streamGroup = byStream.get(key) ?? {
                className: student.class_name || "Unassigned",
                stream: student.stream || "Unassigned",
                total: 0,
                present: 0,
            };
            streamGroup.total += 1;
            if (presentIds.has(student.id)) streamGroup.present += 1;
            byStream.set(key, streamGroup);
        }
        const total = report.students.length;
        const present = report.students.filter((student) => presentIds.has(student.id)).length;
        const [times, latest] = await Promise.all([
            ids.length ? query<{
                check_ins: number; check_outs: number; first_check_in: string | null; last_check_out: string | null;
            }>(
                `SELECT
                    COALESCE(SUM(CASE WHEN event_type IN ('fingerprint_check_in', 'check_in', 'sign_in') THEN 1 ELSE 0 END), 0)::int AS check_ins,
                    COALESCE(SUM(CASE WHEN event_type IN ('fingerprint_check_out', 'check_out', 'sign_out') THEN 1 ELSE 0 END), 0)::int AS check_outs,
                    MIN(CASE WHEN event_type IN ('fingerprint_check_in', 'check_in', 'sign_in') THEN SUBSTRING(occurred_at, 12, 5) END) AS first_check_in,
                    MAX(CASE WHEN event_type IN ('fingerprint_check_out', 'check_out', 'sign_out') THEN SUBSTRING(occurred_at, 12, 5) END) AS last_check_out
                 FROM attendance_records
                 WHERE attendance_date = ? AND student_id IN (${ids.map(() => "?").join(", ")})`,
                [date, ...ids],
            ) : Promise.resolve({rows: [{check_ins: 0, check_outs: 0, first_check_in: null, last_check_out: null}]}),
            query<{
                id: string; full_name: string; admission_number: string; class_name: string; stream: string;
                sign_in: string | null; sign_out: string | null;
            }>(
                `SELECT s.id, s.full_name, s.admission_number, COALESCE(c.name, '—') AS class_name,
                        COALESCE(st.name, '—') AS stream,
                        MIN(CASE WHEN a.event_type IN ('fingerprint_check_in', 'check_in', 'sign_in') THEN a.occurred_at END) AS sign_in,
                        MAX(CASE WHEN a.event_type IN ('fingerprint_check_out', 'check_out', 'sign_out') THEN a.occurred_at END) AS sign_out
                 FROM attendance_records a
                 JOIN students s ON s.id = a.student_id
                 LEFT JOIN student_enrollments e ON e.id = a.enrollment_id
                 LEFT JOIN streams st ON st.id = e.stream_id
                 LEFT JOIN classes c ON c.id = st.class_id
                 WHERE a.attendance_date = ?
                 GROUP BY s.id
                 ORDER BY sign_in DESC, s.full_name
                 LIMIT 100`,
                [date],
            ),
        ]);

        return Response.json({
            date,
            isSchoolDay,
            summary: {
                totalStudents: total,
                present,
                absent: isSchoolDay ? Math.max(0, total - present) : 0,
                attendanceRate: isSchoolDay && total ? Math.round(present / total * 100) : null,
            },
            gender: [...byGender.values()].map((group) => ({
                ...group,
                absent: isSchoolDay ? group.total - group.present : 0,
                rate: isSchoolDay && group.total ? Math.round(group.present / group.total * 100) : null,
            })),
            streams: [...byStream.values()].map((group) => ({
                ...group,
                rate: isSchoolDay && group.total ? Math.round(group.present / group.total * 100) : null,
            })).sort((a, b) => a.className.localeCompare(b.className) || a.stream.localeCompare(b.stream)),
            timeMetrics: times.rows[0] ?? {check_ins: 0, check_outs: 0, first_check_in: null, last_check_out: null},
            latest: latest.rows,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load student attendance dashboard:", error);
        return Response.json({error: "Student attendance dashboard could not be loaded."}, {status: 503});
    }
}
