"use client";

import {useState, type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {GraduationCap, MailQuestion} from "lucide-react";

import {Button} from "@/components/ui/button";

type RecoveryStep = "request" | "verify" | "password";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [step, setStep] = useState<RecoveryStep>("request");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    async function requestCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({username}),
            });
            const payload = await response.json() as {error?: string; message?: string};
            if (!response.ok) throw new Error(payload.error || "Password recovery could not be started.");
            setNotice(payload.message ?? "If the account is eligible, a recovery code has been sent.");
            setStep("verify");
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Password recovery could not be started.");
        } finally {
            setBusy(false);
        }
    }

    async function verifyCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/verify-password-reset", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({username, code}),
            });
            const payload = await response.json() as {error?: string};
            if (!response.ok) throw new Error(payload.error || "The recovery code could not be verified.");
            setStep("password");
            setNotice("");
        } catch (verifyError) {
            setError(verifyError instanceof Error ? verifyError.message : "The recovery code could not be verified.");
        } finally {
            setBusy(false);
        }
    }

    async function updatePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (password !== confirmation) {
            setError("The passwords do not match.");
            return;
        }
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/set-password", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({password}),
            });
            const payload = await response.json() as {error?: string};
            if (!response.ok) throw new Error(payload.error || "Your password could not be reset.");
            router.replace("/login");
        } catch (resetError) {
            setError(resetError instanceof Error ? resetError.message : "Your password could not be reset.");
        } finally {
            setBusy(false);
        }
    }

    const submit = step === "request" ? requestCode : step === "verify" ? verifyCode : updatePassword;

    return (
        <main className="login-page">
            <div aria-hidden="true" className="login-decoration">
                <span className="login-ribbon login-ribbon-left"/>
                <span className="login-ribbon login-ribbon-right"/>
            </div>
            <div className="login-content">
                <div aria-label="Orchid School" className="school-brand">
                    <span aria-hidden="true" className="school-crest"><GraduationCap size={45} strokeWidth={1.6}/></span>
                    <span className="school-brand-name">ORCHID SCHOOL</span>
                </div>
                <section aria-labelledby="forgot-password-title" className="login-card forgot-password-card">
                    <span aria-hidden="true" className="school-crest"><MailQuestion size={32} strokeWidth={1.6}/></span>
                    <h1 id="forgot-password-title">
                        {step === "request" ? "Reset your password" : step === "verify" ? "Verify recovery code" : "Choose a new password"}
                    </h1>
                    <p className="login-description">
                        {step === "request"
                            ? "Enter your username and we’ll send a recovery code to your registered phone."
                            : step === "verify"
                                ? "Enter the six-digit code sent to your registered phone."
                                : "Choose a new password with at least 12 characters."}
                    </p>
                    <form className="login-form" onSubmit={submit}>
                        {step === "request" && (
                            <label className="login-field">
                                <span>Username <b>*</b></span>
                                <input autoComplete="username" maxLength={80} onChange={(event) => setUsername(event.target.value)} required value={username}/>
                            </label>
                        )}
                        {step === "verify" && (
                            <>
                                {notice && <p className="login-description" role="status">{notice}</p>}
                                <label className="login-field">
                                    <span>Six-digit code <b>*</b></span>
                                    <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={code}/>
                                </label>
                                <button className="login-text-button" disabled={busy} onClick={() => {
                                    setStep("request");
                                    setCode("");
                                    setError("");
                                }} type="button">
                                    Request another code
                                </button>
                            </>
                        )}
                        {step === "password" && (
                            <>
                                <label className="login-field">
                                    <span>New password <b>*</b></span>
                                    <input autoComplete="new-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password}/>
                                </label>
                                <label className="login-field">
                                    <span>Confirm new password <b>*</b></span>
                                    <input autoComplete="new-password" minLength={12} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation}/>
                                </label>
                            </>
                        )}
                        {error && <p className="login-error" role="alert">{error}</p>}
                        <Button className="login-button" disabled={busy} type="submit">
                            {busy ? "Please wait..." : step === "request" ? "Send recovery code" : step === "verify" ? "Verify code" : "Update password"}
                        </Button>
                    </form>
                    <Link className="login-text-button forgot-password-back" href="/login">Back to Sign In</Link>
                </section>
                <footer className="login-footer">Copyright © 2026 Orchid School. All Rights Reserved.</footer>
            </div>
        </main>
    );
}
