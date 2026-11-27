"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {ArrowLeft, FileSpreadsheet, Printer, Search} from "lucide-react";
import {useSchoolStructure} from "@/components/settings/school-structure-provider";
import {useStudentRecords} from "@/components/students/student-records-provider";
import type {StudentRecord} from "@/lib/student-types";

type ContactStatusFilter = "Missing" | "Complete" | "All";

type ContactsStreamBreakdownProps = {
    className: string;
    streamName: string;
};

function formatCount(value: number) {
    return value.toLocaleString("en-US");
}

function hasParentContact(student: StudentRecord) {
    return Boolean(student.primaryPhone.trim() || student.additionalGuardians?.some((guardian) => guardian.phone.trim()));
}

function getParentContacts(student: StudentRecord) {
    return [
        {
            name: student.guardianName,
            relationship: student.relationship,
            phone: student.primaryPhone,
            email: student.guardianEmail,
        },
        ...(student.additionalGuardians ?? []),
    ];
}

function getStudentClassName(student: StudentRecord) {
    return student.className.trim() || "Unassigned";
}

function getStudentStreamName(student: StudentRecord) {
    return student.stream.trim() || "Unassigned";
}

export function ContactsStreamBreakdown({className, streamName}: ContactsStreamBreakdownProps) {
    const {students} = useStudentRecords();
    const {classes, streams} = useSchoolStructure();
    const [status, setStatus] = useState<ContactStatusFilter>("Missing");
    const [search, setSearch] = useState("");
    const streamStudents = useMemo(() => students.filter((student) =>
        student.status === "Active" &&
        getStudentClassName(student) === className &&
        getStudentStreamName(student) === streamName,
    ), [className, streamName, students]);
    const filteredStudents = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return streamStudents.filter((student) => {
            const hasContact = hasParentContact(student);
            const matchesStatus = status === "All" || (status === "Complete" ? hasContact : !hasContact);
            const searchableFields = [
                student.fullName,
                student.admissionNumber,
                student.guardianName,
                student.primaryPhone,
                student.guardianEmail,
                ...(student.additionalGuardians ?? []).flatMap((guardian) => [
                    guardian.name,
                    guardian.relationship,
                    guardian.phone,
                    guardian.email,
                ]),
            ];
            return matchesStatus && searchableFields.some((value) => value.toLocaleLowerCase().includes(query));
        });
    }, [search, status, streamStudents]);
    const schoolClass = classes.find((item) => item.name === className);
    const streamExists = schoolClass !== undefined && streams.some((stream) =>
        stream.classId === schoolClass.id && stream.name === streamName,
    );

    function exportStudents() {
        const rows = [
            ["#", "Student", "Reg No", "Guardian", "Relationship", "Parent phone", "Email", "Contact status"],
            ...filteredStudents.map((student, index) => [
                String(index + 1),
                student.fullName,
                student.admissionNumber,
                getParentContacts(student).map((guardian) => guardian.name).filter(Boolean).join("; "),
                getParentContacts(student).map((guardian) => guardian.relationship).filter(Boolean).join("; "),
                getParentContacts(student).map((guardian) => guardian.phone).filter(Boolean).join("; "),
                getParentContacts(student).map((guardian) => guardian.email).filter(Boolean).join("; "),
                hasParentContact(student) ? "Complete" : "Missing",
            ]),
        ];
        const csv = rows.map((row) => row.map((value) => {
            const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
            return `"${safeValue.replaceAll('"', '""')}"`;
        }).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type: "text/csv;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${className}-${streamName}-contacts.csv`.replaceAll(/[^a-zA-Z0-9._-]+/g, "-");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <main className="page-content biometrics-breakdown-page">
            <Link className="biometrics-breakdown-back" href="/contacts">
                <ArrowLeft aria-hidden="true" size={15}/>
                Contacts Tracking
            </Link>

            <section aria-labelledby="contacts-breakdown-title" className="biometrics-breakdown-panel">
                <header className="biometrics-breakdown-heading">
                    <div>
                        <h1 id="contacts-breakdown-title">
                            {streamName} · {formatCount(filteredStudents.length)} Students
                        </h1>
                        <p>{className} · Parent and guardian contact breakdown</p>
                    </div>
                    <div className="biometrics-breakdown-controls">
                        <div aria-label="Filter students by parent contact status" className="biometrics-breakdown-filter" role="group">
                            {(["Missing", "Complete", "All"] as const).map((filter) => (
                                <button
                                    aria-pressed={status === filter}
                                    className={status === filter ? "is-selected" : ""}
                                    key={filter}
                                    onClick={() => setStatus(filter)}
                                    type="button"
                                >
                                    {filter === "Missing" ? "Contact Missing" : filter === "Complete" ? "Contact Complete" : filter}
                                </button>
                            ))}
                        </div>
                        <label className="biometrics-breakdown-search">
                            <Search aria-hidden="true" size={16}/>
                            <span className="visually-hidden">Search students and parent contacts</span>
                            <input
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search students or contacts..."
                                value={search}
                            />
                        </label>
                        <button className="biometrics-breakdown-export excel" onClick={exportStudents} type="button">
                            <FileSpreadsheet aria-hidden="true" size={14}/>
                            Excel
                        </button>
                        <button className="biometrics-breakdown-export pdf" onClick={() => window.print()} type="button">
                            <Printer aria-hidden="true" size={14}/>
                            PDF
                        </button>
                    </div>
                </header>

                <div className="biometrics-breakdown-table-wrap">
                    <table className="biometrics-breakdown-table contacts-breakdown-table">
                        <thead>
                            <tr>
                                <th scope="col">#</th>
                                <th scope="col">Student</th>
                                <th scope="col">Reg No</th>
                                <th scope="col">Parent / guardian</th>
                                <th scope="col">Relationship</th>
                                <th scope="col">Primary phone</th>
                                <th scope="col">Email</th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((student, index) => {
                                const contactExists = hasParentContact(student);
                                const parentContacts = getParentContacts(student);
                                return (
                                    <tr key={student.id}>
                                        <td>{index + 1}</td>
                                        <td>
                                            <Link className="biometrics-breakdown-student-link" href={`/students/${student.id}`}>
                                                {student.fullName}
                                            </Link>
                                        </td>
                                        <td>{student.admissionNumber}</td>
                                        <td>
                                            <div className="contacts-breakdown-entries">
                                                {parentContacts.map((guardian, guardianIndex) => (
                                                    <div className="contacts-breakdown-entry" key={`${guardianIndex}-${guardian.name}`}>
                                                        <strong>{guardian.name || "Name not provided"}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="contacts-breakdown-entries">
                                                {parentContacts.map((guardian, guardianIndex) => (
                                                    <div className="contacts-breakdown-entry" key={`${guardianIndex}-${guardian.name}`}>
                                                        {guardian.relationship || "—"}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="contacts-breakdown-entries">
                                                {parentContacts.map((guardian, guardianIndex) => (
                                                    <div className="contacts-breakdown-entry" key={`${guardianIndex}-${guardian.name}`}>
                                                        {guardian.phone || "—"}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="contacts-breakdown-entries">
                                                {parentContacts.map((guardian, guardianIndex) => (
                                                    <div className="contacts-breakdown-entry" key={`${guardianIndex}-${guardian.name}`}>
                                                        {guardian.email || "—"}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`biometrics-breakdown-status ${contactExists ? "complete" : "pending"}`}>
                                                {contactExists ? "Complete" : "Missing"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredStudents.length === 0 && (
                                <tr>
                                    <td className="biometrics-breakdown-empty" colSpan={8}>
                                        {!streamExists
                                            ? "This class or stream could not be found."
                                            : `No ${status === "All" ? "" : `${status.toLocaleLowerCase()} `}students match your search.`}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    );
}
