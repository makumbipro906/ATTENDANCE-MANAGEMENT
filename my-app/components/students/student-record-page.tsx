"use client";

import Link from "next/link";
import {useState} from "react";
import {ArrowLeft, ContactRound, Fingerprint, GraduationCap, LoaderCircle, Pencil, UserRound} from "lucide-react";
import {useStudentRecords} from "./student-records-provider";
import {StudentForm, type StudentFormSection, type StudentFormValues} from "./student-directory";
import {Badge} from "../ui/badge";
import {Button} from "../ui/button";

function StudentDetail({label, value}: {label: string; value: string}) {
    return (
        <div className="student-profile-detail">
            <dt>{label}</dt>
            <dd>{value || "Not provided"}</dd>
        </div>
    );
}

export function StudentRecordPage({studentId}: {studentId: string}) {
    const {students, updateStudent, saveBiometricsStatus, persistenceError} = useStudentRecords();
    const [notice, setNotice] = useState("");
    const [editingSection, setEditingSection] = useState<StudentFormSection | null>(null);
    const [biometricsSaving, setBiometricsSaving] = useState(false);
    const student = students.find((record) => record.id === studentId);
    const backHref = student?.status === "Archived" ? "/students/archived" : "/students";

    if (!student) {
        return (
            <div className="page-content">
                <div className="page-heading">
                    <div>
                        <div className="eyebrow">Student record</div>
                        <h1 className="page-title">Record unavailable</h1>
                        <p className="page-description">This student may have been removed or is no longer available.</p>
                    </div>
                </div>
                <Button asChild className="button-secondary" variant="outline">
                    <Link href="/students"><ArrowLeft aria-hidden="true"/>Back to Students List</Link>
                </Button>
            </div>
        );
    }

    const currentStudent = student;

    async function saveStudent(values: StudentFormValues): Promise<string | undefined> {
        const duplicate = students.some((record) =>
            record.id !== currentStudent.id &&
            record.admissionNumber.trim().toLocaleLowerCase() === values.admissionNumber.trim().toLocaleLowerCase(),
        );
        if (duplicate) return `Admission number ${values.admissionNumber} is already in use.`;

        await updateStudent({...currentStudent, ...values});
        setNotice(`${values.fullName}'s details were updated.`);
        setEditingSection(null);
        return undefined;
    }

    async function handleBiometricsChange(recorded: boolean) {
        setBiometricsSaving(true);
        setNotice("");
        try {
            await Promise.all([
                saveBiometricsStatus(currentStudent.id, recorded),
                new Promise<void>((resolve) => window.setTimeout(resolve, 350)),
            ]);
            setNotice(recorded
                ? `Biometrics recorded for ${currentStudent.fullName}.`
                : `Biometrics marked as not recorded for ${currentStudent.fullName}.`,
            );
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Biometric status could not be saved.");
        } finally {
            setBiometricsSaving(false);
        }
    }

    return (
        <div className="page-content students-page student-record-page">
            <nav aria-label="Breadcrumb" className="student-record-breadcrumb">
                <Link href={backHref}><ArrowLeft aria-hidden="true" size={15}/>{student.status === "Archived" ? "Archived Students" : "Students List"}</Link>
                <span aria-hidden="true">/</span>
                <span>{student.fullName}</span>
            </nav>
            <header className="card student-profile-summary">
                <span aria-hidden="true" className="student-profile-avatar">
                    {student.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div className="student-profile-identity">
                    <div className="eyebrow">Student profile</div>
                    <h1>{student.fullName}</h1>
                    <p>{student.admissionNumber} <span aria-hidden="true">·</span> {student.className} · {student.stream}</p>
                </div>
                <Badge className={`status-pill ${student.status.toLowerCase()}`} variant="outline">{student.status}</Badge>
            </header>
            {notice && <p aria-live="polite" className="student-notice">{notice}</p>}
            <div className="student-profile-grid">
                    <section aria-labelledby="student-identity-heading" className="card student-profile-card">
                        <header className="student-profile-card-heading">
                            <UserRound aria-hidden="true" size={17}/><h2 id="student-identity-heading">Student identity</h2>
                            <Button
                                aria-label="Edit student identity"
                                className="student-profile-edit-button"
                                onClick={() => setEditingSection("identity")}
                                disabled={editingSection !== null}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                <Pencil aria-hidden="true" size={13}/>Edit
                            </Button>
                        </header>
                        {editingSection === "identity" ? (
                            <StudentForm
                                key={`${student.id}-identity`}
                                onCancel={() => setEditingSection(null)}
                                onSave={saveStudent}
                                section="identity"
                                student={student}
                            />
                        ) : (
                            <dl className="student-profile-details">
                                <StudentDetail label="Full name" value={student.fullName}/>
                                <StudentDetail label="Admission number" value={student.admissionNumber}/>
                                <StudentDetail label="Date of birth" value={student.dateOfBirth}/>
                                <StudentDetail label="Gender" value={student.gender}/>
                                <StudentDetail label="Enrollment status" value={student.status}/>
                            </dl>
                        )}
                    </section>
                    <section aria-labelledby="student-placement-heading" className="card student-profile-card">
                        <header className="student-profile-card-heading">
                            <GraduationCap aria-hidden="true" size={18}/><h2 id="student-placement-heading">Academic placement</h2>
                            <Button
                                aria-label="Edit academic placement"
                                className="student-profile-edit-button"
                                onClick={() => setEditingSection("placement")}
                                disabled={editingSection !== null}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                <Pencil aria-hidden="true" size={13}/>Edit
                            </Button>
                        </header>
                        {editingSection === "placement" ? (
                            <StudentForm
                                key={`${student.id}-placement`}
                                onCancel={() => setEditingSection(null)}
                                onSave={saveStudent}
                                section="placement"
                                student={student}
                            />
                        ) : (
                            <dl className="student-profile-details">
                                <StudentDetail label="Academic year" value={student.academicYear}/>
                                <StudentDetail label="Term" value={student.term}/>
                                <StudentDetail label="Class" value={student.className}/>
                                <StudentDetail label="Stream" value={student.stream}/>
                                <StudentDetail label="Section" value={student.section}/>
                            </dl>
                        )}
                    </section>
                    <section aria-labelledby="student-guardian-heading" className="card student-profile-card">
                        <header className="student-profile-card-heading">
                            <ContactRound aria-hidden="true" size={17}/><h2 id="student-guardian-heading">Parent / guardian</h2>
                            <Button
                                aria-label="Edit parent or guardian details"
                                className="student-profile-edit-button"
                                onClick={() => setEditingSection("guardian")}
                                disabled={editingSection !== null}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                <Pencil aria-hidden="true" size={13}/>Edit
                            </Button>
                        </header>
                        {editingSection === "guardian" ? (
                            <StudentForm
                                key={`${student.id}-guardian`}
                                onCancel={() => setEditingSection(null)}
                                onSave={saveStudent}
                                section="guardian"
                                student={student}
                            />
                        ) : (
                            <dl className="student-profile-details">
                                <StudentDetail label="Name" value={student.guardianName}/>
                                <StudentDetail label="Relationship" value={student.relationship}/>
                                <StudentDetail label="Primary phone" value={student.primaryPhone}/>
                                <StudentDetail label="Student phone" value={student.studentPhone}/>
                                <StudentDetail label="Email" value={student.guardianEmail}/>
                                {(student.additionalGuardians ?? []).map((guardian, index) => (
                                    <StudentDetail
                                        key={`${guardian.name}-${index}`}
                                        label={`Additional parent / guardian ${index + 1}`}
                                        value={`${guardian.name} · ${guardian.relationship} · ${guardian.phone}${guardian.email ? ` · ${guardian.email}` : ""}`}
                                    />
                                ))}
                            </dl>
                        )}
                    </section>
                    <section aria-labelledby="student-biometric-heading" className="card student-profile-card student-profile-biometric">
                        <header className="student-profile-card-heading">
                            <Fingerprint aria-hidden="true" size={17}/><h2 id="student-biometric-heading">Biometrics</h2>
                        </header>
                        <label className="student-biometric-record-control">
                            <input
                                checked={student.biometricsStatus === "Complete"}
                                disabled={biometricsSaving}
                                onChange={(event) => void handleBiometricsChange(event.target.checked)}
                                type="checkbox"
                            />
                            {biometricsSaving && <LoaderCircle aria-hidden="true" className="student-biometric-spinner" size={15}/>}
                            <span>{biometricsSaving ? "Updating biometrics..." : "Record biometrics"}</span>
                        </label>
                        <dl className="student-profile-details">
                            <StudentDetail label="Enrollment status" value={student.biometricsStatus}/>
                            <StudentDetail label="Next step" value={student.biometricsStatus === "Complete" ? "No action required" : "Complete enrollment on a registered device"}/>
                        </dl>
                        {persistenceError && <p className="student-biometric-error" role="alert">{persistenceError}</p>}
                    </section>
                </div>
        </div>
    );
}
