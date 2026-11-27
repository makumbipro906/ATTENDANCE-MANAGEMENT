"use client";

import Link from "next/link";
import {useEffect, useMemo, useRef, useState, type SubmitEvent} from "react";
import {Archive, Download, Plus, RotateCcw, Search, Trash2, UsersRound} from "lucide-react";

import type {StudentRecord} from "../../lib/student-types";
import type {ParentGuardianContact} from "../../lib/student-types";
import {useStudentRecords} from "./student-records-provider";
import {Badge} from "../ui/badge";
import {Button} from "../ui/button";
import {Input} from "../ui/input";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "../ui/table";
import {useSchoolStructure} from "../settings/school-structure-provider";
import {useAcademicYears} from "../settings/academic-years-provider";

const relationships = ["Mother", "Father", "Guardian", "Other"];

type StudentDirectoryProps = {
    archivedOnly?: boolean;
    initialSearch?: string;
};

export type StudentFormValues = Omit<StudentRecord, "id" | "biometricsStatus">;
export type StudentFormSection = "identity" | "placement" | "guardian";
type DialogState =
    | { type: "add" }
    | { type: "view"; student: StudentRecord }
    | { type: "edit"; student: StudentRecord }
    | null;
type ConfirmState = { action: "archive" | "restore" | "delete"; student: StudentRecord } | null;

const emptyForm: StudentFormValues = {
    admissionNumber: "",
    fullName: "",
    dateOfBirth: "",
    gender: "",
    academicYear: "",
    term: "",
    className: "",
    stream: "",
    section: "Day",
    guardianName: "",
    relationship: "",
    primaryPhone: "",
    studentPhone: "",
    guardianEmail: "",
    additionalGuardians: [],
    status: "Active",
};

