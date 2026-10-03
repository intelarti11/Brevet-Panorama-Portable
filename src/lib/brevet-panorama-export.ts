import jsPDF from "jspdf";

type PdfFontStyle = "normal" | "bold";
type Alignment = "left" | "center" | "right";

export interface BrevetPanoramaScoreDistribution {
  gte15: number;
  gte10lt15: number;
  gte8lt10: number;
  lt8: number;
  count: number;
}

export interface BrevetPanoramaSubjectScoreDistributions {
  francais: BrevetPanoramaScoreDistribution;
  maths: BrevetPanoramaScoreDistribution;
  histoireGeo: BrevetPanoramaScoreDistribution;
  sciences: BrevetPanoramaScoreDistribution;
}

export interface BrevetPanoramaPdfStats {
  totalStudents: number;
  admis: number;
  refuse: number;
  successRate: number;
  mentions: {
    tresBien: number;
    bien: number;
    assezBien: number;
    sansMention: number;
  };
  mentionPercentages: {
    tresBien: number;
    bien: number;
    assezBien: number;
    sansMention: number;
  };
  averageOverallScoreAdmitted?: number;
  averageFrancais?: number;
  countFrancais?: number;
  averageMaths?: number;
  countMaths?: number;
  averageHistoireGeo?: number;
  countHistoireGeo?: number;
  averageSciences?: number;
  countSciences?: number;
  scoreDistribution: BrevetPanoramaSubjectScoreDistributions;
}

type PdfPoint = {
  x: number;
  y: number;
};

type PdfRenderedTextImage = {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
  baselineOffsetMm: number;
};

type PdfDistributionSlice = {
  label: string;
  value: number;
  percentage: number;
  color: [number, number, number];
};

const PDF_COMPARISON_FONT_REGULAR_FILE = "NotoSans-Regular.ttf";
const PDF_COMPARISON_FONT_BOLD_FILE = "NotoSans-Bold.ttf";
const PDF_COMPARISON_CANVAS_FONT_FAMILY = "NotoSansBrevetPdfCanvas";
const PDF_PRIMARY_FONT_FAMILY = "NotoSansBrevetPdf";
const PDF_COMPARISON_SYMBOL_PATTERN = /[≥≤]/u;
const PDF_TEXT_IMAGE_DPI = 96;
const PDF_TEXT_IMAGE_SCALE = 2;
const PDF_TITLE_BLUE: [number, number, number] = [37, 99, 235];
const PDF_TEXT: [number, number, number] = [15, 23, 42];
const PDF_MUTED: [number, number, number] = [100, 116, 139];
const PDF_BORDER: [number, number, number] = [226, 232, 240];
const PDF_SOFT_BG: [number, number, number] = [248, 250, 252];
const PDF_SUCCESS: [number, number, number] = [16, 185, 129];
const PDF_DANGER: [number, number, number] = [239, 68, 68];
const PDF_WARNING: [number, number, number] = [245, 158, 11];
const PDF_GREEN_SOFT: [number, number, number] = [134, 239, 172];
const PDF_YELLOW: [number, number, number] = [245, 158, 11];
const PDF_RED: [number, number, number] = [239, 68, 68];
const PDF_MENTION_TB: [number, number, number] = [253, 224, 71];
const PDF_MENTION_B: [number, number, number] = [37, 99, 235];
const PDF_MENTION_AB: [number, number, number] = [251, 146, 60];
const PDF_MENTION_SM: [number, number, number] = [148, 163, 184];

const SUBJECT_LABELS = {
  francais: "Français",
  maths: "Mathématiques",
  histoireGeo: "Histoire-Géo, EMC",
  sciences: "Sciences",
} as const;

const SUBJECT_AVERAGE_INFO = [
  { key: "francais", label: "Français", maxLabel: "/20", countKey: "countFrancais", averageKey: "averageFrancais" },
  { key: "maths", label: "Mathématiques", maxLabel: "/20", countKey: "countMaths", averageKey: "averageMaths" },
  { key: "histoireGeo", label: "Histoire-Géo, EMC", maxLabel: "/20", countKey: "countHistoireGeo", averageKey: "averageHistoireGeo" },
  { key: "sciences", label: "Sciences", maxLabel: "/20", countKey: "countSciences", averageKey: "averageSciences" },
] as const;

let pdfComparisonCanvasFontPromise: Promise<void> | undefined;
let pdfEmbeddedFontDataPromise: Promise<{ regular: string; bold: string } | null> | undefined;
const pdfEmbeddedFontDocs = new WeakSet<jsPDF>();
const pdfRenderedTextImageCache = new Map<string, PdfRenderedTextImage>();

