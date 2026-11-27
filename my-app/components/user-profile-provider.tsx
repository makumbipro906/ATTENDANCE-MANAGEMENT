"use client";

import {createContext, useContext, useEffect, useState, type ReactNode} from "react";

export type UserProfile = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    username: string;
    role: string;
    id: string;
    signatureDataUrl: string | null;
    signatureFileName: string | null;
};

const DEFAULT_PROFILE: UserProfile = {
    firstName: "School",
    lastName: "Administrator",
    email: "",
    phone: "",
    username: "admin",
    role: "School Administrator",
    id: "shared-school-profile",
    signatureDataUrl: null,
    signatureFileName: null,
};

type UserProfileContextValue = {
    profile: UserProfile;
    ready: boolean;
    persistenceError: string | null;
    saveProfile: (profile: UserProfile) => Promise<void>;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({children}: {children: ReactNode}) {
    const [profile, setProfile] = useState(DEFAULT_PROFILE);
    const [ready, setReady] = useState(false);
    const [persistenceError, setPersistenceError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadProfile() {
            try {
                const response = await fetch("/api/profile", {cache: "no-store"});
                const payload = await response.json() as UserProfile | {error?: string};
                if (!response.ok || !("firstName" in payload)) {
                    throw new Error("error" in payload ? payload.error : "Profile could not be loaded.");
                }
                if (!cancelled) {
                    setProfile(payload);
                    setPersistenceError(null);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Unable to load profile:", error);
                    setPersistenceError(error instanceof Error ? error.message : "Profile could not be loaded.");
                }
            } finally {
                if (!cancelled) setReady(true);
            }
        }
        void loadProfile();
        return () => { cancelled = true; };
    }, []);

    async function saveProfile(updatedProfile: UserProfile) {
        const response = await fetch("/api/profile", {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(updatedProfile),
        });
        const payload = await response.json() as UserProfile | {error?: string};
        if (!response.ok || !("firstName" in payload)) {
            const message = "error" in payload ? payload.error : "Profile could not be saved.";
            setPersistenceError(message ?? "Profile could not be saved.");
            throw new Error(message ?? "Profile could not be saved.");
        }
        setProfile(payload);
        setPersistenceError(null);
    }

    return <UserProfileContext.Provider value={{profile, ready, persistenceError, saveProfile}}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
    const context = useContext(UserProfileContext);
    if (!context) throw new Error("User profile must be used inside UserProfileProvider.");
    return context;
}
