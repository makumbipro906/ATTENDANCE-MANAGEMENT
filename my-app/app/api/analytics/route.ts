import {connection} from "next/server";
import {schoolDate} from "@/lib/server/attendance-event";
import {query} from "@/lib/server/database";

const SCHOOL_TIME_ZONE = "Africa/Nairobi";

function getDateRange(endDate: string, days: number) {
    const end = new Date(`${endDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() - days + 1);
    return Array.from({length: days}, (_, index) => {
        const date = new Date(end);
        date.setUTCDate(end.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
    });
}

export async function GET(request: Request) {
    await connection();
    const requestedDays = new URL(request.url).searchParams.get("days") ?? "7";
    if (requestedDays !== "7" && requestedDays !== "30") {
        return Response.json({error: "Choose a 7- or 30-day range."}, {status: 400});
    }
    const today = schoolDate(new Date(), SCHOOL_TIME_ZONE);
    const dates = getDateRange(today, Number(requestedDays));

    try {
        const [studentsResult, attendanceResult] = await Promise.all([
            query<{
                id: string; class_name: string; biometrics_status: string;
                guardian_name: string; relationship: string; primary_phone: string | null;
            }>(
                `SELECT id, class_name, biometrics_status, guardian_name, relationship, primary_phone
                 FROM student_records WHERE status = 'Active'`,
            ),
            query<{student_id: string; attendance_date: string}>(
                `SELECT student_id, attendance_date
                 FROM attendance_records WHERE attendance_date BETWEEN ? AND ?`,
                [dates[0], today],
            ),
        ]);
        const students = studentsResult.rows;
        const attendance = attendanceResult.rows;
        const checkInDays = new Map<string, Set<string>>();
        const presentToday = new Set<string>();
        const classCheckIns = new Map<string, Set<string>>();
        for (const record of attendance) {
            const daySet = checkInDays.get(record.attendance_date) ?? new Set<string>();
            daySet.add(record.student_id);
            checkInDays.set(record.attendance_date, daySet);
            if (record.attendance_date === today) presentToday.add(record.student_id);
        }
        const studentsById = new Map(students.map((student) => [student.id, student]));
        for (const id of presentToday) {
            const student = studentsById.get(id);
            if (!student) continue;
            const className = student.class_name || "Unassigned";
            const ids = classCheckIns.get(className) ?? new Set<string>();
            ids.add(id);
            classCheckIns.set(className, ids);
        }
        return Response.json({
            today,
            activeStudents: students.length,
            biometricsComplete: students.filter((student) => student.biometrics_status === "Complete").length,
            contactsComplete: students.filter((student) => student.guardian_name.trim() &&
                student.relationship.trim() && (student.primary_phone ?? "").trim()).length,
            daily: dates.map((date) => ({date, checkIns: checkInDays.get(date)?.size ?? 0})),
            classes: [...new Set(students.map((student) => student.class_name || "Unassigned"))].sort().map((name) => ({
                name,
                enrolledStudents: students.filter((student) => (student.class_name || "Unassigned") === name).length,
                checkIns: classCheckIns.get(name)?.size ?? 0,
            })),
        });
    } catch (error) {
        console.error("Unable to load dashboard analytics:", error);
        return Response.json({error: "Analytics could not be loaded from PostgreSQL."}, {status: 503});
    }
}