function hasComparisonSymbol(text: string | undefined): boolean {
  return typeof text === "string" && PDF_COMPARISON_SYMBOL_PATTERN.test(text);
}

function mmFromPx(px: number): number {
  return (px * 25.4) / PDF_TEXT_IMAGE_DPI;
}

function toCssRgb(color: [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

async function loadPdfComparisonCanvasFont(fontFileName: string, weight: "400" | "700"): Promise<void> {
  const fontFace = new FontFace(
    PDF_COMPARISON_CANVAS_FONT_FAMILY,
    `url(/fonts/${fontFileName})`,
    { style: "normal", weight },
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
    color = PDF_TEXT,
    align = "left",
  }: {
    style?: PdfFontStyle;
    color?: [number, number, number];
    align?: Alignment;
  } = {},
) {
  doc.setTextColor(...color);

  if (pdfEmbeddedFontDocs.has(doc) || !hasComparisonSymbol(text)) {
    setPdfFont(doc, style);
    doc.text(text, x, y, { align });
    return;
  }

  const renderedImage = getPdfRenderedTextImage(text, doc.getFontSize(), style, color);
  if (!renderedImage) {
    setPdfFont(doc, style);
    doc.text(text, x, y, { align });
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
  if (!pdfEmbeddedFontDocs.has(doc) && hasComparisonSymbol(text)) {
    const renderedImage = getPdfRenderedTextImage(text, doc.getFontSize(), style, PDF_TEXT);
    if (renderedImage) {
      return renderedImage.widthMm;
    }
  }

  setPdfFont(doc, style);
  return doc.getTextWidth(text);
}

function formatDecimal(value: number | undefined, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return value.toFixed(digits).replace(".", ",");
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "0%";
  }

  return `${value.toFixed(1).replace(".", ",")}%`;
}

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

function buildDistributionSlices(distribution: BrevetPanoramaScoreDistribution): PdfDistributionSlice[] {
  if (!distribution || distribution.count <= 0) {
    return [];
  }

  const slices = [
    { label: "≥ 15", value: distribution.gte15, color: PDF_SUCCESS },
    { label: "10-14,9", value: distribution.gte10lt15, color: PDF_GREEN_SOFT },
    { label: "8-9,9", value: distribution.gte8lt10, color: PDF_YELLOW },
    { label: "< 8", value: distribution.lt8, color: PDF_RED },
  ].filter((slice) => slice.value > 0);

  return slices.map((slice) => ({
    ...slice,
    percentage: distribution.count > 0 ? (slice.value / distribution.count) * 100 : 0,
  }));
}

function drawPdfLegendItems(
  doc: jsPDF,
  items: Array<{ label: string; color: [number, number, number] }>,
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
      color: PDF_TEXT,
      align: "left",
    });
    currentX += itemWidths[index] + gap;
  });
}

function drawPdfDonut(
  doc: jsPDF,
  {
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    slices,
    gap = 0.05,
    insideLabelThreshold = 7,
    insideLabelFontSize = 10,
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
    backgroundColor?: [number, number, number];
  },
) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let startAngle = -Math.PI / 2;
  const insideLabels: Array<{ x: number; y: number; text: string }> = [];

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
      drawPdfFilledPolygon(doc, [{ x: centerX, y: centerY }, ...outerPoints], slice.color);
    }

    if (slice.percentage >= insideLabelThreshold) {
      const labelRadius = (innerRadius + outerRadius) / 2;
      insideLabels.push({
        x: centerX + (Math.cos(midAngle) * labelRadius),
        y: centerY + (Math.sin(midAngle) * labelRadius),
        text: `${Math.round(slice.percentage)}%`,
      });
    }

    startAngle += sweep;
  });

  doc.setFillColor(...backgroundColor);
  doc.setDrawColor(...backgroundColor);
  doc.circle(centerX, centerY, innerRadius, "F");

  insideLabels.forEach((label) => {
    doc.setFontSize(insideLabelFontSize);
    drawPdfText(doc, label.text, label.x, label.y + 0.7, {
      style: "bold",
      color: [255, 255, 255],
      align: "center",
    });
  });
}

function drawPageHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 16);

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(10);
  doc.text(subtitle, 14, 22);
}

