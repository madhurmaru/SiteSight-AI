"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  ShieldCheck,
  GitCompareArrows,
  FileText,
  MessageSquare,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Bell,
  MapPin,
  CalendarDays,
  Check,
  Clock,
  TriangleAlert,
  X,
  HardHat,
  LogOut,
  Download,
  Eye,
  ZoomIn,
  ZoomOut,
  Layers,
  ChevronLeft,
  CheckCircle2,
  RefreshCw,
  Upload,
  Camera,
  SlidersHorizontal,
  CheckCheck,
  Move,
  Send,
  ExternalLink,
  Menu,
  Activity,
  Info,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  StateData,
  SessionData,
  InspectionData,
  FindingData,
} from "@/lib/types";
import { progress, planned, allowed } from "@/lib/domain";
import type { Claim } from "@/lib/reports";
const nav = [
  ["Overview", LayoutDashboard],
  ["Projects", Building2],
  ["Inspections", ClipboardCheck],
  ["Progress comparison", GitCompareArrows],
  ["Reports", FileText],
  ["Ask SiteSight", MessageSquare],
] as const;
const date = (v: Date | string, short = false) =>
  new Date(v).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(short ? {} : { year: "numeric" }),
  });
const time = (v: Date | string) =>
  new Date(v).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const s = String(children).toLowerCase();
  return (
    <span
      className={
        "badge " +
        (tone ||
          (/approved|reviewed|confirmed|resolved|present/.test(s)
            ? "green"
            : /proposed|pending|ready|progress|draft/.test(s)
              ? "amber"
              : /failed/.test(s)
                ? "red"
                : "neutral"))
      }
    >
      <i />
      {children}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <ClipboardCheck size={30} />
      <h3>{title}</h3>
      <p>{children || "Records will appear here when your team adds them."}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
async function request<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {},
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Request failed");
  return result;
}
const pageRoutes: Record<string, string> = {
  Overview: "/dashboard",
  Projects: "/projects",
  "Project summary": "/projects/summary",
  Inspections: "/inspections",
  "Progress comparison": "/progress",
  Reports: "/reports",
  "Ask SiteSight": "/ask",
  Settings: "/settings",
};

