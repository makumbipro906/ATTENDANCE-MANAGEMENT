"use client";

import {Suspense, useEffect, useState, type FormEvent} from "react";
import Link from "next/link";
import {useRouter, useSearchParams} from "next/navigation";
import {ArrowLeft, Eye, EyeOff, GraduationCap, LoaderCircle, LockKeyhole, UserRound} from "lucide-react";

import {Button} from "@/components/ui/button";

type AuthStep = "credentials" | "otp" | "password-setup";
type OtpResponse = {
    otpRequired: true;
    challengeId: string;
    maskedPhone: string;
    expiresInSeconds: number;
    developmentOtp?: string;
    error?: string;
};

function safeNextPath(value: string | null) {
    return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function LoginPage() {
    return <Suspense fallback={null}><LoginForm/></Suspense>;
}

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [permanentPassword, setPermanentPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState<AuthStep>("credentials");
    const [challenge, setChallenge] = useState<OtpResponse | null>(null);
    const [otpCode, setOtpCode] = useState("");
    const [resendAt, setResendAt] = useState(0);
    const [secondsToResend, setSecondsToResend] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [githubEnabled, setGithubEnabled] = useState(false);
    const [githubStatusError, setGithubStatusError] = useState("");
    const githubErrors: Record<string, string> = {
        unavailable: "GitHub sign-in is not configured. Use your username and password instead.",
        invalid_state: "The GitHub sign-in request expired or was invalid. Please try again.",
        cancelled: "GitHub sign-in was cancelled.",
        not_linked: "This GitHub account is not linked to an active Super-Administrator account.",
        failed: "GitHub sign-in could not be completed. Please try again.",
    };
    const displayedError = error || githubErrors[searchParams.get("github_error") ?? ""] || "";
    const githubLoginHref = `/api/auth/github/login?next=${encodeURIComponent(safeNextPath(searchParams.get("next")))}`;

    useEffect(() => {
        if (!resendAt) return;
        const updateCountdown = () => setSecondsToResend(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
        updateCountdown();
        const timer = window.setInterval(updateCountdown, 1000);
        return () => window.clearInterval(timer);
    }, [resendAt]);

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/auth/github/status", {cache: "no-store", signal: controller.signal})
            .then(async (response) => {
                const payload = await response.json() as {enabled?: boolean; error?: string};
                if (!response.ok) throw new Error(payload.error || "GitHub sign-in status could not be loaded.");
                if (!controller.signal.aborted) setGithubEnabled(Boolean(payload.enabled));
            })
            .catch((statusError: unknown) => {
                if (!controller.signal.aborted) {
                    setGithubStatusError(statusError instanceof Error
                        ? statusError.message
                        : "GitHub sign-in status could not be loaded.");
                }
            });
        return () => controller.abort();
    }, []);

    function acceptOtpChallenge(payload: OtpResponse) {
        setChallenge(payload);
        setOtpCode("");
        setStep("otp");
        setResendAt(Date.now() + 60_000);
        setError("");
    }

    async function submitCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({username, password}),
            });
            const payload = await response.json() as OtpResponse & {
                ok?: boolean;
                passwordSetupRequired?: boolean;
            };
            if (!response.ok) throw new Error(payload.error || "Sign-in could not be completed.");
            if (payload.passwordSetupRequired) {
                setPassword("");
                setStep("password-setup");
                return;
            }
            if (payload.ok) {
                router.replace(safeNextPath(searchParams.get("next")));
                router.refresh();
                return;
            }
            if (!payload.otpRequired || !payload.challengeId || !payload.maskedPhone) {
                throw new Error("The server did not start the one-time-code challenge.");
            }
            acceptOtpChallenge(payload);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Sign-in could not be completed.");
        } finally {
            setBusy(false);
        }
    }

    async function submitPermanentPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (permanentPassword !== passwordConfirmation) {
            setError("The passwords do not match.");
            return;
        }
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/set-password", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({password: permanentPassword}),
            });
            const payload = await response.json() as {error?: string};
            if (!response.ok) throw new Error(payload.error || "Your password could not be saved.");
            setStep("credentials");
            setPassword("");
            setPermanentPassword("");
            setPasswordConfirmation("");
            setNotice("Your account is activated. Sign in with your new password.");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Your password could not be saved.");
        } finally {
            setBusy(false);
        }
    }

    async function submitOtp(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!challenge) return;
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/verify-otp", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({challengeId: challenge.challengeId, code: otpCode}),
            });
            const payload = await response.json() as {error?: string};
            if (!response.ok) throw new Error(payload.error || "The one-time code could not be verified.");
            router.replace(safeNextPath(searchParams.get("next")));
            router.refresh();
        } catch (verifyError) {
            setError(verifyError instanceof Error ? verifyError.message : "The one-time code could not be verified.");
        } finally {
            setBusy(false);
        }
    }

    async function resendOtp() {
        if (!challenge || secondsToResend > 0 || busy) return;
        setError("");
        setBusy(true);
        try {
            const response = await fetch("/api/auth/resend-otp", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({username, challengeId: challenge.challengeId}),
            });
            const payload = await response.json() as {error?: string; maskedPhone?: string; developmentOtp?: string};
            if (!response.ok) throw new Error(payload.error || "A new sign-in code could not be sent.");
            setChallenge({
                ...challenge,
                maskedPhone: payload.maskedPhone ?? challenge.maskedPhone,
                developmentOtp: payload.developmentOtp,
            });
            setOtpCode("");
            setResendAt(Date.now() + 60_000);
        } catch (resendError) {
            setError(resendError instanceof Error ? resendError.message : "A new sign-in code could not be sent.");
        } finally {
            setBusy(false);
        }
    }

    function backToCredentials() {
        setStep("credentials");
        setChallenge(null);
        setOtpCode("");
        setError("");
    }

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
                <section aria-labelledby="auth-title" className="login-card">
                    <h1 id="auth-title">{step === "otp" ? "Verify your sign-in" : step === "password-setup" ? "Set your password" : "Sign In"}</h1>
                    <p className="login-description">
                        {step === "otp"
                            ? challenge?.developmentOtp
                                ? "Enter the local development one-time code shown below."
                                : `Enter the six-digit code sent to ${challenge?.maskedPhone ?? "your registered phone"}.`
                            : step === "password-setup"
                                ? "Create a permanent password to activate your account."
                                : "Access the ORCHID SCHOOL panel using your username and password. New users enter their SMS activation code in the password field."}
                    </p>
                    {step === "otp" ? (
                        <form className="login-form" onSubmit={submitOtp}>
                            {challenge?.developmentOtp && (
                                <p className="login-dev-otp" role="status">
                                    Development OTP (local only): <strong>{challenge.developmentOtp}</strong>
                                </p>
                            )}
                            <label className="login-field">
                                <span>One-time code <b>*</b></span>
                                <span className="login-input-wrap">
                                    <input
                                        autoComplete="one-time-code"
                                        autoFocus
                                        className="login-otp-input"
                                        inputMode="numeric"
                                        maxLength={6}
                                        onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                        pattern="[0-9]{6}"
                                        placeholder="Enter 6-digit code"
                                        required
                                        value={otpCode}
                                    />
                                    <LockKeyhole aria-hidden="true" className="login-input-icon" size={17}/>
                                </span>
                            </label>
                            {displayedError && <p className="login-error" role="alert">{displayedError}</p>}
                            <Button className="login-button" disabled={busy || otpCode.length !== 6} type="submit">
                                {busy
                                    ? <><LoaderCircle aria-hidden="true" className="login-spinner" size={17}/>Verifying...</>
                                    : "Verify & Sign In"}
                            </Button>
                            <div className="login-otp-actions">
                                <button className="login-text-button" disabled={busy} onClick={backToCredentials} type="button">
                                    <ArrowLeft aria-hidden="true" size={14}/>Back
                                </button>
                                <button className="login-text-button" disabled={busy || secondsToResend > 0} onClick={() => void resendOtp()} type="button">
                                    {secondsToResend > 0 ? `Resend code in ${secondsToResend}s` : "Resend code"}
                                </button>
                            </div>
                        </form>
                    ) : step === "password-setup" ? (
                        <form className="login-form" onSubmit={submitPermanentPassword}>
                            <label className="login-field">
                                <span>New password <b>*</b></span>
                                <input autoComplete="new-password" minLength={12} onChange={(event) => setPermanentPassword(event.target.value)} required type="password" value={permanentPassword}/>
                            </label>
                            <label className="login-field">
                                <span>Confirm new password <b>*</b></span>
                                <input autoComplete="new-password" minLength={12} onChange={(event) => setPasswordConfirmation(event.target.value)} required type="password" value={passwordConfirmation}/>
                            </label>
                            {displayedError && <p className="login-error" role="alert">{displayedError}</p>}
                            <Button className="login-button" disabled={busy} type="submit">
                                {busy ? "Saving password..." : "Activate account"}
                            </Button>
                        </form>
                    ) : (
                        <form className="login-form" onSubmit={submitCredentials}>
                            {notice && <p className="student-notice" role="status">{notice}</p>}
                            <label className="login-field">
                                <span>Username <b>*</b></span>
                                <span className="login-input-wrap">
                                    <input autoComplete="username" maxLength={80} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" required value={username}/>
                                    <UserRound aria-hidden="true" className="login-input-icon" size={17}/>
                                </span>
                            </label>
                            <label className="login-field">
                                <span>Password <b>*</b></span>
                                <span className="login-input-wrap">
                                    <input
                                        autoComplete="current-password"
                                        onChange={(event) => setPassword(event.target.value)}
                                        placeholder="Password or activation code"
                                        required
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                    />
                                    <button
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        className="login-password-toggle"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        type="button"
                                    >
                                        {showPassword ? <Eye size={17}/> : <EyeOff size={17}/>}
                                    </button>
                                </span>
                            </label>
                            <div className="forgot-password"><Link href="/forgot-password">Forgot password?</Link></div>
                            {displayedError && <p className="login-error" role="alert">{displayedError}</p>}
                            <Button className="login-button" disabled={busy} type="submit">
                                {busy
                                    ? <><LoaderCircle aria-hidden="true" className="login-spinner" size={17}/>Signing in...</>
                                    : "Sign In"}
                            </Button>
                        </form>
                    )}
                    {githubStatusError && step === "credentials" &&
                        <p className="login-error" role="status">{githubStatusError}</p>}
                    {githubEnabled && step === "credentials" && (
                        <Button asChild className="login-button" variant="outline">
                            <a href={githubLoginHref}>Continue with GitHub</a>
                        </Button>
                    )}
                </section>
                <footer className="login-footer">Copyright © 2026 Orchid School. All Rights Reserved.</footer>
            </div>
        </main>
    );
}
