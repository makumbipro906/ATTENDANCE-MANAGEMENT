import "server-only";

import {readFileSync} from "node:fs";
import {join} from "node:path";
import {Pool, type PoolClient, type QueryResult, type QueryResultRow} from "pg";

import {SYSTEM_PERMISSIONS} from "@/lib/system-permissions";

export type DatabaseRow = QueryResultRow;
export type SQLInputValue = string | number | boolean | null | Uint8Array;
type QueryExecutor = (text: string, values: SQLInputValue[]) => Promise<QueryResult<DatabaseRow>>;

function postgresPlaceholders(sql: string) {
    let parameterIndex = 0;
    let quote: "'" | '"' | null = null;
    let escaped = false;
    let result = "";

    for (let index = 0; index < sql.length; index += 1) {
        const character = sql[index];
        if (quote) {
            result += character;
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                if (sql[index + 1] === quote) {
                    result += sql[index + 1];
                    index += 1;
                } else {
                    quote = null;
                }
            }
        } else if (character === "'" || character === '"') {
            quote = character;
            result += character;
        } else if (character === "?") {
            parameterIndex += 1;
            result += `$${parameterIndex}`;
        } else {
            result += character;
        }
    }

    return {sql: result, parameterCount: parameterIndex};
}

export class PostgresDatabase {
    constructor(private readonly execute: QueryExecutor) {}

    async query(sql: string, values: SQLInputValue[] = []) {
        const normalized = postgresPlaceholders(sql);
        if (values.length !== normalized.parameterCount) {
            throw new Error(
                `SQL parameter count mismatch: expected ${normalized.parameterCount}, received ${values.length}.`,
            );
        }
        return this.execute(normalized.sql, values.map((value) =>
            value instanceof Uint8Array ? Buffer.from(value) : value,
        ));
    }

    async exec(sql: string) {
        await this.execute(sql, []);
    }

    prepare(sql: string) {
        const normalized = postgresPlaceholders(sql);
        const query = (values: SQLInputValue[]) => {
            if (values.length !== normalized.parameterCount) {
                throw new Error(
                    `SQL parameter count mismatch: expected ${normalized.parameterCount}, received ${values.length}.`,
                );
            }
            return this.execute(normalized.sql, values.map((value) =>
                value instanceof Uint8Array ? Buffer.from(value) : value,
            ));
        };

        return {
            all: async (...values: SQLInputValue[]) => (await query(values)).rows,
            get: async (...values: SQLInputValue[]) => (await query(values)).rows[0],
            run: async (...values: SQLInputValue[]) => {
                const result = await query(values);
                return {changes: result.rowCount ?? 0};
            },
        };
    }
}

declare global {
    var orchidPostgresPool: Pool | undefined;
    var orchidPostgresInitialization: Promise<void> | undefined;
    var orchidPostgresDatabase: PostgresDatabase | undefined;
}

function getPool() {
    if (globalThis.orchidPostgresPool) return globalThis.orchidPostgresPool;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL must contain the Supabase PostgreSQL connection string.");
    }

    const databaseUrl = new URL(connectionString);
    if (databaseUrl.searchParams.get("sslmode") !== "verify-full") {
        throw new Error("DATABASE_URL must enable sslmode=verify-full.");
    }
    databaseUrl.searchParams.delete("sslmode");
    databaseUrl.searchParams.delete("sslrootcert");

    const pool = new Pool({
        connectionString: databaseUrl.toString(),
        ssl: {
            ca: readFileSync(join(process.cwd(), "lib", "supabase", "prod-ca-2021.crt"), "utf8"),
            rejectUnauthorized: true,
        },
        max: Number(process.env.DATABASE_POOL_MAX ?? 1),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (error) => {
        console.error("Unexpected idle PostgreSQL client error:", error);
    });
    globalThis.orchidPostgresPool = pool;
    return pool;
}

async function initializeDatabase() {
    const pool = getPool();
    if (!globalThis.orchidPostgresInitialization) {
        globalThis.orchidPostgresInitialization = (async () => {
            const migration = readFileSync(
                join(process.cwd(), "database", "migrations", "001_initial_schema.sql"),
                "utf8",
            );
            for (const statement of migration.split(/;\s*(?:\r?\n|$)/).filter((item) => item.trim())) {
                await pool.query(statement);
            }
            for (const [index, permission] of SYSTEM_PERMISSIONS.entries()) {
                await pool.query(
                    `INSERT INTO permissions (id, permission_key, description)
                     VALUES ($1, $2, $3) ON CONFLICT (permission_key) DO NOTHING`,
                    [`system-permission-${index + 1}`, permission.key, permission.description],
                );
            }
        })().catch((error: unknown) => {
            globalThis.orchidPostgresInitialization = undefined;
            throw error;
        });
    }
    await globalThis.orchidPostgresInitialization;
    return pool;
}

export function getDatabase() {
    if (!globalThis.orchidPostgresDatabase) {
        globalThis.orchidPostgresDatabase = new PostgresDatabase(async (text, values) => {
            const pool = await initializeDatabase();
            return pool.query(text, values);
        });
    }
    return globalThis.orchidPostgresDatabase;
}

export async function query<T extends DatabaseRow = DatabaseRow>(
    text: string,
    values: SQLInputValue[] = [],
) {
    const result = await getDatabase().query(text, values);
    return {rows: result.rows as T[], rowCount: result.rowCount ?? 0};
}

export async function withPostgresTransaction<T>(
    work: (database: PostgresDatabase) => T | Promise<T>,
): Promise<T> {
    const pool = await initializeDatabase();
    const client: PoolClient = await pool.connect();
    try {
        await client.query("BEGIN");
        const database = new PostgresDatabase((text, values) => client.query(text, values));
        const result = await work(database);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
