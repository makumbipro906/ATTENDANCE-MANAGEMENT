import Link from "next/link";
import {type ReactNode} from "react";
import {Badge} from "../ui/badge";
import {Button} from "../ui/button";
import {Table} from "../ui/table";
import {connection} from "next/server";
import {query} from "@/lib/server/database";

function PageHeading({eyebrow, title, description}: { eyebrow: string; title: string; description: string }) {
    return (
        <header className="page-heading">
            <div>
                <div className="eyebrow">{eyebrow}</div>
                <h1 className="page-title">{title}</h1>
                <p className="page-description">{description}</p>
            </div>
        </header>
    );
}

function Status({value}: { value: string }) {
    const style = value.toLowerCase().replaceAll(" ", "-");
    return <Badge className={`status-pill operations-status ${style}`} variant="outline">{value}</Badge>;
}

function RecordsTable({title, headings, children}: { title: string; headings: string[]; children: ReactNode }) {
    return (
        <section aria-label={title} className="card operations-table-card">
            <div className="table-wrap">
                <Table className="data-table operations-table">
                    <thead>
                    <tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr>
                    </thead>
                    <tbody>{children}</tbody>
                </Table>
            </div>
        </section>
    );
}

export function AttendanceAlertsPage() {
    return (
        <div className="page-content operations-page">
            <PageHeading eyebrow="Attendance operations" title="Attendance alerts"
                         description="Review late arrivals and students who have not reported by the configured check-in deadline."/>
            <div className="operations-inline-note">
                No scan does not confirm absence. A live alert requires the school calendar, enrolled attendance rules,
                and a configured reporting cutoff time.
            </div>
            <RecordsTable headings={["Student", "Class / stream", "Expected by", "Alert", "Parent message"]}
                          title="Attendance alerts">
                <tr>
                    <td className="empty-table-state" colSpan={5}>
                        No attendance alerts are available. Configure school calendar days and check-in cutoff times to enable alert calculations.
                    </td>
                </tr>
            </RecordsTable>
        </div>
    );
}

export async function AuditLogPage() {
    await connection();
    const {rows} = await query<{
        id: string;
        created_at: string;
        actor_type: string;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string;
    }>(
        `SELECT id, created_at, actor_type, actor_id, action, entity_type, entity_id
         FROM audit_log ORDER BY created_at DESC LIMIT 500`,
    );
    return (
        <div className="page-content operations-page">
            <PageHeading eyebrow="Administration" title="Audit log"
                         description="A traceable history of changes to attendance, student records, contacts, and settings."/>
            <RecordsTable headings={["Time", "Actor", "Action", "Record", "Result"]}
                          title="Recent administrative activity">
                {rows.length === 0 && <tr><td className="empty-table-state" colSpan={5}>No audit events have been recorded yet.</td></tr>}
                {rows.map((row) => (
                    <tr key={row.id}>
                        <td>{new Date(row.created_at).toLocaleString()}</td>
                        <td>{row.actor_type}{row.actor_id ? ` · ${row.actor_id}` : ""}</td>
                        <td>{row.action}</td>
                        <td>{row.entity_type} · {row.entity_id}</td>
                        <td><Status value="Recorded"/></td>
                    </tr>
                ))}
            </RecordsTable>
        </div>
    );
}

export function WorkflowRecordPage({type}: { type: "biometrics" | "contacts" }) {
    const isBiometrics = type === "biometrics";
    return (
        <div className="page-content operations-page">
            <PageHeading
                eyebrow={isBiometrics ? "Biometrics tracking" : "Contacts tracking"}
                title={isBiometrics ? "Record biometrics" : "Record contacts"}
                description={isBiometrics
                    ? "Review enrollment status and follow the verified device workflow for fingerprint and face records."
                    : "Capture guardian contact details required for arrival notifications."}
            />
            <section className="card operations-guidance">
                <h2>{isBiometrics ? "Biometric enrollment workflow" : "Guardian contact workflow"}</h2>
                {isBiometrics ? (
                    <>
                        <p>Biometric templates must be enrolled and managed on the supported Hikvision device. Do not
                            store fingerprint images or templates in this web application.</p>
                        <ol>
                            <li>Select and verify the student using their admission number.</li>
                            <li>Enroll on the registered device using its approved secure workflow.</li>
                            <li>Confirm the device user ID maps uniquely to the student record.</li>
                            <li>Verify a test event before marking enrollment complete.</li>
                        </ol>
                    </>
                ) : (
                    <>
                        <p>Keep guardian records with the student directory. A valid guardian phone is needed before
                            arrival messages can be queued.</p>
                        <ol>
                            <li>Open the student directory and edit the student record.</li>
                            <li>Record the guardian name, relationship, and country-code phone number.</li>
                            <li>Check that the number is consented for school SMS notifications.</li>
                            <li>Review blocked or failed delivery statuses on the SMS notifications page.</li>
                        </ol>
                        <Button asChild className="button-secondary" variant="outline">
                            <Link href="/students">Open student directory</Link>
                        </Button>
                    </>
                )}
            </section>
        </div>
    );
}
