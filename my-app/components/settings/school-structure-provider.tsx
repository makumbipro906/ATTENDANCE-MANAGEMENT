"use client";

import {createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction} from "react";
import type {SchoolClass, SchoolStream} from "../../lib/school-settings";

export type {SchoolClass, SchoolLevel, SchoolStream} from "../../lib/school-settings";

type SchoolStructureContextValue = {
    classes: SchoolClass[];
    setClasses: Dispatch<SetStateAction<SchoolClass[]>>;
    streams: SchoolStream[];
    setStreams: Dispatch<SetStateAction<SchoolStream[]>>;
    sections: string[];
    setSections: Dispatch<SetStateAction<string[]>>;
    persistenceError: string | null;
};

const SchoolStructureContext = createContext<SchoolStructureContextValue | null>(null);

export function SchoolStructureProvider({children}: {children: ReactNode}) {
    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [streams, setStreams] = useState<SchoolStream[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [persistenceError, setPersistenceError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const response = await fetch("/api/school-settings", {cache: "no-store"});
                const payload = await response.json() as {
                    classes?: SchoolClass[];
                    streams?: SchoolStream[];
                    sections?: string[];
                    error?: string;
                };
                if (!response.ok || !payload.classes || !payload.streams || !payload.sections) {
                    throw new Error(payload.error ?? "School structure could not be loaded.");
                }
                if (cancelled) return;
                setClasses(payload.classes);
                setStreams(payload.streams);
                setSections(payload.sections);
                setPersistenceError(null);
                setLoaded(true);
            } catch (error) {
                if (cancelled) return;
                console.error("Unable to load school structure:", error);
                setPersistenceError(error instanceof Error ? error.message : "School structure could not be loaded.");
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!loaded) return;
        let cancelled = false;
        async function save(key: "classes" | "streams" | "sections", value: SchoolClass[] | SchoolStream[] | string[]) {
            try {
                const response = await fetch("/api/school-settings", {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({key, value}),
                });
                const payload = await response.json() as {error?: string};
                if (!response.ok) throw new Error(payload.error ?? "School structure could not be saved.");
                if (!cancelled) setPersistenceError(null);
            } catch (error) {
                if (cancelled) return;
                console.error(`Unable to save school ${key}:`, error);
                setPersistenceError(error instanceof Error ? error.message : "School structure could not be saved.");
            }
        }
        void save("classes", classes);
        return () => { cancelled = true; };
    }, [classes, loaded]);

    useEffect(() => {
        if (!loaded) return;
        let cancelled = false;
        async function save() {
            try {
                const response = await fetch("/api/school-settings", {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({key: "streams", value: streams}),
                });
                const payload = await response.json() as {error?: string};
                if (!response.ok) throw new Error(payload.error ?? "School streams could not be saved.");
                if (!cancelled) setPersistenceError(null);
            } catch (error) {
                if (cancelled) return;
                console.error("Unable to save school streams:", error);
                setPersistenceError(error instanceof Error ? error.message : "School streams could not be saved.");
            }
        }
        void save();
        return () => { cancelled = true; };
    }, [loaded, streams]);

    useEffect(() => {
        if (!loaded) return;
        let cancelled = false;
        async function save() {
            try {
                const response = await fetch("/api/school-settings", {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({key: "sections", value: sections}),
                });
                const payload = await response.json() as {error?: string};
                if (!response.ok) throw new Error(payload.error ?? "School sections could not be saved.");
                if (!cancelled) setPersistenceError(null);
            } catch (error) {
                if (cancelled) return;
                console.error("Unable to save school sections:", error);
                setPersistenceError(error instanceof Error ? error.message : "School sections could not be saved.");
            }
        }
        void save();
        return () => { cancelled = true; };
    }, [loaded, sections]);

    return (
        <SchoolStructureContext.Provider value={{classes, setClasses, streams, setStreams, sections, setSections, persistenceError}}>
            {children}
        </SchoolStructureContext.Provider>
    );
}

export function useSchoolStructure() {
    const context = useContext(SchoolStructureContext);
    if (!context) {
        throw new Error("School structure must be used inside SchoolStructureProvider.");
    }
    return context;
}