function drawFooter(doc: jsPDF, yearLabel: string) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const currentDate = new Date().toLocaleDateString("fr-FR");

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    doc.setPage(pageIndex);
    setPdfFont(doc, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_MUTED);
    doc.text(
      `Panorama Brevet ${yearLabel} - page ${pageIndex}/${pageCount} - Généré le ${currentDate}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }
}

function drawPanel(doc: jsPDF, x: number, y: number, width: number, height: number) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_BORDER);
  doc.roundedRect(x, y, width, height, 3, 3, "FD");
}

function drawSectionTitle(doc: jsPDF, title: string, subtitle: string, x: number, y: number) {
  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(11);
  doc.text(title, x, y);

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(7.7);
  doc.text(subtitle, x, y + 5);
}

function drawStatCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  value: string,
  note: string,
  accent: [number, number, number],
) {
  const height = 24;
  drawPanel(doc, x, y, width, height);
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 3, height, 3, 3, "F");

  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "normal");
  doc.setFontSize(8);
  doc.text(title, x + 6, y + 8);

  doc.setTextColor(...PDF_TEXT);
  setPdfFont(doc, "bold");
  doc.setFontSize(15);
  doc.text(value, x + 6, y + 16.5);

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(6.8);
  doc.text(note, x + 6, y + 21);
}

function drawResultLegend(
  doc: jsPDF,
  items: Array<{ label: string; value: number; color: [number, number, number] }>,
  x: number,
  y: number,
  width: number,
) {
  const gap = 7;
  doc.setFontSize(8.4);
  const itemWidths = items.map((item) => {
    const label = `${item.label}: ${item.value}`;
    return 4 + 2 + getPdfTextWidthForStyle(doc, label, "normal");
  });
  const totalWidth = itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + (gap * Math.max(items.length - 1, 0));
  let currentX = x + Math.max(0, (width - totalWidth) / 2);

  items.forEach((item, index) => {
    const label = `${item.label}: ${item.value}`;
    doc.setFillColor(...item.color);
    doc.roundedRect(currentX, y - 2.2, 4, 4, 0.8, 0.8, "F");
    drawPdfText(doc, label, currentX + 6, y + 0.8, {
      style: "normal",
      color: PDF_TEXT,
      align: "left",
    });
    currentX += itemWidths[index] + gap;
  });
}

function drawMentionBars(
  doc: jsPDF,
  items: Array<{ label: string; value: number; percentage: number; color: [number, number, number] }>,
  x: number,
  y: number,
  width: number,
) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const rowHeight = 14;
  const barX = x + 34;
  const barWidth = width - 54;

  items.forEach((item, index) => {
    const rowY = y + (index * rowHeight);
    const filledWidth = maxValue > 0 ? (item.value / maxValue) * barWidth : 0;

    doc.setTextColor(...PDF_TEXT);
    setPdfFont(doc, "bold");
    doc.setFontSize(8);
    drawPdfText(doc, item.label, x, rowY + 4.5, { style: "bold" });

    doc.setFillColor(...PDF_SOFT_BG);
    doc.roundedRect(barX, rowY, barWidth, 5, 2, 2, "F");
    doc.setFillColor(...item.color);
    doc.roundedRect(barX, rowY, filledWidth, 5, 2, 2, "F");

    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(7);
    drawPdfText(doc, `${item.value} élèves`, barX, rowY + 10, { color: PDF_MUTED });
    drawPdfText(doc, formatPercent(item.percentage), barX + barWidth, rowY + 10, {
      color: PDF_MUTED,
      align: "right",
    });
  });
}

function drawMentionSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  value: number,
  note: string,
  color: [number, number, number],
) {
  const height = 27;
  drawPanel(doc, x, y, width, height);
  doc.setFillColor(...color);
  doc.roundedRect(x + 4, y + 4, 4, 19, 1.5, 1.5, "F");

  doc.setTextColor(...PDF_TEXT);
  setPdfFont(doc, "bold");
  doc.setFontSize(8.2);
  drawPdfText(doc, title, x + 11, y + 8, { style: "bold" });

  doc.setTextColor(...PDF_TITLE_BLUE);
  doc.setFontSize(14);
  drawPdfText(doc, String(value), x + 11, y + 16.5, { style: "bold" });

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(6.8);
  drawPdfText(doc, note, x + 11, y + 22, { color: PDF_MUTED });
}

function drawSubjectPanel(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  distribution: BrevetPanoramaScoreDistribution,
) {
  drawPanel(doc, x, y, width, height);
  drawSectionTitle(doc, title, `${distribution.count} copies prises en compte`, x + 6, y + 9);

  const slices = buildDistributionSlices(distribution);
  if (slices.length === 0) {
    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(9);
    doc.text("Pas de données", x + (width / 2), y + 46, { align: "center" });
    return;
  }

  drawPdfDonut(doc, {
    centerX: x + (width / 2),
    centerY: y + 46,
    outerRadius: 21,
    innerRadius: 8.5,
    slices,
    insideLabelThreshold: 8,
    insideLabelFontSize: 9.5,
  });
}

function drawAverageSubjectCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  average: number | undefined,
  count: number | undefined,
  maxLabel: string,
) {
  const height = 30;
  drawPanel(doc, x, y, width, height);
  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(8.3);
  drawPdfText(doc, title, x + (width / 2), y + 8, { style: "bold", color: PDF_TITLE_BLUE, align: "center" });

  doc.setTextColor(...PDF_TEXT);
  setPdfFont(doc, "bold");
  doc.setFontSize(15);
  drawPdfText(doc, formatDecimal(average, 2), x + (width / 2), y + 17, { style: "bold", align: "center" });

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(6.8);
  drawPdfText(doc, `${count ?? 0} élèves • ${maxLabel}`, x + (width / 2), y + 24, { color: PDF_MUTED, align: "center" });
}

function addOverviewPage(doc: jsPDF, yearLabel: string, stats: BrevetPanoramaPdfStats) {
  drawPageHeader(doc, "Panorama des résultats du Brevet", `Année scolaire ${yearLabel}`);

  const cardsY = 29;
  const cardWidth = 42.5;
  const gap = 5;
  drawStatCard(doc, 12, cardsY, cardWidth, "Nombre d'élèves", String(stats.totalStudents), "élèves dans la sélection", PDF_TITLE_BLUE);
  drawStatCard(doc, 12 + cardWidth + gap, cardsY, cardWidth, "Taux de réussite", `${formatDecimal(stats.successRate)}%`, `${stats.admis} admis / ${stats.admis + stats.refuse}`, PDF_SUCCESS);
  drawStatCard(doc, 12 + ((cardWidth + gap) * 2), cardsY, cardWidth, "Moyenne admis", `${formatDecimal(stats.averageOverallScoreAdmitted, 2)}/20`, "moyenne des admis", PDF_WARNING);
  drawStatCard(doc, 12 + ((cardWidth + gap) * 3), cardsY, cardWidth, "Refusés", String(stats.refuse), "élèves refusés", PDF_DANGER);

  drawPanel(doc, 12, 60, 88, 93);
  drawSectionTitle(doc, "Répartition des résultats", `${stats.totalStudents} élèves considérés`, 18, 69);

  const resultSlices: PdfDistributionSlice[] = [
    {
      label: "Admis",
      value: stats.admis,
      percentage: stats.admis + stats.refuse > 0 ? (stats.admis / (stats.admis + stats.refuse)) * 100 : 0,
      color: PDF_SUCCESS,
    },
    {
      label: "Refusés",
      value: stats.refuse,
      percentage: stats.admis + stats.refuse > 0 ? (stats.refuse / (stats.admis + stats.refuse)) * 100 : 0,
      color: PDF_DANGER,
    },
  ].filter((slice) => slice.value > 0);

  if (resultSlices.length > 0) {
    drawPdfDonut(doc, {
      centerX: 56,
      centerY: 103,
      outerRadius: 26,
      innerRadius: 11,
      slices: resultSlices,
      insideLabelThreshold: 0,
      insideLabelFontSize: 10.5,
    });
    drawResultLegend(doc, [
      { label: "Admis", value: stats.admis, color: PDF_SUCCESS },
      { label: "Refusés", value: stats.refuse, color: PDF_DANGER },
    ], 18, 138, 76);
  } else {
    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(10);
    doc.text("Pas de résultats à afficher", 56, 104, { align: "center" });
  }

  drawPanel(doc, 106, 60, 92, 93);
  drawSectionTitle(doc, "Répartition des mentions", "distribution des admis par mention", 112, 69);
  const mentionItems = [
    { label: "Très Bien", value: stats.mentions.tresBien, percentage: stats.mentionPercentages.tresBien, color: PDF_MENTION_TB },
    { label: "Bien", value: stats.mentions.bien, percentage: stats.mentionPercentages.bien, color: PDF_MENTION_B },
    { label: "Assez Bien", value: stats.mentions.assezBien, percentage: stats.mentionPercentages.assezBien, color: PDF_MENTION_AB },
    { label: "Sans mention", value: stats.mentions.sansMention, percentage: stats.mentionPercentages.sansMention, color: PDF_MENTION_SM },
  ].filter((item) => item.value > 0);

  if (mentionItems.length > 0) {
    drawMentionBars(doc, mentionItems, 112, 84, 80);
  } else {
    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(10);
    doc.text("Pas de mentions à afficher", 152, 104, { align: "center" });
  }

  drawSectionTitle(doc, "Synthèse des mentions", "volume et poids de chaque niveau de mention", 14, 167);
  const summaryY = 174;
  const summaryGap = 4;
  const summaryWidth = (186 - (summaryGap * 3)) / 4;
  drawMentionSummaryCard(doc, 12, summaryY, summaryWidth, "Très Bien", stats.mentions.tresBien, formatPercent(stats.mentionPercentages.tresBien), PDF_MENTION_TB);
  drawMentionSummaryCard(doc, 12 + summaryWidth + summaryGap, summaryY, summaryWidth, "Bien", stats.mentions.bien, formatPercent(stats.mentionPercentages.bien), PDF_MENTION_B);
  drawMentionSummaryCard(doc, 12 + ((summaryWidth + summaryGap) * 2), summaryY, summaryWidth, "Assez Bien", stats.mentions.assezBien, formatPercent(stats.mentionPercentages.assezBien), PDF_MENTION_AB);
  drawMentionSummaryCard(doc, 12 + ((summaryWidth + summaryGap) * 3), summaryY, summaryWidth, "Sans mention", stats.mentions.sansMention, formatPercent(stats.mentionPercentages.sansMention), PDF_MENTION_SM);
}

function addSubjectAnalysisPage(doc: jsPDF, yearLabel: string, stats: BrevetPanoramaPdfStats) {
  doc.addPage();
  drawPageHeader(doc, "Analyse des notes par matière", `Année scolaire ${yearLabel}`);

  drawPdfLegendItems(doc, [
    { label: "≥ 15", color: PDF_SUCCESS },
    { label: "10-14,9", color: PDF_GREEN_SOFT },
    { label: "8-9,9", color: PDF_YELLOW },
    { label: "< 8", color: PDF_RED },
  ], 12, 32, 186, 8.5);

  const panelWidth = 88;
  const panelHeight = 78;
  const gapX = 10;
  const gapY = 8;
  const startY = 40;

  drawSubjectPanel(doc, 12, startY, panelWidth, panelHeight, SUBJECT_LABELS.francais, stats.scoreDistribution.francais);
  drawSubjectPanel(doc, 12 + panelWidth + gapX, startY, panelWidth, panelHeight, SUBJECT_LABELS.maths, stats.scoreDistribution.maths);
  drawSubjectPanel(doc, 12, startY + panelHeight + gapY, panelWidth, panelHeight, SUBJECT_LABELS.histoireGeo, stats.scoreDistribution.histoireGeo);
  drawSubjectPanel(doc, 12 + panelWidth + gapX, startY + panelHeight + gapY, panelWidth, panelHeight, SUBJECT_LABELS.sciences, stats.scoreDistribution.sciences);

  drawSectionTitle(doc, "Moyennes par matière", "Toutes les notes sont harmonisées sur 20", 14, 207);
  const cardY = 214;
  const cardGap = 4;
  const cardWidth = (186 - (cardGap * 3)) / 4;

  SUBJECT_AVERAGE_INFO.forEach((subjectInfo, index) => {
    drawAverageSubjectCard(
      doc,
      12 + (index * (cardWidth + cardGap)),
      cardY,
      cardWidth,
      subjectInfo.label,
      stats[subjectInfo.averageKey],
      stats[subjectInfo.countKey],
      subjectInfo.maxLabel,
    );
  });
}

export async function createBrevetPanoramaPdfDoc(yearLabel: string, stats: BrevetPanoramaPdfStats) {
  await ensurePdfComparisonFont();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await ensurePdfDocumentFont(doc);
  addOverviewPage(doc, yearLabel, stats);
  addSubjectAnalysisPage(doc, yearLabel, stats);
  drawFooter(doc, yearLabel);
  return doc;
}

export async function exportBrevetPanoramaPdf(yearLabel: string, stats: BrevetPanoramaPdfStats) {
  const doc = await createBrevetPanoramaPdfDoc(yearLabel, stats);
  doc.save(`Panorama_Resultats_${yearLabel.replace(/[\\/:*?"<>|]/g, "-")}.pdf`);
}
