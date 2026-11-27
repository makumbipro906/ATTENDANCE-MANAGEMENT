"use client";

import {Suspense, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import {CalendarDays, Download, Search, UsersRound} from "lucide-react";

type AttendanceCombination = {
    academicYear: string;
    term: string;
    className: string;
    stream: string;
};

type AttendancePeriod = "weekly" | "monthly" | "termly-stream" | "termly-class";
type AttendancePeriodResponse = {
    periodStart: string;
    periodEnd: string;
    periodValue?: string;
    filters?: {
        academicYear: string;
        term: string;
        className: string;
        stream: string;
    };
    options: {
        academicYears: string[];
        terms: string[];
        classes: string[];
        streams: string[];
        combinations: AttendanceCombination[];
    };
    summary: {
        enrolledLearners: number;
        trackedSchoolDays: number;
        attendanceRate: number | null;
        below75: number | null;
        trackedDates: string[];
    };
    learners: {
        id: string;
        name: string;
        admissionNumber: string;
        className: string;
        stream: string;
        presentDays: number;
        lateDays: number;
        absentDays: number;
        attendanceRate: number | null;
    }[];
};

function formatDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
}

function formatCount(value: number | null) {
    return value === null ? "—" : value.toLocaleString("en-US");
}

function escapeCsv(value: string) {
    const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
}

