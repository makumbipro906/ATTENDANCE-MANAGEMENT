"use client";

import {Suspense, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import {FlagOff, Printer, Search, UsersRound} from "lucide-react";

type DailyScope = "stream" | "class";
type DailyAttendanceResponse = {
    scope: DailyScope;
    date: string;
    isSchoolDay: boolean;
    filters: {academicYear: string; term: string};
    options: {
        combinations: {academicYear: string; term: string; className: string; stream: string}[];
    };
    summary: {
        totalStudents: number;
        present: number;
        absent: number;
        attendanceRate: number | null;
    };
    classes: {
        className: string;
        totalStudents: number;
        present: number;
        absent: number;
        attendanceRate: number | null;
    }[];
    streams: {
        className: string;
        stream: string;
        totalStudents: number;
        present: number;
        absent: number;
        attendanceRate: number | null;
    }[];
};

function formatDate(value: string) {
    if (!value) return "Selected date";
    return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}

function count(value: number) {
    return value.toLocaleString("en-US");
}

function DailyAttendanceReport({scope}: {scope: DailyScope}) {
    const [date, setDate] = useState("");
    const [search, setSearch] = useState("");
    const [report, setReport] = useState<DailyAttendanceResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const query = new URLSearchParams({scope});
        if (date) query.set("date", date);

        async function loadReport() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/attendance/daily?${query.toString()}`, {
                    signal: controller.signal,
                });
                const payload = await response.json() as DailyAttendanceResponse | {error?: string};
                if (!response.ok) {
                    throw new Error("error" in payload && payload.error
                        ? payload.error
                        : "Daily attendance could not be loaded.");
                }
                if (!("streams" in payload) || !("classes" in payload)) {
                    throw new Error("Daily attendance returned an invalid response.");
                }
                setReport(payload);
                setDate((current) => current || payload.date);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setError(loadError instanceof Error
                    ? loadError.message
                    : "Daily attendance could not be loaded.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        void loadReport();
        return () => controller.abort();
    }, [date, scope]);

    const visibleClasses = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return (report?.classes ?? []).filter((item) =>
            item.className.toLocaleLowerCase().includes(query),
        );
    }, [report?.classes, search]);
    const visibleStreams = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return (report?.streams ?? []).filter((item) =>
            `${item.className} ${item.stream}`.toLocaleLowerCase().includes(query),
        );
    }, [report?.streams, search]);

    const title = scope === "stream" ? "Stream Daily Report" : "Class Daily Report";
    const groupTitle = scope === "stream" ? "Stream Attendance" : "Class Attendance";

    return (
        <main className="page-content daily-attendance-page">
            <header className="daily-attendance-heading">
                <div>
                    <h1>{title}</h1>
                    <p>One day&apos;s recorded sign-ins {scope === "stream" ? "per stream" : "per class"}, counted over active learners in the selected academic cohort.</p>
                </div>
            </header>

            <section aria-label="Daily attendance date" className="card daily-attendance-date-filter">
                <label className="weekly-filter">
                    <span>Date</span>
                    <input
                        onChange={(event) => setDate(event.target.value)}
                        type="date"
                        value={date}
                    />
                </label>
            </section>

            <div className="daily-attendance-context">
                <UsersRound aria-hidden="true" size={14}/>
                <span>Learners enrolled in <strong>{report?.filters.academicYear || "—"} · {report?.filters.term || "—"}</strong></span>
                <FlagOff aria-hidden="true" size={14}/>
                <span>{!report ? "Checking the school calendar…" : report.isSchoolDay
                    ? "Absences and attendance rates use the configured school days and calendar closures."
                    : "This is not a scheduled school day; absences and attendance rates are not counted."}</span>
            </div>

            {error && <p className="weekly-attendance-error" role="alert">{error}</p>}

            <section aria-label="Daily attendance totals" className="daily-attendance-summary">
                <article className="card daily-summary-card">
                    <strong>{report ? count(report.summary.totalStudents) : "—"}</strong>
                    <span>Total Students</span>
                </article>
                <article className="card daily-summary-card">
                    <strong className="present">{report ? count(report.summary.present) : "—"}</strong>
                    <span>Present</span>
                </article>
                <article className="card daily-summary-card">
                    <strong className="absent">{report ? count(report.summary.absent) : "—"}</strong>
                    <span>Absent</span>
                </article>
                <article className="card daily-summary-card">
                    <strong className="rate">
                        {report?.summary.attendanceRate === null || report?.summary.attendanceRate === undefined
                            ? "—"
                            : `${report.summary.attendanceRate}%`}
                    </strong>
                    <span>Attendance Rate</span>
                </article>
            </section>

            <section aria-label={`${groupTitle} for ${formatDate(report?.date ?? date)}`} className="card daily-attendance-table-card">
                <div className="attendance-record-list-toolbar">
                    <div>
                        <h2>{groupTitle} — {formatDate(report?.date ?? date)}</h2>
                        <p className="card-subtitle">
                            {scope === "stream"
                                ? `${visibleStreams.length} streams · ${report?.filters.academicYear || "—"} · ${report?.filters.term || "—"}`
                                : `${visibleClasses.length} classes · ${report?.filters.academicYear || "—"} · ${report?.filters.term || "—"}`}
                        </p>
                    </div>
                    <button className="button-secondary daily-print-button" onClick={() => window.print()} type="button">
                        <Printer aria-hidden="true" size={14}/>
                        Print
                    </button>
                </div>
                <div className="attendance-record-list-filters">
                    <label className="weekly-learner-search">
                        <Search aria-hidden="true" size={15}/>
                        <span className="visually-hidden">Search {scope === "stream" ? "streams" : "classes"}</span>
                        <input
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={`Search ${scope === "stream" ? "streams" : "classes"}...`}
                            value={search}
                        />
                    </label>
                </div>
                <div className="table-wrap">
                    {scope === "stream" ? (
                        <table className="data-table daily-attendance-table">
                            <thead>
                                <tr>
                                    <th scope="col">SN</th>
                                    <th scope="col">Stream</th>
                                    <th scope="col">Total Students</th>
                                    <th scope="col">Present</th>
                                    <th scope="col">Absent</th>
                                    <th scope="col">Attendance %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleClasses.map((schoolClass) => {
                                    const streams = visibleStreams.filter((item) =>
                                        item.className === schoolClass.className,
                                    );
                                    return (
                                        <DailyClassGroup
                                            key={schoolClass.className}
                                            className={schoolClass.className}
                                            rows={streams}
                                            total={schoolClass}
                                        />
                                    );
                                })}
                                {!loading && visibleClasses.length === 0 && (
                                    <tr><td className="weekly-attendance-empty" colSpan={6}>
                                        {error ? "Daily attendance is unavailable." : "No streams match this search."}
                                    </td></tr>
                                )}
                                {loading && <tr><td className="weekly-attendance-empty" colSpan={6}>Loading daily attendance…</td></tr>}
                            </tbody>
                        </table>
                    ) : (
                        <table className="data-table daily-attendance-table">
                            <thead>
                                <tr>
                                    <th scope="col">SN</th>
                                    <th scope="col">Class</th>
                                    <th scope="col">Total Students</th>
                                    <th scope="col">Present</th>
                                    <th scope="col">Absent</th>
                                    <th scope="col">Attendance %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleClasses.map((schoolClass, index) => (
                                    <tr key={schoolClass.className}>
                                        <td>{index + 1}</td>
                                        <td>{schoolClass.className}</td>
                                        <td>{count(schoolClass.totalStudents)}</td>
                                        <td className="daily-present">{count(schoolClass.present)}</td>
                                        <td className="daily-absent">{count(schoolClass.absent)}</td>
                                        <td><AttendanceMeter value={schoolClass.attendanceRate}/></td>
                                    </tr>
                                ))}
                                {!loading && visibleClasses.length === 0 && (
                                    <tr><td className="weekly-attendance-empty" colSpan={6}>
                                        {error ? "Daily attendance is unavailable." : "No classes match this search."}
                                    </td></tr>
                                )}
                                {loading && <tr><td className="weekly-attendance-empty" colSpan={6}>Loading daily attendance…</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </main>
    );
}

function DailyClassGroup({
    className,
    rows,
    total,
}: {
    className: string;
    rows: DailyAttendanceResponse["streams"];
    total: DailyAttendanceResponse["classes"][number];
}) {
    return (
        <>
            <tr className="daily-class-divider"><th colSpan={6} scope="rowgroup">{className}</th></tr>
            {rows.map((row, index) => (
                <tr key={`${row.className}-${row.stream}`}>
                    <td>{index + 1}</td>
                    <td>{row.stream}</td>
                    <td>{count(row.totalStudents)}</td>
                    <td className="daily-present">{count(row.present)}</td>
                    <td className="daily-absent">{count(row.absent)}</td>
                    <td><AttendanceMeter value={row.attendanceRate}/></td>
                </tr>
            ))}
            <tr className="daily-class-total">
                <th colSpan={2} scope="row">{className} Total</th>
                <td>{count(total.totalStudents)}</td>
                <td className="daily-present">{count(total.present)}</td>
                <td className="daily-absent">{count(total.absent)}</td>
                <td><AttendanceMeter value={total.attendanceRate}/></td>
            </tr>
        </>
    );
}

function AttendanceMeter({value}: {value: number | null}) {
    return (
        <div aria-label={value === null ? "Not a school day" : `${value}% attendance`} className="daily-attendance-meter">
            <span><i style={{width: `${value ?? 0}%`}}/></span>
            <small>{value === null ? "—" : `${value}%`}</small>
        </div>
    );
}

function DailyAttendanceReportRouterContent() {
    const searchParams = useSearchParams();
    const scope: DailyScope = searchParams.get("report") === "class-daily" ? "class" : "stream";
    return <DailyAttendanceReport key={scope} scope={scope}/>;
}

export function DailyAttendanceReportRouter() {
    return (
        <Suspense fallback={<main className="page-content daily-attendance-page"><p>Loading daily attendance…</p></main>}>
            <DailyAttendanceReportRouterContent/>
        </Suspense>
    );
}
