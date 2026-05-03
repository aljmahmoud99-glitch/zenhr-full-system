import ExcelJS from "exceljs";

// ─── Column definition ──────────────────────────────────────────────────────
export interface ExportColumn {
  key: string;
  header: string;
  headerAr?: string;
  width?: number;
  isArabic?: boolean;
  isCurrency?: boolean;
  isDate?: boolean;
  isNumeric?: boolean;
}

// ─── Options ────────────────────────────────────────────────────────────────
export interface ExportOptions {
  sheetName: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  companyName: string;
  companyNameAr?: string;
  reportTitle: string;
  reportTitleAr?: string;
  filters?: Record<string, string>;
}

// ─── Palette ─────────────────────────────────────────────────────────────────
const ARGB_DARK_GREEN   = "FF1A6B4A";
const ARGB_WHITE        = "FFFFFFFF";
const ARGB_ALT_ROW      = "FFF0F9F4";
const ARGB_HEADER_BG    = "FFE8F5EE";
const ARGB_FILTER_BG    = "FFFFFBEA";
const ARGB_BORDER       = "FFADD8C0";
const ARGB_BORDER_DARK  = "FF0F3D2B";
const ARGB_TEXT_GRAY    = "FF555555";

function thinBorder(argb = ARGB_BORDER): ExcelJS.Borders {
  const s: ExcelJS.Border = { style: "thin", color: { argb } };
  return { top: s, bottom: s, left: s, right: s };
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ─── Main export function ────────────────────────────────────────────────────
export async function generateExcelBuffer(opts: ExportOptions): Promise<Buffer> {
  const {
    sheetName, columns, data,
    companyName, companyNameAr,
    reportTitle, reportTitleAr,
    filters = {},
  } = opts;

  const colCount = columns.length;
  const now = new Date();
  const generatedAt = formatDate(now) + " " + now.toTimeString().slice(0, 5);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ZenJO HRMS";
  wb.created = now;
  wb.properties.date1904 = false;

  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape", paperSize: 9 },
    headerFooter: {
      oddHeader: `&C&B${reportTitle}`,
      oddFooter: `&L${companyName}&RPage &P of &N`,
    },
  });

  // Set column widths upfront
  ws.columns = columns.map(c => ({ width: c.width ?? 18 }));

  // ── Row 1: Company name ──────────────────────────────────────────────────
  const companyLabel = companyNameAr ? `${companyName} / ${companyNameAr}` : companyName;
  ws.addRow([companyLabel, ...Array(colCount - 1).fill("")]);
  ws.mergeCells(1, 1, 1, colCount);
  const r1 = ws.getRow(1);
  r1.height = 28;
  const c1 = r1.getCell(1);
  c1.value = companyLabel;
  c1.font = { bold: true, size: 15, color: { argb: ARGB_DARK_GREEN } };
  c1.alignment = { horizontal: "center", vertical: "middle" };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_HEADER_BG } };

  // ── Row 2: Report title (dark green banner) ──────────────────────────────
  const titleLabel = reportTitleAr ? `${reportTitle}  /  ${reportTitleAr}` : reportTitle;
  ws.addRow([titleLabel, ...Array(colCount - 1).fill("")]);
  ws.mergeCells(2, 1, 2, colCount);
  const r2 = ws.getRow(2);
  r2.height = 24;
  const c2 = r2.getCell(1);
  c2.value = titleLabel;
  c2.font = { bold: true, size: 13, color: { argb: ARGB_WHITE } };
  c2.alignment = { horizontal: "center", vertical: "middle" };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_DARK_GREEN } };

  // ── Row 3: Generation date ───────────────────────────────────────────────
  ws.addRow([`Generated: ${generatedAt}`, ...Array(colCount - 1).fill("")]);
  ws.mergeCells(3, 1, 3, colCount);
  const r3 = ws.getRow(3);
  r3.height = 16;
  const c3 = r3.getCell(1);
  c3.value = `Generated: ${generatedAt}`;
  c3.font = { italic: true, size: 10, color: { argb: ARGB_TEXT_GRAY } };
  c3.alignment = { horizontal: "center" };

  // ── Row 4: Applied filters ──────────────────────────────────────────────
  const filterEntries = Object.entries(filters).filter(([, v]) => v != null && v !== "");
  if (filterEntries.length > 0) {
    const filterText = filterEntries.map(([k, v]) => `${k}: ${v}`).join("    |    ");
    ws.addRow([filterText, ...Array(colCount - 1).fill("")]);
    const filterRowNum = ws.rowCount;
    ws.mergeCells(filterRowNum, 1, filterRowNum, colCount);
    const rf = ws.getRow(filterRowNum);
    rf.height = 16;
    const cf = rf.getCell(1);
    cf.value = filterText;
    cf.font = { size: 10, color: { argb: "FF333333" } };
    cf.alignment = { horizontal: "center" };
    cf.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_FILTER_BG } };
    cf.border = { bottom: { style: "thin", color: { argb: ARGB_BORDER } } };
  }

  // ── Blank spacer row ─────────────────────────────────────────────────────
  ws.addRow([]);
  ws.getRow(ws.rowCount).height = 6;

  // ── Column header row ────────────────────────────────────────────────────
  const colHeaderValues = columns.map(c => c.headerAr ? `${c.header}\n${c.headerAr}` : c.header);
  const headerRow = ws.addRow(colHeaderValues);
  const hasArabicHeader = columns.some(c => c.headerAr);
  headerRow.height = hasArabicHeader ? 38 : 24;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_DARK_GREEN } };
    cell.font = { bold: true, size: 11, color: { argb: ARGB_WHITE } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder(ARGB_BORDER_DARK);
  });

  // ── Data rows ────────────────────────────────────────────────────────────
  const currencyColIdxs = new Set(columns.map((c, i) => c.isCurrency ? i : -1).filter(i => i >= 0));
  const dateColIdxs     = new Set(columns.map((c, i) => c.isDate    ? i : -1).filter(i => i >= 0));
  const arabicColIdxs   = new Set(columns.map((c, i) => c.isArabic  ? i : -1).filter(i => i >= 0));
  const numericColIdxs  = new Set(columns.map((c, i) => c.isNumeric ? i : -1).filter(i => i >= 0));

  data.forEach((record, rowIdx) => {
    const values = columns.map((col, ci) => {
      let v = record[col.key];
      if (dateColIdxs.has(ci)) return v != null ? formatDate(v) : "";
      if (currencyColIdxs.has(ci)) {
        if (v == null) return 0;
        return typeof v === "string" ? parseFloat(v) || 0 : Number(v);
      }
      return v ?? "";
    });

    const row = ws.addRow(values);
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const ci = colNum - 1;

      if (rowIdx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_ALT_ROW } };
      }

      cell.border = thinBorder();

      if (arabicColIdxs.has(ci)) {
        cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
        cell.font = { name: "Arial", size: 10 };
      } else if (currencyColIdxs.has(ci)) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        if (typeof cell.value === "number") cell.numFmt = "#,##0.000";
      } else if (numericColIdxs.has(ci)) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  });

  // ── Footer / totals row ───────────────────────────────────────────────────
  if (data.length > 0) {
    const footerValues: (string | number)[] = columns.map((col, ci) => {
      if (ci === 0) return `Total: ${data.length} record${data.length !== 1 ? "s" : ""}`;
      if (currencyColIdxs.has(ci)) {
        const sum = data.reduce((s, r) => {
          const v = r[col.key];
          return s + (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0);
        }, 0);
        return parseFloat(sum.toFixed(3));
      }
      return "";
    });

    const footerRow = ws.addRow(footerValues);
    footerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const ci = colNum - 1;
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_HEADER_BG } };
      cell.border = {
        top:    { style: "medium", color: { argb: ARGB_DARK_GREEN } },
        bottom: { style: "thin",   color: { argb: ARGB_BORDER } },
        left:   { style: "thin",   color: { argb: ARGB_BORDER } },
        right:  { style: "thin",   color: { argb: ARGB_BORDER } },
      };
      if (currencyColIdxs.has(ci) && typeof cell.value === "number") {
        cell.numFmt = "#,##0.000";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (ci === 0) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  }

  // ── Freeze header pane ───────────────────────────────────────────────────
  const frozenRow = ws.rowCount - data.length;
  ws.views = [{ state: "frozen", ySplit: frozenRow, xSplit: 0 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
