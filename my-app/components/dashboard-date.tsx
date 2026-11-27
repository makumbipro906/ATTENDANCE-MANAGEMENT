"use client";

import {useSyncExternalStore} from "react";

function subscribe(onStoreChange: () => void) {
    const interval = window.setInterval(onStoreChange, 60_000);
    return () => window.clearInterval(interval);
}

function getDate() {
    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date());
}

function getServerDate() {
    return "Today's overview";
}

export function DashboardDate() {
    return useSyncExternalStore(subscribe, getDate, getServerDate);
}
