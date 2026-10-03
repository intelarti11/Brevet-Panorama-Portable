import jsPDF from "jspdf";

import {
  buildBusySlotKey,
  capitalizeFirst,
  formatIsoDateToFr,
  REPLACEMENT_DAYS,
  REPLACEMENT_TIMES,
  type ReplacementSlot,
  type ReplacementWeekDocument,
} from "@/lib/replacements";

type PdfFontStyle = "normal" | "bold";
type PdfTextAlign = "left" | "center" | "right";
type Rgb = [number, number, number];

export interface ExportReplacementSemainierPdfOptions {
  weeks: ReplacementWeekDocument[];
  busySlotSet: Set<string>;
  busySlotLabelMap: Map<string, string[]>;
  icsFileName?: string;
  hasIcsData: boolean;
}

const PDF_FONT_REGULAR_FILE = "NotoSans-Regular.ttf";
const PDF_FONT_BOLD_FILE = "NotoSans-Bold.ttf";
const PDF_FONT_FAMILY = "NotoSansReplacementPdf";

const COLOR_TEXT: Rgb = [15, 23, 42];
const COLOR_MUTED: Rgb = [100, 116, 139];
const COLOR_BORDER: Rgb = [203, 213, 225];
const COLOR_BORDER_STRONG: Rgb = [148, 163, 184];
const COLOR_HEADER_BG: Rgb = [241, 245, 249];
const COLOR_TIME_BG: Rgb = [248, 250, 252];
const COLOR_WEEK_BG: Rgb = [255, 255, 255];
const COLOR_GREEN_BG: Rgb = [236, 253, 245];
const COLOR_GREEN_BORDER: Rgb = [134, 239, 172];
const COLOR_ROSE_BG: Rgb = [255, 241, 242];
const COLOR_ROSE_BORDER: Rgb = [253, 164, 175];
const COLOR_ROSE_TEXT: Rgb = [190, 24, 93];

let pdfEmbeddedFontDataPromise: Promise<{ regular: string; bold: string } | null> | undefined;
const pdfEmbeddedFontDocs = new WeakSet<jsPDF>();

const pad = (value: number) => String(value).padStart(2, "0");

