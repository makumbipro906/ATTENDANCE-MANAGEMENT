"use client";

import {useEffect, useMemo, useRef, useState, type SubmitEvent} from "react";
import {Check, Plus, Search, X} from "lucide-react";
import {useAcademicYears, type AcademicTerm} from "../../../../components/settings/academic-years-provider";

function formatDate(value: string) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
}

export default function TermsPage() {
    const {years, terms, setTerms} = useAcademicYears();
    const academicYearValues = useMemo(() =>
        years.map((item) => item.year).sort((first, second) => second - first),
    [years]);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [yearValue, setYearValue] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isCurrent, setIsCurrent] = useState(false);
    const [error, setError] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (dialogOpen && !dialog.open) {
            dialog.showModal();
            nameInputRef.current?.focus();
        } else if (!dialogOpen && dialog.open) {
            dialog.close();
        }
    }, [dialogOpen]);

    const visibleTerms = useMemo(() => terms
        .filter((term) => [
            term.name,
            String(term.year),
            formatDate(term.startDate),
            formatDate(term.endDate),
        ].some((value) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
        .sort((first, second) =>
            first.year - second.year || first.startDate.localeCompare(second.startDate),
        ), [search, terms]);

    function openAddDialog() {
        setEditingId(null);
        setName("");
        setYearValue(String(years.find((item) => item.isCurrent)?.year ?? academicYearValues[0] ?? ""));
        setStartDate("");
        setEndDate("");
        setIsCurrent(false);
        setError("");
        setDialogOpen(true);
    }

    function openEditDialog(term: AcademicTerm) {
        setEditingId(term.id);
        setName(term.name);
        setYearValue(String(term.year));
        setStartDate(term.startDate);
        setEndDate(term.endDate);
        setIsCurrent(term.isCurrent);
        setError("");
        setDialogOpen(true);
    }

    function saveTerm(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const year = Number(yearValue);
        if (!name.trim()) {
            setError("Enter a term name.");
            return;
        }
        if (!academicYearValues.includes(year)) {
            setError("Select an academic year from the list.");
            return;
        }
        if (!startDate || !endDate || startDate > endDate) {
            setError("Enter a valid date range. The end date must be on or after the start date.");
            return;
        }
        if (startDate.slice(0, 4) !== String(year) || endDate.slice(0, 4) !== String(year)) {
            setError("Term dates must fall within the selected academic year.");
            return;
        }
        if (terms.some((term) =>
            term.id !== editingId &&
            term.year === year &&
            term.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
        )) {
            setError(`${name.trim()} already exists for ${year}.`);
            return;
        }
        const overlapsAnotherTerm = terms.some((term) =>
            term.id !== editingId &&
            term.year === year &&
            startDate <= term.endDate &&
            endDate >= term.startDate,
        );
        if (overlapsAnotherTerm) {
            setError("This date range overlaps another term in the selected academic year.");
            return;
        }

        const updatedTerm = {
            id: editingId ?? crypto.randomUUID(),
            name: name.trim(),
            year,
            startDate,
            endDate,
            isCurrent,
        };
        setTerms((current) => {
            const withoutEdited = current.filter((term) => term.id !== editingId);
            return [
                ...withoutEdited.map((term) => isCurrent ? {...term, isCurrent: false} : term),
                updatedTerm,
            ];
        });
        setDialogOpen(false);
    }

    function deleteTerm(term: AcademicTerm) {
        if (!window.confirm(`Delete ${term.name} (${term.year})?`)) return;
        setTerms((current) => current.filter((item) => item.id !== term.id));
    }

    return (
        <div className="page-content academic-years-page">
            <header className="academic-years-heading">
                <div>
                    <h1>Terms</h1>
                    <p>Manage and add academic terms</p>
                </div>
                <button className="academic-year-add-button" onClick={openAddDialog} type="button">
                    <Plus aria-hidden="true" size={13}/>Add Term
                </button>
            </header>

            <section aria-labelledby="academic-terms-list-heading" className="academic-years-card">
                <div className="academic-years-card-heading">
                    <div>
                        <h2 id="academic-terms-list-heading">Terms List</h2>
                        <p>Maintain academic terms, year assignments, and date ranges.</p>
                    </div>
                    <label className="academic-years-search">
                        <Search aria-hidden="true" size={13}/>
                        <input
                            aria-label="Search terms"
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search terms..."
                            value={search}
                        />
                    </label>
                </div>
                <div className="academic-years-table-wrap">
                    <table className="academic-years-table academic-terms-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Term</th>
                                <th scope="col">Year</th>
                                <th scope="col">Start Date</th>
                                <th scope="col">End Date</th>
                                <th scope="col">Status</th>
                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleTerms.map((term, index) => (
                                <tr key={term.id}>
                                    <td>{index + 1}</td>
                                    <td>{term.name}</td>
                                    <td>{term.year}</td>
                                    <td>{formatDate(term.startDate)}</td>
                                    <td>{formatDate(term.endDate)}</td>
                                    <td>
                                        {term.isCurrent &&
                                            <span className="academic-year-current"><Check aria-hidden="true" size={10}/>Current</span>}
                                    </td>
                                    <td className="academic-year-actions">
                                        <button
                                            aria-label={`Edit ${term.name} ${term.year}`}
                                            className="academic-year-edit-button"
                                            onClick={() => openEditDialog(term)}
                                            type="button"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            aria-label={`Delete ${term.name} ${term.year}`}
                                            className="academic-year-delete-button"
                                            onClick={() => deleteTerm(term)}
                                            type="button"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {visibleTerms.length === 0 && (
                                <tr>
                                    <td className="academic-years-empty" colSpan={7}>
                                        {search ? "No terms match your search." : "No academic terms have been added."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <dialog
                aria-labelledby="academic-term-dialog-title"
                className="academic-year-dialog academic-term-dialog"
                onClose={() => setDialogOpen(false)}
                ref={dialogRef}
            >
                <div className="academic-year-dialog-heading">
                    <h2 id="academic-term-dialog-title">{editingId ? "Edit Term" : "Add Term"}</h2>
                    <button
                        aria-label="Close"
                        className="academic-year-dialog-close"
                        onClick={() => setDialogOpen(false)}
                        type="button"
                    >
                        <X aria-hidden="true" size={15}/>
                    </button>
                </div>
                <form onSubmit={saveTerm}>
                    <div className="academic-year-dialog-content academic-term-dialog-content">
                        <label className="academic-year-input-label" htmlFor="academic-term-name">
                            Term <span aria-hidden="true">*</span>
                        </label>
                        <input
                            className="academic-term-name-input"
                            id="academic-term-name"
                            onChange={(event) => {
                                setName(event.target.value);
                                setError("");
                            }}
                            placeholder="e.g. Term 1"
                            ref={nameInputRef}
                            required
                            type="text"
                            value={name}
                        />
                        <label className="academic-year-input-label" htmlFor="academic-term-year">Academic Year</label>
                        <select
                            className="academic-term-year-select"
                            id="academic-term-year"
                            onChange={(event) => setYearValue(event.target.value)}
                            required
                            value={yearValue}
                        >
                            <option value="">-- Select Year --</option>
                            {academicYearValues.map((year) => <option key={year} value={year}>{year}</option>)}
                        </select>
                        <div className="academic-term-dates">
                            <label className="academic-year-input-label" htmlFor="academic-term-start">Start Date</label>
                            <label className="academic-year-input-label" htmlFor="academic-term-end">End Date</label>
                            <input
                                id="academic-term-start"
                                onChange={(event) => {
                                    setStartDate(event.target.value);
                                    setError("");
                                }}
                                required
                                type="date"
                                value={startDate}
                            />
                            <input
                                id="academic-term-end"
                                onChange={(event) => {
                                    setEndDate(event.target.value);
                                    setError("");
                                }}
                                required
                                type="date"
                                value={endDate}
                            />
                        </div>
                        <label className="academic-year-current-toggle">
                            <input
                                checked={isCurrent}
                                onChange={(event) => setIsCurrent(event.target.checked)}
                                type="checkbox"
                            />
                            Set as current term
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
                            {editingId ? "Save Changes" : "Add Term"}
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
}
