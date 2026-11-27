import Link from "next/link";
import type {ManagementRow} from "../lib/school-types";
import {ManagementTable} from "./management-table";

type ManagementPageProps = {
    eyebrow?: string;
    title: string;
    description: string;
    tabs?: { label: string; href: string; active?: boolean }[];
    rows?: ManagementRow[];
    columns?: [string, string];
    initialSearch?: string;
};

export function ManagementPage({
                                   eyebrow = "School records",
                                   title,
                                   description,
                                   tabs,
                                   rows = [],
                                   columns = ["Record", "Details"],
                                   initialSearch,
                               }: ManagementPageProps) {
    return (
        <div className="page-content">
            <div className="page-heading">
                <div>
                    <div className="eyebrow">{eyebrow}</div>
                    <h1 className="page-title">{title}</h1>
                    <p className="page-description">{description}</p>
                </div>
            </div>
            {tabs && (
                <nav aria-label={`${title} views`} className="filter-row page-tabs">
                    {tabs.map((tab) => (
                        <Link
                            aria-current={tab.active ? "page" : undefined}
                            className={`filter-chip${tab.active ? " active" : ""}`}
                            href={tab.href}
                            key={tab.href}
                        >
                            {tab.label}
                        </Link>
                    ))}
                </nav>
            )}
            <ManagementTable
                columns={columns}
                initialRows={rows}
                initialSearch={initialSearch}
                title={title}
            />
        </div>
    );
}
