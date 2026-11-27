import "server-only";

import {createHash, randomBytes, randomUUID, timingSafeEqual} from "node:crypto";

import {getDatabase, withPostgresTransaction} from "@/lib/server/database";

export const GITHUB_OAUTH_STATE_COOKIE = "orchid_github_oauth_state";
export const GITHUB_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export type GithubOAuthPurpose = "login" | "link";
export type GithubOAuthState = {
    purpose: GithubOAuthPurpose;
    staff_user_id: string | null;
    return_to: string | null;
};

function githubOAuthConfig() {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GITHUB_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error("GitHub OAuth is not configured.");
    }

    const callback = new URL(redirectUri);
    const isLocalHttp = callback.protocol === "http:" &&
        (callback.hostname === "localhost" || callback.hostname === "127.0.0.1");
    if ((callback.protocol !== "https:" && !isLocalHttp) ||
        callback.pathname !== "/api/auth/github/callback" ||
        callback.username || callback.password || callback.search || callback.hash) {
        throw new Error("GITHUB_REDIRECT_URI must be the HTTPS GitHub callback URL.");
    }

    return {clientId, clientSecret, redirectUri: callback.toString()};
}

export function isGithubOAuthConfigured() {
    return Boolean(
        process.env.GITHUB_CLIENT_ID?.trim() &&
        process.env.GITHUB_CLIENT_SECRET?.trim() &&
        process.env.GITHUB_REDIRECT_URI?.trim(),
    );
}

export function createGithubAuthorizationUrl(state: string) {
    const {clientId, redirectUri} = githubOAuthConfig();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    return url.toString();
}

function hashState(state: string) {
    return createHash("sha256").update(state).digest("hex");
}

export function matchesGithubOAuthState(expected: string | undefined, received: string | undefined) {
    if (!expected || !received || !/^[A-Za-z0-9_-]{43}$/.test(expected) ||
        !/^[A-Za-z0-9_-]{43}$/.test(received)) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function safeReturnPath(value: string | undefined) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
    try {
        const url = new URL(value, "https://orchid.invalid");
        if (url.origin !== "https://orchid.invalid") return "/";
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return "/";
    }
}

export async function createGithubOAuthState(
    purpose: GithubOAuthPurpose,
    staffUserId?: string,
    returnTo?: string,
) {
    if ((purpose === "link") !== Boolean(staffUserId)) {
        throw new Error("GitHub OAuth state does not match its purpose.");
    }
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + GITHUB_OAUTH_STATE_MAX_AGE_SECONDS * 1000).toISOString();
    await withPostgresTransaction(async (database) => {
        await database.prepare("DELETE FROM github_oauth_states WHERE expires_at <= CURRENT_TIMESTAMP").run();
        await database.prepare(
            `INSERT INTO github_oauth_states (state_hash, purpose, staff_user_id, return_to, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
        ).run(hashState(state), purpose, staffUserId ?? null, purpose === "login" ? safeReturnPath(returnTo) : null, expiresAt);
    });
    return state;
}

export async function consumeGithubOAuthState(state: string): Promise<GithubOAuthState | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
    const record = await getDatabase().prepare(
        `DELETE FROM github_oauth_states
         WHERE state_hash = ? AND expires_at > CURRENT_TIMESTAMP
         RETURNING purpose, staff_user_id, return_to`,
    ).get(hashState(state)) as GithubOAuthState | undefined;
    return record ?? null;
}

export async function exchangeGithubCode(code: string) {
    const {clientId, clientSecret, redirectUri} = githubOAuthConfig();
    const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {"Accept": "application/json", "Content-Type": "application/json"},
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== "object" ||
        !("access_token" in payload) || typeof payload.access_token !== "string" ||
        !payload.access_token) {
        throw new Error("GitHub did not issue an access token.");
    }
    return payload.access_token;
}

export async function getGithubUserId(accessToken: string) {
    const response = await fetch("https://api.github.com/user", {
        headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${accessToken}`,
            "User-Agent": "Orchid-School",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== "object" ||
        !("id" in payload) || typeof payload.id !== "number" ||
        !Number.isSafeInteger(payload.id) || payload.id < 1) {
        throw new Error("GitHub did not return a valid account identity.");
    }
    return String(payload.id);
}

export async function linkGithubUser(staffUserId: string, githubUserId: string) {
    await withPostgresTransaction(async (database) => {
        const account = await database.prepare(
            `UPDATE staff_users
             SET github_user_id = ?
             WHERE id = ? AND active = 1
               AND EXISTS (
                   SELECT 1
                   FROM staff_user_roles ur
                   JOIN roles r ON r.id = ur.role_id
                   WHERE ur.staff_user_id = staff_users.id
                     AND LOWER(r.name) = 'super-administrator'
               )
             RETURNING id`,
        ).get(githubUserId, staffUserId) as {id: string} | undefined;
        if (!account) throw new Error("The linking staff account is no longer eligible.");
        await database.prepare(
            `INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, details)
             VALUES (?, 'admin', ?, 'staff_user.github_linked', 'staff_user', ?, ?)`,
        ).run(randomUUID(), staffUserId, staffUserId, JSON.stringify({provider: "github"}));
    });
}

export async function findLinkedSuperAdministrator(githubUserId: string) {
    const account = await getDatabase().prepare(
        `SELECT DISTINCT u.id
         FROM staff_users u
         JOIN staff_user_roles ur ON ur.staff_user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.github_user_id = ? AND u.active = 1
           AND LOWER(r.name) = 'super-administrator'
         LIMIT 1`,
    ).get(githubUserId) as {id: string} | undefined;
    return account?.id ?? null;
}
