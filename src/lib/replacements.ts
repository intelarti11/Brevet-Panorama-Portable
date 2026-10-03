export const REPLACEMENT_TIMES = [
  "08h00",
  "08h55",
  "10h10",
  "11h05",
  "13h30",
  "14h25",
  "15h35",
] as const;

export const REPLACEMENT_DAYS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
] as const;

export type ReplacementTime = (typeof REPLACEMENT_TIMES)[number];
export type ReplacementDay = (typeof REPLACEMENT_DAYS)[number];

export interface ReplacementSlot {
  id: string;
  weekKey: string;
  date: string;
  dayIdx: number;
  dayLabel: string;
  slotIdx: number;
  startTime: ReplacementTime;
  className: string;
  absentProfessor: string;
  subject: string;
  room: string;
  sourceStartTime: string;
  sourceDurationSlots: number;
  sourceRow: number;
}

export interface ReplacementWeekDocument {
  weekKey: string;
  slots: ReplacementSlot[];
  slotCount: number;
  importedByEmail?: string | null;
  importedAt?: unknown;
  sourceFileName?: string | null;
}

export interface ReplacementMetaDocument {
  slotCount: number;
  weekCount: number;
  updatedByEmail?: string | null;
  updatedAt?: unknown;
  sourceFileName?: string | null;
}

export interface ReplacementImportParseResult {
  slots: ReplacementSlot[];
  validRows: number;
  skippedRows: number;
  weekKeys: string[];
}

export interface ParsedIcsBusySlot {
  weekKey: string;
  dayIdx: number;
  slotIdx: number;
  slotCount: number;
  label: string;
}

export interface PossibleReplacement extends ReplacementSlot {}

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  timeZone: "UTC",
});

const PARIS_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");

const normalizeHeaderKey = (value: string | null | undefined) =>
  normalizeText(value).replace(/[^a-z0-9]/g, "");

const safeIdSegment = (value: string) =>
  normalizeHeaderKey(value).slice(0, 48) || "x";

const pad = (value: number) => String(value).padStart(2, "0");

