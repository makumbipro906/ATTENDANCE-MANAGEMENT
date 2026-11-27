"use client";

import {useEffect, useMemo, useState, type CSSProperties, type ReactNode} from "react";
import Link from "next/link";
import {
    CalendarDays,
    Check,
    CheckCircle2,
    Clock3,
    CreditCard,
    FileClock,
    Filter,
    LoaderCircle,
    Mail,
    MessageSquareText,
    Plus,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Trash2,
    Users,
    XCircle,
} from "lucide-react";

type ApiError = {error?: string};

function localDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function prettyDate(value: string) {
    if (!value) return "—";
    return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
}

function prettyTime(value: string | null) {
    if (!value) return "—";
    if (/^\d{2}:\d{2}$/.test(value)) return value;
    return new Date(value).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
}

function money(value: number, currency = "UGX") {
    return `${currency} ${value.toLocaleString("en-UG")}`;
}

function PageHeading({eyebrow, title, description, action}: {
    eyebrow: string; title: string; description: string; action?: ReactNode;
}) {
    return (
        <header className="student-attendance-heading">
            <div>
                <span className="student-attendance-eyebrow">{eyebrow}</span>
                <h1>{title}</h1>
                <p>{description}</p>
            </div>
            {action}
        </header>
    );
}

function StateMessage({error, loading, empty}: {error: string; loading: boolean; empty: string}) {
    if (error) return <p className="student-attendance-message is-error" role="alert">{error}</p>;
    if (loading) return <p className="student-attendance-message" role="status"><LoaderCircle className="student-attendance-spin" size={16}/> Loading records…</p>;
    return <p className="student-attendance-message">{empty}</p>;
}

type DailyResponse = {
    date: string;
    isSchoolDay: boolean;
    summary: {totalStudents: number; present: number; absent: number; attendanceRate: number | null};
    gender: {gender: string; total: number; present: number; absent: number; rate: number | null}[];
    streams: {className: string; stream: string; total: number; present: number; rate: number | null}[];
    timeMetrics: {check_ins: number; check_outs: number; first_check_in: string | null; last_check_out: string | null};
    latest: {id: string; full_name: string; admission_number: string; class_name: string; stream: string; sign_in: string | null; sign_out: string | null}[];
};

