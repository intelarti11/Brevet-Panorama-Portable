import * as XLSX from "./spreadsheet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {strFromU8, strToU8, unzipSync, zipSync} from "fflate";

import type {
  BrevetBlancPanoramaReportData,
  PanoramaClassDetailStudentRow,
  PanoramaClassReportRow,
  PanoramaGenderSubjectComparisonRow,
  PanoramaRankingRow,
  PanoramaScholarshipSubjectComparisonRow,
  PanoramaSubjectReportRow,
  ScoreDistribution,
} from "@/lib/brevet-blanc-panorama-report";

type CellType = "text" | "int" | "number" | "average" | "progression";
type Alignment = "left" | "center" | "right";

interface ColumnDefinition<Row> {
  label: string;
  width: number;
  cellType?: CellType;
  align?: Alignment;
  value: (row: Row) => string | number | undefined;
}

interface PdfTableOptions {
  fontSize?: number;
  cellPadding?: number;
  footerRows?: Array<Array<string | number | undefined>>;
}

interface XlsxTableOptions {
  leadingRows?: Array<Array<string | number | undefined>>;
  footerRows?: Array<Array<string | number | undefined>>;
}

interface XlsxSheetViewOptions {
  sheetName: string;
  topRows?: number;
  hideGridLines?: boolean;
  hideRowColHeaders?: boolean;
  lastVisibleColumn?: number;
  hideTrailingRows?: boolean;
  fitToWidth?: number;
  fitToHeight?: number;
  printArea?: string;
}

interface PdfBarChartSeries {
  label: string;
  color: [number, number, number];
  values: Array<number | undefined>;
}

interface PdfDistributionSlice {
  label: string;
  value: number;
  percentage: number;
  color: [number, number, number];
}

interface PdfSummaryRow {
  section: string;
  label: string;
  pageText: string;
  targetPageNumber: number;
}

type HeatmapBrevetKey = "bb1" | "bb2";

interface HeatmapRow {
  className: string;
  values: Record<string, number | undefined>;
}

const EXCEL_HEADER_STYLE = {
  font: {bold: true, color: {rgb: "FFFFFF"}},
  fill: {patternType: "solid", fgColor: {rgb: "1D4ED8"}},
  alignment: {horizontal: "center", vertical: "center", wrapText: true},
  border: {
    top: {style: "thin", color: {rgb: "CBD5E1"}},
    bottom: {style: "thin", color: {rgb: "CBD5E1"}},
    left: {style: "thin", color: {rgb: "CBD5E1"}},
    right: {style: "thin", color: {rgb: "CBD5E1"}},
  },
};

const EXCEL_CELL_BORDER = {
  top: {style: "thin", color: {rgb: "E2E8F0"}},
  bottom: {style: "thin", color: {rgb: "E2E8F0"}},
  left: {style: "thin", color: {rgb: "E2E8F0"}},
  right: {style: "thin", color: {rgb: "E2E8F0"}},
};

const EXCEL_TITLE_STYLE = {
  font: {bold: true, sz: 14, color: {rgb: "2563EB"}},
  alignment: {horizontal: "left", vertical: "center"},
};

const EXCEL_SUMMARY_LABEL_STYLE = {
  font: {bold: true, color: {rgb: "1D4ED8"}},
  alignment: {horizontal: "left", vertical: "center"},
  border: EXCEL_CELL_BORDER,
};

const EXCEL_SUMMARY_VALUE_STYLE = {
  alignment: {horizontal: "left", vertical: "center"},
  border: EXCEL_CELL_BORDER,
};

const EXCEL_FOOTER_CELL_STYLE = {
  fill: {patternType: "solid", fgColor: {rgb: "EFF6FF"}},
  alignment: {horizontal: "center", vertical: "center"},
  border: EXCEL_CELL_BORDER,
};

const EXCEL_LINK_STYLE = {
  font: {bold: true, underline: true, color: {rgb: "2563EB"}},
  alignment: {horizontal: "left", vertical: "center"},
  border: EXCEL_CELL_BORDER,
};

const EXCEL_MAX_COLUMN_INDEX = 16_384;
const EXCEL_VISIBLE_PADDING_COLUMNS = 6;
const EXCEL_VISIBLE_PADDING_ROWS = 18;
const XLSX_A4_PAPER_SIZE = 9;
const XLSX_MARGIN_ONE_CENTIMETER_INCH = 0.393700787;
const XLSX_HEADER_FOOTER_MARGIN_INCH = 0.196850394;

type PdfFontStyle = "normal" | "bold";

const PDF_COMPARISON_FONT_REGULAR_FILE = "NotoSans-Regular.ttf";
const PDF_COMPARISON_FONT_BOLD_FILE = "NotoSans-Bold.ttf";
const PDF_COMPARISON_CANVAS_FONT_FAMILY = "NotoSansPdfCanvas";
const PDF_PRIMARY_FONT_FAMILY = "NotoSansPdf";
const PDF_COMPARISON_SYMBOL_PATTERN = /[≥≤]/u;
const PDF_TEXT_IMAGE_DPI = 96;
const PDF_TEXT_IMAGE_SCALE = 2;
const PDF_TITLE_BLUE: [number, number, number] = [37, 99, 235];
const PDF_TITLE_BLUE_HEX = "#2563EB";

type PdfRenderedTextImage = {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
  baselineOffsetMm: number;
};

let pdfComparisonCanvasFontPromise: Promise<void> | undefined;
let pdfEmbeddedFontDataPromise: Promise<{regular: string; bold: string} | null> | undefined;
const pdfEmbeddedFontDocs = new WeakSet<jsPDF>();
const pdfRenderedTextImageCache = new Map<string, PdfRenderedTextImage>();

function hasComparisonSymbol(text: string | undefined): boolean {
  return typeof text === "string" && PDF_COMPARISON_SYMBOL_PATTERN.test(text);
}

function mmFromPx(px: number): number {
  return (px * 25.4) / PDF_TEXT_IMAGE_DPI;
}

function getPdfTextColor(color?: unknown): [number, number, number] {
  if (Array.isArray(color) && color.length >= 3) {
    return [Number(color[0]), Number(color[1]), Number(color[2])];
  }

  return [15, 23, 42];
}

async function loadPdfComparisonCanvasFont(fontFileName: string, weight: "400" | "700"): Promise<void> {
  const fontFace = new FontFace(
    PDF_COMPARISON_CANVAS_FONT_FAMILY,
    `url(/fonts/${fontFileName})`,
    {style: "normal", weight},
  );
  await fontFace.load();
  document.fonts.add(fontFace);
}

async function ensurePdfComparisonFont(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return;
  }

  if (!pdfComparisonCanvasFontPromise) {
    pdfComparisonCanvasFontPromise = Promise.all([
      loadPdfComparisonCanvasFont(PDF_COMPARISON_FONT_REGULAR_FILE, "400"),
      loadPdfComparisonCanvasFont(PDF_COMPARISON_FONT_BOLD_FILE, "700"),
    ]).then(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
  }

  return pdfComparisonCanvasFontPromise;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function loadPdfEmbeddedFontData() {
  if (typeof fetch === "undefined" || typeof btoa === "undefined") {
    return null;
  }

  if (!pdfEmbeddedFontDataPromise) {
    pdfEmbeddedFontDataPromise = Promise.all([
      fetch(`/fonts/${PDF_COMPARISON_FONT_REGULAR_FILE}`),
      fetch(`/fonts/${PDF_COMPARISON_FONT_BOLD_FILE}`),
    ])
      .then(async ([regularResponse, boldResponse]) => {
        if (!regularResponse.ok || !boldResponse.ok) {
          return null;
        }

        const [regularBuffer, boldBuffer] = await Promise.all([
          regularResponse.arrayBuffer(),
          boldResponse.arrayBuffer(),
        ]);

        return {
          regular: arrayBufferToBase64(regularBuffer),
          bold: arrayBufferToBase64(boldBuffer),
        };
      })
      .catch(() => null);
  }

  return pdfEmbeddedFontDataPromise;
}

async function ensurePdfDocumentFont(doc: jsPDF): Promise<boolean> {
  if (pdfEmbeddedFontDocs.has(doc)) {
    return true;
  }

  const fontData = await loadPdfEmbeddedFontData();
  if (!fontData) {
    return false;
  }

  doc.addFileToVFS(PDF_COMPARISON_FONT_REGULAR_FILE, fontData.regular);
  doc.addFont(PDF_COMPARISON_FONT_REGULAR_FILE, PDF_PRIMARY_FONT_FAMILY, "normal", 400, "Identity-H");
  doc.addFileToVFS(PDF_COMPARISON_FONT_BOLD_FILE, fontData.bold);
  doc.addFont(PDF_COMPARISON_FONT_BOLD_FILE, PDF_PRIMARY_FONT_FAMILY, "bold", 700, "Identity-H");
  pdfEmbeddedFontDocs.add(doc);

  return true;
}

function getPdfFontFamily(doc: jsPDF) {
  return pdfEmbeddedFontDocs.has(doc) ? PDF_PRIMARY_FONT_FAMILY : "helvetica";
}

function setPdfFont(doc: jsPDF, style: PdfFontStyle) {
  doc.setFont(getPdfFontFamily(doc), style);
}

function getPdfRenderedTextImage(
  text: string,
  fontSize: number,
  style: PdfFontStyle,
  color: [number, number, number],
): PdfRenderedTextImage | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cacheKey = `${style}|${fontSize}|${color.join(",")}|${text}`;
  const cachedImage = pdfRenderedTextImageCache.get(cacheKey);
  if (cachedImage) {
    return cachedImage;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const fontSizePx = fontSize * (PDF_TEXT_IMAGE_DPI / 72);
  const fontWeight = style === "bold" ? 700 : 400;
  context.font = `${fontWeight} ${fontSizePx}px "${PDF_COMPARISON_CANVAS_FONT_FAMILY}", Arial, sans-serif`;

  const metrics = context.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSizePx * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSizePx * 0.2;
  const paddingX = 2;
  const paddingY = 2;
  const widthPx = Math.max(1, Math.ceil(metrics.width + (paddingX * 2)));
  const heightPx = Math.max(1, Math.ceil(ascent + descent + (paddingY * 2)));

  canvas.width = Math.ceil(widthPx * PDF_TEXT_IMAGE_SCALE);
  canvas.height = Math.ceil(heightPx * PDF_TEXT_IMAGE_SCALE);

  const scaledContext = canvas.getContext("2d");
  if (!scaledContext) {
    return null;
  }

  scaledContext.scale(PDF_TEXT_IMAGE_SCALE, PDF_TEXT_IMAGE_SCALE);
  scaledContext.font = `${fontWeight} ${fontSizePx}px "${PDF_COMPARISON_CANVAS_FONT_FAMILY}", Arial, sans-serif`;
  scaledContext.textBaseline = "alphabetic";
  scaledContext.fillStyle = toCssRgb(color);
  scaledContext.fillText(text, paddingX, paddingY + ascent);

  const renderedImage = {
    dataUrl: canvas.toDataURL("image/png"),
    widthMm: mmFromPx(widthPx),
    heightMm: mmFromPx(heightPx),
    baselineOffsetMm: mmFromPx(paddingY + ascent),
  };
  pdfRenderedTextImageCache.set(cacheKey, renderedImage);

  return renderedImage;
}

function drawPdfText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  {
    style = "normal",
    color = [15, 23, 42],
    align = "left",
  }: {
    style?: PdfFontStyle;
    color?: [number, number, number];
    align?: Alignment;
  } = {},
) {
  doc.setTextColor(...color);

  if (!hasComparisonSymbol(text)) {
    setPdfFont(doc, style);
    doc.text(text, x, y, {align});
    return;
  }

  const renderedImage = getPdfRenderedTextImage(text, doc.getFontSize(), style, color);
  if (!renderedImage) {
    setPdfFont(doc, style);
    doc.text(text, x, y, {align});
    return;
  }

  let drawX = x;
  if (align === "center") {
    drawX -= renderedImage.widthMm / 2;
  } else if (align === "right") {
    drawX -= renderedImage.widthMm;
  }

  doc.addImage(
    renderedImage.dataUrl,
    "PNG",
    drawX,
    y - renderedImage.baselineOffsetMm,
    renderedImage.widthMm,
    renderedImage.heightMm,
    undefined,
    "FAST",
  );
}

function getPdfTextWidthForStyle(doc: jsPDF, text: string, style: PdfFontStyle): number {
  if (hasComparisonSymbol(text)) {
    const renderedImage = getPdfRenderedTextImage(text, doc.getFontSize(), style, [15, 23, 42]);
    if (renderedImage) {
      return renderedImage.widthMm;
    }
  }

  setPdfFont(doc, style);
  return doc.getTextWidth(text);
}

function formatNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined) {
    return "N/A";
  }
  return value.toFixed(decimals).replace(".", ",");
}

function formatSignedNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined) {
    return "N/A";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals).replace(".", ",")}`;
}

function formatSignedPercent(value: number | undefined, decimals = 1): string {
  if (value === undefined) {
    return "N/A";
  }

  return `${formatSignedNumber(value, decimals)} %`;
}

function formatCoefficientNumber(value: number): string {
  const roundedValue = Math.round(value * 100) / 100;
  if (Number.isInteger(roundedValue)) {
    return String(roundedValue);
  }

  return roundedValue
    .toFixed(2)
    .replace(/\.?0+$/u, "")
    .replace(".", ",");
}

function getSubjectCoefficientDisplay(
  config: BrevetBlancPanoramaReportData["config"],
  subject: string,
): string {
  if (config.coefficients) {
    const directCoefficient = config.coefficients[subject];
    if (typeof directCoefficient === "number") {
      return formatCoefficientNumber(directCoefficient);
    }

    if (["Physique-Chimie", "Sciences de la Vie et de la Terre", "Technologie"].includes(subject)) {
      const sciencesCoefficient = config.coefficients.Sciences;
      return typeof sciencesCoefficient === "number" ?
        `Bloc sciences (${formatCoefficientNumber(sciencesCoefficient)})` :
        "N/A";
    }

    return "N/A";
  }

  const maxScore = config.maxScores[subject];
  return typeof maxScore === "number" ? formatCoefficientNumber(maxScore / 20) : "N/A";
}

function compareClassStudentsAlphabetically(
  left: PanoramaClassDetailStudentRow,
  right: PanoramaClassDetailStudentRow
): number {
  const lastNameComparison = left.lastName.localeCompare(right.lastName, "fr", {sensitivity: "base"});
  if (lastNameComparison !== 0) {
    return lastNameComparison;
  }

  return left.firstName.localeCompare(right.firstName, "fr", {sensitivity: "base"});
}

function getPreferredHeatmapBrevetKey(reportData: BrevetBlancPanoramaReportData): HeatmapBrevetKey {
  return reportData.stats.participationBb2 > 0 ? "bb2" : "bb1";
}

function buildClassSubjectHeatmapRows(
  reportData: BrevetBlancPanoramaReportData,
  brevetKey: HeatmapBrevetKey
): HeatmapRow[] {
  return reportData.classDetails.map((classDetail) => {
    const values = reportData.config.subjects.reduce<Record<string, number | undefined>>((accumulator, subject) => {
      const subjectValues = classDetail.students
        .map((student) => student.subjectScores[subject]?.[brevetKey])
        .filter((value): value is number => value !== undefined && !Number.isNaN(value));

      accumulator[subject] = subjectValues.length > 0 ?
        subjectValues.reduce((sum, value) => sum + value, 0) / subjectValues.length :
        undefined;
      return accumulator;
    }, {});

    return {
      className: classDetail.className,
      values,
    };
  });
}

function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + ((end - start) * ratio));
}

function interpolateRgb(
  start: [number, number, number],
  end: [number, number, number],
  ratio: number
): [number, number, number] {
  return [
    interpolateChannel(start[0], end[0], ratio),
    interpolateChannel(start[1], end[1], ratio),
    interpolateChannel(start[2], end[2], ratio),
  ];
}

function getHeatmapColor(value: number | undefined): [number, number, number] {
  if (value === undefined) {
    return [241, 245, 249];
  }

  const anchors = [
    {score: 0, color: [127, 29, 29] as [number, number, number]},
    {score: 8, color: [248, 113, 113] as [number, number, number]},
    {score: 10, color: [253, 230, 138] as [number, number, number]},
    {score: 15, color: [134, 239, 172] as [number, number, number]},
    {score: 20, color: [22, 163, 74] as [number, number, number]},
  ];

  if (value <= anchors[0].score) {
    return anchors[0].color;
  }
  if (value >= anchors[anchors.length - 1].score) {
    return anchors[anchors.length - 1].color;
  }

  for (let index = 0; index < anchors.length - 1; index++) {
    const start = anchors[index];
    const end = anchors[index + 1];
    if (value >= start.score && value <= end.score) {
      const range = end.score - start.score;
      const ratio = range > 0 ? (value - start.score) / range : 0;
      return interpolateRgb(start.color, end.color, ratio);
    }
  }

  return anchors[anchors.length - 1].color;
}

function getTextColorForBackground(color: [number, number, number]): [number, number, number] {
  const luminance = ((0.2126 * color[0]) + (0.7152 * color[1]) + (0.0722 * color[2])) / 255;
  return luminance > 0.6 ? [17, 24, 39] : [255, 255, 255];
}

function rgbToHex(color: [number, number, number]): string {
  return color
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function toCssRgb(color: [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function sanitizeSheetName(value: string): string {
  const sanitized = value.replace(/[\\/?*\[\]:]/g, "-").trim();
  return sanitized.slice(0, 31) || "Sheet";
}

function toInternalSheetLinkTarget(sheetName: string): string {
  return `#'${sheetName.replace(/'/g, "''")}'!A1`;
}

function getWorkbookSheetDescription(sheetName: string): string {
  if (sheetName === "00 - Synthèse") {
    return "Vue d'ensemble des indicateurs et faits marquants";
  }
  if (sheetName === "01 - Classes") {
    return "Comparatif global des classes";
  }
  if (sheetName === "02 - Matières") {
    return "Comparatif global des matières";
  }
  if (sheetName === "03 - Filles-Garçons") {
    return "Comparatif filles/garçons sur les moyennes globales et par matière";
  }
  if (sheetName === "04 - Boursiers") {
    return "Comparatif boursiers/non-boursiers sur les moyennes globales et par matière";
  }
  if (sheetName === "05 - Matrice") {
    return "Matrice colorée des moyennes par classe";
  }
  if (sheetName.includes("Top 10 BB1")) {
    return "Top 10 des élèves sur le brevet blanc 1";
  }
  if (sheetName.includes("Top 10 BB2")) {
    return "Top 10 des élèves sur le brevet blanc 2";
  }
  if (sheetName.includes("Progression")) {
    return "Élèves les plus en progression";
  }
  if (sheetName === "Tout alpha") {
    return "Tous les élèves triés par ordre alphabétique";
  }
  if (sheetName === "Classement") {
    return "Tous les élèves triés par moyenne décroissante";
  }
  if (sheetName.endsWith(" - Alpha")) {
    return `${sheetName.replace(/ - Alpha$/u, "")} triée par ordre alphabétique`;
  }

  return `${sheetName} triée par moyenne décroissante`;
}

function getAverageStyle(value: number | undefined) {
  const style: any = {
    numFmt: "0.00",
    alignment: {horizontal: "center", vertical: "center"},
    border: EXCEL_CELL_BORDER,
  };

  if (value === undefined) {
    return style;
  }

  if (value >= 15) {
    style.fill = {patternType: "solid", fgColor: {rgb: "16A34A"}};
    style.font = {color: {rgb: "FFFFFF"}};
  } else if (value >= 10) {
    style.fill = {patternType: "solid", fgColor: {rgb: "86EFAC"}};
    style.font = {color: {rgb: "14532D"}};
  } else if (value >= 8) {
    style.fill = {patternType: "solid", fgColor: {rgb: "FDE68A"}};
    style.font = {color: {rgb: "92400E"}};
  } else {
    style.fill = {patternType: "solid", fgColor: {rgb: "F87171"}};
    style.font = {color: {rgb: "7F1D1D"}};
  }

  return style;
}

function getProgressionStyle(value: number | undefined) {
  const style: any = {
    numFmt: "0.00",
    alignment: {horizontal: "center", vertical: "center"},
    border: EXCEL_CELL_BORDER,
  };

  if (value === undefined) {
    return style;
  }

  if (value > 0) {
    style.font = {bold: true, color: {rgb: "166534"}};
  } else if (value < 0) {
    style.font = {bold: true, color: {rgb: "B91C1C"}};
  } else {
    style.font = {bold: true, color: {rgb: "475569"}};
  }

  return style;
}

function getCellStyle(cellType: CellType | undefined, value: string | number | undefined, align: Alignment | undefined) {
  if (cellType === "average" && typeof value === "number") {
    return getAverageStyle(value);
  }

  if (cellType === "progression" && typeof value === "number") {
    return getProgressionStyle(value);
  }

  const style: any = {
    alignment: {horizontal: align ?? "center", vertical: "center"},
    border: EXCEL_CELL_BORDER,
  };

  if (cellType === "number" && typeof value === "number") {
    style.numFmt = "0.00";
  }
  if (cellType === "int" && typeof value === "number") {
    style.numFmt = "0";
  }

  return style;
}

function getFooterCellStyle(
  column: ColumnDefinition<any>,
  value: string | number | undefined,
  columnIndex: number,
): any {
  if (column.cellType === "average" && typeof value === "number") {
    const style = getAverageStyle(value);
    style.font = {...(style.font ?? {}), bold: true};
    return style;
  }

  if (column.cellType === "progression" && typeof value === "number") {
    const style = getProgressionStyle(value);
    style.fill = EXCEL_FOOTER_CELL_STYLE.fill;
    style.font = {...(style.font ?? {}), bold: true};
    return style;
  }

  return {
    ...EXCEL_FOOTER_CELL_STYLE,
    alignment: {
      horizontal: columnIndex === 0 ? "left" : (column.align ?? "center"),
      vertical: "center",
    },
    font: columnIndex === 0 ? {bold: true, color: {rgb: "1D4ED8"}} : {bold: true},
  };
}

