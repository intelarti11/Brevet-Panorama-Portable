"use client";

import {Fragment, useEffect, useMemo, useRef, useState, type DragEvent} from "react";
import Link from "next/link";
import {getAuth, onAuthStateChanged, type User} from "@/lib/local/session";
import {collection, doc, getDoc, getDocs} from "@/lib/local/store";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  FileUp,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import {app, db} from "@/lib/firebase";
import {
  buildBusySlotSet,
  buildBusySlotKey,
  buildPossibleReplacements,
  buildReplacementMailBody,
  capitalizeFirst,
  flattenReplacementWeeks,
  formatIsoDateToFr,
  parseReplacementIcs,
  REPLACEMENT_DAYS,
  REPLACEMENT_TIMES,
  type ParsedIcsBusySlot,
  type PossibleReplacement,
  type ReplacementMetaDocument,
  type ReplacementSlot,
  type ReplacementWeekDocument,
} from "@/lib/replacements";
import {exportReplacementSemainierPdf} from "@/lib/replacement-semainier-pdf";
import {Button} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {ErrorDisplay} from "@/components/ui/error-display";
import {FullScreenLoader} from "@/components/ui/full-screen-loader";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  });

const ICS_CACHE_KEY_PREFIX = "replacement-consultation-ics";

const getIcsCacheKey = (userId: string) => `${ICS_CACHE_KEY_PREFIX}:${userId}`;

const isParsedIcsBusySlot = (value: unknown): value is ParsedIcsBusySlot => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.weekKey === "string" &&
    typeof candidate.dayIdx === "number" &&
    typeof candidate.slotIdx === "number" &&
    typeof candidate.slotCount === "number" &&
    typeof candidate.label === "string"
  );
};

const readCachedIcs = (userId: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getIcsCacheKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as {
      fileName?: unknown;
      busySlots?: unknown;
    };

    if (
      typeof parsed.fileName !== "string" ||
      !Array.isArray(parsed.busySlots) ||
      !parsed.busySlots.every(isParsedIcsBusySlot)
    ) {
      window.localStorage.removeItem(getIcsCacheKey(userId));
      return null;
    }

    return {
      fileName: parsed.fileName,
      busySlots: parsed.busySlots,
    };
  } catch {
    window.localStorage.removeItem(getIcsCacheKey(userId));
    return null;
  }
};

const writeCachedIcs = (userId: string, fileName: string, busySlots: ParsedIcsBusySlot[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getIcsCacheKey(userId),
    JSON.stringify({
      fileName,
      busySlots,
      savedAt: new Date().toISOString(),
    })
  );
};

const clearCachedIcs = (userId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getIcsCacheKey(userId));
};

const sortWeeks = (weeks: ReplacementWeekDocument[]) =>
  [...weeks].sort((weekA, weekB) => weekA.weekKey.localeCompare(weekB.weekKey));

const mapWeekDocument = (id: string, data: Record<string, unknown>): ReplacementWeekDocument => {
  const slots = (Array.isArray(data.slots) ? data.slots : []) as ReplacementSlot[];
  return {
    weekKey: typeof data.weekKey === "string" ? data.weekKey : id,
    slots,
    slotCount: typeof data.slotCount === "number" ? data.slotCount : slots.length,
    importedAt: data.importedAt,
    importedByEmail:
      typeof data.importedByEmail === "string" ? data.importedByEmail : null,
    sourceFileName:
      typeof data.sourceFileName === "string" ? data.sourceFileName : null,
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");

const matchesSearchTerm = (slot: ReplacementSlot, searchTerm: string) => {
  const normalizedSearch = normalizeSearchValue(searchTerm);
  if (!normalizedSearch) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      slot.className,
      slot.absentProfessor,
      slot.subject,
      slot.room,
      slot.startTime,
      slot.date,
      slot.dayLabel,
    ].join(" ")
  );

  return searchable.includes(normalizedSearch);
};

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
  return `${capitalizeFirst(REPLACEMENT_DAYS[dayIdx])} ${formatIsoDateToFr(
    toIsoDate(currentDate)
  )}`;
};

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