export function StudentAttendanceDailyPage() {
    const [date, setDate] = useState(localDate);
    const [report, setReport] = useState<DailyResponse | null>(null);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/student-attendance/daily?date=${encodeURIComponent(date)}`, {
                    cache: "no-store", signal: controller.signal,
                });
                const payload = await response.json() as DailyResponse | ApiError;
                if (!response.ok || !("summary" in payload)) throw new Error(("error" in payload && payload.error) || "Daily attendance could not be loaded.");
                setReport(payload);
            } catch (loadError) {
                if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Daily attendance could not be loaded.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [date, reloadKey]);

    const latest = useMemo(() => {
        const term = search.trim().toLocaleLowerCase();
        return (report?.latest ?? []).filter((row) =>
            `${row.full_name} ${row.admission_number} ${row.class_name} ${row.stream}`.toLocaleLowerCase().includes(term),
        );
    }, [report?.latest, search]);
    const summary = report?.summary;

    return (
        <div className="page-content student-attendance-page">
            <PageHeading eyebrow="Students attendance" title="Daily Attendance" description="A live overview of student attendance and the latest recorded sign-ins."/>
            <div className="student-attendance-toolbar">
                <label><CalendarDays aria-hidden="true" size={16}/><span>Date</span><input onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label>
                <button onClick={() => setReloadKey((key) => key + 1)} type="button"><RefreshCw size={15}/>Refresh</button>
                <Link href="/student-attendance/records"><FileClock size={15}/>View attendance records</Link>
            </div>
            {report && !report.isSchoolDay && <p className="student-attendance-message is-warning">This date is not a scheduled school day. Absences and attendance rates are not counted.</p>}
            {error && <p className="student-attendance-message is-error" role="alert">{error}</p>}
            <section aria-label="Daily attendance summary" className="student-attendance-kpis">
                <article className="student-attendance-kpi kpi-orchid"><span><Users size={19}/></span><small>Total students</small><strong>{summary?.totalStudents.toLocaleString() ?? (loading ? "…" : "0")}</strong></article>
                <article className="student-attendance-kpi kpi-green"><span><CheckCircle2 size={19}/></span><small>Present</small><strong>{summary?.present.toLocaleString() ?? (loading ? "…" : "0")}</strong></article>
                <article className="student-attendance-kpi kpi-rose"><span><XCircle size={19}/></span><small>Not recorded</small><strong>{summary?.absent.toLocaleString() ?? (loading ? "…" : "0")}</strong></article>
                <article className="student-attendance-kpi kpi-blue"><span><CalendarDays size={19}/></span><small>Attendance rate</small><strong>{summary?.attendanceRate === null || summary?.attendanceRate === undefined ? "—" : `${summary.attendanceRate}%`}</strong></article>
            </section>

            <section className="student-attendance-visual-grid" aria-label="Attendance breakdown">
                {(report?.gender ?? []).length ? report?.gender.map((group) => (
                    <article className="student-attendance-panel gender-panel" key={group.gender}>
                        <div className="student-attendance-panel-heading"><div><h2>{group.gender} attendance</h2><p>Present against active enrolled students</p></div></div>
                        <div className="attendance-donut-row">
                            <div aria-label={group.rate === null ? "Not a school day" : `${group.rate}% attendance`} className="attendance-donut" style={{"--attendance-rate": `${group.rate ?? 0}%`} as CSSProperties}>
                                <div><strong>{group.rate === null ? "—" : `${group.rate}%`}</strong><span>{report?.isSchoolDay ? "present" : "not scheduled"}</span></div>
                            </div>
                            <div className="attendance-donut-legend"><span><i className="legend-present"/>Present <b>{group.present}</b></span><span><i className="legend-absent"/>No record <b>{group.absent}</b></span><span>Total <b>{group.total}</b></span></div>
                        </div>
                    </article>
                )) : (
                    <article className="student-attendance-panel gender-panel"><div className="student-attendance-panel-heading"><div><h2>Attendance by gender</h2><p>Present against active enrolled students</p></div></div><StateMessage error="" loading={loading} empty="No enrolled students are available for this date."/></article>
                )}
                <article className="student-attendance-panel stream-performance-panel">
                    <div className="student-attendance-panel-heading"><div><h2>Stream performance</h2><p>Attendance rate by class and stream</p></div></div>
                    {(report?.streams ?? []).length ? <div className="attendance-stream-list">
                        {report?.streams.map((stream) => <div className="attendance-stream-row" key={`${stream.className}-${stream.stream}`}>
                            <span><strong>{stream.className}</strong><small>{stream.stream}</small></span>
                            <div className="attendance-stream-progress"><i style={{width: `${stream.rate ?? 0}%`}}/></div>
                            <b>{stream.rate ?? 0}%</b>
                        </div>)}
                    </div> : <StateMessage error="" loading={loading} empty="No stream attendance data for this date."/>}
                </article>
                <article className="student-attendance-panel time-metrics-panel">
                    <div className="student-attendance-panel-heading"><div><h2>Time metrics</h2><p>Recorded activity for the selected day</p></div></div>
                    <dl className="attendance-time-metrics">
                        <div><dt><CheckCircle2 size={15}/>Sign-ins</dt><dd>{report?.timeMetrics.check_ins ?? (loading ? "…" : 0)}</dd></div>
                        <div><dt><XCircle size={15}/>Sign-outs</dt><dd>{report?.timeMetrics.check_outs ?? (loading ? "…" : 0)}</dd></div>
                        <div><dt><Clock3 size={15}/>First sign-in</dt><dd>{prettyTime(report?.timeMetrics.first_check_in ?? null)}</dd></div>
                        <div><dt><Clock3 size={15}/>Last sign-out</dt><dd>{prettyTime(report?.timeMetrics.last_check_out ?? null)}</dd></div>
                    </dl>
                </article>
            </section>

            <section aria-label="Latest attendance records" className="student-attendance-panel attendance-table-panel">
                <div className="student-attendance-panel-heading"><div><h2>Latest attendance records</h2><p>Most recent recorded student sign-ins and sign-outs for {prettyDate(date)}.</p></div>
                    <label className="student-attendance-search"><Search size={15}/><input aria-label="Search attendance records" onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" value={search}/></label>
                </div>
                <div className="student-attendance-table-wrap"><table className="student-attendance-table"><thead><tr><th>SN</th><th>Student</th><th>Admission No.</th><th>Class / stream</th><th>Time in</th><th>Time out</th></tr></thead><tbody>
                    {!loading && !error && latest.length === 0 && <tr><td className="student-attendance-empty" colSpan={6}>No attendance records were found for this day.</td></tr>}
                    {latest.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.full_name}</strong></td><td>{row.admission_number}</td><td>{row.class_name} · {row.stream}</td><td>{prettyTime(row.sign_in)}</td><td>{prettyTime(row.sign_out)}</td></tr>)}
                    {loading && <tr><td className="student-attendance-empty" colSpan={6}>Loading attendance…</td></tr>}
                </tbody></table></div>
            </section>
        </div>
    );
}

type RecordRow = {id: string; full_name: string; admission_number: string; class_name: string; stream: string; sign_in: string | null; sign_out: string | null};

export function StudentAttendanceRecordsPage() {
    const [date, setDate] = useState(localDate);
    const [appliedDate, setAppliedDate] = useState(localDate);
    const [records, setRecords] = useState<RecordRow[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/student-attendance/records?date=${encodeURIComponent(appliedDate)}`, {cache: "no-store", signal: controller.signal});
                const payload = await response.json() as {records?: RecordRow[]; error?: string};
                if (!response.ok || !payload.records) throw new Error(payload.error || "Attendance records could not be loaded.");
                setRecords(payload.records);
            } catch (loadError) {
                if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Attendance records could not be loaded.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [appliedDate, reloadKey]);
    const visible = records.filter((row) => `${row.full_name} ${row.admission_number} ${row.class_name} ${row.stream}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

    return <div className="page-content student-attendance-page">
        <PageHeading eyebrow="Students attendance" title="Attendance Records" description="Find daily student attendance logs with their sign-in and sign-out times."/>
        <section className="student-attendance-filter-panel">
            <label><span>Date</span><input onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label>
            <button className="student-attendance-primary-button" onClick={() => setAppliedDate(date)} type="button"><Filter size={15}/>Filter</button>
            <button className="student-attendance-secondary-button" onClick={() => setReloadKey((key) => key + 1)} type="button"><RefreshCw size={15}/>Refresh</button>
        </section>
        <section className="student-attendance-panel attendance-table-panel">
            <div className="student-attendance-panel-heading"><div><h2>Daily attendance records</h2><p>{prettyDate(appliedDate)} · {records.length} student record{records.length === 1 ? "" : "s"}</p></div>
                <label className="student-attendance-search"><Search size={15}/><input aria-label="Search attendance records" onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" value={search}/></label>
            </div>
            {error && <StateMessage error={error} loading={false} empty=""/>}
            <div className="student-attendance-table-wrap"><table className="student-attendance-table"><thead><tr><th>SN</th><th>Student</th><th>Class / stream</th><th>Sign in</th><th>Time in</th><th>Sign out</th><th>Time out</th></tr></thead><tbody>
                {!loading && !error && visible.length === 0 && <tr><td className="student-attendance-empty" colSpan={7}>No records found for this date and search.</td></tr>}
                {visible.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.full_name}</strong><small>{row.admission_number}</small></td><td>{row.class_name} · {row.stream}</td><td>{row.sign_in ? "Recorded" : "—"}</td><td>{prettyTime(row.sign_in)}</td><td>{row.sign_out ? "Recorded" : "—"}</td><td>{prettyTime(row.sign_out)}</td></tr>)}
                {loading && <tr><td className="student-attendance-empty" colSpan={7}>Loading attendance records…</td></tr>}
            </tbody></table></div>
        </section>
    </div>;
}

type SmsDashboardResponse = {
    date: string; settings: {enabled: boolean; currency: string};
    summary: {queued: number; sent: number; failed: number; pending: number; blocked: number; parts: number; cost: number; deliveryRate: number};
    messages: {id: string; created_at: string; full_name: string; admission_number: string; recipient_phone: string | null; message_body: string; status: string; provider_message_id: string | null; parts: number; cost: number}[];
};

export function StudentAttendanceSmsDashboardPage() {
    const [date, setDate] = useState(localDate);
    const [data, setData] = useState<SmsDashboardResponse | null>(null);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true); setError("");
            try {
                const response = await fetch(`/api/student-attendance/sms-dashboard?date=${encodeURIComponent(date)}`, {cache: "no-store", signal: controller.signal});
                const payload = await response.json() as SmsDashboardResponse | ApiError;
                if (!response.ok || !("summary" in payload)) throw new Error(("error" in payload && payload.error) || "SMS dashboard could not be loaded.");
                setData(payload);
            } catch (loadError) {
                if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "SMS dashboard could not be loaded.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [date, reloadKey]);
    const messages = (data?.messages ?? []).filter((row) => `${row.full_name} ${row.admission_number} ${row.recipient_phone ?? ""} ${row.message_body} ${row.status}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const s = data?.summary;

    return <div className="page-content student-attendance-page">
        <PageHeading eyebrow="Students attendance · Messaging" title="SMS Dashboard" description="Attendance notification delivery, message volume, and calculated SMS costs." action={<Link className="student-attendance-text-link" href="/student-attendance/sms-billing"><CreditCard size={15}/>View billing</Link>}/>
        <section className="student-attendance-filter-panel"><label><span>Date</span><input onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label>
            <button className="student-attendance-primary-button" onClick={() => setReloadKey((key) => key + 1)} type="button"><Filter size={15}/>Load</button>
            <button className="student-attendance-secondary-button" onClick={() => setDate(localDate())} type="button">Today</button>
        </section>
        {error && <StateMessage error={error} loading={false} empty=""/>}
        <section className="student-attendance-kpis sms-kpis">
            <article className="student-attendance-kpi kpi-orchid"><span><MessageSquareText size={19}/></span><small>Total queued</small><strong>{s?.queued ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-green"><span><CheckCircle2 size={19}/></span><small>Sent</small><strong>{s?.sent ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-rose"><span><XCircle size={19}/></span><small>Failed</small><strong>{s?.failed ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-amber"><span><Clock3 size={19}/></span><small>Pending</small><strong>{s?.pending ?? (loading ? "…" : 0)}</strong></article>
        </section>
        <section className="student-attendance-visual-grid sms-summary-grid">
            <article className="student-attendance-panel"><div className="student-attendance-panel-heading"><div><h2>Delivery rate</h2><p>Successfully submitted against completed attempts</p></div><strong className="sms-delivery-rate">{s?.deliveryRate ?? 0}%</strong></div><div className="sms-delivery-track"><i style={{width: `${s?.deliveryRate ?? 0}%`}}/></div><p className="sms-delivery-caption">{s?.sent ?? 0} sent · {s?.failed ?? 0} failed</p></article>
            <article className="student-attendance-panel sms-cost-panel"><div className="student-attendance-panel-heading"><div><h2>Cost summary</h2><p>Calculated using current SMS pricing</p></div></div><div className="sms-cost-summary"><span>SMS parts sent<strong>{s?.parts ?? 0}</strong></span><span>Total cost ({data?.settings.currency ?? "UGX"})<strong>{money(s?.cost ?? 0, data?.settings.currency)}</strong></span></div></article>
        </section>
        {!data?.settings.enabled && <p className="student-attendance-message is-warning">Attendance SMS notifications are currently disabled. <Link href="/student-attendance/sms-settings">Review SMS settings</Link>.</p>}
        <section className="student-attendance-panel attendance-table-panel">
            <div className="student-attendance-panel-heading"><div><h2>Message log</h2><p>Messages generated for {prettyDate(date)}.</p></div><label className="student-attendance-search"><Search size={15}/><input aria-label="Search messages" onChange={(event) => setSearch(event.target.value)} placeholder="Search messages…" value={search}/></label></div>
            <div className="student-attendance-table-wrap"><table className="student-attendance-table"><thead><tr><th>#</th><th>Student</th><th>Phone</th><th>Message</th><th>Parts</th><th>Cost</th><th>Status</th><th>Sent at</th></tr></thead><tbody>
                {!loading && !error && messages.length === 0 && <tr><td className="student-attendance-empty" colSpan={8}>No messages found for this date.</td></tr>}
                {messages.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.full_name}</strong><small>{row.admission_number}</small></td><td>{row.recipient_phone ?? "—"}</td><td className="sms-message-cell">{row.message_body}</td><td>{row.parts}</td><td>{money(row.cost, data?.settings.currency)}</td><td><span className={`sms-status-pill status-${row.status}`}>{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}
                {loading && <tr><td className="student-attendance-empty" colSpan={8}>Loading messages…</td></tr>}
            </tbody></table></div>
        </section>
    </div>;
}

type BillingResponse = {
    period: string; selectedDate: string; start: string; end: string; currency: string; deliveryRate: number;
    totals: {total: number; sent: number; failed: number; pending: number; parts: number; cost: number};
    breakdown: {date: string; total: number; sent: number; failed: number; pending: number; parts: number; cost: number}[];
};

export function StudentAttendanceSmsBillingPage() {
    const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
    const [date, setDate] = useState(localDate);
    const [data, setData] = useState<BillingResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true); setError("");
            try {
                const response = await fetch(`/api/student-attendance/sms-billing?period=${period}&date=${encodeURIComponent(date)}`, {cache: "no-store", signal: controller.signal});
                const payload = await response.json() as BillingResponse | ApiError;
                if (!response.ok || !("totals" in payload)) throw new Error(("error" in payload && payload.error) || "SMS billing could not be loaded.");
                setData(payload);
            } catch (loadError) {
                if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "SMS billing could not be loaded.");
            } finally { if (!controller.signal.aborted) setLoading(false); }
        }
        void load();
        return () => controller.abort();
    }, [period, date, reload]);
    const totals = data?.totals;
    return <div className="page-content student-attendance-page">
        <PageHeading eyebrow="Students attendance · Messaging" title="SMS Billing" description="Review weekly or monthly SMS usage and estimated charges in UGX." action={<Link className="student-attendance-text-link" href="/student-attendance/sms-dashboard"><MessageSquareText size={15}/>SMS dashboard</Link>}/>
        <section className="student-attendance-filter-panel billing-filter-panel">
            <label><span>Period</span><select onChange={(event) => setPeriod(event.target.value as "weekly" | "monthly")} value={period}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label><span>Pick a date in the {period === "weekly" ? "week" : "month"}</span><input onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label>
            <button className="student-attendance-primary-button" onClick={() => setReload((n) => n + 1)} type="button"><Filter size={15}/>Load</button>
        </section>
        {data && <div className="student-attendance-period-chip"><CalendarDays size={14}/>{prettyDate(data.start)} — {prettyDate(data.end)}</div>}
        {error && <StateMessage error={error} loading={false} empty=""/>}
        <section className="student-attendance-kpis billing-kpis">
            <article className="student-attendance-kpi kpi-orchid"><span><MessageSquareText size={19}/></span><small>Total queued</small><strong>{totals?.total ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-green"><span><CheckCircle2 size={19}/></span><small>Sent</small><strong>{totals?.sent ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-rose"><span><XCircle size={19}/></span><small>Failed</small><strong>{totals?.failed ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-blue"><span><Mail size={19}/></span><small>SMS parts</small><strong>{totals?.parts ?? (loading ? "…" : 0)}</strong></article>
            <article className="student-attendance-kpi kpi-amber"><span><CheckCircle2 size={19}/></span><small>Delivery rate</small><strong>{data?.deliveryRate ?? 0}%</strong></article>
            <article className="student-attendance-kpi kpi-green"><span><CreditCard size={19}/></span><small>Total cost</small><strong>{money(totals?.cost ?? 0, data?.currency)}</strong></article>
        </section>
        <section aria-label="SMS usage categories" className="sms-category-chips"><span>Attendance sign-in/out: calculated from queued notifications</span><span>Bulk messages: not included</span><span>System messages (OTP, admissions, outbound): not included</span></section>
        <section className="student-attendance-panel attendance-table-panel">
            <div className="student-attendance-panel-heading"><div><h2>Daily breakdown</h2><p>Provider-submitted, failed, and queued notifications by day.</p></div></div>
            <div className="student-attendance-table-wrap"><table className="student-attendance-table"><thead><tr><th>Date</th><th>Day</th><th>Total</th><th>Sent</th><th>Failed</th><th>Pending</th><th>SMS parts</th><th>Cost (UGX)</th></tr></thead><tbody>
                {!loading && !error && (data?.breakdown.length ?? 0) === 0 && <tr><td className="student-attendance-empty" colSpan={8}>No SMS data for this period.</td></tr>}
                {data?.breakdown.map((row) => <tr key={row.date}><td>{prettyDate(row.date)}</td><td>{new Date(`${row.date}T00:00:00.000Z`).toLocaleDateString("en-GB", {weekday: "long", timeZone: "UTC"})}</td><td>{row.total}</td><td>{row.sent}</td><td>{row.failed}</td><td>{row.pending}</td><td>{row.parts}</td><td>{money(row.cost, data.currency)}</td></tr>)}
                {loading && <tr><td className="student-attendance-empty" colSpan={8}>Loading billing data…</td></tr>}
            </tbody></table></div>
        </section>
    </div>;
}

type SmsSettings = {
    enabled: boolean; charactersPerPart: number; costPerPart: number; currency: "UGX";
    daySignInTemplate: string; daySignOutTemplate: string;
    boardingSignInTemplate: string; boardingSignOutTemplate: string;
    providerConfigured?: boolean;
    appOrigin?: string;
};

export function StudentAttendanceSmsSettingsPage() {
    const [settings, setSettings] = useState<SmsSettings | null>(null);
    const [origin, setOrigin] = useState("");
    const [saving, setSaving] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loadKey, setLoadKey] = useState(0);
    function retrySettings() {
        setLoading(true);
        setError("");
        setLoadKey((key) => key + 1);
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/student-attendance/sms-settings", {cache: "no-store", signal: controller.signal})
            .then(async (response) => {
                const result = await response.json() as SmsSettings & ApiError;
                if (!response.ok || !("enabled" in result)) {
                    const message = response.status === 401
                        ? "Your session has expired. Sign in again to access SMS settings."
                        : response.status === 403
                            ? "Your account does not have permission to access SMS settings."
                            : result.error || "SMS settings could not be loaded.";
                    throw new Error(message);
                }
                if (!controller.signal.aborted) {
                    setSettings(result);
                    setOrigin(result.appOrigin ?? "");
                }
            })
            .catch((loadError: unknown) => {
                if (!controller.signal.aborted) setError(loadError instanceof TypeError
                    ? "Could not reach the settings service. Check the app connection and retry."
                    : loadError instanceof Error ? loadError.message : "SMS settings could not be loaded.");
            })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [loadKey]);
    async function saveSettings(values: SmsSettings, section: string, successMessage: string) {
        setSaving(section); setError(""); setNotice("");
        try {
            const payload = {...values};
            delete payload.providerConfigured;
            delete payload.appOrigin;
            const response = await fetch("/api/student-attendance/sms-settings", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const result = await response.json() as {error?: string; settings?: Omit<SmsSettings, "providerConfigured">};
            if (!response.ok || !result.settings) throw new Error(result.error || "SMS settings could not be saved.");
            setSettings({...result.settings, providerConfigured: values.providerConfigured});
            setNotice(successMessage);
            return true;
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "SMS settings could not be saved.");
            return false;
        }
        finally { setSaving(""); }
    }
    const update = <K extends keyof SmsSettings>(key: K, value: SmsSettings[K]) => setSettings((current) => current ? {...current, [key]: value} : current);
    async function toggleNotifications(enabled: boolean) {
        if (!settings) return;
        const next = {...settings, enabled};
        setSettings(next);
        if (!await saveSettings(next, "notifications", `Attendance SMS notifications ${enabled ? "enabled" : "disabled"}.`)) {
            setSettings(settings);
        }
    }
    const templateFields = [
        ["daySignInTemplate", "Day Student — Sign In", "Student reports to school"] as const,
        ["daySignOutTemplate", "Day Student — Sign Out", "Student leaves school"] as const,
        ["boardingSignInTemplate", "Boarding Student — Sign In", "Boarding student signs in"] as const,
        ["boardingSignOutTemplate", "Boarding Student — Sign Out", "Boarding student signs out"] as const,
    ];
    const cronJobs = [
        {label: "Attendance device endpoint", path: "/api/device-events", note: "Attendance events are processed when a registered device sends them; this is not a scheduler URL."},
        {label: "Process SMS queue", path: "/api/internal/sms/dispatch", note: "POST with the x-sms-dispatch-token header. Store the token in your scheduler’s secret settings."},
        {label: "Process bulk SMS queue", path: null, note: "Bulk SMS queue processing is not configured in this app."},
    ];
    return <div className="page-content student-attendance-page">
        <PageHeading eyebrow="Students attendance · Configuration" title="SMS Settings" description="Configure SMS notifications for attendance and manage message templates."/>
        {loading && <StateMessage error="" loading empty=""/>}
        {error && <div className="settings-load-error"><StateMessage error={error} loading={false} empty=""/>{!settings && <button className="student-attendance-secondary-button" onClick={retrySettings} type="button"><RefreshCw size={14}/>Retry loading settings</button>}</div>}
        {notice && <p className="student-attendance-message is-success" role="status"><CheckCircle2 size={16}/>{notice}</p>}
        {settings && <div className="sms-settings-layout">
            <div className="sms-settings-sidebar">
                <section className="student-attendance-panel settings-card">
                    <div className="student-attendance-panel-heading"><div><h2>SMS Notifications</h2><p>Enable or disable SMS notifications when students sign in or out.</p></div></div>
                    <label className="settings-toggle-row sms-enabled-toggle"><span><strong>SMS Notifications</strong><small>{settings.enabled ? "Enabled" : "Disabled"}</small></span><input checked={settings.enabled} disabled={saving === "notifications"} onChange={(event) => void toggleNotifications(event.target.checked)} type="checkbox"/><i/></label>
                </section>
                <section className="student-attendance-panel settings-card">
                    <div className="student-attendance-panel-heading"><div><h2>SMS Pricing</h2><p>Pricing is used to estimate attendance SMS costs.</p></div><button className="student-attendance-primary-button settings-inline-save" disabled={Boolean(saving)} onClick={() => void saveSettings(settings, "pricing", "SMS pricing saved.")} type="button"><Save size={13}/>{saving === "pricing" ? "Saving…" : "Save"}</button></div>
                    <div className="sms-settings-fields">
                        <label className="student-attendance-field"><span>Characters per message body</span><input disabled={Boolean(saving)} max={1600} min={1} onChange={(event) => update("charactersPerPart", Number(event.target.value))} required type="number" value={settings.charactersPerPart}/><small>Number of characters that count as one SMS unit (standard SMS = 160).</small></label>
                        <label className="student-attendance-field"><span>Cost per SMS unit</span><span className="sms-cost-input"><b>UGX</b><input disabled={Boolean(saving)} max={1000000} min={0} onChange={(event) => update("costPerPart", Number(event.target.value))} required type="number" value={settings.costPerPart}/></span><small>Cost charged per single SMS body/part sent.</small></label>
                    </div>
                </section>
                <section className="student-attendance-panel settings-card">
                    <div className="student-attendance-panel-heading"><div><h2>Available Placeholders</h2></div></div>
                    <dl className="sms-placeholder-list"><div><dt><code>{"{student_name}"}</code></dt><dd>Student’s full name</dd></div><div><dt><code>{"{date}"}</code></dt><dd>Attendance date (dd/mm/yyyy)</dd></div><div><dt><code>{"{time}"}</code></dt><dd>Sign-in/out time (e.g. 7:30 AM)</dd></div></dl>
                </section>
                <section className="student-attendance-panel settings-card">
                    <div className="student-attendance-panel-heading"><div><h2>Cron Job URLs</h2><p>Configure these routes in your scheduler.</p></div></div>
                    <div className="sms-cron-list">{cronJobs.map((job) => <div className="sms-cron-item" key={job.label}><strong>{job.label}</strong>{job.path ? <code>{origin}{job.path}</code> : <span className="sms-cron-unavailable">Not configured</span>}<small>{job.note}</small></div>)}</div>
                    <div className={`provider-config-note${settings.providerConfigured ? " is-configured" : ""}`}><ShieldCheck size={16}/>{settings.providerConfigured ? "SMS provider is configured on the server." : "SMS provider URL and token must be configured on the server before delivery."}</div>
                </section>
            </div>
            <section className="student-attendance-panel sms-template-panel">
                <div className="student-attendance-panel-heading"><div><h2>SMS Templates</h2><p>Customize messages sent to guardians when attendance is recorded.</p></div><button className="student-attendance-primary-button" disabled={Boolean(saving)} onClick={() => void saveSettings(settings, "templates", "SMS templates saved.")} type="button"><Save size={13}/>{saving === "templates" ? "Saving…" : "Save Templates"}</button></div>
                <div className="sms-template-list">{templateFields.map(([key, label, description]) => {
                    const message = settings[key];
                    const parts = Math.max(1, Math.ceil([...message].length / settings.charactersPerPart));
                    return <label className="student-attendance-field sms-template-field" key={key}>
                        <span>{label}</span>
                        <textarea aria-label={`${label} message template`} disabled={Boolean(saving)} maxLength={1000} onChange={(event) => update(key, event.target.value)} required rows={2} value={message}/>
                        <small>Chars: {[...message].length} &nbsp; Parts: {parts} &nbsp; Est. cost: UGX {(parts * settings.costPerPart).toLocaleString("en-UG")}</small>
                        <span className="sms-template-description">{description}</span>
                    </label>;
                })}</div>
            </section>
        </div>}
    </div>;
}