function getExplicitLineCount(value: string | number | undefined): number {
  if (value === undefined || value === null) {
    return 1;
  }

  return String(value).split("\n").length;
}

function getWorksheetRowHeight(
  row: Array<string | number | undefined>,
  {
    isTitle = false,
    isHeader = false,
    isFooter = false,
  }: {
    isTitle?: boolean;
    isHeader?: boolean;
    isFooter?: boolean;
  } = {},
): number {
  const isBlankRow = row.every((value) => value === undefined || value === "");
  if (isBlankRow) {
    return 8;
  }

  if (isTitle) {
    return 24;
  }

  const maxLines = row.reduce<number>(
    (maximum, value) => Math.max(maximum, getExplicitLineCount(value)),
    1,
  );
  if (isHeader) {
    return Math.max(22, (maxLines * 15) + 6);
  }
  if (isFooter) {
    return Math.max(20, (maxLines * 14) + 4);
  }

  return Math.max(18, (maxLines * 14) + 4);
}

function createTableWorksheet<Row>(
  rows: Row[],
  columns: ColumnDefinition<Row>[],
  options?: XlsxTableOptions,
): XLSX.WorkSheet {
  const leadingRows = options?.leadingRows ?? [];
  const footerRows = options?.footerRows ?? [];
  const data = [
    ...leadingRows,
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => {
      const value = column.value(row);
      return value ?? "";
    })),
    ...footerRows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const worksheetColumns = columns.map((column) => ({wch: column.width}));
  const maxLeadingLabelLength = leadingRows.reduce((maximum, leadingRow, leadingRowIndex) => {
    if (leadingRowIndex === 0) {
      return maximum;
    }

    const firstCellValue = leadingRow[0];
    if (typeof firstCellValue !== "string") {
      return maximum;
    }

    const longestLineLength = firstCellValue
      .split("\n")
      .reduce((lineMaximum, line) => Math.max(lineMaximum, line.length), 0);

    return Math.max(maximum, longestLineLength);
  }, 0);
  if (worksheetColumns[0] && maxLeadingLabelLength > 0) {
    worksheetColumns[0] = {
      ...worksheetColumns[0],
      wch: Math.max(worksheetColumns[0].wch ?? 0, Math.min(maxLeadingLabelLength + 2, 34)),
    };
  }
  worksheet["!cols"] = worksheetColumns;
  const headerRowIndex = leadingRows.length;
  worksheet["!rows"] = data.map((row, rowIndex) => ({
    hpt: getWorksheetRowHeight(row, {
      isTitle: rowIndex === 0 && leadingRows.length > 0,
      isHeader: rowIndex === headerRowIndex,
      isFooter: rowIndex > headerRowIndex + rows.length,
    }),
  }));

  columns.forEach((_column, columnIndex) => {
    const headerAddress = XLSX.utils.encode_cell({r: headerRowIndex, c: columnIndex});
    if (worksheet[headerAddress]) {
      worksheet[headerAddress].s = EXCEL_HEADER_STYLE;
    }
  });

  leadingRows.forEach((leadingRow, leadingRowIndex) => {
    leadingRow.forEach((_, columnIndex) => {
      const address = XLSX.utils.encode_cell({r: leadingRowIndex, c: columnIndex});
      if (!worksheet[address]) {
        return;
      }

      if (leadingRowIndex === 0 && columnIndex === 0) {
        worksheet[address].s = EXCEL_TITLE_STYLE;
        worksheet["!merges"] = [
          ...(worksheet["!merges"] ?? []),
          {s: {r: 0, c: 0}, e: {r: 0, c: Math.max(columns.length - 1, 0)}},
        ];
        return;
      }

      worksheet[address].s = columnIndex === 0 ? EXCEL_SUMMARY_LABEL_STYLE : EXCEL_SUMMARY_VALUE_STYLE;
    });
  });

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const address = XLSX.utils.encode_cell({r: headerRowIndex + rowIndex + 1, c: columnIndex});
      if (!worksheet[address]) {
        return;
      }

      const value = column.value(row);
      worksheet[address].s = getCellStyle(column.cellType, value, column.align);
    });
  });

  footerRows.forEach((footerRow, footerIndex) => {
    columns.forEach((column, columnIndex) => {
      const address = XLSX.utils.encode_cell({
        r: headerRowIndex + rows.length + footerIndex + 1,
        c: columnIndex,
      });
      if (!worksheet[address]) {
        return;
      }

      worksheet[address].s = getFooterCellStyle(column, footerRow[columnIndex], columnIndex);
    });
  });

  return worksheet;
}

function getRankedClassEntries(rows: PanoramaRankingRow[]): Array<[string, number]> {
  const classDistribution = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.className] = (accumulator[row.className] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(classDistribution).sort((left, right) =>
    (right[1] - left[1]) || left[0].localeCompare(right[0], "fr", {numeric: true, sensitivity: "base"}),
  );
}

function formatRankedClassEntry(entry: [string, number] | undefined): string {
  return entry ? `${entry[0]} (${entry[1]} élèves)` : "N/A";
}

function buildRankingSheetSummaryRows(
  title: string,
  rows: PanoramaRankingRow[],
  {
    bestLabel,
    bestValue,
    aggregateLabel,
    aggregateValue,
  }: {
    bestLabel: string;
    bestValue: (row: PanoramaRankingRow) => number | undefined;
    aggregateLabel: string;
    aggregateValue: number | undefined;
  },
): Array<Array<string | number | undefined>> {
  const rankedClasses = getRankedClassEntries(rows);
  const bestRow = rows[0];

  return [
    [title],
    [bestLabel, bestRow ? `${bestRow.firstName} ${bestRow.lastName} (${formatNumber(bestValue(bestRow), 2)})` : "N/A"],
    ["Classe la plus représentée", formatRankedClassEntry(rankedClasses[0])],
    ["Seconde classe la plus représentée", formatRankedClassEntry(rankedClasses[1])],
    [aggregateLabel, formatNumber(aggregateValue, 2)],
    [],
  ];
}

