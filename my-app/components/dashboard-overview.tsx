"use client";

import Link from "next/link";
import {
    ArrowRight,
    CalendarCheck2,
    ChartColumn,
    ContactRound,
    Fingerprint,
    GraduationCap,
    MessageSquare,
    Search,
    Settings2,
    UsersRound,
    Zap,
} from "lucide-react";

import {useStudentRecords} from "./students/student-records-provider";
import {DashboardDate} from "./dashboard-date";
import type {StudentRecord} from "../lib/student-types";

const quickActions = [
    {href: "/students", label: "Students", icon: UsersRound, tone: "violet"},
    {href: "/settings/classes", label: "Classes", icon: GraduationCap, tone: "green"},
    {href: "/attendance/today", label: "Daily attendance", icon: CalendarCheck2, tone: "amber"},
    {href: "/biometrics", label: "Biometrics", icon: Fingerprint, tone: "rose"},
    {href: "/sms", label: "SMS notifications", icon: MessageSquare, tone: "blue"},
    {href: "/settings", label: "Settings", icon: Settings2, tone: "orange"},
];

const colors = ["#7752c7", "#20bf90", "#ff902d", "#3481f5", "#e94c91", "#20a7b5"];

function countBy<T extends string>(students: StudentRecord[], getKey: (student: StudentRecord) => T) {
    return students.reduce<Record<string, number>>((counts, student) => {
        const key = getKey(student);
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
    }, {});
}