const parseIsoDateUtc = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
};

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toIsoDate = (value: Date) =>
  `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;

const getWeekLabel = (weekKey: string) => {
  const monday = parseIsoDateUtc(weekKey);
  const friday = addUtcDays(monday, 4);
  return `Semaine du ${formatIsoDateToFr(weekKey)} au ${formatIsoDateToFr(toIsoDate(friday))}`;
};

const getDayColumnLabel = (weekKey: string, dayIdx: number) => {
  const currentDate = addUtcDays(parseIsoDateUtc(weekKey), dayIdx);
  return `${capitalizeFirst(REPLACEMENT_DAYS[dayIdx])} ${formatIsoDateToFr(toIsoDate(currentDate))}`;
};

const normalizePdfText = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const getReadableRoomLabel = (room: string) =>
  room
    .trim()
    .replace(/^salle\s+/i, "")
    .replace(/\s+/g, " ");

const getCompactRoomLabel = (room: string) => {
  const readableRoom = getReadableRoomLabel(room);
  if (!readableRoom) {
    return "";
  }

  const roomNumberMatch = readableRoom.match(/^(\d{1,3}[A-Za-z]?)(?:\b|\s|-)/);
  if (roomNumberMatch) {
    return `S.${roomNumberMatch[1]}`;
  }

  const firstSegment = readableRoom.split(/\s*-\s*/)[0]?.trim() ?? readableRoom;
  if (firstSegment.length <= 12) {
    return firstSegment;
  }

  return firstSegment.slice(0, 12);
};

const buildCellMap = (slots: ReplacementSlot[]) => {
  const cellMap = new Map<string, ReplacementSlot[]>();

  slots.forEach((slot) => {
    const key = `${slot.dayIdx}-${slot.slotIdx}`;
    const current = cellMap.get(key) ?? [];
    current.push(slot);
    cellMap.set(key, current);
  });

  cellMap.forEach((cellSlots, key) => {
    cellMap.set(
      key,
      [...cellSlots].sort(
        (slotA, slotB) =>
          slotA.className.localeCompare(slotB.className) ||
          slotA.absentProfessor.localeCompare(slotB.absentProfessor) ||
          slotA.subject.localeCompare(slotB.subject)
      )
    );
  });

  return cellMap;
};

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
      fetch(`/fonts/${PDF_FONT_REGULAR_FILE}`),
      fetch(`/fonts/${PDF_FONT_BOLD_FILE}`),
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

async function ensurePdfDocumentFont(doc: jsPDF): Promise<void> {
  if (pdfEmbeddedFontDocs.has(doc)) {
    return;
  }

  const fontData = await loadPdfEmbeddedFontData();
  if (!fontData) {
    return;
  }

  doc.addFileToVFS(PDF_FONT_REGULAR_FILE, fontData.regular);
  doc.addFont(PDF_FONT_REGULAR_FILE, PDF_FONT_FAMILY, "normal", 400, "Identity-H");
  doc.addFileToVFS(PDF_FONT_BOLD_FILE, fontData.bold);
  doc.addFont(PDF_FONT_BOLD_FILE, PDF_FONT_FAMILY, "bold", 700, "Identity-H");
  pdfEmbeddedFontDocs.add(doc);
}

const getPdfFontFamily = (doc: jsPDF) =>
  pdfEmbeddedFontDocs.has(doc) ? PDF_FONT_FAMILY : "helvetica";

const setPdfFont = (doc: jsPDF, style: PdfFontStyle) => {
  doc.setFont(getPdfFontFamily(doc), style);
};

const drawText = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  {
    style = "normal",
    color = COLOR_TEXT,
    align = "left",
    size,
  }: {
    style?: PdfFontStyle;
    color?: Rgb;
    align?: PdfTextAlign;
    size?: number;
  } = {}
) => {
  if (size) {
    doc.setFontSize(size);
  }

  setPdfFont(doc, style);
  doc.setTextColor(...color);
  doc.text(text, x, y, { align });
};

const getTextWidth = (
  doc: jsPDF,
  text: string,
  style: PdfFontStyle,
  fontSize: number
) => {
  doc.setFontSize(fontSize);
  setPdfFont(doc, style);
  return doc.getTextWidth(text);
};

const truncateText = (
  doc: jsPDF,
  text: string,
  maxWidth: number,
  style: PdfFontStyle,
  fontSize: number
) => {
  const normalized = normalizePdfText(text);
  if (!normalized || maxWidth <= 0) {
    return "";
  }

  if (getTextWidth(doc, normalized, style, fontSize) <= maxWidth) {
    return normalized;
  }

  const ellipsis = "...";
  const ellipsisWidth = getTextWidth(doc, ellipsis, style, fontSize);
  if (ellipsisWidth > maxWidth) {
    return "";
  }

  let low = 0;
  let high = normalized.length;
  let best = "";

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${normalized.slice(0, middle).trimEnd()}${ellipsis}`;
    if (getTextWidth(doc, candidate, style, fontSize) <= maxWidth) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best || ellipsis;
};

const getBadgeWidth = (doc: jsPDF, label: string, maxWidth: number) => {
  const fontSize = 5.9;
  const iconWidth = 4.2;
  const horizontalPadding = 2.2;
  const textMaxWidth = Math.max(6, maxWidth - iconWidth - horizontalPadding);
  const fittedLabel = truncateText(doc, label, textMaxWidth, "normal", fontSize);
  const textWidth = getTextWidth(doc, fittedLabel, "normal", fontSize);
  return Math.min(maxWidth, iconWidth + horizontalPadding + textWidth + 1.6);
};

const drawBusyBadge = (
  doc: jsPDF,
  label: string,
  x: number,
  y: number,
  maxWidth: number
) => {
  const height = 5.2;
  const width = getBadgeWidth(doc, label, maxWidth);
  const fontSize = 5.9;
  const radius = height / 2;
  const iconCircleRadius = 1.35;
  const iconCenterX = x + 2.6;
  const iconCenterY = y + (height / 2);
  const fittedLabel = truncateText(
    doc,
    label,
    Math.max(6, width - 7.2),
    "normal",
    fontSize
  );

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_ROSE_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, height, radius, radius, "FD");

  doc.setFillColor(...COLOR_ROSE_TEXT);
  doc.circle(iconCenterX, iconCenterY, iconCircleRadius, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.line(iconCenterX - 0.75, iconCenterY, iconCenterX + 0.75, iconCenterY);

  drawText(doc, fittedLabel, x + 4.8, y + 3.45, {
    color: COLOR_ROSE_TEXT,
    size: fontSize,
  });

  return width;
};