function appendOverviewSheet(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const progression =
    reportData.stats.averageBb1 !== undefined && reportData.stats.averageBb2 !== undefined ?
      reportData.stats.averageBb2 - reportData.stats.averageBb1 :
      undefined;
  const performanceRows = reportData.top10Bb2.length > 0 ? reportData.top10Bb2 : reportData.top10Bb1;
  const rankedClasses = getRankedClassEntries(performanceRows);

  const overviewRows = [
    ["Bilan complet du panorama du brevet blanc"],
    [`Année scolaire : ${reportData.year}`],
    [],
    ["Indicateur", "Valeur"],
    ["Élèves inscrits", reportData.stats.totalStudents],
    ["Moyenne générale BB1", formatNumber(reportData.stats.averageBb1)],
    ["Moyenne générale BB2", formatNumber(reportData.stats.averageBb2)],
    ["Progression générale", formatNumber(progression)],
    ["Participants BB1", reportData.stats.participationBb1],
    ["Participants BB2", reportData.stats.participationBb2],
    [],
    ["Faits marquants", "Valeur"],
    ...reportData.highlights.map((highlight) => [highlight.label, highlight.value]),
    ["Classe la plus représentée dans le top 10", formatRankedClassEntry(rankedClasses[0])],
    ["Seconde classe la plus représentée", formatRankedClassEntry(rankedClasses[1])],
    [],
    ["Répartition globale", "BB1", "BB2"],
    ["≥ 15", reportData.stats.overallDistributionBb1.gte15, reportData.stats.overallDistributionBb2.gte15],
    ["10 à 14,99", reportData.stats.overallDistributionBb1.gte10lt15, reportData.stats.overallDistributionBb2.gte10lt15],
    ["8 à 9,99", reportData.stats.overallDistributionBb1.gte8lt10, reportData.stats.overallDistributionBb2.gte8lt10],
    ["< 8", reportData.stats.overallDistributionBb1.lt8, reportData.stats.overallDistributionBb2.lt8],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(overviewRows);
  worksheet["!cols"] = [{wch: 34}, {wch: 20}, {wch: 20}];
  const overviewHeaderRowIndex = 3;
  const highlightsHeaderRowIndex = overviewRows.findIndex((row) => row[0] === "Faits marquants");
  const distributionHeaderRowIndex = overviewRows.findIndex((row) => row[0] === "Répartition globale");
  worksheet["!rows"] = overviewRows.map((row, rowIndex) => ({
    hpt: getWorksheetRowHeight(row, {
      isTitle: rowIndex === 0,
      isHeader:
        rowIndex === overviewHeaderRowIndex ||
        rowIndex === highlightsHeaderRowIndex ||
        rowIndex === distributionHeaderRowIndex,
    }),
  }));

  if (worksheet["A1"]) {
    worksheet["A1"].s = EXCEL_TITLE_STYLE;
  }
  if (worksheet["A2"]) {
    worksheet["A2"].s = {
      font: {bold: true, sz: 11, color: {rgb: "475569"}},
    };
  }

  const overviewHeaderRow = overviewHeaderRowIndex + 1;
  const highlightsHeaderRow = highlightsHeaderRowIndex + 1;
  const distributionHeaderRow = distributionHeaderRowIndex + 1;
  [
    `A${overviewHeaderRow}`,
    `B${overviewHeaderRow}`,
    `A${highlightsHeaderRow}`,
    `B${highlightsHeaderRow}`,
    `A${distributionHeaderRow}`,
    `B${distributionHeaderRow}`,
    `C${distributionHeaderRow}`,
  ].forEach((address) => {
    if (worksheet[address]) {
      worksheet[address].s = EXCEL_HEADER_STYLE;
    }
  });

  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
  for (let rowIndex = 3; rowIndex <= range.e.r; rowIndex++) {
    for (let columnIndex = 0; columnIndex <= range.e.c; columnIndex++) {
      const address = XLSX.utils.encode_cell({r: rowIndex, c: columnIndex});
      if (!worksheet[address]) {
        continue;
      }

      if (!worksheet[address].s) {
        worksheet[address].s = {
          alignment: {vertical: "center"},
          border: EXCEL_CELL_BORDER,
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "00 - Synthèse");
}

function appendComparisonSheets(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const hasProgressionData = reportData.top10Progression.length > 0;

  const classColumns: ColumnDefinition<PanoramaClassReportRow>[] = [
    {label: "Classe", width: 16, align: "center", value: (row) => row.className},
    {label: "Inscrits", width: 10, cellType: "int", value: (row) => row.totalStudents},
    {label: "Participants\nBB1", width: 14, cellType: "int", value: (row) => row.participationBb1},
    {label: "Moyenne\nBB1", width: 12, cellType: "average", value: (row) => row.averageBb1},
  ];
  if (hasBb2Data) {
    classColumns.push(
      {label: "Participants\nBB2", width: 14, cellType: "int", value: (row) => row.participationBb2},
      {label: "Moyenne\nBB2", width: 12, cellType: "average", value: (row) => row.averageBb2}
    );
  }
  if (hasProgressionData) {
    classColumns.push({label: "Progression", width: 12, cellType: "progression", value: (row) => row.progression});
  }

  const classWorksheet = createTableWorksheet<PanoramaClassReportRow>(reportData.classRows, classColumns);
  XLSX.utils.book_append_sheet(workbook, classWorksheet, "01 - Classes");

  const subjectColumns: ColumnDefinition<PanoramaSubjectReportRow>[] = [
    {label: "Matière", width: 34, align: "left", value: (row) => row.subject},
    {label: "Coefficient", width: 18, align: "center", value: (row) => getSubjectCoefficientDisplay(reportData.config, row.subject)},
    {label: "Participants\nBB1", width: 14, cellType: "int", value: (row) => row.participationBb1},
    {label: "Moyenne\nBB1", width: 14, cellType: "average", value: (row) => row.averageBb1},
  ];
  if (hasBb2Data) {
    subjectColumns.push(
      {label: "Participants\nBB2", width: 14, cellType: "int", value: (row) => row.participationBb2},
      {label: "Moyenne\nBB2", width: 14, cellType: "average", value: (row) => row.averageBb2}
    );
  }
  if (hasProgressionData) {
    subjectColumns.push({label: "Progression", width: 12, cellType: "progression", value: (row) => row.progression});
  }

  const subjectWorksheet = createTableWorksheet<PanoramaSubjectReportRow>(reportData.subjectRows, subjectColumns);
  XLSX.utils.book_append_sheet(workbook, subjectWorksheet, "02 - Matières");
}

function appendGenderComparisonSheet(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const genderColumns: ColumnDefinition<PanoramaGenderSubjectComparisonRow>[] = [
    {label: "Matière", width: 28, align: "left", value: (row) => row.subject},
    {label: "Copies F\nBB1", width: 12, cellType: "int", value: (row) => row.fillesParticipationBb1},
    {label: "Moy. F\nBB1", width: 12, cellType: "average", value: (row) => row.fillesAverageBb1},
    {label: "Copies G\nBB1", width: 12, cellType: "int", value: (row) => row.garconsParticipationBb1},
    {label: "Moy. G\nBB1", width: 12, cellType: "average", value: (row) => row.garconsAverageBb1},
    {label: "Écart F-G\nBB1", width: 13, cellType: "progression", value: (row) => row.gapBb1},
  ];

  if (hasBb2Data) {
    genderColumns.push(
      {label: "Copies F\nBB2", width: 12, cellType: "int", value: (row) => row.fillesParticipationBb2},
      {label: "Moy. F\nBB2", width: 12, cellType: "average", value: (row) => row.fillesAverageBb2},
      {label: "Copies G\nBB2", width: 12, cellType: "int", value: (row) => row.garconsParticipationBb2},
      {label: "Moy. G\nBB2", width: 12, cellType: "average", value: (row) => row.garconsAverageBb2},
      {label: "Écart F-G\nBB2", width: 13, cellType: "progression", value: (row) => row.gapBb2},
    );
  }

  const worksheet = createTableWorksheet(reportData.stats.genderBreakdown.subjectRows, genderColumns, {
    leadingRows: buildGenderComparisonLeadingRows(reportData),
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, "03 - Filles-Garçons");
}

function appendScholarshipComparisonSheet(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const scholarshipColumns: ColumnDefinition<PanoramaScholarshipSubjectComparisonRow>[] = [
    {label: "Matière", width: 28, align: "left", value: (row) => row.subject},
    {label: "Copies B\nBB1", width: 12, cellType: "int", value: (row) => row.boursiersParticipationBb1},
    {label: "Moy. B\nBB1", width: 12, cellType: "average", value: (row) => row.boursiersAverageBb1},
    {label: "Copies NB\nBB1", width: 12, cellType: "int", value: (row) => row.nonBoursiersParticipationBb1},
    {label: "Moy. NB\nBB1", width: 12, cellType: "average", value: (row) => row.nonBoursiersAverageBb1},
    {label: "Écart B-NB\nBB1", width: 13, cellType: "progression", value: (row) => row.gapBb1},
  ];

  if (hasBb2Data) {
    scholarshipColumns.push(
      {label: "Copies B\nBB2", width: 12, cellType: "int", value: (row) => row.boursiersParticipationBb2},
      {label: "Moy. B\nBB2", width: 12, cellType: "average", value: (row) => row.boursiersAverageBb2},
      {label: "Copies NB\nBB2", width: 12, cellType: "int", value: (row) => row.nonBoursiersParticipationBb2},
      {label: "Moy. NB\nBB2", width: 12, cellType: "average", value: (row) => row.nonBoursiersAverageBb2},
      {label: "Écart B-NB\nBB2", width: 13, cellType: "progression", value: (row) => row.gapBb2},
    );
  }

  const worksheet = createTableWorksheet(reportData.stats.scholarshipBreakdown.subjectRows, scholarshipColumns, {
    leadingRows: buildScholarshipComparisonLeadingRows(reportData),
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, "04 - Boursiers");
}

function appendHeatmapSheet(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const brevetKey = getPreferredHeatmapBrevetKey(reportData);
  const heatmapRows = buildClassSubjectHeatmapRows(reportData, brevetKey);
  const headerLabels = [
    "Classe",
    ...reportData.config.subjects.map((subject) => reportData.config.abbreviations[subject] || subject),
  ];
  const worksheetData = [
    [`Matrice des moyennes par classe (${brevetKey.toUpperCase()})`],
    [],
    headerLabels,
    ...heatmapRows.map((row) => ([
      row.className,
      ...reportData.config.subjects.map((subject) => row.values[subject] ?? ""),
    ])),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  worksheet["!cols"] = [
    {wch: 14},
    ...reportData.config.subjects.map(() => ({wch: 10})),
  ];
  worksheet["!rows"] = worksheetData.map((row, rowIndex) => ({
    hpt: getWorksheetRowHeight(row, {
      isTitle: rowIndex === 0,
      isHeader: rowIndex === 2,
    }),
  }));
  worksheet["!merges"] = [
    {s: {r: 0, c: 0}, e: {r: 0, c: Math.max(headerLabels.length - 1, 0)}},
  ];

  if (worksheet["A1"]) {
    worksheet["A1"].s = EXCEL_TITLE_STYLE;
  }

  headerLabels.forEach((_, index) => {
    const address = XLSX.utils.encode_cell({r: 2, c: index});
    if (worksheet[address]) {
      worksheet[address].s = EXCEL_HEADER_STYLE;
    }
  });

  heatmapRows.forEach((row, rowIndex) => {
    const labelAddress = XLSX.utils.encode_cell({r: rowIndex + 3, c: 0});
    if (worksheet[labelAddress]) {
      worksheet[labelAddress].s = {
        alignment: {horizontal: "center", vertical: "center"},
        border: EXCEL_CELL_BORDER,
        font: {bold: true},
      };
    }

    reportData.config.subjects.forEach((subject, subjectIndex) => {
      const value = row.values[subject];
      const address = XLSX.utils.encode_cell({r: rowIndex + 3, c: subjectIndex + 1});
      if (!worksheet[address]) {
        return;
      }

      if (typeof value === "number") {
        const [red, green, blue] = getHeatmapColor(value);
        const [textRed, textGreen, textBlue] = getTextColorForBackground([red, green, blue]);
        worksheet[address].s = {
          numFmt: "0.0",
          alignment: {horizontal: "center", vertical: "center"},
          border: EXCEL_CELL_BORDER,
          fill: {
            patternType: "solid",
            fgColor: {rgb: rgbToHex([red, green, blue])},
          },
          font: {
            bold: true,
            color: {rgb: rgbToHex([textRed, textGreen, textBlue])},
          },
        };
      } else {
        worksheet[address].s = {
          alignment: {horizontal: "center", vertical: "center"},
          border: EXCEL_CELL_BORDER,
          fill: {patternType: "solid", fgColor: {rgb: "F1F5F9"}},
          font: {color: {rgb: "94A3B8"}},
        };
      }
    });
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, "05 - Matrice");
}

function appendTopSheets(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const hasBb2Data = reportData.top10Bb2.length > 0;
  const hasProgressionData = reportData.top10Progression.length > 0;
  let sheetIndex = 6;

  const rankingColumns: ColumnDefinition<PanoramaRankingRow>[] = [
    {label: "Rang", width: 8, cellType: "int", value: (row) => row.rank},
    {label: "Nom", width: 18, align: "left", value: (row) => row.lastName},
    {label: "Prénom", width: 18, align: "left", value: (row) => row.firstName},
    {label: "Classe", width: 12, value: (row) => row.className},
    {label: "Moyenne\nBB1", width: 12, cellType: "average", value: (row) => row.averageBb1},
  ];
  if (hasBb2Data) {
    rankingColumns.push({label: "Moyenne\nBB2", width: 12, cellType: "average", value: (row) => row.averageBb2});
  }
  if (hasProgressionData) {
    rankingColumns.push({label: "Progression", width: 12, cellType: "progression", value: (row) => row.progression});
  }

  XLSX.utils.book_append_sheet(
    workbook,
    createTableWorksheet(reportData.top10Bb1, rankingColumns, {
      leadingRows: buildRankingSheetSummaryRows(
        "Synthèse Top 10 BB1",
        reportData.top10Bb1,
        {
          bestLabel: "Meilleur élève",
          bestValue: (row) => row.averageBb1,
          aggregateLabel: "Moyenne du top 10",
          aggregateValue: reportData.top10Bb1.length > 0 ?
            reportData.top10Bb1.reduce((sum, row) => sum + (row.averageBb1 ?? 0), 0) / reportData.top10Bb1.length :
            undefined,
        },
      ),
    }),
    `${String(sheetIndex).padStart(2, "0")} - Top 10 BB1`
  );
  sheetIndex++;
  if (hasBb2Data) {
    XLSX.utils.book_append_sheet(
      workbook,
      createTableWorksheet(reportData.top10Bb2, rankingColumns, {
        leadingRows: buildRankingSheetSummaryRows(
          "Synthèse Top 10 BB2",
          reportData.top10Bb2,
          {
            bestLabel: "Meilleur élève",
            bestValue: (row) => row.averageBb2,
            aggregateLabel: "Moyenne du top 10",
            aggregateValue: reportData.top10Bb2.length > 0 ?
              reportData.top10Bb2.reduce((sum, row) => sum + (row.averageBb2 ?? 0), 0) / reportData.top10Bb2.length :
              undefined,
          },
        ),
      }),
      `${String(sheetIndex).padStart(2, "0")} - Top 10 BB2`
    );
    sheetIndex++;
  }
  if (hasProgressionData) {
    XLSX.utils.book_append_sheet(
      workbook,
      createTableWorksheet(reportData.top10Progression, rankingColumns, {
        leadingRows: buildRankingSheetSummaryRows(
          "Synthèse Progression",
          reportData.top10Progression,
          {
            bestLabel: "Meilleure progression",
            bestValue: (row) => row.progression,
            aggregateLabel: "Progression moyenne",
            aggregateValue: reportData.top10Progression.length > 0 ?
              reportData.top10Progression.reduce((sum, row) => sum + (row.progression ?? 0), 0) / reportData.top10Progression.length :
              undefined,
          },
        ),
      }),
      `${String(sheetIndex).padStart(2, "0")} - Progression`
    );
  }
}

function buildClassDetailColumns(reportData: BrevetBlancPanoramaReportData): ColumnDefinition<PanoramaClassDetailStudentRow>[] {
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const hasProgressionData = reportData.top10Progression.length > 0;
  const getCompactHeaderLabel = (label: string) => {
    if (label === "Moyenne") {
      return "Moy.";
    }
    if (label === "Français" || label === "Fran\u00c3\u00a7ais") {
      return "Fr.";
    }
    if (label === "Techno" || label === "Technologie") {
      return "Tech.";
    }
    return label;
  };
  const columns: ColumnDefinition<PanoramaClassDetailStudentRow>[] = [
    {label: "Nom", width: 22, align: "left", value: (row) => row.lastName},
    {label: "Prénom", width: 20, align: "left", value: (row) => row.firstName},
    {label: "Classe", width: 12, value: (row) => row.className},
    {label: `${getCompactHeaderLabel("Moyenne")}\nBB1`, width: 13, cellType: "average", value: (row) => row.averageBb1},
  ];
  if (hasBb2Data) {
    columns.push({label: `${getCompactHeaderLabel("Moyenne")}\nBB2`, width: 13, cellType: "average", value: (row) => row.averageBb2});
  }
  if (hasProgressionData) {
    columns.push({label: "Progression", width: 12, cellType: "progression", value: (row) => row.progression});
  }

  reportData.config.subjects.forEach((subject) => {
    const label = getCompactHeaderLabel(reportData.config.abbreviations[subject] || subject);
    columns.push({
      label: `${label}\nBB1`,
      width: label === "Fr." || label === "Tech." ? 11 : 10,
      cellType: "average",
      value: (row) => row.subjectScores[subject]?.bb1,
    });
    if (hasBb2Data) {
      columns.push({
        label: `${label}\nBB2`,
        width: label === "Fr." || label === "Tech." ? 11 : 10,
        cellType: "average",
        value: (row) => row.subjectScores[subject]?.bb2,
      });
    }
  });

  return columns;
}

function buildCompactClassSheetColumns(
  reportData: BrevetBlancPanoramaReportData,
): ColumnDefinition<PanoramaClassDetailStudentRow>[] {
  return buildClassDetailColumns(reportData)
    .filter((column) => column.label !== "Classe")
    .map((column) => {
      if (column.label === "Nom") {
        return {...column, width: 18};
      }
      if (column.label.startsWith("Pr")) {
        return {...column, width: 16};
      }
      if (column.label === "Pr\u00c3\u00a9nom") {
        return {...column, width: 16};
      }
      if (column.label.startsWith("Moy.")) {
        return {...column, width: 10};
      }
      if (column.label === "Progression") {
        return {...column, width: 9};
      }
      if (column.label.includes("\nBB")) {
        return {...column, width: column.label.startsWith("Fr.") || column.label.startsWith("Tech.") ? 9 : 8};
      }

      return column;
    });
}

function compareStudentsByActiveAverage(
  reportData: BrevetBlancPanoramaReportData,
  left: PanoramaClassDetailStudentRow,
  right: PanoramaClassDetailStudentRow,
) {
  const averageGap = (getActiveAverage(reportData, right) ?? -Infinity) - (getActiveAverage(reportData, left) ?? -Infinity);
  if (averageGap !== 0) {
    return averageGap;
  }

  return compareClassStudentsAlphabetically(left, right);
}

function appendGlobalStudentSheets(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const classColumns = buildClassDetailColumns(reportData);
  const compactClassColumns = buildCompactClassSheetColumns(reportData);
  const allStudents = reportData.classDetails.flatMap((classDetail) => classDetail.students);
  const activeLabel = getActiveBrevetLabel(reportData);

  const alphabeticalStudents = [...allStudents].sort((left, right) => {
    const alphabeticalComparison = compareClassStudentsAlphabetically(left, right);
    if (alphabeticalComparison !== 0) {
      return alphabeticalComparison;
    }

    return left.className.localeCompare(right.className, "fr", {numeric: true, sensitivity: "base"});
  });

  const rankedStudents = [...allStudents].sort((left, right) => compareStudentsByActiveAverage(reportData, left, right));

  const globalFooterRow = buildAverageFooterRow(allStudents, classColumns, "Moy. globale");

  XLSX.utils.book_append_sheet(
    workbook,
    createTableWorksheet(alphabeticalStudents, classColumns, {
      leadingRows: [
        ["Tous les élèves - ordre alphabétique"],
        ["Session de référence", activeLabel],
        [],
      ],
      footerRows: [globalFooterRow],
    }),
    "Tout alpha",
  );

  reportData.classDetails.forEach((classDetail) => {
    const alphabeticalStudentsInClass = [...classDetail.students].sort(compareClassStudentsAlphabetically);
    const alphabeticalLeadingRows = [
      [`${classDetail.className} - ordre alphabétique`],
      ["Session de référence", activeLabel],
      [],
    ];
    const alphabeticalWorksheetOptions = {
      leadingRows: alphabeticalLeadingRows,
      footerRows: [buildClassDetailFooterRow(alphabeticalStudentsInClass, compactClassColumns)],
    };
    const worksheet = createTableWorksheet(alphabeticalStudentsInClass, compactClassColumns, alphabeticalWorksheetOptions);
    const sheetName = sanitizeSheetName(`${classDetail.className} - Alpha`);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.utils.book_append_sheet(
    workbook,
    createTableWorksheet(rankedStudents, classColumns, {
      leadingRows: [
        ["Tous les élèves - classement décroissant"],
        ["Session de référence", activeLabel],
        [],
      ],
      footerRows: [globalFooterRow],
    }),
    "Classement",
  );

  reportData.classDetails.forEach((classDetail) => {
    const rankedStudentsInClass = [...classDetail.students].sort((left, right) =>
      compareStudentsByActiveAverage(reportData, left, right),
    );
    const rankingLeadingRows = [
      [`${classDetail.className} - classement décroissant`],
      ["Session de référence", activeLabel],
      [],
    ];
    const rankingWorksheetOptions = {
      leadingRows: rankingLeadingRows,
      footerRows: [buildClassDetailFooterRow(rankedStudentsInClass, compactClassColumns)],
    };
    const worksheet = createTableWorksheet(rankedStudentsInClass, compactClassColumns, rankingWorksheetOptions);
    const sheetName = sanitizeSheetName(`${classDetail.className}`);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });
}

function appendWorkbookMenuSheet(workbook: XLSX.WorkBook, reportData: BrevetBlancPanoramaReportData) {
  const sheetNames = workbook.SheetNames.filter((sheetName) => sheetName !== "Menu");
  const sections = [
    {
      title: "Synthèses et analyses",
      sheets: sheetNames.filter((sheetName) => /^\d{2} - /u.test(sheetName)),
    },
    {
      title: "Exports globaux",
      sheets: sheetNames.filter((sheetName) => sheetName === "Tout alpha" || sheetName === "Classement"),
    },
    {
      title: "Classes alphabétiques",
      sheets: sheetNames.filter((sheetName) => sheetName.endsWith(" - Alpha")),
    },
    {
      title: "Classes classées",
      sheets: sheetNames.filter((sheetName) =>
        !/^\d{2} - /u.test(sheetName) &&
        sheetName !== "Tout alpha" &&
        sheetName !== "Classement" &&
        !sheetName.endsWith(" - Alpha"),
      ),
    },
  ].filter((section) => section.sheets.length > 0);

  const menuRows: Array<Array<string | number | undefined>> = [
    ["Menu de navigation"],
    [`Année scolaire : ${reportData.year}`],
    [],
    ["Section", "Feuille", "Description"],
  ];

  sections.forEach((section) => {
    section.sheets.forEach((sheetName, sheetIndex) => {
      menuRows.push([
        sheetIndex === 0 ? section.title : "",
        sheetName,
        getWorkbookSheetDescription(sheetName),
      ]);
    });
    menuRows.push([]);
  });

  if (menuRows[menuRows.length - 1]?.every((value) => value === undefined || value === "")) {
    menuRows.pop();
  }

  const worksheet = XLSX.utils.aoa_to_sheet(menuRows);
  worksheet["!cols"] = [{wch: 24}, {wch: 28}, {wch: 52}];
  worksheet["!rows"] = menuRows.map((row, rowIndex) => ({
    hpt: getWorksheetRowHeight(row, {
      isTitle: rowIndex === 0,
      isHeader: rowIndex === 3,
    }),
  }));
  worksheet["!merges"] = [
    {s: {r: 0, c: 0}, e: {r: 0, c: 2}},
    {s: {r: 1, c: 0}, e: {r: 1, c: 2}},
  ];

  if (worksheet["A1"]) {
    worksheet["A1"].s = EXCEL_TITLE_STYLE;
  }
  if (worksheet["A2"]) {
    worksheet["A2"].s = {
      font: {bold: true, sz: 11, color: {rgb: "475569"}},
      alignment: {horizontal: "left", vertical: "center"},
    };
  }

  ["A4", "B4", "C4"].forEach((address) => {
    if (worksheet[address]) {
      worksheet[address].s = EXCEL_HEADER_STYLE;
    }
  });

  for (let rowIndex = 4; rowIndex < menuRows.length; rowIndex++) {
    const sectionAddress = XLSX.utils.encode_cell({r: rowIndex, c: 0});
    const sheetAddress = XLSX.utils.encode_cell({r: rowIndex, c: 1});
    const descriptionAddress = XLSX.utils.encode_cell({r: rowIndex, c: 2});
    const sectionValue = menuRows[rowIndex]?.[0];
    const sheetValue = menuRows[rowIndex]?.[1];
    const descriptionValue = menuRows[rowIndex]?.[2];

    if (worksheet[sectionAddress] && sectionValue) {
      worksheet[sectionAddress].s = EXCEL_SUMMARY_LABEL_STYLE;
    }

    if (worksheet[sheetAddress] && typeof sheetValue === "string" && sheetValue) {
      worksheet[sheetAddress].s = EXCEL_LINK_STYLE;
      worksheet[sheetAddress].l = {
        Target: toInternalSheetLinkTarget(sheetValue),
        Tooltip: `Aller à ${sheetValue}`,
      };
    }

    if (worksheet[descriptionAddress] && descriptionValue) {
      worksheet[descriptionAddress].s = EXCEL_SUMMARY_VALUE_STYLE;
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Menu");
  workbook.SheetNames = ["Menu", ...workbook.SheetNames.filter((sheetName) => sheetName !== "Menu")];
}

export function exportBrevetBlancPanoramaXlsx(reportData: BrevetBlancPanoramaReportData) {
  const workbook = XLSX.utils.book_new();

  appendOverviewSheet(workbook, reportData);
  appendComparisonSheets(workbook, reportData);
  appendGenderComparisonSheet(workbook, reportData);
  appendScholarshipComparisonSheet(workbook, reportData);
  appendHeatmapSheet(workbook, reportData);
  appendTopSheets(workbook, reportData);
  appendGlobalStudentSheets(workbook, reportData);
  appendWorkbookMenuSheet(workbook, reportData);

  const worksheetPrintAreas = new Map<string, string>();
  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (worksheet?.["!ref"]) {
      worksheetPrintAreas.set(sheetName, worksheet["!ref"]);
    }
  });

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (worksheet) {
      extendWorksheetVisibleArea(worksheet);
    }
  });

  const workbookBytes = new Uint8Array(XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  }));
  const finalWorkbookBytes = applySheetViewOptionsToWorkbookFile(
    workbookBytes,
    workbook.SheetNames,
    workbook.SheetNames.map((sheetName) => ({
      sheetName,
      hideGridLines: true,
      lastVisibleColumn: getWorksheetLastVisibleColumn(workbook.Sheets[sheetName]),
      hideTrailingRows: true,
      printArea: worksheetPrintAreas.get(sheetName),
      fitToWidth: isPerClassDetailSheetName(sheetName) ? 1 : undefined,
      fitToHeight: isPerClassDetailSheetName(sheetName) ? 1 : undefined,
      topRows:
        sheetName === "Menu" || sheetName === "Tout alpha" || sheetName === "Classement" ?
          4 :
          (sheetName === "03 - Filles-Garçons" || sheetName === "04 - Boursiers" ? 10 : undefined),
    })),
  );

  downloadWorkbookFile(finalWorkbookBytes, `Bilan_Panorama_Brevet_Blanc_${reportData.year}.xlsx`);
}

function addPdfSectionTitle(doc: jsPDF, title: string, subtitle?: string) {
  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 16);

  if (subtitle) {
    doc.setTextColor(100, 116, 139);
    setPdfFont(doc, "normal");
    doc.setFontSize(10);
    doc.text(subtitle, 14, 22);
  }
}

function addPdfFooter(doc: jsPDF, year: string) {
  const pageCount = doc.getNumberOfPages();

  for (let index = 1; index <= pageCount; index++) {
    doc.setPage(index);
    doc.setFontSize(8);
    setPdfFont(doc, "normal");
    doc.text(
      `Bilan panorama brevet blanc ${year} - page ${index}/${pageCount}`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 8,
      {align: "right"}
    );
  }
}

function addPdfSummaryPage(
  doc: jsPDF,
  reportData: BrevetBlancPanoramaReportData,
  rows: PdfSummaryRow[],
  summaryPageNumber: number,
) {
  doc.setPage(summaryPageNumber);
  addPdfSectionTitle(doc, "Sommaire", `Année scolaire ${reportData.year}`);

  const tableRows = rows.map((row, rowIndex) => [
    rowIndex === 0 || rows[rowIndex - 1]?.section !== row.section ? row.section : "",
    row.label,
    row.pageText,
  ]);

  autoTable(doc, {
    startY: 30,
    head: [["Section", "Partie", "Page"]],
    body: tableRows,
    styles: {
      font: getPdfFontFamily(doc),
      fontSize: 8.5,
      cellPadding: 2,
      valign: "middle",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      textColor: [15, 23, 42],
    },
    headStyles: {
      font: getPdfFontFamily(doc),
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: {cellWidth: 56, fontStyle: "bold", textColor: [29, 78, 216]},
      1: {cellWidth: 171},
      2: {cellWidth: 22, halign: "center", fontStyle: "bold", textColor: [29, 78, 216]},
    },
    margin: {left: 14, right: 14},
    didDrawCell: (hookData) => {
      if (hookData.section !== "body") {
        return;
      }

      const summaryRow = rows[hookData.row.index];
      if (!summaryRow) {
        return;
      }

      if (hookData.column.index === 1 || hookData.column.index === 2) {
        doc.link(hookData.cell.x, hookData.cell.y, hookData.cell.width, hookData.cell.height, {
          pageNumber: summaryRow.targetPageNumber,
        });
      }
    },
  });
}

function addPdfTable<Row>(
  doc: jsPDF,
  rows: Row[],
  columns: ColumnDefinition<Row>[],
  title: string,
  subtitle?: string,
  options?: PdfTableOptions
) {
  addPdfSectionTitle(doc, title, subtitle);

  const formatTableCellValue = (value: string | number | undefined, column: ColumnDefinition<Row>) => {
    if (typeof value === "number") {
      if (column.cellType === "int") {
        return value.toFixed(0);
      }
      return value.toFixed(2).replace(".", ",");
    }
    return value ?? "";
  };

  autoTable(doc, {
    startY: subtitle ? 28 : 24,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) => columns.map((column) => formatTableCellValue(column.value(row), column))),
    foot: options?.footerRows?.map((footerRow) => footerRow.map((value, columnIndex) => formatTableCellValue(value, columns[columnIndex]))),
    showFoot: options?.footerRows?.length ? "lastPage" : "never",
    styles: {
      font: getPdfFontFamily(doc),
      fontSize: options?.fontSize ?? 8,
      cellPadding: options?.cellPadding ?? 1.5,
      valign: "middle",
      halign: "center",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      font: getPdfFontFamily(doc),
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    footStyles: {
      font: getPdfFontFamily(doc),
      fillColor: [239, 246, 255],
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    columnStyles: columns.reduce<Record<number, {cellWidth?: number; halign?: Alignment}>>((accumulator, column, index) => {
      accumulator[index] = {
        cellWidth: column.width,
        halign: column.align ?? "center",
      };
      return accumulator;
    }, {}),
    didParseCell: (hookData) => {
      const cellText = hookData.cell.text.join(" ");
      if (hasComparisonSymbol(cellText)) {
        hookData.cell.text = [""];
      }

      if (hookData.section !== "body") {
        return;
      }

      const column = columns[hookData.column.index];
      const row = rows[hookData.row.index];
      const value = column.value(row);

      if (column.cellType === "average" && typeof value === "number") {
        if (value >= 15) {
          hookData.cell.styles.fillColor = [22, 163, 74];
          hookData.cell.styles.textColor = [255, 255, 255];
        } else if (value >= 10) {
          hookData.cell.styles.fillColor = [134, 239, 172];
          hookData.cell.styles.textColor = [20, 83, 45];
        } else if (value >= 8) {
          hookData.cell.styles.fillColor = [253, 230, 138];
          hookData.cell.styles.textColor = [146, 64, 14];
        } else {
          hookData.cell.styles.fillColor = [248, 113, 113];
          hookData.cell.styles.textColor = [127, 29, 29];
        }
      }

      if (column.cellType === "progression" && typeof value === "number") {
        if (value > 0) {
          hookData.cell.styles.textColor = [22, 101, 52];
          hookData.cell.styles.fontStyle = "bold";
        } else if (value < 0) {
          hookData.cell.styles.textColor = [185, 28, 28];
          hookData.cell.styles.fontStyle = "bold";
        } else {
          hookData.cell.styles.textColor = [71, 85, 105];
          hookData.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawCell: (hookData) => {
      const rawText = typeof hookData.cell.raw === "string" ? hookData.cell.raw : "";
      if (!hasComparisonSymbol(rawText)) {
        return;
      }

      const style: PdfFontStyle =
        typeof hookData.cell.styles.fontStyle === "string" && hookData.cell.styles.fontStyle.includes("bold") ?
          "bold" :
          "normal";
      const color = getPdfTextColor(hookData.cell.styles.textColor);
      const renderedImage = getPdfRenderedTextImage(
        rawText,
        hookData.cell.styles.fontSize ?? (options?.fontSize ?? 8),
        style,
        color,
      );
      if (!renderedImage) {
        return;
      }

      const alignment = (hookData.cell.styles.halign ?? "center") as Alignment;
      let drawX = hookData.cell.x + 1;
      if (alignment === "center") {
        drawX = hookData.cell.x + ((hookData.cell.width - renderedImage.widthMm) / 2);
      } else if (alignment === "right") {
        drawX = hookData.cell.x + hookData.cell.width - renderedImage.widthMm - 1;
      }

      const drawY = hookData.cell.y + ((hookData.cell.height - renderedImage.heightMm) / 2);
      doc.addImage(
        renderedImage.dataUrl,
        "PNG",
        drawX,
        drawY,
        renderedImage.widthMm,
        renderedImage.heightMm,
        undefined,
        "FAST",
      );
    },
  });
}

function buildAverageFooterRow(
  students: PanoramaClassDetailStudentRow[],
  columns: ColumnDefinition<PanoramaClassDetailStudentRow>[],
  label: string,
): Array<string | number | undefined> {
  return columns.map((column, columnIndex) => {
    if (columnIndex === 0) {
      return label;
    }

    if (column.cellType !== "average") {
      return "";
    }

    const values = students
      .map((student) => column.value(student))
      .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

    if (values.length === 0) {
      return undefined;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
}

function buildClassDetailFooterRow(
  students: PanoramaClassDetailStudentRow[],
  columns: ColumnDefinition<PanoramaClassDetailStudentRow>[],
): Array<string | number | undefined> {
  return buildAverageFooterRow(students, columns, "Moy. classe");
}

function getWorksheetLastVisibleColumn(worksheet: XLSX.WorkSheet): number | undefined {
  if (!worksheet["!ref"]) {
    return undefined;
  }

  return XLSX.utils.decode_range(worksheet["!ref"]).e.c + 1;
}

function extendWorksheetVisibleArea(
  worksheet: XLSX.WorkSheet,
  extraColumns = EXCEL_VISIBLE_PADDING_COLUMNS,
  extraRows = EXCEL_VISIBLE_PADDING_ROWS,
) {
  if (!worksheet["!ref"]) {
    return;
  }

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const targetColumnIndex = Math.min(range.e.c + extraColumns, EXCEL_MAX_COLUMN_INDEX - 1);
  const targetRowIndex = range.e.r + extraRows;

  range.e.c = targetColumnIndex;
  range.e.r = targetRowIndex;
  worksheet["!ref"] = XLSX.utils.encode_range(range);

  const worksheetColumns = worksheet["!cols"] ?? [];
  while (worksheetColumns.length <= targetColumnIndex) {
    worksheetColumns.push({wch: 12});
  }
  worksheet["!cols"] = worksheetColumns;

  const worksheetRows = worksheet["!rows"] ?? [];
  while (worksheetRows.length <= targetRowIndex) {
    worksheetRows.push({hpt: 18});
  }
  worksheet["!rows"] = worksheetRows;
}

function buildHiddenColumnsXml(lastVisibleColumn: number | undefined) {
  if (!lastVisibleColumn || lastVisibleColumn >= EXCEL_MAX_COLUMN_INDEX) {
    return "";
  }

  return `<cols><col min="${lastVisibleColumn + 1}" max="${EXCEL_MAX_COLUMN_INDEX}" hidden="1" width="0" customWidth="1"/></cols>`;
}

function applyHiddenTrailingRowsSheetFormat(worksheetXml: string): string {
  if (worksheetXml.includes("<sheetFormatPr")) {
    return worksheetXml.replace(
      /<sheetFormatPr\b([^>]*)\/>/u,
      (_match, attributes: string) =>
        /zeroHeight="/u.test(attributes) ?
          `<sheetFormatPr${attributes.replace(/zeroHeight="[^"]*"/u, ' zeroHeight="1"')}/>` :
          `<sheetFormatPr${attributes} zeroHeight="1"/>`,
    );
  }

  if (worksheetXml.includes("</sheetViews>")) {
    return worksheetXml.replace(/<\/sheetViews>/u, `</sheetViews><sheetFormatPr defaultRowHeight="15" zeroHeight="1"/>`);
  }

  return worksheetXml.replace(
    /<worksheet\b([^>]*)>/u,
    `<worksheet$1><sheetFormatPr defaultRowHeight="15" zeroHeight="1"/>`,
  );
}

function applyPrintLayoutSettings(
  worksheetXml: string,
  {fitToWidth, fitToHeight}: Pick<XlsxSheetViewOptions, "fitToWidth" | "fitToHeight">,
): string {
  const fitToWidthAttribute = typeof fitToWidth === "number" ? ` fitToWidth="${fitToWidth}"` : "";
  const fitToHeightAttribute = typeof fitToHeight === "number" ? ` fitToHeight="${fitToHeight}"` : "";
  const pageSetupXml =
    `<pageSetup paperSize="${XLSX_A4_PAPER_SIZE}" orientation="landscape"${fitToWidthAttribute}${fitToHeightAttribute}/>`;
  const pageMarginsXml =
    `<pageMargins left="${XLSX_MARGIN_ONE_CENTIMETER_INCH}" right="${XLSX_MARGIN_ONE_CENTIMETER_INCH}" top="${XLSX_MARGIN_ONE_CENTIMETER_INCH}" bottom="${XLSX_MARGIN_ONE_CENTIMETER_INCH}" header="${XLSX_HEADER_FOOTER_MARGIN_INCH}" footer="${XLSX_HEADER_FOOTER_MARGIN_INCH}"/>`;
  const needsFitToPage = typeof fitToWidth === "number" || typeof fitToHeight === "number";

  const withPageSetup = worksheetXml.includes("<pageSetup") ?
    worksheetXml.replace(/<pageSetup\b[^>]*\/>/u, pageSetupXml) :
    worksheetXml.includes("</worksheet>") ?
      worksheetXml.replace(/<\/worksheet>/u, `${pageSetupXml}</worksheet>`) :
      worksheetXml;

  const withPageMargins = withPageSetup.includes("<pageMargins") ?
    withPageSetup.replace(/<pageMargins\b[^>]*\/>/u, pageMarginsXml) :
    withPageSetup.includes("</worksheet>") ?
      withPageSetup.replace(/<\/worksheet>/u, `${pageMarginsXml}</worksheet>`) :
      withPageSetup;

  const withFitToPage = needsFitToPage ?
    withPageMargins.includes("<pageSetUpPr") ?
      withPageMargins.replace(/<pageSetUpPr\b[^>]*\/>/u, '<pageSetUpPr fitToPage="1"/>') :
      withPageMargins.includes("<sheetPr/>") ?
        withPageMargins.replace(/<sheetPr\/>/u, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>') :
        withPageMargins.includes("</sheetPr>") ?
          withPageMargins.replace(/<\/sheetPr>/u, '<pageSetUpPr fitToPage="1"/></sheetPr>') :
          withPageMargins.replace(/<worksheet\b([^>]*)>/u, '<worksheet$1><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>') :
    withPageMargins;

  return withFitToPage
    .replace(new RegExp(`${pageSetupXml}${pageMarginsXml}`, "u"), `${pageMarginsXml}${pageSetupXml}`)
    .replace(/(<pageSetup\b[^>]*\/>)(<pageMargins\b[^>]*\/>)/u, "$2$1");
}

function toAbsoluteWorksheetRange(rangeRef: string) {
  const range = XLSX.utils.decode_range(rangeRef);
  const startCell = `$${XLSX.utils.encode_col(range.s.c)}$${range.s.r + 1}`;
  const endCell = `$${XLSX.utils.encode_col(range.e.c)}$${range.e.r + 1}`;
  return `${startCell}:${endCell}`;
}

function applyWorkbookPrintAreas(
  workbookXml: string,
  sheetNames: string[],
  sheetViewOptions: XlsxSheetViewOptions[],
) {
  const printAreaEntries = sheetViewOptions
    .map((sheetViewOption) => {
      if (!sheetViewOption.printArea) {
        return "";
      }

      const sheetIndex = sheetNames.indexOf(sheetViewOption.sheetName);
      if (sheetIndex === -1) {
        return "";
      }

      const escapedSheetName = sheetViewOption.sheetName.replace(/'/gu, "''");
      return `<definedName name="_xlnm.Print_Area" localSheetId="${sheetIndex}">'${escapedSheetName}'!${toAbsoluteWorksheetRange(sheetViewOption.printArea)}</definedName>`;
    })
    .filter(Boolean)
    .join("");

  const workbookWithoutPrintAreas = workbookXml.replace(
    /<definedName name="_xlnm\.Print_Area"[^>]*>[\s\S]*?<\/definedName>/gu,
    "",
  );

  if (!printAreaEntries) {
    return workbookWithoutPrintAreas;
  }

  if (workbookWithoutPrintAreas.includes("<definedNames>")) {
    return workbookWithoutPrintAreas.replace(/<\/definedNames>/u, `${printAreaEntries}</definedNames>`);
  }

  return workbookWithoutPrintAreas.replace(/<\/workbook>/u, `<definedNames>${printAreaEntries}</definedNames></workbook>`);
}

function isPerClassDetailSheetName(sheetName: string) {
  return !/^\d{2} - /u.test(sheetName)
    && sheetName !== "Menu"
    && sheetName !== "Tout alpha"
    && sheetName !== "Classement";
}

function buildSheetViewsXml({topRows, hideGridLines, hideRowColHeaders}: XlsxSheetViewOptions) {
  const sheetViewAttributes = [
    `workbookViewId="0"`,
    hideGridLines ? `showGridLines="0"` : "",
    hideRowColHeaders ? `showRowColHeaders="0"` : "",
  ].filter(Boolean).join(" ");

  if (!topRows || topRows <= 0) {
    return `<sheetViews><sheetView ${sheetViewAttributes}/></sheetViews>`;
  }

  const topLeftCell = `A${topRows + 1}`;
  return `<sheetViews><sheetView ${sheetViewAttributes}><pane ySplit="${topRows}" topLeftCell="${topLeftCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${topLeftCell}" sqref="${topLeftCell}"/></sheetView></sheetViews>`;
}

function applySheetViewOptionsToWorkbookFile(
  workbookBytes: Uint8Array,
  sheetNames: string[],
  sheetViewOptions: XlsxSheetViewOptions[],
) {
  if (sheetViewOptions.length === 0) {
    return workbookBytes;
  }

  const archiveEntries = unzipSync(workbookBytes);

  sheetViewOptions.forEach((sheetViewOption) => {
    const {sheetName} = sheetViewOption;
    const sheetIndex = sheetNames.indexOf(sheetName);
    if (sheetIndex === -1) {
      return;
    }

    const worksheetPath = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    const worksheetEntry = archiveEntries[worksheetPath];
    if (!worksheetEntry) {
      return;
    }

    const worksheetXml = strFromU8(worksheetEntry);
    const sheetViewsXml = buildSheetViewsXml(sheetViewOption);
    const hiddenColumnsXml = buildHiddenColumnsXml(sheetViewOption.lastVisibleColumn);
    const worksheetXmlWithUpdatedView = worksheetXml.includes("<sheetViews>") ?
      worksheetXml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/u, sheetViewsXml) :
      worksheetXml.replace(/<worksheet\b([^>]*)>/u, `<worksheet$1>${sheetViewsXml}`);
    const updatedWorksheetXml = hiddenColumnsXml ?
      worksheetXmlWithUpdatedView.includes("<cols>") ?
        worksheetXmlWithUpdatedView.replace(/<\/cols>/u, `${hiddenColumnsXml.replace(/^<cols>|<\/cols>$/gu, "")}</cols>`) :
        worksheetXmlWithUpdatedView.replace(/<sheetData>/u, `${hiddenColumnsXml}<sheetData>`) :
      worksheetXmlWithUpdatedView;
    const worksheetXmlWithHiddenTrailingRows = sheetViewOption.hideTrailingRows ?
      applyHiddenTrailingRowsSheetFormat(updatedWorksheetXml) :
      updatedWorksheetXml;
    const finalWorksheetXml = applyPrintLayoutSettings(worksheetXmlWithHiddenTrailingRows, sheetViewOption);

    archiveEntries[worksheetPath] = strToU8(finalWorksheetXml);
  });

  const workbookPath = "xl/workbook.xml";
  const workbookEntry = archiveEntries[workbookPath];
  if (workbookEntry) {
    const workbookXml = strFromU8(workbookEntry);
    archiveEntries[workbookPath] = strToU8(applyWorkbookPrintAreas(workbookXml, sheetNames, sheetViewOptions));
  }

  return zipSync(archiveEntries, {level: 6});
}

function downloadWorkbookFile(workbookBytes: Uint8Array, fileName: string) {
  const workbookBuffer = new ArrayBuffer(workbookBytes.byteLength);
  new Uint8Array(workbookBuffer).set(workbookBytes);

  const workbookBlob = new Blob([workbookBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const downloadUrl = URL.createObjectURL(workbookBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  downloadLink.click();
  URL.revokeObjectURL(downloadUrl);
}

function addPdfHeatmap(
  doc: jsPDF,
  reportData: BrevetBlancPanoramaReportData,
  brevetKey: HeatmapBrevetKey
) {
  const rows = buildClassSubjectHeatmapRows(reportData, brevetKey);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const marginBottom = 18;
  const legendY = 31;
  const tableStartY = 42;
  const classColumnWidth = 24;
  const totalWidth = pageWidth - marginLeft - marginRight;
  const subjectCount = Math.max(reportData.config.subjects.length, 1);
  const subjectColumnWidth = (totalWidth - classColumnWidth) / subjectCount;
  const availableHeight = pageHeight - tableStartY - marginBottom;
  const rowHeight = Math.max(8, Math.min(16, availableHeight / (rows.length + 1)));
  const headerFontSize = subjectColumnWidth >= 18 ? 8 : 7;
  const valueFontSize = rowHeight >= 12 ? 8 : 7;
  const labelFontSize = rowHeight >= 12 ? 8 : 7;
  const blueHeader: [number, number, number] = [29, 78, 216];
  const blueLabel: [number, number, number] = [239, 246, 255];
  const neutralBorder: [number, number, number] = [203, 213, 225];

  addPdfSectionTitle(
    doc,
    "Matrice des moyennes par classe",
    `Session ${brevetKey.toUpperCase()} - notes sur 20`
  );

  const legendAnchors = [0, 8, 10, 15, 20];
  let legendX = marginLeft;
  setPdfFont(doc, "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Legende :", legendX, legendY + 2.5);
  legendX += 18;

  legendAnchors.forEach((anchor, index) => {
    const color = getHeatmapColor(anchor);
    doc.setDrawColor(...neutralBorder);
    doc.setFillColor(...color);
    doc.rect(legendX, legendY - 2, 8, 5, "FD");
    doc.setTextColor(17, 24, 39);
    doc.text(index === legendAnchors.length - 1 ? "20" : `${anchor}+`, legendX + 10, legendY + 2.2);
    legendX += 22;
  });

  doc.setDrawColor(...neutralBorder);
  doc.setLineWidth(0.2);

  const drawCell = (
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor: [number, number, number],
    text: string,
    textColor: [number, number, number],
    fontSize: number,
    fontStyle: "normal" | "bold" = "normal"
  ) => {
    doc.setFillColor(...fillColor);
    doc.rect(x, y, width, height, "FD");
    setPdfFont(doc, fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(...textColor);
    doc.text(text, x + (width / 2), y + (height / 2) + 1, {align: "center", baseline: "middle"});
  };

  drawCell(marginLeft, tableStartY, classColumnWidth, rowHeight, blueHeader, "Classe", [255, 255, 255], 8, "bold");

  reportData.config.subjects.forEach((subject, subjectIndex) => {
    const abbreviation = reportData.config.abbreviations[subject] || subject;
    const x = marginLeft + classColumnWidth + (subjectIndex * subjectColumnWidth);
    drawCell(x, tableStartY, subjectColumnWidth, rowHeight, blueHeader, abbreviation, [255, 255, 255], headerFontSize, "bold");
  });

  rows.forEach((row, rowIndex) => {
    const y = tableStartY + ((rowIndex + 1) * rowHeight);
    drawCell(marginLeft, y, classColumnWidth, rowHeight, blueLabel, row.className, [17, 24, 39], labelFontSize, "bold");

    reportData.config.subjects.forEach((subject, subjectIndex) => {
      const value = row.values[subject];
      const x = marginLeft + classColumnWidth + (subjectIndex * subjectColumnWidth);
      const fillColor = getHeatmapColor(value);
      const textColor: [number, number, number] =
        typeof value === "number" ? getTextColorForBackground(fillColor) : [100, 116, 139];
      drawCell(
        x,
        y,
        subjectColumnWidth,
        rowHeight,
        fillColor,
        typeof value === "number" ? formatNumber(value, 1) : "-",
        textColor,
        valueFontSize,
        "bold"
      );
    });
  });
}

function buildDistributionSlices(distribution: ScoreDistribution): PdfDistributionSlice[] {
  const total = distribution.count || 0;
  const sliceDefinitions: Array<{label: string; value: number; color: [number, number, number]}> = [
    {label: "≥ 15", value: distribution.gte15, color: [22, 163, 74]},
    {label: "10-14.9", value: distribution.gte10lt15, color: [134, 239, 172]},
    {label: "8-9.9", value: distribution.gte8lt10, color: [245, 158, 11]},
    {label: "< 8", value: distribution.lt8, color: [239, 68, 68]},
  ];

  return sliceDefinitions
    .filter((slice) => slice.value > 0)
    .map((slice) => ({
      ...slice,
      percentage: total > 0 ? (slice.value / total) * 100 : 0,
    }));
}

type PdfPoint = {
  x: number;
  y: number;
};

type PdfDonutExternalLabel = {
  side: "left" | "right";
  anchorX: number;
  anchorY: number;
  elbowX: number;
  preferredY: number;
  adjustedY?: number;
  text: string;
  color: [number, number, number];
};

function buildArcPoints(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): PdfPoint[] {
  const segments = Math.max(8, Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 18)));
  const points: PdfPoint[] = [];

  for (let index = 0; index <= segments; index++) {
    const ratio = segments === 0 ? 0 : index / segments;
    const angle = startAngle + ((endAngle - startAngle) * ratio);
    points.push({
      x: centerX + (Math.cos(angle) * radius),
      y: centerY + (Math.sin(angle) * radius),
    });
  }

  return points;
}

function drawPdfFilledPolygon(
  doc: jsPDF,
  points: PdfPoint[],
  fillColor: [number, number, number],
) {
  if (points.length < 2) {
    return;
  }

  const [firstPoint, ...otherPoints] = points;
  const relativeVectors: Array<[number, number]> = [];
  let previousPoint = firstPoint;

  otherPoints.forEach((point) => {
    relativeVectors.push([point.x - previousPoint.x, point.y - previousPoint.y]);
    previousPoint = point;
  });

  doc.setFillColor(...fillColor);
  doc.setDrawColor(...fillColor);
  doc.lines(relativeVectors, firstPoint.x, firstPoint.y, [1, 1], "F", true);
}

function drawPdfLegendItems(
  doc: jsPDF,
  items: Array<{label: string; color: [number, number, number]}>,
  x: number,
  y: number,
  width: number,
  fontSize = 8,
) {
  doc.setFontSize(fontSize);
  const gap = 6;
  const itemWidths = items.map((item) => 4 + 2 + getPdfTextWidthForStyle(doc, item.label, "normal"));
  const totalWidth = itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + (gap * Math.max(items.length - 1, 0));
  let currentX = x + Math.max(0, (width - totalWidth) / 2);

  items.forEach((item, index) => {
    doc.setFillColor(...item.color);
    doc.rect(currentX, y - 2.4, 4, 4, "F");
    drawPdfText(doc, item.label, currentX + 6, y + 0.8, {
      style: "normal",
      color: [17, 24, 39],
      align: "left",
    });
    currentX += itemWidths[index] + gap;
  });
}

function drawCanvasLegendItems(
  context: CanvasRenderingContext2D,
  items: Array<{label: string; color: [number, number, number]}>,
  x: number,
  y: number,
  width: number,
  font = "24px Arial",
) {
  context.save();
  context.font = font;
  context.textAlign = "left";
  context.textBaseline = "middle";

  const gap = 18;
  const itemWidths = items.map((item) => 22 + 12 + context.measureText(item.label).width);
  const totalWidth = itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + (gap * Math.max(items.length - 1, 0));
  let currentX = x + Math.max(0, (width - totalWidth) / 2);

  items.forEach((item, index) => {
    context.fillStyle = toCssRgb(item.color);
    context.fillRect(currentX, y - 11, 22, 22);
    context.fillStyle = "#111827";
    context.fillText(item.label, currentX + 34, y);
    currentX += itemWidths[index] + gap;
  });

  context.restore();
}

function drawPdfDonut(
  doc: jsPDF,
  {
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    slices,
    gap = 0.045,
    insideLabelThreshold = 6,
    insideLabelFontSize = 10,
    outsideLabelFontSize = 8,
    backgroundColor = [255, 255, 255] as [number, number, number],
  }: {
    centerX: number;
    centerY: number;
    outerRadius: number;
    innerRadius: number;
    slices: PdfDistributionSlice[];
    gap?: number;
    insideLabelThreshold?: number;
    insideLabelFontSize?: number;
    outsideLabelFontSize?: number;
    backgroundColor?: [number, number, number];
  },
) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let startAngle = -Math.PI / 2;
  const insideLabels: Array<{x: number; y: number; text: string}> = [];
  const externalLabels: PdfDonutExternalLabel[] = [];

  slices.forEach((slice) => {
    if (total <= 0) {
      return;
    }

    const sweep = (slice.value / total) * Math.PI * 2;
    const anglePadding = sweep > gap ? gap / 2 : 0;
    const sliceStart = startAngle + anglePadding;
    const sliceEnd = startAngle + sweep - anglePadding;
    const midAngle = startAngle + (sweep / 2);

    if (sliceEnd > sliceStart) {
      const outerPoints = buildArcPoints(centerX, centerY, outerRadius, sliceStart, sliceEnd);
      drawPdfFilledPolygon(doc, [{x: centerX, y: centerY}, ...outerPoints], slice.color);
    }

    const displayPercentage = `${Math.max(1, Math.round(slice.percentage))}%`;
    if (slice.percentage >= insideLabelThreshold) {
      const labelRadius = (innerRadius + outerRadius) / 2;
      insideLabels.push({
        x: centerX + (Math.cos(midAngle) * labelRadius),
        y: centerY + (Math.sin(midAngle) * labelRadius),
        text: displayPercentage,
      });
    } else if (slice.percentage > 0) {
      const side: "left" | "right" = Math.cos(midAngle) >= 0 ? "right" : "left";
      externalLabels.push({
        side,
        anchorX: centerX + (Math.cos(midAngle) * (outerRadius + 0.8)),
        anchorY: centerY + (Math.sin(midAngle) * (outerRadius + 0.8)),
        elbowX: centerX + (Math.cos(midAngle) * (outerRadius + 5)),
        preferredY: centerY + (Math.sin(midAngle) * (outerRadius + 5)),
        text: displayPercentage,
        color: slice.color,
      });
    }

    startAngle += sweep;
  });

  doc.setFillColor(...backgroundColor);
  doc.setDrawColor(...backgroundColor);
  doc.circle(centerX, centerY, innerRadius, "F");

  insideLabels.forEach((label) => {
    doc.setFontSize(insideLabelFontSize);
    drawPdfText(doc, label.text, label.x, label.y + 0.8, {
      style: "bold",
      color: [255, 255, 255],
      align: "center",
    });
  });

  const topLimit = centerY - outerRadius - 7;
  const bottomLimit = centerY + outerRadius + 7;
  const minLabelGap = Math.max(5, outsideLabelFontSize * 0.75);

  (["left", "right"] as const).forEach((side) => {
    const sideLabels = externalLabels
      .filter((label) => label.side === side)
      .sort((leftLabel, rightLabel) => leftLabel.preferredY - rightLabel.preferredY);

    sideLabels.forEach((label, index) => {
      const previousY = index === 0 ? topLimit - minLabelGap : (sideLabels[index - 1].adjustedY ?? topLimit);
      label.adjustedY = Math.max(label.preferredY, previousY + minLabelGap);
    });

    if (sideLabels.length === 0) {
      return;
    }

    const overflow = (sideLabels[sideLabels.length - 1].adjustedY ?? bottomLimit) - bottomLimit;
    if (overflow > 0) {
      sideLabels.forEach((label) => {
        label.adjustedY = (label.adjustedY ?? label.preferredY) - overflow;
      });
    }

    const underflow = topLimit - (sideLabels[0].adjustedY ?? topLimit);
    if (underflow > 0) {
      sideLabels.forEach((label) => {
        label.adjustedY = (label.adjustedY ?? label.preferredY) + underflow;
      });
    }
  });

  externalLabels.forEach((label) => {
    const adjustedY = label.adjustedY ?? label.preferredY;
    doc.setFontSize(outsideLabelFontSize);
    const textWidth = getPdfTextWidthForStyle(doc, label.text, "bold");
    const pillWidth = textWidth + 4.4;
    const pillHeight = Math.max(5.8, outsideLabelFontSize * 0.95);
    const textX = label.side === "right" ? centerX + outerRadius + 13 : centerX - outerRadius - 13;
    const pillX = textX - (pillWidth / 2);
    const lineEndX = label.side === "right" ? pillX - 1.5 : pillX + pillWidth + 1.5;

    doc.setDrawColor(...label.color);
    doc.setLineWidth(0.45);
    doc.line(label.anchorX, label.anchorY, label.elbowX, adjustedY);
    doc.line(label.elbowX, adjustedY, lineEndX, adjustedY);

    doc.setFillColor(...label.color);
    doc.roundedRect(pillX, adjustedY - (pillHeight / 2), pillWidth, pillHeight, pillHeight / 2, pillHeight / 2, "FD");
    drawPdfText(doc, label.text, pillX + (pillWidth / 2), adjustedY + 0.7, {
      style: "bold",
      color: [255, 255, 255],
      align: "center",
    });
  });
}

function addPdfDistributionDonutPageVector(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const legendItems: Array<{label: string; color: [number, number, number]}> = [
    {label: "≥ 15", color: [22, 163, 74]},
    {label: "10-14.9", color: [134, 239, 172]},
    {label: "8-9.9", color: [245, 158, 11]},
    {label: "< 8", color: [239, 68, 68]},
  ];
  const panels = [
    {
      title: "Brevet blanc 1 (/20)",
      subtitle: `${reportData.stats.overallDistributionBb1.count} participants`,
      slices: buildDistributionSlices(reportData.stats.overallDistributionBb1),
    },
  ];

  if (reportData.stats.overallDistributionBb2.count > 0) {
    panels.push({
      title: "Brevet blanc 2 (/20)",
      subtitle: `${reportData.stats.overallDistributionBb2.count} participants`,
      slices: buildDistributionSlices(reportData.stats.overallDistributionBb2),
    });
  }

  addPdfSectionTitle(doc, "Répartition globale des moyennes");

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const panelGap = 7;
  const panelY = 24;
  const panelHeight = 130;
  const totalWidth = pageWidth - (marginX * 2);
  const panelWidth = panels.length === 1 ? totalWidth : (totalWidth - panelGap) / 2;
  const donutOuterRadius = panels.length === 1 ? 42 : 37;
  const donutInnerRadius = panels.length === 1 ? 17.5 : 15.5;
  const donutCenterY = panelY + (panels.length === 1 ? 72 : 69);

  panels.forEach((panel, index) => {
    const x = marginX + (index * (panelWidth + panelGap));

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, panelY, panelWidth, panelHeight, 4, 4, "FD");

    doc.setFontSize(11);
    drawPdfText(doc, panel.title, x + 10, panelY + 12, {style: "bold", color: PDF_TITLE_BLUE});
    doc.setFontSize(8.5);
    drawPdfText(doc, panel.subtitle, x + 10, panelY + 19, {style: "normal", color: [100, 116, 139]});

    if (panel.slices.length > 0) {
      drawPdfDonut(doc, {
        centerX: x + (panelWidth / 2),
        centerY: donutCenterY,
        outerRadius: donutOuterRadius,
        innerRadius: donutInnerRadius,
        slices: panel.slices,
        insideLabelFontSize: panels.length === 1 ? 13 : 11.5,
        outsideLabelFontSize: 8,
      });
    } else {
      doc.setFontSize(10);
      drawPdfText(doc, "Aucune donnée", x + (panelWidth / 2), panelY + 66, {
        style: "bold",
        color: [148, 163, 184],
        align: "center",
      });
    }

    drawPdfLegendItems(doc, legendItems, x + 6, panelY + panelHeight - 10, panelWidth - 12, 8);
  });

  return true;
}

function addPdfSubjectDistributionPagesVector(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const subjects = reportData.config.subjects;
  if (subjects.length === 0) {
    return 0;
  }

  const subjectsPerPage = 4;
  let pageCount = 0;
  const totalPages = Math.ceil(subjects.length / subjectsPerPage);
  const legendItems: Array<{label: string; color: [number, number, number]}> = [
    {label: "≥ 15", color: [22, 163, 74]},
    {label: "10-14.9", color: [134, 239, 172]},
    {label: "8-9.9", color: [245, 158, 11]},
    {label: "< 8", color: [239, 68, 68]},
  ];

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    doc.addPage();
    pageCount++;

    addPdfSectionTitle(
      doc,
      "Analyse des notes par matière (/20)",
      totalPages > 1 ? `Page ${pageIndex + 1}/${totalPages}` : undefined,
    );

    const currentSubjects = subjects.slice(pageIndex * subjectsPerPage, (pageIndex + 1) * subjectsPerPage);
    const columns = 2;
    const horizontalGap = 7;
    const verticalGap = 8;
    const marginX = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    drawPdfLegendItems(doc, legendItems, marginX, 29.5, pageWidth - (marginX * 2), 8);
    const startY = 35;
    const cardWidth = (pageWidth - (marginX * 2) - horizontalGap) / columns;
    const rowCount = Math.max(1, Math.ceil(currentSubjects.length / columns));
    const bottomMargin = 14;
    const cardHeight = (pageHeight - startY - bottomMargin - (verticalGap * Math.max(0, rowCount - 1))) / rowCount;

    currentSubjects.forEach((subject, subjectIndex) => {
      const column = subjectIndex % columns;
      const row = Math.floor(subjectIndex / columns);
      const x = marginX + (column * (cardWidth + horizontalGap));
      const y = startY + (row * (cardHeight + verticalGap));
      const bb1Distribution = reportData.stats.distributionBySubjectBb1[subject];
      const bb2Distribution = reportData.stats.distributionBySubjectBb2[subject];
      const bb1Slices = bb1Distribution ? buildDistributionSlices(bb1Distribution) : [];
      const bb2Slices = bb2Distribution ? buildDistributionSlices(bb2Distribution) : [];

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, "FD");

      doc.setFontSize(11);
      setPdfFont(doc, "bold");
      const subjectLines = doc.splitTextToSize(subject, cardWidth - 16).slice(0, 2);
      doc.setTextColor(...PDF_TITLE_BLUE);
      doc.text(subjectLines, x + 8, y + 10);

      const titleOffsetY = 8 + (subjectLines.length * 4.5);
      const leftCenterX = x + (cardWidth * 0.255);
      const rightCenterX = x + (cardWidth * 0.745);
      const donutCenterY = y + Math.min(cardHeight - 15, titleOffsetY + 34);
      const subjectDonutOuterRadius = rowCount === 1 ? 21 : 18.5;
      const subjectDonutInnerRadius = rowCount === 1 ? 8.2 : 7.2;

      doc.setFontSize(8.5);
      drawPdfText(doc, "Brevet blanc 1", leftCenterX, y + titleOffsetY + 2, {style: "bold", color: PDF_TITLE_BLUE, align: "center"});
      doc.setFontSize(7.5);
      drawPdfText(doc, `${bb1Distribution?.count ?? 0} notes`, leftCenterX, y + titleOffsetY + 8, {
        style: "normal",
        color: [100, 116, 139],
        align: "center",
      });

      if (bb1Slices.length > 0) {
        drawPdfDonut(doc, {
          centerX: leftCenterX,
          centerY: donutCenterY,
          outerRadius: subjectDonutOuterRadius,
          innerRadius: subjectDonutInnerRadius,
          slices: bb1Slices,
          gap: 0.05,
          insideLabelThreshold: 7,
          insideLabelFontSize: rowCount === 1 ? 10 : 9.5,
          outsideLabelFontSize: 6.8,
        });
      } else {
        doc.setFontSize(7.5);
        drawPdfText(doc, "Pas de données BB1", leftCenterX, donutCenterY + 1, {
          style: "normal",
          color: [148, 163, 184],
          align: "center",
        });
      }

      doc.setFontSize(8.5);
      drawPdfText(doc, "Brevet blanc 2", rightCenterX, y + titleOffsetY + 2, {style: "bold", color: PDF_TITLE_BLUE, align: "center"});
      doc.setFontSize(7.5);
      drawPdfText(doc, `${bb2Distribution?.count ?? 0} notes`, rightCenterX, y + titleOffsetY + 8, {
        style: "normal",
        color: [100, 116, 139],
        align: "center",
      });

      if (bb2Slices.length > 0) {
        drawPdfDonut(doc, {
          centerX: rightCenterX,
          centerY: donutCenterY,
          outerRadius: subjectDonutOuterRadius,
          innerRadius: subjectDonutInnerRadius,
          slices: bb2Slices,
          gap: 0.05,
          insideLabelThreshold: 7,
          insideLabelFontSize: rowCount === 1 ? 10 : 9.5,
          outsideLabelFontSize: 6.8,
        });
      } else {
        doc.setFontSize(7.5);
        drawPdfText(doc, "Pas de données BB2", rightCenterX, donutCenterY + 1, {
          style: "normal",
          color: [148, 163, 184],
          align: "center",
        });
      }
    });
  }

  return pageCount;
}

type CanvasDonutExternalLabel = {
  side: "left" | "right";
  anchorX: number;
  anchorY: number;
  elbowX: number;
  preferredY: number;
  adjustedY?: number;
  text: string;
  color: [number, number, number];
};

function drawCanvasDonut(
  context: CanvasRenderingContext2D,
  {
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    slices,
    gap,
    insideLabelThreshold,
    insideLabelFont,
    outsideLabelFont,
  }: {
    centerX: number;
    centerY: number;
    outerRadius: number;
    innerRadius: number;
    slices: PdfDistributionSlice[];
    gap: number;
    insideLabelThreshold: number;
    insideLabelFont: string;
    outsideLabelFont: string;
  },
) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let startAngle = (-Math.PI / 2);
  const externalLabels: CanvasDonutExternalLabel[] = [];

  slices.forEach((slice) => {
    if (total <= 0) {
      return;
    }

    const sweep = (slice.value / total) * Math.PI * 2;
    const anglePadding = sweep > gap ? gap / 2 : 0;
    const sliceStart = startAngle + anglePadding;
    const sliceEnd = startAngle + sweep - anglePadding;
    const midAngle = startAngle + (sweep / 2);

    context.beginPath();
    context.arc(centerX, centerY, outerRadius, sliceStart, sliceEnd);
    context.arc(centerX, centerY, innerRadius, sliceEnd, sliceStart, true);
    context.closePath();
    context.fillStyle = toCssRgb(slice.color);
    context.fill();

    const displayPercentage = `${Math.max(1, Math.round(slice.percentage))}%`;

    if (slice.percentage >= insideLabelThreshold) {
      const labelRadius = (innerRadius + outerRadius) / 2;
      const labelX = centerX + Math.cos(midAngle) * labelRadius;
      const labelY = centerY + Math.sin(midAngle) * labelRadius;
      context.fillStyle = "#FFFFFF";
      context.shadowColor = "rgba(15, 23, 42, 0.25)";
      context.shadowBlur = 4;
      context.font = insideLabelFont;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(displayPercentage, labelX, labelY);
      context.shadowBlur = 0;
    } else if (slice.percentage > 0) {
      const side: "left" | "right" = Math.cos(midAngle) >= 0 ? "right" : "left";
      externalLabels.push({
        side,
        anchorX: centerX + Math.cos(midAngle) * (outerRadius + 2),
        anchorY: centerY + Math.sin(midAngle) * (outerRadius + 2),
        elbowX: centerX + Math.cos(midAngle) * (outerRadius + 16),
        preferredY: centerY + Math.sin(midAngle) * (outerRadius + 16),
        text: displayPercentage,
        color: slice.color,
      });
    }

    startAngle += sweep;
  });

  const topLimit = centerY - outerRadius - 18;
  const bottomLimit = centerY + outerRadius + 18;
  const minLabelGap = 18;

  (["left", "right"] as const).forEach((side) => {
    const sideLabels = externalLabels
      .filter((label) => label.side === side)
      .sort((leftLabel, rightLabel) => leftLabel.preferredY - rightLabel.preferredY);

    sideLabels.forEach((label, index) => {
      const previousY = index === 0 ? topLimit - minLabelGap : (sideLabels[index - 1].adjustedY ?? topLimit);
      label.adjustedY = Math.max(label.preferredY, previousY + minLabelGap);
    });

    if (sideLabels.length === 0) {
      return;
    }

    const overflow = (sideLabels[sideLabels.length - 1].adjustedY ?? bottomLimit) - bottomLimit;
    if (overflow > 0) {
      sideLabels.forEach((label) => {
        label.adjustedY = (label.adjustedY ?? label.preferredY) - overflow;
      });
    }

    const underflow = topLimit - (sideLabels[0].adjustedY ?? topLimit);
    if (underflow > 0) {
      sideLabels.forEach((label) => {
        label.adjustedY = (label.adjustedY ?? label.preferredY) + underflow;
      });
    }
  });

  externalLabels.forEach((label) => {
    const adjustedY = label.adjustedY ?? label.preferredY;
    const textPaddingX = 7;
    const textX = label.side === "right" ? centerX + outerRadius + 32 : centerX - outerRadius - 32;
    context.font = outsideLabelFont;
    const textWidth = context.measureText(label.text).width;
    const pillWidth = textWidth + (textPaddingX * 2);
    const pillHeight = 22;
    const pillX = textX - (pillWidth / 2);
    const lineEndX = label.side === "right" ? pillX - 5 : pillX + pillWidth + 5;

    context.strokeStyle = toCssRgb(label.color);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(label.anchorX, label.anchorY);
    context.lineTo(label.elbowX, adjustedY);
    context.lineTo(lineEndX, adjustedY);
    context.stroke();

    context.fillStyle = toCssRgb(label.color);
    context.strokeStyle = toCssRgb(label.color);
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(pillX, adjustedY - (pillHeight / 2), pillWidth, pillHeight, 11);
    context.fill();
    context.stroke();

    context.fillStyle = "#FFFFFF";
    context.font = outsideLabelFont;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label.text, pillX + (pillWidth / 2), adjustedY + 1);
  });
}

function createDistributionDonutImage(reportData: BrevetBlancPanoramaReportData): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 580;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const panelGap = 40;
  const panelMargin = 40;
  const legendItems: Array<{label: string; color: [number, number, number]}> = [
    {label: "≥ 15", color: [22, 163, 74]},
    {label: "10-14.9", color: [134, 239, 172]},
    {label: "8-9.9", color: [245, 158, 11]},
    {label: "< 8", color: [239, 68, 68]},
  ];
  const panels = [
    {
      title: "Brevet blanc 1 (/20)",
      subtitle: `${reportData.stats.overallDistributionBb1.count} participants`,
      slices: buildDistributionSlices(reportData.stats.overallDistributionBb1),
    },
  ];

  if (reportData.stats.overallDistributionBb2.count > 0) {
    panels.push({
      title: "Brevet blanc 2 (/20)",
      subtitle: `${reportData.stats.overallDistributionBb2.count} participants`,
      slices: buildDistributionSlices(reportData.stats.overallDistributionBb2),
    });
  }

  const panelWidth =
    panels.length === 1 ?
      canvas.width - (panelMargin * 2) :
      (canvas.width - (panelMargin * 2) - panelGap) / 2;
  const panelHeight = 430;
  const startX = panels.length === 1 ? panelMargin : panelMargin;

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const drawLegendInPanel = (x: number, y: number, width: number) => {
    context.font = "22px Arial";
    context.textAlign = "left";
    context.textBaseline = "middle";

    const itemWidths = legendItems.map((item) => 18 + 14 + context.measureText(item.label).width);
    const gap = 24;
    const totalLegendWidth =
      itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + (gap * Math.max(legendItems.length - 1, 0));
    let currentX = x + ((width - totalLegendWidth) / 2);

    legendItems.forEach((item, index) => {
      context.fillStyle = toCssRgb(item.color);
      context.fillRect(currentX, y - 8, 18, 18);
      context.fillStyle = "#111827";
      context.fillText(item.label, currentX + 32, y + 1);
      currentX += itemWidths[index] + gap;
    });
  };

  const drawDonut = (
    centerX: number,
    centerY: number,
    outerRadius: number,
    innerRadius: number,
    slices: PdfDistributionSlice[]
  ) => {
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    let startAngle = (-Math.PI / 2);
    const gap = 0.045;

    slices.forEach((slice) => {
      if (total <= 0) {
        return;
      }

      const sweep = (slice.value / total) * Math.PI * 2;
      const anglePadding = sweep > gap ? gap / 2 : 0;
      const sliceStart = startAngle + anglePadding;
      const sliceEnd = startAngle + sweep - anglePadding;

      context.beginPath();
      context.arc(centerX, centerY, outerRadius, sliceStart, sliceEnd);
      context.arc(centerX, centerY, innerRadius, sliceEnd, sliceStart, true);
      context.closePath();
      context.fillStyle = toCssRgb(slice.color);
      context.fill();

      if (slice.percentage >= 6) {
        const midAngle = startAngle + (sweep / 2);
        const labelRadius = (innerRadius + outerRadius) / 2;
        const labelX = centerX + Math.cos(midAngle) * labelRadius;
        const labelY = centerY + Math.sin(midAngle) * labelRadius;
        context.fillStyle = "#FFFFFF";
        context.shadowColor = "rgba(15, 23, 42, 0.30)";
        context.shadowBlur = 6;
        context.font = "bold 28px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(`${Math.round(slice.percentage)}%`, labelX, labelY);
        context.shadowBlur = 0;
      }

      startAngle += sweep;
    });
  };

  const drawPanel = (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    slices: PdfDistributionSlice[]
  ) => {
    context.fillStyle = "#FFFFFF";
    context.strokeStyle = "#E2E8F0";
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, width, height, 20);
    context.fill();
    context.stroke();

    context.fillStyle = PDF_TITLE_BLUE_HEX;
    context.font = "bold 34px Arial";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText(title, x + 28, y + 48);

    context.fillStyle = "#64748B";
    context.font = "24px Arial";
    context.fillText(subtitle, x + 28, y + 82);

    if (slices.length === 0) {
      context.fillStyle = "#94A3B8";
      context.font = "bold 28px Arial";
      context.textAlign = "center";
      context.fillText("Aucune donnée", x + (width / 2), y + (height / 2));
      return;
    }

    drawDonut(x + (width / 2), y + 226, 114, 48, slices);
    drawLegendInPanel(x, y + height - 44, width);
  };

  panels.forEach((panel, index) => {
    const x = startX + (index * (panelWidth + panelGap));
    drawPanel(x, 20, panelWidth, panelHeight, panel.title, panel.subtitle, panel.slices);
  });

  return canvas.toDataURL("image/png");
}

function addPdfDistributionDonutPage(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  if (addPdfDistributionDonutPageVector(doc, reportData)) {
    return;
  }

  const imageData = createDistributionDonutImage(reportData);
  if (imageData) {
    addPdfSectionTitle(doc, "Répartition globale des moyennes");
    doc.addImage(imageData, "PNG", 14, 24, 269, 130);
    return;
  }

  addPdfGroupedBarChart(
    doc,
    "Répartition globale des moyennes",
    ["≥ 15", "10 à 14,99", "8 à 9,99", "< 8"],
    [
      {
        label: "BB1",
        color: [59, 130, 246],
        values: [
          reportData.stats.overallDistributionBb1.gte15,
          reportData.stats.overallDistributionBb1.gte10lt15,
          reportData.stats.overallDistributionBb1.gte8lt10,
          reportData.stats.overallDistributionBb1.lt8,
        ],
      },
      {
        label: "BB2",
        color: [16, 185, 129],
        values: [
          reportData.stats.overallDistributionBb2.gte15,
          reportData.stats.overallDistributionBb2.gte10lt15,
          reportData.stats.overallDistributionBb2.gte8lt10,
          reportData.stats.overallDistributionBb2.lt8,
        ],
      },
    ],
    {
      subtitle: "Nombre d'élèves par tranche de moyennes",
      yAxisLabel: "Élèves",
      tickStep: 5,
      decimals: 0,
    }
  );
}

function createSubjectDistributionPageImages(reportData: BrevetBlancPanoramaReportData): string[] | null {
  if (typeof document === "undefined") {
    return null;
  }

  const subjects = reportData.config.subjects;
  if (subjects.length === 0) {
    return null;
  }

  const subjectsPerPage = 4;
  const pageImages: string[] = [];
  const legendItems: Array<{label: string; color: [number, number, number]}> = [
    {label: "≥ 15", color: [22, 163, 74]},
    {label: "10-14.9", color: [134, 239, 172]},
    {label: "8-9.9", color: [245, 158, 11]},
    {label: "< 8", color: [239, 68, 68]},
  ];

  for (let pageIndex = 0; pageIndex < Math.ceil(subjects.length / subjectsPerPage); pageIndex++) {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 980;

    const context = canvas.getContext("2d");
    if (!context) {
      return pageImages.length > 0 ? pageImages : null;
    }

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = PDF_TITLE_BLUE_HEX;
    context.font = "bold 38px Arial";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    const totalPages = Math.ceil(subjects.length / subjectsPerPage);
    const title =
      totalPages > 1 ?
        `Analyse des notes par matière (/20) - ${pageIndex + 1}/${totalPages}` :
        "Analyse des notes par matière (/20)";
    context.fillText(title, 34, 52);
    drawCanvasLegendItems(context, legendItems, 34, 82, canvas.width - 68, "24px Arial");

    const currentSubjects = subjects.slice(pageIndex * subjectsPerPage, (pageIndex + 1) * subjectsPerPage);
    const columns = 2;
    const horizontalGap = 26;
    const verticalGap = 22;
    const marginX = 34;
    const startY = 112;
    const cardWidth = (canvas.width - (marginX * 2) - horizontalGap) / columns;
    const rowCount = Math.max(1, Math.ceil(currentSubjects.length / columns));
    const bottomMargin = 34;
    const cardHeight = (canvas.height - startY - bottomMargin - (verticalGap * Math.max(0, rowCount - 1))) / rowCount;

    currentSubjects.forEach((subject, subjectIndex) => {
      const column = subjectIndex % columns;
      const row = Math.floor(subjectIndex / columns);
      const x = marginX + (column * (cardWidth + horizontalGap));
      const y = startY + (row * (cardHeight + verticalGap));
      const subjectLabel = subject;
      const bb1Distribution = reportData.stats.distributionBySubjectBb1[subject];
      const bb2Distribution = reportData.stats.distributionBySubjectBb2[subject];
      const bb1Slices = bb1Distribution ? buildDistributionSlices(bb1Distribution) : [];
      const bb2Slices = bb2Distribution ? buildDistributionSlices(bb2Distribution) : [];

      context.fillStyle = "#FFFFFF";
      context.strokeStyle = "#E2E8F0";
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(x, y, cardWidth, cardHeight, 16);
      context.fill();
      context.stroke();

      context.fillStyle = PDF_TITLE_BLUE_HEX;
      context.font = "bold 26px Arial";
      context.textAlign = "left";
      context.fillText(subjectLabel, x + 22, y + 36);

      const leftCenterX = x + (cardWidth * 0.28);
      const rightCenterX = x + (cardWidth * 0.72);
      const donutCenterY = y + 236;

      context.fillStyle = PDF_TITLE_BLUE_HEX;
      context.font = "bold 19px Arial";
      context.textAlign = "center";
      context.fillText("Brevet blanc 1", leftCenterX, y + 86);
      context.fillStyle = "#64748B";
      context.font = "16px Arial";
      context.fillText(`${bb1Distribution?.count ?? 0} notes`, leftCenterX, y + 112);

      if (bb1Slices.length > 0) {
        drawCanvasDonut(context, {
          centerX: leftCenterX,
          centerY: donutCenterY,
          outerRadius: 84,
          innerRadius: 38,
          slices: bb1Slices,
          gap: 0.05,
          insideLabelThreshold: 7,
          insideLabelFont: "bold 22px Arial",
          outsideLabelFont: "bold 16px Arial",
        });
      } else {
        context.fillStyle = "#94A3B8";
        context.font = "18px Arial";
        context.fillText("Pas de données BB1", leftCenterX, donutCenterY + 6);
      }

      context.fillStyle = PDF_TITLE_BLUE_HEX;
      context.font = "bold 19px Arial";
      context.fillText("Brevet blanc 2", rightCenterX, y + 86);
      context.fillStyle = "#64748B";
      context.font = "16px Arial";
      context.fillText(`${bb2Distribution?.count ?? 0} notes`, rightCenterX, y + 112);

      if (bb2Slices.length > 0) {
        drawCanvasDonut(context, {
          centerX: rightCenterX,
          centerY: donutCenterY,
          outerRadius: 84,
          innerRadius: 38,
          slices: bb2Slices,
          gap: 0.05,
          insideLabelThreshold: 7,
          insideLabelFont: "bold 22px Arial",
          outsideLabelFont: "bold 16px Arial",
        });
      } else {
        context.fillStyle = "#94A3B8";
        context.font = "20px Arial";
        context.fillText("Pas de données BB2", rightCenterX, donutCenterY + 6);
      }
    });

    pageImages.push(canvas.toDataURL("image/png"));
  }

  return pageImages;
}

function addPdfSubjectDistributionPages(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const vectorPageCount = addPdfSubjectDistributionPagesVector(doc, reportData);
  if (vectorPageCount > 0) {
    return vectorPageCount;
  }

  const images = createSubjectDistributionPageImages(reportData);
  if (!images || images.length === 0) {
    return 0;
  }

  images.forEach((imageData) => {
    doc.addPage();
    doc.addImage(imageData, "PNG", 8, 8, 281, 196);
  });

  return images.length;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(0).replace(".", ",")}%`;
}

function computeSuccessShare(distribution: ScoreDistribution): number | undefined {
  return distribution.count > 0 ?
    ((distribution.gte10lt15 + distribution.gte15) / distribution.count) * 100 :
    undefined;
}

function buildOverallBb1ReminderLine(reportData: BrevetBlancPanoramaReportData): string {
  return [
    "Ensemble :",
    `Moyenne BB1 ${formatNumber(reportData.stats.averageBb1)}`,
    `Taux de Réussite BB1 ${formatPercent(computeSuccessShare(reportData.stats.overallDistributionBb1))}`,
  ].join("  |  ");
}

function buildGlobalDistributionReminderLines(reportData: BrevetBlancPanoramaReportData): string[] {
  const buildLine = (label: string, distribution: ScoreDistribution): string => {
    if (distribution.count <= 0) {
      return `${label} global : aucune donnée exploitable`;
    }

    const toShare = (value: number) => formatPercent((value / distribution.count) * 100);

    return [
      `${label} global :`,
      `≥ 15 ${toShare(distribution.gte15)}`,
      `10-14,9 ${toShare(distribution.gte10lt15)}`,
      `8-9,9 ${toShare(distribution.gte8lt10)}`,
      `<8 ${toShare(distribution.lt8)}`,
    ].join("  |  ");
  };

  const lines = [buildLine("BB1", reportData.stats.overallDistributionBb1)];

  if (reportData.stats.overallDistributionBb2.count > 0) {
    lines.push(buildLine("BB2", reportData.stats.overallDistributionBb2));
  }

  return lines;
}

function getActiveBrevetKey(reportData: BrevetBlancPanoramaReportData): HeatmapBrevetKey {
  return reportData.stats.participationBb2 > 0 ? "bb2" : "bb1";
}

function getActiveBrevetLabel(reportData: BrevetBlancPanoramaReportData): string {
  return getActiveBrevetKey(reportData).toUpperCase();
}

function getActiveAverage(
  reportData: BrevetBlancPanoramaReportData,
  row: {averageBb1?: number; averageBb2?: number}
): number | undefined {
  return getActiveBrevetKey(reportData) === "bb2" ? row.averageBb2 : row.averageBb1;
}

function getActiveDistribution(
  reportData: BrevetBlancPanoramaReportData,
  bb1: ScoreDistribution,
  bb2: ScoreDistribution
): ScoreDistribution {
  return getActiveBrevetKey(reportData) === "bb2" ? bb2 : bb1;
}

function buildClassInsightRows(reportData: BrevetBlancPanoramaReportData) {
  const brevetKey = getActiveBrevetKey(reportData);

  return reportData.classDetails
    .map((classDetail) => {
      const subjectAverages = reportData.config.subjects
        .map((subject) => {
          const scores = classDetail.students
            .map((student) => student.subjectScores[subject]?.[brevetKey])
            .filter((value): value is number => value !== undefined && !Number.isNaN(value));
          const average = scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined;
          return {
            subject,
            average,
            label: reportData.config.abbreviations[subject] || subject,
          };
        })
        .filter((subject) => subject.average !== undefined)
        .sort((left, right) => (right.average ?? 0) - (left.average ?? 0));

      const bestSubject = subjectAverages[0];
      const weakestSubject = subjectAverages[subjectAverages.length - 1];
      const average = getActiveAverage(reportData, classDetail.summary);

      return {
        className: classDetail.className,
        totalStudents: classDetail.summary.totalStudents,
        participation: brevetKey === "bb2" ? classDetail.summary.participationBb2 : classDetail.summary.participationBb1,
        average,
        gapToTarget: average !== undefined ? average - 10 : undefined,
        bestSubject: bestSubject ? `${bestSubject.label} (${formatNumber(bestSubject.average, 1)})` : "N/A",
        weakestSubject: weakestSubject ? `${weakestSubject.label} (${formatNumber(weakestSubject.average, 1)})` : "N/A",
        progression: classDetail.summary.progression,
      };
    })
    .sort((left, right) => (right.average ?? -Infinity) - (left.average ?? -Infinity))
    .map((row, index) => ({...row, rank: index + 1}));
}

function buildSubjectInsightRows(reportData: BrevetBlancPanoramaReportData) {
  return reportData.subjectRows.map((subjectRow) => {
    const distribution = getActiveDistribution(
      reportData,
      reportData.stats.distributionBySubjectBb1[subjectRow.subject],
      reportData.stats.distributionBySubjectBb2[subjectRow.subject]
    );
    const total = distribution.count || 0;
    const average = getActiveAverage(reportData, subjectRow);
    return {
      subject: subjectRow.subject,
      average,
      participation: getActiveBrevetKey(reportData) === "bb2" ? subjectRow.participationBb2 : subjectRow.participationBb1,
      shareLt8: total > 0 ? (distribution.lt8 / total) * 100 : undefined,
      shareGte15: total > 0 ? (distribution.gte15 / total) * 100 : undefined,
      gapToTarget: average !== undefined ? average - 10 : undefined,
      progression: subjectRow.progression,
    };
  });
}

function buildGenderComparisonLeadingRows(reportData: BrevetBlancPanoramaReportData) {
  const genderBreakdown = reportData.stats.genderBreakdown;
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const rows: Array<Array<string | number | undefined>> = [
    ["Filles / Garçons"],
    ["Sexe renseigné", `${genderBreakdown.specifiedCount} / ${reportData.stats.totalStudents}`],
    ["Données manquantes", genderBreakdown.unspecifiedCount],
    ["Métrique globale", "Filles", "Garçons", "Écart F-G"],
    ["Effectif renseigné", genderBreakdown.filles.totalStudents, genderBreakdown.garcons.totalStudents, ""],
    [
      "Moyenne générale BB1",
      formatNumber(genderBreakdown.filles.averageBb1),
      formatNumber(genderBreakdown.garcons.averageBb1),
      formatSignedNumber(genderBreakdown.overallGaps.averageBb1),
    ],
    [
      "Taux de réussite BB1",
      formatPercent(genderBreakdown.filles.successRateBb1),
      formatPercent(genderBreakdown.garcons.successRateBb1),
      formatSignedPercent(genderBreakdown.overallGaps.successRateBb1, 0),
    ],
  ];

  if (hasBb2Data) {
    rows.push(
      [
        "Moyenne générale BB2",
        formatNumber(genderBreakdown.filles.averageBb2),
        formatNumber(genderBreakdown.garcons.averageBb2),
        formatSignedNumber(genderBreakdown.overallGaps.averageBb2),
      ],
      [
        "Taux de réussite BB2",
        formatPercent(genderBreakdown.filles.successRateBb2),
        formatPercent(genderBreakdown.garcons.successRateBb2),
        formatSignedPercent(genderBreakdown.overallGaps.successRateBb2, 0),
      ],
      [
        "Écart de progression",
        formatNumber(genderBreakdown.filles.progression),
        formatNumber(genderBreakdown.garcons.progression),
        formatSignedNumber(genderBreakdown.overallGaps.progression),
      ],
    );
  }

  rows.push([]);
  return rows;
}

function buildScholarshipComparisonLeadingRows(reportData: BrevetBlancPanoramaReportData) {
  const scholarshipBreakdown = reportData.stats.scholarshipBreakdown;
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const rows: Array<Array<string | number | undefined>> = [
    ["Boursiers / Non-boursiers"],
    ["Population comparée", `${scholarshipBreakdown.specifiedCount} / ${reportData.stats.totalStudents}`],
    ["Métrique globale", "Boursiers", "Non-boursiers", "Écart B-NB"],
    ["Effectif", scholarshipBreakdown.boursiers.totalStudents, scholarshipBreakdown.nonBoursiers.totalStudents, ""],
    [
      "Moyenne générale BB1",
      formatNumber(scholarshipBreakdown.boursiers.averageBb1),
      formatNumber(scholarshipBreakdown.nonBoursiers.averageBb1),
      formatSignedNumber(scholarshipBreakdown.overallGaps.averageBb1),
    ],
    [
      "Taux de réussite BB1",
      formatPercent(scholarshipBreakdown.boursiers.successRateBb1),
      formatPercent(scholarshipBreakdown.nonBoursiers.successRateBb1),
      formatSignedPercent(scholarshipBreakdown.overallGaps.successRateBb1, 0),
    ],
  ];

  if (hasBb2Data) {
    rows.push(
      [
        "Moyenne générale BB2",
        formatNumber(scholarshipBreakdown.boursiers.averageBb2),
        formatNumber(scholarshipBreakdown.nonBoursiers.averageBb2),
        formatSignedNumber(scholarshipBreakdown.overallGaps.averageBb2),
      ],
      [
        "Taux de réussite BB2",
        formatPercent(scholarshipBreakdown.boursiers.successRateBb2),
        formatPercent(scholarshipBreakdown.nonBoursiers.successRateBb2),
        formatSignedPercent(scholarshipBreakdown.overallGaps.successRateBb2, 0),
      ],
      [
        "Écart de progression",
        formatNumber(scholarshipBreakdown.boursiers.progression),
        formatNumber(scholarshipBreakdown.nonBoursiers.progression),
        formatSignedNumber(scholarshipBreakdown.overallGaps.progression),
      ],
    );
  }

  rows.push([]);
  return rows;
}

function addPdfGenderComparisonPage(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const genderBreakdown = reportData.stats.genderBreakdown;
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const overallBb1ReminderLine = buildOverallBb1ReminderLine(reportData);
  const reminderLines = buildGlobalDistributionReminderLines(reportData);

  addPdfSectionTitle(
    doc,
    "Filles / Garçons",
    `Sexe renseigné pour ${genderBreakdown.specifiedCount} élève(s) sur ${reportData.stats.totalStudents}. ` +
      `${genderBreakdown.unspecifiedCount} élève(s) sans donnée de sexe ne sont pas inclus dans ce bloc.`,
  );

  doc.setFontSize(8.5);
  drawPdfText(doc, overallBb1ReminderLine, 14, 27.5, {
    style: "normal",
    color: [71, 85, 105],
  });

  const drawSummaryCard = (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    metrics: Array<{label: string; value: string; color?: [number, number, number]}>,
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, width, height, 3, 3, "FD");

    doc.setTextColor(15, 23, 42);
    setPdfFont(doc, "bold");
    doc.setFontSize(12);
    doc.text(title, x + 6, y + 8);

    doc.setTextColor(100, 116, 139);
    setPdfFont(doc, "normal");
    doc.setFontSize(8.5);
    doc.text(subtitle, x + 6, y + 14);

    metrics.forEach((metric, metricIndex) => {
      const column = metricIndex % 3;
      const row = Math.floor(metricIndex / 3);
      const metricX = x + 6 + (column * ((width - 12) / 3));
      const metricY = y + 23 + (row * 13);

      doc.setTextColor(100, 116, 139);
      setPdfFont(doc, "normal");
      doc.setFontSize(8);
      doc.text(metric.label, metricX, metricY);

      doc.setTextColor(...(metric.color ?? [15, 23, 42]));
      setPdfFont(doc, "bold");
      doc.setFontSize(11);
      doc.text(metric.value, metricX, metricY + 5.5);
    });
  };

  const drawGapBox = (
    x: number,
    y: number,
    width: number,
    height: number,
    metrics: Array<{label: string; value: string; color?: [number, number, number]}>,
  ) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, width, height, 3, 3, "FD");

    doc.setTextColor(...PDF_TITLE_BLUE);
    setPdfFont(doc, "bold");
    doc.setFontSize(10);
    doc.text("Écarts globaux filles - garçons", x + 6, y + 8);

    doc.setTextColor(100, 116, 139);
    setPdfFont(doc, "normal");
    doc.setFontSize(8);
    doc.text("Valeur positive = avantage filles", x + width - 6, y + 8, {align: "right"});

    metrics.forEach((metric, metricIndex) => {
      const cellWidth = (width - 12) / metrics.length;
      const metricX = x + 6 + (metricIndex * cellWidth);

      doc.setTextColor(100, 116, 139);
      setPdfFont(doc, "normal");
      doc.setFontSize(7.5);
      doc.text(metric.label, metricX, y + 15);

      doc.setTextColor(...(metric.color ?? [15, 23, 42]));
      setPdfFont(doc, "bold");
      doc.setFontSize(10);
      doc.text(metric.value, metricX, y + 20.5);
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(x + 6, y + 24.5, x + width - 6, y + 24.5);

    doc.setFontSize(7);
    reminderLines.forEach((line, index) => {
      drawPdfText(doc, line, x + 6, y + 29 + (index * 4.5), {
        style: "normal",
        color: [71, 85, 105],
      });
    });
  };

  const getGapColor = (value: number | undefined): [number, number, number] => {
    if (value === undefined) {
      return [71, 85, 105];
    }
    if (value > 0) {
      return [22, 101, 52];
    }
    if (value < 0) {
      return [185, 28, 28];
    }
    return [71, 85, 105];
  };

  const summaryCardY = 30;
  const summaryCardHeight = hasBb2Data ? 56 : 42;

  const fillesMetrics: Array<{label: string; value: string; color?: [number, number, number]}> = [
    {label: "Moyenne BB1", value: formatNumber(genderBreakdown.filles.averageBb1)},
    {label: "Participation BB1", value: String(genderBreakdown.filles.participationBb1)},
    {label: "Réussite BB1", value: formatPercent(genderBreakdown.filles.successRateBb1)},
  ];
  const garconsMetrics: Array<{label: string; value: string; color?: [number, number, number]}> = [
    {label: "Moyenne BB1", value: formatNumber(genderBreakdown.garcons.averageBb1)},
    {label: "Participation BB1", value: String(genderBreakdown.garcons.participationBb1)},
    {label: "Réussite BB1", value: formatPercent(genderBreakdown.garcons.successRateBb1)},
  ];

  if (hasBb2Data) {
    fillesMetrics.push(
      {label: "Moyenne BB2", value: formatNumber(genderBreakdown.filles.averageBb2)},
      {label: "Participation BB2", value: String(genderBreakdown.filles.participationBb2)},
      {label: "Réussite BB2", value: formatPercent(genderBreakdown.filles.successRateBb2)},
      {label: "Progression", value: formatNumber(genderBreakdown.filles.progression), color: [22, 163, 74]},
    );
    garconsMetrics.push(
      {label: "Moyenne BB2", value: formatNumber(genderBreakdown.garcons.averageBb2)},
      {label: "Participation BB2", value: String(genderBreakdown.garcons.participationBb2)},
      {label: "Réussite BB2", value: formatPercent(genderBreakdown.garcons.successRateBb2)},
      {label: "Progression", value: formatNumber(genderBreakdown.garcons.progression), color: [22, 163, 74]},
    );
  }

  drawSummaryCard(14, summaryCardY, 131.5, summaryCardHeight, "Filles", `${genderBreakdown.filles.totalStudents} élève(s)`, fillesMetrics);
  drawSummaryCard(151.5, summaryCardY, 131.5, summaryCardHeight, "Garçons", `${genderBreakdown.garcons.totalStudents} élève(s)`, garconsMetrics);

  const gapMetrics: Array<{label: string; value: string; color?: [number, number, number]}> = [
    {
      label: "Écart moy. BB1",
      value: formatSignedNumber(genderBreakdown.overallGaps.averageBb1),
      color: getGapColor(genderBreakdown.overallGaps.averageBb1),
    },
    {
      label: "Écart réussite BB1",
      value: formatSignedPercent(genderBreakdown.overallGaps.successRateBb1, 0),
      color: getGapColor(genderBreakdown.overallGaps.successRateBb1),
    },
  ];

  if (hasBb2Data) {
    gapMetrics.push(
      {
        label: "Écart moy. BB2",
        value: formatSignedNumber(genderBreakdown.overallGaps.averageBb2),
        color: getGapColor(genderBreakdown.overallGaps.averageBb2),
      },
      {
        label: "Écart réussite BB2",
        value: formatSignedPercent(genderBreakdown.overallGaps.successRateBb2, 0),
        color: getGapColor(genderBreakdown.overallGaps.successRateBb2),
      },
      {
        label: "Écart progression",
        value: formatSignedNumber(genderBreakdown.overallGaps.progression),
        color: getGapColor(genderBreakdown.overallGaps.progression),
      },
    );
  }

  const gapBoxY = summaryCardY + summaryCardHeight + 4;
  const gapBoxHeight = 30 + ((Math.max(reminderLines.length, 1) - 1) * 4.5);
  drawGapBox(14, gapBoxY, 269, gapBoxHeight, gapMetrics);

  const head = [[
    "Matière",
    "Moy. Filles BB1",
    "Moy. Garçons BB1",
    "Écart Filles-Garçons BB1",
  ]];
  if (hasBb2Data) {
    head[0].push(
      "Moy. Filles BB2",
      "Moy. Garçons BB2",
      "Écart Filles-Garçons BB2",
    );
  }

  autoTable(doc, {
    startY: gapBoxY + gapBoxHeight + 6,
    head,
    body: genderBreakdown.subjectRows.map((row) => {
      const values = [
        row.subject,
        formatNumber(row.fillesAverageBb1),
        formatNumber(row.garconsAverageBb1),
        formatSignedNumber(row.gapBb1),
      ];
      if (hasBb2Data) {
        values.push(
          formatNumber(row.fillesAverageBb2),
          formatNumber(row.garconsAverageBb2),
          formatSignedNumber(row.gapBb2),
        );
      }
      return values;
    }),
    styles: {
      font: getPdfFontFamily(doc),
      fontSize: 8,
      cellPadding: 1.6,
      valign: "middle",
      halign: "center",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      font: getPdfFontFamily(doc),
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: hasBb2Data ? {
      0: {cellWidth: 67, halign: "left"},
      1: {cellWidth: 31},
      2: {cellWidth: 31},
      3: {cellWidth: 34},
      4: {cellWidth: 31},
      5: {cellWidth: 31},
      6: {cellWidth: 34},
    } : {
      0: {cellWidth: 97, halign: "left"},
      1: {cellWidth: 44},
      2: {cellWidth: 44},
      3: {cellWidth: 56},
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body") {
        return;
      }

      const row = genderBreakdown.subjectRows[hookData.row.index];
      if (!row) {
        return;
      }

      const fillAverageStyle = (value: number | undefined) => {
        if (value === undefined) {
          return;
        }
        if (value >= 15) {
          hookData.cell.styles.fillColor = [22, 163, 74];
          hookData.cell.styles.textColor = [255, 255, 255];
        } else if (value >= 10) {
          hookData.cell.styles.fillColor = [134, 239, 172];
          hookData.cell.styles.textColor = [20, 83, 45];
        } else if (value >= 8) {
          hookData.cell.styles.fillColor = [253, 230, 138];
          hookData.cell.styles.textColor = [146, 64, 14];
        } else {
          hookData.cell.styles.fillColor = [248, 113, 113];
          hookData.cell.styles.textColor = [127, 29, 29];
        }
      };

      const fillGapStyle = (value: number | undefined) => {
        if (value === undefined) {
          hookData.cell.styles.textColor = [71, 85, 105];
          return;
        }
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = getGapColor(value);
      };

      if (hookData.column.index === 1) {
        fillAverageStyle(row.fillesAverageBb1);
      } else if (hookData.column.index === 2) {
        fillAverageStyle(row.garconsAverageBb1);
      } else if (hookData.column.index === 3) {
        fillGapStyle(row.gapBb1);
      } else if (hasBb2Data && hookData.column.index === 4) {
        fillAverageStyle(row.fillesAverageBb2);
      } else if (hasBb2Data && hookData.column.index === 5) {
        fillAverageStyle(row.garconsAverageBb2);
      } else if (hasBb2Data && hookData.column.index === 6) {
        fillGapStyle(row.gapBb2);
      }
    },
  });
}

function addPdfScholarshipComparisonPage(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const scholarshipBreakdown = reportData.stats.scholarshipBreakdown;
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const overallBb1ReminderLine = buildOverallBb1ReminderLine(reportData);
  const reminderLines = buildGlobalDistributionReminderLines(reportData);

  addPdfSectionTitle(
    doc,
    "Boursiers / Non-boursiers",
    `Comparaison sur ${scholarshipBreakdown.specifiedCount} élève(s) de l'année ${reportData.year}.`,
  );

  doc.setFontSize(8.5);
  drawPdfText(doc, overallBb1ReminderLine, 14, 27.5, {
    style: "normal",
    color: [71, 85, 105],
  });

  const drawSummaryCard = (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    metrics: Array<{label: string; value: string; color?: [number, number, number]}>,
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, width, height, 3, 3, "FD");

    doc.setTextColor(15, 23, 42);
    setPdfFont(doc, "bold");
    doc.setFontSize(12);
    doc.text(title, x + 6, y + 8);

    doc.setTextColor(100, 116, 139);
    setPdfFont(doc, "normal");
    doc.setFontSize(8.5);
    doc.text(subtitle, x + 6, y + 14);

    metrics.forEach((metric, metricIndex) => {
      const column = metricIndex % 3;
      const row = Math.floor(metricIndex / 3);
      const metricX = x + 6 + (column * ((width - 12) / 3));
      const metricY = y + 23 + (row * 13);

      doc.setTextColor(100, 116, 139);
      setPdfFont(doc, "normal");
      doc.setFontSize(8);
      doc.text(metric.label, metricX, metricY);

      doc.setTextColor(...(metric.color ?? [15, 23, 42]));
      setPdfFont(doc, "bold");
      doc.setFontSize(11);
      doc.text(metric.value, metricX, metricY + 5.5);
    });
  };

  const drawGapBox = (
    x: number,
    y: number,
    width: number,
    height: number,
    metrics: Array<{label: string; value: string; color?: [number, number, number]}>,
  ) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, width, height, 3, 3, "FD");

    doc.setTextColor(...PDF_TITLE_BLUE);
    setPdfFont(doc, "bold");
    doc.setFontSize(10);
    doc.text("Écarts globaux boursiers - non-boursiers", x + 6, y + 8);

    doc.setTextColor(100, 116, 139);
    setPdfFont(doc, "normal");
    doc.setFontSize(8);
    doc.text("Valeur positive = avantage boursiers", x + width - 6, y + 8, {align: "right"});

    metrics.forEach((metric, metricIndex) => {
      const cellWidth = (width - 12) / metrics.length;
      const metricX = x + 6 + (metricIndex * cellWidth);

      doc.setTextColor(100, 116, 139);
      setPdfFont(doc, "normal");
      doc.setFontSize(7.5);
      doc.text(metric.label, metricX, y + 15);

      doc.setTextColor(...(metric.color ?? [15, 23, 42]));
      setPdfFont(doc, "bold");
      doc.setFontSize(10);
      doc.text(metric.value, metricX, y + 20.5);
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(x + 6, y + 24.5, x + width - 6, y + 24.5);

    doc.setFontSize(7);
    reminderLines.forEach((line, index) => {
      drawPdfText(doc, line, x + 6, y + 29 + (index * 4.5), {
        style: "normal",
        color: [71, 85, 105],
      });
    });
  };

  const getGapColor = (value: number | undefined): [number, number, number] => {
    if (value === undefined) {
      return [71, 85, 105];
    }
    if (value > 0) {
      return [22, 101, 52];
    }
    if (value < 0) {
      return [185, 28, 28];
    }
    return [71, 85, 105];
  };

  const summaryCardY = 30;
  const summaryCardHeight = hasBb2Data ? 56 : 42;
  const boursiersMetrics: Array<{label: string; value: string; color?: [number, number, number]}> = [
    {label: "Moyenne BB1", value: formatNumber(scholarshipBreakdown.boursiers.averageBb1)},
    {label: "Participation BB1", value: String(scholarshipBreakdown.boursiers.participationBb1)},
    {label: "Réussite BB1", value: formatPercent(scholarshipBreakdown.boursiers.successRateBb1)},
  ];
  const nonBoursiersMetrics: Array<{label: string; value: string; color?: [number, number, number]}> = [
    {label: "Moyenne BB1", value: formatNumber(scholarshipBreakdown.nonBoursiers.averageBb1)},
    {label: "Participation BB1", value: String(scholarshipBreakdown.nonBoursiers.participationBb1)},
    {label: "Réussite BB1", value: formatPercent(scholarshipBreakdown.nonBoursiers.successRateBb1)},
  ];

  if (hasBb2Data) {
    boursiersMetrics.push(
      {label: "Moyenne BB2", value: formatNumber(scholarshipBreakdown.boursiers.averageBb2)},
      {label: "Participation BB2", value: String(scholarshipBreakdown.boursiers.participationBb2)},
      {label: "Réussite BB2", value: formatPercent(scholarshipBreakdown.boursiers.successRateBb2)},
      {label: "Progression", value: formatNumber(scholarshipBreakdown.boursiers.progression), color: [22, 163, 74]},
    );
    nonBoursiersMetrics.push(
      {label: "Moyenne BB2", value: formatNumber(scholarshipBreakdown.nonBoursiers.averageBb2)},
      {label: "Participation BB2", value: String(scholarshipBreakdown.nonBoursiers.participationBb2)},
      {label: "Réussite BB2", value: formatPercent(scholarshipBreakdown.nonBoursiers.successRateBb2)},
      {label: "Progression", value: formatNumber(scholarshipBreakdown.nonBoursiers.progression), color: [22, 163, 74]},
    );
  }

  drawSummaryCard(14, summaryCardY, 131.5, summaryCardHeight, "Boursiers", `${scholarshipBreakdown.boursiers.totalStudents} élève(s)`, boursiersMetrics);
  drawSummaryCard(151.5, summaryCardY, 131.5, summaryCardHeight, "Non-boursiers", `${scholarshipBreakdown.nonBoursiers.totalStudents} élève(s)`, nonBoursiersMetrics);

  const gapMetrics: Array<{label: string; value: string; color?: [number, number, number]}> = [
    {
      label: "Écart moy. BB1",
      value: formatSignedNumber(scholarshipBreakdown.overallGaps.averageBb1),
      color: getGapColor(scholarshipBreakdown.overallGaps.averageBb1),
    },
    {
      label: "Écart réussite BB1",
      value: formatSignedPercent(scholarshipBreakdown.overallGaps.successRateBb1, 0),
      color: getGapColor(scholarshipBreakdown.overallGaps.successRateBb1),
    },
  ];

  if (hasBb2Data) {
    gapMetrics.push(
      {
        label: "Écart moy. BB2",
        value: formatSignedNumber(scholarshipBreakdown.overallGaps.averageBb2),
        color: getGapColor(scholarshipBreakdown.overallGaps.averageBb2),
      },
      {
        label: "Écart réussite BB2",
        value: formatSignedPercent(scholarshipBreakdown.overallGaps.successRateBb2, 0),
        color: getGapColor(scholarshipBreakdown.overallGaps.successRateBb2),
      },
      {
        label: "Écart progression",
        value: formatSignedNumber(scholarshipBreakdown.overallGaps.progression),
        color: getGapColor(scholarshipBreakdown.overallGaps.progression),
      },
    );
  }

  const gapBoxY = summaryCardY + summaryCardHeight + 4;
  const gapBoxHeight = 30 + ((Math.max(reminderLines.length, 1) - 1) * 4.5);
  drawGapBox(14, gapBoxY, 269, gapBoxHeight, gapMetrics);

  const head = [[
    "Matière",
    "Moy. Boursiers BB1",
    "Moy. Non-boursiers BB1",
    "Écart Boursiers-Non-boursiers BB1",
  ]];
  if (hasBb2Data) {
    head[0].push(
      "Moy. Boursiers BB2",
      "Moy. Non-boursiers BB2",
      "Écart Boursiers-Non-boursiers BB2",
    );
  }

  autoTable(doc, {
    startY: gapBoxY + gapBoxHeight + 6,
    head,
    body: scholarshipBreakdown.subjectRows.map((row) => {
      const values = [
        row.subject,
        formatNumber(row.boursiersAverageBb1),
        formatNumber(row.nonBoursiersAverageBb1),
        formatSignedNumber(row.gapBb1),
      ];
      if (hasBb2Data) {
        values.push(
          formatNumber(row.boursiersAverageBb2),
          formatNumber(row.nonBoursiersAverageBb2),
          formatSignedNumber(row.gapBb2),
        );
      }
      return values;
    }),
    styles: {
      font: getPdfFontFamily(doc),
      fontSize: 8,
      cellPadding: 1.6,
      valign: "middle",
      halign: "center",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      font: getPdfFontFamily(doc),
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: hasBb2Data ? {
      0: {cellWidth: 67, halign: "left"},
      1: {cellWidth: 31},
      2: {cellWidth: 31},
      3: {cellWidth: 34},
      4: {cellWidth: 31},
      5: {cellWidth: 31},
      6: {cellWidth: 34},
    } : {
      0: {cellWidth: 97, halign: "left"},
      1: {cellWidth: 44},
      2: {cellWidth: 44},
      3: {cellWidth: 56},
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body") {
        return;
      }

      const row = scholarshipBreakdown.subjectRows[hookData.row.index];
      if (!row) {
        return;
      }

      const fillAverageStyle = (value: number | undefined) => {
        if (value === undefined) {
          return;
        }
        if (value >= 15) {
          hookData.cell.styles.fillColor = [22, 163, 74];
          hookData.cell.styles.textColor = [255, 255, 255];
        } else if (value >= 10) {
          hookData.cell.styles.fillColor = [134, 239, 172];
          hookData.cell.styles.textColor = [20, 83, 45];
        } else if (value >= 8) {
          hookData.cell.styles.fillColor = [253, 230, 138];
          hookData.cell.styles.textColor = [146, 64, 14];
        } else {
          hookData.cell.styles.fillColor = [248, 113, 113];
          hookData.cell.styles.textColor = [127, 29, 29];
        }
      };

      const fillGapStyle = (value: number | undefined) => {
        if (value === undefined) {
          hookData.cell.styles.textColor = [71, 85, 105];
          return;
        }
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = getGapColor(value);
      };

      if (hookData.column.index === 1) {
        fillAverageStyle(row.boursiersAverageBb1);
      } else if (hookData.column.index === 2) {
        fillAverageStyle(row.nonBoursiersAverageBb1);
      } else if (hookData.column.index === 3) {
        fillGapStyle(row.gapBb1);
      } else if (hasBb2Data && hookData.column.index === 4) {
        fillAverageStyle(row.boursiersAverageBb2);
      } else if (hasBb2Data && hookData.column.index === 5) {
        fillAverageStyle(row.nonBoursiersAverageBb2);
      } else if (hasBb2Data && hookData.column.index === 6) {
        fillGapStyle(row.gapBb2);
      }
    },
  });
}

function buildStudentWatchRows(reportData: BrevetBlancPanoramaReportData) {
  const brevetKey = getActiveBrevetKey(reportData);
  return reportData.classDetails
    .flatMap((classDetail) => classDetail.students.map((student) => ({
      className: classDetail.className,
      lastName: student.lastName,
      firstName: student.firstName,
      average: brevetKey === "bb2" ? student.averageBb2 : student.averageBb1,
      weakestSubject: reportData.config.subjects
        .map((subject) => ({
          label: reportData.config.abbreviations[subject] || subject,
          value: student.subjectScores[subject]?.[brevetKey],
        }))
        .filter((subject) => subject.value !== undefined)
        .sort((left, right) => (left.value ?? Infinity) - (right.value ?? Infinity))[0],
    })))
    .filter((student) => student.average !== undefined)
    .sort((left, right) => (left.average ?? Infinity) - (right.average ?? Infinity))
    .slice(0, 8)
    .map((student, index) => ({
      rank: index + 1,
      ...student,
    }));
}

function buildExecutiveSummary(reportData: BrevetBlancPanoramaReportData) {
  const classInsights = buildClassInsightRows(reportData);
  const subjectInsights = buildSubjectInsightRows(reportData);
  const globalDistribution = getActiveDistribution(
    reportData,
    reportData.stats.overallDistributionBb1,
    reportData.stats.overallDistributionBb2
  );
  const successShare = globalDistribution.count > 0 ?
    ((globalDistribution.gte10lt15 + globalDistribution.gte15) / globalDistribution.count) * 100 :
    undefined;
  const classesBelowTarget = classInsights.filter((row) => row.average !== undefined && row.average < 10);
  const weakestSubject = [...subjectInsights]
    .filter((row) => row.average !== undefined)
    .sort((left, right) => (left.average ?? Infinity) - (right.average ?? Infinity))[0];
  const bestClass = classInsights[0];
  const weakestClass = [...classInsights]
    .filter((row) => row.average !== undefined)
    .sort((left, right) => (left.average ?? Infinity) - (right.average ?? Infinity))[0];
  const studentWatch = buildStudentWatchRows(reportData);

  const takeaway = bestClass && weakestSubject ?
    `${classesBelowTarget.length} classe(s) sous 10/20. La priorité immédiate est ${weakestSubject.subject} tandis que ${bestClass.className} reste la classe de référence.` :
    "Le rapport met en avant les classes et matières prioritaires pour le pilotage pédagogique.";

  const alerts = [
    classesBelowTarget[0] ? `Classe à traiter en priorité : ${classesBelowTarget[0].className} (${formatNumber(classesBelowTarget[0].average, 2)})` : undefined,
    weakestSubject ? `Matière la plus fragile : ${weakestSubject.subject} (${formatNumber(weakestSubject.average, 2)})` : undefined,
    studentWatch[0] ? `Élève à suivre en premier : ${studentWatch[0].firstName} ${studentWatch[0].lastName} (${formatNumber(studentWatch[0].average, 2)})` : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    successShare,
    classesBelowTarget,
    weakestSubject,
    bestClass,
    weakestClass,
    studentWatch,
    takeaway,
    alerts,
  };
}

function addExecutiveSummaryPage(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const summary = buildExecutiveSummary(reportData);
  const activeLabel = getActiveBrevetLabel(reportData);
  const cardY = 27;
  const cardWidth = 61;
  const cardHeight = 26;
  const gap = 6;
  const cardX = [14, 14 + cardWidth + gap, 14 + ((cardWidth + gap) * 2), 14 + ((cardWidth + gap) * 3)];

  addPdfSectionTitle(doc, "Bilan complet du panorama du brevet blanc", `Année scolaire ${reportData.year}`);

  const drawKpiCard = (x: number, title: string, value: string, note: string, accent: [number, number, number]) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 3, 3, "FD");
    doc.setFillColor(...accent);
    doc.roundedRect(x, cardY, 3, cardHeight, 3, 3, "F");
    doc.setFontSize(8);
    drawPdfText(doc, title, x + 6, cardY + 8, {style: "normal", color: PDF_TITLE_BLUE});
    doc.setFontSize(15);
    drawPdfText(doc, value, x + 6, cardY + 17, {style: "bold", color: [15, 23, 42]});
    doc.setFontSize(7);
    drawPdfText(doc, note, x + 6, cardY + 22, {style: "normal", color: [100, 116, 139]});
  };

  drawKpiCard(cardX[0], `Moyenne ${activeLabel}`, formatNumber(getActiveAverage(reportData, reportData.stats), 2), "session de référence", [37, 99, 235]);
  drawKpiCard(cardX[1], "Élèves évalués", String(getActiveBrevetKey(reportData) === "bb2" ? reportData.stats.participationBb2 : reportData.stats.participationBb1), "au moins une note", [14, 165, 233]);
  drawKpiCard(cardX[2], "Classes sous 10", String(summary.classesBelowTarget.length), "seuil d'attention", [239, 68, 68]);
  drawKpiCard(cardX[3], "Part ≥ 10", formatPercent(summary.successShare), "répartition globale", [22, 163, 74]);
  drawKpiCard(cardX[3], "Taux de Réussite", formatPercent(summary.successShare), "moyennes ≥ 10/20", [22, 163, 74]);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 58, 269, 24, 3, 3, "FD");
  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(10);
  doc.text("À retenir", 18, 66);
  doc.setTextColor(15, 23, 42);
  setPdfFont(doc, "normal");
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(summary.takeaway, 257), 18, 74);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 88, 132, 54, 3, 3, "FD");
  doc.roundedRect(151, 88, 132, 54, 3, 3, "FD");

  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(10);
  doc.text("Alertes prioritaires", 18, 97);
  doc.text("Repère rapide", 155, 97);

  doc.setTextColor(15, 23, 42);
  setPdfFont(doc, "normal");
  doc.setFontSize(9);
  summary.alerts.forEach((alert, index) => {
    doc.text(`- ${alert}`, 18, 106 + (index * 9));
  });

  const quickFacts = [
    summary.bestClass ? `Classe de référence : ${summary.bestClass.className} (${formatNumber(summary.bestClass.average, 2)})` : "Classe de référence : N/A",
    summary.weakestClass ? `Classe la plus fragile : ${summary.weakestClass.className} (${formatNumber(summary.weakestClass.average, 2)})` : "Classe la plus fragile : N/A",
    summary.weakestSubject ? `Matière prioritaire : ${summary.weakestSubject.subject}` : "Matière prioritaire : N/A",
  ];
  quickFacts.forEach((fact, index) => {
    doc.text(fact, 155, 106 + (index * 9));
  });

  const classInsightColumns: ColumnDefinition<ReturnType<typeof buildClassInsightRows>[number]>[] = [
    {label: "Rang", width: 12, cellType: "int", value: (row) => row.rank},
    {label: "Classe", width: 14, align: "left", value: (row) => row.className},
    {label: `Moy. ${activeLabel}`, width: 14, cellType: "average", value: (row) => row.average},
    {label: "Matière forte", width: 24, align: "left", value: (row) => row.bestSubject},
    {label: "Matière fragile", width: 24, align: "left", value: (row) => row.weakestSubject},
  ];
  autoTable(doc, {
    startY: 146,
    head: [classInsightColumns.map((column) => column.label)],
    body: buildClassInsightRows(reportData).slice(0, 5).map((row) => classInsightColumns.map((column) => {
      const value = column.value(row);
      if (typeof value === "number") {
        if (column.cellType === "int") {
          return value.toFixed(0);
        }
        return value.toFixed(2).replace(".", ",");
      }
      return value ?? "";
    })),
    styles: {font: getPdfFontFamily(doc), fontSize: 8, cellPadding: 1.6, valign: "middle", halign: "center"},
    headStyles: {font: getPdfFontFamily(doc), fillColor: [37, 99, 235], textColor: [255, 255, 255]},
    margin: {left: 14, right: 14},
  });
}

