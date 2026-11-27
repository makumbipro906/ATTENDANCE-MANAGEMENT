"use client";

import {useEffect, useMemo, useRef, useState, type SubmitEvent} from "react";
import {Check, Plus, Search, X} from "lucide-react";
import {useAcademicYears, type AcademicYear} from "../../../../components/settings/academic-years-provider";

export default function YearsPage() {
    const {years, setYears, terms} = useAcademicYears();
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [yearValue, setYearValue] = useState("");
    const [isCurrent, setIsCurrent] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);
    const yearInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (dialogOpen && !dialog.open) {
            dialog.showModal();
            yearInputRef.current?.focus();
        } else if (!dialogOpen && dialog.open) {
            dialog.close();
        }
    }, [dialogOpen]);

    const visibleYears = useMemo(() => years
        .filter((item) => String(item.year).includes(search.trim()))
        .sort((first, second) => second.year - first.year), [search, years]);

    function openAddDialog() {
        setEditingId(null);
        setYearValue("");
        setIsCurrent(false);
        setError("");
        setDialogOpen(true);
    }

    function openEditDialog(item: AcademicYear) {
        setEditingId(item.id);
        setYearValue(String(item.year));
        setIsCurrent(item.isCurrent);
        setError("");
        setDialogOpen(true);
    }

    function saveYear(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const year = Number(yearValue);
        if (!Number.isInteger(year) || year < 1900 || year > 2200) {
            setError("Enter a valid year between 1900 and 2200.");
            return;
        }
        if (years.some((item) => item.year === year && item.id !== editingId)) {
            setError(`${year} is already in the years list.`);
            return;
        }
        const editedYear = years.find((item) => item.id === editingId);
        if (editedYear && editedYear.year !== year && terms.some((term) => term.year === editedYear.year)) {
            setError(`Remove or reassign the terms for ${editedYear.year} before changing this year.`);
            return;
        }

        if (editingId) {
            setYears((current) => current.map((item) => ({
                ...item,
                ...(item.id === editingId ? {year, isCurrent} : {}),
                ...(isCurrent && item.id !== editingId ? {isCurrent: false} : {}),
            })));
        } else {
            setYears((current) => [
                ...current.map((item) => isCurrent ? {...item, isCurrent: false} : item),
                {id: crypto.randomUUID(), year, isCurrent},
            ]);
        }
        setDialogOpen(false);
    }

    function deleteYear(item: AcademicYear) {
        if (terms.some((term) => term.year === item.year)) {
            setNotice(`Remove the terms assigned to ${item.year} before deleting this year.`);
            return;
        }
        if (!window.confirm(`Delete academic year ${item.year}?`)) return;
        setYears((current) => current.filter((year) => year.id !== item.id));
        setNotice("");
    }

    return (
        <div className="page-content academic-years-page">
            <header className="academic-years-heading">
                <div>
                    <h1>Years</h1>
                    <p>Manage and add academic years</p>
                </div>
                <button className="academic-year-add-button" onClick={openAddDialog} type="button">
                    <Plus aria-hidden="true" size={13}/>Add Year
                </button>
            </header>
            {notice && <p aria-live="polite" className="school-structure-notice">{notice}</p>}

            <section aria-labelledby="academic-years-list-heading" className="academic-years-card">
                <div className="academic-years-card-heading">
                    <div>
                        <h2 id="academic-years-list-heading">Years List</h2>
                        <p>View and manage academic years.</p>
                    </div>
                    <label className="academic-years-search">
                        <Search aria-hidden="true" size={13}/>
                        <input
                            aria-label="Search years"
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search years..."
                            value={search}
                        />
                    </label>
                </div>
                <div className="academic-years-table-wrap">
                    <table className="academic-years-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Year</th>
                                <th scope="col">Status</th>
                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleYears.map((item, index) => (
                                <tr key={item.id}>
                                    <td>{index + 1}</td>
                                    <td>{item.year}</td>
                                    <td>
                                        {item.isCurrent
                                            ? <span className="academic-year-current"><Check aria-hidden="true" size={10}/>Current</span>
                                            : <span className="academic-year-previous">Previous</span>}
                                    </td>
                                    <td className="academic-year-actions">
                                        <button
                                            aria-label={`Edit ${item.year}`}
                                            className="academic-year-edit-button"
                                            onClick={() => openEditDialog(item)}
                                            type="button"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            aria-label={`Delete ${item.year}`}
                                            className="academic-year-delete-button"
                                            onClick={() => deleteYear(item)}
                                            type="button"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {visibleYears.length === 0 && (
                                <tr>
                                    <td className="academic-years-empty" colSpan={4}>
                                        {search ? "No academic years match your search." : "No academic years have been added."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <dialog
                aria-labelledby="academic-year-dialog-title"
                className="academic-year-dialog"
                onClose={() => setDialogOpen(false)}
                ref={dialogRef}
            >
                <div className="academic-year-dialog-heading">
                    <h2 id="academic-year-dialog-title">{editingId ? "Edit Year" : "Add Year"}</h2>
                    <button
                        aria-label="Close"
                        className="academic-year-dialog-close"
                        onClick={() => setDialogOpen(false)}
                        type="button"
                    >
                        <X aria-hidden="true" size={15}/>
                    </button>
                </div>
                <form onSubmit={saveYear}>
                    <div className="academic-year-dialog-content">
                        <label className="academic-year-input-label" htmlFor="academic-year-value">
                            Year <span aria-hidden="true">*</span>
                        </label>
                        <input
                            id="academic-year-value"
                            max="2200"
                            min="1900"
                            onChange={(event) => {
                                setYearValue(event.target.value);
                                setError("");
                            }}
                            placeholder="e.g. 2027"
                            ref={yearInputRef}
                            required
                            type="number"
                            value={yearValue}
                        />
                        <label className="academic-year-current-toggle">
                            <input
                                checked={isCurrent}
                                onChange={(event) => setIsCurrent(event.target.checked)}
                                type="checkbox"
                            />
                            Set as current year
                        </label>
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
                            {editingId ? "Save Changes" : "Add Year"}
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
}
