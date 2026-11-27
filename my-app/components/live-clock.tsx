"use client";

import { useSyncExternalStore } from "react";
import { Clock3 } from "lucide-react";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

function subscribe(onStoreChange: () => void) {
    const interval = window.setInterval(onStoreChange, 1000);
    return () => window.clearInterval(interval);
}

function getTime() {
    return timeFormatter.format(new Date());
}

function getServerTime() {
    return "--:--:--";
}

export function LiveClock() {
    const time = useSyncExternalStore(subscribe, getTime, getServerTime);

    return (
        <time aria-label={`School local time: ${time} East Africa Time`} className="topbar-clock">
            <Clock3 aria-hidden="true" size={15}/>
            <span>{time}</span>
            <small>EAT</small>
        </time>
    );
}