function addAlertsPage(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const activeLabel = getActiveBrevetLabel(reportData);
  const classAlerts = buildClassInsightRows(reportData)
    .filter((row) => row.average !== undefined && row.average < 10)
    .slice(0, 8);
  const subjectAlerts = buildSubjectInsightRows(reportData)
    .filter((row) => row.average !== undefined && row.average < 10)
    .sort((left, right) => (left.average ?? Infinity) - (right.average ?? Infinity))
    .slice(0, 8);
  const studentAlerts = buildStudentWatchRows(reportData);
  const classAverages = buildClassInsightRows(reportData)
    .map((row) => row.average)
    .filter((value): value is number => value !== undefined);
  const classGap = classAverages.length > 1 ? Math.max(...classAverages) - Math.min(...classAverages) : undefined;

  addPdfSectionTitle(doc, "Alertes et points d'attention", `Session ${activeLabel}`);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 24, 269, 16, 3, 3, "FD");
  doc.setTextColor(15, 23, 42);
  setPdfFont(doc, "bold");
  doc.setFontSize(10);
  doc.text(
    `Écart entre meilleure et plus faible classe: ${formatNumber(classGap, 2)} points. Seuil d'attention: 10/20. Objectif: 12/20.`,
    18,
    34
  );

  autoTable(doc, {
    startY: 46,
    margin: {left: 14, right: 148},
    head: [["Classes sous 10", `Moy. ${activeLabel}`, "Matière fragile"]],
    body: classAlerts.map((row) => [row.className, formatNumber(row.average, 2), row.weakestSubject]),
    styles: {font: getPdfFontFamily(doc), fontSize: 8, cellPadding: 1.8},
    headStyles: {font: getPdfFontFamily(doc), fillColor: [239, 68, 68], textColor: [255, 255, 255]},
  });

  autoTable(doc, {
    startY: 46,
    margin: {left: 152, right: 14},
    head: [["Matières sous 10", `Moy. ${activeLabel}`, "Part < 8"]],
    body: subjectAlerts.map((row) => [row.subject, formatNumber(row.average, 2), formatPercent(row.shareLt8)]),
    styles: {font: getPdfFontFamily(doc), fontSize: 8, cellPadding: 1.8},
    headStyles: {font: getPdfFontFamily(doc), fillColor: [245, 158, 11], textColor: [255, 255, 255]},
  });

  autoTable(doc, {
    startY: 118,
    head: [["Priorité", "Élève", "Classe", `Moy. ${activeLabel}`, "Matière à surveiller"]],
    body: studentAlerts.map((row) => [
      row.rank,
      `${row.firstName} ${row.lastName}`,
      row.className,
      formatNumber(row.average, 2),
      row.weakestSubject ? `${row.weakestSubject.label} (${formatNumber(row.weakestSubject.value, 1)})` : "N/A",
    ]),
    styles: {font: getPdfFontFamily(doc), fontSize: 8, cellPadding: 1.6},
    headStyles: {font: getPdfFontFamily(doc), fillColor: [37, 99, 235], textColor: [255, 255, 255]},
    margin: {left: 14, right: 14},
  });
}