export function AttendancePeriodReport({period}: {period: AttendancePeriod}) {
    const [academicYear, setAcademicYear] = useState("");
    const [term, setTerm] = useState("");
    const [className, setClassName] = useState("");
    const [stream, setStream] = useState("");
    const [periodSelection, setPeriodSelection] = useState("");
    const [search, setSearch] = useState("");
    const [sortOrder, setSortOrder] = useState<"highest" | "lowest">("highest");
    const [report, setReport] = useState<AttendancePeriodResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const isTermly = period === "termly-stream" || period === "termly-class";
    const reportScope = period === "termly-class" ? "class" : "stream";
    const isStreamReport = period === "termly-stream";
    const periodName = period.startsWith("termly")
        ? "Termly"
        : period === "weekly" ? "Weekly" : "Monthly";
    const periodNoun = period.startsWith("termly")
        ? "term"
        : period === "weekly" ? "week" : "month";

    useEffect(() => {
        const controller = new AbortController();
        const query = new URLSearchParams();
        if (academicYear) query.set("academicYear", academicYear);
        if (term) query.set("term", term);
        if (className) query.set("className", className);
        if (isTermly) {
            query.set("scope", reportScope);
            if (isStreamReport && stream) query.set("stream", stream);
        } else {
            if (stream) query.set("stream", stream);
            if (periodSelection) query.set(period === "weekly" ? "weekStart" : "month", periodSelection);
        }
        const endpoint = isTermly ? "termly" : period;

        async function loadReport() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/attendance/${endpoint}?${query.toString()}`, {
                    signal: controller.signal,
                });
                const payload = await response.json() as AttendancePeriodResponse | {error?: string};
                if (!response.ok) {
                    throw new Error("error" in payload && payload.error
                        ? payload.error
                        : `${periodName} attendance could not be loaded.`);
                }
                if (!("learners" in payload)) {
                    throw new Error("Attendance returned an invalid response.");
                }
                setReport(payload);
                if (isTermly && payload.filters) {
                    setAcademicYear((current) => current || payload.filters?.academicYear || "");
                    setTerm((current) => current || payload.filters?.term || "");
                    setClassName((current) => current || payload.filters?.className || "");
                    if (isStreamReport) {
                        setStream((current) => current || payload.filters?.stream || "");
                    }
                } else if (!isTermly && payload.periodValue) {
                    setPeriodSelection((current) => current || payload.periodValue || "");
                }
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setError(loadError instanceof Error
                    ? loadError.message
                    : `${periodName} attendance could not be loaded.`);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        void loadReport();
        return () => controller.abort();
    }, [academicYear, className, isStreamReport, isTermly, period, periodName, periodSelection, reportScope, stream, term]);

    const combinations = report?.options.combinations ?? [];
    const terms = [...new Set(combinations
        .filter((item) => !academicYear || item.academicYear === academicYear)
        .map((item) => item.term))];
    const classes = [...new Set(combinations
        .filter((item) => (!academicYear || item.academicYear === academicYear) &&
            (!term || item.term === term))
        .map((item) => item.className))];
    const streams = [...new Set(combinations
        .filter((item) => (!academicYear || item.academicYear === academicYear) &&
            (!term || item.term === term) && (!className || item.className === className))
        .map((item) => item.stream))];

    const visibleLearners = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return (report?.learners ?? [])
            .filter((learner) =>
                `${learner.name} ${learner.admissionNumber} ${learner.className} ${learner.stream}`
                    .toLocaleLowerCase().includes(query),
            )
            .sort((first, second) => {
                const firstRate = first.attendanceRate ?? -1;
                const secondRate = second.attendanceRate ?? -1;
                const difference = firstRate - secondRate || first.name.localeCompare(second.name);
                return sortOrder === "highest" ? -difference : difference;
            });
    }, [report?.learners, search, sortOrder]);

    function exportCsv() {
        const rows = [
            ["SN", "Learner", "Reg No", "Class", ...(tableHasStream ? ["Stream"] : []), "Present days", "Absent days", "Late days", "Attendance rate"],
            ...visibleLearners.map((learner, index) => [
                String(index + 1),
                learner.name,
                learner.admissionNumber,
                learner.className,
                ...(tableHasStream ? [learner.stream] : []),
                String(learner.presentDays),
                String(learner.absentDays),
                String(learner.lateDays),
                learner.attendanceRate === null ? "" : `${learner.attendanceRate}%`,
            ]),
        ];
        const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type: "text/csv;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${period}-attendance-${report?.periodValue ?? report?.filters?.term ?? "report"}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const summary = report?.summary;
    const periodLabel = report
        ? period === "weekly"
            ? `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`
            : period === "monthly"
                ? new Date(`${report.periodStart}T00:00:00.000Z`).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                })
                : report.periodStart && report.periodEnd
                    ? `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`
                    : "No check-ins recorded"
        : `Loading ${periodName.toLocaleLowerCase()}…`;
    const reportTitle = isStreamReport
        ? "Termly Stream Attendance"
        : period === "termly-class"
            ? "Termly Class Attendance"
            : `${periodName} Attendance`;
    const tableHasStream = !isStreamReport;
    const tableColumnCount = tableHasStream ? 9 : 8;

    return (
        <main className="page-content weekly-attendance-page">
            <header className="page-heading weekly-attendance-heading">
                <div>
                    <div className="eyebrow">Attendance reports</div>
                    <h1 className="page-title">{reportTitle}</h1>
                    <p className="page-description">
                        Enrolled learners and their recorded check-ins for the selected {periodNoun}.
                    </p>
                </div>
                <button className="button-secondary weekly-export-button" disabled={!report || loading} onClick={exportCsv} type="button">
                    <Download aria-hidden="true" size={15}/>
                    Export Excel
                </button>
            </header>

            <section aria-label={`${periodName} attendance filters`} className={`card weekly-attendance-filters${isTermly ? " termly-attendance-filters" : ""}`}>
                <label className="weekly-filter">
                    <span>Academic year</span>
                    <select
                        onChange={(event) => {
                            setAcademicYear(event.target.value);
                            setTerm("");
                            setClassName("");
                            setStream("");
                        }}
                        value={academicYear}
                    >
                        <option value="">{isTermly ? "Select year" : "All years"}</option>
                        {(report?.options.academicYears ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <label className="weekly-filter">
                    <span>Term</span>
                    <select
                        onChange={(event) => {
                            setTerm(event.target.value);
                            setClassName("");
                            setStream("");
                        }}
                        value={term}
                    >
                        <option value="">{isTermly ? "Select term" : "All terms"}</option>
                        {terms.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <label className="weekly-filter">
                    <span>Class</span>
                    <select
                        onChange={(event) => {
                            setClassName(event.target.value);
                            setStream("");
                        }}
                        value={className}
                    >
                        <option value="">{isTermly ? "Select class" : "All classes"}</option>
                        {classes.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                {isStreamReport && (
                    <label className="weekly-filter">
                        <span>Stream</span>
                        <select onChange={(event) => setStream(event.target.value)} value={stream}>
                            <option value="">Select stream</option>
                            {streams.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                    </label>
                )}
                {!isTermly && (
                    <label className="weekly-filter">
                        <span>{period === "weekly" ? "Week starting" : "Month"}</span>
                        <input
                            aria-label={period === "weekly" ? "Week starting date" : "Attendance month"}
                            onChange={(event) => setPeriodSelection(event.target.value)}
                            type={period === "weekly" ? "date" : "month"}
                            value={periodSelection}
                        />
                    </label>
                )}
                <label className="weekly-filter">
                    <span>Order by attendance</span>
                    <select onChange={(event) => setSortOrder(event.target.value as "highest" | "lowest")} value={sortOrder}>
                        <option value="highest">Highest first</option>
                        <option value="lowest">Lowest first</option>
                    </select>
                </label>
            </section>

            {report && (
                <div className="weekly-attendance-context">
                    <CalendarDays aria-hidden="true" size={15}/>
                    <strong>{className || "All classes"}{stream ? ` · ${stream}` : ""}</strong>
                    <span>{academicYear || "All years"}{term ? ` · ${term}` : ""}</span>
                    <span>{periodName} {isTermly ? `${term} · ${academicYear}` : periodLabel}</span>
                    <span>Counting {periodLabel}</span>
                    <span>{summary?.trackedSchoolDays ?? 0} days with recorded check-ins</span>
                </div>
            )}

            {error && <p className="weekly-attendance-error" role="alert">{error}</p>}

            <section aria-label="Weekly attendance summary" className="weekly-attendance-summary">
                <article className="card weekly-summary-card">
                    <span>Enrolled learners</span>
                    <strong>{formatCount(summary?.enrolledLearners ?? null)}</strong>
                    <UsersRound aria-hidden="true" className="learners"/>
                </article>
                <article className="card weekly-summary-card">
                    <span>{isTermly ? "School days counted" : "Days with check-ins"}</span>
                    <strong>{formatCount(summary?.trackedSchoolDays ?? null)}</strong>
                    <CalendarDays aria-hidden="true" className="days"/>
                </article>
                <article className="card weekly-summary-card">
                    <span>Average attendance</span>
                    <strong>{summary?.attendanceRate === null || summary?.attendanceRate === undefined
                        ? "—"
                        : `${summary.attendanceRate}%`}</strong>
                    <span aria-hidden="true" className="weekly-summary-icon rate">%</span>
                </article>
                <article className="card weekly-summary-card">
                    <span>Below 75%</span>
                    <strong>{formatCount(summary?.below75 ?? null)}</strong>
                    <span aria-hidden="true" className="weekly-summary-icon low">!</span>
                </article>
            </section>

            <section aria-label={`${periodName} learner attendance details`} className="card weekly-attendance-table-card">
                <div className="attendance-record-list-toolbar">
                    <div>
                        <h2>{className || "All Classes"}{isStreamReport && stream ? ` · ${stream}` : tableHasStream ? " (All Streams)" : ""}</h2>
                        <p className="card-subtitle">
                            {visibleLearners.length} learners · {term && isTermly ? `${term} · ${academicYear} · ` : ""}{periodLabel}
                        </p>
                    </div>
                </div>
                <div className="attendance-record-list-filters">
                    <label className="weekly-learner-search">
                        <Search aria-hidden="true" size={15}/>
                        <span className="visually-hidden">Search learners</span>
                        <input onChange={(event) => setSearch(event.target.value)} placeholder="Search learners..." value={search}/>
                    </label>
                </div>
                <div className="table-wrap">
                    <table className={`data-table weekly-attendance-table${isStreamReport ? " stream-attendance-table" : ""}`}>
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Learner</th>
                                <th scope="col">Reg No</th>
                                {tableHasStream && <th scope="col">Stream</th>}
                                <th scope="col">Present</th>
                                <th scope="col">Absent</th>
                                <th scope="col">Late</th>
                                <th scope="col">Signed out</th>
                                <th scope="col">Attendance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleLearners.map((learner, index) => (
                                <tr key={learner.id}>
                                    <td>{index + 1}</td>
                                    <td><strong>{learner.name}</strong></td>
                                    <td>{learner.admissionNumber}</td>
                                    {tableHasStream && <td>{learner.stream}</td>}
                                    <td><span className="weekly-count present">{learner.presentDays}</span></td>
                                    <td><span className="weekly-count absent">{learner.absentDays}</span></td>
                                    <td><span className={`weekly-count${learner.lateDays ? " late" : " present"}`}>{learner.lateDays}</span></td>
                                    <td><span className="weekly-count unavailable" title="Sign-out events are not recorded by the current attendance system.">—</span></td>
                                    <td>
                                        <div aria-label={learner.attendanceRate === null
                                            ? "No attendance data"
                                            : `${learner.attendanceRate}% attendance`}
                                             className={`weekly-rate${isTermly ? " termly" : ""}`}>
                                            <span>
                                                <i style={{width: `${learner.attendanceRate ?? 0}%`}}/>
                                            </span>
                                            <small>{learner.attendanceRate === null ? "—" : `${learner.attendanceRate}%`}</small>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && visibleLearners.length === 0 && (
                                <tr><td className="weekly-attendance-empty" colSpan={tableColumnCount}>
                                    {error ? "Attendance data is unavailable." : "No active learners match these filters."}
                                </td></tr>
                            )}
                            {loading && (
                                <tr><td className="weekly-attendance-empty" colSpan={tableColumnCount}>Loading {periodNoun} attendance…</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <p className="weekly-attendance-note">
                Absences are counted only across dates with recorded check-ins in the selected group and {periodNoun}.
                {isTermly && " Term dates are not configured, so this report uses the first and last recorded check-in dates for the selected year and term."}
                Late arrivals are calculated using the threshold configured in Students Attendance settings. The current device integration does not record sign-outs.
            </p>
        </main>
    );
}

function AttendanceReportRouterContent() {
    const searchParams = useSearchParams();
    const requestedReport = searchParams.get("report");
    const period: AttendancePeriod = requestedReport === "monthly" ||
        requestedReport === "termly-stream" || requestedReport === "termly-class"
        ? requestedReport
        : "weekly";

    return <AttendancePeriodReport key={period} period={period}/>;
}

export function AttendanceReportRouter() {
    return (
        <Suspense fallback={<main className="page-content weekly-attendance-page"><p>Loading attendance report…</p></main>}>
            <AttendanceReportRouterContent/>
        </Suspense>
    );
}
