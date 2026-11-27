"use client";

import {useEffect, useMemo, useRef, useState, type SubmitEvent} from "react";
import {Plus, Search, X} from "lucide-react";
import {useSchoolStructure, type SchoolClass, type SchoolLevel} from "../../../../components/settings/school-structure-provider";

const schoolLevels: SchoolLevel[] = ["O-Level", "A-Level"];

function isSchoolLevel(value: string): value is SchoolLevel {
    return schoolLevels.includes(value as SchoolLevel);
}

export default function ClassesPage() {
    const {classes, setClasses, streams} = useSchoolStructure();
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [className, setClassName] = useState("");
    const [level, setLevel] = useState<SchoolLevel>("O-Level");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);
    const classNameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (dialogOpen && !dialog.open) {
            dialog.showModal();
            classNameInputRef.current?.focus();
        } else if (!dialogOpen && dialog.open) {
            dialog.close();
        }
    }, [dialogOpen]);

    const visibleClasses = useMemo(() => classes
        .filter((item) => `${item.name} ${item.level}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((first, second) =>
            schoolLevels.indexOf(first.level) - schoolLevels.indexOf(second.level) ||
            first.name.localeCompare(second.name, undefined, {numeric: true}),
        ), [classes, search]);

    function openAddDialog() {
        setEditingId(null);
        setClassName("");
        setLevel("O-Level");
        setError("");
        setNotice("");
        setDialogOpen(true);
    }

    function openEditDialog(item: SchoolClass) {
        setEditingId(item.id);
        setClassName(item.name);
        setLevel(item.level);
        setError("");
        setNotice("");
        setDialogOpen(true);
    }

    function saveClass(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalizedName = className.trim();
        if (!normalizedName) {
            setError("Enter a class name.");
            return;
        }
        if (classes.some((item) =>
            item.id !== editingId &&
            item.level === level &&
            item.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
        )) {
            setError(`${normalizedName} already exists in ${level}.`);
            return;
        }

        const updatedClass = {
            id: editingId ?? crypto.randomUUID(),
            name: normalizedName,
            level,
        };
        setClasses((current) => [
            ...current.filter((item) => item.id !== editingId),
            updatedClass,
        ]);
        setDialogOpen(false);
    }

    function deleteClass(item: SchoolClass) {
        const assignedStreams = streams.filter((stream) => stream.classId === item.id);
        if (assignedStreams.length) {
            setNotice(`Cannot delete ${item.name} while it has ${assignedStreams.length} assigned ${assignedStreams.length === 1 ? "stream" : "streams"}. Remove or reassign those streams first.`);
            return;
        }
        if (!window.confirm(`Delete ${item.name} (${item.level})?`)) return;
        setClasses((current) => current.filter((schoolClass) => schoolClass.id !== item.id));
        setNotice("");
    }

    return (
        <div className="page-content academic-years-page">
            <header className="academic-years-heading">
                <div>
                    <h1>Classes</h1>
                    <p>Manage and add school classes</p>
                </div>
                <button className="academic-year-add-button" onClick={openAddDialog} type="button">
                    <Plus aria-hidden="true" size={13}/>Add Class
                </button>
            </header>
            {notice && <p aria-live="polite" className="school-structure-notice">{notice}</p>}

            <section aria-labelledby="school-classes-list-heading" className="academic-years-card">
                <div className="academic-years-card-heading">
                    <div>
                        <h2 id="school-classes-list-heading">Classes List</h2>
                        <p>Maintain class names and their school levels.</p>
                    </div>
                    <label className="academic-years-search">
                        <Search aria-hidden="true" size={13}/>
                        <input
                            aria-label="Search classes"
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search classes..."
                            value={search}
                        />
                    </label>
                </div>
                <div className="academic-years-table-wrap">
                    <table className="academic-years-table school-classes-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Class Name</th>
                                <th scope="col">Level</th>
                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleClasses.map((item, index) => (
                                <tr key={item.id}>
                                    <td>{index + 1}</td>
                                    <td>{item.name}</td>
                                    <td><span className={`school-class-level school-class-level-${item.level.toLocaleLowerCase().replace("-", "")}`}>{item.level}</span></td>
                                    <td className="academic-year-actions">
                                        <button
                                            aria-label={`Edit ${item.name}`}
                                            className="academic-year-edit-button"
                                            onClick={() => openEditDialog(item)}
                                            type="button"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            aria-label={`Delete ${item.name}`}
                                            className="academic-year-delete-button"
                                            onClick={() => deleteClass(item)}
                                            type="button"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {visibleClasses.length === 0 && (
                                <tr>
                                    <td className="academic-years-empty" colSpan={4}>
                                        {search ? "No classes match your search." : "No classes have been added."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <dialog
                aria-labelledby="school-class-dialog-title"
                className="academic-year-dialog school-class-dialog"
                onClose={() => setDialogOpen(false)}
                ref={dialogRef}
            >
                <div className="academic-year-dialog-heading">
                    <h2 id="school-class-dialog-title">{editingId ? "Edit Class" : "Add Class"}</h2>
                    <button
                        aria-label="Close"
                        className="academic-year-dialog-close"
                        onClick={() => setDialogOpen(false)}
                        type="button"
                    >
                        <X aria-hidden="true" size={15}/>
                    </button>
                </div>
                <form onSubmit={saveClass}>
                    <div className="academic-year-dialog-content school-class-dialog-content">
                        <label className="academic-year-input-label" htmlFor="school-class-name">
                            Class Name <span aria-hidden="true">*</span>
                        </label>
                        <input
                            className="school-class-name-input"
                            id="school-class-name"
                            onChange={(event) => {
                                setClassName(event.target.value);
                                setError("");
                            }}
                            placeholder="e.g. S.1"
                            ref={classNameInputRef}
                            required
                            type="text"
                            value={className}
                        />
                        <label className="academic-year-input-label" htmlFor="school-class-level">
                            Level <span aria-hidden="true">*</span>
                        </label>
                        <select
                            className="school-class-level-select"
                            id="school-class-level"
                            onChange={(event) => {
                                if (isSchoolLevel(event.target.value)) setLevel(event.target.value);
                            }}
                            required
                            value={level}
                        >
                            {schoolLevels.map((schoolLevel) => (
                                <option key={schoolLevel} value={schoolLevel}>{schoolLevel}</option>
                            ))}
                        </select>
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
                            {editingId ? "Save Changes" : "Add Class"}
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
}