function addTopInsightsPage(doc: jsPDF, reportData: BrevetBlancPanoramaReportData) {
  const activeLabel = getActiveBrevetLabel(reportData);
  const performanceRows = reportData.top10Bb2.length > 0 ? reportData.top10Bb2 : reportData.top10Bb1;
  const progressionRows = reportData.top10Progression;
  const classDistribution = performanceRows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.className] = (accumulator[row.className] ?? 0) + 1;
    return accumulator;
  }, {});
  const rankedClasses = Object.entries(classDistribution).sort((left, right) =>
    (right[1] - left[1]) || left[0].localeCompare(right[0], "fr", {numeric: true, sensitivity: "base"})
  );
  const dominantClass = rankedClasses[0];
  const secondDominantClass = rankedClasses[1];
  const averageTop10 = performanceRows.length > 0 ?
    performanceRows.reduce((sum, row) => sum + (getActiveAverage(reportData, row) ?? 0), 0) / performanceRows.length :
    undefined;

  addPdfSectionTitle(doc, "Top 10 et profils de réussite");

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 24, 269, 31, 3, 3, "FD");
  doc.setTextColor(15, 23, 42);
  setPdfFont(doc, "bold");
  doc.setFontSize(10);
  doc.text(`Meilleur élève : ${performanceRows[0] ? `${performanceRows[0].firstName} ${performanceRows[0].lastName} (${formatNumber(getActiveAverage(reportData, performanceRows[0]), 2)})` : "N/A"}`, 18, 33);
  doc.text(`Classe la plus représentée dans le top 10 : ${dominantClass ? `${dominantClass[0]} (${dominantClass[1]} élèves)` : "N/A"}`, 18, 40);
  doc.text(`Seconde classe la plus représentée : ${secondDominantClass ? `${secondDominantClass[0]} (${secondDominantClass[1]} élèves)` : "N/A"}`, 18, 47);
  doc.text(`Moyenne du top 10 : ${formatNumber(averageTop10, 2)}`, 170, 33);
  doc.text(`Progressions disponibles : ${progressionRows.length}`, 170, 40);

  autoTable(doc, {
    startY: 62,
    margin: {left: 14, right: 148},
    head: [["Rang", "Élève", "Classe", `Moy. ${activeLabel}`]],
    body: performanceRows.map((row) => [row.rank, `${row.firstName} ${row.lastName}`, row.className, formatNumber(getActiveAverage(reportData, row), 2)]),
    styles: {fontSize: 8, cellPadding: 1.6},
    headStyles: {fillColor: [37, 99, 235], textColor: [255, 255, 255]},
    columnStyles: {0: {cellWidth: 12}},
  });

  autoTable(doc, {
    startY: 62,
    margin: {left: 152, right: 14},
    head: [["Rang", "Élève", "Classe", "Progression"]],
    body: progressionRows.length > 0 ?
      progressionRows.map((row) => [row.rank, `${row.firstName} ${row.lastName}`, row.className, formatNumber(row.progression, 2)]) :
      [["-", "Pas de progression exploitable", "-", "-"]],
    styles: {font: getPdfFontFamily(doc), fontSize: 8, cellPadding: 1.6},
    headStyles: {font: getPdfFontFamily(doc), fillColor: [16, 185, 129], textColor: [255, 255, 255]},
    columnStyles: {0: {cellWidth: 12}},
  });
}

