import "server-only";

type YoolaSmsResult = {
    providerMessageId: string | null;
    response: unknown;
};

function providerMessageId(response: unknown) {
    if (typeof response !== "object" || response === null) return null;
    for (const key of ["message_id", "messageId", "id"]) {
        const value = response[key as keyof typeof response];
        if (typeof value === "string" && value) return value;
    }
    if ("data" in response && typeof response.data === "object" && response.data !== null) {
        for (const key of ["message_id", "messageId", "id"]) {
            const value = response.data[key as keyof typeof response.data];
            if (typeof value === "string" && value) return value;
        }
    }
    return null;
}

export function isYoolaSmsConfigured() {
    return Boolean(process.env.SMS_PROVIDER_TOKEN?.trim() && process.env.SMS_PROVIDER_SENDER?.trim());
}

export async function sendYoolaSms(to: string, message: string, idempotencyKey?: string): Promise<YoolaSmsResult> {
    const apiKey = process.env.SMS_PROVIDER_TOKEN?.trim();
    const sender = process.env.SMS_PROVIDER_SENDER?.trim();
    if (!apiKey || !sender) throw new Error("Yoola SMS API key and approved sender ID are required.");

    const url = process.env.SMS_PROVIDER_URL?.trim() || "https://yoolasms.com/api/v1/send";
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(idempotencyKey ? {"idempotency-key": idempotencyKey} : {}),
            },
            body: JSON.stringify({
                api_key: apiKey,
                sender,
                message,
                phone: to,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (error) {
        console.error("Yoola SMS request failed:", error);
        throw new Error("Could not connect to Yoola SMS.");
    }

    const body = await response.text();
    let result: unknown = null;
    if (body) {
        try {
            result = JSON.parse(body) as unknown;
        } catch {
            if (response.ok) {
                throw new Error("Yoola SMS returned an unreadable response.");
            }
        }
    }
    if (!response.ok) throw new Error(`Yoola SMS returned HTTP ${response.status}.`);
    if (typeof result === "object" && result !== null) {
        const status = "status" in result && typeof result.status === "string"
            ? result.status.toLocaleLowerCase()
            : "";
        const explicitlyFailed = ("success" in result && result.success === false) ||
            ["error", "failed", "failure"].includes(status);
        if (explicitlyFailed) throw new Error("Yoola SMS rejected the message.");
    }

    return {providerMessageId: providerMessageId(result), response: result};
}
