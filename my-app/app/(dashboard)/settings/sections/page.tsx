"use client";

import {useEffect, useMemo, useRef, useState, type SubmitEvent} from "react";
import {Plus, Search, Trash2, X} from "lucide-react";
import {useSchoolStructure} from "../../../../components/settings/school-structure-provider";
import {useStudentRecords} from "../../../../components/students/student-records-provider";

export default function SectionsPage() {
    const {sections, setSections} = useSchoolStructure();
    const {students} = useStudentRecords();
    const [search, setSearch] = useState("");
    const [sectionName, setSectionName] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);
    const sectionNameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (dialogOpen && !dialog.open) {
            dialog.showModal();
            sectionNameInputRef.current?.focus();
        } else if (!dialogOpen && dialog.open) {
            dialog.close();
        }
    }, [dialogOpen]);

    const visibleSections = useMemo(() => sections
        .filter((section) => section.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((first, second) => first.localeCompare(second)), [search, sections]);

    function openAddDialog() {
        setSectionName("");
        setError("");
        setDialogOpen(true);
    }

    function saveSection(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalizedName = sectionName.trim();
        if (!normalizedName) {
            setError("Enter a section name.");
            return;
        }
        if (sections.some((section) => section.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
            setError(`${normalizedName} already exists.`);
            return;
        }
        setSections((current) => [...current, normalizedName]);
        setDialogOpen(false);
        setNotice("");
    }

    function deleteSection(section: string) {
        const assignedStudents = students.filter((student) => student.section === section);
        if (assignedStudents.length) {
            setNotice(`Cannot remove ${section} because ${assignedStudents.length} ${assignedStudents.length === 1 ? "student is" : "students are"} assigned to it.`);
            return;
        }
        if (!window.confirm(`Remove the ${section} section?`)) return;
        setSections((current) => current.filter((item) => item !== section));
        setNotice("");
    }

    return (
        <div className="page-content academic-years-page">
            <header className="academic-years-heading">
                <div>
                    <h1>Sections</h1>
                    <p>Manage the sections available for student placement.</p>
                </div>
                <button className="academic-year-add-button" onClick={openAddDialog} type="button">
                    <Plus aria-hidden="true" size={13}/>Add Section
                </button>
            </header>
            {notice && <p aria-live="polite" className="school-structure-notice">{notice}</p>}

            <section aria-labelledby="school-sections-list-heading" className="academic-years-card">
                <div className="academic-years-card-heading">
                    <div>
                        <h2 id="school-sections-list-heading">Sections List</h2>
                        <p>Add and manage the sections used when registering students.</p>
                    </div>
                    <label className="academic-years-search">
                        <Search aria-hidden="true" size={13}/>
                        <input
                            aria-label="Search sections"
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search sections..."
                            value={search}
                        />
                    </label>
                </div>
                <div className="academic-years-table-wrap">
                    <table className="academic-years-table school-sections-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Section</th>
                                <th scope="col">Students</th>
                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleSections.map((section, index) => (
                                <tr key={section}>
                                    <td>{index + 1}</td>
                                    <td>{section}</td>
                                    <td>{students.filter((student) => student.section === section).length}</td>
                                    <td className="academic-year-actions">
                                        <button
                                            aria-label={`Remove ${section} section`}
                                            className="academic-year-delete-button"
                                            onClick={() => deleteSection(section)}
                                            type="button"
                                        >
                                            <Trash2 aria-hidden="true" size={11}/>Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {visibleSections.length === 0 && (
                                <tr>
                                    <td className="academic-years-empty" colSpan={4}>
                                        {search ? "No sections match your search." : "No sections have been added."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <dialog
                aria-labelledby="school-section-dialog-title"
                className="academic-year-dialog school-class-dialog"
                onClose={() => setDialogOpen(false)}
                ref={dialogRef}
            >
                <div className="academic-year-dialog-heading">
                    <h2 id="school-section-dialog-title">Add Section</h2>
                    <button
                        aria-label="Close"
                        className="academic-year-dialog-close"
                        onClick={() => setDialogOpen(false)}
                        type="button"
                    >
                        <X aria-hidden="true" size={15}/>
                    </button>
                </div>
                <form onSubmit={saveSection}>
                    <div className="academic-year-dialog-content school-class-dialog-content">
                        <label className="academic-year-input-label" htmlFor="school-section-name">
                            Section <span aria-hidden="true">*</span>
                        </label>
                        <input
                            className="school-class-name-input"
                            id="school-section-name"
                            onChange={(event) => {
                                setSectionName(event.target.value);
                                setError("");
                            }}
                            placeholder="Enter section name"
                            ref={sectionNameInputRef}
                            required
                            type="text"
                            value={sectionName}
                        />
                        {error && <p className="academic-year-error" role="alert">{error}</p>}
                    </div>
                    <div className="academic-year-dialog-actions">
                        <button
                            className="academic-year-cancel-button"
                            onClick={() => setDialogOpen(false)}
                            type="button"
                        >
                            Cancel
                        </button>
                        <button className="academic-year-submit-button" type="submit">
                            Add Section
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
}