function getRoundedChartMax(value: number, preferredStep: number): number {
  if (value <= preferredStep) {
    return preferredStep;
  }

  return Math.ceil(value / preferredStep) * preferredStep;
}

function addPdfGroupedBarChart(
  doc: jsPDF,
  title: string,
  categories: string[],
  series: PdfBarChartSeries[],
  options?: {
    subtitle?: string;
    yAxisLabel?: string;
    maxValue?: number;
    tickStep?: number;
    decimals?: number;
    referenceLines?: Array<{value: number; label: string; color: [number, number, number]}>;
  }
) {
  addPdfSectionTitle(doc, title, options?.subtitle);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 24;
  const referenceLabelGutter = options?.referenceLines?.length ? 24 : 0;
  const right = 16 + referenceLabelGutter;
  const top = options?.subtitle ? 38 : 32;
  const bottom = 28;
  const chartWidth = pageWidth - left - right;
  const chartHeight = pageHeight - top - bottom;
  const axisColor: [number, number, number] = [148, 163, 184];
  const gridColor: [number, number, number] = [226, 232, 240];
  const labelColor: [number, number, number] = [71, 85, 105];
  const valueColor: [number, number, number] = [17, 24, 39];
  const categoryCount = Math.max(categories.length, 1);
  const seriesCount = Math.max(series.length, 1);
  const highestValue = series.reduce<number>((maximum, currentSeries) => {
    const currentMax = currentSeries.values.reduce<number>((seriesMaximum, value) => {
      if (value === undefined) {
        return seriesMaximum;
      }
      return Math.max(seriesMaximum, value);
    }, 0);
    return Math.max(maximum, currentMax);
  }, 0);
  const tickStep = options?.tickStep ?? (highestValue <= 20 ? 5 : 10);
  const maxValue = options?.maxValue ?? getRoundedChartMax(highestValue, tickStep);
  const groupWidth = chartWidth / categoryCount;
  const groupPadding = Math.min(5, Math.max(1.2, groupWidth * 0.08));
  const innerGap = Math.min(1.5, Math.max(0.8, groupWidth * 0.03));
  const maxBarWidth = seriesCount === 1 ? 22 : 18;
  const barWidth = Math.max(4, Math.min(maxBarWidth, (groupWidth - (2 * groupPadding) - (innerGap * (seriesCount - 1))) / seriesCount));
  const barsWidth = (seriesCount * barWidth) + ((seriesCount - 1) * innerGap);
  const validReferenceLines = (options?.referenceLines ?? [])
    .filter((referenceLine) => referenceLine.value >= 0 && referenceLine.value <= maxValue)
    .sort((leftReferenceLine, rightReferenceLine) => rightReferenceLine.value - leftReferenceLine.value);

  doc.setDrawColor(...axisColor);
  doc.setLineWidth(0.25);
  doc.line(left, top, left, top + chartHeight);
  doc.line(left, top + chartHeight, left + chartWidth, top + chartHeight);

  for (let tickValue = 0; tickValue <= maxValue; tickValue += tickStep) {
    const ratio = maxValue > 0 ? tickValue / maxValue : 0;
    const y = top + chartHeight - (ratio * chartHeight);
    doc.setDrawColor(...gridColor);
    doc.line(left, y, left + chartWidth, y);
    setPdfFont(doc, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...labelColor);
    doc.text(String(tickValue), left - 3, y + 1.5, {align: "right"});
  }

  if (options?.yAxisLabel) {
    setPdfFont(doc, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...labelColor);
    doc.text(options.yAxisLabel, left - 6, top - 2, {align: "left"});
  }

  let legendX = left;
  const legendY = top - 9;
  series.forEach((entry) => {
    doc.setFillColor(...entry.color);
    doc.rect(legendX, legendY - 3, 6, 4, "F");
    setPdfFont(doc, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...valueColor);
    doc.text(entry.label, legendX + 8, legendY, {align: "left"});
    legendX += 32;
  });

  validReferenceLines.forEach((referenceLine) => {
    const ratio = maxValue > 0 ? referenceLine.value / maxValue : 0;
    const y = top + chartHeight - (ratio * chartHeight);
    const dashedLineColor = interpolateRgb(referenceLine.color, [255, 255, 255], 0.45);

    doc.setDrawColor(...dashedLineColor);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.6, 1.6], 0);
    doc.line(left, y, left + chartWidth, y);
    doc.setLineDashPattern([], 0);
  });

  categories.forEach((category, categoryIndex) => {
    const groupStartX = left + (categoryIndex * groupWidth) + ((groupWidth - barsWidth) / 2);

    series.forEach((entry, seriesIndex) => {
      const value = entry.values[categoryIndex];
      if (value === undefined || value <= 0) {
        return;
      }

      const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
      const x = groupStartX + (seriesIndex * (barWidth + innerGap));
      const y = top + chartHeight - barHeight;
      doc.setFillColor(...entry.color);
      doc.roundedRect(x, y, barWidth, barHeight, 1.5, 1.5, "F");

      const valueLabel = value.toFixed(options?.decimals ?? 1).replace(".", ",");
      const canWriteInsideBar = barHeight >= 10;
      setPdfFont(doc, "bold");
      doc.setFontSize(7);
      doc.setTextColor(...(canWriteInsideBar ? getTextColorForBackground(entry.color) : valueColor));
      doc.text(
        valueLabel,
        x + (barWidth / 2),
        canWriteInsideBar ? y + 4.5 : y - 1.5,
        {align: "center"}
      );
    });

    const label = category.length > 14 ? `${category.slice(0, 12)}...` : category;
    doc.setFontSize(7);
    drawPdfText(
      doc,
      label,
      left + (categoryIndex * groupWidth) + (groupWidth / 2),
      top + chartHeight + 5,
      {style: "normal", color: labelColor, align: "center"},
    );
  });

  let previousReferenceLabelCenterY: number | undefined;
  validReferenceLines.forEach((referenceLine) => {
    const ratio = maxValue > 0 ? referenceLine.value / maxValue : 0;
    const y = top + chartHeight - (ratio * chartHeight);

    doc.setFontSize(7);
    const textWidth = getPdfTextWidthForStyle(doc, referenceLine.label, "bold");
    const labelWidth = textWidth + 6;
    const labelHeight = 5.2;
    const labelX = left + chartWidth + 4;
    const preferredLabelCenterY = Math.max(
      top + (labelHeight / 2),
      Math.min(top + chartHeight - (labelHeight / 2), y),
    );
    const labelCenterY =
      previousReferenceLabelCenterY === undefined
        ? preferredLabelCenterY
        : Math.max(
            preferredLabelCenterY,
            previousReferenceLabelCenterY + labelHeight + 1.5,
          );
    const clampedLabelCenterY = Math.min(
      top + chartHeight - (labelHeight / 2),
      labelCenterY,
    );
    previousReferenceLabelCenterY = clampedLabelCenterY;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...referenceLine.color);
    doc.roundedRect(
      labelX,
      clampedLabelCenterY - (labelHeight / 2),
      labelWidth,
      labelHeight,
      1.4,
      1.4,
      "FD",
    );
    drawPdfText(doc, referenceLine.label, labelX + 3, clampedLabelCenterY + 0.4, {
      style: "bold",
      color: referenceLine.color,
      align: "left",
    });
  });
}

