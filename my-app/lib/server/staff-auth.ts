import "server-only";

import {createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual} from "node:crypto";

import {getDatabase, withPostgresTransaction} from "@/lib/server/database";
import {SYSTEM_PERMISSIONS, type SystemPermissionKey} from "@/lib/system-permissions";
import {isYoolaSmsConfigured, sendYoolaSms} from "@/lib/server/yoola-sms";

export const STAFF_SESSION_COOKIE = "orchid_staff_session";
export const PASSWORD_SETUP_COOKIE = "orchid_password_setup";
export const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export const STAFF_SESSION_HEARTBEAT_TIMEOUT_SECONDS = 60;
export const PASSWORD_SETUP_MAX_AGE_SECONDS = 10 * 60;
const LOGIN_OTP_LIFETIME_MS = 5 * 60 * 1000;
const LOGIN_OTP_RESEND_INTERVAL_MS = 60 * 1000;
const PASSWORD_SETUP_LIFETIME_MS = PASSWORD_SETUP_MAX_AGE_SECONDS * 1000;
type OtpPurpose = "login" | "activation" | "password_reset";

export type StaffSession = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    roleNames: string[];
    permissions: SystemPermissionKey[];
};

function passwordKey(password: string, salt: Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, 64, {N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024}, (error, key) => {
            if (error) reject(error);
            else resolve(Buffer.from(key));
        });
    });
}

export async function hashPassword(password: string) {
    const salt = randomBytes(16);
    const key = await passwordKey(password, salt);
    return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
    const [algorithm, saltHex, keyHex] = storedHash.split("$");
    if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/i.test(saltHex ?? "") ||
        !/^[a-f0-9]{128}$/i.test(keyHex ?? "")) return false;
    const expected = Buffer.from(keyHex, "hex");
    const actual = await passwordKey(password, Buffer.from(saltHex, "hex"));
    return timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export async function createSession(staffUserId: string) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STAFF_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    await getDatabase().prepare(
        "INSERT INTO staff_sessions (token_hash, staff_user_id, expires_at, last_activity_at) VALUES (?, ?, ?, ?)",
    ).run(hashSessionToken(token), staffUserId, expiresAt, now.toISOString());
    return {token, expiresAt};
}

