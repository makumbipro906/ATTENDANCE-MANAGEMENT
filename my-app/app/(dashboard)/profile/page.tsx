"use client";

import Link from "next/link";
import {Suspense, useEffect, useState, type FormEvent} from "react";
import {useSearchParams} from "next/navigation";
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    LockKeyhole,
    Mail,
    Phone,
    ShieldCheck,
    UserRound,
} from "lucide-react";

import {Button} from "@/components/ui/button";

type StaffProfile = {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    active: boolean;
    createdAt: string;
    roleNames: string[];
    passwordConfigured: boolean;
};

type GithubStatus = {enabled: boolean; eligible?: boolean; connected?: boolean};
type PasswordVisibility = {current: boolean; next: boolean; confirm: boolean};

export default function ProfilePage() {
    return <Suspense fallback={<div className="page-content my-profile-page"><div aria-live="polite" className="profile-loading" role="status">Loading your account…</div></div>}>
        <ProfileContent/>
    </Suspense>;
}

function ProfileContent() {
    const searchParams = useSearchParams();
    const [profile, setProfile] = useState<StaffProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [visibility, setVisibility] = useState<PasswordVisibility>({current: false, next: false, confirm: false});
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
    const [githubStatusError, setGithubStatusError] = useState("");
    const [linkingGithub, setLinkingGithub] = useState(false);
    const githubErrors: Record<string, string> = {
        unavailable: "GitHub account linking is not configured.",
        invalid_state: "The GitHub linking request expired or was invalid. Please try again.",
        cancelled: "GitHub account linking was cancelled.",
        already_linked: "That GitHub account is already linked to another staff member.",
        failed: "GitHub account linking could not be completed. Please try again.",
    };
    const displayedError = error || githubErrors[searchParams.get("github_error") ?? ""] || "";
    const displayedSuccess = success || (searchParams.get("github") === "connected"
        ? "Your GitHub account is linked. You can now use it to sign in."
        : "");

    useEffect(() => {
        const controller = new AbortController();
        async function loadProfile() {
            try {
                const response = await fetch("/api/auth/profile", {cache: "no-store", signal: controller.signal});
                const result = await response.json() as StaffProfile | {error?: string};
                if (!response.ok || !("username" in result)) {
                    throw new Error("error" in result ? result.error : "Your profile could not be loaded.");
                }
                if (controller.signal.aborted) return;
                setProfile(result);
                setFirstName(result.firstName);
                setLastName(result.lastName);
                setEmail(result.email);
                setPhone(result.phone);
            } catch (loadError) {
                if (!controller.signal.aborted) {
                    setError(loadError instanceof Error ? loadError.message : "Your profile could not be loaded.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void loadProfile();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/auth/github/status", {cache: "no-store", signal: controller.signal})
            .then(async (response) => {
                const result = await response.json() as GithubStatus & {error?: string};
                if (!response.ok) throw new Error(result.error || "GitHub sign-in status could not be loaded.");
                if (!controller.signal.aborted) setGithubStatus(result);
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

    async function linkGithubAccount() {
        setError("");
        setSuccess("");
        setLinkingGithub(true);
        try {
            const response = await fetch("/api/auth/github/link", {method: "POST"});
            const result = await response.json() as {authorizationUrl?: string; error?: string};
            if (!response.ok || !result.authorizationUrl) {
                throw new Error(result.error || "GitHub account linking could not be started.");
            }
            window.location.assign(result.authorizationUrl);
        } catch (linkError) {
            setError(linkError instanceof Error ? linkError.message : "GitHub account linking could not be started.");
            setLinkingGithub(false);
        }
    }

    async function saveProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");
        if (newPassword && newPassword !== confirmPassword) {
            setError("The new password and confirmation do not match.");
            return;
        }
        if (newPassword && newPassword.length < 12) {
            setError("Choose a new password with at least 12 characters.");
            return;
        }
        setSaving(true);
        try {
            const response = await fetch("/api/auth/profile", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    phone,
                    ...(newPassword ? {currentPassword, newPassword, confirmPassword} : {}),
                }),
            });
            const result = await response.json() as {error?: string; passwordChanged?: boolean};
            if (!response.ok) throw new Error(result.error || "Your profile could not be saved.");

            setProfile((current) => current ? {
                ...current,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                passwordConfigured: true,
            } : current);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setSuccess(result.passwordChanged
                ? "Profile and password updated. Other active sessions were signed out."
                : "Your profile was saved.");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Your profile could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    function togglePassword(field: keyof PasswordVisibility) {
        setVisibility((current) => ({...current, [field]: !current[field]}));
    }

    const fullName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
    const initials = `${profile?.firstName?.[0] ?? ""}${profile?.lastName?.[0] ?? ""}`.toUpperCase() || "U";
    const createdDate = profile?.createdAt
        ? new Date(profile.createdAt).toLocaleDateString(undefined, {year: "numeric", month: "long", day: "numeric"})
        : "Not available";

    return (
        <div className="page-content my-profile-page">
            <header className="my-profile-heading">
                <div>
                    <span className="my-profile-eyebrow">ACCOUNT</span>
                    <h1>My Profile</h1>
                    <p>Manage your personal details and sign-in security.</p>
                </div>
                <Button asChild className="profile-back-button" variant="outline">
                    <Link href="/"><ArrowLeft aria-hidden="true" size={16}/>Back to dashboard</Link>
                </Button>
            </header>

            {displayedError && <p className="profile-notice profile-notice-error" role="alert">{displayedError}</p>}
            {displayedSuccess && <p className="profile-notice profile-notice-success" role="status"><CheckCircle2 aria-hidden="true" size={17}/>{displayedSuccess}</p>}

            {loading ? (
                <div aria-live="polite" className="profile-loading" role="status">Loading your account…</div>
            ) : profile ? (
                <div className="my-profile-layout">
                    <main className="my-profile-main">
                        {profile.roleNames.some((name) => name.toLocaleLowerCase() === "super-administrator") && (
                            <section aria-labelledby="github-signin-heading" className="my-profile-card">
                                <div className="profile-card-heading">
                                    <span className="profile-card-icon"><ShieldCheck aria-hidden="true" size={19}/></span>
                                    <div>
                                        <h2 id="github-signin-heading">GitHub sign-in</h2>
                                        <p>Link your GitHub account as an optional sign-in method.</p>
                                    </div>
                                </div>
                                {githubStatusError ? (
                                    <p className="profile-notice profile-notice-error" role="alert">{githubStatusError}</p>
                                ) : githubStatus?.enabled ? (
                                    <>
                                        <p>{githubStatus.connected
                                            ? "A GitHub account is linked to this Super-Administrator."
                                            : "No GitHub account is linked. Password and SMS sign-in remain available."}</p>
                                        <div className="profile-form-actions">
                                            <Button disabled={linkingGithub} onClick={linkGithubAccount} type="button">
                                                {linkingGithub
                                                    ? "Connecting to GitHub…"
                                                    : githubStatus.connected ? "Change linked account" : "Link GitHub account"}
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <p>GitHub sign-in is not configured. Existing sign-in methods are unchanged.</p>
                                )}
                            </section>
                        )}
                        <section aria-labelledby="personal-information-heading" className="my-profile-card">
                            <div className="profile-card-heading">
                                <span className="profile-card-icon"><UserRound aria-hidden="true" size={19}/></span>
                                <div>
                                    <h2 id="personal-information-heading">Personal information</h2>
                                    <p>Update the details associated with your account.</p>
                                </div>
                            </div>
                            <form className="profile-edit-form" onSubmit={saveProfile}>
                                <div className="profile-fields-grid">
                                    <label className="profile-field">
                                        <span>First name</span>
                                        <input autoComplete="given-name" maxLength={100} onChange={(event) => setFirstName(event.target.value)} required value={firstName}/>
                                    </label>
                                    <label className="profile-field">
                                        <span>Last name</span>
                                        <input autoComplete="family-name" maxLength={100} onChange={(event) => setLastName(event.target.value)} required value={lastName}/>
                                    </label>
                                    <label className="profile-field profile-field-with-icon">
                                        <span>Email address</span>
                                        <span className="profile-input-shell">
                                            <Mail aria-hidden="true" size={16}/>
                                            <input autoComplete="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} type="email" value={email}/>
                                        </span>
                                    </label>
                                    <label className="profile-field profile-field-with-icon">
                                        <span>Phone number</span>
                                        <span className="profile-input-shell">
                                            <Phone aria-hidden="true" size={16}/>
                                            <input autoComplete="tel" maxLength={32} onChange={(event) => setPhone(event.target.value)} type="tel" value={phone}/>
                                        </span>
                                    </label>
                                    <label className="profile-field profile-field-locked">
                                        <span>Username</span>
                                        <span className="profile-input-shell">
                                            <LockKeyhole aria-hidden="true" size={15}/>
                                            <input aria-describedby="profile-username-help" disabled value={profile.username}/>
                                        </span>
                                        <small id="profile-username-help">Username is managed by an administrator.</small>
                                    </label>
                                </div>

                                <div className="profile-security-divider"/>

                                <div className="profile-card-heading profile-security-heading">
                                    <span className="profile-card-icon"><KeyRound aria-hidden="true" size={19}/></span>
                                    <div>
                                        <h2>Password & security</h2>
                                        <p>Change your password using your current password.</p>
                                    </div>
                                </div>
                                <div className="profile-fields-grid profile-password-grid">
                                    <label className="profile-field">
                                        <span>Current password</span>
                                        <span className="profile-input-shell profile-password-input">
                                            <input
                                                autoComplete="current-password"
                                                onChange={(event) => setCurrentPassword(event.target.value)}
                                                placeholder="Required to change password"
                                                type={visibility.current ? "text" : "password"}
                                                value={currentPassword}
                                            />
                                            <button aria-label={visibility.current ? "Hide current password" : "Show current password"} onClick={() => togglePassword("current")} type="button">
                                                {visibility.current ? <EyeOff size={16}/> : <Eye size={16}/>}
                                            </button>
                                        </span>
                                    </label>
                                    <span aria-hidden="true"/>
                                    <label className="profile-field">
                                        <span>New password</span>
                                        <span className="profile-input-shell profile-password-input">
                                            <input
                                                autoComplete="new-password"
                                                minLength={12}
                                                onChange={(event) => setNewPassword(event.target.value)}
                                                placeholder="At least 12 characters"
                                                type={visibility.next ? "text" : "password"}
                                                value={newPassword}
                                            />
                                            <button aria-label={visibility.next ? "Hide new password" : "Show new password"} onClick={() => togglePassword("next")} type="button">
                                                {visibility.next ? <EyeOff size={16}/> : <Eye size={16}/>}
                                            </button>
                                        </span>
                                    </label>
                                    <label className="profile-field">
                                        <span>Confirm new password</span>
                                        <span className="profile-input-shell profile-password-input">
                                            <input
                                                autoComplete="new-password"
                                                onChange={(event) => setConfirmPassword(event.target.value)}
                                                placeholder="Re-enter new password"
                                                type={visibility.confirm ? "text" : "password"}
                                                value={confirmPassword}
                                            />
                                            <button aria-label={visibility.confirm ? "Hide confirmation" : "Show confirmation"} onClick={() => togglePassword("confirm")} type="button">
                                                {visibility.confirm ? <EyeOff size={16}/> : <Eye size={16}/>}
                                            </button>
                                        </span>
                                    </label>
                                    <p className="profile-password-hint">Leave all password fields blank to keep your current password. Passwords must be at least 12 characters.</p>
                                </div>

                                <div className="profile-form-actions">
                                    <Button disabled={saving} type="submit">
                                        {saving ? "Saving changes…" : "Save changes"}
                                    </Button>
                                </div>
                            </form>
                        </section>
                    </main>

                    <aside aria-labelledby="profile-summary-heading" className="my-profile-card profile-summary-card">
                        <div className="profile-summary-banner"/>
                        <div className="profile-summary-content">
                            <div aria-hidden="true" className="profile-summary-avatar">{initials}</div>
                            <span className="profile-summary-label">SIGNED-IN ACCOUNT</span>
                            <strong className="profile-summary-name">{fullName || profile.username}</strong>
                            <span className="profile-summary-username">@{profile.username}</span>
                            <span className={`profile-status-pill${profile.active ? " is-active" : ""}`}>
                                <span aria-hidden="true"/> {profile.active ? "Active account" : "Inactive"}
                            </span>
                            <div className="profile-summary-divider"/>
                            <h2 className="profile-summary-section-title" id="profile-summary-heading">Account details</h2>
                            <dl className="profile-summary-details">
                                <div>
                                    <dt><ShieldCheck aria-hidden="true" size={15}/>Role</dt>
                                    <dd>{profile.roleNames.join(", ") || "No role assigned"}</dd>
                                </div>
                                <div>
                                    <dt><Mail aria-hidden="true" size={15}/>Email</dt>
                                    <dd>{profile.email || "Not provided"}</dd>
                                </div>
                                <div>
                                    <dt><Phone aria-hidden="true" size={15}/>Phone</dt>
                                    <dd>{profile.phone || "Not provided"}</dd>
                                </div>
                                <div>
                                    <dt><CalendarDays aria-hidden="true" size={15}/>Member since</dt>
                                    <dd>{createdDate}</dd>
                                </div>
                                <div>
                                    <dt><KeyRound aria-hidden="true" size={15}/>Password</dt>
                                    <dd>{profile.passwordConfigured ? "Configured" : "Not configured"}</dd>
                                </div>
                            </dl>
                        </div>
                    </aside>
                </div>
            ) : null}
        </div>
    );
}
