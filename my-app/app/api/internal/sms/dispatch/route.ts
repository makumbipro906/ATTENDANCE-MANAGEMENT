import {hasValidSecret} from "@/lib/server/http-auth";
import {query} from "@/lib/server/database";
import {claimSmsNotifications} from "@/lib/server/device-event-storage";
import {isYoolaSmsConfigured, sendYoolaSms} from "@/lib/server/yoola-sms";

type ClaimedMessage = {
    id: string;
    recipient_phone: string;
    message_body: string;
    attempt_count: number;
};

export async function POST(request: Request) {
    if (!process.env.SMS_DISPATCH_TOKEN) {
        return Response.json({error: "SMS dispatcher is not configured."}, {status: 503});
    }
    if (!hasValidSecret(request, "x-sms-dispatch-token", "SMS_DISPATCH_TOKEN")) {
        return Response.json({error: "Unauthorized."}, {status: 401});
    }
    if (!isYoolaSmsConfigured()) {
        return Response.json({error: "Yoola SMS API key and approved sender ID are not configured."}, {status: 503});
    }

    try {
        const messages = await claimSmsNotifications() as ClaimedMessage[];
        const results = await Promise.all(messages.map(async (message) => {
            try {
                const {providerMessageId} = await sendYoolaSms(
                    message.recipient_phone,
                    message.message_body,
                    message.id,
                );
                await query(
                    `UPDATE sms_notifications
                     SET status='submitted', provider_message_id=?, last_error=NULL, updated_at=CURRENT_TIMESTAMP
                     WHERE id=? AND status='processing'`,
                    [providerMessageId, message.id],
                );
                return {id: message.id, status: "submitted"};
            } catch (error) {
                const retryDelayMinutes = Math.min(60, 2 ** message.attempt_count);
                const errorMessage = error instanceof Error ? error.message : "Yoola SMS request failed.";
                await query(
                    `UPDATE sms_notifications
                     SET status='failed', last_error=?, retry_after=?, updated_at=CURRENT_TIMESTAMP
                     WHERE id=? AND status='processing'`,
                    [
                        errorMessage.slice(0, 1000),
                        message.attempt_count < 5 ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString() : null,
                        message.id,
                    ],
                );
                return {id: message.id, status: "failed"};
            }
        }));

        return Response.json({processed: results.length, results});
    } catch (error) {
        console.error("Yoola SMS dispatch batch failed:", error);
        return Response.json({error: "SMS dispatch batch failed."}, {status: 503});
    }
}
