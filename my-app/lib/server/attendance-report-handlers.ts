import {schoolDate} from "@/lib/server/attendance-event";
import {getExpectedSchoolDates} from "@/lib/server/student-attendance-settings";
import {
    buildLearners,
    getAttendanceReportData,
    getConfiguredCurrentCohort,
    type ReportCombination,
    type ReportFilters,
} from "@/lib/server/attendance-reports";

const SCHOOL_TIME_ZONE = "Africa/Nairobi";

function validDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(new Date(`${value}T00:00:00.000Z`).getTime()) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function addDays(value: string, count: number) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
}

function reportSummary(learners: ReturnType<typeof buildLearners>, dates: string[]) {
    const enrolledLearners = learners.length;
    const presentDays = learners.reduce((sum, learner) => sum + learner.presentDays, 0);
    const possibleDays = learners.reduce((sum, learner) => sum + learner.expectedDays, 0);
    const attendanceRate = possibleDays ? Math.round(presentDays / possibleDays * 100) : null;
    return {
        enrolledLearners,
        trackedSchoolDays: dates.length,
        attendanceRate,
        below75: attendanceRate === null ? null : learners.filter((learner) =>
            learner.attendanceRate !== null && learner.attendanceRate < 75,
        ).length,
        trackedDates: dates,
    };
}

function combinationOptions(combinations: ReportCombination[]) {
    return {
        academicYears: [...new Set(combinations.map((item) => item.academicYear))],
        terms: [...new Set(combinations.map((item) => item.term))],
        classes: [...new Set(combinations.map((item) => item.className))],
        streams: [...new Set(combinations.map((item) => item.stream))],
        combinations,
    };
}

