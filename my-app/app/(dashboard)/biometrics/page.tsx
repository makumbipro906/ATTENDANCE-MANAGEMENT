"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {CalendarCheck2, ChevronRight, CircleSlash2, Fingerprint, UsersRound} from "lucide-react";
import {useSchoolStructure} from "@/components/settings/school-structure-provider";
import {useStudentRecords} from "@/components/students/student-records-provider";
import {getBiometricsClasses} from "@/lib/biometrics-data";
import type {StudentRecord} from "@/lib/student-types";

function formatCount(value: number) {
    return value.toLocaleString("en-US");
}

function getCurrentTerm(students: StudentRecord[]) {
    const terms = new Map<string, number>();
    for (const student of students) {
        const label = `${student.academicYear} ${student.term}`.trim();
        if (label) terms.set(label, (terms.get(label) ?? 0) + 1);
    }
    return [...terms].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Current term";
}

export default function BiometricsPage() {
    const {students} = useStudentRecords();
    const {classes: schoolClasses, streams: schoolStreams} = useSchoolStructure();
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(() => new Set());
    const [today, setToday] = useState<Date | null>(null);
    useEffect(() => {
        const timer = window.setTimeout(() => setToday(new Date()), 0);
        return () => window.clearTimeout(timer);
    }, []);
    const activeStudents = useMemo(
        () => students.filter((student) => student.status === "Active"),
        [students],
    );
    const classSummaries = useMemo(() => {
        const streamDefinitions = schoolStreams.flatMap((stream) => {
            const schoolClass = schoolClasses.find((item) => item.id === stream.classId);
            return schoolClass ? [{name: stream.name, className: schoolClass.name}] : [];
        });
        return getBiometricsClasses(activeStudents, schoolClasses, streamDefinitions);
    }, [activeStudents, schoolClasses, schoolStreams]);
    const captured = activeStudents.filter((student) => student.biometricsStatus === "Complete").length;
    const missing = activeStudents.length - captured;
    const capturedToday = today ? activeStudents.filter((student) => {
        if (!student.biometricsCapturedAt) return false;
        const capturedAt = new Date(student.biometricsCapturedAt);
        return capturedAt.getFullYear() === today.getFullYear() &&
            capturedAt.getMonth() === today.getMonth() &&
            capturedAt.getDate() === today.getDate();
    }).length : 0;
    const currentTerm = getCurrentTerm(activeStudents);

    return (
        <main className="page-content biometrics-overview">
            <header className="biometrics-overview-heading">
                <div>
                    <h1>Biometrics Tracking</h1>
                    <p>Fingerprint capture status per student · {currentTerm}</p>
                </div>
                <Link className="biometrics-overview-students-link" href="/students">
                    <UsersRound aria-hidden="true" size={18}/>
                    Students List
                </Link>
            </header>

            <section aria-label="Biometrics summary" className="biometrics-overview-summary">
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Total Students</h2>
                        <strong>{formatCount(activeStudents.length)}</strong>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon students"><UsersRound size={32}/></span>
                </article>
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Captured</h2>
                        <strong>{formatCount(captured)}</strong>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon captured"><Fingerprint size={32}/></span>
                </article>
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Not Captured</h2>
                        <strong>{formatCount(missing)}</strong>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon missing"><CircleSlash2 size={32}/></span>
                </article>
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Captured Today</h2>
                        <strong>{formatCount(capturedToday)}</strong>
                        <small>since midnight</small>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon today"><CalendarCheck2 size={32}/></span>
                </article>
            </section>

            <section aria-labelledby="biometrics-classes-title" className="biometrics-classes-list">
                <header className="biometrics-classes-list-heading">
                    <div>
                        <h2 id="biometrics-classes-title">Classes</h2>
                        <p>Biometric capture progress by class</p>
                    </div>
                    <span>{formatCount(classSummaries.length)} {classSummaries.length === 1 ? "class" : "classes"}</span>
                </header>
                <ul>
                    {classSummaries.map((schoolClass, index) => {
                        const notCaptured = schoolClass.total - schoolClass.captured;
                        const coverage = schoolClass.total
                            ? Math.round(schoolClass.captured / schoolClass.total * 100)
                            : 0;
                        const streamNames = schoolClass.streams.map((stream) => stream.name);
                        const expanded = expandedClasses.has(schoolClass.name);
                        const streamsId = `biometrics-streams-${index}`;

                        return (
                            <li className="biometrics-class-list-item" key={schoolClass.name}>
                                <div className="biometrics-class-list-row">
                                    <div className="biometrics-class-list-name">
                                        <strong>{schoolClass.name}</strong>
                                        <span>
                                            {streamNames.length
                                                ? `${formatCount(streamNames.length)} ${streamNames.length === 1 ? "stream" : "streams"} · ${streamNames.join(", ")}`
                                                : "No streams configured"}
                                        </span>
                                    </div>
                                    <div className="biometrics-class-list-stat">
                                        <span>Total students</span>
                                        <strong>{formatCount(schoolClass.total)}</strong>
                                    </div>
                                    <div className="biometrics-class-list-stat captured">
                                        <span>Captured</span>
                                        <strong>{formatCount(schoolClass.captured)}</strong>
                                    </div>
                                    <div className="biometrics-class-list-stat pending">
                                        <span>Not captured</span>
                                        <strong>{formatCount(notCaptured)}</strong>
                                    </div>
                                    <div
                                        aria-label={`${coverage}% captured`}
                                        aria-valuemax={100}
                                        aria-valuemin={0}
                                        aria-valuenow={coverage}
                                        className="biometrics-coverage-ring"
                                        role="progressbar"
                                        style={{background: `conic-gradient(var(--orchid) 0 ${coverage}%, #e8e5ec ${coverage}% 100%)`}}
                                    >
                                        <span>{coverage}%</span>
                                    </div>
                                    <button
                                        aria-controls={streamsId}
                                        aria-expanded={expanded}
                                        aria-label={`${expanded ? "Hide" : "Show"} streams for ${schoolClass.name}`}
                                        className={`biometrics-class-expand${expanded ? " is-expanded" : ""}`}
                                        onClick={() => setExpandedClasses((previous) => {
                                            const next = new Set(previous);
                                            if (next.has(schoolClass.name)) next.delete(schoolClass.name);
                                            else next.add(schoolClass.name);
                                            return next;
                                        })}
                                        type="button"
                                    >
                                        <ChevronRight aria-hidden="true" size={16}/>
                                    </button>
                                </div>
                                {expanded && <ul aria-label={`${schoolClass.name} streams`} className="biometrics-stream-list" id={streamsId}>
                                    {schoolClass.streams.map((stream) => {
                                        const streamMissing = stream.total - stream.captured;
                                        const streamCoverage = stream.total
                                            ? Math.round(stream.captured / stream.total * 100)
                                            : 0;
                                        const breakdownKey = `${schoolClass.name}:${stream.name}`;
                                        return <li className="biometrics-stream-list-item" key={breakdownKey}>
                                            <div className="biometrics-stream-list-row">
                                                <span className="biometrics-stream-list-name">{stream.name}</span>
                                                <span><small>Students</small><strong>{formatCount(stream.total)}</strong></span>
                                                <span className="captured"><small>Captured</small><strong>{formatCount(stream.captured)}</strong></span>
                                                <span className="pending"><small>Not captured</small><strong>{formatCount(streamMissing)}</strong></span>
                                                <span
                                                    aria-label={`${streamCoverage}% captured`}
                                                    aria-valuemax={100}
                                                    aria-valuemin={0}
                                                    aria-valuenow={streamCoverage}
                                                    className="biometrics-coverage-ring stream"
                                                    role="progressbar"
                                                    style={{background: `conic-gradient(var(--orchid) 0 ${streamCoverage}%, #e8e5ec ${streamCoverage}% 100%)`}}
                                                >
                                                    {streamCoverage}%
                                                </span>
                                                <Link
                                                    className="biometrics-view-breakdown"
                                                    href={`/biometrics/class/${encodeURIComponent(schoolClass.name)}?stream=${encodeURIComponent(stream.name)}`}
                                                >
                                                    View breakdown
                                                </Link>
                                            </div>
                                        </li>;
                                    })}
                                    {schoolClass.streams.length === 0 && (
                                        <li className="biometrics-stream-list-empty">No streams are assigned to this class.</li>
                                    )}
                                </ul>}
                            </li>
                        );
                    })}
                    {classSummaries.length === 0 && (
                        <li className="biometrics-class-list-empty">No classes are configured yet.</li>
                    )}
                </ul>
            </section>
        </main>
    );
}
