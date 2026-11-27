"use client";

import Link from "next/link";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode} from "react";
import {
    Archive,
    CalendarDays,
    CalendarClock,
    ChartColumn,
    ChevronRight,
    Contact,
    CreditCard,
    Database,
    Fingerprint,
    GraduationCap,
    History,
    LayoutDashboard,
    LogOut,
    LockKeyhole,
    MessageSquareText,
    Menu,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Settings2,
    Users,
    UserRound,
    X,
    type LucideIcon,
} from "lucide-react";
import {Button} from "../ui/button";
import {Input} from "../ui/input";
import {LiveClock} from "../live-clock";
import {useStudentRecords} from "../students/student-records-provider";
import {getPermissionForPath, type SystemPermissionKey} from "@/lib/system-permissions";

type NavigationNode = {
    href?: string;
    label: string;
    icon?: LucideIcon;
    children?: NavigationNode[];
    separatorAfter?: boolean;
};

type NavigationItem = NavigationNode & {href: string; icon: LucideIcon};
type NavigationGroup = {label: string; items: NavigationItem[]};
type NavigationSearchItem = {href: string; label: string; group: string};
type AuthSession = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    roleNames: string[];
    permissions: SystemPermissionKey[];
};

const navigation: NavigationGroup[] = [
    {
        label: "Main modules",
        items: [
            {href: "/", label: "Dashboard", icon: LayoutDashboard},
            {
                href: "/students", label: "Students Management", icon: Users,
                children: [
                    {href: "/students", label: "Students list"},
                    {href: "/students/archived", label: "Archived students", icon: Archive},
                ],
            },
            {
                href: "/student-attendance/daily", label: "Students Attendance", icon: CalendarClock,
                children: [
                    {href: "/student-attendance/daily", label: "Daily Attendance", icon: CalendarDays},
                    {href: "/student-attendance/records", label: "Attendance Records", icon: Database},
                    {href: "/student-attendance/sms-dashboard", label: "SMS Dashboard", icon: MessageSquareText, separatorAfter: true},
                    {href: "/student-attendance/sms-billing", label: "SMS Billing", icon: CreditCard, separatorAfter: true},
                    {href: "/student-attendance/sms-settings", label: "SMS Settings", icon: SlidersHorizontal, separatorAfter: true},
                    {href: "/student-attendance/attendance-settings", label: "Attendance Settings", icon: Settings2},
                ],
            },
            {
                href: "/attendance/reports?report=weekly", label: "Attendance Reports", icon: CalendarClock,
                children: [
                    {href: "/attendance/reports?report=weekly", label: "Weekly Report", icon: ChartColumn},
                    {href: "/attendance/reports?report=monthly", label: "Monthly Report", icon: ChartColumn},
                    {href: "/attendance/reports?report=termly-stream", label: "Termly Stream Report", icon: ChartColumn},
                    {href: "/attendance/reports?report=termly-class", label: "Termly Class Report", icon: ChartColumn},
                    {href: "/attendance/today?report=stream-daily", label: "Stream Daily Report", icon: CalendarClock},
                    {href: "/attendance/today?report=class-daily", label: "Class Daily Report", icon: CalendarClock},
                    {href: "/alerts", label: "Absent Students", icon: CalendarClock},
                ],
            },
            {
                href: "/biometrics", label: "Students Info Tracking", icon: Fingerprint,
                children: [
                    {href: "/biometrics", label: "Biometrics tracking", icon: Fingerprint},
                    {href: "/contacts", label: "Contacts tracking", icon: Contact},
                ],
            },
            {
                href: "/settings/classes", label: "Classes Management", icon: GraduationCap,
                children: [
                    {href: "/settings/classes", label: "Classes"},
                    {href: "/settings/streams", label: "Streams"},
                    {href: "/settings/sections", label: "Sections"},
                ],
            },
            {href: "/Dashboard/users", label: "User Management", icon: Users},
            {href: "/Dashboard/roles", label: "Roles & Permissions", icon: ShieldCheck},
        ],
    },
    {
        label: "Other modules",
        items: [
            {
                href: "/settings", label: "School settings", icon: Settings2,
                children: [
                    {href: "/settings/years", label: "Academic years"},
                    {href: "/settings/terms", label: "Terms"},
                ],
            },
            {href: "/audit-log", label: "Audit log", icon: History},
        ],
    },
];

