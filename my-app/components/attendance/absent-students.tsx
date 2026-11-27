"use client";

import {useEffect, useMemo, useState, type FormEvent} from "react";
import {CalendarDays, CheckCircle2, Filter, Search, UserRoundX, UsersRound} from "lucide-react";

type AbsentStudent = {
    id: string;
    name: string;
    admissionNumber: string;
    gender: string;
    className: string;
    stream: string;
    section: string;
};

type AbsentStudentsResponse = {
    date: string;
    isSchoolDay: boolean;
    filters: {academicYear: string; term: string; className: string};
    options: {classes: {value: string; label: string}[]};
    summary: {totalStudents: number; present: number; absent: number};
    students: AbsentStudent[];
};

function formatDate(value: string) {
    if (!value) return "Selected date";
    return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

function count(value: number) {
    return value.toLocaleString("en-US");
}

export function AbsentStudentsPage() {
    const [draftDate, setDraftDate] = useState("");
    const [draftClass, setDraftClass] = useState("");
    const [filters, setFilters] = useState({date: "", className: ""});
    const [search, setSearch] = useState("");
    const [report, setReport] = useState<AbsentStudentsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const query = new URLSearchParams();
        if (filters.date) query.set("date", filters.date);
        if (filters.className) query.set("className", filters.className);

        async function loadReport() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/attendance/absent?${query.toString()}`, {
                    signal: controller.signal,
                });
                const payload = await response.json() as AbsentStudentsResponse | {error?: string};
                if (!response.ok) {
                    throw new Error("error" in payload && payload.error
                        ? payload.error
                        : "Absent students could not be loaded.");
                }
                if (!("students" in payload) || !("summary" in payload) || !("options" in payload)) {
                    throw new Error("Absent students returned an invalid response.");
                }
                setReport(payload);
                setDraftDate((current) => current || payload.date);
                setDraftClass(filters.className);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setError(loadError instanceof Error
                    ? loadError.message
                    : "Absent students could not be loaded.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        void loadReport();
        return () => controller.abort();
    }, [filters]);

    const visibleStudents = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return (report?.students ?? []).filter((student) =>
            `${student.name} ${student.admissionNumber} ${student.className} ${student.stream} ${student.gender} ${student.section}`
                .toLocaleLowerCase().includes(query),
        );
    }, [report?.students, search]);

    const groupedStudents = useMemo(() => {
        const classes = new Map<string, Map<string, AbsentStudent[]>>();
        for (const student of visibleStudents) {
            const streams = classes.get(student.className) ?? new Map<string, AbsentStudent[]>();
            const students = streams.get(student.stream) ?? [];
            students.push(student);
            streams.set(student.stream, students);
            classes.set(student.className, streams);
        }
        return [...classes.entries()];
    }, [visibleStudents]);

    function applyFilters(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFilters({date: draftDate, className: draftClass});
    }

    let nextRowNumber = 0;

    return (
        <main className="page-content absent-students-page">
            <header className="daily-attendance-heading">
                <div>
                    <h1>Absent Students</h1>
                    <p>Enrolled learners with no recorded check-in on the selected date, grouped by class and stream.</p>
                </div>
            </header>

            <form aria-label="Filter absent students" className="card absent-students-filters" onSubmit={applyFilters}>
                <label className="weekly-filter">
                    <span>Date</span>
                    <input
                        onChange={(event) => setDraftDate(event.target.value)}
                        type="date"
                        value={draftDate}
                    />
                </label>
                <label className="weekly-filter">
                    <span>Class (Optional)</span>
                    <select onChange={(event) => setDraftClass(event.target.value)} value={draftClass}>
                        <option value="">All Classes</option>
                        {(report?.options.classes ?? []).map((schoolClass) => (
                            <option key={schoolClass.value} value={schoolClass.value}>{schoolClass.label}</option>
                        ))}
                    </select>
                </label>
                <button className="button-primary absent-filter-button" disabled={loading} type="submit">
                    <Filter aria-hidden="true" size={14}/>
                    Filter
                </button>
            </form>

            <div className="daily-attendance-context">
                <UsersRound aria-hidden="true" size={14}/>
                <span>Learners enrolled in <strong>{report?.filters.academicYear || "—"} · {report?.filters.term || "—"}</strong></span>
                <CalendarDays aria-hidden="true" size={14}/>
                <span>{!report ? "Checking the school calendar…" : report.isSchoolDay
                    ? "Absence is based on missing fingerprint check-ins on a configured school day."
                    : "This is not a scheduled school day; no absences are counted."}</span>
            </div>

            {error && <p className="weekly-attendance-error" role="alert">{error}</p>}

            <section aria-label="Absent student totals" className="absent-students-summary">
                <article className="card absent-summary-card">
                    <span className="absent-summary-icon absent-icon"><UserRoundX aria-hidden="true" size={16}/></span>
                    <div><strong>{report ? count(report.summary.absent) : "—"}</strong><span>Total Absent</span></div>
                </article>
                <article className="card absent-summary-card">
                    <span className="absent-summary-icon present-icon"><CheckCircle2 aria-hidden="true" size={16}/></span>
                    <div><strong>{report ? count(report.summary.present) : "—"}</strong><span>Present</span></div>
                </article>
                <article className="card absent-summary-card">
                    <span className="absent-summary-icon date-icon"><CalendarDays aria-hidden="true" size={16}/></span>
                    <div><strong>{formatDate(report?.date ?? draftDate)}</strong><span>Report Date</span></div>
                </article>
            </section>

            <section aria-label={`Absent students for ${formatDate(report?.date ?? draftDate)}`} className="card daily-attendance-table-card absent-students-table-card">
                <div className="attendance-record-list-toolbar">
                    <div>
                        <h2>Absent learners — {formatDate(report?.date ?? draftDate)}</h2>
                        <p className="card-subtitle">{visibleStudents.length} absent learners</p>
                    </div>
                </div>
                <div className="attendance-record-list-filters">
                    <label className="weekly-learner-search">
                        <Search aria-hidden="true" size={15}/>
                        <span className="visually-hidden">Search absent students</span>
                        <input
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search learners..."
                            value={search}
                        />
                    </label>
                </div>
                <div className="table-wrap">
                    <table className="data-table daily-attendance-table absent-students-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Student Name</th>
                                <th scope="col">Reg No</th>
                                <th scope="col">Gender</th>
                                <th scope="col">Section</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupedStudents.map(([schoolClass, streams]) => {
                                const classCount = [...streams.values()].reduce((sum, students) => sum + students.length, 0);
                                const rowNumber = nextRowNumber;
                                nextRowNumber += classCount;
                                return (
                                    <ClassRows
                                        key={schoolClass}
                                        className={schoolClass}
                                        classCount={classCount}
                                        rowNumber={rowNumber}
                                        streams={streams}
                                    />
                                );
                            })}
                            {!loading && groupedStudents.length === 0 && (
                                <tr><td className="weekly-attendance-empty" colSpan={5}>
                                    {error ? "Absent students are unavailable." : search ? "No absent students match your search." : "No absent students for this date and class."}
                                </td></tr>
                            )}
                            {loading && <tr><td className="weekly-attendance-empty" colSpan={5}>Loading absent students…</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    );
}

function ClassRows({
    className,
    classCount,
    rowNumber,
    streams,
}: {
    className: string;
    classCount: number;
    rowNumber: number;
    streams: Map<string, AbsentStudent[]>;
}) {
    let nextRowNumber = rowNumber;
    return (
        <>
            <tr className="absent-class-heading">
                <th colSpan={5} scope="rowgroup">{className}<span>{count(classCount)} Absent</span></th>
            </tr>
            {[...streams.entries()].map(([stream, students]) => {
                const streamRowNumber = nextRowNumber;
                nextRowNumber += students.length;
                return <StreamRows key={`${className}-${stream}`} stream={stream} students={students} rowNumber={streamRowNumber}/>;
            })}
        </>
    );
}

function StreamRows({
    stream,
    students,
    rowNumber,
}: {
    stream: string;
    students: AbsentStudent[];
    rowNumber: number;
}) {
    return (
        <>
            <tr className="absent-stream-heading">
                <th colSpan={5} scope="rowgroup"><UsersRound aria-hidden="true" size={12}/>{stream}<span>{count(students.length)} Absent</span></th>
            </tr>
            {students.map((student, index) => (
                <tr key={student.id}>
                    <td>{rowNumber + index + 1}</td>
                    <td className="absent-student-name">{student.name}</td>
                    <td>{student.admissionNumber}</td>
                    <td><span className={`absent-gender-badge ${student.gender.toLocaleLowerCase() === "female" ? "female" : ""}`}>{student.gender}</span></td>
                    <td>{student.section}</td>
                </tr>
            ))}
        </>
    );
}
