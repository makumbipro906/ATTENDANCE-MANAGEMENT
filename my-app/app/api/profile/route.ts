import {connection} from "next/server";
import {z} from "zod";

import {query} from "@/lib/server/database";

const profileSchema = z.object({
    firstName: z.string().trim().max(100),
    lastName: z.string().trim().max(100),
    email: z.string().trim().max(254),
    phone: z.string().trim().max(32),
    username: z.string().trim().max(100),
    signatureDataUrl: z.string().max(1_400_000).nullable(),
    signatureFileName: z.string().max(255).nullable(),
}).strict();

const SHARED_ID = "shared-school-profile";

function profileRow(row: {
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    username: string;
    signature_data: Uint8Array | null;
    signature_mime: string | null;
    signature_file_name: string | null;
}) {
    return {
        id: SHARED_ID,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        username: row.username,
        role: "School Administrator",
        signatureDataUrl: row.signature_data && row.signature_mime
            ? `data:${row.signature_mime};base64,${Buffer.from(row.signature_data).toString("base64")}`
            : null,
        signatureFileName: row.signature_file_name,
    };
}

export async function GET() {
    await connection();
    try {
        const {rows} = await query(
            "SELECT * FROM staff_profiles WHERE identity_id=?",
            [SHARED_ID],
        );
        const row = rows[0] as Parameters<typeof profileRow>[0] | undefined;
        return Response.json(row ? profileRow(row) : {
            id: SHARED_ID,
            firstName: "School",
            lastName: "Administrator",
            email: "",
            phone: "",
            username: "admin",
            role: "School Administrator",
            signatureDataUrl: null,
            signatureFileName: null,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load profile:", error);
        return Response.json({error: "Profile could not be loaded from PostgreSQL."}, {status: 503});
    }
}

export async function PUT(request: Request) {
    await connection();
    const parsed = profileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Profile details are invalid."}, {status: 400});
    const value = parsed.data;
    let signatureData: Buffer | null = null;
    let signatureMime: string | null = null;
    if (value.signatureDataUrl) {
        const match = value.signatureDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!match) return Response.json({error: "Choose a valid JPEG, PNG, or WebP signature image."}, {status: 400});
        signatureMime = match[1];
        signatureData = Buffer.from(match[2], "base64");
        if (signatureData.length > 1_000_000) return Response.json({error: "Signature image must be smaller than 1 MB."}, {status: 400});
    }

    try {
        await query(
            `INSERT INTO staff_profiles
                (identity_id, email, first_name, last_name, phone, username, signature_data, signature_mime, signature_file_name)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT (identity_id) DO UPDATE SET
                email=EXCLUDED.email, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
                phone=EXCLUDED.phone, username=EXCLUDED.username, signature_data=EXCLUDED.signature_data,
                signature_mime=EXCLUDED.signature_mime, signature_file_name=EXCLUDED.signature_file_name,
                updated_at=CURRENT_TIMESTAMP`,
            [SHARED_ID, value.email, value.firstName, value.lastName, value.phone, value.username,
                signatureData, signatureMime, signatureData ? value.signatureFileName : null],
        );
        const {rows} = await query(
            "SELECT * FROM staff_profiles WHERE identity_id=?",
            [SHARED_ID],
        );
        return Response.json(profileRow(rows[0] as Parameters<typeof profileRow>[0]));
    } catch (error) {
        console.error("Unable to save profile:", error);
        return Response.json({error: "Profile could not be saved to PostgreSQL."}, {status: 503});
    }
}
