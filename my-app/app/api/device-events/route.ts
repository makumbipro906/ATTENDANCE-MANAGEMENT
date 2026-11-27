import {connection} from "next/server";
import {deviceEventSchema} from "@/lib/server/attendance-event";
import {recordDeviceEvent} from "@/lib/server/device-event-storage";
import {hasValidSecret} from "@/lib/server/http-auth";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
    await connection();
    if (!process.env.DEVICE_WEBHOOK_TOKEN) return Response.json({error: "Device event receiver is not configured."}, {status: 503});
    if (!hasValidSecret(request, "x-device-token", "DEVICE_WEBHOOK_TOKEN")) return Response.json({error: "Unauthorized."}, {status: 401});
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return Response.json({error: "Request body is too large."}, {status: 413});

    let body: unknown;
    try {
        const reader = request.body?.getReader();
        if (!reader) return Response.json({error: "Request body is required."}, {status: 400});
        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            byteLength += value.byteLength;
            if (byteLength > MAX_BODY_BYTES) {
                await reader.cancel();
                return Response.json({error: "Request body is too large."}, {status: 413});
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        body = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    } catch {
        return Response.json({error: "Request body must be valid JSON."}, {status: 400});
    }

    const parsed = deviceEventSchema.safeParse(body);
    if (!parsed.success) return Response.json({error: "Invalid device event.", details: parsed.error.flatten()}, {status: 400});
    const instant = new Date(parsed.data.occurredAt);
    if (!Number.isFinite(instant.getTime()) || instant.getTime() > Date.now() + 5 * 60_000) {
        return Response.json({error: "Event time is invalid or too far in the future."}, {status: 400});
    }

    try {
        const result = await recordDeviceEvent(parsed.data);
        if (result.status === "unknown_device") return Response.json({error: "Device is not registered."}, {status: 404});
        return Response.json(result, {status: result.status === "recorded" ? 201 : 202});
    } catch (error) {
        console.error("Device event could not be persisted:", error);
        return Response.json({error: "Device event could not be safely persisted."}, {status: 503});
    }
}
