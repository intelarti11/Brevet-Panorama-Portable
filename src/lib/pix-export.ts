import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { PixStudentData } from "@/lib/pix-types";

type PdfFontStyle = "normal" | "bold";

type PixScoreDistributionData = {
  range: string;
  count: number;
};

type PixRadarChartDataPoint = {
  subject: string;
  averageScore: number;
  fullMark: number;
};

type PixDetailedSkillAverage = {
  code: string;
  name: string;
  averageScore: number;
  fullMark: number;
};

export interface PixYearStatsExportData {
  studentCount: number;
  validatedCount: number;
  averagePixScore: string;
  minPixScore: number | string;
  maxPixScore: number | string;
  top5Students: PixStudentData[];
  scoreDistribution: PixScoreDistributionData[];
  radarChartData: PixRadarChartDataPoint[];
  detailedSkillAverages: PixDetailedSkillAverage[];
}

type PdfPoint = {
  x: number;
  y: number;
};

const PDF_COMPARISON_FONT_REGULAR_FILE = "NotoSans-Regular.ttf";
const PDF_COMPARISON_FONT_BOLD_FILE = "NotoSans-Bold.ttf";
const PDF_PRIMARY_FONT_FAMILY = "NotoSansPixPdf";
const PDF_TITLE_BLUE: [number, number, number] = [37, 99, 235];
const PDF_BORDER: [number, number, number] = [226, 232, 240];
const PDF_TEXT: [number, number, number] = [15, 23, 42];
const PDF_MUTED: [number, number, number] = [100, 116, 139];
const PDF_BAR: [number, number, number] = [59, 130, 246];
const PDF_RADAR_FILL: [number, number, number] = [147, 197, 253];
const PDF_PROGRESS_GREEN: [number, number, number] = [34, 197, 94];

const PIX_SKILL_GROUPS = [
  {title: "1. Information et données", codes: ["1.1", "1.2", "1.3"]},
  {title: "2. Communication et collaboration", codes: ["2.1", "2.2", "2.3", "2.4"]},
  {title: "3. Création de contenu", codes: ["3.1", "3.2", "3.3", "3.4"]},
  {title: "4. Protection et sécurité", codes: ["4.1", "4.2", "4.3"]},
  {title: "5. Environnement numérique", codes: ["5.1", "5.2"]},
] as const;

let pdfEmbeddedFontDataPromise: Promise<{regular: string; bold: string} | null> | undefined;
const pdfEmbeddedFontDocs = new WeakSet<jsPDF>();

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

function formatDisplayValue(value: number | string): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  }

  return value;
}

function buildPolygonPoints(centerX: number, centerY: number, radius: number, sides: number, angleOffset = -Math.PI / 2): PdfPoint[] {
  return Array.from({length: sides}, (_, index) => {
    const angle = angleOffset + ((Math.PI * 2 * index) / sides);
    return {
      x: centerX + (Math.cos(angle) * radius),
      y: centerY + (Math.sin(angle) * radius),
    };
  });
}

function drawClosedPolygon(
  doc: jsPDF,
  points: PdfPoint[],
  {
    fillColor,
    strokeColor,
    lineWidth = 0.35,
    fill = false,
  }: {
    fillColor?: [number, number, number];
    strokeColor?: [number, number, number];
    lineWidth?: number;
    fill?: boolean;
  } = {},
) {
  if (points.length < 2) {
    return;
  }

  const [firstPoint, ...otherPoints] = points;
  const vectors: Array<[number, number]> = [];
  let previousPoint = firstPoint;

  otherPoints.forEach((point) => {
    vectors.push([point.x - previousPoint.x, point.y - previousPoint.y]);
    previousPoint = point;
  });
  vectors.push([firstPoint.x - previousPoint.x, firstPoint.y - previousPoint.y]);

  if (strokeColor) {
    doc.setDrawColor(...strokeColor);
  }
  if (fillColor) {
    doc.setFillColor(...fillColor);
  }
  doc.setLineWidth(lineWidth);
  doc.lines(vectors, firstPoint.x, firstPoint.y, [1, 1], fill ? "FD" : "S", true);
}

function drawPageHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 16);

  if (subtitle) {
    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(10);
    doc.text(subtitle, 14, 22);
  }
}

function drawFooter(doc: jsPDF, year: string) {
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
      `Analyse PIX ${year} - page ${pageIndex}/${pageCount} - Généré le ${currentDate}`,
      pageWidth / 2,
      pageHeight - 8,
      {align: "center"},
    );
  }
}

function drawStatCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  value: string,
  note: string,
  accent: [number, number, number],
) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_BORDER);
  doc.roundedRect(x, y, width, height, 3, 3, "FD");
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 3, height, 3, 3, "F");

  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "normal");
  doc.setFontSize(8);
  doc.text(title, x + 6, y + 8);

  doc.setTextColor(...PDF_TEXT);
  setPdfFont(doc, "bold");
  doc.setFontSize(15);
  doc.text(value, x + 6, y + 17);

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(6.8);
  doc.text(note, x + 6, y + 22);
}

function drawPanelContainer(doc: jsPDF, x: number, y: number, width: number, height: number, title: string, subtitle: string) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_BORDER);
  doc.roundedRect(x, y, width, height, 3, 3, "FD");

  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(10.5);
  doc.text(title, x + 6, y + 9);

  doc.setTextColor(...PDF_MUTED);
  setPdfFont(doc, "normal");
  doc.setFontSize(7.4);
  doc.text(subtitle, x + 6, y + 14);
}

function drawDistributionBarChart(
  doc: jsPDF,
  data: PixScoreDistributionData[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  let startIndex = 0;
  let endIndex = data.length - 1;

  while (startIndex <= endIndex && data[startIndex]?.count === 0) {
    startIndex += 1;
  }

  while (endIndex >= startIndex && data[endIndex]?.count === 0) {
    endIndex -= 1;
  }

  const visibleData =
    startIndex <= endIndex ? data.slice(startIndex, endIndex + 1) : data;
  const chartX = x + 8;
  const chartY = y + 23;
  const chartWidth = width - 13;
  const chartHeight = height - 39;
  const chartBottom = chartY + chartHeight;
  const maxCount = Math.max(...visibleData.map((item) => item.count), 1);
  const step = maxCount <= 5 ? 1 : Math.ceil(maxCount / 5);
  const upperBound = Math.max(step, Math.ceil(maxCount / step) * step);
  const barGap = visibleData.length <= 8 ? 2.4 : 3;
  const barWidth = Math.max(6, (chartWidth - ((visibleData.length - 1) * barGap)) / Math.max(visibleData.length, 1));

  for (let tick = 0; tick <= upperBound; tick += step) {
    const ratio = upperBound === 0 ? 0 : tick / upperBound;
    const lineY = chartBottom - (ratio * chartHeight);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(chartX, lineY, chartX + chartWidth, lineY);
    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(6.5);
    doc.text(String(tick), chartX - 2, lineY + 1.5, {align: "right"});
  }

  visibleData.forEach((item, index) => {
    const barHeight = upperBound === 0 ? 0 : (item.count / upperBound) * chartHeight;
    const barX = chartX + (index * (barWidth + barGap));
    const barY = chartBottom - barHeight;

    doc.setFillColor(...PDF_BAR);
    doc.roundedRect(barX, barY, barWidth, barHeight, 1.4, 1.4, "F");

    if (item.count > 0) {
      doc.setTextColor(...PDF_TEXT);
      setPdfFont(doc, "bold");
      doc.setFontSize(6.8);
      doc.text(String(item.count), barX + (barWidth / 2), barY - 1.6, {align: "center"});
    }

    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(6.1);
    doc.text(item.range, barX + (barWidth / 2), chartBottom + 8, {
      align: "center",
      angle: visibleData.length > 6 ? -18 : 0,
    });
  });
}

function drawRadarChart(
  doc: jsPDF,
  data: PixRadarChartDataPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const centerX = x + (width / 2);
  const centerY = y + 49;
  const radius = Math.min(width, height) * 0.235;
  const labelOffset = 5.5;
  const levels = Math.max(...data.map((item) => item.fullMark), 4);
  const sides = data.length;

  for (let level = 1; level <= levels; level++) {
    const polygon = buildPolygonPoints(centerX, centerY, (radius * level) / levels, sides);
    drawClosedPolygon(doc, polygon, {strokeColor: [203, 213, 225], lineWidth: 0.2});
  }

  const outerPolygon = buildPolygonPoints(centerX, centerY, radius, sides);
  outerPolygon.forEach((point, index) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(centerX, centerY, point.x, point.y);

    const labelAngle = -Math.PI / 2 + ((Math.PI * 2 * index) / sides);
    const labelX = centerX + (Math.cos(labelAngle) * (radius + labelOffset));
    const labelY = centerY + (Math.sin(labelAngle) * (radius + labelOffset));
    doc.setTextColor(...PDF_TEXT);
    setPdfFont(doc, "normal");
    doc.setFontSize(5.8);
    doc.text(data[index]?.subject ?? "", labelX, labelY, {align: "center"});
  });

  for (let level = 1; level <= levels; level++) {
    doc.setTextColor(...PDF_MUTED);
    setPdfFont(doc, "normal");
    doc.setFontSize(5.8);
    doc.text(String(level), centerX + 2, centerY - ((radius * level) / levels), {align: "left"});
  }

  const valuePoints = data.map((item, index) => {
    const ratio = item.fullMark > 0 ? item.averageScore / item.fullMark : 0;
    const angle = -Math.PI / 2 + ((Math.PI * 2 * index) / sides);
    return {
      x: centerX + (Math.cos(angle) * radius * ratio),
      y: centerY + (Math.sin(angle) * radius * ratio),
    };
  });
  drawClosedPolygon(doc, valuePoints, {
    fillColor: PDF_RADAR_FILL,
    strokeColor: PDF_BAR,
    lineWidth: 0.5,
    fill: true,
  });

  valuePoints.forEach((point) => {
    doc.setFillColor(...PDF_BAR);
    doc.circle(point.x, point.y, 0.9, "F");
  });
}

