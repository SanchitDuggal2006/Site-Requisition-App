import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError, setCsrf } from "./api";
import { units, roles } from "../server/domain";
import "./style.css";
import {
  SitePhoto,
  UnitPicker,
  BatchPanel,
  SiteDashboard,
  preparePhoto,
} from "./siteops";
type Row = Record<string, any>;
const number = (v: unknown) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const label = (v: string) =>
  v
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (s) => s.toUpperCase());
const mr = (v: unknown) => "MR-" + String(v).padStart(6, "0");
const date = (v: string) => v?.slice(0, 10);
function Chip({ status }: { status: string }) {
  return (
    <span className={"chip " + status.toLowerCase()}>{label(status)}</span>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
function App() {
  const [workspaceRole, setWorkspaceRole] = useState("DIRECTOR");
  const [session, setSession] = useState<Row | null>(null),
    [starting, setStarting] = useState(true),
    [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const pointer = useRef<number | null>(null);
  async function loadSession() {
    try {
      const s = await api("/me");
      setCsrf(s.csrf);
      setSession(s);
      setError("");
    } catch (e) {
      if ((e as ApiError).status === 401) setSession(null);
      else setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  useEffect(() => {
    void loadSession();
    const hash = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  const refresh = () => {
    setRevision((v) => v + 1);
    void loadSession();
  };
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", focus);
    return () => document.removeEventListener("visibilitychange", focus);
  }, []);
  useEffect(() => {
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    import("@capacitor/app").then(async ({ App }) => {
      listener = await App.addListener("backButton", () => {
        if (location.hash && location.hash !== "#/") {
          history.back();
        } else void App.exitApp();
      });
      if (disposed) void listener.remove();
    });
    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, []);
  function go(path: string) {
    location.hash = path;
    window.scrollTo(0, 0);
    setError("");
  }
  const user = session?.user;
  async function logout() {
    try {
      await api("/logout", {});
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sr-draft-"))
        .forEach((k) => localStorage.removeItem(k));
      setSession(null);
      go("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (starting)
    return (
      <main>
        <div className="brand">
          <img src="/redpeach-logo.png" alt="" />
          Redpeach SiteOps
        </div>
        <Empty>Opening your workspace…</Empty>
      </main>
    );
  if (!user) return <Login error={error} onLogin={loadSession} />;
  if (user.must_change_pin || route === "/pin")
    return (
      <main>
        <PinForm
          mandatory={user.must_change_pin}
          onDone={() => {
            setSession(null);
            go("/");
          }}
          onBack={() => go("/")}
        />
      </main>
    );
  const director = user.role === "DIRECTOR";
  const tabs = director
    ? [
        ["/", "Work"],
        ["/manage", "Manage"],
        ["/report", "Report"],
      ]
    : [
        [
          "/",
          user.role === "SUPERVISOR"
            ? "Sites"
            : user.role === "MANAGER"
              ? "Approvals"
              : "Purchase",
        ],
        ["/report", "Report"],
      ];
  return (
    <>
      <header>
        <button className="brand" onClick={() => go("/")}>
          <img src="/redpeach-logo.png" alt="" />
          <span>Redpeach SiteOps</span>
        </button>
        <details className="account">
          <summary aria-label="Account">
            {user.name
              .split(" ")
              .map((x: string) => x[0])
              .slice(0, 2)
              .join("")}
          </summary>
          <div>
            <strong>{user.name}</strong>
            <small>{label(user.role)}</small>
            <button onClick={() => go("/pin")}>Change PIN</button>
            <button onClick={() => void logout()}>Sign out</button>
          </div>
        </details>
      </header>
      <main
        onTouchStart={(e) => {
          pointer.current = window.scrollY === 0 ? e.touches[0].clientY : null;
        }}
        onTouchEnd={(e) => {
          if (
            pointer.current !== null &&
            e.changedTouches[0].clientY - pointer.current > 90
          )
            refresh();
          pointer.current = null;
        }}
      >
        <div className="refresh">
          {director ? (
            <label className="workspace-switch">
              Workspace
              <select
                aria-label="Director workspace"
                value={workspaceRole}
                onChange={(e) => {
                  setWorkspaceRole(e.target.value);
                  go("/");
                }}
              >
                <option value="DIRECTOR">Director · overview</option>
                <option value="MANAGER">Manager · approvals</option>
                <option value="SUPERVISOR">Site · requests & receipts</option>
                <option value="PURCHASE">Purchase · orders</option>
              </select>
            </label>
          ) : (
            <span>{label(user.role)} workspace</span>
          )}
          <button disabled={refreshing} onClick={refresh}>
            {refreshing ? "Refreshing…" : "↓ Refresh"}
          </button>
        </div>
        <ErrorBox message={error} />
        <Workspace
          key={user.id}
          user={{
            ...user,
            workspaceRole: director ? workspaceRole : user.role,
          }}
          day={session!.today}
          timezone={session!.timezone}
          route={route}
          go={go}
          revision={revision}
          refresh={refresh}
          onLoading={setRefreshing}
          onAuth={() => void loadSession()}
        />
      </main>
      <nav aria-label="Main navigation">
        {tabs.map(([path, text]) => (
          <button
            key={path}
            className={
              (
                path === "/"
                  ? !route.startsWith("/report") && !route.startsWith("/manage")
                  : route.startsWith(path)
              )
                ? "selected"
                : ""
            }
            onClick={() => go(path)}
          >
            {text}
          </button>
        ))}
      </nav>
    </>
  );
}
function Login({
  onLogin,
  error: initial,
}: {
  onLogin: () => void;
  error: string;
}) {
  const [error, setError] = useState(initial),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <img
        className="logo"
        src="/redpeach-logo.png"
        alt="Redpeach Innovations"
      />
      <p className="eyebrow">YOUR SITES. ONE SHARED RECORD.</p>
      <h1>Redpeach SiteOps</h1>
      <p className="muted">From the first request to the last delivery.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api("/login", { phone: f.get("phone"), pin: f.get("pin") });
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Sign in</h2>
        <label>
          Mobile number
          <input
            name="phone"
            type="tel"
            autoComplete="username"
            placeholder="Your mobile number"
            required
            maxLength={18}
          />
        </label>
        <label>
          Six-digit PIN
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            onInput={(e) => {
              e.currentTarget.value = e.currentTarget.value
                .replace(/\D/g, "")
                .slice(0, 6);
            }}
            autoComplete="current-password"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
          />
        </label>
        <ErrorBox message={error || initial} />
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="hint">
          Use the account created by your director. Ask them to reset your PIN
          if you cannot sign in.
        </p>
      </form>
    </main>
  );
}
function PinForm({
  mandatory,
  onDone,
  onBack,
}: {
  mandatory: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <h1>{mandatory ? "Set your own PIN" : "Change PIN"}</h1>
      <p>
        Choose any six numbers except obvious PINs such as 123456 or 111111. You
        will sign in again afterwards.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("pin") !== f.get("confirm")) {
            setError("New PINs do not match");
            return;
          }
          setBusy(true);
          try {
            await api("/pin", { current: f.get("current"), pin: f.get("pin") });
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["current", "Current PIN"],
          ["pin", "New PIN"],
          ["confirm", "Confirm new PIN"],
        ].map(([name, text]) => (
          <label key={name}>
            {text}
            <input
              name={name}
              type="password"
              inputMode="numeric"
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value
                  .replace(/\D/g, "")
                  .slice(0, 6);
              }}
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete={
                name === "current" ? "current-password" : "new-password"
              }
            />
          </label>
        ))}
        <ErrorBox message={error} />
        <button className="primary" disabled={busy}>
          Save PIN
        </button>
        {!mandatory && (
          <button type="button" onClick={onBack}>
            Back
          </button>
        )}
      </form>
    </>
  );
}
function Workspace({
  user,
  day,
  timezone,
  route,
  go,
  revision,
  refresh,
  onLoading,
  onAuth,
}: any) {
  const [sites, setSites] = useState<Row[]>([]),
    [requests, setRequests] = useState<Row[]>([]),
    [items, setItems] = useState<Row[]>([]),
    [detail, setDetail] = useState<Row | null>(null),
    [users, setUsers] = useState<Row[]>([]),
    [report, setReport] = useState<Row | null>(null),
    [reportDate, setReportDate] = useState(day),
    [reportSite, setReportSite] = useState(""),
    [filter, setFilter] = useState("Open"),
    [purchaseTab, setPurchaseTab] = useState("To order"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [copy, setCopy] = useState<Row | null>(null);
  const epoch = useRef(0);
  const [loadedRoute, setLoadedRoute] = useState("");
  const [loadedRevision, setLoadedRevision] = useState(-1);
  useEffect(() => {
    const current = ++epoch.current;
    setLoading(true);
    onLoading(true);
    setError("");
    async function load() {
      try {
        const s = await api("/sites");
        if (current !== epoch.current) return;
        setSites(s);
        if (route.startsWith("/request/")) {
          const d = await api("/requisitions/" + route.split("/")[2]);
          if (current !== epoch.current) return;
          setDetail(d);
        } else if (route.startsWith("/report")) {
          const r = await api(
            "/report?date=" +
              reportDate +
              (reportSite ? "&site=" + reportSite : ""),
          );
          if (current !== epoch.current) return;
          setReport(r);
        } else if (route.startsWith("/manage") && user.role === "DIRECTOR") {
          const u = await api("/users");
          if (current !== epoch.current) return;
          setUsers(u);
        } else if (!route.startsWith("/new/")) {
          const [r, i] = await Promise.all([
            api(
              "/requisitions" +
                (route.startsWith("/site/")
                  ? "?site=" + route.split("/")[2]
                  : ""),
            ),
            api("/items"),
          ]);
          if (current !== epoch.current) return;
          setRequests(r);
          setItems(i);
          if (route.startsWith("/site/"))
            await api("/sites/" + route.split("/")[2] + "/seen", {});
        }
      } catch (e) {
        if (current === epoch.current) {
          setError((e as Error).message);
          if ((e as ApiError).status === 401) onAuth();
        }
      } finally {
        if (current === epoch.current) {
          setLoading(false);
          setLoadedRoute(route);
          setLoadedRevision(revision);
          onLoading(false);
        }
      }
    }
    void load();
    return () => {
      epoch.current++;
    };
  }, [route, revision, reportDate, reportSite, user.workspaceRole]);
  const director = user.workspaceRole === "DIRECTOR",
    supervisor = user.workspaceRole === "SUPERVISOR",
    manager = user.workspaceRole === "MANAGER",
    previewingRole =
      user.role === "DIRECTOR" && user.workspaceRole !== "DIRECTOR";
  if (route.startsWith("/new/")) {
    const site = sites.find((s) => s.id === route.split("/")[2]);
    return site ? (
      <NewRequest
        key={user.id + site.id}
        user={user}
        site={site}
        day={day}
        initial={copy}
        onDone={(id: string) => {
          setCopy(null);
          go("/request/" + id);
        }}
        onBack={() => {
          setCopy(null);
          go("/site/" + site.id);
        }}
      />
    ) : (
      <Empty>Loading site…</Empty>
    );
  }
  return (
    <>
      <ErrorBox message={error} />
      {previewingRole && (
        <aside className="director-preview" aria-label="Director role preview">
          <strong>
            Director preview · {label(user.workspaceRole)} workspace
          </strong>
          <span>
            You are viewing this role’s workflow. Your Director account still
            retains every permission, and each action is recorded under your
            Director account.
          </span>
        </aside>
      )}
      {loading && loadedRoute !== route ? (
        <Empty>Loading…</Empty>
      ) : (
        <>
          {route.startsWith("/manage") ? (
            user.role === "DIRECTOR" ? (
              <Manage sites={sites} users={users} refresh={refresh} />
            ) : (
              <Empty>Director access required.</Empty>
            )
          ) : route.startsWith("/report") ? (
            <>
              <h1>Daily report</h1>
              <p className="muted">
                Daily activity, with outstanding requirements as of now.
              </p>
              <div className="form-row">
                <label>
                  Report date
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Site
                  <select
                    value={reportSite}
                    onChange={(e) => setReportSite(e.target.value)}
                  >
                    <option value="">All permitted sites</option>
                    {sites.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {report && <Report report={report} />}
            </>
          ) : route.startsWith("/request/") ? (
            detail && (
              <fieldset
                className="detail-workspace"
                disabled={loading || loadedRevision !== revision}
              >
                <Detail
                  detail={detail}
                  user={user}
                  day={day}
                  timezone={timezone}
                  refresh={refresh}
                  go={go}
                  onCopy={() => {
                    setCopy(detail);
                    go("/new/" + detail.site_id);
                  }}
                />
              </fieldset>
            )
          ) : route.startsWith("/site/") ? (
            <>
              <button className="text-button" onClick={() => go("/")}>
                ← All sites
              </button>
              <h1>{sites.find((s) => s.id === route.split("/")[2])?.name}</h1>
              <h2>Daily requirement</h2>
              {(user.role === "DIRECTOR" || supervisor || manager) &&
                sites.find((s) => s.id === route.split("/")[2])?.active && (
                  <button
                    className="primary"
                    onClick={() => {
                      setCopy(null);
                      go("/new/" + route.split("/")[2]);
                    }}
                  >
                    + New requisition
                  </button>
                )}
              <div className="tabs">
                {["Today", "Open", "All"].map((t) => (
                  <button
                    className={filter === t ? "selected" : ""}
                    key={t}
                    onClick={() => setFilter(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <RequestList
                rows={requests.filter(
                  (r) =>
                    filter === "All" ||
                    (filter === "Today"
                      ? date(r.request_date) === day
                      : !["REJECTED", "CANCELLED"].includes(r.status) &&
                        !r.completed),
                )}
                go={go}
              />
            </>
          ) : supervisor ? (
            <>
              <h1>Your sites</h1>
              <p className="muted">
                Raise requirements and confirm what arrives.
              </p>
              <SiteList sites={sites} go={go} />
            </>
          ) : manager ? (
            <>
              <h1>Your sites & approvals</h1>
              <SiteList sites={sites} go={go} />
              <h2>Awaiting approval</h2>
              <p className="muted">
                Review requirements for your assigned sites.
              </p>
              <RequestList
                rows={requests.filter((r) => r.status === "SUBMITTED")}
                go={go}
                grouped
              />
            </>
          ) : (
            <>
              <h1>{director ? "Site operations" : "Purchase"}</h1>
              {director && (
                <>
                  <h2>
                    Awaiting approval{" "}
                    <span className="count">
                      {requests.filter((r) => r.status === "SUBMITTED").length}
                    </span>
                  </h2>
                  <RequestList
                    rows={requests.filter((r) => r.status === "SUBMITTED")}
                    go={go}
                    grouped
                  />
                  <h2>Sites</h2>
                  <SiteList sites={sites} go={go} />
                </>
              )}
              <h2>Material follow-up</h2>
              <div className="tabs">
                {["To order", "In progress", "History"].map((t) => (
                  <button
                    className={purchaseTab === t ? "selected" : ""}
                    key={t}
                    onClick={() => setPurchaseTab(t)}
                  >
                    {t}{" "}
                    <span className="count">
                      {
                        (t === "History"
                          ? requests.filter((r) => r.status === "APPROVED")
                          : items.filter((i) =>
                              t === "To order"
                                ? Number(i.ordered_quantity) +
                                    Number(i.cancelled) <
                                  Number(i.quantity)
                                : Number(i.ordered_quantity) >
                                  Number(i.received),
                            )
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              {purchaseTab === "History" ? (
                <RequestList
                  rows={requests.filter((r) => r.status === "APPROVED")}
                  go={go}
                  grouped
                />
              ) : items.filter((i) =>
                  purchaseTab === "To order"
                    ? Number(i.ordered_quantity) + Number(i.cancelled) <
                      Number(i.quantity)
                    : Number(i.ordered_quantity) > Number(i.received),
                ).length === 0 ? (
                <Empty>No items here. You’re up to date.</Empty>
              ) : (
                items
                  .filter((i) =>
                    purchaseTab === "To order"
                      ? Number(i.ordered_quantity) + Number(i.cancelled) <
                        Number(i.quantity)
                      : Number(i.ordered_quantity) > Number(i.received),
                  )
                  .map((i) => (
                    <button
                      className="card list-card"
                      key={i.id}
                      onClick={() => go("/request/" + i.requisition_id)}
                    >
                      <small>
                        {i.site_name} · {mr(i.number)}
                      </small>
                      <strong>{i.description}</strong>
                      <span>
                        {number(i.quantity)} {i.unit} · Needed{" "}
                        {date(i.required_by)}
                      </span>
                      <div>
                        <Chip status={i.item_status} />
                        {date(i.required_by) < day && (
                          <span className="overdue">Overdue</span>
                        )}
                      </div>
                    </button>
                  ))
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
function SiteList({ sites, go }: any) {
  return sites.length ? (
    sites.map((s: Row) => (
      <button
        className="card list-card"
        key={s.id}
        onClick={() => go("/site/" + s.id)}
      >
        <SitePhoto site={s} />
        <strong>{s.name}</strong>
        <Chip status={s.status || "ACTIVE"} />
        {s.updated > 0 && <span className="badge">{s.updated} updated</span>}
      </button>
    ))
  ) : (
    <Empty>No sites assigned yet. Ask your director to assign a site.</Empty>
  );
}
function RequestList({ rows, go, grouped = false }: any) {
  if (!rows.length) return <Empty>No requisitions to show.</Empty>;
  const sorted = grouped
    ? [...rows].sort(
        (a, b) =>
          a.site_name.localeCompare(b.site_name) ||
          b.created_at.localeCompare(a.created_at),
      )
    : rows;
  let previous = "";
  return sorted.map((r: Row) => {
    const heading = grouped && previous !== r.site_name;
    previous = r.site_name;
    return (
      <React.Fragment key={r.id}>
        {heading && <h3>{r.site_name}</h3>}
        <button
          className="card list-card"
          onClick={() => go("/request/" + r.id)}
        >
          <div className="between">
            <strong>{mr(r.number)}</strong>
            <Chip
              status={
                r.completed && r.status === "APPROVED" ? "COMPLETED" : r.status
              }
            />
          </div>
          <span>
            {r.item_count} material items · {date(r.request_date)}
          </span>
          <small>Requested by {r.requested_name}</small>
        </button>
      </React.Fragment>
    );
  });
}
function NewRequest({ user, site, day, initial, onDone, onBack }: any) {
  const key = "sr-draft-" + user.id + "-" + site.id;
  const blank = () => ({
    description: "",
    quantity: "",
    unit: "nos",
    requiredBy: day,
  });
  const [draft, setDraft] = useState(() => {
      if (initial)
        return {
          key: crypto.randomUUID(),
          note: initial.note,
          items: initial.items.map((i: Row) => ({
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            requiredBy: date(i.required_by) < day ? day : date(i.required_by),
          })),
        };
      try {
        return (
          JSON.parse(localStorage.getItem(key) || "null") || {
            key: crypto.randomUUID(),
            note: "",
            items: [blank()],
          }
        );
      } catch {
        return { key: crypto.randomUUID(), note: "", items: [blank()] };
      }
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, key]);
  function update(index: number, field: string, value: string) {
    setDraft({
      ...draft,
      items: draft.items.map((i: Row, n: number) =>
        n === index ? { ...i, [field]: value } : i,
      ),
    });
  }
  return (
    <>
      <button className="text-button" onClick={onBack}>
        ← {site.name}
      </button>
      <h1>New requisition</h1>
      <p className="muted">
        {site.name} · Requested by {user.name}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await api("/requisitions", { ...draft, siteId: site.id });
            localStorage.removeItem(key);
            onDone(r.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Request date
          <input value={day} readOnly />
        </label>
        {draft.items.map((i: Row, n: number) => (
          <fieldset className="card" key={n}>
            <legend>Material {n + 1}</legend>
            <label>
              Material description
              <input
                value={i.description}
                maxLength={200}
                required
                onChange={(e) => update(n, "description", e.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Quantity
                <input
                  value={i.quantity}
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  max="999999999"
                  step="0.001"
                  required
                  onChange={(e) => update(n, "quantity", e.target.value)}
                />
              </label>
              <UnitPicker
                value={i.unit}
                onChange={(v: string) => update(n, "unit", v)}
              />
            </div>
            <label>
              Required by
              <input
                type="date"
                min={day}
                value={i.requiredBy}
                required
                onChange={(e) => update(n, "requiredBy", e.target.value)}
              />
            </label>
            {draft.items.length > 1 && (
              <button
                type="button"
                className="danger-text"
                onClick={() => {
                  if (confirm("Remove this material row?"))
                    setDraft({
                      ...draft,
                      items: draft.items.filter((_: Row, j: number) => j !== n),
                    });
                }}
              >
                Remove material
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          disabled={draft.items.length >= 50}
          onClick={() =>
            setDraft({ ...draft, items: [...draft.items, blank()] })
          }
        >
          + Add material
        </button>
        <label>
          Note <span className="muted">(optional)</span>
          <textarea
            value={draft.note}
            maxLength={300}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </label>
        <ErrorBox message={error} />
        {storageError ? (
          <ErrorBox message="This device cannot save the draft. Keep this screen open until submission succeeds." />
        ) : (
          <p className="hint">
            Draft saved on this device until submission. Internet is required to
            submit.
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Submitting…" : "Submit requisition"}
        </button>
      </form>
    </>
  );
}
function Detail({ detail: d, user, day, timezone, refresh, go, onCopy }: any) {
  const [action, setAction] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setAction(null);
  }, [d.id, d.items.map((i: Row) => i.id + ":" + i.version).join("|")]);
  const director = user.role === "DIRECTOR";
  async function status(status: string, reason = "") {
    setBusy(true);
    setError("");
    try {
      await api("/requisitions/" + d.id + "/status", { status, reason });
      refresh();
      setAction(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="text-button" onClick={() => go("/site/" + d.site_id)}>
        ← {d.site_name}
      </button>
      <div className="between">
        <h1>{mr(d.number)}</h1>
        <Chip status={d.status} />
      </div>
      <p>{d.site_name}</p>
      <p className="muted">
        Requested by {d.requested_name} · {date(d.request_date)}
      </p>
      {d.note && <p className="note">{d.note}</p>}
      <ErrorBox message={error} />
      {user.role === "SUPERVISOR" && (
        <p className="role-guidance">
          Supervisor access: raise requisitions for your assigned sites and
          confirm receipt. Only a manager or Director can approve; only Purchase
          or a Director can order.
        </p>
      )}
      {d.status === "SUBMITTED" && (
        <div className="actions">
          {(director || user.role === "MANAGER") && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void status("APPROVED")}
              >
                Approve requisition
              </button>
              <button
                disabled={busy}
                onClick={() => setAction({ type: "reject" })}
              >
                Reject
              </button>
            </>
          )}
          {(director ||
            (["SUPERVISOR", "MANAGER"].includes(user.role) &&
              d.requested_by === user.id)) && (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm("Cancel this requisition? This cannot be undone."))
                  void status("CANCELLED");
              }}
            >
              Cancel requisition
            </button>
          )}
        </div>
      )}
      {["REJECTED", "CANCELLED"].includes(d.status) &&
        (director || ["SUPERVISOR", "MANAGER"].includes(user.role)) && (
          <button onClick={onCopy}>Copy as new requisition</button>
        )}
      {action?.type === "reject" && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void status(
              "REJECTED",
              String(new FormData(e.currentTarget).get("reason")),
            );
          }}
        >
          <label>
            Reason for rejection
            <textarea name="reason" required maxLength={300} />
          </label>
          <button className="danger" disabled={busy}>
            Confirm rejection
          </button>
          <button type="button" onClick={() => setAction(null)}>
            Back
          </button>
        </form>
      )}
      <h2>Materials</h2>
      {d.items.map((i: Row) => (
        <section className="card" key={i.id}>
          <div className="between">
            <h3>{i.description}</h3>
            {d.status === "APPROVED" && <Chip status={i.item_status} />}
          </div>
          <p>
            <strong>
              {number(i.quantity)} {i.unit}
            </strong>{" "}
            · Needed {date(i.required_by)}
          </p>
          {!["REJECTED", "CANCELLED"].includes(d.status) &&
            !["DELIVERED", "CANCELLED"].includes(i.item_status) &&
            date(i.required_by) < day && <p className="overdue">Overdue</p>}
          {d.status === "APPROVED" && (
            <>
              <div className="order-progress">
                <div className="between">
                  <span>
                    Ordered {number(i.ordered_quantity)} /{" "}
                    {number(Number(i.quantity) - Number(i.cancelled))} {i.unit}
                  </span>
                  <strong>
                    {Math.round(
                      (Number(i.ordered_quantity) /
                        Math.max(
                          0.001,
                          Number(i.quantity) - Number(i.cancelled),
                        )) *
                        100,
                    )}
                    %
                  </strong>
                </div>
                <progress
                  aria-label="Ordered quantity"
                  value={Number(i.ordered_quantity)}
                  max={Math.max(
                    0.001,
                    Number(i.quantity) - Number(i.cancelled),
                  )}
                />
              </div>
              <div className="quantities">
                <span>
                  Sent <strong>{number(i.dispatched)}</strong>
                </span>
                <span>
                  Received <strong>{number(i.received)}</strong>
                </span>
                <span>
                  Cancelled <strong>{number(i.cancelled)}</strong>
                </span>
                <span>
                  Still needed{" "}
                  <strong>
                    {number(
                      Number(i.quantity) -
                        Number(i.received) -
                        Number(i.cancelled),
                    )}
                  </strong>
                </span>
              </div>
              {i.supplier && <p className="muted">Supplier: {i.supplier}</p>}
              <div className="actions">
                {(director || user.role === "PURCHASE") &&
                  Number(i.quantity) >
                    Number(i.received) + Number(i.cancelled) && (
                    <>
                      {Number(i.ordered_quantity) + Number(i.cancelled) <
                        Number(i.quantity) && (
                        <button
                          onClick={() =>
                            setAction({ type: "ORDERED", item: i })
                          }
                        >
                          {Number(i.ordered_quantity) > 0
                            ? "Order next batch"
                            : "Mark ordered"}
                        </button>
                      )}
                      {Number(i.dispatched) < Number(i.ordered_quantity) && (
                        <button
                          onClick={() =>
                            setAction({ type: "DISPATCHED", item: i })
                          }
                        >
                          Record dispatch
                        </button>
                      )}
                      {Number(i.dispatched) + Number(i.cancelled) <
                        Number(i.quantity) && (
                        <button
                          onClick={() =>
                            setAction({ type: "CANCELLED", item: i })
                          }
                        >
                          Cancel remaining quantity
                        </button>
                      )}
                    </>
                  )}
                {(director || ["SUPERVISOR", "MANAGER"].includes(user.role)) &&
                  Number(i.received) < Number(i.dispatched) && (
                    <button
                      className="primary"
                      onClick={() => setAction({ type: "RECEIVED", item: i })}
                    >
                      Confirm receipt
                    </button>
                  )}
              </div>
              <BatchPanel
                batches={(d.batches || []).filter(
                  (b: Row) => b.item_id === i.id,
                )}
                item={i}
                canPurchase={director || user.role === "PURCHASE"}
                onAction={(type: string, batch: Row) =>
                  setAction({ type, item: i, batch })
                }
              />
              {action?.item?.id === i.id && (
                <ItemAction
                  key={action!.type + (action!.batch?.id || "")}
                  action={action}
                  onClose={() => setAction(null)}
                  onDone={() => {
                    setAction(null);
                    refresh();
                  }}
                />
              )}
            </>
          )}
        </section>
      ))}
      <h2>History</h2>
      <ol className="timeline">
        {d.events.map((e: Row) => (
          <li key={e.id}>
            <strong>
              {label(e.action)}
              {e.quantity ? " · " + number(e.quantity) : ""}
            </strong>
            {e.item_id && (
              <span>
                {d.items.find((i: Row) => i.id === e.item_id)?.description} ·{" "}
                {d.items.find((i: Row) => i.id === e.item_id)?.unit}
              </span>
            )}
            <span>
              {e.actor_name} ·{" "}
              {new Date(e.created_at).toLocaleString("en-IN", {
                timeZone: timezone,
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
            {e.reason && <p>{e.reason}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}
function ItemAction({ action: a, onClose, onDone }: any) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const i = a.item,
    b = a.batch;
  const max =
    a.type === "ORDERED"
      ? Number(i.quantity) - Number(i.cancelled) - Number(i.ordered_quantity)
      : a.type === "DISPATCHED"
        ? Number(i.ordered_quantity) - Number(i.dispatched)
        : a.type === "RECEIVED"
          ? Number(i.dispatched) - Number(i.received)
          : Number(i.quantity) - Number(i.dispatched) - Number(i.cancelled);
  return (
    <form
      className="action-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          a.type === "CANCELLED" &&
          !confirm(
            "Cancel this quantity permanently? Unsent order quantities will also be reduced.",
          )
        )
          return;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await api("/items/" + i.id + "/action", {
            action: a.type,
            version: i.version,
            ...(a.type !== "STATUS"
              ? { quantity: Number(f.get("quantity")) }
              : {}),
            reason: String(f.get("reason") || ""),
            ...(["ORDERED", "STATUS"].includes(a.type)
              ? {
                  supplier: String(f.get("supplier") || ""),
                  contact: String(f.get("contact") || ""),
                  ...(f.get("expectedBy")
                    ? { expectedBy: f.get("expectedBy") }
                    : {}),
                  ...(b
                    ? { batchId: b.id, shippingStatus: f.get("shippingStatus") }
                    : {}),
                }
              : {}),
          });
          onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        {a.type === "ORDERED"
          ? "Record an order batch"
          : a.type === "STATUS"
            ? "Update order & delivery"
            : a.type === "RECEIVED"
              ? "Confirm what arrived"
              : label(a.type)}
      </h3>
      {a.type !== "STATUS" && (
        <label>
          Quantity ({i.unit}) · maximum {number(max)}
          <input
            name="quantity"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            max={max}
            defaultValue={max}
            required
          />
        </label>
      )}
      {["ORDERED", "STATUS"].includes(a.type) && (
        <>
          <label>
            Supplier (optional)
            <input
              name="supplier"
              maxLength={150}
              defaultValue={b?.supplier || ""}
            />
          </label>
          <label>
            Supplier / delivery contact (optional)
            <input
              name="contact"
              maxLength={100}
              placeholder="Name and mobile number"
              defaultValue={b?.contact || ""}
            />
          </label>
          <label>
            Expected delivery
            <input
              name="expectedBy"
              type="date"
              required={a.type === "ORDERED"}
              defaultValue={
                b
                  ? b.expected_by?.slice(0, 10) || ""
                  : new Date().toLocaleDateString("en-CA", {
                      timeZone: "Asia/Kolkata",
                    })
              }
            />
          </label>
        </>
      )}
      {a.type === "STATUS" && (
        <label>
          Delivery status
          <select name="shippingStatus" defaultValue={b.shipping_status}>
            {["NOT_SHIPPED", "IN_TRANSIT", "DELAYED"].map((v) => (
              <option
                key={v}
                value={v}
                disabled={
                  (v === "NOT_SHIPPED" && Number(b.dispatched) > 0) ||
                  (v === "IN_TRANSIT" &&
                    Number(b.dispatched) <= Number(b.received))
                }
              >
                {label(v)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {a.type === "CANCELLED" ? "Reason" : "Note (optional)"}
        <textarea
          name="reason"
          maxLength={300}
          required={a.type === "CANCELLED"}
          defaultValue={b?.note || ""}
        />
      </label>
      {a.type === "DISPATCHED" || a.type === "RECEIVED" ? (
        <p className="hint">
          Allocated to the oldest open batches first. Confirm only the quantity
          actually sent or received.
        </p>
      ) : null}
      <ErrorBox message={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>
          Confirm
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Back
        </button>
      </div>
    </form>
  );
}
function Manage({ sites, users, refresh }: any) {
  const [tab, setTab] = useState("Users"),
    [editing, setEditing] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <h1>Manage your team</h1>
      <div className="tabs">
        {["Users", "Sites"].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              setEditing(null);
              setError("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <button
        className="primary"
        onClick={() =>
          setEditing(
            tab === "Users"
              ? {
                  name: "",
                  phone: "",
                  role: "SUPERVISOR",
                  active: true,
                  site_ids: [],
                }
              : { name: "", active: true, status: "ACTIVE", version: 0 },
          )
        }
      >
        + Add {tab === "Users" ? "user" : "site"}
      </button>
      <ErrorBox message={error} />
      {editing && (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const pin = String(f.get("pin") || "");
            setBusy(true);
            setError("");
            try {
              await api(
                tab === "Users" ? "/users" : "/sites",
                tab === "Users"
                  ? {
                      id: editing.id,
                      name: editing.name,
                      phone: editing.phone,
                      role: editing.role,
                      active: editing.active,
                      siteIds: editing.site_ids,
                      ...(pin ? { pin } : {}),
                    }
                  : editing,
              );
              setEditing(null);
              refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {editing.id ? "Edit" : "Add"} {tab === "Users" ? "user" : "site"}
          </h2>
          <label>
            Name
            <input
              value={editing.name}
              required
              maxLength={100}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          {tab === "Users" && (
            <>
              <label>
                Mobile number
                <input
                  type="tel"
                  value={editing.phone}
                  required
                  onChange={(e) =>
                    setEditing({ ...editing, phone: e.target.value })
                  }
                />
              </label>
              <label>
                Role
                <select
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value })
                  }
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {label(r)}
                    </option>
                  ))}
                </select>
              </label>
              {["SUPERVISOR", "MANAGER"].includes(editing.role) && (
                <fieldset>
                  <legend>Assigned sites</legend>
                  {sites.map((s: Row) => (
                    <label className="checkbox" key={s.id}>
                      <input
                        type="checkbox"
                        checked={editing.site_ids.includes(s.id)}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            site_ids: e.target.checked
                              ? [...editing.site_ids, s.id]
                              : editing.site_ids.filter(
                                  (id: string) => id !== s.id,
                                ),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <label>
                {editing.id
                  ? "Reset PIN (leave blank to keep current PIN)"
                  : "Temporary PIN"}
                <input
                  name="pin"
                  type="password"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  inputMode="numeric"
                  onInput={(e) => {
                    e.currentTarget.value = e.currentTarget.value
                      .replace(/\D/g, "")
                      .slice(0, 6);
                  }}
                  required={!editing.id}
                />
              </label>
              <p className="hint">
                The user must change a temporary PIN at first login. Resetting
                it signs them out.
              </p>
            </>
          )}
          {tab === "Sites" && (
            <>
              <label>
                Site status
                <select
                  value={editing.status || "ACTIVE"}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                >
                  {["ACTIVE", "PIPELINE", "TO_START", "COMPLETED"].map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">
                Completed sites retain their history and stop accepting new
                requests. Existing orders can still be closed.
              </p>
              <label>
                Site photo (optional)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setError("");
                    try {
                      const photo = await preparePhoto(file);
                      setEditing((current) =>
                        current ? { ...current, photo } : current,
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {editing.photo ? (
                <img
                  className="photo-preview"
                  src={editing.photo}
                  alt="Site preview"
                />
              ) : editing.has_photo && editing.photo !== null ? (
                <SitePhoto site={editing} />
              ) : null}
              {(editing.photo || editing.has_photo) && (
                <button
                  type="button"
                  onClick={() =>
                    setEditing({ ...editing, photo: null, has_photo: false })
                  }
                >
                  Remove photo
                </button>
              )}
            </>
          )}
          {tab === "Users" && (
            <p className="hint">
              {editing.role === "DIRECTOR"
                ? "Full control across all sites, users and orders."
                : editing.role === "MANAGER"
                  ? "Assigned sites: raise and approve requests (including own), track deliveries and confirm receipt. Cannot order."
                  : editing.role === "SUPERVISOR"
                    ? "Assigned sites: raise requests and confirm receipts. Cannot approve or order."
                    : "Approved requests only: order batches, record dispatch and update delivery details. Cannot approve."}{" "}
              Remove access by switching Active off; history is retained.
            </p>
          )}
          {tab === "Users" && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => {
                    if (
                      e.target.checked ||
                      confirm(
                        "Deactivate this " +
                          (tab === "Users" ? "user" : "site") +
                          "?",
                      )
                    )
                      setEditing({ ...editing, active: e.target.checked });
                  }}
                />
                Active
              </label>
            </>
          )}
          <div className="actions">
            <button className="primary" disabled={busy}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {(tab === "Users" ? users : sites).map((r: Row) => (
        <button
          className="card list-card"
          key={r.id}
          onClick={() => setEditing({ ...r })}
        >
          <strong>{r.name}</strong>
          <span>
            {tab === "Users"
              ? label(r.role) + " · " + r.phone
              : label(r.status || "ACTIVE")}
          </span>
          {!r.active && <small>Inactive</small>}
        </button>
      ))}
    </>
  );
}
function Report({ report: r }: any) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function download(format: "pdf" | "xlsx") {
    setBusy(true);
    setError("");
    try {
      const { exportReport } = await import("./reports");
      await exportReport(r, format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="actions">
        <button disabled={busy} onClick={() => void download("pdf")}>
          ↓ PDF
        </button>
        <button disabled={busy} onClick={() => void download("xlsx")}>
          ↓ Excel
        </button>
      </div>
      <ErrorBox message={error} />
      <dl className="summary">
        {Object.entries(r.summary)
          .filter(([key]) =>
            ["raised", "approved", "ordered", "overdue"].includes(key),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt>{label(key)}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
      </dl>
      <p className="hint">
        Raised / approved / rejected count requisitions. Ordered counts order
        batches; delivered counts material completions; dispatches / receipts
        count recorded events. Overdue is the number of outstanding items as of
        now.
      </p>
      <SiteDashboard sites={r.siteOverview || []} />
      <details className="report-section">
        <summary>
          Requisitions raised · {r.date} · {r.raised.length} material lines
        </summary>
        <h2>Raised on {r.date}</h2>
        <ReportItems rows={r.raised} />
      </details>
      <details className="report-section">
        <summary>Activity log · {r.activity.length} updates</summary>
        <h2>Activity on {r.date}</h2>
        {r.activity.length ? (
          r.activity.map((e: Row) => (
            <div className="card" key={e.id}>
              <strong>
                {e.site_name} · {mr(e.number)}
              </strong>
              <p>
                {label(e.action)}
                {e.description ? " · " + e.description : ""}
                {e.quantity ? " · " + number(e.quantity) : ""}
              </p>
              <small>
                {e.actor_name} ·{" "}
                {new Date(e.created_at).toLocaleTimeString("en-IN", {
                  timeZone: r.timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
              {e.reason && <p>{e.reason}</p>}
            </div>
          ))
        ) : (
          <Empty>No activity on this date.</Empty>
        )}
      </details>
      <details className="report-section" open>
        <summary>Outstanding materials · {r.open.length}</summary>
        <h2>Open and overdue</h2>
        <p className="muted">As of now · {r.today}</p>
        <ReportItems rows={r.open} day={r.today} />
      </details>
    </>
  );
}
function ReportItems({ rows, day }: any) {
  return rows.length ? (
    rows.map((i: Row) => (
      <div className="card" key={i.id}>
        <small>
          {i.site_name} · {mr(i.number)}
        </small>
        <h3>{i.description}</h3>
        <p>
          {number(i.quantity)} {i.unit} · Needed {date(i.required_by)}
        </p>
        <p className="muted">Requested by {i.requested_name}</p>
        <Chip
          status={
            i.requisition_status === "APPROVED"
              ? i.item_status
              : i.requisition_status
          }
        />
        {day && date(i.required_by) < day && (
          <span className="overdue">Overdue</span>
        )}
        <p className="hint">
          Ordered {number(i.ordered_quantity)} · Sent {number(i.dispatched)} ·
          Received {number(i.received)} · Cancelled {number(i.cancelled)}
        </p>
      </div>
    ))
  ) : (
    <Empty>No items to show.</Empty>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