const isoDateFromUtcDate = (value: Date) =>
  `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;

const parseFrDate = (value: string) => {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
};

const mondayOfWeekUtc = (value: Date) => {
  const day = (value.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - day);
  return monday;
};

const mondayKeyFromLocalYmd = (year: number, month: number, day: number) => {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayIndex = (noonUtc.getUTCDay() + 6) % 7;
  const monday = new Date(noonUtc);
  monday.setUTCDate(monday.getUTCDate() - dayIndex);
  return isoDateFromUtcDate(monday);
};

const stripByteOrderMark = (value: string) => value.replace(/^\uFEFF/, "");

const detectDelimiter = (line: string) => {
  const semicolonCount = (line.match(/;/g) ?? []).length;
  const commaCount = (line.match(/,/g) ?? []).length;
  const tabCount = (line.match(/\t/g) ?? []).length;

  if (tabCount > 0 && tabCount >= semicolonCount && tabCount >= commaCount) {
    return "\t";
  }

  return semicolonCount >= commaCount ? ";" : ",";
};

const parseDelimitedRows = (text: string) => {
  const normalizedText = stripByteOrderMark(text);
  const rows: string[][] = [];
  const delimiter = detectDelimiter(
    normalizedText.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ""
  );

  let index = 0;
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const pushRow = () => {
    rows.push(currentRow);
    currentRow = [];
  };

  while (index < normalizedText.length) {
    const char = normalizedText[index++];

    if (inQuotes) {
      if (char === "\"") {
        if (normalizedText[index] === "\"") {
          currentField += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === "\n") {
      pushField();
      pushRow();
    } else if (char !== "\r") {
      currentField += char;
    }
  }

  pushField();
  pushRow();

  if (rows.length > 0 && rows.at(-1)?.every((field) => normalizeText(field) === "")) {
    rows.pop();
  }

  return rows;
};

const mapCsvHeaders = (headerRow: string[]) => {
  const map = {
    date: -1,
    day: -1,
    startTime: -1,
    className: -1,
    duration: -1,
    professor: -1,
    subject: -1,
    room: -1,
    alreadyHandled: -1,
  };

  headerRow.forEach((header, index) => {
    const key = normalizeHeaderKey(header);

    if (key.includes("date")) {
      map.date = index;
    } else if (key === "jour" || key.startsWith("jour")) {
      map.day = index;
    } else if (key === "debut" || key === "debutheure" || key === "heuredebut") {
      map.startTime = index;
    } else if (
      key === "classe" ||
      key === "classegroupe" ||
      key === "groupes" ||
      key === "groupe"
    ) {
      map.className = index;
    } else if (key.startsWith("duree")) {
      map.duration = index;
    } else if (key.includes("prof")) {
      map.professor = index;
    } else if (key.includes("mati")) {
      map.subject = index;
    } else if (key.includes("salle")) {
      map.room = index;
    } else if (key.includes("donn")) {
      map.alreadyHandled = index;
    }
  });

  return map;
};

const parseDurationToSlots = (value: string | null | undefined) => {
  const raw = (value ?? "").toString().trim().toLowerCase();
  if (!raw) {
    return 1;
  }

  let minutes = 0;
  if (raw.includes("h")) {
    const [hours, mins = "0"] = raw.split("h");
    minutes = (Number.parseInt(hours, 10) || 0) * 60 + (Number.parseInt(mins, 10) || 0);
  } else if (raw.includes(":")) {
    const [hours, mins = "0"] = raw.split(":");
    minutes = (Number.parseInt(hours, 10) || 0) * 60 + (Number.parseInt(mins, 10) || 0);
  } else {
    const numericValue = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
    minutes = Number.isNaN(numericValue) ? 0 : numericValue;
  }

  if (!minutes) {
    minutes = 60;
  }

  return Math.max(1, Math.ceil(minutes / 60));
};

const getUtcWeekdayLabel = (value: Date) =>
  DAY_FORMATTER.format(value).toLowerCase() as ReplacementDay;

const buildReplacementSlotId = (
  weekKey: string,
  dayIdx: number,
  slotIdx: number,
  className: string,
  absentProfessor: string,
  subject: string
) =>
  [
    weekKey,
    pad(dayIdx),
    pad(slotIdx),
    safeIdSegment(className),
    safeIdSegment(absentProfessor),
    safeIdSegment(subject),
  ].join("__");

export const parseReplacementCsv = (text: string): ReplacementImportParseResult => {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) {
    return {
      slots: [],
      validRows: 0,
      skippedRows: 0,
      weekKeys: [],
    };
  }

  const headerMap = mapCsvHeaders(rows[0]);
  const requiredFields = ["date", "startTime", "className"] as const;
  const missing = requiredFields.some((field) => headerMap[field] < 0);
  if (missing) {
    return {
      slots: [],
      validRows: 0,
      skippedRows: rows.length - 1,
      weekKeys: [],
    };
  }

  let validRows = 0;
  let skippedRows = 0;
  const slots: ReplacementSlot[] = [];
  const weekKeys = new Set<string>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rawDate = (row[headerMap.date] ?? "").toString().trim();
    const rawDay = headerMap.day >= 0 ? normalizeText(row[headerMap.day]) : "";
    const rawStartTime = (row[headerMap.startTime] ?? "").toString().trim();
    const rawClassName = (row[headerMap.className] ?? "").toString().trim();
    const rawProfessor =
      headerMap.professor >= 0 ? (row[headerMap.professor] ?? "").toString().trim() : "";
    const rawDuration =
      headerMap.duration >= 0 ? (row[headerMap.duration] ?? "").toString().trim() : "";
    const rawSubject =
      headerMap.subject >= 0 ? (row[headerMap.subject] ?? "").toString().trim() : "";
    const rawRoom = headerMap.room >= 0 ? (row[headerMap.room] ?? "").toString().trim() : "";
    const rawAlreadyHandled =
      headerMap.alreadyHandled >= 0 ?
        (row[headerMap.alreadyHandled] ?? "").toString().trim() :
        "";

    const parsedDate = parseFrDate(rawDate);
    const slotIdx = REPLACEMENT_TIMES.indexOf(rawStartTime as ReplacementTime);
    const normalizedDayFromDate = parsedDate ? getUtcWeekdayLabel(parsedDate) : "";
    const dayLabel = rawDay || normalizedDayFromDate;
    const dayIdx = REPLACEMENT_DAYS.indexOf(dayLabel as ReplacementDay);
    const durationSlots = parseDurationToSlots(rawDuration);

    if (!parsedDate || dayIdx < 0 || slotIdx < 0 || !rawClassName || rawAlreadyHandled) {
      skippedRows += 1;
      continue;
    }

    const weekKey = isoDateFromUtcDate(mondayOfWeekUtc(parsedDate));
    const dateIso = isoDateFromUtcDate(parsedDate);
    weekKeys.add(weekKey);

    for (let offset = 0; offset < durationSlots; offset += 1) {
      const expandedSlotIdx = slotIdx + offset;
      const expandedTime = REPLACEMENT_TIMES[expandedSlotIdx];
      if (!expandedTime) {
        break;
      }

      slots.push({
        id: buildReplacementSlotId(
          weekKey,
          dayIdx,
          expandedSlotIdx,
          rawClassName,
          rawProfessor,
          rawSubject
        ),
        weekKey,
        date: dateIso,
        dayIdx,
        dayLabel: REPLACEMENT_DAYS[dayIdx],
        slotIdx: expandedSlotIdx,
        startTime: expandedTime,
        className: rawClassName,
        absentProfessor: rawProfessor,
        subject: rawSubject,
        room: rawRoom,
        sourceStartTime: rawStartTime,
        sourceDurationSlots: durationSlots,
        sourceRow: rowIndex + 1,
      });
    }

    validRows += 1;
  }

  return {
    slots,
    validRows,
    skippedRows,
    weekKeys: Array.from(weekKeys).sort(),
  };
};

const unfoldIcsLines = (text: string) => {
  const sourceLines = text.replace(/\r/g, "\n").split("\n");
  const output: string[] = [];

  sourceLines.forEach((line) => {
    if ((line.startsWith(" ") || line.startsWith("\t")) && output.length > 0) {
      output[output.length - 1] += line.slice(1);
      return;
    }

    output.push(line);
  });

  return output;
};

const getParisTimeLabel = (value: Date) =>
  PARIS_TIME_FORMATTER.format(value).replace(":", "h");

const parseIcsDateTime = (value: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value ?? "");
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hours: Number(match[4]),
    minutes: Number(match[5]),
    seconds: Number(match[6]),
    isUtc: match[7] === "Z",
  };
};

export const parseReplacementIcs = (text: string) => {
  const lines = unfoldIcsLines(text);
  const rawEvents: Array<Record<string, string | boolean>> = [];
  let currentEvent: Record<string, string | boolean> | null = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      return;
    }

    if (line === "END:VEVENT") {
      if (
        currentEvent?.DTSTART &&
        currentEvent?.DTEND &&
        currentEvent.DATE_ONLY !== true
      ) {
        rawEvents.push(currentEvent);
      }
      currentEvent = null;
      return;
    }

    if (!currentEvent) {
      return;
    }

    if (line.startsWith("DTSTART")) {
      if (line.includes("VALUE=DATE")) {
        currentEvent.DATE_ONLY = true;
        return;
      }
      currentEvent.DTSTART = line.split(":").slice(1).join(":");
      return;
    }

    if (line.startsWith("DTEND")) {
      if (line.includes("VALUE=DATE")) {
        currentEvent.DATE_ONLY = true;
        return;
      }
      currentEvent.DTEND = line.split(":").slice(1).join(":");
      return;
    }

    if (line.startsWith("SUMMARY")) {
      currentEvent.SUMMARY = line.split(":").slice(1).join(":");
    }
  });

  const parsedEvents: ParsedIcsBusySlot[] = [];

  rawEvents.forEach((event) => {
    const startParts = parseIcsDateTime(String(event.DTSTART ?? ""));
    const endParts = parseIcsDateTime(String(event.DTEND ?? ""));
    if (!startParts || !endParts) {
      return;
    }

    const weekKey = mondayKeyFromLocalYmd(startParts.year, startParts.month, startParts.day);
    const dayIdx =
      (new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day, 12)).getUTCDay() + 6) %
      7;
    if (dayIdx < 0 || dayIdx > 4) {
      return;
    }

    let startTimeLabel = "";
    if (startParts.isUtc) {
      startTimeLabel = getParisTimeLabel(
        new Date(
          Date.UTC(
            startParts.year,
            startParts.month - 1,
            startParts.day,
            startParts.hours,
            startParts.minutes,
            startParts.seconds
          )
        )
      );
    } else {
      startTimeLabel = `${pad(startParts.hours)}h${pad(startParts.minutes)}`;
    }

    const slotIdx = REPLACEMENT_TIMES.indexOf(startTimeLabel as ReplacementTime);
    if (slotIdx < 0) {
      return;
    }

    const startMinutes = startParts.hours * 60 + startParts.minutes;
    const endMinutes =
      endParts.hours * 60 +
      endParts.minutes +
      (endParts.year !== startParts.year ||
      endParts.month !== startParts.month ||
      endParts.day !== startParts.day ?
        24 * 60 :
        0);
    const slotCount = Math.max(1, Math.ceil(Math.max(1, endMinutes - startMinutes) / 60));

    const summary = String(event.SUMMARY ?? "").trim();
    const summaryParts = summary.split(" - ");
    const label =
      summaryParts.length > 1 ? summaryParts[summaryParts.length - 1].trim() : summary;

    parsedEvents.push({
      weekKey,
      dayIdx,
      slotIdx,
      slotCount,
      label,
    });
  });

  return parsedEvents;
};

export const buildBusySlotKey = (weekKey: string, dayIdx: number, slotIdx: number) =>
  `${weekKey}|${dayIdx}|${slotIdx}`;

export const buildBusySlotSet = (events: ParsedIcsBusySlot[]) => {
  const busySlots = new Set<string>();

  events.forEach((event) => {
    for (let offset = 0; offset < event.slotCount; offset += 1) {
      busySlots.add(buildBusySlotKey(event.weekKey, event.dayIdx, event.slotIdx + offset));
    }
  });

  return busySlots;
};

export const groupReplacementSlotsByWeek = (slots: ReplacementSlot[]) => {
  const weekMap = new Map<string, ReplacementSlot[]>();

  slots.forEach((slot) => {
    const current = weekMap.get(slot.weekKey) ?? [];
    current.push(slot);
    weekMap.set(slot.weekKey, current);
  });

  return Array.from(weekMap.entries())
    .sort(([weekA], [weekB]) => weekA.localeCompare(weekB))
    .map(([weekKey, weekSlots]) => ({
      weekKey,
      slots: weekSlots.sort(
        (slotA, slotB) =>
          slotA.dayIdx - slotB.dayIdx ||
          slotA.slotIdx - slotB.slotIdx ||
          slotA.className.localeCompare(slotB.className)
      ),
      slotCount: weekSlots.length,
    }));
};

export const flattenReplacementWeeks = (weeks: ReplacementWeekDocument[]) =>
  weeks.flatMap((week) => week.slots ?? []);

export const sortPossibleReplacements = (slots: PossibleReplacement[]) =>
  [...slots].sort(
    (slotA, slotB) =>
      slotA.date.localeCompare(slotB.date) ||
      slotA.slotIdx - slotB.slotIdx ||
      slotA.className.localeCompare(slotB.className) ||
      slotA.absentProfessor.localeCompare(slotB.absentProfessor)
  );

export const buildPossibleReplacements = (
  weeks: ReplacementWeekDocument[],
  busySlots: Set<string>,
  searchTerm = ""
) => {
  const normalizedSearch = normalizeText(searchTerm);
  const allSlots = flattenReplacementWeeks(weeks);

  return sortPossibleReplacements(
    allSlots.filter((slot) => {
      if (busySlots.has(buildBusySlotKey(slot.weekKey, slot.dayIdx, slot.slotIdx))) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = normalizeText(
        `${slot.className} ${slot.absentProfessor} ${slot.subject} ${slot.room}`
      );
      return searchable.includes(normalizedSearch);
    })
  );
};

export const buildReplacementMailBody = (slots: PossibleReplacement[]) => {
  if (slots.length === 0) {
    return "";
  }

  const greeting = "Bonjour Mme Cauquil,";

  const lines = sortPossibleReplacements(slots).map((slot) => {
    const professorPart = slot.absentProfessor ? ` (${slot.absentProfessor})` : "";
    return `- ${capitalizeFirst(slot.dayLabel)} ${formatIsoDateToFr(slot.date)} a ${slot.startTime} : ${slot.className}${professorPart}.`;
  });

  if (lines.length === 1) {
    return `${greeting}\n\nJe souhaiterais assurer le remplacement suivant :\n${lines[0]}\n\nBien cordialement,`;
  }

  return `${greeting}\n\nJe souhaiterais assurer les remplacements suivants :\n${lines.join("\n")}\n\nBien cordialement,`;
};

export const formatIsoDateToFr = (value: string) => {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
};

export const capitalizeFirst = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