export default function ReplacementConsultationPage() {
  const {toast} = useToast();
  const dragDepthRef = useRef(0);
  const icsInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [canImportReplacements, setCanImportReplacements] = useState(false);
  const [weeks, setWeeks] = useState<ReplacementWeekDocument[]>([]);
  const [meta, setMeta] = useState<ReplacementMetaDocument | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [icsFileName, setIcsFileName] = useState("");
  const [icsBusySlots, setIcsBusySlots] = useState<ParsedIcsBusySlot[]>([]);
  const [icsError, setIcsError] = useState<string | null>(null);
  const [isReadingIcs, setIsReadingIcs] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState("semainier");
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [isDraggingIcs, setIsDraggingIcs] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    const auth = getAuth(app);
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      const isMainAdmin = currentUser?.email === "local-user@localhost";
      setCanImportReplacements(isMainAdmin);

      if (currentUser && !isMainAdmin) {
        currentUser.getIdTokenResult().then((tokenResult) => {
          if (active && auth.currentUser === currentUser) {
            setCanImportReplacements(tokenResult.claims.replacementImporter === true);
          }
        }).catch(() => {
          // Keep import hidden when the user's role cannot be verified.
        });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loadReplacementData = async () => {
    setDataLoading(true);
    setDataError(null);

    try {
      const [weeksSnapshot, metaSnapshot] = await Promise.all([
        getDocs(collection(db, "replacementWeeks")),
        getDoc(doc(db, "replacementMeta", "current")),
      ]);

      const nextWeeks = sortWeeks(
        weeksSnapshot.docs.map((snapshot) =>
          mapWeekDocument(snapshot.id, snapshot.data() as Record<string, unknown>)
        )
      );

      setWeeks(nextWeeks);
      setMeta(
        metaSnapshot.exists() ?
          (metaSnapshot.data() as ReplacementMetaDocument) :
          null
      );
    } catch (error) {
      const message =
        error instanceof Error ?
          error.message :
          "Impossible de charger les remplacements.";
      setDataError(message);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setDataLoading(false);
      return;
    }

    loadReplacementData();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const cachedIcs = readCachedIcs(user.uid);
    if (!cachedIcs) {
      return;
    }

    setIcsBusySlots(cachedIcs.busySlots);
    setIcsFileName(cachedIcs.fileName);
    setIcsError(null);
    setActiveView("semainier");
  }, [user]);

  const handleIcsSelected = async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsReadingIcs(true);
    setIcsError(null);
    try {
      const text = await readFileAsText(file);
      const parsedSlots = parseReplacementIcs(text);

      if (parsedSlots.length === 0) {
        throw new Error(
          "Aucun evenement .ics n'a pu etre associe aux creneaux EDT attendus."
        );
      }

      setSelectedIds([]);
      setIcsBusySlots(parsedSlots);
      setIcsFileName(file.name);
      setActiveView("semainier");
      if (user) {
        writeCachedIcs(user.uid, file.name, parsedSlots);
      }
      toast({
        title: "ICS charge",
        description: `${parsedSlots.length} evenement(s) pris en compte.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Lecture du fichier .ics impossible.";
      setIcsError(message);
    } finally {
      setIsReadingIcs(false);
    }
  };

  const handleClearIcs = () => {
    setSelectedIds([]);
    setIcsBusySlots([]);
    setIcsFileName("");
    setIcsError(null);
    if (icsInputRef.current) {
      icsInputRef.current.value = "";
    }
    if (user) {
      clearCachedIcs(user.uid);
    }
    toast({
      title: "ICS retire",
      description: "La consultation repasse sans contraintes de calendrier.",
    });
  };

  const handleIcsDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingIcs(true);
  };

  const handleIcsDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingIcs(true);
  };

  const handleIcsDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingIcs(false);
    }
  };

  const handleIcsDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingIcs(false);

    const file = event.dataTransfer.files?.[0] ?? null;
    if (!file) {
      return;
    }

    await handleIcsSelected(file);
  };

  const busySlotSet = useMemo(() => buildBusySlotSet(icsBusySlots), [icsBusySlots]);
  const busySlotLabelMap = useMemo(() => {
    const labelMap = new Map<string, string[]>();

    icsBusySlots.forEach((event) => {
      for (let offset = 0; offset < event.slotCount; offset += 1) {
        const key = buildBusySlotKey(event.weekKey, event.dayIdx, event.slotIdx + offset);
        const current = labelMap.get(key) ?? [];
        if (!current.includes(event.label)) {
          current.push(event.label);
        }
        labelMap.set(key, current);
      }
    });

    return labelMap;
  }, [icsBusySlots]);

  const allPossibleReplacements = useMemo(
    () => buildPossibleReplacements(weeks, busySlotSet),
    [weeks, busySlotSet]
  );

  const filteredPossibleReplacements = useMemo(
    () => buildPossibleReplacements(weeks, busySlotSet, searchTerm),
    [weeks, busySlotSet, searchTerm]
  );

  const possibleReplacementMap = useMemo(
    () => new Map(allPossibleReplacements.map((slot) => [slot.id, slot])),
    [allPossibleReplacements]
  );

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => possibleReplacementMap.has(id));
      return next.length === current.length ? current : next;
    });
  }, [possibleReplacementMap]);

  const filteredWeeks = useMemo(
    () =>
      weeks
        .map((week) => {
          const filteredSlots = week.slots.filter((slot) => matchesSearchTerm(slot, searchTerm));
          return {
            ...week,
            slots: filteredSlots,
            slotCount: filteredSlots.length,
          };
        })
        .filter((week) => week.slots.length > 0),
    [weeks, searchTerm]
  );

  useEffect(() => {
    if (filteredWeeks.length === 0) {
      if (selectedWeekKey !== null) {
        setSelectedWeekKey(null);
      }
      return;
    }

    if (!selectedWeekKey || !filteredWeeks.some((week) => week.weekKey === selectedWeekKey)) {
      setSelectedWeekKey(filteredWeeks[0].weekKey);
    }
  }, [filteredWeeks, selectedWeekKey]);

  const currentWeekIndex = selectedWeekKey ?
    filteredWeeks.findIndex((week) => week.weekKey === selectedWeekKey) :
    -1;
  const currentWeek = currentWeekIndex >= 0 ? filteredWeeks[currentWeekIndex] : null;
  const currentWeekCellMap = useMemo(
    () => buildCellMap(currentWeek?.slots ?? []),
    [currentWeek]
  );

  const selectedReplacements = useMemo(() => {
    return selectedIds
      .map((id) => possibleReplacementMap.get(id))
      .filter((slot): slot is PossibleReplacement => Boolean(slot));
  }, [possibleReplacementMap, selectedIds]);

  const mailBody = useMemo(
    () => buildReplacementMailBody(selectedReplacements),
    [selectedReplacements]
  );

  const importedSlotCount = useMemo(() => flattenReplacementWeeks(weeks).length, [weeks]);
  const importedWeekCount = weeks.length;
  const icsWeekCount = useMemo(
    () => new Set(icsBusySlots.map((slot) => slot.weekKey)).size,
    [icsBusySlots]
  );
  const icsCoverage = useMemo(() => {
    if (icsBusySlots.length === 0) {
      return null;
    }

    const dates = icsBusySlots
      .map((slot) => toIsoDate(addUtcDays(parseIsoDateUtc(slot.weekKey), slot.dayIdx)))
      .sort();

    return {
      start: dates[0],
      end: dates[dates.length - 1],
    };
  }, [icsBusySlots]);
  const hasIcsData = icsBusySlots.length > 0;
  const searchResultsLabel = hasIcsData ?
    `${filteredPossibleReplacements.length} resultat(s) compatibles` :
    `${filteredPossibleReplacements.length} resultat(s) affiches`;
  const allFilteredSelected =
    filteredPossibleReplacements.length > 0 &&
    filteredPossibleReplacements.every((slot) => selectedIdSet.has(slot.id));
  const exportableWeeks = filteredWeeks;

  const icsCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FileText className="h-5 w-5 text-primary" />
          Charger mon emploi du temps (.ics)
        </CardTitle>
        <CardDescription>
          Export Pronote recommande. Le mapping reste strict sur les sept
          creneaux de la journee.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            ref={icsInputRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={(event) => handleIcsSelected(event.target.files?.[0] ?? null)}
            disabled={isReadingIcs}
            className="max-w-xl"
          />
          <Button
            variant="outline"
            onClick={loadReplacementData}
            disabled={dataLoading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualiser les creneaux importes
          </Button>
          {hasIcsData ? (
            <Button
              variant="outline"
              onClick={handleClearIcs}
              disabled={isReadingIcs}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Retirer l&apos;ICS
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Vous pouvez aussi glisser-deposer votre fichier .ics n&apos;importe ou sur la page.
        </p>

        {isReadingIcs && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture du fichier .ics...
          </div>
        )}

        {icsError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {icsError}
          </div>
        )}

        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">
              <CalendarDays className="mr-1 h-3 w-3" />
              {meta.weekCount} semaine(s)
            </Badge>
            <Badge variant="outline">
              <Users className="mr-1 h-3 w-3" />
              {meta.slotCount} creneau(x)
            </Badge>
            {meta.updatedByEmail ? (
              <Badge variant="outline">Importe par {meta.updatedByEmail}</Badge>
            ) : null}
            {meta.sourceFileName ? (
              <Badge variant="outline">{meta.sourceFileName}</Badge>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const toggleSelected = (slotId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, slotId]));
      }

      return current.filter((id) => id !== slotId);
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...filteredPossibleReplacements.map((slot) => slot.id)]));
      }

      const filteredIds = new Set(filteredPossibleReplacements.map((slot) => slot.id));
      return current.filter((id) => !filteredIds.has(id));
    });
  };

  const handleCopyMail = async () => {
    if (!mailBody.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(mailBody);
      toast({
        title: "Mail copie",
        description: "Le texte a ete copie dans le presse-papiers.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Veuillez copier le texte manuellement.",
      });
    }
  };

  const handleExportSemainierPdf = async () => {
    if (exportableWeeks.length === 0) {
      toast({
        variant: "destructive",
        title: "Export impossible",
        description: "Aucune semaine à exporter avec le filtre actuel.",
      });
      return;
    }

    setIsExportingPdf(true);

    try {
      const {pageCount} = await exportReplacementSemainierPdf({
        weeks: exportableWeeks,
        busySlotSet,
        busySlotLabelMap,
        icsFileName,
        hasIcsData,
      });

      toast({
        title: "Export PDF terminé",
        description: `${pageCount} page(s) générée(s) en format A4 paysage.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export impossible",
        description:
          error instanceof Error ? error.message : "Le PDF n'a pas pu être généré.",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (authLoading) {
    return <FullScreenLoader text="Verification de la session..." />;
  }

  if (!user) {
    return (
      <ErrorDisplay
        asCard
        title="Connexion requise"
        message="Connectez-vous pour consulter les remplacements disponibles."
      />
    );
  }

  if (dataLoading) {
    return <FullScreenLoader text="Chargement des creneaux importes..." />;
  }

  if (dataError) {
    return (
      <ErrorDisplay
        message={dataError}
        onRetry={loadReplacementData}
      />
    );
  }

  return (
    <div
      onDragOver={handleIcsDragOver}
      onDragEnter={handleIcsDragEnter}
      onDragLeave={handleIcsDragLeave}
      onDrop={handleIcsDrop}
      className={cn(
        "relative space-y-6 rounded-xl p-1 transition-colors md:p-4",
        isDraggingIcs && "bg-primary/5"
      )}
    >
      {isDraggingIcs ? (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-xl border-2 border-dashed border-primary bg-background/75" />
      ) : null}

      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Consultation des Remplacements
        </h1>
        <p className="text-muted-foreground">
          Les creneaux disponibles viennent du CSV EDT/Pronote importe par les
          responsables. Chargez ensuite votre fichier .ics Pronote pour ne
          voir que les remplacements compatibles avec votre emploi du temps.
        </p>
        {canImportReplacements ? (
          <div className="flex flex-col items-start gap-2 pt-2">
            <Button asChild>
              <Link href="/dashboard/remplacements/import">
                <FileUp className="mr-2 h-4 w-4" />
                Importer les remplacements
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Collez le tableau EDT/Pronote des cours à remplacer ou importez un fichier CSV.
              Votre emploi du temps personnel se charge séparément au format ICS.
            </p>
          </div>
        ) : null}
      </header>

      {!hasIcsData ? icsCard : null}

      <Card>
        <Tabs value={activeView} onValueChange={setActiveView} className="space-y-0">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Visualisation et selection</CardTitle>
                <CardDescription>
                  Le semainier et la liste partagent la meme selection pour la creation du
                  mail.
                </CardDescription>
              </div>
              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Rechercher une classe, un prof, une salle..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <TabsList className="grid h-auto w-full max-w-xl grid-cols-3">
                <TabsTrigger value="semainier" className="gap-2 hover:bg-primary/10 hover:text-primary">
                  <LayoutGrid className="h-4 w-4" />
                  Semainier
                </TabsTrigger>
                <TabsTrigger value="liste" className="gap-2 hover:bg-primary/10 hover:text-primary">
                  <List className="h-4 w-4" />
                  Liste
                </TabsTrigger>
                <TabsTrigger value="mail" className="gap-2 hover:bg-primary/10 hover:text-primary">
                  <Mail className="h-4 w-4" />
                  Creation du mail
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportSemainierPdf}
                  disabled={isExportingPdf || exportableWeeks.length === 0}
                >
                  {isExportingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isExportingPdf ? "Export..." : "Exporter en PDF"}
                </Button>
                <Badge variant="outline">{selectedReplacements.length} selection(s)</Badge>
                {searchTerm ? (
                  <Badge variant="outline">{searchResultsLabel}</Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            <TabsContent value="semainier" className="space-y-4">
              {filteredWeeks.length === 0 || !currentWeek ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  Aucun creneau ne correspond au filtre actuel.
                </div>
              ) : (
                <>
                  {!hasIcsData ? (
                    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
                      Aucun fichier .ics charge pour le moment. Le semainier affiche donc tous les
                      creneaux importes et peut deja etre exporte en PDF.
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{getWeekLabel(currentWeek.weekKey)}</p>
                      <p className="text-sm text-muted-foreground">
                        Semaine {currentWeekIndex + 1} sur {filteredWeeks.length} -{" "}
                        {currentWeek.slotCount} creneau(x) visible(s)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedWeekKey(filteredWeeks[Math.max(0, currentWeekIndex - 1)]?.weekKey ?? null)
                        }
                        disabled={currentWeekIndex <= 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Semaine precedente
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedWeekKey(
                            filteredWeeks[Math.min(filteredWeeks.length - 1, currentWeekIndex + 1)]?.weekKey ?? null
                          )
                        }
                        disabled={currentWeekIndex < 0 || currentWeekIndex >= filteredWeeks.length - 1}
                      >
                        Semaine suivante
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-2 border-emerald-200 bg-emerald-50 text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {hasIcsData ? "Creneaux selectionnables" : "Creneaux importes"}
                    </Badge>
                    {hasIcsData ? (
                      <Badge variant="outline" className="gap-2 border-rose-200 bg-rose-50 text-rose-700">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Creneaux occupes dans l&apos;ICS
                      </Badge>
                    ) : null}
                  </div>

                  <ScrollArea className="w-full rounded-md border">
                    <div className="grid min-w-[1100px] grid-cols-[88px_repeat(5,minmax(180px,1fr))]">
                      <div className="border-b bg-muted/40 p-3" />
                      {REPLACEMENT_DAYS.map((dayLabel, dayIdx) => (
                        <div
                          key={dayLabel}
                          className="border-b border-l bg-muted/40 p-3 text-sm font-semibold"
                        >
                          {getDayColumnLabel(currentWeek.weekKey, dayIdx)}
                        </div>
                      ))}

                      {REPLACEMENT_TIMES.map((timeLabel, slotIdx) => (
                        <Fragment key={timeLabel}>
                          <div
                            className={cn(
                              "bg-muted/20 p-3 text-xs font-semibold text-muted-foreground",
                              slotIdx === 3 ? "border-b-4 border-b-border" : "border-b"
                            )}
                          >
                            {timeLabel}
                          </div>
                          {REPLACEMENT_DAYS.map((dayLabel, dayIdx) => {
                            const cellSlots =
                              currentWeekCellMap.get(`${dayIdx}-${slotIdx}`) ?? [];
                            const busyKey = buildBusySlotKey(currentWeek.weekKey, dayIdx, slotIdx);
                            const isBusy = busySlotSet.has(busyKey);
                            const busyLabels = busySlotLabelMap.get(busyKey) ?? [];
                            const cellStateClass =
                              cellSlots.length === 0 ?
                                "bg-background" :
                              isBusy ?
                                "bg-rose-50/80" :
                                "bg-emerald-50/70";

                            return (
                              <div
                                key={`${dayLabel}-${timeLabel}`}
                                className={cn(
                                  "relative min-h-[132px] border-l p-3 align-top",
                                  slotIdx === 3 ? "border-b-4 border-b-border" : "border-b",
                                  cellStateClass
                                )}
                              >
                                {cellSlots.length === 0 ? (
                                  <span className="text-xs text-muted-foreground/70">-</span>
                                ) : (
                                  <div className={cn("space-y-1.5", isBusy && busyLabels.length > 0 && "pr-32")}>
                                    {isBusy && busyLabels.length > 0 ? (
                                      <div
                                        className="absolute right-3 top-3 max-w-28 truncate rounded-full border border-rose-200 bg-white/90 px-2 py-1 text-[11px] font-medium text-rose-700 shadow-sm"
                                        title={busyLabels.join(", ")}
                                      >
                                        ⛔ {busyLabels[0]}
                                      </div>
                                    ) : null}
                                    {cellSlots.map((slot) => {
                                      const checked = selectedIdSet.has(slot.id);
                                      const selectable = !busySlotSet.has(
                                        buildBusySlotKey(slot.weekKey, slot.dayIdx, slot.slotIdx)
                                      );

                                      return (
                                        <button
                                          key={slot.id}
                                          type="button"
                                          disabled={!selectable}
                                          onClick={() => toggleSelected(slot.id, !checked)}
                                          className={cn(
                                            "w-full rounded-md border px-2 py-[7px] text-left text-[11px] transition-colors",
                                            selectable ?
                                              checked ?
                                                "border-primary bg-primary text-primary-foreground" :
                                                "border-emerald-200 bg-white/90 hover:bg-emerald-100" :
                                              "cursor-not-allowed border-rose-200 bg-white/75 text-muted-foreground"
                                          )}
                                          title={[
                                            slot.className,
                                            slot.absentProfessor ? `Prof absent : ${slot.absentProfessor}` : "",
                                            slot.subject ? `Matiere : ${slot.subject}` : "",
                                            slot.room ? `Salle : ${getReadableRoomLabel(slot.room)}` : "",
                                          ]
                                            .filter(Boolean)
                                            .join("\n")}
                                        >
                                          <span className="flex items-start justify-between gap-2 leading-[1.28]">
                                            <span className="min-w-0 flex-1 truncate font-semibold leading-[1.28]">
                                              {slot.className}
                                            </span>
                                            {slot.room ? (
                                              <span
                                                className="shrink-0 whitespace-nowrap text-[10px] leading-[1.28] opacity-80"
                                                title={getReadableRoomLabel(slot.room)}
                                              >
                                                {getCompactRoomLabel(slot.room)}
                                              </span>
                                            ) : null}
                                          </span>
                                          <span className="block truncate leading-[1.28]">
                                            {slot.absentProfessor || slot.subject || "Sans detail"}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </TabsContent>

            <TabsContent value="liste" className="space-y-4">
              {filteredPossibleReplacements.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  Aucun remplacement possible avec les donnees actuellement chargees.
                </div>
              ) : (
                <>
                  {!hasIcsData ? (
                    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
                      Aucun fichier .ics charge pour le moment. La liste affiche donc tous les
                      creneaux importes.
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={(event) => toggleSelectAll(event.target.checked)}
                              aria-label="Tout selectionner"
                            />
                          </TableHead>
                          <TableHead>Jour</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Heure</TableHead>
                          <TableHead>Classe</TableHead>
                          <TableHead>Prof absent</TableHead>
                          <TableHead>Matiere</TableHead>
                          <TableHead>Salle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPossibleReplacements.map((slot) => {
                          const checked = selectedIdSet.has(slot.id);
                          return (
                            <TableRow key={slot.id} className={checked ? "bg-primary/5" : ""}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) =>
                                    toggleSelected(slot.id, event.target.checked)
                                  }
                                  aria-label={`Selectionner ${slot.className}`}
                                />
                              </TableCell>
                              <TableCell>{capitalizeFirst(slot.dayLabel)}</TableCell>
                              <TableCell>{formatIsoDateToFr(slot.date)}</TableCell>
                              <TableCell>{slot.startTime}</TableCell>
                              <TableCell className="font-medium">{slot.className}</TableCell>
                              <TableCell>{slot.absentProfessor || "-"}</TableCell>
                              <TableCell>{slot.subject || "-"}</TableCell>
                              <TableCell>{slot.room || "-"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="mail" className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold">Proposition de mail</p>
                  <p className="text-sm text-muted-foreground">
                    Le texte se genere automatiquement a partir de vos selections.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleCopyMail}
                  disabled={!mailBody.trim()}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copier le mail
                </Button>
              </div>

              <Textarea
                value={mailBody}
                readOnly
                className="min-h-[220px]"
                placeholder="Selectionnez des remplacements dans le semainier ou la liste."
              />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {hasIcsData ? icsCard : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Creneaux importes</CardDescription>
            <CardTitle className="text-2xl">{importedSlotCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {importedWeekCount} semaine(s) disponibles dans l'application.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Semaines de votre ICS</CardDescription>
            <CardTitle className="text-base leading-6 md:text-lg">
              {icsCoverage ?
                `Du ${formatIsoDateToFr(icsCoverage.start)} au ${formatIsoDateToFr(icsCoverage.end)}` :
                "Aucune periode chargee"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              {icsFileName ? `Fichier charge : ${icsFileName}` : "Aucun fichier .ics charge."}
            </p>
            {icsCoverage ? <p>{icsWeekCount} semaine(s) detectee(s).</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remplacements possibles</CardDescription>
            <CardTitle className="text-2xl">{allPossibleReplacements.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {selectedReplacements.length} selection(s) pour le mail
            {searchTerm ? ` - ${filteredPossibleReplacements.length} resultat(s) affiches` : "."}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