export async function deleteSession(token: string) {
    await getDatabase().prepare("DELETE FROM staff_sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

export async function getStaffSession(token: string | undefined): Promise<StaffSession | null> {
    if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
    const database = getDatabase();
    const account = await database.prepare(
        `SELECT u.id, u.username, u.first_name, u.last_name, s.expires_at, s.last_activity_at
         FROM staff_sessions s
         JOIN staff_users u ON u.id = s.staff_user_id
         WHERE s.token_hash = ? AND u.active = 1`,
    ).get(hashSessionToken(token)) as {
        id: string; username: string | null; first_name: string; last_name: string;
        expires_at: string; last_activity_at: string;
    } | undefined;
    if (!account) return null;
    const activityValue = account.last_activity_at.includes("T")
        ? account.last_activity_at
        : `${account.last_activity_at.replace(" ", "T")}Z`;
    const lastActivityAt = Date.parse(activityValue);
    if (Date.parse(account.expires_at) <= Date.now() ||
        !Number.isFinite(lastActivityAt) ||
        Date.now() - lastActivityAt > STAFF_SESSION_HEARTBEAT_TIMEOUT_SECONDS * 1000) {
        await database.prepare("DELETE FROM staff_sessions WHERE token_hash = ?").run(hashSessionToken(token));
        return null;
    }

    const roles = await database.prepare(
        `SELECT r.name FROM staff_user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.staff_user_id = ? ORDER BY r.name`,
    ).all(account.id) as {name: string}[];
    const permissions = await database.prepare(
        `SELECT DISTINCT p.permission_key
         FROM staff_user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.staff_user_id = ?`,
    ).all(account.id) as {permission_key: string}[];
    const isSuperAdministrator = roles.some(({name}) => name.toLocaleLowerCase() === "super-administrator");
    const granted = isSuperAdministrator
        ? SYSTEM_PERMISSIONS.map(({key}) => key)
        : permissions.map(({permission_key}) => permission_key)
            .filter((key): key is SystemPermissionKey => SYSTEM_PERMISSIONS.some((item) => item.key === key));

    return {
        id: account.id,
        username: account.username ?? "",
        firstName: account.first_name,
        lastName: account.last_name,
        roleNames: roles.map(({name}) => name),
        permissions: granted,
    };
}

export async function refreshStaffSession(token: string | undefined) {
    if (!await getStaffSession(token) || !token) return false;
    const now = new Date().toISOString();
    const result = await getDatabase().prepare(
        "UPDATE staff_sessions SET last_activity_at = ? WHERE token_hash = ? AND expires_at > ?",
    ).run(now, hashSessionToken(token), now);
    return Number(result.changes) === 1;
}

export async function isInitialSetupRequired() {
    const row = await getDatabase().prepare("SELECT count(*) AS count FROM staff_users").get() as {count: number};
    return Number(row.count) === 0;
}

export function isSmsOtpConfigured() {
    return isYoolaSmsConfigured();
}

export function isLocalDevelopmentOtpRequest(request: Request) {
    const hostname = new URL(request.url).hostname;
    return process.env.NODE_ENV === "development" &&
        process.env.OTP_DELIVERY_MODE === "development" &&
        ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function maskPhone(phone: string) {
    const normalized = phone.replace(/\s+/g, "");
    if (normalized.length < 6) return "your registered phone";
    return `${normalized.slice(0, 3)}••••${normalized.slice(-2)}`;
}

async function deliverOtp(phone: string, code: string, challengeId: string, purpose: OtpPurpose) {
    if (!isSmsOtpConfigured()) throw new Error("OTP_NOT_CONFIGURED");
    const action = purpose === "activation"
        ? "activate your Orchid School account"
        : purpose === "password_reset"
            ? "reset your Orchid School password"
            : "sign in to Orchid School";
    try {
        await sendYoolaSms(phone, `Your code to ${action} is ${code}. It expires in 5 minutes.`, challengeId);
    } catch (error) {
        console.error("OTP SMS delivery request failed:", error);
        throw new Error("OTP_DELIVERY_FAILED");
    }
}

export async function issueStaffLoginOtp(
    staffUserId: string,
    useLocalOtp = false,
    purpose: OtpPurpose = "login",
) {
    if (!useLocalOtp && !isSmsOtpConfigured()) throw new Error("OTP_NOT_CONFIGURED");
    const database = getDatabase();
    const user = await database.prepare(
        "SELECT phone FROM staff_users WHERE id = ? AND active = 1",
    ).get(staffUserId) as {phone: string | null} | undefined;
    if (!useLocalOtp && !user?.phone?.trim()) throw new Error("OTP_PHONE_MISSING");
    const existing = await database.prepare(
        `SELECT last_sent_at FROM staff_login_otps
         WHERE staff_user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
    ).get(staffUserId, new Date().toISOString()) as {last_sent_at: string} | undefined;
    if (existing && Date.now() - Date.parse(existing.last_sent_at) < LOGIN_OTP_RESEND_INTERVAL_MS) {
        throw new Error("OTP_RATE_LIMITED");
    }

    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await hashPassword(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOGIN_OTP_LIFETIME_MS).toISOString();
    await withPostgresTransaction(async (transaction) => {
        await transaction.prepare("DELETE FROM staff_login_otps WHERE staff_user_id = ?").run(staffUserId);
        await transaction.prepare(
            `INSERT INTO staff_login_otps (id, staff_user_id, code_hash, purpose, attempts, expires_at, last_sent_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)`,
        ).run(challengeId, staffUserId, codeHash, purpose, expiresAt, now.toISOString());
    });
    if (!useLocalOtp) {
        try {
            await deliverOtp(user?.phone ?? "", code, challengeId, purpose);
        } catch (error) {
            await database.prepare("DELETE FROM staff_login_otps WHERE id = ?").run(challengeId);
            throw error;
        }
    }
    return {
        challengeId,
        maskedPhone: useLocalOtp ? "local development mode" : maskPhone(user?.phone ?? ""),
        expiresInSeconds: LOGIN_OTP_LIFETIME_MS / 1000,
        ...(useLocalOtp ? {developmentOtp: code} : {}),
    };
}

export async function resendStaffLoginOtp(username: string, challengeId: string, useLocalOtp = false) {
    const database = getDatabase();
    const challenge = await database.prepare(
        `SELECT c.id, c.staff_user_id, c.code_hash, c.purpose, c.attempts, c.expires_at, c.last_sent_at, u.phone
         FROM staff_login_otps c JOIN staff_users u ON u.id = c.staff_user_id
         WHERE c.id = ? AND c.purpose = 'login' AND u.username = ? AND u.active = 1`,
    ).get(challengeId, username) as {
        id: string; staff_user_id: string; code_hash: string; purpose: OtpPurpose; attempts: number;
        expires_at: string; last_sent_at: string; phone: string | null;
    } | undefined;
    if (!challenge || Date.parse(challenge.expires_at) <= Date.now() || Number(challenge.attempts) >= 5) {
        throw new Error("OTP_CHALLENGE_EXPIRED");
    }
    if (!useLocalOtp && !challenge.phone?.trim()) throw new Error("OTP_PHONE_MISSING");
    if (Date.now() - Date.parse(challenge.last_sent_at) < LOGIN_OTP_RESEND_INTERVAL_MS) {
        throw new Error("OTP_RATE_LIMITED");
    }
    if (!useLocalOtp && !isSmsOtpConfigured()) throw new Error("OTP_NOT_CONFIGURED");

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await hashPassword(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOGIN_OTP_LIFETIME_MS).toISOString();
    await database.prepare(
        "UPDATE staff_login_otps SET code_hash = ?, expires_at = ?, last_sent_at = ? WHERE id = ?",
    ).run(codeHash, expiresAt, now.toISOString(), challengeId);
    if (!useLocalOtp) {
        try {
            await deliverOtp(challenge.phone ?? "", code, challengeId, challenge.purpose);
        } catch (error) {
            await database.prepare("DELETE FROM staff_login_otps WHERE id = ?").run(challengeId);
            throw error;
        }
    }
    return {
        maskedPhone: useLocalOtp ? "local development mode" : maskPhone(challenge.phone ?? ""),
        expiresInSeconds: LOGIN_OTP_LIFETIME_MS / 1000,
        ...(useLocalOtp ? {developmentOtp: code} : {}),
    };
}

export async function verifyStaffLoginOtp(challengeId: string, code: string) {
    const challenge = await withPostgresTransaction(async (transaction) => {
        const found = await transaction.prepare(
            "SELECT id, staff_user_id, code_hash, attempts, expires_at FROM staff_login_otps WHERE id = ? AND purpose = 'login'",
        ).get(challengeId) as {
            id: string; staff_user_id: string; code_hash: string; attempts: number; expires_at: string;
        } | undefined;
        if (!found || Date.parse(found.expires_at) <= Date.now() || Number(found.attempts) >= 5) return null;
        await transaction.prepare("UPDATE staff_login_otps SET attempts = attempts + 1 WHERE id = ?").run(challengeId);
        return found;
    });
    if (!challenge) throw new Error("OTP_CHALLENGE_EXPIRED");
    if (!await verifyPassword(code, challenge.code_hash)) throw new Error("OTP_INVALID");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + STAFF_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const completed = await withPostgresTransaction(async (transaction) => {
        const removed = await transaction.prepare("DELETE FROM staff_login_otps WHERE id = ? AND code_hash = ?")
            .run(challengeId, challenge.code_hash);
        if (Number(removed.changes) !== 1) return false;
        await transaction.prepare(
            "INSERT INTO staff_sessions (token_hash, staff_user_id, expires_at) VALUES (?, ?, ?)",
        ).run(hashSessionToken(token), challenge.staff_user_id, expiresAt);
        return true;
    });
    if (!completed) throw new Error("OTP_CHALLENGE_EXPIRED");
    return {token, expiresAt};
}

async function verifyOtpForPasswordSetup(
    challengeId: string,
    code: string,
    purpose: "activation" | "password_reset",
) {
    const challenge = await withPostgresTransaction(async (transaction) => {
        const found = await transaction.prepare(
            `SELECT id, staff_user_id, code_hash, attempts, expires_at FROM staff_login_otps
             WHERE id = ? AND purpose = ?`,
        ).get(challengeId, purpose) as {
            id: string; staff_user_id: string; code_hash: string; attempts: number; expires_at: string;
        } | undefined;
        if (!found || Date.parse(found.expires_at) <= Date.now() || Number(found.attempts) >= 5) return null;
        await transaction.prepare("UPDATE staff_login_otps SET attempts = attempts + 1 WHERE id = ?").run(challengeId);
        return found;
    });
    if (!challenge) throw new Error("OTP_CHALLENGE_EXPIRED");
    if (!await verifyPassword(code, challenge.code_hash)) throw new Error("OTP_INVALID");

    return withPostgresTransaction(async (transaction) => {
        const removed = await transaction.prepare(
            "DELETE FROM staff_login_otps WHERE id = ? AND code_hash = ? AND purpose = ?",
        ).run(challengeId, challenge.code_hash, purpose);
        if (Number(removed.changes) !== 1) throw new Error("OTP_CHALLENGE_EXPIRED");
        const token = randomBytes(32).toString("base64url");
        await transaction.prepare("DELETE FROM staff_password_setup_tokens WHERE staff_user_id = ?")
            .run(challenge.staff_user_id);
        await transaction.prepare(
            "INSERT INTO staff_password_setup_tokens (token_hash, staff_user_id, purpose, expires_at) VALUES (?, ?, ?, ?)",
        ).run(
            hashSessionToken(token),
            challenge.staff_user_id,
            purpose,
            new Date(Date.now() + PASSWORD_SETUP_LIFETIME_MS).toISOString(),
        );
        return token;
    });
}

export async function verifyPendingActivationOtp(username: string, code: string) {
    const challenge = await getDatabase().prepare(
        `SELECT c.id FROM staff_login_otps c
         JOIN staff_users u ON u.id = c.staff_user_id
         WHERE u.username = ? AND u.active = 1 AND u.password_hash IS NULL
           AND c.purpose = 'activation' AND c.expires_at > ?
         ORDER BY c.created_at DESC LIMIT 1`,
    ).get(username, new Date().toISOString()) as {id: string} | undefined;
    if (!challenge) throw new Error("OTP_CHALLENGE_EXPIRED");
    return verifyOtpForPasswordSetup(challenge.id, code, "activation");
}

export async function verifyPasswordResetOtp(username: string, code: string) {
    const challenge = await getDatabase().prepare(
        `SELECT c.id FROM staff_login_otps c
         JOIN staff_users u ON u.id = c.staff_user_id
         WHERE u.username = ? AND u.active = 1 AND u.password_hash IS NOT NULL
           AND c.purpose = 'password_reset' AND c.expires_at > ?
         ORDER BY c.created_at DESC LIMIT 1`,
    ).get(username, new Date().toISOString()) as {id: string} | undefined;
    if (!challenge) throw new Error("OTP_CHALLENGE_EXPIRED");
    return verifyOtpForPasswordSetup(challenge.id, code, "password_reset");
}

export async function requestStaffPasswordReset(username: string) {
    const user = await getDatabase().prepare(
        "SELECT id FROM staff_users WHERE username = ? AND active = 1 AND password_hash IS NOT NULL",
    ).get(username) as {id: string} | undefined;
    if (!user) return;
    await issueStaffLoginOtp(user.id, false, "password_reset");
}

export async function setPasswordFromSetupToken(token: string, password: string) {
    const database = getDatabase();
    const tokenHash = hashSessionToken(token);
    const eligible = await database.prepare(
        "SELECT 1 FROM staff_password_setup_tokens WHERE token_hash = ? AND expires_at > ?",
    ).get(tokenHash, new Date().toISOString());
    if (!eligible) throw new Error("PASSWORD_SETUP_EXPIRED");
    const passwordHash = await hashPassword(password);
    return withPostgresTransaction(async (transaction) => {
        const setup = await transaction.prepare(
            `SELECT staff_user_id, purpose FROM staff_password_setup_tokens
             WHERE token_hash = ? AND expires_at > ?`,
        ).get(tokenHash, new Date().toISOString()) as {
            staff_user_id: string; purpose: "activation" | "password_reset";
        } | undefined;
        if (!setup) throw new Error("PASSWORD_SETUP_EXPIRED");
        const user = await transaction.prepare(
            "SELECT password_hash FROM staff_users WHERE id = ? AND active = 1",
        ).get(setup.staff_user_id) as {password_hash: string | null} | undefined;
        if (!user ||
            (setup.purpose === "activation" && user.password_hash !== null) ||
            (setup.purpose === "password_reset" && user.password_hash === null)) {
            throw new Error("PASSWORD_SETUP_EXPIRED");
        }
        await transaction.prepare("UPDATE staff_users SET password_hash = ? WHERE id = ?")
            .run(passwordHash, setup.staff_user_id);
        await transaction.prepare("DELETE FROM staff_password_setup_tokens WHERE staff_user_id = ?")
            .run(setup.staff_user_id);
        await transaction.prepare("DELETE FROM staff_login_otps WHERE staff_user_id = ?")
            .run(setup.staff_user_id);
        await transaction.prepare("DELETE FROM staff_sessions WHERE staff_user_id = ?")
            .run(setup.staff_user_id);
        await transaction.prepare(
            `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
             VALUES (?, 'system', ?, 'staff_user', ?, '{}')`,
        ).run(
            randomUUID(),
            setup.purpose === "activation" ? "staff_user.activated" : "staff_user.password_reset",
            setup.staff_user_id,
        );
        return setup.purpose;
    });
}

export async function loginAttemptIsLocked(username: string) {
    const row = await getDatabase().prepare(
        "SELECT locked_until FROM staff_login_attempts WHERE username = ?",
    ).get(username.trim().toLocaleLowerCase()) as {locked_until: string | null} | undefined;
    return Boolean(row?.locked_until && Date.parse(row.locked_until) > Date.now());
}

export async function recordFailedLogin(username: string) {
    const key = username.trim().toLocaleLowerCase();
    await withPostgresTransaction(async (database) => {
        const row = await database.prepare(
            "SELECT failed_attempts, locked_until FROM staff_login_attempts WHERE username = ?",
        ).get(key) as {failed_attempts: number; locked_until: string | null} | undefined;
        const stillLocked = row?.locked_until && Date.parse(row.locked_until) > Date.now();
        const failures = stillLocked ? Number(row.failed_attempts) : Number(row?.failed_attempts ?? 0) + 1;
        const lockedUntil = failures >= 10 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
        await database.prepare(
            `INSERT INTO staff_login_attempts (username, failed_attempts, locked_until, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT (username) DO UPDATE SET failed_attempts=EXCLUDED.failed_attempts,
             locked_until=EXCLUDED.locked_until, updated_at=CURRENT_TIMESTAMP`,
        ).run(key, failures, lockedUntil);
    });
}

export async function clearLoginFailures(username: string) {
    await getDatabase().prepare("DELETE FROM staff_login_attempts WHERE username = ?")
        .run(username.trim().toLocaleLowerCase());
}

export async function setupInitialAdministrator(input: {
    firstName: string;
    lastName: string;
    username: string;
    password: string;
    phone: string;
}) {
    const passwordHash = await hashPassword(input.password);
    return withPostgresTransaction(async (database) => {
        const users = await database.prepare("SELECT count(*) AS count FROM staff_users").get() as {count: number};
        if (Number(users.count) !== 0) return null;
        const userId = randomUUID();
        await database.prepare(
            `INSERT INTO staff_users (id, username, first_name, last_name, phone, password_hash)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(userId, input.username, input.firstName, input.lastName, input.phone, passwordHash);
        await database.prepare(
            "INSERT INTO roles (id, name, description) VALUES (?, 'Super-Administrator', 'Full system access.') ON CONFLICT (name) DO NOTHING",
        ).run(randomUUID());
        const administratorRole = await database.prepare(
            "SELECT id FROM roles WHERE name = 'Super-Administrator'",
        ).get() as {id: string} | undefined;
        if (!administratorRole) throw new Error("The Super-Administrator role could not be initialized.");
        await database.prepare("INSERT INTO staff_user_roles (staff_user_id, role_id) VALUES (?, ?)")
            .run(userId, administratorRole.id);
        await database.prepare(
            `INSERT INTO role_permissions (role_id, permission_id)
             SELECT ?, id FROM permissions WHERE permission_key IN (${SYSTEM_PERMISSIONS.map(() => "?").join(", ")})`,
        ).run(administratorRole.id, ...SYSTEM_PERMISSIONS.map(({key}) => key));
        await database.prepare(
            `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
             VALUES (?, 'system', 'staff_auth.initial_setup', 'staff_user', ?, ?)`,
        ).run(randomUUID(), userId, JSON.stringify({username: input.username}));
        return userId;
    });
}

export function isSafeSameOriginRequest(request: Request) {
    const origin = request.headers.get("origin");
    if (!origin) return true;
    try {
        return new URL(origin).origin === new URL(request.url).origin;
    } catch {
        return false;
    }
}