function DistributionDonut({
    title,
    values,
    emptyLabel,
}: {
    title: string;
    values: {label: string; value: number; color: string}[];
    emptyLabel: string;
}) {
    const total = values.reduce((sum, item) => sum + item.value, 0);
    const stops = values.reduce<{start: number; gradients: string[]}>((result, item) => {
        const end = total ? result.start + (item.value / total) * 100 : result.start;
        return {
            start: end,
            gradients: [...result.gradients, `${item.color} ${result.start}% ${end}%`],
        };
    }, {start: 0, gradients: []}).gradients;

    return (
        <section aria-label={title} className="school-dashboard-panel">
            <header className="school-dashboard-panel-heading"><h2>{title}</h2></header>
            {total ? (
                <div className="school-dashboard-donut-layout">
                    <div
                        aria-label={`${title}: ${values.map(({label, value}) => `${label} ${value}`).join(", ")}`}
                        className="school-dashboard-donut"
                        role="img"
                        style={{background: `conic-gradient(${stops.join(", ")})`}}
                    >
                        <span className="school-dashboard-donut-hole">
                            <strong>{total}</strong>
                            <small>students</small>
                        </span>
                    </div>
                    <ul className="school-dashboard-legend">
                        {values.map((item) => (
                            <li key={item.label}>
                                <span className="school-dashboard-legend-label">
                                    <i aria-hidden="true" style={{backgroundColor: item.color}}/>
                                    {item.label}
                                </span>
                                <strong>{item.value}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="school-dashboard-empty">{emptyLabel}</p>
            )}
        </section>
    );
}

function DistributionBars({title, values}: {title: string; values: [string, number][]}) {
    const maxValue = Math.max(...values.map(([, value]) => value), 0);
    return (
        <section aria-label={title} className="school-dashboard-panel">
            <header className="school-dashboard-panel-heading"><h2>{title}</h2></header>
            {maxValue ? (
                <ul className="school-dashboard-bars">
                    {values.map(([label, value], index) => (
                        <li key={label}>
                            <div className="school-dashboard-bar-label">
                                <span>{label}</span><strong>{value}</strong>
                            </div>
                            <div
                                aria-label={`${label}: ${value} students`}
                                className="school-dashboard-bar-track"
                                role="img"
                            >
                                <span
                                    className="school-dashboard-bar-fill"
                                    style={{
                                        backgroundColor: colors[index % colors.length],
                                        height: `${Math.max((value / maxValue) * 100, value ? 3 : 0)}%`,
                                        width: "100%",
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="school-dashboard-empty">No active student records to chart.</p>
            )}
        </section>
    );
}

export function DashboardOverview() {
    const {students} = useStudentRecords();
    const activeStudents = students.filter((student) => student.status === "Active");
    const genderCounts = countBy(activeStudents, (student) => student.gender || "Not specified");
    const sectionCounts = countBy(activeStudents, (student) => student.section || "Not specified");
    const classCounts = countBy(activeStudents, (student) => student.className || "Not assigned");
    const streamCounts = countBy(activeStudents, (student) => `${student.className || "Unassigned"} · ${student.stream || "No stream"}`);
    const biometricsComplete = activeStudents.filter((student) => student.biometricsStatus === "Complete").length;
    const femaleCount = genderCounts.Female ?? 0;
    const maleCount = genderCounts.Male ?? 0;
    const streamValues = Object.entries(streamCounts).sort(([a], [b]) => a.localeCompare(b));
    const classValues = Object.entries(classCounts).sort(([a], [b]) => a.localeCompare(b));
    const sectionValues = Object.entries(sectionCounts).map(([label, value], index) => ({
        label,
        value,
        color: colors[index % colors.length],
    }));
    const genderValues = Object.entries(genderCounts).map(([label, value], index) => ({
        label,
        value,
        color: colors[(index + 3) % colors.length],
    }));

    const stats = [
        {label: "Active students", value: activeStudents.length, detail: "Currently enrolled", icon: UsersRound, tone: "violet"},
        {label: "Male students", value: maleCount, detail: "Active student records", icon: UsersRound, tone: "blue"},
        {label: "Female students", value: femaleCount, detail: "Active student records", icon: ContactRound, tone: "rose"},
        {label: "Biometrics complete", value: biometricsComplete, detail: `${activeStudents.length - biometricsComplete} pending`, icon: Fingerprint, tone: "green"},
    ];

    return (
        <div className="page-content school-dashboard">
            <header className="school-dashboard-welcome">
                <div>
                    <div className="eyebrow">School overview</div>
                    <h1 className="page-title">Welcome to your dashboard</h1>
                    <p className="page-description"><DashboardDate/> · A snapshot of student records and school operations.</p>
                </div>
                <form action="/students" className="school-dashboard-search" role="search">
                    <Search aria-hidden="true" size={16}/>
                    <input aria-label="Search students" name="q" placeholder="Search students..." type="search"/>
                    <button type="submit">Search</button>
                </form>
            </header>

            <section aria-labelledby="school-quick-actions-title" className="school-dashboard-panel school-dashboard-quick-panel">
                <header className="school-dashboard-panel-heading">
                    <h2 id="school-quick-actions-title"><Zap aria-hidden="true" className="school-dashboard-zap" size={14}/> Quick actions</h2>
                    <p>Jump to common school tasks</p>
                </header>
                <div className="school-dashboard-quick-actions">
                    {quickActions.map(({href, label, icon: Icon, tone}) => (
                        <Link className="school-dashboard-action" href={href} key={href}>
                            <span className={`school-dashboard-action-icon ${tone}`}><Icon aria-hidden="true" size={19}/></span>
                            <strong>{label}</strong>
                            <ArrowRight aria-hidden="true" className="school-dashboard-action-arrow" size={15}/>
                        </Link>
                    ))}
                </div>
            </section>

            <section aria-label="Student summary" className="school-dashboard-stats">
                {stats.map(({label, value, detail, icon: Icon, tone}) => (
                    <article className="school-dashboard-stat" key={label}>
                        <div>
                            <span className="school-dashboard-stat-label">{label}</span>
                            <strong>{value.toLocaleString()}</strong>
                            <small>{detail}</small>
                        </div>
                        <span className={`school-dashboard-stat-icon ${tone}`}><Icon aria-hidden="true" size={18}/></span>
                    </article>
                ))}
            </section>

            <div className="school-dashboard-charts">
                <DistributionBars title="Students by stream" values={streamValues}/>
                <DistributionDonut title="Students by section" values={sectionValues} emptyLabel="No active student records to chart."/>
                <DistributionBars title="Students by class" values={classValues}/>
                <DistributionDonut title="Students by gender" values={genderValues} emptyLabel="No active student records to chart."/>
            </div>

            <p className="school-dashboard-note">
                <ChartColumn aria-hidden="true" size={16}/>
                Figures are calculated from active student records in this session. Attendance and SMS delivery are not represented here.
                <Link href="/attendance/reports">View attendance reports <ArrowRight aria-hidden="true" size={14}/></Link>
            </p>
        </div>
    );
}
