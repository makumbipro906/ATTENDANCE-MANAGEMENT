import {connection, NextRequest, NextResponse} from "next/server";

import {
    createGithubAuthorizationUrl,
    createGithubOAuthState,
    GITHUB_OAUTH_STATE_COOKIE,
    GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
    isGithubOAuthConfigured,
} from "@/lib/server/github-oauth";

const stateCookieOptions = {
    httpOnly: true,
    maxAge: GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/api/auth/github/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
};

function redirectToLoginError(request: NextRequest, code: string) {
    const url = new URL("/login", request.url);
    url.searchParams.set("github_error", code);
    return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
    await connection();
    if (!isGithubOAuthConfigured()) return redirectToLoginError(request, "unavailable");
    try {
        const state = await createGithubOAuthState("login", undefined, request.nextUrl.searchParams.get("next") ?? undefined);
        const response = NextResponse.redirect(createGithubAuthorizationUrl(state));
        response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, stateCookieOptions);
        return response;
    } catch (error) {
        console.error("Unable to start GitHub sign-in:", error);
        return redirectToLoginError(request, "unavailable");
    }
}
