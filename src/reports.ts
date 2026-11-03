import { Capacitor } from "@capacitor/core";
type Row = Record<string, any>;
function rows(report: Row) {
  const item = (i: Row) => [
    i.site_name,
    "MR-" + String(i.number).padStart(6, "0"),
    i.description,
    Number(i.quantity),
    i.unit,
    String(i.required_by).slice(0, 10),
    i.requested_name,
    i.requisition_status === "APPROVED" ? i.item_status : i.requisition_status,
    Number(i.ordered_quantity),
    Number(i.dispatched),
    Number(i.received),
    Number(i.cancelled),
  ];
  return [
    {
      name: "Sites - current",
      headers: [
        "Site",
        "Status",
        "Materials",
        "Pending approval",
        "To order",
        "In transit",
        "Delivered",
        "Open",
        "Overdue",
      ],
      data: (report.siteOverview || []).map((s: Row) => [
        s.name,
        s.status,
        s.materials,
        s.pending,
        s.to_order,
        s.in_transit,
        s.delivered,
        s.open,
        s.overdue,
      ]),
    },
    {
      name: "Order batches - current",
      headers: [
        "Site",
        "Requisition",
        "Material",
        "Ordered",
        "Unit",
        "Sent",
        "Received",
        "Cancelled",
        "Supplier",
        "Contact",
        "Expected",
        "Status",
        "Note",
      ],
      data: (report.orders || []).map((b: Row) => [
        b.site_name,
        "MR-" + String(b.number).padStart(6, "0"),
        b.description,
        Number(b.quantity),
        b.unit,
        Number(b.dispatched),
        Number(b.received),
        Number(b.cancelled),
        b.supplier,
        b.contact,
        b.expected_by?.slice(0, 10) || "Not supplied",
        Number(b.received) + Number(b.cancelled) === Number(b.quantity)
          ? Number(b.received) > 0
            ? "DELIVERED"
            : "CANCELLED"
          : b.shipping_status,
        b.note,
      ]),
    },
    {
      name: "Summary",
      headers: ["Metric", "Count"],
      data: Object.entries(report.summary).map(([key, value]) => [
        (
          {
            raised: "Requisitions raised",
            approved: "Requisitions approved",
            rejected: "Requisitions rejected",
            ordered: "Order batches recorded",
            dispatches: "Dispatch events",
            receipts: "Receipt events",
            delivered: "Material lines completed",
            overdue: "Overdue material lines",
          } as Record<string, string>
        )[key] || key,
        value,
      ]),
    },
    {
      name: "Raised",
      headers: [
        "Site",
        "Requisition",
        "Material",
        "Quantity",
        "Unit",
        "Required by",
        "Requested by",
        "Status",
        "Ordered",
        "Dispatched",
        "Received",
        "Cancelled",
      ],
      data: report.raised.map(item),
    },
    {
      name: "Activity",
      headers: [
        "Site",
        "Requisition",
        "Material",
        "Action",
        "Quantity",
        "Actor",
        "Time",
        "Reason",
      ],
      data: report.activity.map((e: Row) => [
        e.site_name,
        "MR-" + String(e.number).padStart(6, "0"),
        e.description || "",
        e.action,
        e.quantity ? Number(e.quantity) : "",
        e.actor_name,
        new Date(e.created_at).toLocaleString("en-IN", {
          timeZone: report.timezone,
        }),
        e.reason,
      ]),
    },
    {
      name: "Open as of now",
      headers: [
        "Site",
        "Requisition",
        "Material",
        "Quantity",
        "Unit",
        "Required by",
        "Requested by",
        "Status",
        "Ordered",
        "Dispatched",
        "Received",
        "Cancelled",
      ],
      data: report.open.map(item),
    },
  ];
}
export async function exportReport(report: Row, format: "pdf" | "xlsx") {
  const sections = rows(report),
    filename = `redpeach-siteops-${report.date}.${format}`;
  let blob: Blob;
  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Redpeach SiteOps";
    wb.created = new Date(report.generatedAt);
    for (const s of sections) {
      const ws = wb.addWorksheet(s.name);
      ws.addRow([
        `REDPEACH SITEOPS | Report date: ${report.date} | Generated: ${report.generatedAt} | ${report.timezone}`,
      ]);
      ws.addRow(s.headers);
      for (const row of s.data) ws.addRow(row);
      ws.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFBE1220" },
      };
      ws.columns.forEach((c, n) => {
        c.width = n === 2 ? 40 : 23;
      });
      ws.views = [{ state: "frozen", ySplit: 2 }];
      ws.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: Math.max(2, ws.rowCount), column: s.headers.length },
      };
      ws.eachRow((r) => {
        r.alignment = { vertical: "top", wrapText: true };
      });
    }
    blob = new Blob([(await wb.xlsx.writeBuffer()) as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", compress: true });
    const logo = await fetch("/redpeach-logo.png").then((r) => {
      if (!r.ok)
        throw new Error("Unable to load report branding. Please retry.");
      return r.arrayBuffer();
    });
    doc.setProperties({
      title: "Redpeach SiteOps - Operations Report",
      author: "Redpeach Innovations",
      subject: "Site material requisitions, orders and deliveries",
    });
    const width = 297,
      left = 14,
      usable = 269,
      bottom = 192;
    let y = 49;
    const heading = () => {
      doc.addImage(
        new Uint8Array(logo),
        "PNG",
        12,
        -9,
        58,
        58,
        "redpeach-brand",
        "FAST",
      );
      doc.setTextColor(25, 25, 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.text("Redpeach SiteOps", 80, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 88, 96);
      doc.text(`OPERATIONS REPORT  |  ${report.date}`, 80, 26);
      doc.setFontSize(8);
      doc.text(
        `Generated ${new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: report.timezone })} (${report.timezone})`,
        80,
        32,
      );
      doc.setDrawColor(190, 18, 32);
      doc.setLineWidth(0.6);
      doc.line(left, 39, width - left, 39);
    };
    heading();
    doc.setFontSize(9);
    doc.setTextColor(90, 88, 96);
    doc.text(
      "Daily activity uses the selected date. Site, order-batch and outstanding balances show the current position.",
      left,
      y,
    );
    y += 10;
    const metrics = [
      ["REQUISITIONS RAISED", report.summary.raised],
      ["APPROVALS", report.summary.approved],
      ["ORDER BATCHES", report.summary.ordered],
      ["OVERDUE MATERIALS", report.summary.overdue],
    ];
    metrics.forEach(([title, value], n) => {
      const x = left + n * 68;
      doc.setFillColor(248, 246, 247);
      doc.roundedRect(x, y, 64, 23, 2, 2, "F");
      doc.setTextColor(105, 99, 103);
      doc.setFontSize(7);
      doc.text(String(title), x + 4, y + 7);
      doc.setTextColor(25, 25, 28);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), x + 4, y + 18);
      doc.setFont("helvetica", "normal");
    });
    y += 33;
    const nextPage = () => {
      doc.addPage();
      heading();
      y = 49;
    };
    const clean = (v: any) => String(v ?? "").replaceAll("_", " ");
    for (const section of sections) {
      if (y > bottom - 32) nextPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(25, 25, 28);
      doc.text(section.name, left, y);
      y += 7;
      const weights = section.headers.map((h) =>
        h === "Cancelled"
          ? 1.55
          : [
                "Material",
                "Reason",
                "Note",
                "Contact",
                "Supplier",
                "Site",
              ].includes(h)
            ? 2.1
            : [
                  "Quantity",
                  "Ordered",
                  "Received",
                  "Cancelled",
                  "Dispatched",
                  "Sent",
                  "Unit",
                  "Count",
                ].includes(h)
              ? 1.2
              : 1.4,
      );
      const total = weights.reduce((a, b) => a + b, 0),
        columns = weights.map((w) => (w / total) * usable);
      const font = section.headers.length > 10 ? 7 : 8;
      const drawHead = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(font);
        const lines = section.headers.map((h, n) =>
          doc.splitTextToSize(h, columns[n] - 4),
        );
        const height = Math.max(...lines.map((l) => l.length)) * 3.3 + 5;
        doc.setFillColor(37, 35, 39);
        doc.rect(left, y, usable, height, "F");
        doc.setTextColor(255, 255, 255);
        let x = left;
        lines.forEach((l, n) => {
          doc.text(l, x + 2, y + 4);
          x += columns[n];
        });
        y += height;
      };
      drawHead();
      const data = section.data.length
        ? section.data
        : [["No records in this section."]];
      data.forEach((row: any[], index: number) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(font);
        const lines = section.headers.map((_, n) =>
          doc.splitTextToSize(clean(row[n]), columns[n] - 4),
        );
        const height = Math.max(...lines.map((l) => l.length)) * 3.3 + 5;
        if (y + height > bottom) {
          nextPage();
          drawHead();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(font);
        }
        doc.setFillColor(
          ...((index % 2 === 0 ? [249, 248, 249] : [255, 255, 255]) as [
            number,
            number,
            number,
          ]),
        );
        doc.rect(left, y, usable, height, "F");
        doc.setTextColor(38, 36, 40);
        let x = left;
        lines.forEach((l, n) => {
          doc.text(l, x + 2, y + 4);
          x += columns[n];
        });
        y += height;
      });
      y += 12;
    }
    const pages = doc.getNumberOfPages();
    for (let n = 1; n <= pages; n++) {
      doc.setPage(n);
      doc.setDrawColor(225, 222, 226);
      doc.setLineWidth(0.2);
      doc.line(left, 198, width - left, 198);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 94, 101);
      doc.text("REDPEACH INNOVATIONS  /  Internal operations", left, 204);
      doc.text(`${n} / ${pages}`, width - left, 204, { align: "right" });
    }
    blob = doc.output("blob");
  }
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const result = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
    });
    await Share.share({
      title: "Redpeach SiteOps report",
      files: [result.uri],
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
