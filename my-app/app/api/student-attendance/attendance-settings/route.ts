import {connection} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";

import {
    getExpectedSchoolDates,
    getAttendanceSettings,
    saveStudentAttendanceSetting,
    type AttendanceSettings,
} from "@/lib/server/student-attendance-settings";
import {getSchoolSettings} from "@/lib/server/school-settings";

async function settingsResponse(settings: AttendanceSettings) {
    const school = await getSchoolSettings();
    const currentYear = school.years.find((year) => year.isCurrent)?.year;
    const currentTerm = school.terms.find((term) => term.isCurrent && (!currentYear || term.year === currentYear));
    const currentTermInfo = currentTerm ? {
        name: `${currentTerm.name} ${currentTerm.year}`,
        startDate: currentTerm.startDate,
        endDate: currentTerm.endDate,
        holidays: settings.holidays.filter((holiday) =>
            holiday.endDate >= currentTerm.startDate && holiday.startDate <= currentTerm.endDate,
        ).length,
        expectedSchoolDays: (await getExpectedSchoolDates(currentTerm.startDate, currentTerm.endDate)).length,
    } : null;
    return {...settings, currentTerm: currentTermInfo};
}

function isValidDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const holidaySchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().refine((holiday) =>
    isValidDate(holiday.startDate) && isValidDate(holiday.endDate) && holiday.endDate >= holiday.startDate,
);

const attendanceSettingsSchema = z.object({
    schoolDays: z.array(z.number().int().min(0).max(6)).max(7),
    lateThreshold: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    holidays: z.array(holidaySchema).max(200),
}).strict().refine((settings) => new Set(settings.schoolDays).size === settings.schoolDays.length);

export async function GET() {
    await connection();
    try {
        const settings = await getAttendanceSettings();
        return Response.json(await settingsResponse(settings), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load attendance settings:", error);
        return Response.json({error: "Attendance settings could not be loaded."}, {status: 503});
    }
}

export async function PUT(request: Request) {
    await connection();
    const parsed = attendanceSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Check the school days, late threshold, and closure dates."}, {status: 400});
    try {
        const holidays = parsed.data.holidays.map((holiday) => ({
            ...holiday,
            id: holiday.id ?? randomUUID(),
        }));
        const settings = {...parsed.data, holidays};
        await saveStudentAttendanceSetting("student_attendance.attendance", settings);
        return Response.json({ok: true, settings: await settingsResponse(settings)}, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to save attendance settings:", error);
        return Response.json({error: "Attendance settings could not be saved."}, {status: 503});
    }
}