const drawSlotCard = (
  doc: jsPDF,
  slot: ReplacementSlot,
  {
    x,
    y,
    width,
    height,
    busy,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    busy: boolean;
  }
) => {
  const borderColor = busy ? COLOR_ROSE_BORDER : COLOR_GREEN_BORDER;
  const classFontSize =
    height >= 7.2 ? 6.4 :
    height >= 6 ? 5.8 :
    height >= 4.9 ? 5.2 :
    4.7;
  const professorFontSize =
    height >= 7.2 ? 5.9 :
    height >= 6 ? 5.4 :
    height >= 4.9 ? 4.9 :
    4.4;
  const roomFontSize = Math.max(4.1, professorFontSize - 0.4);
  const paddingX = height >= 6 ? 1.2 : 0.95;
  const firstBaseline = y + Math.max(1.85, height * 0.38);
  const secondBaseline = y + height - Math.max(0.8, height * 0.2);
  const compactRoom = slot.room ? getCompactRoomLabel(slot.room) : "";
  const fittedRoom = compactRoom ?
    truncateText(doc, compactRoom, Math.min(width * 0.25, 11), "normal", roomFontSize) :
    "";
  const roomWidth = fittedRoom ?
    getTextWidth(doc, fittedRoom, "normal", roomFontSize) :
    0;
  const classWidth = width - (paddingX * 2) - (roomWidth > 0 ? roomWidth + 1.4 : 0);
  const fittedClass = truncateText(doc, slot.className, classWidth, "bold", classFontSize);
  const professorText = normalizePdfText(slot.absentProfessor || slot.subject || "Sans détail");
  const fittedProfessor = truncateText(
    doc,
    professorText,
    width - (paddingX * 2),
    "normal",
    professorFontSize
  );

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.24);
  doc.roundedRect(x, y, width, height, 1.2, 1.2, "FD");

  if (fittedClass) {
    drawText(doc, fittedClass, x + paddingX, firstBaseline, {
      style: "bold",
      size: classFontSize,
    });
  }

  if (fittedRoom) {
    drawText(doc, fittedRoom, x + width - paddingX, firstBaseline, {
      color: COLOR_MUTED,
      align: "right",
      size: roomFontSize,
    });
  }

  if (fittedProfessor) {
    drawText(doc, fittedProfessor, x + paddingX, secondBaseline, {
      color: busy ? COLOR_TEXT : COLOR_TEXT,
      size: professorFontSize,
    });
  }
};

