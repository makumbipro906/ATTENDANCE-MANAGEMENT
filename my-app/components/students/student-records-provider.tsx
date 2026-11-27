"use client";

import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import type {ParentGuardianContact, StudentRecord} from "../../lib/student-types";

type StudentRecordsContextValue = {
    students: StudentRecord[];
    persistenceError: string | null;
    addStudent: (student: Omit<StudentRecord, "id">) => Promise<void>;
    updateStudent: (student: StudentRecord) => Promise<void>;
    saveBiometricsStatus: (studentId: string, recorded: boolean) => Promise<void>;
    archiveStudent: (id: string) => Promise<void>;
    restoreStudent: (id: string) => Promise<void>;
    deleteStudent: (id: string) => Promise<void>;
};

const StudentRecordsContext = createContext<StudentRecordsContextValue | null>(null);

async function saveStudentRequest(method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown) {
    const response = await fetch("/api/students", {
        method,
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const payload = await response.json() as {error?: string};
        throw new Error(payload.error ?? "Student record could not be saved.");
    }
    return response.status === 204 ? null : await response.json() as StudentRecord | StudentRecord[];
}

export function StudentRecordsProvider({children}: {children: ReactNode}) {
    const [students, setStudents] = useState<StudentRecord[]>([]);
    const [persistenceError, setPersistenceError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const response = await fetch("/api/students", {cache: "no-store"});
                const payload = await response.json() as StudentRecord[] | {error?: string};
                if (!response.ok || !Array.isArray(payload)) {
                    throw new Error(!Array.isArray(payload) ? payload.error : "Student records could not be loaded.");
                }
                if (!cancelled) {
                    setStudents(payload);
                    setPersistenceError(null);
                }
            } catch (error) {
                if (cancelled) return;
                console.error("Unable to load student records:", error);
                setPersistenceError(error instanceof Error ? error.message : "Student records could not be loaded.");
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    async function persist(method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown, update: (result: StudentRecord | StudentRecord[] | null) => void) {
        try {
            const result = await saveStudentRequest(method, body);
            update(result);
            setPersistenceError(null);
        } catch (error) {
            console.error("Unable to save student records:", error);
            const message = error instanceof Error ? error.message : "Student records could not be saved.";
            setPersistenceError(message);
            throw error;
        }
    }

    const context: StudentRecordsContextValue = {
        students,
        persistenceError,
        addStudent: async (student) => persist("POST", student, (result) => {
            if (result && !Array.isArray(result)) setStudents((current) => [result, ...current]);
        }),
        updateStudent: async (student) => persist("PUT", student, (result) => {
            if (result && !Array.isArray(result)) setStudents((current) =>
                current.map((existing) => existing.id === result.id ? result : existing),
            );
        }),
        saveBiometricsStatus: async (studentId, recorded) => persist("PATCH", {
            action: "biometrics",
            id: studentId,
            recorded,
        }, (result) => {
            if (result && !Array.isArray(result)) setStudents((current) =>
                current.map((existing) => existing.id === result.id ? result : existing),
            );
        }),
        archiveStudent: async (id) => persist("PATCH", {action: "archive", id}, (result) => {
            if (result && !Array.isArray(result)) setStudents((current) =>
                current.map((existing) => existing.id === result.id ? result : existing),
            );
        }),
        restoreStudent: async (id) => persist("PATCH", {action: "restore", id}, (result) => {
            if (result && !Array.isArray(result)) setStudents((current) =>
                current.map((existing) => existing.id === result.id ? result : existing),
            );
        }),
        deleteStudent: async (id) => persist("DELETE", {id}, () => {
            setStudents((current) => current.filter((student) => student.id !== id));
        }),
    };

    return <StudentRecordsContext.Provider value={context}>{children}</StudentRecordsContext.Provider>;
}

export function useStudentRecords() {
    const context = useContext(StudentRecordsContext);
    if (!context) throw new Error("Student records must be used inside StudentRecordsProvider.");
    return context;
}

export type {ParentGuardianContact};