export async function exportBrevetBlancPanoramaPdf(reportData: BrevetBlancPanoramaReportData) {
  const doc = new jsPDF({orientation: "landscape", unit: "mm", format: "a4"});
  await ensurePdfComparisonFont();
  await ensurePdfDocumentFont(doc);
  const hasBb2Data = reportData.stats.participationBb2 > 0;
  const hasProgressionData = reportData.top10Progression.length > 0;
  const heatmapBrevetKey = getPreferredHeatmapBrevetKey(reportData);
  const activeLabel = getActiveBrevetLabel(reportData);
  const classInsights = buildClassInsightRows(reportData);
  const subjectInsights = buildSubjectInsightRows(reportData);
  const benchmarkLines = [
    {value: 10, label: "Seuil 10", color: [239, 68, 68] as [number, number, number]},
    {value: 12, label: "Objectif 12", color: [16, 185, 129] as [number, number, number]},
  ];
  const bb1ChartColor: [number, number, number] = [59, 130, 246];
  const bb2ChartColor: [number, number, number] = [16, 185, 129];
  const summaryRows: PdfSummaryRow[] = [];
  const addSummaryRow = (section: string, label: string, targetPageNumber: number, pageText = String(targetPageNumber)) => {
    summaryRows.push({section, label, targetPageNumber, pageText});
  };

  addExecutiveSummaryPage(doc, reportData);
  addSummaryRow("Synthèses et analyses", "Bilan complet du panorama", 1);

  doc.addPage();
  const summaryPageNumber = doc.getNumberOfPages();

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Répartition globale", doc.getNumberOfPages());
  addPdfDistributionDonutPage(doc, reportData);

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Alertes et points d'attention", doc.getNumberOfPages());
  addAlertsPage(doc, reportData);

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Comparatif graphique des classes", doc.getNumberOfPages());
  addPdfGroupedBarChart(
    doc,
    "Comparatif graphique des classes",
    reportData.classRows.map((row) => row.className),
    hasBb2Data ? [
      {
        label: "Moyenne BB1",
        color: bb1ChartColor,
        values: reportData.classRows.map((row) => row.averageBb1),
      },
      {
        label: "Moyenne BB2",
        color: bb2ChartColor,
        values: reportData.classRows.map((row) => row.averageBb2),
      },
    ] : [
      {
        label: "Moyenne BB1",
        color: bb1ChartColor,
        values: reportData.classRows.map((row) => row.averageBb1),
      },
    ],
    {
      subtitle: "Lecture rapide des moyennes par classe",
      yAxisLabel: "Note /20",
      maxValue: 20,
      tickStep: 5,
      decimals: 1,
      referenceLines: benchmarkLines,
    }
  );

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Comparatif des classes", doc.getNumberOfPages());
  const classPdfColumns: ColumnDefinition<(typeof classInsights)[number]>[] = [
    {label: "Rang", width: 11, cellType: "int", value: (row) => row.rank},
    {label: "Classe", width: 14, align: "left", value: (row) => row.className},
    {label: "Effectif", width: 10, cellType: "int", value: (row) => row.totalStudents},
    {label: `Moy. ${activeLabel}`, width: 11, cellType: "average", value: (row) => row.average},
    {label: "Écart vs 10", width: 12, cellType: "progression", value: (row) => row.gapToTarget},
    {label: "Matière forte", width: 22, align: "left", value: (row) => row.bestSubject},
    {label: "Matière fragile", width: 22, align: "left", value: (row) => row.weakestSubject},
  ];
  if (hasProgressionData) {
    classPdfColumns.push({label: "Progression", width: 12, cellType: "progression", value: (row) => row.progression});
  }
  addPdfTable(
    doc,
    classInsights,
    classPdfColumns,
    "Comparatif des classes",
    "Rang, écart à la cible et matières clefs"
  );

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Matrice des moyennes par classe", doc.getNumberOfPages());
  addPdfHeatmap(doc, reportData, heatmapBrevetKey);

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Comparatif graphique par matière", doc.getNumberOfPages());
  addPdfGroupedBarChart(
    doc,
    "Comparatif graphique par matière",
    reportData.subjectRows.map((row) => reportData.config.abbreviations[row.subject] || row.subject),
    hasBb2Data ? [
      {
        label: "Moyenne BB1",
        color: bb1ChartColor,
        values: reportData.subjectRows.map((row) => row.averageBb1),
      },
      {
        label: "Moyenne BB2",
        color: bb2ChartColor,
        values: reportData.subjectRows.map((row) => row.averageBb2),
      },
    ] : [
      {
        label: "Moyenne BB1",
        color: bb1ChartColor,
        values: reportData.subjectRows.map((row) => row.averageBb1),
      },
    ],
    {
      subtitle: "Moyennes par matière sur 20",
      yAxisLabel: "Note /20",
      maxValue: 20,
      tickStep: 5,
      decimals: 1,
      referenceLines: benchmarkLines,
    }
  );

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Filles / Garçons", doc.getNumberOfPages());
  addPdfGenderComparisonPage(doc, reportData);

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Boursiers / Non-boursiers", doc.getNumberOfPages());
  addPdfScholarshipComparisonPage(doc, reportData);

  const subjectDistributionStartPageNumber = doc.getNumberOfPages() + 1;
  const subjectDistributionPageCount = addPdfSubjectDistributionPages(doc, reportData);
  if (subjectDistributionPageCount > 0) {
    const subjectDistributionEndPageNumber = subjectDistributionStartPageNumber + subjectDistributionPageCount - 1;
    addSummaryRow(
      "Synthèses et analyses",
      "Répartition par matière",
      subjectDistributionStartPageNumber,
      subjectDistributionPageCount > 1 ?
        `${subjectDistributionStartPageNumber}-${subjectDistributionEndPageNumber}` :
        String(subjectDistributionStartPageNumber),
    );
  }

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Analyse par matière", doc.getNumberOfPages());
  const subjectPdfColumns: ColumnDefinition<(typeof subjectInsights)[number]>[] = [
    {label: "Matière", width: 30, align: "left", value: (row) => row.subject},
    {label: "Coefficient", width: 20, align: "center", value: (row) => getSubjectCoefficientDisplay(reportData.config, row.subject)},
    {label: `Moy. ${activeLabel}`, width: 12, cellType: "average", value: (row) => row.average},
    {label: "Copies", width: 14, cellType: "int", value: (row) => row.participation},
    {label: "< 8", width: 12, value: (row) => formatPercent(row.shareLt8)},
    {label: "≥ 15", width: 12, value: (row) => formatPercent(row.shareGte15)},
    {label: "Écart vs 10", width: 12, cellType: "progression", value: (row) => row.gapToTarget},
  ];
  if (hasProgressionData) {
    subjectPdfColumns.push({label: "Progression", width: 12, cellType: "progression", value: (row) => row.progression});
  }
  addPdfTable(
    doc,
    subjectInsights,
    subjectPdfColumns,
    "Analyse par matière"
  );

  doc.addPage();
  addSummaryRow("Synthèses et analyses", "Top 10 et profils de réussite", doc.getNumberOfPages());
  addTopInsightsPage(doc, reportData);

  const classColumns = buildClassDetailColumns(reportData);
  reportData.classDetails.forEach((classDetail) => {
    const classSummary = `Inscrits: ${classDetail.summary.totalStudents} | Moyenne BB1: ${formatNumber(classDetail.summary.averageBb1)}${hasBb2Data ? ` | Moyenne BB2: ${formatNumber(classDetail.summary.averageBb2)}` : ""}`;
    const classFooterRow = buildClassDetailFooterRow(classDetail.students, classColumns);

    doc.addPage();
    const rankingPageNumber = doc.getNumberOfPages();
    addPdfTable(
      doc,
      classDetail.students,
      classColumns,
      `Vue par classe - ${classDetail.className}`,
      `${classSummary} | Ordre par moyenne`,
      {fontSize: hasBb2Data ? 6.2 : 7.0, cellPadding: 1.0, footerRows: [classFooterRow]}
    );

    const alphabeticalStudents = [...classDetail.students].sort(compareClassStudentsAlphabetically);
    doc.addPage();
    const alphabeticalPageNumber = doc.getNumberOfPages();
    addPdfTable(
      doc,
      alphabeticalStudents,
      classColumns,
      `Vue par classe - ${classDetail.className}`,
      `${classSummary} | Ordre alphabétique`,
      {fontSize: hasBb2Data ? 6.2 : 7.0, cellPadding: 1.0, footerRows: [classFooterRow]}
    );
    addSummaryRow("Vues par classe", `${classDetail.className} - moyenne / alphabétique`, rankingPageNumber, `${rankingPageNumber} / ${alphabeticalPageNumber}`);
  });

  addPdfSummaryPage(doc, reportData, summaryRows, summaryPageNumber);
  addPdfFooter(doc, reportData.year);
  doc.save(`Bilan_Panorama_Brevet_Blanc_${reportData.year}.pdf`);
}
