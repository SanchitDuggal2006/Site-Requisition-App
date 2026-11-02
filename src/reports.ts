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
    Number(i.dispatched),
    Number(i.received),
    Number(i.cancelled),
  ];
  return [
    {
      name: "Summary",
      headers: ["Metric", "Count"],
      data: Object.entries(report.summary),
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
    filename = `site-requisitions-${report.date}.${format}`;
  let blob: Blob;
  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Site Requisitions";
    wb.created = new Date(report.generatedAt);
    for (const s of sections) {
      const ws = wb.addWorksheet(s.name);
      ws.addRow([
        `Report date: ${report.date} | Generated: ${report.generatedAt} | ${report.timezone}`,
      ]);
      ws.addRow(s.headers);
      for (const row of s.data) ws.addRow(row);
      ws.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF21583D" },
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
    const doc = new jsPDF();
    let y = 20;
    const text = (value: string, size = 10, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(value, 180);
      for (const line of lines) {
        if (y > 274) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, 15, y);
        y += size * 0.48 + 1;
      }
      y += 3;
    };
    text("SITE REQUISITIONS", 18, true);
    text(`Daily report: ${report.date}`, 13, true);
    text(
      `Generated ${new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: report.timezone })} (${report.timezone})`,
      9,
    );
    text(
      "Open and overdue entries reflect the current state, not a historical snapshot.",
      9,
    );
    for (const s of sections) {
      y += 5;
      text(s.name, 14, true);
      if (!s.data.length) text("No records.");
      for (const row of s.data) {
        text(
          row.map((v: any, n: number) => `${s.headers[n]}: ${v}`).join("  |  "),
        );
      }
    }
    const pages = doc.getNumberOfPages();
    for (let n = 1; n <= pages; n++) {
      doc.setPage(n);
      doc.setFontSize(8);
      doc.text(`${n} / ${pages}`, 190, 290, { align: "right" });
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
      title: "Site requisitions report",
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
