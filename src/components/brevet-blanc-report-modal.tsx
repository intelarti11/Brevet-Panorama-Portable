"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type ReportConfig } from "./brevet-blanc-report-config-modal";
import { type Student } from "@/app/dashboard/brevet-blanc/voir-notes/page";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "./ui/card";
import {
  Loader2,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import { useBrevetBlancReport } from "@/hooks/use-brevet-blanc-report"; // Import the new hook
import {
  getBrevetConfigForYear,
  calculateBrevetBlancAverage,
  type BrevetConfig,
} from "@/lib/brevet-config";

// --- Data Structures & Constants ---
interface BrevetBlancReportModalProps {
  config: ReportConfig | null;
  students: Student[];
  onOpenChange: (isOpen: boolean) => void;
  availableClasses: string[];
  year: string;
}

const SUCCESS_RATE_CHART_COLORS = {
  admis: "hsl(var(--color-success-hsl))",
  refuse: "hsl(var(--destructive))",
};

const barChartConfig = {
  bb1: { label: "Moyenne BB1", color: "hsl(var(--secondary))" },
  bb2: { label: "Moyenne BB2", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

const successRateChartConfig = {
  Admis: { label: "Admis" },
  Refusé: { label: "Refusé" },
} satisfies ChartConfig;

const getColumnStats = (data: (number | undefined)[]) => {
  const numbers = data.filter(
    (d) => typeof d === "number" && !isNaN(d),
  ) as number[];
  if (numbers.length === 0)
    return {
      mean: undefined,
      median: undefined,
      max: undefined,
      min: undefined,
      range: undefined,
      presentCount: 0,
      totalCount: data.length,
    };

  const sum = numbers.reduce((acc, val) => acc + val, 0);
  const mean = sum / numbers.length;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const max = Math.max(...numbers);
  const min = Math.min(...numbers);
  const range = max - min;

  return {
    mean,
    median,
    max,
    min,
    range,
    presentCount: numbers.length,
    totalCount: data.length,
  };
};

const getMoyenneCellStyle = (moyenne?: number): string => {
  if (moyenne === undefined) return "";
  if (moyenne >= 15) return "bg-green-600/90 text-white";
  if (moyenne >= 10) return "bg-green-400/80 text-black";
  if (moyenne >= 8) return "bg-yellow-400/80 text-black";
  return "bg-red-600/90 text-white";
};

// Tuple for jspdf-autotable fill color
const getMoyenneFillColorTuple = (
  moyenne?: number,
): [number, number, number] | undefined => {
  if (moyenne === undefined) return undefined;
  if (moyenne >= 15) return [22, 163, 74]; // green-600
  if (moyenne >= 10) return [74, 222, 128]; // green-400
  if (moyenne >= 8) return [251, 146, 60]; // orange-400, for yellow-400
  return [220, 38, 38]; // red-600
};

// Tuple for jspdf-autotable text color
const getMoyenneTextColorTuple = (
  moyenne?: number,
): [number, number, number] => {
  if (moyenne !== undefined && moyenne >= 10 && moyenne < 15) return [0, 0, 0]; // black
  if (moyenne !== undefined && moyenne >= 8 && moyenne < 10) return [0, 0, 0]; // black
  return [255, 255, 255]; // white
};

const normalizeNumericValue = (
  value: number | null | undefined,
): number | undefined =>
  typeof value === "number" && !Number.isNaN(value) ? value : undefined;

// --- ReportTable Sub-component Props ---
interface ReportTableProps {
  brevetKey: "bb1" | "bb2";
  students: Student[];
  sortConfig: { key: string; direction: "asc" | "desc" } | null;
  onSort: (
    setter: (prev: { key: string; direction: "asc" | "desc" } | null) => {
      key: string;
      direction: "asc" | "desc";
    },
  ) => void;
  orderedSubjects: string[];
  onReorderSubjects: (setter: (prev: string[]) => string[]) => void;
  brevetConfig: BrevetConfig;
}

// --- ReportTable Sub-component ---
const ReportTable = ({
  brevetKey,
  students,
  sortConfig,
  onSort,
  orderedSubjects,
  onReorderSubjects,
  brevetConfig,
}: ReportTableProps) => {
  const handleSort = (key: string) => {
    onSort((prev) => {
      if (prev?.key === key && prev.direction === "desc") {
        return { key, direction: "asc" };
      }
      return { key, direction: "desc" };
    });
  };

  const handleSubjectReorder = (subject: string) => {
    onReorderSubjects((prev) => [
      subject,
      ...prev.filter((s) => s !== subject),
    ]);
  };

  const tableData = useMemo(() => {
    const isPostReform = !!brevetConfig.coefficients;

    const studentRows = students.map((student) => {
      let studentTotal = 0;
      let noteCount = 0;
      const notesBySubject: { [key: string]: number | undefined } = {};
      brevetConfig.subjects.forEach((matiere) => {
        const note = normalizeNumericValue(
          student.notes?.[matiere]?.[brevetKey] as number | null | undefined,
        );
        notesBySubject[matiere] = note;
        if (note !== undefined) {
          studentTotal += note;
          noteCount++;
        }
      });

      const average = calculateBrevetBlancAverage(
        student,
        brevetConfig,
        brevetKey,
      );
      const total = !isPostReform && noteCount > 0 ? studentTotal : undefined;

      return {
        nom: student.NOM,
        prenom: student.PRENOM,
        classe: student.CLASSE?.trim(),
        notes: notesBySubject,
        total: total,
        average: average,
        noteCount: noteCount,
      };
    });

    const stats = orderedSubjects.reduce(
      (acc, matiere) => {
        acc[matiere] = getColumnStats(studentRows.map((s) => s.notes[matiere]));
        return acc;
      },
      {} as Record<string, ReturnType<typeof getColumnStats>>,
    );

    if (!isPostReform) {
      stats["total"] = getColumnStats(studentRows.map((s) => s.total));
    }
    stats["average"] = getColumnStats(studentRows.map((s) => s.average));

    const presentAtLeastOne = studentRows.filter((s) => s.noteCount > 0).length;
    const presentAtAll = studentRows.filter(
      (s) => s.noteCount === brevetConfig.subjects.length,
    ).length;

    return {
      studentRows,
      stats,
      presentAtLeastOne,
      presentAtAll,
      isPostReform,
    };
  }, [students, brevetKey, orderedSubjects, brevetConfig]);

  const sortedStudentRows = useMemo(() => {
    if (!sortConfig) return tableData.studentRows;

    return [...tableData.studentRows].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA: string | number | undefined;
      let valB: string | number | undefined;

      if (["nom", "prenom", "classe"].includes(key)) {
        valA = a[key as "nom" | "prenom" | "classe"];
        valB = b[key as "nom" | "prenom" | "classe"];
      } else if (["total", "average"].includes(key)) {
        valA = a[key as "total" | "average"];
        valB = b[key as "total" | "average"];
      } else {
        // It's a subject
        valA = a.notes[key];
        valB = b.notes[key];
      }

      if (valA === undefined && valB === undefined) return 0;
      if (valA === undefined) return 1;
      if (valB === undefined) return -1;

      if (typeof valA === "number" && typeof valB === "number") {
        return direction === "asc" ? valA - valB : valB - valA;
      }
      if (typeof valA === "string" && typeof valB === "string") {
        return direction === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return 0;
    });
  }, [tableData.studentRows, sortConfig]);

  const formatNumber = (num: number | null | undefined, decimals = 1) =>
    typeof num === "number" && Number.isFinite(num)
      ? num.toFixed(decimals).replace(".", ",")
      : "";

  const renderSortIcon = (key: string) => {
    if (sortConfig?.key !== key)
      return <ChevronsUpDown className="h-4 w-4 opacity-40" />;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-4 w-4 text-primary" />
    ) : (
      <ArrowDown className="h-4 w-4 text-primary" />
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-center">
        {brevetKey === "bb1" ? "Brevet Blanc 1" : "Brevet Blanc 2"}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="w-[150px] cursor-pointer text-center align-middle"
              onClick={() => handleSort("nom")}
            >
              NOM {renderSortIcon("nom")}
            </TableHead>
            <TableHead
              className="w-[150px] cursor-pointer text-center align-middle"
              onClick={() => handleSort("prenom")}
            >
              Prénom {renderSortIcon("prenom")}
            </TableHead>
            <TableHead
              className="w-[80px] cursor-pointer text-center align-middle"
              onClick={() => handleSort("classe")}
            >
              Classe {renderSortIcon("classe")}
            </TableHead>
            {orderedSubjects.map((m) => (
              <TableHead
                key={m}
                className="w-[110px] text-center align-middle p-0"
              >
                <div className="h-full flex flex-col">
                  <div
                    className="flex-1 flex items-center justify-center font-normal text-xs cursor-pointer hover:bg-muted/50 p-1 border-b"
                    onClick={() => handleSubjectReorder(m)}
                    title={`Mettre ${m} en premier`}
                  >
                    {m}
                    <br />/{brevetConfig.maxScores[m]}
                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground ml-1" />
                  </div>
                  <div
                    className="flex-1 flex items-center justify-center cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort(m)}
                  >
                    {renderSortIcon(m)}
                  </div>
                </div>
              </TableHead>
            ))}
            {!tableData.isPostReform && (
              <TableHead
                className="w-[100px] text-center align-middle cursor-pointer"
                onClick={() => handleSort("total")}
              >
                Total/
                <br />
                {brevetConfig.subjects.reduce(
                  (s, m) => s + brevetConfig.maxScores[m],
                  0,
                )}{" "}
                {renderSortIcon("total")}
              </TableHead>
            )}
            <TableHead
              className="w-[100px] text-center align-middle cursor-pointer"
              onClick={() => handleSort("average")}
            >
              /20 {renderSortIcon("average")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedStudentRows.map((student, index) => (
            <TableRow
              key={index}
              className="bg-white dark:bg-zinc-950 even:bg-muted dark:even:bg-muted/80"
            >
              <TableCell className="text-center align-middle">
                {student.nom}
              </TableCell>
              <TableCell className="text-center align-middle">
                {student.prenom}
              </TableCell>
              <TableCell className="text-center align-middle">
                {student.classe ?? ""}
              </TableCell>
              {orderedSubjects.map((m) => (
                <TableCell
                  key={m}
                  className="text-center align-middle font-medium"
                >
                  {student.notes[m] !== undefined
                    ? formatNumber(student.notes[m])
                    : "ABS"}
                </TableCell>
              ))}
              {!tableData.isPostReform && (
                <TableCell className="text-center align-middle font-semibold">
                  {student.total !== undefined
                    ? formatNumber(student.total)
                    : "ABS"}
                </TableCell>
              )}
              <TableCell
                className={cn(
                  "text-center align-middle font-semibold",
                  getMoyenneCellStyle(student.average),
                )}
              >
                {student.average !== undefined
                  ? formatNumber(student.average)
                  : "ABS"}
              </TableCell>
            </TableRow>
          ))}
          {/* --- Stats Rows --- */}
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Moyenne
            </TableCell>
            {orderedSubjects.map((m) => (
              <TableCell key={m} className="text-center align-middle">
                {formatNumber(tableData.stats[m].mean, 1)}
              </TableCell>
            ))}
            {!tableData.isPostReform && (
              <TableCell className="text-center align-middle">
                {formatNumber(tableData.stats.total.mean, 1)}
              </TableCell>
            )}
            <TableCell className="text-center align-middle">
              {formatNumber(tableData.stats.average.mean, 1)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Médiane
            </TableCell>
            {orderedSubjects.map((m) => (
              <TableCell key={m} className="text-center align-middle">
                {formatNumber(tableData.stats[m].median, 1)}
              </TableCell>
            ))}
            {!tableData.isPostReform && (
              <TableCell className="text-center align-middle">
                {formatNumber(tableData.stats.total.median, 1)}
              </TableCell>
            )}
            <TableCell className="text-center align-middle">
              {formatNumber(tableData.stats.average.median, 1)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Note Maximum
            </TableCell>
            {orderedSubjects.map((m) => (
              <TableCell key={m} className="text-center align-middle">
                {formatNumber(tableData.stats[m].max, 1)}
              </TableCell>
            ))}
            {!tableData.isPostReform && (
              <TableCell className="text-center align-middle">
                {formatNumber(tableData.stats.total.max, 1)}
              </TableCell>
            )}
            <TableCell className="text-center align-middle">
              {formatNumber(tableData.stats.average.max, 1)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Note Minimum
            </TableCell>
            {orderedSubjects.map((m) => (
              <TableCell key={m} className="text-center align-middle">
                {formatNumber(tableData.stats[m].min, 1)}
              </TableCell>
            ))}
            {!tableData.isPostReform && (
              <TableCell className="text-center align-middle">
                {formatNumber(tableData.stats.total.min, 1)}
              </TableCell>
            )}
            <TableCell className="text-center align-middle">
              {formatNumber(tableData.stats.average.min, 1)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Étendue
            </TableCell>
            {orderedSubjects.map((m) => (
              <TableCell key={m} className="text-center align-middle">
                {formatNumber(tableData.stats[m].range, 1)}
              </TableCell>
            ))}
            {!tableData.isPostReform && (
              <TableCell className="text-center align-middle">
                {formatNumber(tableData.stats.total.range, 1)}
              </TableCell>
            )}
            <TableCell className="text-center align-middle">
              {formatNumber(tableData.stats.average.range, 1)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Présents
            </TableCell>
            {orderedSubjects.map((m) => (
              <TableCell key={m} className="text-center align-middle">
                {tableData.stats[m].presentCount}
              </TableCell>
            ))}
            <TableCell colSpan={tableData.isPostReform ? 1 : 2}></TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Présents à au moins une épreuve
            </TableCell>
            <TableCell
              colSpan={
                orderedSubjects.length + (tableData.isPostReform ? 1 : 2)
              }
              className="text-center align-middle"
            >
              {tableData.presentAtLeastOne}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted font-bold">
            <TableCell colSpan={3} className="text-center align-middle">
              Présents à toutes les épreuves
            </TableCell>
            <TableCell
              colSpan={
                orderedSubjects.length + (tableData.isPostReform ? 1 : 2)
              }
              className="text-center align-middle"
            >
              {tableData.presentAtAll}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

// --- ReportGraphsPreview Component ---
// This component is rendered off-screen to be captured by html2canvas
const ReportGraphsPreview = ({
  reportData,
}: {
  reportData: any;
}) => {
  if (!reportData) return null;
  const RADIAN = Math.PI / 180;

  return (
    <div className="p-6 bg-white" style={{ width: "800px" }}>
      <h2 className="text-2xl font-bold text-center mb-6">
        Rapport Graphique du Brevet Blanc
      </h2>
      <div className="grid grid-cols-2 gap-6">
        {(reportData.config.brevetType === "bb1" ||
          reportData.config.brevetType === "comparison") && (
          <Card>
            <CardHeader>
              <CardTitle>Répartition des Résultats (BB1)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] relative">
              <ChartContainer
                config={successRateChartConfig}
                className="w-full h-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={[
                        { name: "Admis", value: reportData.statsBB1.admis },
                        { name: "Refusé", value: reportData.statsBB1.refuse },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      labelLine={false}
                      label={({ cx, cy, midAngle, payload }: any) => {
                        const radius = 100;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#111827"
                            textAnchor={x > cx ? "start" : "end"}
                            dominantBaseline="central"
                            className="text-xs font-medium"
                          >
                            {" "}
                            {`${payload.name} (${payload.value})`}{" "}
                          </text>
                        );
                      }}
                    >
                      <Cell fill={SUCCESS_RATE_CHART_COLORS.admis} />
                      <Cell fill={SUCCESS_RATE_CHART_COLORS.refuse} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold">
                  {reportData.statsBB1.successRate.toFixed(1)}%
                </span>
                <span className="text-sm text-muted-foreground">
                  Taux de Réussite
                </span>
              </div>
            </CardContent>
          </Card>
        )}
        {(reportData.config.brevetType === "bb2" ||
          reportData.config.brevetType === "comparison") && (
          <Card>
            <CardHeader>
              <CardTitle>Répartition des Résultats (BB2)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] relative">
              <ChartContainer
                config={successRateChartConfig}
                className="w-full h-full"
              >
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={[
                        { name: "Admis", value: reportData.statsBB2.admis },
                        { name: "Refusé", value: reportData.statsBB2.refuse },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      labelLine={false}
                      label={({ cx, cy, midAngle, payload }: any) => {
                        const radius = 100;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#111827"
                            textAnchor={x > cx ? "start" : "end"}
                            dominantBaseline="central"
                            className="text-xs font-medium"
                          >
                            {" "}
                            {`${payload.name} (${payload.value})`}{" "}
                          </text>
                        );
                      }}
                    >
                      <Cell fill={SUCCESS_RATE_CHART_COLORS.admis} />
                      <Cell fill={SUCCESS_RATE_CHART_COLORS.refuse} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold">
                  {reportData.statsBB2.successRate.toFixed(1)}%
                </span>
                <span className="text-sm text-muted-foreground">
                  Taux de Réussite
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {reportData.config.brevetType === "comparison" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Comparaison des Moyennes par Matière (/20)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ChartContainer config={barChartConfig} className="w-full h-full">
              <ResponsiveContainer>
                <BarChart data={reportData.comparisonChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis domain={[0, 20]} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar
                    isAnimationActive={false}
                    dataKey="bb1"
                    name="Moyenne BB1"
                    fill="hsl(var(--secondary))"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="bb2"
                    name="Moyenne BB2"
                    fill="hsl(var(--primary))"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// --- Main Component ---
export function BrevetBlancReportModal({
  config,
  students,
  onOpenChange,
  availableClasses,
  year,
}: BrevetBlancReportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);

  const brevetConfig = useMemo(() => getBrevetConfigForYear(year), [year]);

  const [sortConfigBB1, setSortConfigBB1] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>({ key: "average", direction: "desc" });
  const [orderedSubjectsBB1, setOrderedSubjectsBB1] = useState<string[]>([]);
  const [sortConfigBB2, setSortConfigBB2] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>({ key: "average", direction: "desc" });
  const [orderedSubjectsBB2, setOrderedSubjectsBB2] = useState<string[]>([]);

  useEffect(() => {
    setOrderedSubjectsBB1(Array.from(brevetConfig.subjects));
    setOrderedSubjectsBB2(Array.from(brevetConfig.subjects));
  }, [brevetConfig]);

  const { reportData } = useBrevetBlancReport(config, students, year);

  const handleExportToPDF = useCallback(async () => {
    if (!reportData || !previewRef.current) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Pas de données de rapport à exporter.",
      });
      return;
    }
    setIsExporting(true);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const canvas = await html2canvas(previewRef.current, {
      scale: 2,
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.85);

    doc.addImage(
      imgData,
      "JPEG",
      10,
      10,
      190,
      (canvas.height * 190) / canvas.width,
    );

    const pageSections: {
      start: number;
      end: number;
      brevetKey: "bb1" | "bb2";
    }[] = [];
    const formatNumber = (num: number | null | undefined, decimals = 1) =>
      typeof num === "number" && Number.isFinite(num)
        ? num.toFixed(decimals).replace(".", ",")
        : "";

    const generateTableForBrevet = (
      brevetKey: "bb1" | "bb2",
      currentSortConfig: typeof sortConfigBB1,
      currentOrderedSubjects: typeof orderedSubjectsBB1,
    ) => {
      const { filteredStudents } = reportData;
      const localBrevetConfig = getBrevetConfigForYear(year);
      const isPostReform = !!localBrevetConfig.coefficients;

      const studentRows = filteredStudents.map((student) => {
        const average = calculateBrevetBlancAverage(
          student,
          localBrevetConfig,
          brevetKey,
        );
        let studentTotal = 0;
        let noteCount = 0;
        const notesBySubject: { [key: string]: number | undefined } = {};
        localBrevetConfig.subjects.forEach((matiere) => {
          const note = normalizeNumericValue(
            student.notes?.[matiere]?.[brevetKey] as number | null | undefined,
          );
          notesBySubject[matiere] = note;
          if (note !== undefined) {
            studentTotal += note;
            noteCount++;
          }
        });
        const total = !isPostReform && noteCount > 0 ? studentTotal : undefined;
        return {
          nom: student.NOM,
          prenom: student.PRENOM,
          classe: student.CLASSE?.trim(),
          notes: notesBySubject,
          total,
          average,
        };
      });

      const sortedStudentRows = (() => {
        if (!currentSortConfig) return studentRows;
        return [...studentRows].sort((a, b) => {
          const { key, direction } = currentSortConfig;
          let valA: string | number | undefined,
            valB: string | number | undefined;
          if (key === "nom" || key === "prenom" || key === "classe") {
            valA = a[key];
            valB = b[key];
          } else if (key === "total" || key === "average") {
            valA = a[key];
            valB = b[key];
          } else {
            valA = a.notes[key];
            valB = b.notes[key];
          }
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          if (typeof valA === "number" && typeof valB === "number")
            return direction === "asc" ? valA - valB : valB - valA;
          if (typeof valA === "string" && typeof valB === "string")
            return direction === "asc"
              ? valA.localeCompare(valB)
              : valB.localeCompare(valA);
          return 0;
        });
      })();

      const head = [
        [
          "NOM",
          "Prénom",
          "Classe",
          ...currentOrderedSubjects.map((m) => m),
          ...(isPostReform ? [] : ["Total"]),
          "Moyenne/20",
        ],
      ];
      const body = sortedStudentRows.map((row) => [
        row.nom,
        row.prenom,
        row.classe ?? "",
        ...currentOrderedSubjects.map((m) =>
          row.notes[m] !== undefined ? formatNumber(row.notes[m]) : "ABS",
        ),
        ...(isPostReform
          ? []
          : [row.total !== undefined ? formatNumber(row.total) : "ABS"]),
        {
          content:
            row.average !== undefined ? formatNumber(row.average) : "ABS",
          styles: {
            fillColor: getMoyenneFillColorTuple(row.average),
            textColor: getMoyenneTextColorTuple(row.average),
          },
        },
      ]);

      doc.addPage();
      const startPage = doc.getNumberOfPages();
      doc
        .setFontSize(14)
        .text(
          `Rapport Détaillé - ${brevetKey === "bb1" ? "Brevet Blanc 1" : "Brevet Blanc 2"}`,
          14,
          20,
        );

      autoTable(doc, {
        head: head,
        body: body,
        startY: 25,
        theme: "grid",
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
        },
        styles: {
          fontSize: 7,
          cellPadding: 1,
          overflow: "linebreak",
          valign: "middle",
          halign: "center",
        },
      });
      const endPage = doc.getNumberOfPages();
      pageSections.push({ start: startPage, end: endPage, brevetKey });
    };

    const { config } = reportData;

    if (config.brevetType === "bb1" || config.brevetType === "comparison") {
      generateTableForBrevet("bb1", sortConfigBB1, orderedSubjectsBB1);
    }
    if (config.brevetType === "bb2" || config.brevetType === "comparison") {
      generateTableForBrevet("bb2", sortConfigBB2, orderedSubjectsBB2);
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Page ${i} / ${totalPages}`,
        doc.internal.pageSize.width - 14,
        doc.internal.pageSize.height - 10,
        { align: "right" },
      );
    }

    const pdfClassNamesString =
      config.classNames.length > 3
        ? `${config.classNames.length}-classes`
        : config.classNames.join("-").replace(/3EME /g, "3e") || "classes";
    doc.save(`rapport_brevet_blanc_${pdfClassNamesString}.pdf`, {
      returnPromise: true,
    });
    toast({
      title: "Exportation Réussie",
      description: "Le rapport PDF a été généré.",
    });
    setIsExporting(false);
  }, [
    reportData,
    toast,
    sortConfigBB1,
    orderedSubjectsBB1,
    sortConfigBB2,
    orderedSubjectsBB2,
    year,
  ]);

  const isOpen = !!config;
  const handleClose = () => onOpenChange(false);

  const titleText = useMemo(() => {
    if (!reportData) return "Chargement...";
    const { classNames } = reportData.config;
    if (
      classNames.length === availableClasses.length &&
      availableClasses.length > 3
    ) {
      return `Toutes les classes (${availableClasses.length})`;
    }
    if (classNames.length > 3) {
      return `${classNames.length} classes sélectionnées`;
    }
    return classNames.map((c) => c.replace(/3EME/i, "3e")).join(", ");
  }, [reportData, availableClasses]);

  return (
    <>
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={previewRef}>
          <ReportGraphsPreview
            reportData={reportData}
          />
        </div>
      </div>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-7xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-2xl font-semibold text-primary">
              Aperçu du Rapport du Brevet Blanc
            </DialogTitle>
            <DialogDescription>
              Rapport pour : {titleText}. Élèves concernés:{" "}
              {reportData?.studentCount ?? 0}.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
            {!reportData ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Génération du rapport...</p>
              </div>
            ) : (
              <div className="space-y-8">
                <ReportGraphsPreview
                  reportData={reportData}
                />

                {(reportData.config.brevetType === "bb1" ||
                  reportData.config.brevetType === "comparison") && (
                  <div>
                    <ReportTable
                      brevetKey="bb1"
                      students={reportData.filteredStudents}
                      sortConfig={sortConfigBB1}
                      onSort={setSortConfigBB1}
                      orderedSubjects={orderedSubjectsBB1}
                      onReorderSubjects={setOrderedSubjectsBB1}
                      brevetConfig={brevetConfig}
                    />
                  </div>
                )}
                {(reportData.config.brevetType === "bb2" ||
                  reportData.config.brevetType === "comparison") && (
                  <div className="mt-8">
                    <ReportTable
                      brevetKey="bb2"
                      students={reportData.filteredStudents}
                      sortConfig={sortConfigBB2}
                      onSort={setSortConfigBB2}
                      orderedSubjects={orderedSubjectsBB2}
                      onReorderSubjects={setOrderedSubjectsBB2}
                      brevetConfig={brevetConfig}
                    />
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t bg-muted/30 flex justify-between">
            <Button
              variant="outline"
              onClick={handleExportToPDF}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Télécharger en PDF
            </Button>
            <DialogClose asChild>
              <Button type="button" onClick={handleClose}>
                Fermer
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