type AttendanceSettings = {
    schoolDays: number[];
    lateThreshold: string;
    holidays: {id: string; name: string; startDate: string; endDate: string}[];
    currentTerm?: {name: string; startDate: string; endDate: string; holidays: number; expectedSchoolDays: number} | null;
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function easterSunday(year: number) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = (h + l - 7 * m + 114) % 31 + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function ugandaPublicHolidays(year: number) {
    const fixed = [
        ["New Year's Day", "01-01"],
        ["NRM Liberation Day", "01-26"],
        ["International Women's Day", "03-08"],
        ["Labour Day", "05-01"],
        ["Martyrs' Day", "06-03"],
        ["National Heroes Day", "06-09"],
        ["Independence Day", "10-09"],
        ["Christmas Day", "12-25"],
        ["Boxing Day", "12-26"],
    ].map(([name, date]) => ({name, startDate: `${year}-${date}`, endDate: `${year}-${date}`}));
    const easter = easterSunday(year);
    const movable = [-2, 1].map((offset, index) => {
        const date = new Date(easter);
        date.setUTCDate(date.getUTCDate() + offset);
        const value = date.toISOString().slice(0, 10);
        return {name: index === 0 ? "Good Friday" : "Easter Monday", startDate: value, endDate: value};
    });
    return [...fixed, ...movable].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function StudentAttendanceSettingsPage() {
    const [settings, setSettings] = useState<AttendanceSettings | null>(null);
    const [holidayName, setHolidayName] = useState("");
    const [holidayStart, setHolidayStart] = useState("");
    const [holidayEnd, setHolidayEnd] = useState("");
    const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loadKey, setLoadKey] = useState(0);
    function retrySettings() {
        setLoading(true);
        setError("");
        setLoadKey((key) => key + 1);
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/student-attendance/attendance-settings", {cache: "no-store", signal: controller.signal})
            .then(async (response) => {
                const result = await response.json() as AttendanceSettings & ApiError;
                if (!response.ok || !("schoolDays" in result)) {
                    const message = response.status === 401
                        ? "Your session has expired. Sign in again to access attendance settings."
                        : response.status === 403
                            ? "Your account does not have permission to access attendance settings."
                            : result.error || "Attendance settings could not be loaded.";
                    throw new Error(message);
                }
                if (!controller.signal.aborted) {
                    setSettings(result);
                    if (result.currentTerm) {
                        const years = [Number(result.currentTerm.startDate.slice(0, 4)), Number(result.currentTerm.endDate.slice(0, 4))];
                        setHolidayYear(years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years[years.length - 1]);
                    }
                }
            })
            .catch((loadError: unknown) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Attendance settings could not be loaded."); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [loadKey]);
    async function saveSettings(next: AttendanceSettings, section: string, successMessage: string) {
        setSaving(section); setError(""); setNotice("");
        try {
            const payload = {
                schoolDays: next.schoolDays,
                lateThreshold: next.lateThreshold,
                holidays: next.holidays,
            };
            const response = await fetch("/api/student-attendance/attendance-settings", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const result = await response.json() as {error?: string; settings?: AttendanceSettings};
            if (!response.ok || !result.settings) throw new Error(result.error || "Attendance settings could not be saved.");
            setSettings(result.settings); setNotice(successMessage);
            return true;
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Attendance settings could not be saved.");
            return false;
        }
        finally { setSaving(""); }
    }
    function toggleDay(day: number) {
        setSettings((current) => current ? {...current, schoolDays: current.schoolDays.includes(day) ? current.schoolDays.filter((item) => item !== day) : [...current.schoolDays, day].sort((a, b) => a - b)} : current);
    }
    function addClosure(name: string, startDate: string, endDate: string) {
        if (!settings || !startDate || !name.trim() || (endDate && endDate < startDate)) {
            setError("Enter a holiday name and valid start/end dates.");
            return;
        }
        const holiday = {id: crypto.randomUUID(), name: name.trim(), startDate, endDate: endDate || startDate};
        const next = {...settings, holidays: [...settings.holidays, holiday].sort((a, b) => a.startDate.localeCompare(b.startDate))};
        void saveSettings(next, "holidays", "Closure added.").then((saved) => {
            if (saved) {
                setHolidayName("");
                setHolidayStart("");
                setHolidayEnd("");
            }
        });
    }
    function loadPublicHolidays() {
        if (!settings) return;
        const existing = new Set(settings.holidays.map((holiday) => `${holiday.name}\u0000${holiday.startDate}`));
        const additions = ugandaPublicHolidays(holidayYear)
            .filter((holiday) => !existing.has(`${holiday.name}\u0000${holiday.startDate}`))
            .map((holiday) => ({...holiday, id: crypto.randomUUID()}));
        if (!additions.length) {
            setError("");
            setNotice(`Public holidays for ${holidayYear} are already listed.`);
            return;
        }
        const next = {...settings, holidays: [...settings.holidays, ...additions].sort((a, b) => a.startDate.localeCompare(b.startDate))};
        void saveSettings(next, "holidays", `Added ${additions.length} Uganda public holidays for ${holidayYear}.`);
    }
    const holidayRows = (settings?.holidays ?? []).filter((item) =>
        item.startDate <= `${holidayYear}-12-31` && item.endDate >= `${holidayYear}-01-01`,
    );
    const holidayYears = [...new Set([new Date().getFullYear(), new Date().getFullYear() + 1, ...(settings?.holidays ?? []).map((item) => Number(item.startDate.slice(0, 4)))])].sort((a, b) => b - a);
    return <div className="page-content student-attendance-page">
        <PageHeading eyebrow="Students attendance · Configuration" title="Attendance Settings" description="Set expected school days, the late threshold, and holidays or closure dates."/>
        {loading && <StateMessage error="" loading empty=""/>}
        {error && <div className="settings-load-error"><StateMessage error={error} loading={false} empty=""/>{!settings && <button className="student-attendance-secondary-button" onClick={retrySettings} type="button"><RefreshCw size={14}/>Retry loading settings</button>}</div>}
        {notice && <p className="student-attendance-message is-success" role="status"><CheckCircle2 size={16}/>{notice}</p>}
        {settings && <div className="attendance-settings-layout">
            <section className="student-attendance-panel settings-card school-days-card">
                <div className="student-attendance-panel-heading"><div><h2>School Days</h2><p>Select which days of the week students are expected to attend school.</p></div><CalendarDays size={19}/></div>
                <div className="school-day-options">{WEEKDAYS.map((day, index) => <label key={day}><input checked={settings.schoolDays.includes(index)} onChange={() => toggleDay(index)} type="checkbox"/><span className="attendance-checkmark"><Check size={13}/></span>{day}</label>)}</div>
                <button className="student-attendance-primary-button attendance-section-save" disabled={Boolean(saving)} onClick={() => void saveSettings(settings, "school-days", "School days saved.")} type="button"><Save size={14}/>{saving === "school-days" ? "Saving…" : "Save School Days"}</button>
            </section>
            <div className="attendance-settings-side">
                <section className="student-attendance-panel settings-card threshold-card">
                    <div className="student-attendance-panel-heading"><div><h2>Late Threshold</h2><p>Students who sign in after this time will be marked late.</p></div><Clock3 size={19}/></div>
                    <label className="student-attendance-field threshold-field"><span>Late Arrival Time</span><input onChange={(event) => setSettings({...settings, lateThreshold: event.target.value})} required type="time" value={settings.lateThreshold}/><small>Students arriving after this time are considered late. Default: 08:30 AM.</small></label>
                    <button className="student-attendance-primary-button attendance-section-save" disabled={Boolean(saving)} onClick={() => void saveSettings(settings, "late-threshold", "Late threshold saved.")} type="button"><Save size={14}/>{saving === "late-threshold" ? "Saving…" : "Save Threshold"}</button>
                </section>
                <section className="student-attendance-panel settings-card current-term-card">
                    <div className="student-attendance-panel-heading"><div><h2>Current Term Info</h2></div><CalendarDays size={19}/></div>
                    {settings.currentTerm ? <dl>
                        <div><dt>Current Term</dt><dd>{settings.currentTerm.name}</dd></div>
                        <div><dt>Start Date</dt><dd>{prettyDate(settings.currentTerm.startDate)}</dd></div>
                        <div><dt>End Date</dt><dd>{prettyDate(settings.currentTerm.endDate)}</dd></div>
                        <div><dt>Holidays / closed days in term</dt><dd>{settings.currentTerm.holidays}</dd></div>
                        <div><dt>Expected School Days</dt><dd><span className="expected-days-badge">{settings.currentTerm.expectedSchoolDays} Days</span></dd></div>
                    </dl> : <p>No current term is marked in School Settings.</p>}
                </section>
            </div>
            <section className="student-attendance-panel settings-card holidays-card">
                <div className="student-attendance-panel-heading"><div><h2>Public Holidays &amp; Closed Days</h2><p>Days inside a term when the school is closed or the device was off. They are left out of every attendance figure.</p></div>
                    <div className="holidays-actions"><select aria-label="Holiday year" onChange={(event) => setHolidayYear(Number(event.target.value))} value={holidayYear}>{holidayYears.map((year) => <option key={year} value={year}>{year}</option>)}</select><button className="student-attendance-secondary-button" disabled={Boolean(saving)} onClick={loadPublicHolidays} type="button"><CalendarDays size={13}/>Load Uganda public holidays</button></div>
                </div>
                <div className="holiday-add-row">
                    <label className="student-attendance-field"><span>Name</span><input maxLength={100} onChange={(event) => setHolidayName(event.target.value)} placeholder="e.g. Eid al-Adha, Mid-term break, Device down" value={holidayName}/></label>
                    <label className="student-attendance-field"><span>From</span><input onChange={(event) => setHolidayStart(event.target.value)} type="date" value={holidayStart}/></label>
                    <label className="student-attendance-field"><span>To (optional)</span><input min={holidayStart || undefined} onChange={(event) => setHolidayEnd(event.target.value)} type="date" value={holidayEnd}/></label>
                    <button className="student-attendance-primary-button holiday-add-button" disabled={Boolean(saving)} onClick={() => addClosure(holidayName, holidayStart, holidayEnd)} type="button"><Plus size={15}/>Add</button>
                </div>
                <p className="holiday-note">The public-holiday helper adds fixed-date Uganda holidays, Good Friday, and Easter Monday for the selected year. Add date-dependent holidays such as Eid manually.</p>
                <div className="student-attendance-table-wrap"><table className="student-attendance-table"><thead><tr><th>Name</th><th>Date(s)</th><th>Days</th><th/></tr></thead><tbody>
                    {holidayRows.length === 0 && <tr><td className="student-attendance-empty" colSpan={4}>No holidays or closed days listed for {holidayYear}.</td></tr>}
                    {holidayRows.map((holiday) => <tr key={holiday.id}><td>{holiday.name}</td><td>{prettyDate(holiday.startDate)}{holiday.endDate !== holiday.startDate ? ` — ${prettyDate(holiday.endDate)}` : ""}</td><td>{Math.round((Date.parse(`${holiday.endDate}T00:00:00Z`) - Date.parse(`${holiday.startDate}T00:00:00Z`)) / 86_400_000) + 1}</td><td><button aria-label={`Remove ${holiday.name}`} className="student-attendance-icon-button" disabled={Boolean(saving)} onClick={() => {
                        const next = {...settings, holidays: settings.holidays.filter((item) => item.id !== holiday.id)};
                        void saveSettings(next, "holidays", "Closure removed.");
                    }} type="button"><Trash2 size={15}/></button></td></tr>)}
                </tbody></table></div>
            </section>
        </div>}
    </div>;
}
