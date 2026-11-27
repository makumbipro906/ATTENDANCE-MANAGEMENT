"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {ChevronRight, CircleSlash2, ContactRound, UsersRound} from "lucide-react";
import {useSchoolStructure} from "@/components/settings/school-structure-provider";
import {useStudentRecords} from "@/components/students/student-records-provider";
import type {StudentRecord} from "@/lib/student-types";

type ContactStreamSummary = {
    name: string;
    total: number;
    complete: number;
};

type ContactClassSummary = {
    name: string;
    total: number;
    complete: number;
    streams: ContactStreamSummary[];
};

function formatCount(value: number) {
    return value.toLocaleString("en-US");
}

function hasParentContact(student: StudentRecord) {
    return Boolean(student.primaryPhone.trim() || student.additionalGuardians?.some((guardian) => guardian.phone.trim()));
}

export default function ContactsPage() {
    const {students} = useStudentRecords();
    const {classes: schoolClasses, streams: schoolStreams} = useSchoolStructure();
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(() => new Set());
    const activeStudents = useMemo(
        () => students.filter((student) => student.status === "Active"),
        [students],
    );
    const classSummaries = useMemo<ContactClassSummary[]>(() => schoolClasses
        .map((schoolClass) => {
            const classStudents = activeStudents.filter((student) => student.className.trim() === schoolClass.name);
            const streams = schoolStreams
                .filter((stream) => stream.classId === schoolClass.id)
                .map((stream) => {
                    const streamStudents = classStudents.filter((student) => student.stream.trim() === stream.name);
                    return {
                        name: stream.name,
                        total: streamStudents.length,
                        complete: streamStudents.filter(hasParentContact).length,
                    };
                });
            return {
                name: schoolClass.name,
                total: classStudents.length,
                complete: classStudents.filter(hasParentContact).length,
                streams,
            };
        })
        .sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true, sensitivity: "base"})),
    [activeStudents, schoolClasses, schoolStreams]);
    const complete = activeStudents.filter(hasParentContact).length;
    const missing = activeStudents.length - complete;
    const coverage = activeStudents.length ? Math.round(complete / activeStudents.length * 100) : 0;

    return (
        <main className="page-content biometrics-overview">
            <header className="biometrics-overview-heading">
                <div>
                    <h1>Contacts Tracking</h1>
                    <p>Parent and guardian phone contact coverage by student</p>
                </div>
                <Link className="biometrics-overview-students-link" href="/students">
                    <UsersRound aria-hidden="true" size={18}/>
                    Students List
                </Link>
            </header>

            <section aria-label="Parent contact summary" className="biometrics-overview-summary">
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Total Students</h2>
                        <strong>{formatCount(activeStudents.length)}</strong>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon students"><UsersRound size={32}/></span>
                </article>
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Contact Complete</h2>
                        <strong>{formatCount(complete)}</strong>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon captured"><ContactRound size={32}/></span>
                </article>
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Contact Missing</h2>
                        <strong>{formatCount(missing)}</strong>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon missing"><CircleSlash2 size={32}/></span>
                </article>
                <article className="biometrics-overview-card">
                    <div>
                        <h2>Contact Coverage</h2>
                        <strong>{coverage}%</strong>
                        <small>{formatCount(complete)} of {formatCount(activeStudents.length)} students have at least one parent phone</small>
                    </div>
                    <span aria-hidden="true" className="biometrics-overview-icon today"><ContactRound size={32}/></span>
                </article>
            </section>

            <section aria-labelledby="contacts-classes-title" className="biometrics-classes-list">
                <header className="biometrics-classes-list-heading">
                    <div>
                        <h2 id="contacts-classes-title">Classes</h2>
                        <p>Parent contact coverage by class</p>
                    </div>
                    <span>{formatCount(classSummaries.length)} {classSummaries.length === 1 ? "class" : "classes"}</span>
                </header>
                <ul>
                    {classSummaries.map((schoolClass, index) => {
                        const notComplete = schoolClass.total - schoolClass.complete;
                        const classCoverage = schoolClass.total
                            ? Math.round(schoolClass.complete / schoolClass.total * 100)
                            : 0;
                        const streamNames = schoolClass.streams.map((stream) => stream.name);
                        const expanded = expandedClasses.has(schoolClass.name);
                        const streamsId = `contacts-streams-${index}`;

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
                                        <span>Contact complete</span>
                                        <strong>{formatCount(schoolClass.complete)}</strong>
                                    </div>
                                    <div className="biometrics-class-list-stat pending">
                                        <span>Contact missing</span>
                                        <strong>{formatCount(notComplete)}</strong>
                                    </div>
                                    <div
                                        aria-label={`${classCoverage}% parent contact coverage`}
                                        aria-valuemax={100}
                                        aria-valuemin={0}
                                        aria-valuenow={classCoverage}
                                        className="biometrics-coverage-ring"
                                        role="progressbar"
                                        style={{background: `conic-gradient(var(--orchid) 0 ${classCoverage}%, #e8e5ec ${classCoverage}% 100%)`}}
                                    >
                                        <span>{classCoverage}%</span>
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
                                        const streamMissing = stream.total - stream.complete;
                                        const streamCoverage = stream.total
                                            ? Math.round(stream.complete / stream.total * 100)
                                            : 0;
                                        return <li className="biometrics-stream-list-item" key={`${schoolClass.name}:${stream.name}`}>
                                            <div className="biometrics-stream-list-row">
                                                <span className="biometrics-stream-list-name">{stream.name}</span>
                                                <span><small>Students</small><strong>{formatCount(stream.total)}</strong></span>
                                                <span className="captured"><small>Contact complete</small><strong>{formatCount(stream.complete)}</strong></span>
                                                <span className="pending"><small>Contact missing</small><strong>{formatCount(streamMissing)}</strong></span>
                                                <span
                                                    aria-label={`${streamCoverage}% parent contact coverage`}
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
                                                    href={`/contacts/class/${encodeURIComponent(schoolClass.name)}?stream=${encodeURIComponent(stream.name)}`}
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
