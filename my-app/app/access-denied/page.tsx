import Link from "next/link";
import {LockKeyhole} from "lucide-react";

export default function AccessDeniedPage() {
    return (
        <main className="auth-page">
            <section className="auth-card access-denied-card">
                <div aria-hidden="true" className="auth-brand-mark"><LockKeyhole size={25}/></div>
                <p className="auth-eyebrow">Access restricted</p>
                <h1>Module locked</h1>
                <p className="auth-description">Your assigned role does not include access to this module. Ask a system administrator to update your role permissions.</p>
                <Link className="auth-back-link" href="/">Return to dashboard</Link>
            </section>
        </main>
    );
}
