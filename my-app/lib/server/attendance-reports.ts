import "server-only";

import {query} from "@/lib/server/database";
import {getSettingCombinations, getSchoolSettings} from "@/lib/server/school-settings";
import {getAttendanceSettings} from "@/lib/server/student-attendance-settings";

export type ReportFilters = {
    academicYear?: string;
    term?: string;
    className?: string;
    stream?: string;
};

export type ReportCombination = {
    academicYear: string;
    term: string;
    className: string;
    stream: string;
};

type ReportStudent = {
    id: string;
    full_name: string;
    admission_number: string;
    academic_year: string;
    term: string;
    class_name: string;
    stream: string;
    section: string;
    gender: string;
    term_start_date: string;
    term_end_date: string;
};

type AttendanceRecord = {
    student_id: string;
    attendance_date: string;
    occurred_at: string;
    time_zone: string;
};

function matches(student: ReportStudent, filters: ReportFilters) {
    return (!filters.academicYear || student.academic_year === filters.academicYear) &&
        (!filters.term || student.term === filters.term) &&
        (!filters.className || student.class_name === filters.className) &&
        (!filters.stream || student.stream === filters.stream);
}

export async function getAttendanceReportData(
    startDate: string,
    endDate: string,
    filters: ReportFilters = {},
) {
    const settings = await getSchoolSettings();
    const {rows: activeStudents} = await query<ReportStudent>(
        `SELECT s.id, s.full_name, s.admission_number, CAST(y.year AS TEXT) AS academic_year,
                t.name AS term, c.name AS class_name, st.name AS stream, sec.name AS section, s.gender,
                t.start_date AS term_start_date, t.end_date AS term_end_date
         FROM students s
         JOIN student_enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
         JOIN terms t ON t.id = e.term_id
         JOIN school_years y ON y.id = t.school_year_id
         JOIN streams st ON st.id = e.stream_id
         JOIN classes c ON c.id = st.class_id
         JOIN sections sec ON sec.id = e.section_id
         WHERE s.status = 'Active' AND t.start_date <= ? AND t.end_date >= ?`,
        [endDate, startDate],
    );

    const configured = new Set(getSettingCombinations(settings).map((item) =>
        `${item.academicYear}\u0000${item.term}\u0000${item.className}\u0000${item.stream}`,
    ));
    const validStudents = activeStudents.filter((student) => configured.has(
        `${student.academic_year}\u0000${student.term}\u0000${student.class_name}\u0000${student.stream}`,
    ));
    const combinations: ReportCombination[] = [...new Map(validStudents.map((student) => {
        const item = {
            academicYear: student.academic_year,
            term: student.term,
            className: student.class_name || "Unassigned",
            stream: student.stream || "Unassigned",
        };
        return [`${item.academicYear}\u0000${item.term}\u0000${item.className}\u0000${item.stream}`, item] as const;
    })).values()];
    const students = validStudents.filter((student) => matches(student, filters));
    const ids = students.map((student) => student.id);
    const {rows: attendance} = ids.length
        ? await query<AttendanceRecord>(
            `SELECT a.student_id, a.attendance_date, a.occurred_at, d.time_zone
             FROM attendance_records a
             JOIN devices d ON d.device_key = a.device_key
             WHERE a.event_type = 'fingerprint_check_in'
               AND a.student_id IN (${ids.map(() => "?").join(", ")})
               AND a.attendance_date BETWEEN ? AND ?
             ORDER BY a.attendance_date`,
            [...ids, startDate, endDate],
        )
        : {rows: [] as AttendanceRecord[]};
    return {settings, combinations, students, attendance, attendanceSettings: await getAttendanceSettings()};
}

export function buildLearners(
    students: ReportStudent[],
    attendance: AttendanceRecord[],
    trackedDates: string[],
    lateThreshold = "07:30",
) {
    const datesByStudent = new Map<string, Map<string, boolean>>();
    for (const record of attendance) {
        const dates = datesByStudent.get(record.student_id) ?? new Map<string, boolean>();
        const localTime = new Intl.DateTimeFormat("en-GB", {
            timeZone: record.time_zone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).format(new Date(record.occurred_at));
        dates.set(record.attendance_date, localTime > lateThreshold);
        datesByStudent.set(record.student_id, dates);
    }
    return students.map((student) => {
        const expectedDates = trackedDates.filter((date) =>
            date >= student.term_start_date && date <= student.term_end_date,
        );
        const expectedDateSet = new Set(expectedDates);
        const studentAttendance = datesByStudent.get(student.id) ?? new Map<string, boolean>();
        const presentDays = [...studentAttendance.keys()].filter((date) => expectedDateSet.has(date)).length;
        const lateDays = [...studentAttendance.entries()]
            .filter(([date, isLate]) => expectedDateSet.has(date) && isLate).length;
        const expectedDays = expectedDates.length;
        return {
            id: student.id,
            name: student.full_name,
            admissionNumber: student.admission_number,
            className: student.class_name || "Unassigned",
            stream: student.stream || "Unassigned",
            presentDays,
            lateDays,
            expectedDays,
            absentDays: Math.max(0, expectedDays - presentDays),
            attendanceRate: expectedDays ? Math.round((presentDays / expectedDays) * 100) : null,
        };
    });
}

export function getConfiguredCurrentCohort(
    settings: Awaited<ReturnType<typeof getSchoolSettings>>,
    combinations: ReportCombination[],
) {
    const currentYear = settings.years.find((year) => year.isCurrent) ?? [...settings.years].sort((a, b) => b.year - a.year)[0];
    if (!currentYear) return null;
    const currentTerm = settings.terms.find((term) => term.year === currentYear.year && term.isCurrent) ??
        [...settings.terms].filter((term) => term.year === currentYear.year).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (!currentTerm) return null;
    const cohort = combinations.filter((item) =>
        item.academicYear === String(currentYear.year) && item.term === currentTerm.name,
    );
    return {year: currentYear, term: currentTerm, combinations: cohort};
}
