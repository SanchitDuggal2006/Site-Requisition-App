import React, { useEffect, useState } from "react";
import { units } from "../server/domain";
import { api } from "./api";
type Row = Record<string, any>;
const label = (v: string) =>
  v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
const num = (v: any) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
export function SitePhoto({ site }: { site: Row }) {
  return site.has_photo ? (
    <img
      className="site-photo"
      src={`/api/sites/${site.id}/photo?v=${site.version}`}
      alt={`${site.name} site`}
      loading="lazy"
    />
  ) : (
    <div className="site-placeholder" aria-hidden="true">
      <span>{site.name?.slice(0, 2).toUpperCase()}</span>
      <span className="site-lines" />
    </div>
  );
}
export function UnitPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    api("/units")
      .then((v) => {
        if (active) setSaved(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const all = [...new Set([...units, ...saved, value])];
  const shown = all.filter((u) =>
    u.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="unit-picker">
      <label>
        Search / type custom unit
        <input
          value={search}
          maxLength={30}
          placeholder="e.g. sqft, cft, bag"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        Unit
        <select
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSearch("");
          }}
        >
          {!shown.includes(value) && <option value={value}>{value}</option>}
          {shown.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          {search.trim() && !all.includes(search.trim()) && (
            <option value={search.trim()}>Use custom: {search.trim()}</option>
          )}
        </select>
      </label>
    </div>
  );
}
export function BatchPanel({ batches, item, canPurchase, onAction }: any) {
  return batches.length ? (
    <div className="batch-list">
      <h4>
        Order batches <span className="count">{batches.length}</span>
      </h4>
      {batches.map((b: Row, n: number) => {
        const closed =
          Number(b.received) + Number(b.cancelled) === Number(b.quantity);
        const status = closed
          ? Number(b.received) > 0
            ? "DELIVERED"
            : "CANCELLED"
          : b.shipping_status;
        return (
          <div className="batch" key={b.id}>
            <div className="between">
              <strong>
                Batch {n + 1} · {num(b.quantity)} {item.unit}
              </strong>
              <span className={`chip ${status.toLowerCase()}`}>
                {label(status)}
              </span>
            </div>
            <p>{b.supplier || "Supplier not supplied"}</p>
            <dl className="batch-meta">
              <div>
                <dt>Expected delivery</dt>
                <dd>{b.expected_by?.slice(0, 10) || "Not supplied"}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{b.contact || "Not supplied"}</dd>
              </div>
            </dl>
            <p className="hint">
              Sent {num(b.dispatched)} · Received {num(b.received)} · Cancelled{" "}
              {num(b.cancelled)}
            </p>
            {b.note && <p>{b.note}</p>}
            {canPurchase && !closed && (
              <button onClick={() => onAction("STATUS", b)}>
                Update delivery · batch {n + 1}
              </button>
            )}
          </div>
        );
      })}
    </div>
  ) : null;
}
export function SiteDashboard({ sites }: { sites: Row[] }) {
  return (
    <section className="site-dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PORTFOLIO AT A GLANCE</p>
          <h2>Site overview</h2>
        </div>
        <span className="muted">Current position</span>
      </div>
      <p className="hint">
        Counts are material lines, not mixed-unit quantities. Current position
        is independent of the report date.
      </p>
      <div className="site-grid">
        {sites.map((s) => (
          <article className="site-tile" key={s.id}>
            <SitePhoto site={s} />
            <div className="site-tile-body">
              <div className="between">
                <h3>{s.name}</h3>
                <span className="chip">{label(s.status)}</span>
              </div>
              <div className="site-stats">
                <div>
                  <strong>{s.pending}</strong>
                  <small>Approval</small>
                </div>
                <div>
                  <strong>{s.to_order}</strong>
                  <small>To order</small>
                </div>
                <div>
                  <strong>{s.in_transit}</strong>
                  <small>In transit</small>
                </div>
                <div>
                  <strong className={s.overdue ? "danger-text" : ""}>
                    {s.overdue}
                  </strong>
                  <small>Overdue</small>
                </div>
              </div>
              <p className="hint">
                {s.delivered} delivered · {s.open} open · {s.materials} total
                material lines
              </p>
              <progress
                aria-label={`${s.name} delivered materials`}
                value={s.delivered}
                max={Math.max(1, s.materials)}
              />
            </div>
          </article>
        ))}
      </div>
      {!sites.length && <p className="empty">No sites in this view.</p>}
    </section>
  );
}
export async function preparePhoto(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG or WebP photo under 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(
      1,
      640 / image.naturalWidth,
      480 / image.naturalHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.75, 0.55, 0.35]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= 160000) return data;
    }
    throw new Error("This photo is too detailed. Choose a smaller photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