export default function WorkspaceApp({
  initialPage = "Overview",
  initialSelected = "",
}: {
  initialPage?: string;
  initialSelected?: string;
}) {
  const router = useRouter();
  const handledLaunch = useRef(false);
  const [session, setSession] = useState<SessionData | null>(null),
    [data, setData] = useState<StateData | null>(null),
    [projectId, setProjectId] = useState(""),
    [page, setPage] = useState(initialPage),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(initialSelected),
    [drawer, setDrawer] = useState<FindingData | null>(null),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false);
  const loadSession = useCallback(async () => {
    try {
      const s = await request<SessionData>("session");
      setSession(s);
      setProjectId((p) => p || s.projects[0]?.id || "");
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadSession();
  }, [loadSession]);
  useEffect(() => {
    setPage(initialPage);
    setSelected(initialSelected);
  }, [initialPage, initialSelected]);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setData(await request<StateData>(`projects/${projectId}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId]);
  useEffect(() => {
    setData(null);
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (
      !data?.inspections.some((i) =>
        [
          "queued",
          "retrying",
          "preprocessing",
          "detection",
          "finding generation",
        ].includes(i.status),
      )
    )
      return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [data, refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!session || !data || handledLaunch.current) return;
    const requested = new URLSearchParams(window.location.search).get("new");
    if (requested === "project" || requested === "inspection") {
      handledLaunch.current = true;
      setModal(requested);
    }
  }, [data, session]);
  const mutate = async (
    path: string,
    body: unknown,
    success = "Changes saved",
    method?: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      const r = await request(`projects/${projectId}/${path}`, body, method);
      await refresh();
      setToast(success);
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safe = (fn: () => Promise<unknown>) => {
    void fn().catch(() => {});
  };
  const go = (p: string, id?: string) => {
    setPage(p);
    if (id) setSelected(id);
    setMobile(false);
    setError("");
    router.push(
      p === "Review" && id
        ? `/inspections/${encodeURIComponent(id)}`
        : pageRoutes[p] || "/dashboard",
    );
  };
  if (loading)
    return (
      <div className="login">
        <div className="spinner" />
        Loading SiteSight…
      </div>
    );
  if (!session) return <Login onLogin={loadSession} />;
  const role = data?.role || "viewer";
  const current =
    data?.inspections.find((i) => i.id === selected) || data?.inspections[0];
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Link
          className="brand brand-logo"
          href="/"
          aria-label="SiteSight AI home"
        >
          <Image
            src="/logo.png"
            alt="SiteSight AI"
            width={2172}
            height={724}
            priority
          />
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Building2 size={19} />
          </span>
          <div>
            <strong>Buildwell Construction</strong>
            <small>Project workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">PROJECT MANAGEMENT</div>
        <nav>
          {nav.map(([title, Icon]) => (
            <button
              key={title}
              onClick={() => go(title)}
              className={
                (page === title ||
                (page === "Review" && title === "Inspections")
                  ? "active "
                  : "") + (title === "Inspections" ? "nav-child" : "")
              }
            >
              <Icon size={19} />
              <span>{title}</span>
              {title === "Inspections" &&
                !!data?.inspections.filter((i) => i.status === "ready")
                  .length && (
                  <b>
                    {
                      data.inspections.filter((i) => i.status === "ready")
                        .length
                    }
                  </b>
                )}
              {title === "Ask SiteSight" && <span className="tiny-ai">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="principle">
            <span>
              <ShieldCheck size={18} /> Built for human oversight
            </span>
            <p>
              AI detects and explains.
              <br />
              Engineers verify and decide.
            </p>
          </div>
          <button
            className={page === "Settings" ? "active" : ""}
            onClick={() => go("Settings")}
          >
            <Settings size={19} />
            Settings
          </button>
          <div className="profile">
            <span className="avatar">
              {session.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>
                {role === "admin"
                  ? "Project administrator"
                  : role === "safety"
                    ? "Safety officer"
                    : role}
              </small>
            </div>
            <button
              title="Sign out"
              className="icon"
              onClick={() =>
                safe(async () => {
                  await request("auth/logout", {});
                  setSession(null);
                  setData(null);
                  setProjectId("");
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <Building2 size={16} />
            <span>Projects</span>
            <ChevronRight size={14} />
            <select
              aria-label="Current project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {session.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronRight size={14} />
            <strong>{page === "Review" ? "Evidence review" : page}</strong>
          </div>
          <div className="top-actions">
            <span className="environment">
              <i />
              {session.mode === "demo" ? "Local workspace" : "Connected mode"}
            </span>
            <button
              className="icon notification-button"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              {data?.notifications.some((n) => !n.read) && <i />}
            </button>
            <span className="avatar small">
              {session.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
          </div>
        </header>
        {notifications && (
          <div className="notification-panel">
            <div className="panel-title">
              <h3>Notifications</h3>
              <button
                className="text-button"
                onClick={() =>
                  safe(() =>
                    mutate("notifications", {}, "Notifications marked read"),
                  )
                }
              >
                Mark read
              </button>
            </div>
            {data?.notifications.length ? (
              data.notifications.map((n) => (
                <div key={n.id}>
                  <p>{n.message}</p>
                  <small>
                    {date(n.createdAt)} · {time(n.createdAt)}
                  </small>
                </div>
              ))
            ) : (
              <p>No new notifications.</p>
            )}
          </div>
        )}
        <main>
          {error && (
            <div className="alert red" role="alert">
              <TriangleAlert size={18} />
              {error}
              <button className="icon" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="empty">
              <div className="spinner" />
              Loading project records…
              {error && <button onClick={refresh}>Try again</button>}
            </div>
          ) : (
            <>
              {page !== "Review" && (
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {page === "Overview"
                        ? "YOUR SITE, IN FOCUS"
                        : data.project.name.toUpperCase()}
                    </div>
                    <h1>{page === "Overview" ? "Project overview" : page}</h1>
                    <p>
                      {
                        (
                          {
                            Overview:
                              "A clear picture of progress. Every observation backed by evidence.",
                            Projects:
                              "The people, places and milestones behind your project.",
                            "Project summary":
                              "A live report of inspections, achieved milestones and verified progress.",
                            Inspections:
                              "Capture site conditions. Turn evidence into reviewed records.",
                            "Safety findings":
                              "Verify observations, assign ownership and track resolution.",
                            "Progress comparison":
                              "Compare visible work. Record engineering judgement.",
                            Reports:
                              "Evidence-backed records, ready for professional review.",
                            "Ask SiteSight":
                              "Answers grounded in your authorised project records.",
                            Settings:
                              "Manage your workspace and connected services.",
                          } as Record<string, string>
                        )[page]
                      }
                    </p>
                  </div>
                  <div className="heading-actions">
                    {page === "Overview" && (
                      <button
                        className="secondary"
                        onClick={() => go("Reports")}
                      >
                        <FileText size={16} />
                        View reports
                      </button>
                    )}
                    {["Overview", "Inspections"].includes(page) &&
                      allowed(role, "upload") && (
                        <button onClick={() => setModal("inspection")}>
                          <Plus size={18} />
                          New inspection
                        </button>
                      )}
                    {page === "Projects" && (
                      <>
                        <button
                          className="secondary"
                          onClick={() => go("Project summary")}
                        >
                          <FileText size={16} />
                          See full project summary
                        </button>
                        <button onClick={() => setModal("project")}>
                          <Plus size={17} />
                          New project
                        </button>
                      </>
                    )}
                    {page === "Reports" && (
                      <button
                        className="secondary"
                        onClick={() => go("Project summary")}
                      >
                        <FileText size={16} />
                        See full project summary
                      </button>
                    )}
                  </div>
                </div>
              )}
              {page === "Overview" &&
                (role === "viewer" ? (
                  <>
                    <div className="notice">
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Approved project information</strong>
                        <p>
                          Your access includes approved report snapshots and
                          their supporting evidence.
                        </p>
                      </div>
                    </div>
                    <Reports data={data} mutate={mutate} safe={safe} go={go} />
                  </>
                ) : (
                  <Overview data={data} go={go} />
                ))}
              {page === "Inspections" &&
                (role === "viewer" ? (
                  <Empty title="Approved reports are your source of project information">
                    Inspection workspaces contain unverified records and are
                    restricted to project staff.
                  </Empty>
                ) : (
                  <Inspections
                    data={data}
                    go={go}
                    add={() => setModal("inspection")}
                  />
                ))}
              {page === "Review" &&
                (role === "viewer" ? (
                  <Empty title="This evidence review requires a project staff role" />
                ) : current ? (
                  <Review
                    key={current.id}
                    inspection={current}
                    data={data}
                    mutate={mutate}
                    safe={safe}
                    back={() => go("Inspections")}
                    onProgress={() => setModal("progress")}
                  />
                ) : (
                  <Empty title="No inspections yet" />
                ))}
              {page === "Projects" && (
                <Projects
                  data={data}
                  edit={() => setModal("edit-project")}
                  addZone={() => setModal("zone")}
                  addMilestone={() => setModal("milestone")}
                  progress={() => setModal("progress")}
                />
              )}
              {page === "Project summary" && (
                <ProjectSummary data={data} go={go} />
              )}
              {page === "Progress comparison" &&
                (role === "viewer" ? (
                  <Empty title="Comparison requires project staff access" />
                ) : (
                  <Comparison
                    data={data}
                    mutate={mutate}
                    safe={safe}
                    progress={() => setModal("progress")}
                  />
                ))}
              {page === "Reports" && (
                <Reports data={data} mutate={mutate} safe={safe} go={go} />
              )}
              {page === "Ask SiteSight" && (
                <Ask projectId={projectId} go={go} data={data} />
              )}
              {page === "Settings" && (
                <SettingsPage
                  data={data}
                  session={session}
                  mutate={mutate}
                  safe={safe}
                  onRole={async (role) => {
                    await request("auth/login", {
                      email: role + "@sitesight.local",
                      password: "SiteSight2026!",
                    });
                    setProjectId("");
                    await loadSession();
                    await refresh();
                  }}
                />
              )}
              <footer>
                <span>
                  <ShieldCheck size={14} /> Engineer-verified. Evidence-linked.
                </span>
                <span>
                  SiteSight AI ·{" "}
                  {session.mode === "demo"
                    ? "Synthetic fixture analysis"
                    : "Connected workspace"}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {modal && data && (
        <FormModal
          mode={session.mode}
          type={modal}
          data={data}
          busy={busy}
          close={() => setModal("")}
          submit={async (body) => {
            if (modal === "project") {
              const p = await request<{ id: string }>("projects", body);
              await loadSession();
              setProjectId(p.id);
              setToast("Project created");
            } else
              await mutate(
                (
                  {
                    inspection: "inspections",
                    report: "reports",
                    progress: "progress",
                    zone: "zones",
                    milestone: "milestones",
                    "edit-project": "",
                  } as Record<string, string>
                )[modal],
                body,
                modal === "inspection"
                  ? "Inspection uploaded and queued"
                  : "Saved",
                modal === "edit-project" ? "PATCH" : undefined,
              );
            setModal("");
            if (modal === "inspection") go("Inspections");
          }}
        />
      )}
      {drawer && data && (
        <FindingDrawer
          finding={data.findings.find((f) => f.id === drawer.id) || drawer}
          data={data}
          close={() => setDrawer(null)}
          mutate={mutate}
          safe={safe}
          go={go}
        />
      )}
      {page !== "Ask SiteSight" && (
        <button
          className="chatbot-fab"
          onClick={() => go("Ask SiteSight")}
          aria-label="Talk to SiteSight chatbot"
        >
          <MessageSquare size={18} />
          Talk to SiteSight
        </button>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [isDemo, setIsDemo] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ mode: string }>("mode")
      .then((r) => {
        if (r.mode === "demo") {
          setIsDemo(true);
          setEmail("admin@sitesight.local");
          setPassword("SiteSight2026!");
        }
      })
      .catch(() =>
        setError(
          "Workspace connection unavailable. Check the server and try signing in again.",
        ),
      );
  }, []);
  return (
    <div className="login-screen">
      <div className="login-story">
        <div className="brand brand-logo login-logo">
          <Image
            src="/logo.png"
            alt="SiteSight AI"
            width={2172}
            height={724}
            priority
          />
        </div>
        <div>
          <span className="eyebrow">CLARITY AT EVERY STAGE</span>
          <h1>
            From site evidence
            <br />
            to confident decisions.
          </h1>
          <p>
            A shared workspace for construction progress,
            <br />
            PPE review and accountable reporting.
          </p>
          <div className="login-principles">
            <span>
              <Camera /> Capture what matters
            </span>
            <span>
              <ShieldCheck /> Verify with expertise
            </span>
            <span>
              <FileText /> Report with confidence
            </span>
          </div>
        </div>
        <small>AI detects and explains. Engineers verify and decide.</small>
      </div>
      <div className="login-form">
        <span className="eyebrow">WELCOME TO SITESIGHT</span>
        <h2>Your site. In sight.</h2>
        <p>Sign in to your project workspace.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await request("auth/login", { email, password });
              await onLogin();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <div className="alert red">{error}</div>}
          <button disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in to workspace"}
            <ArrowRight size={18} />
          </button>
        </form>
        {isDemo && (
          <div className="demo-login">
            <strong>Explore the sample workspace</strong>
            <p>
              Fictional project, persistent records and clearly labelled
              synthetic analysis.
            </p>
            <div>
              {["admin", "engineer", "safety", "viewer"].map((r) => (
                <button
                  className="secondary"
                  key={r}
                  onClick={() => {
                    setEmail(r + "@sitesight.local");
                    setPassword("SiteSight2026!");
                  }}
                >
                  {r === "safety" ? "Safety officer" : r}
                </button>
              ))}
            </div>
            <small>Sample password: SiteSight2026!</small>
          </div>
        )}
      </div>
    </div>
  );
}
function Overview({
  data,
  go,
}: {
  data: StateData;
  go: (p: string, id?: string) => void;
}) {
  const ms = data.project.milestones,
    total = progress(ms),
    backlog = data.inspections.filter((i) => i.status === "ready").length,
    reportBacklog = data.reports.filter(
      (report) =>
        report.inspectionId && report.versions[0]?.status !== "approved",
    ).length,
    evidenceCount = data.inspections.reduce(
      (sum, inspection) => sum + inspection.media.length,
      0,
    ),
    latest = data.inspections[0],
    nextReview =
      data.inspections.find((i) => i.status === "ready") || data.inspections[0];
  const chart = data.inspections
    .slice()
    .reverse()
    .map((i) => ({
      date: date(i.captureTime, true),
      inspections: 1,
      reviewed: i.status === "reviewed" ? 1 : 0,
    }))
    .reduce<{ date: string; inspections: number; reviewed: number }[]>(
      (a, r) => {
        const prev = a.at(-1);
        a.push({
          ...r,
          inspections: (prev?.inspections || 0) + 1,
          reviewed: (prev?.reviewed || 0) + r.reviewed,
        });
        return a;
      },
      [],
    );
  return (
    <>
      <div className="project-strip">
        <div className="project-emblem">
          <Building2 size={24} />
        </div>
        <div>
          <div className="inline">
            <h2>{data.project.name}</h2>
            <Badge tone="green">Active project</Badge>
          </div>
          <div className="meta">
            <span>
              <MapPin size={13} />
              {data.project.location}
            </span>
            <span>
              <CalendarDays size={13} />
              {date(data.project.startDate, true)} –{" "}
              {date(data.project.targetDate)}
            </span>
            <span>{data.project.zones.length} zones</span>
          </div>
        </div>
        <button className="text-button" onClick={() => go("Projects")}>
          Project details <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="stats-grid">
        <Stat
          label="Verified progress"
          value={total === null ? "—" : total.toFixed(1) + "%"}
          icon={<Building2 size={19} />}
          title="Sum of milestone weight × engineer-verified completion, divided by total positive weight."
          detail="Weighted milestone completion"
          tone="orange"
        >
          <div className="progress-track">
            <i style={{ width: (total || 0) + "%" }} />
          </div>
        </Stat>
        <Stat
          label="Inspections to review"
          value={String(backlog).padStart(2, "0")}
          icon={<ClipboardCheck size={19} />}
          detail="Analysed inspections awaiting review"
          tone="blue"
        >
          <button className="stat-link" onClick={() => go("Inspections")}>
            Open review queue <ArrowRight size={13} />
          </button>
        </Stat>
        <Stat
          label="Reports awaiting approval"
          value={String(reportBacklog).padStart(2, "0")}
          icon={<FileText size={19} />}
          detail="Inspection report drafts and pending approvals"
          tone="amber"
        >
          <button className="stat-link" onClick={() => go("Reports")}>
            Review reports <ArrowRight size={13} />
          </button>
        </Stat>
        <Stat
          label="Stored evidence"
          value={String(evidenceCount).padStart(2, "0")}
          icon={<Layers size={19} />}
          detail="Private images and sampled video frames"
          tone="amber"
        >
          <span className="subtle">Counts stored inspection evidence</span>
        </Stat>
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Inspection activity</h2>
              <p>Evidence captured and reviewed over time</p>
            </div>
            <span className="period">
              {latest
                ? new Date(latest.captureTime).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  })
                : "No inspections"}
            </span>
          </div>
          <div className="chart-legend">
            <span>
              <i className="orange-dot" />
              Uploaded inspections
            </span>
            <span>
              <i className="blue-dot" />
              Reviewed inspections
            </span>
            <small>Cumulative count</small>
          </div>
          <div className="chart">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chart}
                  margin={{ top: 20, right: 15, left: -25, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 5"
                    vertical={false}
                    stroke="#e9ecee"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#88929b" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#88929b" }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e6e8ea",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    name="Uploaded"
                    dataKey="inspections"
                    stroke="#df6b36"
                    fill="#fcf1e9"
                    strokeWidth={2.5}
                  />
                  <Area
                    type="monotone"
                    name="Reviewed"
                    dataKey="reviewed"
                    stroke="#6b8ea5"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="No inspection activity yet" />
            )}
          </div>
          <div className="chart-foot">
            <Info size={14} /> Counts reflect stored inspections, not live site
            monitoring.
          </div>
        </section>
        <section className="panel attention">
          <div className="panel-title">
            <div>
              <h2>Needs your attention</h2>
              <p>Turn observations into next steps</p>
            </div>
            <span className="count">
              {(backlog > 0 ? 1 : 0) +
                ms.filter((m) => m.completion < (planned(m) || 0)).length}
            </span>
          </div>
          {backlog > 0 && (
            <button
              className="attention-row"
              onClick={() => go("Review", nextReview?.id)}
            >
              <span className="attention-icon amber-bg">
                <ClipboardCheck size={18} />
              </span>
              <div>
                <strong>{backlog} inspection awaiting review</strong>
                <p>{latest?.zone.name} · Latest evidence ready</p>
                <small className="amber-text">Review required</small>
              </div>
              <ChevronRight size={16} />
            </button>
          )}
          {ms
            .filter((m) => m.completion < (planned(m) || 0))
            .map((m) => (
              <button
                className="attention-row"
                onClick={() => go("Projects")}
                key={m.id}
              >
                <span className="attention-icon blue-bg">
                  <Clock size={18} />
                </span>
                <div>
                  <strong>{m.name}</strong>
                  <p>
                    {Math.round((planned(m) || 0) - m.completion)} points below
                    linear baseline
                  </p>
                  <small>As of {date(new Date(), true)}</small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
        </section>
      </div>
      <div className="overview-grid lower">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Recent inspections</h2>
              <p>Your latest site evidence, in one place</p>
            </div>
            <button className="text-button" onClick={() => go("Inspections")}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>INSPECTION</th>
                  <th>ZONE / CAPTURED</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.inspections.slice(0, 4).map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => go("Review", i.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && go("Review", i.id)}
                  >
                    <td>
                      <div className="inspection-cell">
                        <img
                          alt="Synthetic construction evidence"
                          src={"/api/media/" + i.media[0]?.id}
                        />
                        <div>
                          <strong>{i.title.split(" · ")[1] || i.title}</strong>
                          <small>{i.id.slice(0, 12)}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{i.zone.name.split(" · ")[0]}</strong>
                      <small>
                        {date(i.captureTime, true)} · {time(i.captureTime)}
                      </small>
                    </td>
                    <td>
                      <Badge>
                        {i.status === "ready" ? "Awaiting review" : i.status}
                      </Badge>
                    </td>
                    <td>
                      <ChevronRight size={15} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.inspections.length && <Empty title="No inspections yet" />}
        </section>
        <section className="panel summary">
          <div className="panel-title">
            <div className="inline">
              <span className="summary-icon">
                <Layers size={18} />
              </span>
              <h2>Project briefing</h2>
            </div>
            <span className="mini-tag">RECORDS</span>
          </div>
          <h3>A grounded view of your site.</h3>
          <p>
            Engineer-verified progress stands at{" "}
            <strong>{total?.toFixed(1) || "0"}%</strong> across {ms.length}{" "}
            weighted milestones. {backlog} inspection{backlog === 1 ? "" : "s"}{" "}
            {backlog === 1 ? "awaits" : "await"} review.
          </p>
          <div className="briefing-line">
            <span className="small-check">
              <Check size={13} />
            </span>
            <span>
              {ms.filter((m) => m.completion === 100).length} milestone
              completed and verified
            </span>
          </div>
          <div className="briefing-line">
            <span className="small-check amber">
              <Clock size={13} />
            </span>
            <span>{reportBacklog} inspection reports await approval</span>
          </div>
          <div className="compliance">
            <span>
              Approved inspection reports <Info size={12} />
            </span>
            <strong>
              {
                data.reports.filter(
                  (report) =>
                    report.inspectionId &&
                    report.versions[0]?.status === "approved",
                ).length
              }
            </strong>
            <small>
              Client-visible records are limited to approved report snapshots.
            </small>
          </div>
          <button className="text-button" onClick={() => go("Ask SiteSight")}>
            Ask about this project <ArrowUpRight size={15} />
          </button>
          <small className="summary-note">
            Based on stored records ·{" "}
            {latest ? date(latest.captureTime) : "No evidence yet"}
          </small>
        </section>
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  tone,
  children,
  title,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="stat" title={title}>
      <div className="stat-top">
        <span>{label}</span>
        <span className={"stat-icon " + tone}>{icon}</span>
      </div>
      <strong className="stat-number">{value}</strong>
      <p>{detail}</p>
      {children}
    </section>
  );
}
function Inspections({
  data,
  go,
  add,
}: {
  data: StateData;
  go: (p: string, id?: string) => void;
  add: () => void;
}) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [zone, setZone] = useState("all"),
    [from, setFrom] = useState("");
  const items = data.inspections.filter(
    (i) =>
      (i.title + " " + i.id).toLowerCase().includes(q.toLowerCase()) &&
      (status === "all" || i.status === status) &&
      (zone === "all" || i.zoneId === zone) &&
      (!from || +new Date(i.captureTime) >= +new Date(from)),
  );
  return (
    <>
      <div className="filter-bar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search inspections"
            placeholder="Search inspections…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter zone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="all">All zones</option>
          {data.project.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter review status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {["ready", "reviewed", "queued", "failed", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Captured on or after"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>{items.length} inspections</span>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>INSPECTION</th>
                <th>ZONE & VIEWPOINT</th>
                <th>CAPTURED</th>
                <th>EVIDENCE</th>
                <th>REVIEW STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <button
                      className="table-link"
                      onClick={() => go("Review", i.id)}
                    >
                      <div className="inspection-cell">
                        <img
                          alt="Inspection evidence thumbnail"
                          src={"/api/media/" + i.media[0]?.id}
                        />
                        <div>
                          <strong>{i.title}</strong>
                          <small>{i.id.slice(0, 16)}</small>
                        </div>
                      </div>
                    </button>
                  </td>
                  <td>
                    <strong>{i.zone.name}</strong>
                    <small>{i.viewpoint || "Viewpoint not recorded"}</small>
                  </td>
                  <td>
                    {date(i.captureTime)}
                    <small>{time(i.captureTime)}</small>
                  </td>
                  <td>
                    {i.media.length} images
                    <small>
                      {i.media.some((m) => m.fixture)
                        ? "Labelled fixtures"
                        : "Uploaded media"}
                    </small>
                  </td>
                  <td>
                    <Badge>
                      {i.status === "ready" ? "Awaiting review" : i.status}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="icon"
                      aria-label={"Open " + i.title}
                      onClick={() => go("Review", i.id)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <Empty title="No inspections match this view">
            <button onClick={add}>New inspection</button>
          </Empty>
        )}
      </div>
    </>
  );
}
type Mutate = (
  path: string,
  body: unknown,
  success?: string,
  method?: string,
) => Promise<unknown>;
type Safe = (fn: () => Promise<unknown>) => void;
function Review({
  inspection: i,
  data,
  mutate,
  safe,
  back,
  onProgress,
}: {
  inspection: InspectionData;
  data: StateData;
  mutate: Mutate;
  safe: Safe;
  back: () => void;
  onProgress: () => void;
}) {
  const [mediaIndex, setMediaIndex] = useState(0),
    [selected, setSelected] = useState(""),
    [overlay, setOverlay] = useState(true),
    [zoom, setZoom] = useState(1),
    [filter, setFilter] = useState("all"),
    [confidence, setConfidence] = useState(0.5),
    [comment, setComment] = useState(""),
    [edit, setEdit] = useState(false),
    [title, setTitle] = useState(""),
    [assessment, setAssessment] = useState("missing"),
    [tab, setTab] = useState("Summary"),
    [manual, setManual] = useState(false),
    [humanObservation, setHumanObservation] = useState(i.humanObservation),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const media = i.media[mediaIndex] || i.media[0],
    findings = i.findings.filter((f) => f.mediaId === media?.id),
    finding = i.findings.find((f) => f.id === selected) || findings[0],
    can = allowed(data.role, "review");
  const detections = i.media.flatMap((item) => item.detections);
  const count = (name: string) =>
    detections.filter((detection) => detection.class === name).length;
  const potentialViolations = i.findings.filter(
    (finding) => finding.assessment === "missing",
  ).length;
  const unableToAssess = i.findings.filter(
    (finding) => finding.assessment === "unknown",
  ).length;
  const pick = (f: FindingData) => {
    setSelected(f.id);
    setMediaIndex(i.media.findIndex((m) => m.id === f.mediaId));
    setComment("");
    setEdit(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const review = (action: string) =>
    safe(async () => {
      if (!comment.trim()) throw new Error("Add a reviewer comment");
      await mutate("findings", {
        findingId: finding?.id,
        action,
        comment,
        ...(action === "correct" ? { title, assessment } : {}),
      });
      setComment("");
      setEdit(false);
    });
  return (
    <>
      <div className="review-heading">
        <button className="text-button" onClick={back}>
          <ChevronLeft size={16} />
          All inspections
        </button>
        <div className="inline">
          <Badge>{i.status === "ready" ? "Awaiting review" : i.status}</Badge>
          <span className="subtle">{i.id.slice(0, 16)}</span>
        </div>
      </div>
      <div className="page-heading">
        <div>
          <h1>{i.title}</h1>
          <p>
            {i.zone.name} <span className="dot-separator">·</span> Captured{" "}
            {date(i.captureTime)} at {time(i.captureTime)}{" "}
            <span className="dot-separator">·</span> {i.viewpoint}
          </p>
        </div>
        {allowed(data.role, "progress") && (
          <button className="secondary" onClick={onProgress}>
            <Plus size={16} />
            Progress update
          </button>
        )}
      </div>
      {i.media.some((m) => m.fixture) && (
        <div className="fixture-banner">
          <Info size={16} />
          <strong>Fixture evidence</strong> Synthetic site illustration with
          deterministic fixture detections. No real model accuracy is implied.
        </div>
      )}
      {i.job?.status === "failed" && (
        <div className="alert red">
          <TriangleAlert size={20} />
          <div>
            <strong>Analysis could not complete</strong>
            <p>{i.job.error}</p>
            {i.job.error?.includes("Python inference worker") && (
              <small>
                Keep both <code>npm run worker:inference</code> and{" "}
                <code>npm run worker</code> running in separate terminals, then
                retry this inspection.
              </small>
            )}
          </div>
          {allowed(data.role, "upload") && (
            <button
              className="secondary"
              onClick={() =>
                safe(() =>
                  mutate(
                    "inspections/" + i.id,
                    { action: "retry" },
                    "Analysis queued for retry",
                  ),
                )
              }
            >
              <RefreshCw size={15} />
              Retry
            </button>
          )}
        </div>
      )}
      {[
        "queued",
        "retrying",
        "preprocessing",
        "detection",
        "finding generation",
      ].includes(i.status) && (
        <div className="notice">
          <div className="spinner" />
          <div>
            <strong>Analysis {i.job?.status}</strong>
            <p>
              Uploaded → Queued → Preprocessing → Detection → Finding generation
              → Ready for review
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              safe(() => mutate("inspections/" + i.id, { action: "cancel" }))
            }
          >
            Cancel
          </button>
        </div>
      )}
      <div className="review-workspace">
        <aside className="evidence-rail">
          <div className="rail-title">
            EVIDENCE <span>{i.media.length}</span>
          </div>
          {i.media.map((m, n) => (
            <button
              className={"thumbnail " + (n === mediaIndex ? "selected" : "")}
              key={m.id}
              onClick={() => {
                setMediaIndex(n);
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              {m.mime.startsWith("video/") ? (
                <span>▶ Video</span>
              ) : (
                <img src={"/api/media/" + m.id} alt={"Evidence " + (n + 1)} />
              )}{" "}
              <span>
                {String(n + 1).padStart(2, "0")}{" "}
                <small>
                  {m.timestamp !== null ? m.timestamp + "s" : "Image"}
                </small>
              </span>
            </button>
          ))}
          <p>
            <Camera size={14} /> Originals are preserved
          </p>
        </aside>
        <section className="viewer-section">
          <div className="viewer-toolbar">
            <span>
              <Camera size={16} /> Evidence {mediaIndex + 1} of {i.media.length}
            </span>
            <div>
              <button
                className={"icon " + (overlay ? "toggled" : "")}
                title="Toggle detection overlays"
                aria-label="Toggle detection overlays"
                onClick={() => setOverlay(!overlay)}
              >
                <Layers size={17} />
              </button>
              <button
                className="icon"
                aria-label="Zoom out"
                onClick={() => setZoom(Math.max(1, zoom - 0.25))}
              >
                <ZoomOut size={17} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                className="icon"
                aria-label="Zoom in"
                onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              >
                <ZoomIn size={17} />
              </button>
              <button
                className="icon"
                aria-label="Reset view"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                <Move size={16} />
              </button>
            </div>
          </div>
          <div
            className="evidence-viewer"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: pan.x,
                py: pan.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current && zoom > 1)
                setPan({
                  x: drag.current.px + e.clientX - drag.current.x,
                  y: drag.current.py + e.clientY - drag.current.y,
                });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            <div
              className="image-stage"
              style={{
                transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
              }}
            >
              {media?.mime.startsWith("video/") ? (
                <video
                  src={"/api/media/" + media.id}
                  controls
                  aria-label="Original inspection video"
                />
              ) : (
                <img
                  src={"/api/media/" + media?.id}
                  alt="Construction inspection evidence"
                  draggable={false}
                />
              )}
              {overlay &&
                media?.detections
                  .filter(
                    (d) =>
                      (filter === "all" || d.class === filter) &&
                      d.confidence >= confidence,
                  )
                  .map((d) => {
                    const [x, y, w, h] = JSON.parse(d.box);
                    return (
                      <div
                        key={d.id}
                        aria-label={`${d.class} ${Math.round(d.confidence * 100)} percent`}
                        className={"bbox " + d.class}
                        style={{
                          left: x * 100 + "%",
                          top: y * 100 + "%",
                          width: w * 100 + "%",
                          height: h * 100 + "%",
                        }}
                      >
                        <span>
                          {d.class} {Math.round(d.confidence * 100)}%
                        </span>
                      </div>
                    );
                  })}
            </div>
          </div>
          <div className="viewer-footer">
            <button
              className="icon"
              disabled={mediaIndex === 0}
              aria-label="Previous evidence"
              onClick={() => setMediaIndex(mediaIndex - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {media?.width} × {media?.height} px ·{" "}
              {media?.timestamp !== null
                ? "Frame " + media?.timestamp + "s · "
                : ""}
              {i.zone.name}
            </span>
            <button
              className="icon"
              disabled={mediaIndex >= i.media.length - 1}
              aria-label="Next evidence"
              onClick={() => setMediaIndex(mediaIndex + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="overlay-filters">
            <span>
              <SlidersHorizontal size={15} /> Overlays
            </span>
            <select
              aria-label="Detection class"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All classes</option>
              <option>worker</option>
              <option>helmet</option>
              <option>vest</option>
              <option>no-helmet</option>
              <option>no-vest</option>
            </select>
            <label>
              Confidence ≥ {Math.round(confidence * 100)}%
              <input
                aria-label="Minimum confidence"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={confidence}
                onChange={(e) => setConfidence(+e.target.value)}
              />
            </label>
          </div>
          <div className="evidence-provenance">
            <Info size={15} />
            <div>
              <strong>
                {i.job?.model || "Analysis pending"} · {i.job?.version || "—"}
              </strong>
              <p>
                Uploaded {date(i.uploadedAt)} at {time(i.uploadedAt)}.
                Highlighted boxes show spatial worker–PPE associations, not
                identity tracking.
              </p>
            </div>
          </div>
        </section>
        <aside className="review-panel">
          <div className="tabs">
            {["Summary", "Details"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
                {t === "Summary" && <span>{detections.length}</span>}
              </button>
            ))}
          </div>
          {tab === "Summary" ? (
            <div className="review-content">
              <span className="eyebrow">AUTOMATED INSPECTION SUMMARY</span>
              <h3>What the analysis identified</h3>
              <p>
                These counts summarize detector output across the inspection.
                Potential violations are indications for the report, not
                automatically confirmed safety events.
              </p>
              <div className="inspection-counts">
                <div>
                  <strong>{detections.length}</strong>
                  <span>Objects</span>
                </div>
                <div>
                  <strong>{count("worker")}</strong>
                  <span>Workers</span>
                </div>
                <div>
                  <strong>{count("helmet")}</strong>
                  <span>Helmets</span>
                </div>
                <div>
                  <strong>{count("vest")}</strong>
                  <span>Safety vests</span>
                </div>
                <div className="amber-bg">
                  <strong>{potentialViolations}</strong>
                  <span>Potential violations</span>
                </div>
                <div>
                  <strong>{unableToAssess}</strong>
                  <span>Unable to assess</span>
                </div>
              </div>
              <Field label="Human observation (optional)">
                <textarea
                  maxLength={4000}
                  disabled={
                    !allowed(data.role, "progress") || i.status === "reviewed"
                  }
                  placeholder="Add only observations you personally verified from this inspection…"
                  value={humanObservation}
                  onChange={(event) => setHumanObservation(event.target.value)}
                />
              </Field>
              <p className="subtle">
                The inspection report combines this summary with your optional
                observation. Raw model findings remain in the audit data and do
                not require item-by-item review.
              </p>
            </div>
          ) : tab === "Details" ? (
            <div className="review-content">
              <h3>Inspection notes</h3>
              <p>{i.notes || "No notes recorded."}</p>
              <h3>Review history</h3>
              {i.findings
                .flatMap((f) => f.decisions)
                .map((d) => (
                  <div className="audit-row" key={d.id}>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>
                        {d.action} · {d.authorId}
                      </strong>
                      <p>{d.comment}</p>
                      <small>
                        {date(d.createdAt)} {time(d.createdAt)}
                      </small>
                    </div>
                  </div>
                ))}
              <h3>Related progress records</h3>
              {data.project.milestones.flatMap((m) =>
                m.updates
                  .filter((u) => i.media.some((e) => e.id === u.mediaId))
                  .map((u) => (
                    <p key={u.id}>
                      {m.name}: {u.completion}% · {u.reason}
                    </p>
                  )),
              )}
            </div>
          ) : (
            <>
              <div className="finding-list">
                {i.findings.map((f) => (
                  <button
                    key={f.id}
                    className={
                      "finding-option " +
                      (finding?.id === f.id ? "selected" : "")
                    }
                    onClick={() => pick(f)}
                  >
                    <span
                      className={
                        "finding-symbol " +
                        (f.assessment === "missing"
                          ? "amber-bg"
                          : f.assessment === "present"
                            ? "green-bg"
                            : "neutral-bg")
                      }
                    >
                      {f.assessment === "missing" ? (
                        <HardHat size={17} />
                      ) : f.assessment === "present" ? (
                        <Check size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </span>
                    <div>
                      <strong>{f.title}</strong>
                      <small>
                        {f.verification} ·{" "}
                        {f.assessment === "unknown"
                          ? "Unable to assess"
                          : f.kind}
                      </small>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              {finding ? (
                <div className="review-content">
                  <div className="inline">
                    <span className="eyebrow">SELECTED OBSERVATION</span>
                    <Badge>{finding.verification}</Badge>
                  </div>
                  <h3>{finding.title}</h3>
                  <p>
                    {finding.assessment === "missing"
                      ? "No helmet candidate overlaps the visible head region. Absence of a detection is a proposal, not proof of a violation."
                      : finding.assessment === "unknown"
                        ? "Worker is small or obscured. This observation is excluded from assessable PPE metrics."
                        : "PPE candidates overlap the worker region. Confirm only if supported by the visible evidence."}
                  </p>
                  <div className="association">
                    <Layers size={15} />
                    {
                      media?.detections.filter(
                        (d) => d.workerId === finding.workerId,
                      ).length
                    }{" "}
                    associated detections · Original output preserved
                  </div>
                  {finding.verification === "confirmed" && (
                    <p className="notice compact">
                      Verification does not resolve a finding. Resolution:{" "}
                      <strong>{finding.resolution}</strong>.
                    </p>
                  )}
                  {can && (
                    <>
                      <Field label="Reviewer comment">
                        <textarea
                          placeholder="Describe what the evidence supports…"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                      </Field>
                      {edit && (
                        <>
                          <Field label="Corrected finding">
                            <input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                            />
                          </Field>
                          <Field label="Assessment">
                            <select
                              value={assessment}
                              onChange={(e) => setAssessment(e.target.value)}
                            >
                              <option value="missing">
                                Possible missing PPE
                              </option>
                              <option value="present">
                                PPE appears present
                              </option>
                              <option value="unknown">Unable to assess</option>
                            </select>
                          </Field>
                        </>
                      )}
                      <div className="review-actions">
                        <button
                          disabled={!comment.trim()}
                          className="green-button"
                          onClick={() => review(edit ? "correct" : "confirm")}
                        >
                          <Check size={16} />
                          {edit ? "Save correction" : "Confirm"}
                        </button>
                        <button
                          disabled={!comment.trim()}
                          className="secondary"
                          onClick={() => review("reject")}
                        >
                          <X size={16} />
                          Reject
                        </button>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEdit(!edit);
                          setTitle(finding.title);
                          setAssessment(finding.assessment);
                        }}
                      >
                        Correct this observation <ArrowRight size={13} />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <Empty title="No detections available">
                  Run analysis or add a manual observation.
                </Empty>
              )}
              {can && (
                <div className="manual-section">
                  <button
                    className="secondary full"
                    onClick={() => setManual(!manual)}
                  >
                    <Plus size={16} />
                    Manual finding
                  </button>
                  {manual && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        safe(async () => {
                          await mutate(
                            "findings",
                            {
                              action: "manual",
                              mediaId: media.id,
                              title,
                              assessment,
                              comment,
                            },
                            "Manual finding saved",
                          );
                          setManual(false);
                        });
                      }}
                    >
                      <Field label="Finding title">
                        <input
                          required
                          minLength={3}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </Field>
                      <Field label="Assessment">
                        <select
                          value={assessment}
                          onChange={(e) => setAssessment(e.target.value)}
                        >
                          <option value="missing">Missing PPE</option>
                          <option value="present">PPE appears present</option>
                          <option value="unknown">Unable to assess</option>
                        </select>
                      </Field>
                      <Field label="Supporting observation">
                        <textarea
                          required
                          minLength={3}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                      </Field>
                      <button>Save manual observation</button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
      <div className="review-bottom">
        <span>
          <ShieldCheck size={17} />
          {i.status === "reviewed"
            ? "Inspection completed · one report draft created"
            : "Review the summary and add an optional human observation"}
        </span>
        {allowed(data.role, "progress") && (
          <button
            disabled={i.status === "reviewed" || i.status !== "ready"}
            onClick={() =>
              safe(() =>
                mutate(
                  "inspections/" + i.id,
                  { action: "reviewed", humanObservation },
                  "Inspection completed and report draft created",
                ),
              )
            }
          >
            <CheckCheck size={17} />
            Complete inspection & create report
          </button>
        )}
      </div>
    </>
  );
}
// Kept for reading historical finding records; it is no longer routed in the UI.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Safety({
  data,
  open,
}: {
  data: StateData;
  open: (f: FindingData) => void;
}) {
  const [verification, setVerification] = useState("all"),
    [resolution, setResolution] = useState("all");
  const fs = data.findings.filter(
    (f) =>
      (verification === "all" || f.verification === verification) &&
      (resolution === "all" || f.resolution === resolution),
  );
  return (
    <>
      <div className="notice">
        <Info size={19} />
        <div>
          <strong>Verification and resolution are separate.</strong>
          <p>
            AI proposals require human review. Confirmed findings remain open
            until follow-up evidence is recorded.
          </p>
        </div>
      </div>
      <div className="filter-bar">
        <div className="segmented">
          {["all", "proposed", "confirmed", "rejected"].map((v) => (
            <button
              key={v}
              className={verification === v ? "active" : ""}
              onClick={() => setVerification(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <select
          aria-label="Resolution filter"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        >
          <option value="all">All resolutions</option>
          <option>open</option>
          <option>in progress</option>
          <option>resolved</option>
        </select>
        <span>{fs.length} observations</span>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>FINDING / OBSERVATION</th>
                <th>ZONE</th>
                <th>VERIFICATION</th>
                <th>RESOLUTION</th>
                <th>ASSIGNEE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fs.map((f) => (
                <tr key={f.id}>
                  <td>
                    <button className="table-link" onClick={() => open(f)}>
                      <strong>{f.title}</strong>
                      <small>{f.inspectionTitle}</small>
                    </button>
                  </td>
                  <td>{f.zone?.split(" · ")[0]}</td>
                  <td>
                    <Badge>{f.verification}</Badge>
                  </td>
                  <td>
                    {f.assessment === "missing" ? (
                      <Badge
                        tone={f.resolution === "resolved" ? "green" : "neutral"}
                      >
                        {f.resolution}
                      </Badge>
                    ) : (
                      <span className="subtle">Not a violation</span>
                    )}
                  </td>
                  <td>
                    {data.project.memberships.find(
                      (m) => m.userId === f.assignedTo,
                    )?.user.name || "Unassigned"}
                  </td>
                  <td>
                    <button
                      className="icon"
                      onClick={() => open(f)}
                      aria-label={"Details for " + f.title}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!fs.length && <Empty title="No observations match these filters" />}
      </section>
    </>
  );
}
function FindingDrawer({
  finding: f,
  data,
  close,
  mutate,
  safe,
  go,
}: {
  finding: FindingData;
  data: StateData;
  close: () => void;
  mutate: Mutate;
  safe: Safe;
  go: (p: string, id?: string) => void;
}) {
  const [resolution, setResolution] = useState(f.resolution),
    [assignedTo, setAssigned] = useState(f.assignedTo || ""),
    [comment, setComment] = useState("");
  return (
    <Modal title="Finding details" close={close}>
      <div className="modal-body">
        <div className="inline">
          <Badge>{f.verification}</Badge>
          <Badge>{f.resolution}</Badge>
        </div>
        <h2>{f.title}</h2>
        <img
          className="drawer-image"
          src={"/api/media/" + f.mediaId}
          alt="Finding supporting evidence"
        />
        <button
          className="text-button"
          onClick={() => {
            close();
            go("Review", f.inspectionId);
          }}
        >
          Open annotated evidence <ExternalLink size={14} />
        </button>
        <p>{f.notes || "No reviewer notes yet."}</p>
        <details>
          <summary>Original model output</summary>
          <pre>{JSON.stringify(JSON.parse(f.original), null, 2)}</pre>
        </details>
        {f.correction && (
          <details>
            <summary>Preserved correction</summary>
            <pre>{f.correction}</pre>
          </details>
        )}
        {allowed(data.role, "review") &&
          f.verification === "confirmed" &&
          f.assessment === "missing" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                safe(async () => {
                  await mutate(
                    "findings",
                    {
                      findingId: f.id,
                      action: "resolution",
                      resolution,
                      assignedTo: assignedTo || null,
                      comment,
                    },
                    resolution === "open"
                      ? "Finding reopened with audit record"
                      : "Resolution updated",
                  );
                  close();
                });
              }}
            >
              <Field label="Resolution">
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  <option>open</option>
                  <option>in progress</option>
                  <option>resolved</option>
                </select>
              </Field>
              <Field label="Assign to">
                <select
                  value={assignedTo}
                  onChange={(e) => setAssigned(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {data.project.memberships.map((m) => (
                    <option key={m.id} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Follow-up evidence reference and notes">
                <textarea
                  required
                  minLength={3}
                  placeholder="Reference an inspection, photo or follow-up record and explain the change."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </Field>
              <button>Save resolution</button>
            </form>
          )}
      </div>
    </Modal>
  );
}
function Projects({
  data,
  edit,
  addZone,
  addMilestone,
  progress: onProgress,
}: {
  data: StateData;
  edit: () => void;
  addZone: () => void;
  addMilestone: () => void;
  progress: () => void;
}) {
  const p = data.project;
  return (
    <>
      <section className="panel project-details">
        <div className="panel-title">
          <div>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
          </div>
          {allowed(data.role, "configure") && (
            <button className="secondary" onClick={edit}>
              Edit project
            </button>
          )}
        </div>
        <div className="project-facts">
          <div>
            <small>LOCATION</small>
            <strong>{p.location}</strong>
          </div>
          <div>
            <small>START DATE</small>
            <strong>{date(p.startDate)}</strong>
          </div>
          <div>
            <small>TARGET DATE</small>
            <strong>{date(p.targetDate)}</strong>
          </div>
          <div>
            <small>STATUS</small>
            <Badge>{p.status}</Badge>
          </div>
        </div>
      </section>
      {data.role !== "viewer" && (
        <>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Zones & milestones</h2>
                <p>
                  Verified completion is entered by engineers with supporting
                  evidence.
                </p>
              </div>
              <div className="inline">
                {allowed(data.role, "configure") && (
                  <>
                    <button className="secondary" onClick={addZone}>
                      <Plus size={15} />
                      Zone
                    </button>
                    <button className="secondary" onClick={addMilestone}>
                      <Plus size={15} />
                      Milestone
                    </button>
                  </>
                )}
                {allowed(data.role, "progress") && (
                  <button onClick={onProgress}>Update progress</button>
                )}
              </div>
            </div>
            <div className="zone-chips">
              {p.zones.map((z) => (
                <span key={z.id}>
                  <Building2 size={14} />
                  {z.name}
                </span>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>MILESTONE</th>
                    <th>ZONE</th>
                    <th>WEIGHT</th>
                    <th>VERIFIED</th>
                    <th>LINEAR BASELINE</th>
                    <th>TARGET</th>
                  </tr>
                </thead>
                <tbody>
                  {p.milestones.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                        <small>
                          {m.updates.length
                            ? "Last verified " + date(m.updates[0].createdAt)
                            : "No verified update yet"}
                        </small>
                      </td>
                      <td>{m.zone.name.split(" · ")[0]}</td>
                      <td>{m.weight}</td>
                      <td>
                        <div className="milestone-progress">
                          <strong>{m.completion}%</strong>
                          <div className="progress-track">
                            <i style={{ width: m.completion + "%" }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        {planned(m)?.toFixed(0) || "—"}%{" "}
                        <small>
                          {m.completion < (planned(m) || 0)
                            ? "Below baseline"
                            : "On or above baseline"}
                        </small>
                      </td>
                      <td>{date(m.targetDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="chart-foot">
              <Info size={15} /> Verified progress = Σ(weight × verified
              completion) ÷ Σ(weight). Weights are relative; zero total returns
              unavailable. Planned progress assumes linear work between
              milestone dates.
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Project audit history</h2>
              <span className="subtle">Latest 50 events</span>
            </div>
            <div className="audit-list">
              {data.audits.map((a) => (
                <div className="audit-row" key={a.id}>
                  <Activity size={16} />
                  <div>
                    <strong>{a.action}</strong>
                    <p>
                      {data.project.memberships.find(
                        (m) => m.userId === a.actorId,
                      )?.user.name || a.actorId}{" "}
                      · {a.entityId.slice(0, 20)}
                    </p>
                  </div>
                  <small>
                    {date(a.createdAt)} · {time(a.createdAt)}
                  </small>
                  <details>
                    <summary>Changes</summary>
                    <pre>
                      Before: {a.previous}
                      {"\n"}After: {a.next}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function ProjectSummary({
  data,
  go,
}: {
  data: StateData;
  go: (p: string, id?: string) => void;
}) {
  const p = data.project;
  const verifiedProgress = progress(p.milestones);
  const achieved = p.milestones.filter((m) => m.completion >= 100);
  const progressing = p.milestones.filter(
    (m) => m.completion > 0 && m.completion < 100,
  );
  const evidenceCount = data.inspections.reduce(
    (sum, inspection) => sum + inspection.media.length,
    0,
  );
  const latestInspection = [...data.inspections].sort(
    (a, b) => +new Date(b.captureTime) - +new Date(a.captureTime),
  )[0];
  const reviewedInspections = data.inspections.filter(
    (inspection) => inspection.status === "reviewed",
  ).length;
  const authorisedNote =
    data.role === "viewer"
      ? "This summary contains the approved records available to your role."
      : "This summary is calculated from the project’s current inspection and milestone records.";

  return (
    <div className="project-summary-report">
      <section className="panel project-summary-cover">
        <div>
          <span className="eyebrow">LIVE PROJECT RECORD</span>
          <h2>{p.name}</h2>
          <p>{p.description}</p>
        </div>
        <div className="project-summary-meta">
          <Badge>{p.status}</Badge>
          <span>{p.location}</span>
          <span>
            {date(p.startDate)} – {date(p.targetDate)}
          </span>
        </div>
        <div className="summary-freshness">
          <RefreshCw size={15} />
          Updated automatically from current records after each inspection.
        </div>
      </section>

      <section
        className="summary-stat-grid"
        aria-label="Project summary metrics"
      >
        <article>
          <small>VERIFIED PROGRESS</small>
          <strong>
            {verifiedProgress === null
              ? "Unavailable"
              : `${verifiedProgress.toFixed(1)}%`}
          </strong>
          <p>Weighted engineer-verified milestone completion</p>
        </article>
        <article>
          <small>INSPECTIONS</small>
          <strong>{data.inspections.length}</strong>
          <p>{reviewedInspections} reviewed inspection records</p>
        </article>
        <article>
          <small>EVIDENCE ITEMS</small>
          <strong>{evidenceCount}</strong>
          <p>Images, videos and sampled frames in scope</p>
        </article>
        <article>
          <small>MILESTONES ACHIEVED</small>
          <strong>
            {achieved.length} / {p.milestones.length}
          </strong>
          <p>{progressing.length} milestones currently in progress</p>
        </article>
      </section>

      <section className="panel project-summary-narrative">
        <div className="panel-title">
          <div>
            <h2>Executive project summary</h2>
            <p>{authorisedNote}</p>
          </div>
          <div className="inline">
            <button className="secondary" onClick={() => go("Inspections")}>
              View inspections
            </button>
            <button className="secondary" onClick={() => go("Reports")}>
              View reports
            </button>
          </div>
        </div>
        <p className="summary-lead">
          {p.name} has {data.inspections.length} recorded inspection
          {data.inspections.length === 1 ? "" : "s"} across {p.zones.length}{" "}
          zone
          {p.zones.length === 1 ? "" : "s"}, supported by {evidenceCount}{" "}
          evidence item{evidenceCount === 1 ? "" : "s"}. {achieved.length} of{" "}
          {p.milestones.length} weighted milestones are complete
          {verifiedProgress === null
            ? ", and verified overall progress is unavailable because milestone weights total zero."
            : `, producing ${verifiedProgress.toFixed(1)}% verified overall progress.`}
          {latestInspection
            ? ` The latest inspection was captured on ${date(latestInspection.captureTime)} in ${latestInspection.zone.name}.`
            : " No inspection has been recorded yet."}
        </p>
        {!!achieved.length && (
          <div className="achieved-list">
            <small>ACHIEVED MILESTONES</small>
            <div>
              {achieved.map((milestone) => (
                <span key={milestone.id}>
                  <CheckCircle2 size={14} /> {milestone.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Milestone progress</h2>
            <p>Completion is entered and verified by project engineers.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MILESTONE</th>
                <th>ZONE</th>
                <th>WEIGHT</th>
                <th>VERIFIED PROGRESS</th>
                <th>LATEST UPDATE</th>
                <th>TARGET</th>
              </tr>
            </thead>
            <tbody>
              {p.milestones.map((milestone) => {
                const latest = [...milestone.updates].sort(
                  (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
                )[0];
                return (
                  <tr key={milestone.id}>
                    <td>
                      <strong>{milestone.name}</strong>
                    </td>
                    <td>{milestone.zone.name}</td>
                    <td>{milestone.weight}</td>
                    <td>
                      <div className="milestone-progress">
                        <strong>{milestone.completion}%</strong>
                        <div className="progress-track">
                          <i style={{ width: `${milestone.completion}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      {latest ? (
                        <>
                          <strong>{date(latest.createdAt)}</strong>
                          <small>{latest.reason}</small>
                        </>
                      ) : (
                        "No update"
                      )}
                    </td>
                    <td>{date(milestone.targetDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!p.milestones.length && (
          <Empty title="No milestones have been defined" />
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Inspection history</h2>
            <p>
              Every authorised inspection currently recorded for this project.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>INSPECTION</th>
                <th>ZONE</th>
                <th>CAPTURED</th>
                <th>EVIDENCE</th>
                <th>POTENTIAL PPE OBSERVATIONS</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {[...data.inspections]
                .sort(
                  (a, b) => +new Date(b.captureTime) - +new Date(a.captureTime),
                )
                .map((inspection) => (
                  <tr key={inspection.id}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => go("Review", inspection.id)}
                      >
                        <strong>{inspection.title}</strong>
                        <small>
                          {inspection.viewpoint || "Viewpoint not recorded"}
                        </small>
                      </button>
                    </td>
                    <td>{inspection.zone.name}</td>
                    <td>
                      {date(inspection.captureTime)} ·{" "}
                      {time(inspection.captureTime)}
                    </td>
                    <td>{inspection.media.length}</td>
                    <td>
                      {
                        inspection.findings.filter(
                          (finding) => finding.assessment === "missing",
                        ).length
                      }
                    </td>
                    <td>
                      <Badge>{inspection.status}</Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!data.inspections.length && (
          <Empty title="No inspections are available in this project summary" />
        )}
      </section>

      <div className="notice project-summary-limit">
        <Info size={18} />
        <div>
          <strong>Scope and limitations</strong>
          <p>
            This report summarises uploaded inspection records rather than
            continuous site coverage. Detector observations do not certify
            safety, quality or completion. Verified progress comes only from
            reviewed milestone updates.
          </p>
        </div>
      </div>
    </div>
  );
}

function Comparison({
  data,
  mutate,
  safe,
  progress: onProgress,
}: {
  data: StateData;
  mutate: Mutate;
  safe: Safe;
  progress: () => void;
}) {
  const [first, setFirst] = useState(data.inspections[1]?.id || ""),
    [second, setSecond] = useState(data.inspections[0]?.id || ""),
    [observation, setObservation] = useState("Newly visible work"),
    [reason, setReason] = useState("");
  const a = data.inspections.find((i) => i.id === first),
    b = data.inspections.find((i) => i.id === second),
    compatible = a && b && a.id !== b.id && a.zoneId === b.zoneId,
    viewpoint = compatible && a.viewpoint === b.viewpoint && a.viewpoint;
  return (
    <>
      <div className="notice">
        <Info size={20} />
        <div>
          <strong>Visual comparison supports engineering judgement.</strong>
          <p>
            It does not measure completion automatically. Matching viewpoints do
            not guarantee matching coverage.
          </p>
        </div>
      </div>
      <div className="comparison-grid">
        {[
          ["Earlier inspection", a, first, setFirst],
          ["Later inspection", b, second, setSecond],
        ].map(([label, i, value, set]) => (
          <section className="panel" key={String(label)}>
            <div className="panel-title">
              <Field label={String(label)}>
                <select
                  value={value as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                >
                  {data.inspections.map((j) => (
                    <option value={j.id} key={j.id}>
                      {date(j.captureTime, true)} · {j.zone.name} · {j.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {i && (
              <>
                <img
                  className="compare-image"
                  alt={String(label) + " evidence"}
                  src={"/api/media/" + (i as InspectionData).media[0]?.id}
                />
                <div className="comparison-caption">
                  <strong>{date((i as InspectionData).captureTime)}</strong>
                  <span>{(i as InspectionData).viewpoint}</span>
                  <small>{(i as InspectionData).zone.name}</small>
                </div>
              </>
            )}
          </section>
        ))}
      </div>
      <div className={"alert " + (viewpoint ? "blue" : "amber")}>
        <TriangleAlert size={18} />
        {!compatible
          ? "Choose two different inspections from the same zone."
          : !viewpoint
            ? "Viewpoints differ or are unspecified. Treat this pair as potentially not comparable."
            : "Viewpoint labels match. Verify framing, visibility and coverage before recording changes."}
      </div>
      {allowed(data.role, "progress") && (
        <section className="panel">
          <div className="panel-title">
            <h2>Record a comparison observation</h2>
            <button className="secondary" onClick={onProgress}>
              Update verified progress
            </button>
          </div>
          <form
            className="comparison-form"
            onSubmit={(e) => {
              e.preventDefault();
              safe(() =>
                mutate(
                  "compare",
                  { first, second, observation, reason },
                  "Comparison observation saved",
                ),
              );
            }}
          >
            <Field label="Observation">
              <select
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              >
                {[
                  "Newly visible work",
                  "Work continuing",
                  "No visible change",
                  "Insufficient evidence",
                  "Not comparable",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Supporting description">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={10}
                placeholder="Describe visible evidence, coverage and limitations."
              />
            </Field>
            <button disabled={!compatible}>Save observation</button>
          </form>
        </section>
      )}
    </>
  );
}
function Reports({
  data,
  mutate,
  safe,
  go,
}: {
  data: StateData;
  mutate: Mutate;
  safe: Safe;
  go: (p: string, id?: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const inspectionReports = data.reports.filter((r) => r.inspectionId);
  const report = inspectionReports.find((r) => r.id === selected);
  const content = report?.versions[0]
    ? JSON.parse(report.versions[0].content)
    : null;
  return (
    <>
      <div className="notice">
        <ShieldCheck size={20} />
        <div>
          <strong>Approval creates a permanent report snapshot.</strong>
          <p>
            Completing an inspection creates its single report draft. Approval
            freezes that inspection record and enables PDF export.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>REPORT</th>
                <th>TYPE</th>
                <th>VERSION</th>
                <th>STATUS</th>
                <th>CREATED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {inspectionReports.map((r) => {
                const v = r.versions[0];
                return (
                  v && (
                    <tr key={r.id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setSelected(r.id)}
                        >
                          <div className="inline">
                            <span className="report-icon">
                              <FileText size={20} />
                            </span>
                            <div>
                              <strong>{r.title}</strong>
                              <small>{v.model}</small>
                            </div>
                          </div>
                        </button>
                      </td>
                      <td>
                        {r.type === "daily"
                          ? "Daily inspection"
                          : "Safety summary"}
                      </td>
                      <td>v{v.number}</td>
                      <td>
                        <Badge>{v.status}</Badge>
                      </td>
                      <td>{date(r.createdAt)}</td>
                      <td>
                        <div className="inline">
                          <button
                            className="secondary compact"
                            onClick={() => setSelected(r.id)}
                          >
                            View
                          </button>
                          {v.status === "approved" && (
                            <a
                              className="button secondary compact"
                              href={`/api/projects/${data.project.id}/reports/${r.id}/pdf?version=${v.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download size={15} />
                              PDF
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                );
              })}
            </tbody>
          </table>
        </div>
        {!inspectionReports.length && (
          <Empty title="No reports available yet">
            Complete an inspection to create its report draft.
          </Empty>
        )}
      </section>
      {report && content && (
        <Modal title={report.title} close={() => setSelected("")}>
          <div className="modal-body report-preview">
            <div className="inline">
              <Badge>{report.versions[0].status}</Badge>
              <span>
                Version {report.versions[0].number} · {content.period}
              </span>
            </div>
            <p>Author: {content.author}</p>
            {content.inspectionSummary && (
              <>
                <h3>Inspection summary</h3>
                <div className="inspection-counts">
                  <div>
                    <strong>{content.inspectionSummary.detectionCount}</strong>
                    <span>Objects</span>
                  </div>
                  <div>
                    <strong>
                      {content.inspectionSummary.classCounts.worker || 0}
                    </strong>
                    <span>Workers</span>
                  </div>
                  <div>
                    <strong>
                      {content.inspectionSummary.classCounts.helmet || 0}
                    </strong>
                    <span>Helmets</span>
                  </div>
                  <div>
                    <strong>
                      {content.inspectionSummary.classCounts.vest || 0}
                    </strong>
                    <span>Safety vests</span>
                  </div>
                  <div className="amber-bg">
                    <strong>
                      {content.inspectionSummary.potentialViolations}
                    </strong>
                    <span>Potential violations</span>
                  </div>
                  <div>
                    <strong>{content.inspectionSummary.unableToAssess}</strong>
                    <span>Unable to assess</span>
                  </div>
                </div>
                <h3>Human observation</h3>
                <p>
                  {content.inspectionSummary.humanObservation ||
                    "No additional human observation was recorded."}
                </p>
              </>
            )}
            <h3>Verified observations</h3>
            {(content.claims as Claim[]).map((c, n) => (
              <div key={n} className="report-claim">
                <p>{c.text}</p>
                <small>{c.limitations}</small>
                <div>
                  {c.evidenceIds.map((id) => (
                    <button
                      key={id}
                      className="citation"
                      onClick={() => {
                        if (data.role === "viewer")
                          window.open("/api/media/" + id, "_blank");
                        else {
                          setSelected("");
                          go(
                            "Review",
                            data.inspections.find((i) =>
                              i.media.some((m) => m.id === id),
                            )?.id,
                          );
                        }
                      }}
                    >
                      <Camera size={12} />
                      {id.slice(0, 18)}
                    </button>
                  ))}
                  {c.citations?.map((citation) => (
                    <a
                      className="citation"
                      key={citation.id}
                      href={citation.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={12} />
                      {citation.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
            {content.reviewContext &&
              [
                ["Proposed findings", content.reviewContext.proposed],
                ["Unable to assess", content.reviewContext.unknown],
                ["Recommendations", content.reviewContext.recommendations],
              ].map(
                ([label, items]) =>
                  (items as Claim[])?.length > 0 && (
                    <div key={label as string}>
                      <h3>{label as string}</h3>
                      {(items as Claim[]).map((claim, index) => (
                        <div className="report-claim" key={index}>
                          <div className="inline">
                            <Badge>{claim.verification}</Badge>
                            <span>{claim.text}</span>
                          </div>
                          <small>{claim.limitations}</small>
                        </div>
                      ))}
                    </div>
                  ),
              )}
            {!content.claims.length && (
              <p>
                No reviewed evidence available. Add reviewed records before
                approval.
              </p>
            )}
            <h3>Limitations & follow-up</h3>
            {[...content.limitations, ...content.followUp].map((l: string) => (
              <p key={l} className="subtle">
                • {l}
              </p>
            ))}
            {report.versions[0].approvedAt && (
              <div className="notice compact">
                Approved by {report.versions[0].approvedBy} on{" "}
                {date(report.versions[0].approvedAt)}. This snapshot is
                immutable.
              </div>
            )}
            <small>
              Provenance: {report.versions[0].model} ·{" "}
              {report.versions[0].promptVersion}
            </small>
            <div className="modal-actions">
              {allowed(data.role, report.type) && (
                <>
                  {report.versions[0].status === "draft" && (
                    <button
                      disabled={!content.claims.length}
                      onClick={() =>
                        safe(() =>
                          mutate(
                            "reports/" + report.id,
                            { type: report.type, action: "submit" },
                            "Report submitted for approval",
                          ),
                        )
                      }
                    >
                      Submit for approval
                    </button>
                  )}
                  {report.versions[0].status === "pending approval" && (
                    <button
                      onClick={() =>
                        safe(() =>
                          mutate(
                            "reports/" + report.id,
                            { type: report.type, action: "approve" },
                            "Report version approved and frozen",
                          ),
                        )
                      }
                    >
                      <Check size={16} />
                      Approve report
                    </button>
                  )}
                  {report.versions[0].status === "approved" &&
                    !report.inspectionId && (
                      <button
                        className="secondary"
                        onClick={() =>
                          safe(() =>
                            mutate(
                              "reports/" + report.id,
                              { type: report.type, action: "revision" },
                              "New draft version created",
                            ),
                          )
                        }
                      >
                        Create new version
                      </button>
                    )}
                </>
              )}
              {report.versions
                .filter((v) => v.status === "approved")
                .map((v) => (
                  <a
                    key={v.id}
                    className="button secondary"
                    href={`/api/projects/${data.project.id}/reports/${report.id}/pdf?version=${v.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} />
                    Export v{v.number} PDF
                  </a>
                ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function Ask({
  projectId,
  go,
  data,
}: {
  projectId: string;
  go: (p: string, id?: string) => void;
  data: StateData;
}) {
  type ChatAnswer = {
    message?: string;
    claims: Claim[];
    limitations: string;
    provider: string;
  };
  const [q, setQ] = useState(""),
    [thread, setThread] = useState<{ question: string; answer: ChatAnswer }[]>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ask = async (question: string) => {
    const clean = question.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const history = thread.flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        {
          role: "assistant" as const,
          content:
            turn.answer.message ||
            turn.answer.claims.map((claim) => claim.text).join(" ") ||
            turn.answer.limitations,
        },
      ]);
      const answer = await request<ChatAnswer>(`projects/${projectId}/ask`, {
        question: clean,
        useProvider: true,
        history,
        previousGrounded: Boolean(thread.at(-1)?.answer.claims.length),
      });
      setThread((current) => [...current, { question: clean, answer }]);
      setQ("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ask-workspace">
      <div className="ask-intro">
        <span className="ask-mark">
          <Layers size={30} />
        </span>
        <h2>
          A question about your site?
          <br />
          <span>Start with the evidence.</span>
        </h2>
        <p>
          Ask naturally. SiteSight automatically uses authorised project records
          when the question needs them.
        </p>
      </div>
      {!thread.length && (
        <div className="suggestions">
          {[
            "Hello, what can you help me with?",
            "How many projects and inspections do I have?",
            "Summarise the latest inspection report.",
            "How many potential PPE violations were identified?",
            "What human observation was recorded?",
            "Explain why human review matters for PPE detection.",
          ].map((s) => (
            <button className="secondary" key={s} onClick={() => ask(s)}>
              {s}
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      )}
      <div className="chat-thread" aria-live="polite">
        {thread.map((turn, index) => (
          <div className="chat-exchange" key={index}>
            <div className="chat-user">{turn.question}</div>
            <section className="panel answer">
              <div className="panel-title">
                <h3>
                  <Layers size={17} /> SiteSight answer
                </h3>
                <span className="mini-tag">{turn.answer.provider}</span>
              </div>
              {turn.answer.message && (
                <p className="general-answer">{turn.answer.message}</p>
              )}
              {turn.answer.claims.map((c, n) => (
                <div className="report-claim" key={n}>
                  <p>{c.text}</p>
                  <div>
                    <Badge>{c.verification}</Badge>
                    {c.evidenceIds.map((id) => (
                      <button
                        className="citation"
                        key={id}
                        onClick={() =>
                          data.role === "viewer"
                            ? window.open("/api/media/" + id, "_blank")
                            : go(
                                "Review",
                                data.inspections.find((i) =>
                                  i.media.some((m) => m.id === id),
                                )?.id,
                              )
                        }
                      >
                        <Camera size={12} />
                        {id.slice(0, 18)}
                      </button>
                    ))}
                    {c.citations?.map((citation) => (
                      <a
                        className="citation"
                        key={citation.id}
                        href={citation.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={12} />
                        {citation.label}
                      </a>
                    ))}
                  </div>
                  <small>{c.limitations}</small>
                </div>
              ))}
              <div className="chart-foot">
                <Info size={15} />
                {turn.answer.limitations}
              </div>
            </section>
          </div>
        ))}
      </div>
      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          aria-label="Ask a project question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          minLength={1}
          required
          placeholder="Ask anything about SiteSight, your projects or construction…"
        />
        <button aria-label="Send question" disabled={busy || !q.trim()}>
          <Send size={19} />
        </button>
      </form>
      <p className="chat-privacy">
        Conversation context stays in this browser view and clears when you
        leave or refresh. It is not saved to project records.
      </p>
      {busy && (
        <div className="empty">
          <div className="spinner" />
          Retrieving authorised records…
        </div>
      )}
      {error && <div className="alert red">{error}</div>}
    </div>
  );
}
function SettingsPage({
  data,
  session,
  mutate,
  safe,
  onRole,
}: {
  data: StateData;
  session: SessionData;
  mutate: Mutate;
  safe: Safe;
  onRole: (r: string) => Promise<void>;
}) {
  const [resetting, setResetting] = useState(false);
  const [integrations, setIntegrations] = useState<
      Record<string, string | string[]>
    >({}),
    [threshold, setThreshold] = useState(data.project.threshold);
  useEffect(() => {
    request<Record<string, string | string[]>>(
      `projects/${data.project.id}/settings`,
    )
      .then(setIntegrations)
      .catch(() =>
        setIntegrations({
          status:
            "Integration status unavailable. Reload when the server is reachable.",
        }),
      );
  }, [data.project.id]);
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-title">
          <h2>Profile & project access</h2>
        </div>
        <div className="settings-body">
          <div className="profile light">
            <span className="avatar">
              {session.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>{session.user.email}</small>
            </div>
            <Badge>{data.role}</Badge>
          </div>
          {data.project.memberships.map((m) => (
            <div className="member" key={m.id}>
              <div>
                <strong>{m.user.name}</strong>
                <small>{m.user.email}</small>
              </div>
              <select
                aria-label={"Role for " + m.user.name}
                disabled={!allowed(data.role, "configure")}
                value={m.role}
                onChange={(e) =>
                  safe(() =>
                    mutate(
                      "members",
                      { userId: m.userId, role: e.target.value },
                      "Member role updated",
                    ),
                  )
                }
              >
                {["admin", "engineer", "safety", "viewer"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          ))}
          {allowed(data.role, "configure") && (
            <form
              className="add-member"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                safe(async () => {
                  await mutate(
                    "members",
                    { email: fd.get("email"), role: fd.get("role") },
                    "Member added to project",
                  );
                  form.reset();
                });
              }}
            >
              <h3>Add a registered member</h3>
              <Field label="Member email">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="engineer@company.com"
                />
              </Field>
              <Field label="Project role">
                <select name="role">
                  <option value="engineer">Engineer</option>
                  <option value="safety">Safety officer</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <button className="secondary">Add member</button>
            </form>
          )}
          {session.mode === "demo" && (
            <div className="demo-role">
              <h3>Explore sample roles</h3>
              <p>
                Signs in as a separate sample account. Production permissions
                remain server-enforced.
              </p>
              <div className="inline">
                {["admin", "engineer", "safety", "viewer"].map((r) => (
                  <button
                    className="secondary compact"
                    key={r}
                    onClick={() => safe(() => onRole(r))}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {data.role === "admin" && data.project.id === "riverside" && (
                <div className="reset-demo">
                  <button
                    className="secondary"
                    onClick={() => setResetting(!resetting)}
                  >
                    Restore sample project
                  </button>
                  {resetting && (
                    <div className="notice compact">
                      <p>
                        This restores the fictional project and removes its
                        sample edits. Other projects are preserved.
                      </p>
                      <button
                        onClick={() =>
                          safe(async () => {
                            await mutate(
                              "reset",
                              {},
                              "Sample project restored",
                            );
                            setResetting(false);
                          })
                        }
                      >
                        Restore fixtures
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Integration status</h2>
          <Badge>
            {session.mode === "demo" ? "Local fixtures" : "Connected"}
          </Badge>
        </div>
        <div className="settings-body">
          {Object.entries(integrations)
            .filter(([k]) => k !== "mode")
            .map(([k, v]) => (
              <div className="integration" key={k}>
                <span>{k}</span>
                <strong>{Array.isArray(v) ? v.join(", ") : v}</strong>
              </div>
            ))}
          <div className="notice compact">
            <Info size={17} />
            <p>
              Connected mode requires PostgreSQL, private S3 storage, a running
              queue worker and licensed PPE model weights. Credentials are never
              returned by this screen.
            </p>
          </div>
        </div>
      </section>
      {allowed(data.role, "configure") && (
        <section className="panel">
          <div className="panel-title">
            <h2>Analysis thresholds</h2>
          </div>
          <form
            className="settings-body"
            onSubmit={(e) => {
              e.preventDefault();
              safe(() =>
                mutate(
                  "settings",
                  { threshold },
                  "Analysis threshold saved",
                  "PATCH",
                ),
              );
            }}
          >
            <Field
              label={
                "Minimum detection confidence · " +
                Math.round(threshold * 100) +
                "%"
              }
            >
              <input
                type="range"
                min=".1"
                max=".95"
                step=".05"
                value={threshold}
                onChange={(e) => setThreshold(+e.target.value)}
              />
            </Field>
            <p className="subtle">
              Applies to future connected detector runs. Confidence is not an
              accuracy score. Every possible missing-PPE finding requires
              review.
            </p>
            <button>Save threshold</button>
          </form>
        </section>
      )}
    </div>
  );
}
function FormModal({
  mode,
  type,
  data,
  busy,
  close,
  submit,
}: {
  mode: string;
  type: string;
  data: StateData;
  busy: boolean;
  close: () => void;
  submit: (b: unknown) => Promise<void>;
}) {
  const [captureDefault] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  );
  const [fixture, setFixture] = useState(mode === "demo"),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  const title = (
    {
      inspection: "New inspection",
      report: "Generate report",
      progress: "Verified progress update",
      zone: "Add project zone",
      milestone: "Add weighted milestone",
      project: "Create project",
      "edit-project": "Edit project",
    } as Record<string, string>
  )[type];
  const p = data.project;
  return (
    <Modal title={title} close={close}>
      <form
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          setError("");
          setUploading(true);
          const fd = new FormData(e.currentTarget);
          let b: unknown = Object.fromEntries(fd.entries());
          if (type === "inspection") {
            fd.set("fixture", String(fixture));
            fd.set(
              "captureTime",
              new Date(String(fd.get("captureTime"))).toISOString(),
            );
            b = fd;
          } else if (type === "progress")
            b = { ...(b as object), completion: Number(fd.get("completion")) };
          else if (type === "milestone")
            b = { ...(b as object), weight: Number(fd.get("weight")) };
          else if (type === "report")
            b = {
              ...(b as object),
              useProvider: fd.get("useProvider") === "true",
            };
          try {
            await submit(b);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setUploading(false);
          }
        }}
      >
        <div className="modal-body">
          {type === "inspection" && (
            <>
              <div className="notice compact">
                <Camera size={18} />
                <p>
                  Capture time records when evidence was taken, independently of
                  upload time.
                </p>
              </div>
              <Field label="Inspection title">
                <input
                  name="title"
                  required
                  minLength={3}
                  placeholder="West wing · Morning inspection"
                />
              </Field>
              <div className="form-grid">
                <Field label="Zone">
                  <select name="zoneId" required>
                    {p.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Captured at">
                  <input
                    type="datetime-local"
                    name="captureTime"
                    required
                    defaultValue={captureDefault}
                  />
                </Field>
              </div>
              <Field label="Viewpoint label">
                <input
                  name="viewpoint"
                  placeholder="East elevation · Level 03"
                />
              </Field>
              <Field label="Inspection notes">
                <textarea
                  name="notes"
                  placeholder="Purpose, coverage and relevant conditions…"
                />
              </Field>
              {mode === "demo" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={fixture}
                    onChange={(e) => setFixture(e.target.checked)}
                  />{" "}
                  Use bundled synthetic fixture evidence
                </label>
              )}
              {fixture ? (
                <div className="upload-area">
                  <Layers size={28} />
                  <strong>Illustrated construction site</strong>
                  <p>
                    Deterministic worker, helmet and vest fixtures.
                    <br />
                    Clearly labelled throughout the review.
                  </p>
                </div>
              ) : (
                <label className="upload-area">
                  <Upload size={28} />
                  <strong>Select inspection evidence</strong>
                  <p>Up to 20 images or one 60s video · 100 MB total</p>
                  <input
                    type="file"
                    name="files"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    multiple
                    required
                  />
                </label>
              )}
              {uploading && (
                <div className="notice">
                  <div className="spinner" />
                  Uploading and validating evidence. Keep this window open.
                </div>
              )}
            </>
          )}
          {type === "progress" && (
            <>
              <div className="notice compact">
                <Info size={18} />
                <p>
                  Enter engineering judgement supported by evidence. Image
                  detection does not measure completion.
                </p>
              </div>
              <Field label="Milestone">
                <select name="milestoneId" required>
                  {p.milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · currently {m.completion}%
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Verified completion (%)">
                <input
                  type="number"
                  name="completion"
                  min="0"
                  max="100"
                  step=".1"
                  required
                />
              </Field>
              <Field label="Supporting evidence">
                <select name="mediaId" required>
                  {data.inspections.flatMap((i) =>
                    i.media.map((m, n) => (
                      <option key={m.id} value={m.id}>
                        {i.title} · {date(i.captureTime, true)} · image {n + 1}
                      </option>
                    )),
                  )}
                </select>
              </Field>
              <Field label="Reason and engineering basis">
                <textarea
                  name="reason"
                  minLength={10}
                  required
                  placeholder="Describe verified work and the basis for this percentage…"
                />
              </Field>
            </>
          )}
          {type === "report" && (
            <>
              <div className="form-grid">
                <Field label="Period start">
                  <input
                    name="from"
                    type="date"
                    required
                    defaultValue={
                      data.inspections.length
                        ? new Date(
                            data.inspections[data.inspections.length - 1]
                              .captureTime,
                          )
                            .toISOString()
                            .slice(0, 10)
                        : captureDefault.slice(0, 10)
                    }
                  />
                </Field>
                <Field label="Period end">
                  <input
                    name="to"
                    type="date"
                    required
                    defaultValue={captureDefault.slice(0, 10)}
                  />
                </Field>
              </div>
              <Field label="Report title">
                <input
                  name="title"
                  required
                  minLength={3}
                  defaultValue={"Daily inspection · " + date(new Date(), true)}
                />
              </Field>
              <Field label="Report type">
                <select name="type">
                  {allowed(data.role, "daily") && (
                    <option value="daily">Daily inspection report</option>
                  )}
                  {allowed(data.role, "safety") && (
                    <option value="safety">Safety summary</option>
                  )}
                </select>
              </Field>
              <label className="checkbox">
                <input name="useProvider" type="checkbox" value="true" />
                Generate draft wording with the configured Groq model
              </label>
              <div className="notice">
                <ShieldCheck size={20} />
                <p>
                  Drafts include confirmed findings and verified milestone
                  updates with evidence references. Unverified proposals are
                  excluded. Review the draft before approval.
                </p>
              </div>
            </>
          )}
          {["project", "edit-project"].includes(type) && (
            <>
              <Field label="Project name">
                <input
                  name="name"
                  required
                  minLength={3}
                  defaultValue={type === "edit-project" ? p.name : ""}
                />
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  defaultValue={type === "edit-project" ? p.description : ""}
                />
              </Field>
              <Field label="Location">
                <input
                  name="location"
                  required
                  defaultValue={type === "edit-project" ? p.location : ""}
                />
              </Field>
              <div className="form-grid">
                <Field label="Start date">
                  <input
                    type="date"
                    name="startDate"
                    required
                    defaultValue={
                      type === "edit-project"
                        ? new Date(p.startDate).toISOString().slice(0, 10)
                        : ""
                    }
                  />
                </Field>
                <Field label="Target date">
                  <input
                    type="date"
                    name="targetDate"
                    required
                    defaultValue={
                      type === "edit-project"
                        ? new Date(p.targetDate).toISOString().slice(0, 10)
                        : ""
                    }
                  />
                </Field>
              </div>
              {type === "edit-project" && (
                <Field label="Status">
                  <select name="status" defaultValue={p.status}>
                    <option>active</option>
                    <option>on hold</option>
                    <option>completed</option>
                  </select>
                </Field>
              )}
            </>
          )}
          {type === "zone" && (
            <Field label="Zone or floor name">
              <input
                name="name"
                required
                minLength={2}
                placeholder="Zone D · North podium"
              />
            </Field>
          )}
          {type === "milestone" && (
            <>
              <Field label="Milestone name">
                <input name="name" minLength={3} required />
              </Field>
              <Field label="Zone">
                <select name="zoneId">
                  {p.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Relative weight (1–100)">
                <input
                  name="weight"
                  type="number"
                  min="1"
                  max="100"
                  required
                  defaultValue="10"
                />
              </Field>
              <p className="subtle">
                Weights are normalised against their total. A weight of 20
                contributes twice as much as 10.
              </p>
              <div className="form-grid">
                <Field label="Baseline start">
                  <input name="startDate" type="date" required />
                </Field>
                <Field label="Baseline target">
                  <input name="targetDate" type="date" required />
                </Field>
              </div>
            </>
          )}
          {error && (
            <div className="alert red" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={close}>
            Cancel
          </button>
          <button disabled={busy || uploading}>
            {busy || uploading
              ? "Saving…"
              : type === "inspection"
                ? "Upload & analyse"
                : type === "report"
                  ? "Generate draft"
                  : "Save " +
                    (type === "progress" ? "verified update" : "changes")}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