export async function getPeriodReport(request: Request, period: "weekly" | "monthly") {
    const params = new URL(request.url).searchParams;
    const filters: ReportFilters = {
        academicYear: params.get("academicYear") ?? "",
        term: params.get("term") ?? "",
        className: params.get("className") ?? "",
        stream: params.get("stream") ?? "",
    };
    if (filters.academicYear!.length > 40 || filters.term!.length > 80 ||
        filters.className!.length > 100 || filters.stream!.length > 100) {
        return Response.json({error: "One or more report filters are too long."}, {status: 400});
    }

    const today = schoolDate(new Date(), SCHOOL_TIME_ZONE);
    let periodStart: string;
    let periodEnd: string;
    let periodValue: string;
    if (period === "weekly") {
        const requested = params.get("weekStart") ?? "";
        if (requested && !validDate(requested)) return Response.json({error: "Choose a valid week start date."}, {status: 400});
        const day = new Date(`${today}T00:00:00.000Z`).getUTCDay();
        periodStart = requested || addDays(today, -((day + 6) % 7));
        periodEnd = addDays(periodStart, 6);
        periodValue = periodStart;
    } else {
        const month = params.get("month") ?? today.slice(0, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return Response.json({error: "Choose a valid attendance month."}, {status: 400});
        }
        const [year, monthNumber] = month.split("-").map(Number);
        periodStart = `${month}-01`;
        periodEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
        periodValue = month;
    }

    try {
        const report = await getAttendanceReportData(periodStart, periodEnd, filters);
        const trackedDates = await getExpectedSchoolDates(periodStart, periodEnd);
        const learners = buildLearners(report.students, report.attendance, trackedDates, report.attendanceSettings.lateThreshold);
        return Response.json({
            periodStart,
            periodEnd,
            periodValue,
            filters,
            options: combinationOptions(report.combinations),
            summary: reportSummary(learners, trackedDates),
            learners,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error(`Unable to load ${period} attendance report:`, error);
        return Response.json({error: `${period === "weekly" ? "Weekly" : "Monthly"} attendance could not be loaded from PostgreSQL.`}, {status: 503});
    }
}

export async function getTermlyReport(request: Request) {
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") ?? "stream";
    if (scope !== "class" && scope !== "stream") return Response.json({error: "Choose a class or stream report."}, {status: 400});
    const filters: ReportFilters = {
        academicYear: params.get("academicYear") ?? "",
        term: params.get("term") ?? "",
        className: params.get("className") ?? "",
        stream: scope === "stream" ? params.get("stream") ?? "" : "",
    };
    if (filters.academicYear!.length > 40 || filters.term!.length > 80 ||
        filters.className!.length > 100 || filters.stream!.length > 100) {
        return Response.json({error: "One or more report filters are too long."}, {status: 400});
    }

    try {
        const all = await getAttendanceReportData("0001-01-01", "9999-12-31");
        const selectedYear = filters.academicYear || all.settings.years.find((item) => item.isCurrent)?.year.toString() ||
            all.settings.years.map((item) => item.year).sort((a, b) => b - a)[0]?.toString() || "";
        const yearRows = all.combinations.filter((row) => row.academicYear === selectedYear);
        const selectedTerm = filters.term ||
            all.settings.terms.find((item) => item.year === Number(selectedYear) && item.isCurrent)?.name ||
            [...new Set(yearRows.map((row) => row.term))][0] || "";
        const termRows = yearRows.filter((row) => row.term === selectedTerm);
        const selectedClass = filters.className || termRows[0]?.className || "";
        const selectedStream = scope === "stream" ? filters.stream || termRows.find((row) => row.className === selectedClass)?.stream || "" : "";
        const term = all.settings.terms.find((item) => item.year === Number(selectedYear) && item.name === selectedTerm);
        const report = term
            ? await getAttendanceReportData(term.startDate, term.endDate, {
                academicYear: selectedYear,
                term: selectedTerm,
                className: selectedClass,
                ...(scope === "stream" ? {stream: selectedStream} : {}),
            })
            : {...all, students: [], attendance: []};
        const trackedDates = term
            ? await getExpectedSchoolDates(term.startDate, term.endDate)
            : [];
        const learners = buildLearners(report.students, report.attendance, trackedDates, report.attendanceSettings.lateThreshold);
        return Response.json({
            scope,
            filters: {academicYear: selectedYear, term: selectedTerm, className: selectedClass, stream: selectedStream},
            options: combinationOptions(all.combinations),
            periodStart: trackedDates[0] ?? "",
            periodEnd: trackedDates[trackedDates.length - 1] ?? "",
            summary: reportSummary(learners, trackedDates),
            learners,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load termly attendance report:", error);
        return Response.json({error: "Termly attendance could not be loaded from PostgreSQL."}, {status: 503});
    }
}

export async function getDailyReport(request: Request) {
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") ?? "stream";
    const requestedDate = params.get("date") ?? "";
    if (scope !== "stream" && scope !== "class") return Response.json({error: "Choose a class or stream daily report."}, {status: 400});
    if (requestedDate && !validDate(requestedDate)) return Response.json({error: "Choose a valid attendance date."}, {status: 400});
    const date = requestedDate || schoolDate(new Date(), SCHOOL_TIME_ZONE);
    try {
        const base = await getAttendanceReportData(date, date);
        const current = getConfiguredCurrentCohort(base.settings, base.combinations);
        const filters = current ? {academicYear: String(current.year.year), term: current.term.name} : {academicYear: "", term: ""};
        const report = current ? await getAttendanceReportData(date, date, filters) : base;
        const isSchoolDay = (await getExpectedSchoolDates(date, date)).length > 0;
        const byStream = new Map<string, {className: string; stream: string; totalStudents: number; present: number; absent: number; attendanceRate: number | null}>();
        const presentIds = new Set(report.attendance.map((row) => row.student_id));
        for (const student of report.students) {
            const key = `${student.class_name}\u0000${student.stream}`;
            const group = byStream.get(key) ?? {className: student.class_name || "Unassigned", stream: student.stream || "Unassigned", totalStudents: 0, present: 0, absent: 0, attendanceRate: null};
            group.totalStudents += 1;
            if (presentIds.has(student.id)) group.present += 1;
            byStream.set(key, group);
        }
        const streams = [...byStream.values()].map((item) => ({
            ...item,
            absent: isSchoolDay ? item.totalStudents - item.present : 0,
            attendanceRate: isSchoolDay && item.totalStudents ? Math.round(item.present / item.totalStudents * 100) : null,
        }));
        const classesMap = new Map<string, {className: string; totalStudents: number; present: number; absent: number; attendanceRate: number | null}>();
        for (const item of streams) {
            const row = classesMap.get(item.className) ?? {className: item.className, totalStudents: 0, present: 0, absent: 0, attendanceRate: null};
            row.totalStudents += item.totalStudents;
            row.present += item.present;
            row.absent += item.absent;
            row.attendanceRate = isSchoolDay && row.totalStudents ? Math.round(row.present / row.totalStudents * 100) : null;
            classesMap.set(item.className, row);
        }
        const totalStudents = streams.reduce((sum, item) => sum + item.totalStudents, 0);
        const present = streams.reduce((sum, item) => sum + item.present, 0);
        const combinations = report.combinations.filter((item) =>
            item.academicYear === filters.academicYear && item.term === filters.term,
        );
        return Response.json({
            scope,
            date,
            filters,
            options: {combinations},
            summary: {
                totalStudents, present,
                absent: isSchoolDay ? totalStudents - present : 0,
                attendanceRate: isSchoolDay && totalStudents ? Math.round(present / totalStudents * 100) : null,
            },
            isSchoolDay,
            classes: [...classesMap.values()],
            streams,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load daily attendance report:", error);
        return Response.json({error: "Daily attendance could not be loaded from PostgreSQL."}, {status: 503});
    }
}

export async function getAbsentReport(request: Request) {
    const params = new URL(request.url).searchParams;
    const requestedDate = params.get("date") ?? "";
    const className = params.get("className") ?? "";
    if (requestedDate && !validDate(requestedDate)) return Response.json({error: "Choose a valid attendance date."}, {status: 400});
    if (className.length > 100) return Response.json({error: "The selected class name is too long."}, {status: 400});
    const date = requestedDate || schoolDate(new Date(), SCHOOL_TIME_ZONE);
    try {
        const base = await getAttendanceReportData(date, date);
        const current = getConfiguredCurrentCohort(base.settings, base.combinations);
        const filters = current ? {academicYear: String(current.year.year), term: current.term.name} : {academicYear: "", term: ""};
        const report = current ? await getAttendanceReportData(date, date, filters) : base;
        const isSchoolDay = (await getExpectedSchoolDates(date, date)).length > 0;
        const classOptions = [...new Set(report.combinations
            .filter((item) => item.academicYear === filters.academicYear && item.term === filters.term)
            .map((item) => item.className))].map((value) => ({value, label: value}));
        const scoped = report.students.filter((student) =>
            !className || (className === "__unassigned__" ? !student.class_name.trim() : student.class_name === className),
        );
        const present = new Set(report.attendance.map((item) => item.student_id));
        const scopedPresent = scoped.filter((student) => present.has(student.id)).length;
        const absentStudents = isSchoolDay ? scoped.filter((student) => !present.has(student.id)).map((student) => ({
            id: student.id,
            name: student.full_name,
            admissionNumber: student.admission_number,
            gender: student.gender,
            className: student.class_name || "Unassigned",
            stream: student.stream || "Unassigned",
            section: student.section || "—",
        })) : [];
        return Response.json({
            date,
            filters: {...filters, className},
            options: {classes: classOptions},
            summary: {
                totalStudents: scoped.length,
                present: scopedPresent,
                absent: absentStudents.length,
            },
            isSchoolDay,
            students: absentStudents,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load absent students report:", error);
        return Response.json({error: "Absent students could not be loaded from PostgreSQL."}, {status: 503});
    }
}
