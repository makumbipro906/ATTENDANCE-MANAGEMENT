"use client";

import {createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction} from "react";
import type {AcademicTerm, AcademicYear} from "../../lib/school-settings";

export type {AcademicTerm, AcademicYear} from "../../lib/school-settings";

type AcademicYearsContextValue = {
    years: AcademicYear[];
    setYears: Dispatch<SetStateAction<AcademicYear[]>>;
    terms: AcademicTerm[];
    setTerms: Dispatch<SetStateAction<AcademicTerm[]>>;
    persistenceError: string | null;
};

const AcademicYearsContext = createContext<AcademicYearsContextValue | null>(null);

export function AcademicYearsProvider({children}: {children: ReactNode}) {
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [terms, setTerms] = useState<AcademicTerm[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [persistenceError, setPersistenceError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const response = await fetch("/api/school-settings", {cache: "no-store"});
                const payload = await response.json() as {years?: AcademicYear[]; terms?: AcademicTerm[]; error?: string};
                if (!response.ok || !payload.years || !payload.terms) {
                    throw new Error(payload.error ?? "Academic settings could not be loaded.");
                }
                if (cancelled) return;
                setYears(payload.years);
                setTerms(payload.terms);
                setPersistenceError(null);
                setLoaded(true);
            } catch (error) {
                if (cancelled) return;
                console.error("Unable to load academic settings:", error);
                setPersistenceError(error instanceof Error ? error.message : "Academic settings could not be loaded.");
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!loaded) return;
        let cancelled = false;
        async function save(key: "years" | "terms", value: AcademicYear[] | AcademicTerm[]) {
            try {
                const response = await fetch("/api/school-settings", {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({key, value}),
                });
                const payload = await response.json() as {error?: string};
                if (!response.ok) throw new Error(payload.error ?? "Academic settings could not be saved.");
                if (!cancelled) setPersistenceError(null);
            } catch (error) {
                if (cancelled) return;
                console.error(`Unable to save academic ${key}:`, error);
                setPersistenceError(error instanceof Error ? error.message : "Academic settings could not be saved.");
            }
        }
        void save("years", years);
        return () => { cancelled = true; };
    }, [loaded, years]);

    useEffect(() => {
        if (!loaded) return;
        let cancelled = false;
        async function save() {
            try {
                const response = await fetch("/api/school-settings", {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({key: "terms", value: terms}),
                });
                const payload = await response.json() as {error?: string};
                if (!response.ok) throw new Error(payload.error ?? "Academic terms could not be saved.");
                if (!cancelled) setPersistenceError(null);
            } catch (error) {
                if (cancelled) return;
                console.error("Unable to save academic terms:", error);
                setPersistenceError(error instanceof Error ? error.message : "Academic terms could not be saved.");
            }
        }
        void save();
        return () => { cancelled = true; };
    }, [loaded, terms]);

    return (
        <AcademicYearsContext.Provider value={{years, setYears, terms, setTerms, persistenceError}}>
            {children}
        </AcademicYearsContext.Provider>
    );
}

export function useAcademicYears() {
    const context = useContext(AcademicYearsContext);
    if (!context) {
        throw new Error("Academic years must be used inside AcademicYearsProvider.");
    }
    return context;
}