const drawWeekPage = (
  doc: jsPDF,
  week: ReplacementWeekDocument,
  {
    busySlotSet,
    busySlotLabelMap,
    icsFileName,
    hasIcsData,
  }: Omit<ExportReplacementSemainierPdfOptions, "weeks">
) => {
  const cellMap = buildCellMap(week.slots);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 6;
  const headerTop = 9;
  const gridTop = 25;
  const gridLeft = margin;
  const gridWidth = pageWidth - (margin * 2);
  const gridHeight = pageHeight - gridTop - margin;
  const timeColumnWidth = 17.5;
  const dayColumnWidth = (gridWidth - timeColumnWidth) / REPLACEMENT_DAYS.length;
  const dayHeaderHeight = 9.5;
  const rowHeight = (gridHeight - dayHeaderHeight) / REPLACEMENT_TIMES.length;

  doc.setFillColor(...COLOR_WEEK_BG);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  drawText(doc, getWeekLabel(week.weekKey), margin, headerTop + 3.2, {
    style: "bold",
    size: 16.8,
  });

  drawText(
    doc,
    `${week.slotCount} créneau(x)${hasIcsData ? " - contraintes ICS prises en compte" : ""}`,
    margin,
    headerTop + 8.6,
    {
      color: COLOR_MUTED,
      size: 7.5,
    }
  );

  drawText(doc, "ORCD - Consultation des remplacements", pageWidth - margin, headerTop + 3.2, {
    color: COLOR_MUTED,
    align: "right",
    size: 7.8,
  });

  drawText(
    doc,
    icsFileName ? `ICS : ${normalizePdfText(icsFileName)}` : "Sans ICS chargé",
    pageWidth - margin,
    headerTop + 8.6,
    {
      color: COLOR_MUTED,
      align: "right",
      size: 7.5,
    }
  );

  doc.setFillColor(...COLOR_HEADER_BG);
  doc.rect(gridLeft, gridTop, gridWidth, dayHeaderHeight, "F");

  REPLACEMENT_TIMES.forEach((_, slotIdx) => {
    const rowY = gridTop + dayHeaderHeight + (slotIdx * rowHeight);
    doc.setFillColor(...COLOR_TIME_BG);
    doc.rect(gridLeft, rowY, timeColumnWidth, rowHeight, "F");

    REPLACEMENT_DAYS.forEach((_, dayIdx) => {
      const cellX = gridLeft + timeColumnWidth + (dayIdx * dayColumnWidth);
      const busyKey = buildBusySlotKey(week.weekKey, dayIdx, slotIdx);
      const cellSlots = cellMap.get(`${dayIdx}-${slotIdx}`) ?? [];
      const isBusy = busySlotSet.has(busyKey);
      const cellColor =
        cellSlots.length === 0 ? COLOR_WEEK_BG :
        isBusy ? COLOR_ROSE_BG :
        COLOR_GREEN_BG;

      doc.setFillColor(...cellColor);
      doc.rect(cellX, rowY, dayColumnWidth, rowHeight, "F");
    });
  });

  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(gridLeft, gridTop, gridWidth, gridHeight, 3.5, 3.5, "S");

  for (let columnIndex = 1; columnIndex <= REPLACEMENT_DAYS.length; columnIndex += 1) {
    const lineX = gridLeft + timeColumnWidth + ((columnIndex - 1) * dayColumnWidth);
    doc.setLineWidth(0.22);
    doc.line(lineX, gridTop, lineX, gridTop + gridHeight);
  }

  for (let rowIndex = 0; rowIndex <= REPLACEMENT_TIMES.length; rowIndex += 1) {
    const lineY = gridTop + dayHeaderHeight + (rowIndex * rowHeight);
    const isMiddayBoundary = rowIndex === 4;
    doc.setDrawColor(...(isMiddayBoundary ? COLOR_BORDER_STRONG : COLOR_BORDER));
    doc.setLineWidth(isMiddayBoundary ? 0.85 : 0.22);
    doc.line(gridLeft, lineY, gridLeft + gridWidth, lineY);
  }

  REPLACEMENT_DAYS.forEach((_dayLabel, dayIdx) => {
    drawText(
      doc,
      getDayColumnLabel(week.weekKey, dayIdx),
      gridLeft + timeColumnWidth + (dayIdx * dayColumnWidth) + 2.2,
      gridTop + 6.4,
      {
        style: "bold",
        size: 7.2,
      }
    );
  });

  REPLACEMENT_TIMES.forEach((timeLabel, slotIdx) => {
    const rowY = gridTop + dayHeaderHeight + (slotIdx * rowHeight);
    drawText(doc, timeLabel, gridLeft + 2.1, rowY + 7, {
      style: "bold",
      color: COLOR_MUTED,
      size: 7,
    });

    REPLACEMENT_DAYS.forEach((_, dayIdx) => {
      const cellX = gridLeft + timeColumnWidth + (dayIdx * dayColumnWidth);
      const busyKey = buildBusySlotKey(week.weekKey, dayIdx, slotIdx);
      const cellSlots = cellMap.get(`${dayIdx}-${slotIdx}`) ?? [];
      const busyLabels = busySlotLabelMap.get(busyKey) ?? [];
      const isBusy = busySlotSet.has(busyKey);
      const cellPadding = 1.6;
      const badgeGap = 1;
      const badgeWidth =
        isBusy && busyLabels.length > 0 ?
          getBadgeWidth(doc, busyLabels[0], Math.min(20, dayColumnWidth * 0.38)) :
          0;
      const contentX = cellX + cellPadding;
      const contentY = rowY + cellPadding;
      const contentWidth = dayColumnWidth - (cellPadding * 2) - (badgeWidth > 0 ? badgeWidth + badgeGap : 0);
      const availableHeight = rowHeight - (cellPadding * 2);
      const gap = cellSlots.length >= 4 ? 0.45 : 0.7;
      const cardHeight =
        cellSlots.length > 0 ?
          Math.max(3.6, (availableHeight - (gap * (cellSlots.length - 1))) / cellSlots.length) :
          0;

      if (badgeWidth > 0) {
        drawBusyBadge(
          doc,
          busyLabels[0],
          cellX + dayColumnWidth - cellPadding - badgeWidth,
          rowY + cellPadding,
          badgeWidth
        );
      }

      if (cellSlots.length === 0) {
        drawText(doc, "-", contentX, contentY + 2.2, {
          color: COLOR_BORDER,
          size: 7,
        });
        return;
      }

      cellSlots.forEach((slot, slotIndex) => {
        drawSlotCard(doc, slot, {
          x: contentX,
          y: contentY + (slotIndex * (cardHeight + gap)),
          width: Math.max(12, contentWidth),
          height: cardHeight,
          busy: isBusy,
        });
      });
    });
  });
};

export const exportReplacementSemainierPdf = async (
  options: ExportReplacementSemainierPdfOptions
) => {
  const {weeks} = options;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  await ensurePdfDocumentFont(doc);

  weeks.forEach((week, index) => {
    if (index > 0) {
      doc.addPage();
    }

    drawWeekPage(doc, week, options);
  });

  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`semainier_remplacements_${fileDate}.pdf`);

  return {pageCount: weeks.length};
};
