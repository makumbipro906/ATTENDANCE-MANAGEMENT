"use client";

import {useEffect, useMemo, useRef, useState, type SubmitEvent} from "react";
import Link from "next/link";
import {Plus, Search, X} from "lucide-react";
import {useSchoolStructure, type SchoolStream} from "../../../../components/settings/school-structure-provider";

export default function StreamsPage() {
    const {classes, streams, setStreams} = useSchoolStructure();
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [streamName, setStreamName] = useState("");
    const [classId, setClassId] = useState("");
    const [error, setError] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);
    const streamNameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (dialogOpen && !dialog.open) {
            dialog.showModal();
            streamNameInputRef.current?.focus();
        } else if (!dialogOpen && dialog.open) {
            dialog.close();
        }
    }, [dialogOpen]);

    const visibleStreams = useMemo(() => streams
        .map((stream) => ({
            ...stream,
            schoolClass: classes.find((schoolClass) => schoolClass.id === stream.classId),
        }))
        .filter((stream) =>
            `${stream.name} ${stream.schoolClass?.name ?? ""}`
                .toLocaleLowerCase()
                .includes(search.trim().toLocaleLowerCase()),
        )
        .sort((first, second) =>
            (first.schoolClass?.name ?? "").localeCompare(second.schoolClass?.name ?? "", undefined, {numeric: true}) ||
            first.name.localeCompare(second.name, undefined, {numeric: true}),
        ), [classes, search, streams]);

    function openAddDialog() {
        setEditingId(null);
        setStreamName("");
        setClassId(classes[0]?.id ?? "");
        setError("");
        setDialogOpen(true);
    }

    function openEditDialog(stream: SchoolStream) {
        setEditingId(stream.id);
        setStreamName(stream.name);
        setClassId(stream.classId);
        setError("");
        setDialogOpen(true);
    }

    function saveStream(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalizedName = streamName.trim();
        if (!normalizedName) {
            setError("Enter a stream name.");
            return;
        }
        if (!classes.some((schoolClass) => schoolClass.id === classId)) {
            setError("Select a class for this stream.");
            return;
        }
        if (streams.some((stream) =>
            stream.id !== editingId &&
            stream.classId === classId &&
            stream.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
        )) {
            const selectedClassName = classes.find((schoolClass) => schoolClass.id === classId)?.name;
            setError(`${normalizedName} already exists in ${selectedClassName}.`);
            return;
        }

        const updatedStream: SchoolStream = {
            id: editingId ?? crypto.randomUUID(),
            name: normalizedName,
            classId,
        };
        setStreams((current) => [
            ...current.filter((stream) => stream.id !== editingId),
            updatedStream,
        ]);
        setDialogOpen(false);
    }

    function deleteStream(stream: SchoolStream) {
        const className = classes.find((schoolClass) => schoolClass.id === stream.classId)?.name ?? "Unknown class";
        if (!window.confirm(`Delete ${stream.name} from ${className}?`)) return;
        setStreams((current) => current.filter((item) => item.id !== stream.id));
    }

    return (
        <div className="page-content academic-years-page">
            <header className="academic-years-heading">
                <div>
                    <h1>Streams</h1>
                    <p>Manage and add class streams</p>
                </div>
                <button
                    className="academic-year-add-button"
                    disabled={classes.length === 0}
                    onClick={openAddDialog}
                    type="button"
                >
                    <Plus aria-hidden="true" size={13}/>Add Stream
                </button>
            </header>

            {classes.length === 0 && (
                <p className="school-structure-notice">
                    Add a class before creating streams. <Link href="/settings/classes">Manage classes</Link>
                </p>
            )}

            <section aria-labelledby="school-streams-list-heading" className="academic-years-card">
                <div className="academic-years-card-heading">
                    <div>
                        <h2 id="school-streams-list-heading">Streams List</h2>
                        <p>Assign each stream to a class.</p>
                    </div>
                    <label className="academic-years-search">
                        <Search aria-hidden="true" size={13}/>
                        <input
                            aria-label="Search streams"
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search streams..."
                            value={search}
                        />
                    </label>
                </div>
                <div className="academic-years-table-wrap">
                    <table className="academic-years-table school-classes-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Stream Name</th>
                                <th scope="col">Class</th>
                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleStreams.map((stream, index) => (
                                <tr key={stream.id}>
                                    <td>{index + 1}</td>
                                    <td>{stream.name}</td>
                                    <td>{stream.schoolClass?.name ?? "Class unavailable"}</td>
                                    <td className="academic-year-actions">
                                        <button
                                            aria-label={`Edit ${stream.name} in ${stream.schoolClass?.name ?? "class"}`}
                                            className="academic-year-edit-button"
                                            onClick={() => openEditDialog(stream)}
                                            type="button"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            aria-label={`Delete ${stream.name} in ${stream.schoolClass?.name ?? "class"}`}
                                            className="academic-year-delete-button"
                                            onClick={() => deleteStream(stream)}
                                            type="button"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {visibleStreams.length === 0 && (
                                <tr>
                                    <td className="academic-years-empty" colSpan={4}>
                                        {search ? "No streams match your search." : "No streams have been added."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <dialog
                aria-labelledby="school-stream-dialog-title"
                className="academic-year-dialog school-class-dialog"
                onClose={() => setDialogOpen(false)}
                ref={dialogRef}
            >
                <div className="academic-year-dialog-heading">
                    <h2 id="school-stream-dialog-title">{editingId ? "Edit Stream" : "Add Stream"}</h2>
                    <button
                        aria-label="Close"
                        className="academic-year-dialog-close"
                        onClick={() => setDialogOpen(false)}
                        type="button"
                    >
                        <X aria-hidden="true" size={15}/>
                    </button>
                </div>
                <form onSubmit={saveStream}>
                    <div className="academic-year-dialog-content school-class-dialog-content">
                        <label className="academic-year-input-label" htmlFor="school-stream-name">
                            Stream Name <span aria-hidden="true">*</span>
                        </label>
                        <input
                            className="school-class-name-input"
                            id="school-stream-name"
                            onChange={(event) => {
                                setStreamName(event.target.value);
                                setError("");
                            }}
                            placeholder="e.g. CENTRAL"
                            ref={streamNameInputRef}
                            required
                            type="text"
                            value={streamName}
                        />
                        <label className="academic-year-input-label" htmlFor="school-stream-class">
                            Class <span aria-hidden="true">*</span>
                        </label>
                        <select
                            className="school-class-level-select"
                            id="school-stream-class"
                            onChange={(event) => {
                                setClassId(event.target.value);
                                setError("");
                            }}
                            required
                            value={classId}
                        >
                            <option value="">Select class</option>
                            {classes.map((schoolClass) => (
                                <option key={schoolClass.id} value={schoolClass.id}>
                                    {schoolClass.name} ({schoolClass.level})
                                </option>
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
                            {editingId ? "Save Changes" : "Add Stream"}
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
}
