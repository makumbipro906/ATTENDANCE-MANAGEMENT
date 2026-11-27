import {cookies} from "next/headers";
import {connection, NextRequest, NextResponse} from "next/server";

import {
    consumeGithubOAuthState,
    exchangeGithubCode,
    findLinkedSuperAdministrator,
    getGithubUserId,
    GITHUB_OAUTH_STATE_COOKIE,
    isGithubOAuthConfigured,
    linkGithubUser,
    matchesGithubOAuthState,
} from "@/lib/server/github-oauth";
import {
    createSession,
    STAFF_SESSION_COOKIE,
    STAFF_SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/staff-auth";

function redirectWithError(request: NextRequest, purpose: "login" | "link", code: string) {
    const url = new URL(purpose === "link" ? "/profile" : "/login", request.url);
    url.searchParams.set("github_error", code);
    return clearStateCookie(NextResponse.redirect(url));
}

function clearStateCookie(response: NextResponse) {
    response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/api/auth/github/callback",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });
    return response;
}

export async function GET(request: NextRequest) {
    await connection();
    const query = request.nextUrl.searchParams;
    const state = query.get("state") ?? "";
    const cookieState = (await cookies()).get(GITHUB_OAUTH_STATE_COOKIE)?.value;
    if (!isGithubOAuthConfigured()) return redirectWithError(request, "login", "unavailable");
    if (!matchesGithubOAuthState(cookieState, state)) {
        return redirectWithError(request, "login", "invalid_state");
    }

    let oauthState: Awaited<ReturnType<typeof consumeGithubOAuthState>>;
    try {
        oauthState = await consumeGithubOAuthState(state);
    } catch (error) {
        console.error("Unable to validate GitHub OAuth state:", error);
        return redirectWithError(request, "login", "unavailable");
    }
    if (!oauthState) return redirectWithError(request, "login", "invalid_state");
    if (query.has("error")) return redirectWithError(request, oauthState.purpose, "cancelled");

    const code = query.get("code");
    if (!code || code.length > 2048) return redirectWithError(request, oauthState.purpose, "failed");

    try {
        const accessToken = await exchangeGithubCode(code);
        const githubUserId = await getGithubUserId(accessToken);
        if (oauthState.purpose === "link") {
            if (!oauthState.staff_user_id) return redirectWithError(request, "link", "invalid_state");
            try {
                await linkGithubUser(oauthState.staff_user_id, githubUserId);
            } catch (error) {
                if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
                    return redirectWithError(request, "link", "already_linked");
                }
                throw error;
            }
            const response = NextResponse.redirect(new URL("/profile?github=connected", request.url));
            return clearStateCookie(response);
        }

        const staffUserId = await findLinkedSuperAdministrator(githubUserId);
        if (!staffUserId) return redirectWithError(request, "login", "not_linked");
        const session = await createSession(staffUserId);
        const returnTo = oauthState.return_to;
        const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") &&
            !returnTo.includes("\\") ? returnTo : "/";
        const response = NextResponse.redirect(new URL(safeReturnTo, request.url));
        response.cookies.set(STAFF_SESSION_COOKIE, session.token, {
            httpOnly: true,
            maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        });
        return clearStateCookie(response);
    } catch (error) {
        console.error("GitHub OAuth callback failed:", error instanceof Error ? error.message : "Unknown error");
        return redirectWithError(request, oauthState.purpose, "failed");
    }
}