const sectionLabels: Record<string, string> = {
    students: "Students",
    biometrics: "Biometrics",
    contacts: "Contacts",
    attendance: "Attendance",
    settings: "Settings",
    alerts: "Absent Students",
    Dashboard: "Administration",
};

const routeLabels: Record<string, string> = {
    "/students": "Students List",
    "/students/archived": "Archived students",
    "/profile": "My Profile",
    "/biometrics/complete": "Biometrics complete",
    "/biometrics/missing": "Biometrics missing",
    "/contacts/complete": "Contacts complete",
    "/contacts/missing": "Contacts missing",
    "/attendance/today": "Today's attendance",
    "/attendance/reports": "Attendance reports",
    "/student-attendance/daily": "Daily Attendance",
    "/student-attendance/records": "Attendance Records",
    "/student-attendance/sms-dashboard": "SMS Dashboard",
    "/student-attendance/sms-billing": "SMS Billing",
    "/student-attendance/sms-settings": "SMS Settings",
    "/student-attendance/attendance-settings": "Attendance Settings",
    "/alerts": "Absent Students",
    "/settings/years": "Academic years",
    "/settings/terms": "Terms",
    "/settings/classes": "Classes",
    "/settings/streams": "Streams",
    "/settings/sections": "Sections",
    "/biometrics/record": "Record biometrics",
    "/contacts/record": "Record contacts",
    "/audit-log": "Audit log",
    "/Dashboard/users": "User Management",
    "/Dashboard/roles": "Roles & Permissions",
};

function flattenNavigationNodes(nodes: NavigationNode[], group: string): NavigationSearchItem[] {
    return nodes.flatMap((node) => [
        ...(node.href ? [{href: node.href, label: node.label, group}] : []),
        ...(node.children ? flattenNavigationNodes(node.children, `${group} / ${node.label}`) : []),
    ]);
}

const searchItems = [...new Map(
    navigation.flatMap((group) =>
        group.items.flatMap((item) => [
            {href: item.href, label: item.label, group: group.label},
            ...(item.children ? flattenNavigationNodes(item.children, item.label) : []),
        ]),
    ).map((item) => [item.href, item] as const),
).values()];

function renderNavigationChildren(
    nodes: NavigationNode[],
    currentHref: string,
    onNavigate: () => void,
    permissions: SystemPermissionKey[] | null,
    depth = 0,
): ReactNode {
    return (
        <div className={`nav-sub-list${depth ? " nav-sub-list-nested" : ""}`}>
            {nodes.map((node) => (
                <div className={`nav-sub-item${node.separatorAfter ? " nav-sub-item-separated" : ""}`} key={`${node.label}-${node.href ?? "group"}`}>
                    {node.href ? (
                        (() => {
                            const required = getPermissionForPath(node.href.split("?")[0]);
                            const locked = Boolean(required && permissions && !permissions.includes(required));
                            return (
                                <Link
                                    aria-current={currentHref === node.href ? "page" : undefined}
                                    aria-disabled={locked || undefined}
                                    className={`nav-sublink${currentHref === node.href ? " nav-sublink-active" : ""}${locked ? " nav-sublink-locked" : ""}`}
                                    href={node.href}
                                    onClick={(event) => {
                                        if (locked) {
                                            event.preventDefault();
                                            return;
                                        }
                                        onNavigate();
                                    }}
                                >
                                    {node.icon && <node.icon aria-hidden="true" className="nav-sub-icon" size={14}/>}
                                    {node.label}
                                    {locked && <LockKeyhole aria-label="Access locked" className="nav-lock-icon" size={12}/>}
                                </Link>
                            );
                        })()
                    ) : (
                        <span className="nav-sublink nav-subsection-label">
                            {node.icon && <node.icon aria-hidden="true" className="nav-sub-icon" size={14}/>}
                            {node.label}
                        </span>
                    )}
                    {node.children?.length
                        ? renderNavigationChildren(node.children, currentHref, onNavigate, permissions, depth + 1)
                        : null}
                </div>
            ))}
        </div>
    );
}

