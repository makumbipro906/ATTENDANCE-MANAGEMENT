"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {Download, Search} from "lucide-react";

import type {ManagementRow} from "@/lib/school-types";
import {Badge} from "./ui/badge";
import {Button} from "./ui/button";
import {Input} from "./ui/input";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "./ui/table";

type ManagementTableProps = {
    title: string;
    columns: [string, string];
    initialRows: ManagementRow[];
    initialSearch?: string;
};

const defaultStatuses = ["Complete", "Pending", "Missing", "Archived"];

function escapeCsv(value: string) {
    const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
}

export function ManagementTable({title, columns, initialRows, initialSearch = ""}: ManagementTableProps) {
    const [query, setQuery] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState("All statuses");
    const statuses = useMemo(
        () => Array.from(new Set([...defaultStatuses, ...initialRows.map((row) => row.status)])),
        [initialRows],
    );
    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return initialRows.filter((row) => {
            const matchesQuery = normalizedQuery.length === 0 ||
                [row.name, row.detail, row.status, row.value].some((field) =>
                    field.toLocaleLowerCase().includes(normalizedQuery),
                );
            return matchesQuery && (statusFilter === "All statuses" || row.status === statusFilter);
        });
    }, [initialRows, query, statusFilter]);

    function exportCsv() {
        const headings = [columns[0], "Reference / details", columns[1], "Status", "Last updated"];
        const csv = [
            headings,
            ...filteredRows.map((row) => [row.name, row.detail, row.value, row.status, row.lastUpdated ?? ""]),
        ].map((record) => record.map(escapeCsv).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type: "text/csv;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "school-records"}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <section aria-label={`${title} records`} className="card table-card">
            <div className="table-toolbar">
                <div>
                    <h2 className="card-title">{title}</h2>
                    <div aria-live="polite" className="card-subtitle">Showing {filteredRows.length} of {initialRows.length} records</div>
                </div>
                <Button className="button-secondary" onClick={exportCsv} type="button" variant="outline">
                    <Download aria-hidden="true"/>Export CSV
                </Button>
            </div>
            <div className="table-controls">
                <label className="table-search">
                    <Search aria-hidden="true" size={16}/>
                    <Input
                        aria-label="Search records"
                        className="management-search-input"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search records..."
                        type="search"
                        value={query}
                    />
                </label>
                <label className="status-filter">
                    <span className="visually-hidden">Filter by status</span>
                    <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                        <option>All statuses</option>
                        {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                </label>
            </div>
            <div className="table-wrap">
                <Table className="data-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{columns[0]}</TableHead>
                            <TableHead>{columns[1]}</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last updated</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.map((row, index) => (
                            <TableRow key={row.id ?? `${row.name}-${index}`}>
                                <TableCell>
                                    <div className="student-cell">
                                        <span aria-hidden="true" className="person-avatar">
                                            {row.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                                        </span>
                                        <span>
                                            <span className="student-name">
                                                {row.href ? <Link className="management-record-link" href={row.href}>{row.name}</Link> : row.name}
                                            </span>
                                            <span className="student-meta">{row.detail}</span>
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>{row.value}</TableCell>
                                <TableCell>
                                    <Badge className={`status-pill ${row.status.toLowerCase()}`} variant="outline">{row.status}</Badge>
                                </TableCell>
                                <TableCell>{row.lastUpdated ?? "—"}</TableCell>
                            </TableRow>
                        ))}
                        {filteredRows.length === 0 && (
                            <TableRow>
                                <TableCell className="empty-table-state" colSpan={4}>
                                    {initialRows.length === 0 ? "No matching records have been added yet." : "No records match your search and status filters."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="table-footer">
                <span>Records are linked to the school database.</span>
                <span>{filteredRows.length} records</span>
            </div>
        </section>
    );
}