export function StudentForm({
                         student,
                         section,
                         readOnly,
                         onSave,
                         onCancel,
                     }: {
    student?: StudentRecord;
    section?: StudentFormSection;
    readOnly?: boolean;
    onSave: (student: StudentFormValues) => string | undefined | Promise<string | undefined>;
    onCancel: () => void;
}) {
    const {classes, streams, sections} = useSchoolStructure();
    const {years, terms} = useAcademicYears();
    const [values, setValues] = useState<StudentFormValues>(
        student
            ? {
                admissionNumber: student.admissionNumber,
                fullName: student.fullName,
                dateOfBirth: student.dateOfBirth,
                gender: student.gender,
                academicYear: student.academicYear,
                term: student.term,
                className: student.className,
                stream: student.stream,
                section: student.section,
                guardianName: student.guardianName,
                relationship: student.relationship,
                primaryPhone: student.primaryPhone,
                studentPhone: student.studentPhone,
                guardianEmail: student.guardianEmail,
                additionalGuardians: student.additionalGuardians ?? [],
                status: student.status,
            }
            : emptyForm,
    );
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const selectedClass = classes.find((schoolClass) => schoolClass.name === values.className);
    const availableStreams = streams
        .filter((stream) => stream.classId === selectedClass?.id)
        .map((stream) => stream.name);
    const availableTerms = terms
        .filter((term) => String(term.year) === values.academicYear)
        .map((term) => term.name);

    function updateAdditionalGuardian(index: number, field: keyof ParentGuardianContact, value: string) {
        setValues((current) => ({
            ...current,
            additionalGuardians: (current.additionalGuardians ?? []).map((guardian, guardianIndex) =>
                guardianIndex === index ? {...guardian, [field]: value} : guardian,
            ),
        }));
    }

    function addAdditionalGuardian() {
        setValues((current) => ({
            ...current,
            additionalGuardians: [
                ...(current.additionalGuardians ?? []),
                {name: "", relationship: "", phone: "", email: ""},
            ],
        }));
    }

    function updateField<Key extends keyof StudentFormValues>(
        field: Key,
        value: StudentFormValues[Key],
    ) {
        setValues((current) => ({
            ...current,
            [field]: value,
            ...(field === "className" ? {stream: ""} : {}),
        }));
    }

    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const cleanedValues: StudentFormValues = {
            ...values,
            admissionNumber: values.admissionNumber.trim(),
            fullName: values.fullName.trim(),
            dateOfBirth: values.dateOfBirth.trim(),
            gender: values.gender.trim(),
            academicYear: values.academicYear.trim(),
            term: values.term.trim(),
            className: values.className.trim(),
            stream: values.stream.trim(),
            section: values.section.trim(),
            guardianName: values.guardianName.trim(),
            relationship: values.relationship.trim(),
            primaryPhone: values.primaryPhone.trim(),
            studentPhone: values.studentPhone.trim(),
            guardianEmail: values.guardianEmail.trim(),
            additionalGuardians: (values.additionalGuardians ?? [])
                .map((guardian) => ({
                    name: guardian.name.trim(),
                    relationship: guardian.relationship.trim(),
                    phone: guardian.phone.trim(),
                    email: guardian.email.trim(),
                }))
                .filter((guardian) => guardian.name || guardian.relationship || guardian.phone || guardian.email),
        };
        const incompleteAdditionalGuardian = cleanedValues.additionalGuardians?.some((guardian) =>
            !guardian.name || !guardian.relationship || !guardian.phone,
        );
        if (incompleteAdditionalGuardian) {
            setError("Enter the name, relationship, and phone number for each additional parent or guardian.");
            return;
        }
        const requiredValues = section === "identity"
            ? [cleanedValues.admissionNumber, cleanedValues.fullName, cleanedValues.gender]
            : section === "placement"
                ? [cleanedValues.academicYear, cleanedValues.term, cleanedValues.className, cleanedValues.stream, cleanedValues.section]
                : section === "guardian"
                    ? [cleanedValues.guardianName, cleanedValues.relationship, cleanedValues.primaryPhone]
                    : [
                        cleanedValues.admissionNumber,
                        cleanedValues.fullName,
                        cleanedValues.gender,
                        cleanedValues.academicYear,
                        cleanedValues.term,
                        cleanedValues.className,
                        cleanedValues.stream,
                        cleanedValues.section,
                        cleanedValues.guardianName,
                        cleanedValues.relationship,
                        cleanedValues.primaryPhone,
                    ];
        if (requiredValues.some((value) => !value)) {
            setError("Complete all required fields before saving the student.");
            return;
        }

        setSaving(true);
        try {
            const saveError = await onSave(cleanedValues);
            if (saveError) {
                setError(saveError);
                return;
            }
            setError("");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Student record could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    function field<Key extends keyof StudentFormValues>(
        name: Key,
        label: string,
        options?: string[],
        required = false,
        hint?: string,
    ) {
        const id = `student-${name}`;
        const value = values[name] as string;

        return (
            <label className="student-form-field" htmlFor={id} key={name}>
                <span>{label}{required && " *"}</span>
                {options ? (
                    <select
                        disabled={readOnly}
                        id={id}
                        onChange={(event) =>
                          updateField(name, event.target.value as StudentFormValues[Key])
                        }
                        required={required}
                        value={value}
                    >
                        <option value="">Select {label.toLowerCase()}</option>
                        {options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        autoComplete={name === "primaryPhone" ? "tel" : name === "guardianEmail" ? "email" : undefined}
                        disabled={readOnly || (name === "stream" && !values.className)}
                        id={id}
                        max={name === "dateOfBirth" ? new Date().toISOString().slice(0, 10) : undefined}
                        onChange={(event) =>
                          updateField(name, event.target.value as StudentFormValues[Key])
                        }
                                                placeholder={
                                                        name === "admissionNumber" ? "Enter admission number" :
                                                                name === "fullName" ? "Student's full legal name" :
                                                                        name === "primaryPhone" || name === "studentPhone" ? "+254 700 000 000" :
                                                                                name === "guardianEmail" ? "name@example.com" : undefined
                                                }
                        required={required}
                        type={
                            name === "dateOfBirth"
                                ? "date"
                                : name === "primaryPhone" || name === "studentPhone"
                                    ? "tel"
                                    : name === "guardianEmail"
                                        ? "email"
                                        : "text"
                        }
                        value={value}
                    />
                )}
                {hint && <small>{hint}</small>}
            </label>
        );
    }

    return (
        <form
            className="student-form"
            onSubmit={submit}
        >
            <p className="student-form-intro">
                {student
                    ? readOnly
                        ? `Details for ${student.fullName}. Restore this record before making changes.`
                        : `Update ${student.fullName}'s ${section === "identity"
                            ? "student information"
                            : section === "placement"
                                ? "academic placement"
                                : section === "guardian"
                                    ? "parent or guardian details"
                                    : "student, placement, and guardian details"}.`
                    : "Enter the student's details and assign them to the correct school class."}
            </p>
            <span className="student-required-note">* Required fields</span>

            {(!section || section === "identity") && <fieldset className="student-form-section">
                <legend>A. Student information</legend>
                <div className="student-form-grid">
                    {field("admissionNumber", "Admission number", undefined, true, "Use a unique admission number.")}
                    {field("fullName", "Full name", undefined, true)}
                    {field("dateOfBirth", "Date of birth")}
                    {field("gender", "Gender", ["Female", "Male", "Prefer not to say"], true)}
                </div>
            </fieldset>}

            {(!section || section === "placement") && <fieldset className="student-form-section">
                <legend>B. Academic placement</legend>
                <div className="student-form-grid">
                    {field("academicYear", "Academic year", years.map((item) => String(item.year)), true)}
                    {field("term", "Term", availableTerms, true)}
                    {field("className", "Class", classes.map((schoolClass) => schoolClass.name), true)}
                    {field("stream", "Stream", availableStreams, true, "Streams are shown for the selected class.")}
                    {field("section", "Section", sections, true)}
                </div>
            </fieldset>}

            {(!section || section === "guardian") && <fieldset className="student-form-section">
                <legend>C. Parent / guardian details</legend>
                <p className="student-section-help">
                    These details are important because the attendance system sends SMS notifications after check-in.
                </p>
                <div className="student-form-grid">
                    {field("guardianName", "Parent / guardian name", undefined, true)}
                    {field("relationship", "Relationship to student", relationships, true)}
                    {field("primaryPhone", "Primary phone number", undefined, true, "Include the country code.")}
                    {field("studentPhone", "Student's contact number (optional)")}
                    {field("guardianEmail", "Parent / guardian email (optional)")}
                </div>
                <div className="student-additional-guardians">
                    <div className="student-additional-guardians-heading">
                        <div>
                            <strong>Additional parents / guardians</strong>
                            <small>Add up to two more contacts. Name, relationship, and phone are required for each.</small>
                        </div>
                        {(values.additionalGuardians?.length ?? 0) < 2 && !readOnly && (
                            <Button className="button-secondary" onClick={addAdditionalGuardian} type="button" variant="outline">
                                <Plus aria-hidden="true" size={14}/>Add parent
                            </Button>
                        )}
                    </div>
                    {(values.additionalGuardians ?? []).map((guardian, index) => (
                        <fieldset className="student-additional-guardian" key={index}>
                            <legend>Additional parent / guardian {index + 1}</legend>
                            <div className="student-form-grid">
                                <label className="student-form-field">
                                    <span>Name *</span>
                                    <input
                                        disabled={readOnly}
                                        onChange={(event) => updateAdditionalGuardian(index, "name", event.target.value)}
                                        required
                                        value={guardian.name}
                                    />
                                </label>
                                <label className="student-form-field">
                                    <span>Relationship *</span>
                                    <select
                                        disabled={readOnly}
                                        onChange={(event) => updateAdditionalGuardian(index, "relationship", event.target.value)}
                                        required
                                        value={guardian.relationship}
                                    >
                                        <option value="">Select relationship</option>
                                        {relationships.map((relationship) => (
                                            <option key={relationship} value={relationship}>{relationship}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="student-form-field">
                                    <span>Phone number *</span>
                                    <input
                                        autoComplete="tel"
                                        disabled={readOnly}
                                        onChange={(event) => updateAdditionalGuardian(index, "phone", event.target.value)}
                                        placeholder="+254 700 000 000"
                                        required
                                        type="tel"
                                        value={guardian.phone}
                                    />
                                </label>
                                <label className="student-form-field">
                                    <span>Email (optional)</span>
                                    <input
                                        autoComplete="email"
                                        disabled={readOnly}
                                        onChange={(event) => updateAdditionalGuardian(index, "email", event.target.value)}
                                        placeholder="name@example.com"
                                        type="email"
                                        value={guardian.email}
                                    />
                                </label>
                            </div>
                            {!readOnly && (
                                <Button
                                    className="button-secondary student-remove-guardian"
                                    onClick={() => setValues((current) => ({
                                        ...current,
                                        additionalGuardians: (current.additionalGuardians ?? []).filter((_, guardianIndex) => guardianIndex !== index),
                                    }))}
                                    type="button"
                                    variant="outline"
                                >
                                    Remove
                                </Button>
                            )}
                        </fieldset>
                    ))}
                </div>
            </fieldset>}

            {!section && <fieldset className="student-form-section">
                <legend>D. Registration status</legend>
                <div className="student-registration-status">
                    <span>Enrollment status</span>
                    <span className={`status-pill ${values.status.toLowerCase()}`}>{values.status}</span>
                    <small>Use the Archive action on the Students List to change enrollment status.</small>
                </div>
            </fieldset>}

            {!section && <div className="biometric-preview">
                <div>
                    <strong>Biometric enrollment</strong>
                    <p>Face and fingerprint enrollment should be handled through the Biometrics Recording workflow after
                        registration.</p>
                </div>
                <span className={`status-pill ${(student?.biometricsStatus ?? "Pending").toLowerCase()}`}>
                    {student?.biometricsStatus ?? "Pending"}
                </span>
            </div>}

            {error && <p aria-live="assertive" className="student-form-error">{error}</p>}
            <div className="student-form-actions">
                {!readOnly && (
                    <Button
                        className="button-primary student-save-button"
                        disabled={saving}
                        type="submit"
                    >
                        {saving ? "Saving..." : student ? "Save changes" : "Add student"}
                    </Button>
                )}
                <Button className="button-secondary" onClick={onCancel} type="button" variant="outline">
                    {readOnly ? "Close" : "Cancel"}
                </Button>
            </div>
        </form>
    );
}

export function StudentDirectory({
                                     archivedOnly = false,
                                     initialSearch = "",
                                 }: StudentDirectoryProps) {
    const {students, addStudent, updateStudent, archiveStudent, restoreStudent, deleteStudent} = useStudentRecords();
    const {classes: schoolClasses, streams, sections} = useSchoolStructure();
    const classNames = schoolClasses.map((schoolClass) => schoolClass.name);
    const [query, setQuery] = useState(initialSearch);
    const [classFilter, setClassFilter] = useState("All classes");
    const [streamFilter, setStreamFilter] = useState("All streams");
    const [sectionFilter, setSectionFilter] = useState("All sections");
    const [genderFilter, setGenderFilter] = useState("All genders");
    const [dialog, setDialog] = useState<DialogState>(null);
    const [confirmation, setConfirmation] = useState<ConfirmState>(null);
    const [notice, setNotice] = useState("");
    const modalRef = useRef<HTMLDialogElement>(null);
    const confirmRef = useRef<HTMLDialogElement>(null);
    const dialogTitle = dialog?.type === "add"
        ? "Register a student"
        : dialog?.type === "edit"
            ? `Edit ${dialog.student.fullName}`
            : dialog?.type === "view"
                ? dialog.student.fullName
                : "";

    useEffect(() => {
        if (!modalRef.current) return;
        if (dialog && !modalRef.current.open) modalRef.current.showModal();
        if (!dialog && modalRef.current.open) modalRef.current.close();
    }, [dialog]);

    useEffect(() => {
        if (!confirmRef.current) return;
        if (confirmation && !confirmRef.current.open) confirmRef.current.showModal();
        if (!confirmation && confirmRef.current.open) confirmRef.current.close();
    }, [confirmation]);

    const visibleStudents = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return students.filter((student) => {
            const matchesQuery =
                !normalizedQuery ||
                student.fullName.toLocaleLowerCase().includes(normalizedQuery) ||
                student.admissionNumber.toLocaleLowerCase().includes(normalizedQuery);
            return (
                matchesQuery &&
                (classFilter === "All classes" || student.className === classFilter) &&
                (streamFilter === "All streams" || student.stream === streamFilter) &&
                (sectionFilter === "All sections" || student.section === sectionFilter) &&
                (genderFilter === "All genders" || student.gender === genderFilter) &&
                student.status === (archivedOnly ? "Archived" : "Active")
            );
        });
    }, [archivedOnly, classFilter, genderFilter, query, sectionFilter, streamFilter, students]);

    async function saveStudent(values: StudentFormValues): Promise<string | undefined> {
        const duplicate = students.some(
            (student) =>
                student.admissionNumber.trim().toLocaleLowerCase() ===
                values.admissionNumber.trim().toLocaleLowerCase() &&
                student.id !== (dialog?.type === "edit" ? dialog.student.id : undefined),
        );
        if (duplicate) return `Admission number ${values.admissionNumber} is already in use.`;

        if (dialog?.type === "edit") {
            await updateStudent({
                ...dialog.student,
                ...values,
                biometricsStatus: dialog.student.biometricsStatus,
            });
            setNotice(`${values.fullName} was updated.`);
        } else {
            await addStudent({...values, biometricsStatus: "Pending"});
            setNotice(`${values.fullName} was added.`);
        }
        setDialog(null);
        return undefined;
    }

    async function confirmStudentAction() {
        if (!confirmation) return;
        try {
            if (confirmation.action === "archive") {
                await archiveStudent(confirmation.student.id);
                setNotice(`${confirmation.student.fullName} was archived.`);
            } else if (confirmation.action === "restore") {
                await restoreStudent(confirmation.student.id);
                setNotice(`${confirmation.student.fullName} was restored to the Students List.`);
            } else {
                await deleteStudent(confirmation.student.id);
                setNotice(`${confirmation.student.fullName} was permanently deleted.`);
            }
            setConfirmation(null);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Student action could not be completed.");
        }
    }

    const activeCount = students.filter((student) => student.status === "Active").length;
    const archivedCount = students.filter((student) => student.status === "Archived").length;

    function exportStudents() {
        const headings = ["S/N", "Name", "Admission number", "Class", "Stream", "Gender", "Section", "Status"];
        const csv = [
            headings,
            ...visibleStudents.map((student, index) => [
                String(index + 1),
                student.fullName,
                student.admissionNumber,
                student.className,
                student.stream,
                student.gender,
                student.section,
                student.status,
            ]),
        ]
            .map((row) =>
                row
                    .map((value) => {
                        const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
                        return `"${safeValue.replaceAll('"', '""')}"`;
                    })
                    .join(","),
            )
            .join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type: "text/csv;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = archivedOnly ? "archived-students.csv" : "students.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <div className="page-content students-page">
            <div className="students-page-heading">
                <div>
                    <div className="eyebrow">School records</div>
                    <h1 className="page-title">{archivedOnly ? "Archived Students" : "Students Directory"}</h1>
                    <p className="page-description">
                        {archivedOnly
                            ? "Review students who are no longer actively enrolled."
                            : "Register, search, update and manage student records."}
                    </p>
                </div>
                {!archivedOnly && (
                    <Button className="button-primary student-add-button" onClick={() => setDialog({type: "add"})} type="button">
                        <Plus aria-hidden="true"/>Add student
                    </Button>
                )}
            </div>

            <nav aria-label="Student directory views" className="filter-row page-tabs">
                                <Link aria-current={!archivedOnly ? "page" : undefined}
                                            className={`filter-chip student-view-tab${!archivedOnly ? " active" : ""}`} href="/students">
                                        <UsersRound aria-hidden="true" size={15}/>Students List <span>{activeCount}</span>
                </Link>
                <Link aria-current={archivedOnly ? "page" : undefined}
                                            className={`filter-chip student-view-tab${archivedOnly ? " active" : ""}`} href="/students/archived">
                                        <Archive aria-hidden="true" size={15}/>Archived Students <span>{archivedCount}</span>
                </Link>
            </nav>

            <section aria-label="Student records" className="card student-directory-card">
                <div className="student-directory-toolbar">
                    <div>
                        <h2 className="card-title">{archivedOnly ? "Archived students" : "Students directory"}</h2>
                        <p className="card-subtitle">{visibleStudents.length} {archivedOnly ? "archived" : "active"} records</p>
                    </div>
                        <Button className="button-secondary" onClick={exportStudents} type="button" variant="outline">
                            <Download aria-hidden="true"/>Export CSV
                        </Button>
                </div>

                <p className="student-search-hint">Search by name or admission number; filter by class, stream, section
                    and status.</p>
                <div className="student-filters">
                    <label className="student-search">
                        <Search aria-hidden="true" size={16}/>
                        <Input
                            aria-label="Search students by name or admission number"
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search name or admission number..."
                            type="search"
                            value={query}
                        />
                    </label>
                    <label>
                        <span className="visually-hidden">Filter by class</span>
                        <select onChange={(event) => {
                            setClassFilter(event.target.value);
                            setStreamFilter("All streams");
                        }} value={classFilter}>
                            <option>All classes</option>
                            {classNames.map((schoolClass) => <option key={schoolClass}>{schoolClass}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className="visually-hidden">Filter by stream</span>
                        <select onChange={(event) => setStreamFilter(event.target.value)} value={streamFilter}>
                            <option>All streams</option>
                            {Array.from(new Set(streams
                                .filter((stream) => classFilter === "All classes" ||
                                    schoolClasses.find((schoolClass) => schoolClass.name === classFilter)?.id === stream.classId)
                                .map((stream) => stream.name)))
                                .map((stream) => <option key={stream}>{stream}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className="visually-hidden">Filter by section</span>
                        <select onChange={(event) => setSectionFilter(event.target.value)} value={sectionFilter}>
                            <option>All sections</option>
                            {sections.map((section) => <option key={section}>{section}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className="visually-hidden">Filter by gender</span>
                        <select onChange={(event) => setGenderFilter(event.target.value)} value={genderFilter}>
                            <option>All genders</option>
                            {Array.from(new Set(students.map((student) => student.gender))).map((gender) => (
                                <option key={gender}>{gender}</option>
                            ))}
                        </select>
                    </label>
                </div>

                {notice && <p aria-live="polite" className="student-notice">{notice}</p>}

                <div className="student-table-wrap">
                    <Table className="data-table student-table">
                        <TableHeader>
                        <TableRow>
                            <TableHead scope="col">S/N</TableHead>
                            <TableHead scope="col">Name / admission no.</TableHead>
                            <TableHead scope="col">Class (stream)</TableHead>
                            <TableHead scope="col">Gender</TableHead>
                            <TableHead scope="col">Section</TableHead>
                            <TableHead scope="col">Status</TableHead>
                            <TableHead scope="col">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {visibleStudents.map((student, index) => (
                            <TableRow key={student.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>
                                    <div className="student-name-cell">
                                        <span aria-hidden="true" className="student-row-avatar">
                                            {student.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                                        </span>
                                        <span>
                                            <Link className="student-name-link" href={`/students/${student.id}`}>
                                                <strong className="student-name">{student.fullName}</strong>
                                            </Link>
                                            <span className="student-meta">{student.admissionNumber}</span>
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>{student.className}<span className="student-meta">{student.stream}</span></TableCell>
                                <TableCell>{student.gender}</TableCell>
                                <TableCell>{student.section}</TableCell>
                                <TableCell><Badge className={`status-pill ${student.status.toLowerCase()}`} variant="outline">{student.status}</Badge></TableCell>
                                <TableCell>
                                    <div className="student-row-actions">
                                        {!archivedOnly ? (
                                            <Button aria-label={`Archive ${student.fullName}`} className="student-action-button" onClick={() => setConfirmation({action: "archive", student})} size="sm" title="Archive student" type="button" variant="outline">
                                                <Archive aria-hidden="true"/>Archive
                                            </Button>
                                        ) : (
                                            <>
                                                <Button aria-label={`Restore ${student.fullName}`} className="student-action-button" onClick={() => setConfirmation({action: "restore", student})} size="sm" title="Restore student" type="button" variant="outline">
                                                    <RotateCcw aria-hidden="true"/>Restore
                                                </Button>
                                                <Button aria-label={`Delete ${student.fullName}`} className="student-action-button student-delete-action" onClick={() => setConfirmation({action: "delete", student})} size="sm" title="Delete student permanently" type="button" variant="outline">
                                                    <Trash2 aria-hidden="true"/>Delete
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {visibleStudents.length === 0 && (
                            <TableRow>
                                <TableCell className="empty-table-state" colSpan={7}>No students match these search and filter
                                    settings.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                </div>
                <div className="student-directory-footer">
                    <span>{archivedOnly ? "Restore a student to return them to the Students List. Delete permanently removes the preview record." : "Archive a student to remove the record from the Students List. Edit student details from the student's profile."} Changes are temporary and are not saved to a database.</span>
                    <span>{visibleStudents.length} shown</span>
                </div>
            </section>

            <dialog
                aria-labelledby="student-dialog-title"
                className="student-dialog"
                onClose={() => setDialog(null)}
                ref={modalRef}
            >
                {dialog && (
                    <>
                        <div className="student-dialog-heading">
                            <div>
                                <h2 id="student-dialog-title">{dialogTitle}</h2>
                                <p>{dialog.type === "view" ? "Student record details." : "Required fields are marked with an asterisk."}</p>
                            </div>
                            <button aria-label="Close dialog" className="dialog-close" onClick={() => setDialog(null)}
                                    type="button">×
                            </button>
                        </div>
                        <StudentForm
                            key={dialog.type === "add" ? "add" : `${dialog.type}-${dialog.student.id}`}
                            onCancel={() => setDialog(null)}
                            onSave={saveStudent}
                            readOnly={dialog.type === "view"}
                            student={dialog.type === "add" ? undefined : dialog.student}
                        />
                    </>
                )}
            </dialog>

            {confirmation && (
                <dialog
                    aria-labelledby="student-confirm-title"
                    className="student-confirm-dialog"
                    onClose={() => setConfirmation(null)}
                    ref={confirmRef}
                >
                    <h2 id="student-confirm-title">
                        {confirmation.action === "archive" ? "Archive student?" : confirmation.action === "restore" ? "Restore student?" : "Delete student permanently?"}
                    </h2>
                    <p>
                        {confirmation.action === "archive"
                            ? `${confirmation.student.fullName} will move to Archived Students.`
                            : confirmation.action === "restore"
                                ? `${confirmation.student.fullName} will return to the Students List.`
                                : `${confirmation.student.fullName} will be permanently removed. This cannot be undone.`}
                    </p>
                    <div className="dialog-actions">
                        <button className="button-secondary" onClick={() => setConfirmation(null)}
                                type="button">Cancel
                        </button>
                        <button
                            className={confirmation.action === "delete" ? "button-danger" : "button-primary"}
                            onClick={confirmStudentAction}
                            type="button"
                        >
                            {confirmation.action === "archive" ? "Archive student" : confirmation.action === "restore" ? "Restore student" : "Delete permanently"}
                        </button>
                    </div>
                </dialog>
            )}
        </div>
    );
}