function drawDetailedSkillGroupCard(
  doc: jsPDF,
  title: string,
  skills: PixDetailedSkillAverage[],
  x: number,
  y: number,
  width: number,
) {
  const rowHeight = 12;
  const cardHeight = 18 + (skills.length * rowHeight);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_BORDER);
  doc.roundedRect(x, y, width, cardHeight, 3, 3, "FD");

  doc.setTextColor(...PDF_TITLE_BLUE);
  setPdfFont(doc, "bold");
  doc.setFontSize(9);
  doc.text(title, x + 5, y + 8);

  skills.forEach((skill, index) => {
    const rowY = y + 14 + (index * rowHeight);
    const barX = x + 5;
    const barY = rowY + 5.6;
    const barWidth = width - 10;
    const progress = skill.fullMark > 0 ? Math.max(0, Math.min(1, skill.averageScore / skill.fullMark)) : 0;
    const labelText = `${skill.code} ${skill.name}`;

    doc.setTextColor(...PDF_TEXT);
    setPdfFont(doc, "normal");
    doc.setFontSize(6.4);
    const labelLines = doc.splitTextToSize(labelText, barWidth - 18).slice(0, 2);
    doc.text(labelLines, barX, rowY);

    doc.setTextColor(...PDF_TITLE_BLUE);
    setPdfFont(doc, "bold");
    doc.setFontSize(6.6);
    doc.text(`${skill.averageScore.toFixed(2).replace(".", ",")} / ${skill.fullMark}`, x + width - 5, rowY, {align: "right"});

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barX, barY, barWidth, 2.8, 1.2, 1.2, "F");
    doc.setFillColor(...PDF_PROGRESS_GREEN);
    doc.roundedRect(barX, barY, barWidth * progress, 2.8, 1.2, 1.2, "F");
  });
}

