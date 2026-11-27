"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {ArrowLeft, FileSpreadsheet, Printer, Search} from "lucide-react";
import {useSchoolStructure} from "@/components/settings/school-structure-provider";
import {useStudentRecords} from "@/components/students/student-records-provider";
import type {StudentRecord} from "@/lib/student-types";

type BiometricsStatusFilter = "Pending" | "Complete" | "All";

type BiometricsStreamBreakdownProps = {
    className: string;
    streamName: string;
};

function formatCount(value: number) {
    return value.toLocaleString("en-US");
}

function getStudentClassName(student: StudentRecord) {
    return student.className.trim() || "Unassigned";
}

function getStudentStreamName(student: StudentRecord) {
    return student.stream.trim() || "Unassigned";
}

function formatCaptureDate(student: StudentRecord) {
    if (!student.biometricsCapturedAt) return "";
    return new Date(student.biometricsCapturedAt).toLocaleDateString();
}

export function BiometricsStreamBreakdown({className, streamName}: BiometricsStreamBreakdownProps) {
    const {students} = useStudentRecords();
    const {classes, streams} = useSchoolStructure();
    const [status, setStatus] = useState<BiometricsStatusFilter>("Pending");
    const [search, setSearch] = useState("");
    const streamStudents = useMemo(() => students.filter((student) =>
        student.status === "Active" &&
        getStudentClassName(student) === className &&
        getStudentStreamName(student) === streamName,
    ), [className, streamName, students]);
    const filteredStudents = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return streamStudents.filter((student) =>
            (status === "All" || student.biometricsStatus === status) &&
            `${student.fullName} ${student.admissionNumber}`.toLocaleLowerCase().includes(query),
        );
    }, [search, status, streamStudents]);
    const schoolClass = classes.find((item) => item.name === className);
    const streamExists = schoolClass !== undefined && streams.some((stream) =>
        stream.classId === schoolClass.id && stream.name === streamName,
    );

    function exportStudents() {
        const rows = [
            ["#", "Student", "Reg No", "Class", "Stream", "Biometrics", "Captured On"],
            ...filteredStudents.map((student, index) => [
                String(index + 1),
                student.fullName,
                student.admissionNumber,
                getStudentClassName(student),
                getStudentStreamName(student),
                student.biometricsStatus === "Complete" ? "Captured" : "Not Captured",
                formatCaptureDate(student),
            ]),
        ];
        const csv = rows.map((row) => row.map((value) => {
            const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
            return `"${safeValue.replaceAll('"', '""')}"`;
        }).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type: "text/csv;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${className}-${streamName}-biometrics.csv`.replaceAll(/[^a-zA-Z0-9._-]+/g, "-");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <main className="page-content biometrics-breakdown-page">
            <Link className="biometrics-breakdown-back" href="/biometrics">
                <ArrowLeft aria-hidden="true" size={15}/>
                Biometrics Tracking
            </Link>

            <section aria-labelledby="biometrics-breakdown-title" className="biometrics-breakdown-panel">
                <header className="biometrics-breakdown-heading">
                    <div>
                        <h1 id="biometrics-breakdown-title">
                            {streamName} · {formatCount(filteredStudents.length)} Students
                        </h1>
                        <p>{className} · Biometric capture breakdown</p>
                    </div>
                    <div className="biometrics-breakdown-controls">
                        <div aria-label="Filter students by biometric status" className="biometrics-breakdown-filter" role="group">
                            {(["Pending", "Complete", "All"] as const).map((filter) => (
                                <button
                                    aria-pressed={status === filter}
                                    className={status === filter ? "is-selected" : ""}
                                    key={filter}
                                    onClick={() => setStatus(filter)}
                                    type="button"
                                >
                                    {filter === "Pending" ? "Not Captured" : filter === "Complete" ? "Captured" : filter}
                                </button>
                            ))}
                        </div>
                        <label className="biometrics-breakdown-search">
                            <Search aria-hidden="true" size={16}/>
                            <span className="visually-hidden">Search students</span>
                            <input
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search students..."
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
                    <table className="biometrics-breakdown-table">
                        <thead>
                            <tr>
                                <th scope="col">#</th>
                                <th scope="col">Student</th>
                                <th scope="col">Reg No</th>
                                <th scope="col">Stream</th>
                                <th scope="col">Biometrics</th>
                                <th scope="col">Captured On</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((student, index) => (
                                <tr key={student.id}>
                                    <td>{index + 1}</td>
                                    <td>
                                        <Link className="biometrics-breakdown-student-link" href={`/students/${student.id}`}>
                                            {student.fullName}
                                        </Link>
                                    </td>
                                    <td>{student.admissionNumber}</td>
                                    <td>{getStudentStreamName(student)}</td>
                                    <td>
                                        <span className={`biometrics-breakdown-status ${student.biometricsStatus.toLowerCase()}`}>
                                            {student.biometricsStatus === "Complete" ? "Captured" : "Not Captured"}
                                        </span>
                                    </td>
                                    <td>{formatCaptureDate(student) || "—"}</td>
                                </tr>
                            ))}
                            {filteredStudents.length === 0 && (
                                <tr>
                                    <td className="biometrics-breakdown-empty" colSpan={6}>
                                        {!streamExists
                                            ? "This class or stream could not be found."
                                            : `No ${status === "All" ? "" : `${status === "Pending" ? "not captured" : "captured"} `}students match your search.`}
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