export function DashboardShell({children}: { children: ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const {students} = useStudentRecords();
    const [authSession, setAuthSession] = useState<AuthSession | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [logoutPending, setLogoutPending] = useState(false);
    const [logoutError, setLogoutError] = useState("");
    const [expandedNavigationItems, setExpandedNavigationItems] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [activeStudentIndex, setActiveStudentIndex] = useState(0);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchDialogRef = useRef<HTMLDialogElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const profileButtonRef = useRef<HTMLButtonElement>(null);
    const currentHref = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
    const currentSection = pathname.split("/")[1];
    const currentLabel =
        pathname === "/"
            ? "Dashboard"
                        : routeLabels[pathname] ??
                            (pathname.startsWith("/Dashboard/users/") ? "Staff profile" : sectionLabels[currentSection]) ??
                            "School";
    const activeNavigationHref = navigation
        .flatMap((group) => group.items.flatMap((item) => [
            item.href,
            ...(item.children?.flatMap((child) => [
                ...(child.href ? [child.href] : []),
                ...(child.children?.flatMap((grandchild) => grandchild.href ? [grandchild.href] : []) ?? []),
            ]) ?? []),
        ]))
        .filter((href) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)))
        .sort((first, second) => second.length - first.length)[0];

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/auth/session", {cache: "no-store", signal: controller.signal})
            .then(async (response) => {
                if (response.status === 401) {
                    router.replace("/login");
                    return null;
                }
                if (!response.ok) throw new Error("Your signed-in account could not be loaded.");
                return await response.json() as AuthSession;
            })
            .then((session) => {
                if (!controller.signal.aborted && session) setAuthSession(session);
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) console.error("Unable to load signed-in account:", error);
            });
        return () => controller.abort();
    }, [router]);

    useEffect(() => {
        let stopped = false;
        let requestInProgress = false;

        async function sendHeartbeat() {
            if (stopped || requestInProgress || document.hidden) return;
            requestInProgress = true;
            try {
                const response = await fetch("/api/auth/heartbeat", {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                });
                if (response.status === 401 && !stopped) {
                    stopped = true;
                    router.replace("/login?reason=session-expired");
                    router.refresh();
                } else if (!response.ok) {
                    console.error("Unable to verify the signed-in session.");
                }
            } catch (error) {
                if (!stopped) console.error("Unable to send the session heartbeat:", error);
            } finally {
                requestInProgress = false;
            }
        }

        void sendHeartbeat();
        const interval = window.setInterval(() => void sendHeartbeat(), 15_000);
        function handleVisibilityChange() {
            if (!document.hidden) void sendHeartbeat();
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            stopped = true;
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [router]);

    useEffect(() => {
        if (!menuOpen) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
            }
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [menuOpen]);

    useEffect(() => {
        const desktopMedia = window.matchMedia("(min-width: 961px)");

        function closeOnDesktop(event: MediaQueryListEvent) {
            if (event.matches) setMenuOpen(false);
        }

        desktopMedia.addEventListener("change", closeOnDesktop);
        return () => desktopMedia.removeEventListener("change", closeOnDesktop);
    }, []);

    useEffect(() => {
        const dialog = searchDialogRef.current;
        if (!dialog) return;

        if (searchOpen && !dialog.open) {
            dialog.showModal();
            searchInputRef.current?.focus();
        } else if (!searchOpen && dialog.open) {
            dialog.close();
        }
    }, [searchOpen]);

    useEffect(() => {
        function handleSearchShortcut(event: KeyboardEvent) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setSearchOpen(true);
            }
        }

        document.addEventListener("keydown", handleSearchShortcut);
        return () => document.removeEventListener("keydown", handleSearchShortcut);
    }, []);

    useEffect(() => {
        if (!profileOpen) return;

        function dismissProfileMenu(event: MouseEvent | KeyboardEvent) {
            if (event instanceof KeyboardEvent && event.key === "Escape") {
                setProfileOpen(false);
                profileButtonRef.current?.focus();
            } else if (
                event instanceof MouseEvent &&
                event.target instanceof Node &&
                !profileMenuRef.current?.contains(event.target)
            ) {
                setProfileOpen(false);
            }
        }

        document.addEventListener("mousedown", dismissProfileMenu);
        document.addEventListener("keydown", dismissProfileMenu);
        return () => {
            document.removeEventListener("mousedown", dismissProfileMenu);
            document.removeEventListener("keydown", dismissProfileMenu);
        };
    }, [profileOpen]);

    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    const matchingStudents = useMemo(() => students.filter((student) =>
        [
            student.fullName,
            student.admissionNumber,
            student.className,
            student.stream,
            student.guardianName,
            student.primaryPhone,
            student.studentPhone,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)),
    ).slice(0, 10), [normalizedSearch, students]);
    const matchingSearchItems = searchItems.filter((item) =>
        `${item.label} ${item.group}`.toLocaleLowerCase().includes(normalizedSearch),
    );
    const availableSearchItems = matchingSearchItems.filter((item) => {
        const permission = getPermissionForPath(item.href.split("?")[0]);
        return !permission || !authSession || authSession.permissions.includes(permission);
    });

    function openStudent(id: string) {
        setSearchOpen(false);
        router.push(`/students/${encodeURIComponent(id)}`);
    }

    function handleStudentSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown" && matchingStudents.length) {
            event.preventDefault();
            setActiveStudentIndex((index) => (index + 1) % matchingStudents.length);
        } else if (event.key === "ArrowUp" && matchingStudents.length) {
            event.preventDefault();
            setActiveStudentIndex((index) => (index - 1 + matchingStudents.length) % matchingStudents.length);
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (matchingStudents[activeStudentIndex]) {
                openStudent(matchingStudents[activeStudentIndex].id);
            } else if (availableSearchItems[0]) {
                setSearchOpen(false);
                router.push(availableSearchItems[0].href);
            }
        }
    }

    return (
        <div className="dashboard-shell">
            <button
                aria-label="Close navigation"
                aria-hidden={!menuOpen}
                className={`mobile-overlay${menuOpen ? " overlay-open" : ""}`}
                onClick={() => setMenuOpen(false)}
                tabIndex={menuOpen ? 0 : -1}
                type="button"
            />
            <aside
                aria-label="School navigation"
                className={`sidebar${menuOpen ? " sidebar-open" : ""}`}
                id="school-navigation"
            >
                <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
                    <span aria-hidden="true" className="brand-mark"><GraduationCap size={21} strokeWidth={1.8}/></span>
                    <span>
                        <span className="brand-name">Orchid School</span>
                        <span className="brand-subtitle">School management</span>
                    </span>
                </Link>
                <Link className="sidebar-profile" href="/profile" onClick={() => setMenuOpen(false)}>
                    <span aria-hidden="true" className="sidebar-profile-avatar">
                        {authSession ? `${authSession.firstName[0] ?? ""}${authSession.lastName[0] ?? ""}`.toUpperCase() : "…"}
                    </span>
                    <span className="sidebar-profile-copy">
                        <strong>{authSession ? `${authSession.firstName} ${authSession.lastName}` : "Loading account…"}</strong>
                        <small>{authSession?.roleNames.join(", ") ?? ""}</small>
                        <span>School User</span>
                    </span>
                </Link>
                <nav aria-label="Main navigation">
                    {navigation.map((group) => (
                        <div key={group.label}>
                            <p className="nav-label">{group.label}</p>
                            <div className="nav-list">
                                {group.items.map((item) => {
                                    const childActive = item.children?.some((child) =>
                                        child.href !== undefined &&
                                        (child.href.includes("?")
                                            ? currentHref === child.href
                                            : pathname === child.href || pathname.startsWith(`${child.href}/`)),
                                    ) ?? false;
                                    const active = item.href === activeNavigationHref || childActive;
                                    const required = getPermissionForPath(item.href.split("?")[0]);
                                    const locked = Boolean(required && authSession && !authSession.permissions.includes(required));
                                    const expanded = expandedNavigationItems[item.href] ?? childActive;
                                    const childrenId = `navigation-children-${item.href.replace(/[^a-z0-9]+/gi, "-")}`;
                                    return (
                                        <div className={`nav-item-group${active ? " nav-item-group-active" : ""}`} key={item.href}>
                                            <Link
                                                aria-current={active ? "page" : undefined}
                                                aria-disabled={locked || undefined}
                                                className={`nav-link${active ? " nav-link-active" : ""}${locked ? " nav-link-locked" : ""}`}
                                                href={item.href}
                                                onClick={(event) => {
                                                    if (locked) {
                                                        event.preventDefault();
                                                        return;
                                                    }
                                                    setMenuOpen(false);
                                                }}
                                            >
                                                <item.icon aria-hidden="true" className="nav-icon-svg" size={16}
                                                           strokeWidth={1.75}/>
                                                {item.label}
                                                {locked && <LockKeyhole aria-label="Access locked" className="nav-lock-icon" size={13}/>}
                                            </Link>
                                            {item.children && item.children.length > 0 && (
                                                <button
                                                    aria-expanded={expanded}
                                                    aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                                                    aria-controls={childrenId}
                                                    className={`nav-expand-button${expanded ? " is-expanded" : ""}`}
                                                    onClick={() => setExpandedNavigationItems((current) => ({
                                                        ...current,
                                                        [item.href]: !expanded,
                                                    }))}
                                                    type="button"
                                                >
                                                    <ChevronRight aria-hidden="true" size={14}/>
                                                </button>
                                            )}
                                            {item.children && item.children.length > 0 && expanded
                                                ? <div id={childrenId}>{renderNavigationChildren(item.children, currentHref, () => setMenuOpen(false), authSession?.permissions ?? null)}</div>
                                                : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>
            <div className="main-area">
                <header aria-label={`${currentLabel} toolbar`} className="topbar">
                    <Button
                        aria-expanded={menuOpen}
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                        aria-controls="school-navigation"
                        className="icon-button menu-button"
                        onClick={() => setMenuOpen(!menuOpen)}
                        ref={menuButtonRef}
                        size="icon"
                        variant="default"
                    >
                        {menuOpen ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}
                    </Button>
                    <div className="topbar-actions">
                        <LiveClock/>
                        <Button asChild aria-label="School settings" className="topbar-icon-button" size="icon" variant="ghost">
                            <Link href="/settings"><Settings2 aria-hidden="true" size={16}/></Link>
                        </Button>
                        <Button
                            aria-label="Universal search"
                            className="universal-search-button topbar-icon-button"
                            onClick={() => setSearchOpen(true)}
                            type="button"
                            variant="outline"
                        >
                            <Search aria-hidden="true" size={16}/>
                            <span className="universal-search-label">Search anything</span>
                            <kbd aria-hidden="true">Ctrl / ⌘ K</kbd>
                        </Button>
                        <div className="profile-menu-container" ref={profileMenuRef}>
                            <Button
                                aria-expanded={profileOpen}
                                aria-haspopup="menu"
                                aria-label="Open profile menu"
                                className="topbar-profile-button"
                                onClick={() => setProfileOpen((open) => !open)}
                                ref={profileButtonRef}
                                size="icon"
                                type="button"
                                variant="ghost"
                            >
                                <UserRound aria-hidden="true" size={17}/>
                            </Button>
                            {profileOpen && (
                                <div aria-label="Profile menu" className="profile-menu" role="menu">
                                    <div className="profile-menu-account">
                                        <span aria-hidden="true" className="profile-menu-avatar">
                                            <UserRound size={18}/>
                                        </span>
                                        <span className="profile-menu-account-copy">
                                            <strong>{authSession ? `${authSession.firstName} ${authSession.lastName}` : "Signed-in user"}</strong>
                                            <small>{authSession?.roleNames.join(", ") ?? ""}</small>
                                        </span>
                                    </div>
                                    <div className="profile-menu-links">
                                        <Link
                                            className="profile-menu-item"
                                            href="/profile"
                                            onClick={() => setProfileOpen(false)}
                                            role="menuitem"
                                        >
                                            <UserRound aria-hidden="true" size={14}/>My Profile
                                        </Link>
                                        <Link
                                            className="profile-menu-item"
                                            href="/settings"
                                            onClick={() => setProfileOpen(false)}
                                            role="menuitem"
                                        >
                                            <Settings2 aria-hidden="true" size={14}/>Settings
                                        </Link>
                                    </div>
                                    <div className="profile-menu-logout">
                                        <button
                                            className="profile-menu-item"
                                            disabled={logoutPending}
                                            role="menuitem"
                                            onClick={async () => {
                                                if (logoutPending) return;
                                                setLogoutPending(true);
                                                setLogoutError("");
                                                try {
                                                    const response = await fetch("/api/auth/logout", {
                                                        method: "POST",
                                                        credentials: "same-origin",
                                                        cache: "no-store",
                                                    });
                                                    if (!response.ok) {
                                                        throw new Error("The server could not end your session.");
                                                    }
                                                    router.replace("/login");
                                                    router.refresh();
                                                } catch (error) {
                                                    console.error("Unable to sign out:", error);
                                                    setLogoutError("Logout failed. Check your connection and try again.");
                                                    setLogoutPending(false);
                                                }
                                            }}
                                            type="button"
                                        >
                                            <LogOut aria-hidden="true" size={14}/>
                                            {logoutPending ? "Logging out..." : "Logout"}
                                        </button>
                                        {logoutError && <small aria-live="polite" className="profile-menu-error">{logoutError}</small>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                <main>{children}</main>
            </div>
            <dialog
                aria-labelledby="universal-search-title"
                className="universal-search-dialog"
                onClose={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                }}
                ref={searchDialogRef}
                style={{
                    position: "fixed",
                    inset: "50% auto auto 50%",
                    width: "min(720px, calc(100vw - 32px))",
                    maxWidth: "none",
                    maxHeight: "min(78vh, 620px)",
                    margin: 0,
                    transform: "translate(-50%, -50%)",
                }}
            >
                <h2 className="visually-hidden" id="universal-search-title">Search Orchid School</h2>
                <form className="universal-search-form" onSubmit={(event) => event.preventDefault()} role="search">
                    <Search aria-hidden="true" size={18}/>
                    <Input
                        aria-activedescendant={matchingStudents[activeStudentIndex]
                            ? `student-search-option-${matchingStudents[activeStudentIndex].id}`
                            : undefined}
                        aria-autocomplete="list"
                        aria-controls="universal-search-results"
                        aria-expanded="true"
                        aria-label="Search students by name, admission number, class or guardian"
                        autoComplete="off"
                        className="universal-search-input"
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setActiveStudentIndex(0);
                        }}
                        onKeyDown={handleStudentSearchKeyDown}
                        placeholder="Search students by name, reg no, LIN or payment code..."
                        ref={searchInputRef}
                        role="combobox"
                        value={searchQuery}
                    />
                    <kbd aria-hidden="true">Esc</kbd>
                </form>
                <div aria-live="polite" className="universal-search-results" id="universal-search-results" role="listbox">
                    {matchingStudents.map((student, index) => (
                        <Link
                            aria-selected={index === activeStudentIndex}
                            className={`universal-search-student${index === activeStudentIndex ? " is-active" : ""}`}
                            href={`/students/${encodeURIComponent(student.id)}`}
                            id={`student-search-option-${student.id}`}
                            key={student.id}
                            onClick={() => setSearchOpen(false)}
                            onMouseEnter={() => setActiveStudentIndex(index)}
                            role="option"
                        >
                            <span aria-hidden="true" className="universal-search-avatar">
                                {student.fullName.split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase()}
                            </span>
                            <span className="universal-search-student-copy">
                                <strong>{student.fullName}</strong>
                                <small>{student.admissionNumber} · {student.className} · {student.stream}</small>
                            </span>
                            {student.status === "Archived" && <span className="universal-search-archived">Archived</span>}
                            <span className="universal-search-section">{student.section}</span>
                            <span aria-hidden="true" className="universal-search-chevron">›</span>
                        </Link>
                    ))}
                    {normalizedSearch && matchingStudents.length === 0 && matchingSearchItems.length === 0 && (
                        <p className="universal-search-empty">No matching students or pages.</p>
                    )}
                    {normalizedSearch && matchingSearchItems.length > 0 && (
                        <div className="universal-search-pages" aria-label="Matching pages">
                            <span className="universal-search-pages-label">Pages</span>
                            {matchingSearchItems.slice(0, 4).map((item) => (
                                (() => {
                                    const permission = getPermissionForPath(item.href.split("?")[0]);
                                    const locked = Boolean(permission && authSession && !authSession.permissions.includes(permission));
                                    return (
                                        <Link
                                            aria-disabled={locked || undefined}
                                            className={`universal-search-page${locked ? " universal-search-page-locked" : ""}`}
                                            href={item.href}
                                            key={item.href}
                                            onClick={(event) => {
                                                if (locked) {
                                                    event.preventDefault();
                                                    return;
                                                }
                                                setSearchOpen(false);
                                            }}
                                        >
                                            <span>{item.label}</span><small>{item.group}</small>
                                            {locked && <LockKeyhole aria-label="Access locked" size={13}/>}
                                        </Link>
                                    );
                                })()
                            ))}
                        </div>
                    )}
                </div>
                <div className="universal-search-footer">
                    <span className="universal-search-count">
                        {matchingStudents.length} {matchingStudents.length === 1 ? "result" : "results"}
                    </span>
                    <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                    <span><kbd>↵</kbd> Open</span>
                </div>
            </dialog>
        </div>
    );
}