function addOverviewPage(doc: jsPDF, year: string, yearStats: PixYearStatsExportData) {
  drawPageHeader(doc, "Analyse annuelle détaillée PIX", `Année ${year}`);

  drawStatCard(doc, 12, 28, 58, 26, "Nombre d'élèves", String(yearStats.studentCount), "Total des élèves enregistrés", [37, 99, 235]);
  drawStatCard(doc, 76, 28, 58, 26, "Total validé", String(yearStats.validatedCount), "Certifications validées", [16, 185, 129]);
  drawStatCard(doc, 140, 28, 58, 26, "Score Pix moyen", formatDisplayValue(yearStats.averagePixScore), "Moyenne annuelle", [59, 130, 246]);
  drawStatCard(doc, 12, 58, 90, 26, "Score minimum", formatDisplayValue(yearStats.minPixScore), "Plus faible score observé", [245, 158, 11]);
  drawStatCard(doc, 108, 58, 90, 26, "Score maximum", formatDisplayValue(yearStats.maxPixScore), "Plus haut score observé", [22, 163, 74]);

  drawPanelContainer(doc, 12, 90, 90, 80, "Distribution des scores Pix", "Nombre d'élèves par tranche de score");
  drawDistributionBarChart(doc, yearStats.scoreDistribution, 12, 90, 90, 80);

  drawPanelContainer(doc, 108, 90, 90, 80, "Performance moyenne par domaine", "Score moyen annuel par domaine");
  drawRadarChart(doc, yearStats.radarChartData, 108, 90, 90, 80);

  drawPanelContainer(doc, 12, 176, 186, 87, `Top 5 élèves - ${year}`, "Classement des meilleurs scores Pix");
  autoTable(doc, {
    startY: 192,
    margin: {left: 18, right: 18},
    tableWidth: "wrap",
    head: [["Rang", "Prénom", "Nom", "Classe", "Score Pix"]],
    body: yearStats.top5Students.map((student, index) => [
      index + 1,
      student.prenom,
      student.nom,
      student.classe,
      student.nombrePix,
    ]),
    styles: {
      font: getPdfFontFamily(doc),
      fontSize: 7.2,
      cellPadding: 1.2,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      font: getPdfFontFamily(doc),
      fillColor: PDF_TITLE_BLUE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: {halign: "center", cellWidth: 14},
      1: {cellWidth: 28},
      2: {cellWidth: 40},
      3: {cellWidth: 28},
      4: {halign: "right", cellWidth: 20},
    },
  });
}

function addDetailedSkillsPage(doc: jsPDF, year: string, yearStats: PixYearStatsExportData) {
  doc.addPage();
  drawPageHeader(doc, "Moyennes par compétence détaillée", `Année ${year}`);

  const groupedSkills = PIX_SKILL_GROUPS.map((group) => ({
    title: group.title,
    skills: yearStats.detailedSkillAverages.filter((skill) => group.codes.some((code) => code === skill.code)),
  })).filter((group) => group.skills.length > 0);

  const leftColumnX = 12;
  const rightColumnX = 108;
  const cardWidth = 90;
  const gapY = 6;
  let leftY = 30;
  let rightY = 30;

  groupedSkills.forEach((group, index) => {
    const targetColumnX = index % 2 === 0 ? leftColumnX : rightColumnX;
    const targetY = index % 2 === 0 ? leftY : rightY;
    drawDetailedSkillGroupCard(doc, group.title, group.skills, targetColumnX, targetY, cardWidth);
    const cardHeight = 18 + (group.skills.length * 12);

    if (index % 2 === 0) {
      leftY += cardHeight + gapY;
    } else {
      rightY += cardHeight + gapY;
    }
  });
}

export async function createPixYearAnalysisPdfDoc(
  year: string,
  yearStats: PixYearStatsExportData,
) {
  const doc = new jsPDF({orientation: "p", unit: "mm", format: "a4"});
  await ensurePdfDocumentFont(doc);
  addOverviewPage(doc, year, yearStats);
  addDetailedSkillsPage(doc, year, yearStats);
  drawFooter(doc, year);
  return doc;
}

export async function exportPixYearAnalysisPdf(
  year: string,
  yearStats: PixYearStatsExportData,
) {
  const doc = await createPixYearAnalysisPdfDoc(year, yearStats);
  doc.save(`tableau_analyse_pix_${year}.pdf`);
}
