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
import { type BrevetResultReportConfig } from "./brevet-result-report-config-modal";
import { type ProcessedStudentData } from "@/contexts/FilterContext";
import { useState, useRef, useCallback, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "./ui/card";
import {
  Loader2,
  FileSignature,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
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
import jsPDF from "jspdf";
import autoTable, {
  type CellInput,
  type RowInput,
  type UserOptions,
} from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import { cn } from "@/lib/utils";
import { useBrevetResultReport } from "@/hooks/use-brevet-result-report"; // Import the new hook

// --- Data Structures & Constants ---
interface BrevetResultReportModalProps {
  config: BrevetResultReportConfig | null;
  students: ProcessedStudentData[];
  onOpenChange: (isOpen: boolean) => void;
}

const REPORT_COLUMNS = [
  {
    key: "scoreFrancais",
    label: "Français",
    shortLabel: "Français",
    maxScore: 20,
  },
  {
    key: "scoreMaths",
    label: "Mathématiques",
    shortLabel: "Maths",
    maxScore: 20,
  },
  {
    key: "scoreHistoireGeo",
    label: "Histoire-Géo, EMC",
    shortLabel: "H-G, EMC",
    maxScore: 20,
  },
  {
    key: "scoreSciences",
    label: "Sciences",
    shortLabel: "Sciences",
    maxScore: 20,
  },
  {
    key: "scoreOralDNB",
    label: "Soutenance Orale",
    shortLabel: "Oral",
    maxScore: 20,
  },
  {
    key: "scoreSocleCommun",
    label: "Socle Commun",
    shortLabel: "Socle",
    maxScore: 20,
  },
];

const SUCCESS_RATE_CHART_COLORS = {
  admis: "hsl(var(--color-success-hsl))",
  refuse: "hsl(var(--destructive))",
};
const MENTION_CHART_COLORS: Record<string, string> = {
  tresbien: "hsl(49, 96%, 77%)",
  bien: "hsl(223, 78%, 48%)",
  assezbien: "hsl(38, 92%, 51%)",
  sansmention: "hsl(215, 9%, 68%)",
};

const normalizeTextForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
};

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

const getMoyenneFillColorTuple = (
  moyenne?: number,
): [number, number, number] | undefined => {
  if (moyenne === undefined) return undefined;
  if (moyenne >= 15) return [22, 163, 74];
  if (moyenne >= 10) return [74, 222, 128];
  if (moyenne >= 8) return [250, 204, 21];
  return [220, 38, 38];
};

const getMoyenneTextColorTuple = (
  moyenne?: number,
): [number, number, number] => {
  if (moyenne !== undefined && moyenne >= 8 && moyenne < 15) return [0, 0, 0];
  return [255, 255, 255];
};

const successRateChartConfig = {
  Admis: { label: "Admis" },
  Refusé: { label: "Refusé" },
} satisfies ChartConfig;

const mentionsChartConfig = {
  "Très Bien": { label: "Très Bien" },
  Bien: { label: "Bien" },
  "Assez Bien": { label: "Assez Bien" },
  "Sans Mention": { label: "Sans Mention" },
} satisfies ChartConfig;

const subjectAveragesChartConfig = {
  average: { label: "Moyenne /20" },
} satisfies ChartConfig;

// --- ReportGraphsPreview Component ---
const ReportGraphsPreview = ({ reportData }: { reportData: any }) => {
  if (!reportData) return null;
  const { stats } = reportData;

  const successData = [
    { name: "Admis", value: stats.admis },
    { name: "Refusé", value: stats.refuse },
  ].filter((d) => d.value > 0);
  const mentionsData = [
    { name: "Très Bien", value: stats.mentions.tresBien },
    { name: "Bien", value: stats.mentions.bien },
    { name: "Assez Bien", value: stats.mentions.assezBien },
    { name: "Sans Mention", value: stats.mentions.sansMention },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 bg-white" style={{ width: "800px" }}>
      <h2 className="text-2xl font-bold text-center mb-6">
        Rapport sur les Résultats du Brevet
      </h2>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des Résultats</CardTitle>
            <CardDescription>
              {stats.totalStudents} élèves considérés
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] relative">
            <ChartContainer
              config={successRateChartConfig}
              className="w-full h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={successData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    labelLine={false}
                    isAnimationActive={false}
                  >
                    {successData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "Admis"
                            ? SUCCESS_RATE_CHART_COLORS.admis
                            : SUCCESS_RATE_CHART_COLORS.refuse
                        }
                      />
                    ))}
                  </Pie>
                  <ChartLegend
                    content={<ChartLegendContent nameKey="name" />}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="name" hideLabel />}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold">
                {stats.successRate.toFixed(1)}%
              </span>
              <span className="text-sm text-muted-foreground">
                Taux de Réussite
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Répartition des Mentions</CardTitle>
            <CardDescription>{stats.admis} admis</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] relative">
            <ChartContainer
              config={mentionsChartConfig}
              className="w-full h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mentionsData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    isAnimationActive={false}
                  >
                    {mentionsData.map((entry) => (
                      <Cell
                        key={`cell-mention-${entry.name}`}
                        fill={
                          MENTION_CHART_COLORS[
                            normalizeTextForComparison(entry.name)
                          ]
                        }
                      />
                    ))}
                  </Pie>
                  <ChartLegend
                    content={<ChartLegendContent nameKey="name" />}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="name" hideLabel />}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Moyennes par Matière (/20)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ChartContainer
            config={subjectAveragesChartConfig}
            className="w-full h-full"
          >
            <ResponsiveContainer>
              <BarChart
                data={stats.subjectAveragesChartData}
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis domain={[0, 20]} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="average"
                  name="Moyenne"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// --- Main Component ---
export function BrevetResultReportModal({
  config,
  students,
  onOpenChange,
}: BrevetResultReportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>({ key: "moyenne", direction: "desc" });
  const [orderedColumns, setOrderedColumns] = useState(
    REPORT_COLUMNS.map((c) => c.key),
  );

  const { reportData, sortedStudentRows, columnStats, titleText } =
    useBrevetResultReport(config, students, sortConfig);
  const activeOrderedColumns = useMemo(
    () =>
      orderedColumns.filter((key) =>
        reportData?.filteredStudents.some(
          (student) => student[key as keyof typeof student] !== undefined,
        ),
      ),
    [orderedColumns, reportData],
  );

  const { presentAtLeastOne, presentAtAll } = useMemo(() => {
    if (!reportData) return { presentAtLeastOne: 0, presentAtAll: 0 };

    let atLeastOne = 0;
    let atAll = 0;
    const availableColumns = REPORT_COLUMNS.filter((col) =>
      reportData.filteredStudents.some(
        (student) => student[col.key as keyof typeof student] !== undefined,
      ),
    );

    reportData.filteredStudents.forEach((student) => {
      let noteCount = 0;
      availableColumns.forEach((col) => {
        if (student[col.key as keyof typeof student] !== undefined) {
          noteCount++;
        }
      });
      if (noteCount > 0) {
        atLeastOne++;
      }
      if (availableColumns.length > 0 && noteCount === availableColumns.length) {
        atAll++;
      }
    });

    return { presentAtLeastOne: atLeastOne, presentAtAll: atAll };
  }, [reportData]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key && prev.direction === "desc")
        return { key, direction: "asc" };
      return { key, direction: "desc" };
    });
  };

  const handleReorder = (key: string) => {
    setOrderedColumns((prev) => [key, ...prev.filter((c) => c !== key)]);
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig?.key !== key)
      return <ChevronsUpDown className="h-4 w-4 opacity-40 inline-block" />;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-4 w-4 text-primary inline-block" />
    ) : (
      <ArrowDown className="h-4 w-4 text-primary inline-block" />
    );
  };

  const formatNumber = (num?: number, decimals = 1) =>
    num !== undefined ? num.toFixed(decimals).replace(".", ",") : "";

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

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.9);
      const pdfWidth = doc.internal.pageSize.getWidth();
      const imgWidth = pdfWidth - 20; // with margin
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      doc.addImage(imgData, "JPEG", 10, 10, imgWidth, imgHeight);

      doc.addPage();

      const columnDetails = activeOrderedColumns.map(
        (key) => REPORT_COLUMNS.find((c) => c.key === key)!,
      );

      const head: RowInput[] = [
        [
          "Nom",
          "Prénom",
          ...columnDetails.map((c) => c.label),
          "Total",
          "Moy./20",
          "Résultat",
        ],
      ];
      const body: RowInput[] = sortedStudentRows.map((student) => [
        student.nom,
        student.prenom,
        ...activeOrderedColumns.map((key) =>
          formatNumber(
            student[key as keyof typeof student] as number | undefined,
          ),
        ),
        formatNumber(student.totalGeneral),
        {
          content: formatNumber(student.moyenne, 2),
          styles: {
            fillColor: getMoyenneFillColorTuple(student.moyenne),
            textColor: getMoyenneTextColorTuple(student.moyenne),
          },
        },
        student.resultat ?? "",
      ]);
      const resultColumnIndex = columnDetails.length + 4;

      const statHeader: CellInput[] = [
        {
          content: "Statistiques",
          colSpan: 2,
          styles: { fontStyle: "bold", halign: "center" },
        },
        ...activeOrderedColumns.map(
          (key) => REPORT_COLUMNS.find((c) => c.key === key)!.label,
        ),
        "Total",
        "Moy./20",
        "Résultat",
      ];

      const statRow = (
        title: string,
        dataKey: keyof ReturnType<typeof getColumnStats>,
      ): CellInput[] => {
        const rowData: CellInput[] = [
          { content: title, colSpan: 2, styles: { fontStyle: "bold" } },
        ];

        if (dataKey === "presentCount") {
          activeOrderedColumns.forEach((key) =>
            rowData.push(columnStats[key]?.[dataKey]),
          );
          rowData.push(""); // Empty for Total
          rowData.push(""); // Empty for Moyenne/20
        } else {
          activeOrderedColumns.forEach((key) =>
            rowData.push(
              formatNumber(columnStats[key]?.[dataKey] as number | undefined),
            ),
          );
          rowData.push(
            formatNumber(
              columnStats.totalGeneral?.[dataKey] as number | undefined,
            ),
          );
          rowData.push(
            formatNumber(
              columnStats.moyenne?.[dataKey] as number | undefined,
              2,
            ),
          );
        }
        rowData.push(""); // Empty for "Résultat"
        return rowData;
      };

      const statRowsInOrder = [
        statRow("Moyenne", "mean"),
        statRow("Médiane", "median"),
        statRow("Note Maximum", "max"),
        statRow("Note Minimum", "min"),
        statRow("Étendue", "range"),
      ];

      body.push([], statHeader, ...statRowsInOrder);

      const presentRow: CellInput[] = [
        { content: "Présents", colSpan: 2, styles: { fontStyle: "bold" } },
        ...activeOrderedColumns.map((key) => columnStats[key]?.presentCount),
        "",
        "",
        "",
      ];
      body.push(presentRow);

      body.push([
        {
          content: "Présents à au moins une épreuve",
          colSpan: 2,
          styles: { fontStyle: "bold" },
        },
        {
          content: presentAtLeastOne.toString(),
          colSpan: activeOrderedColumns.length + 3,
          styles: { halign: "center" },
        },
      ]);
      body.push([
        {
          content: "Présents à toutes les épreuves",
          colSpan: 2,
          styles: { fontStyle: "bold" },
        },
        {
          content: presentAtAll.toString(),
          colSpan: activeOrderedColumns.length + 3,
          styles: { halign: "center" },
        },
      ]);

      const tableOptions: UserOptions = {
        head: head,
        body: body,
        startY: 15,
        theme: "grid",
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
        },
        styles: {
          fontSize: 7,
          cellPadding: 1,
          overflow: "linebreak",
          halign: "center",
          valign: "middle",
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 25 },
          [resultColumnIndex]: { cellWidth: 20 },
        },
      };
      autoTable(doc, tableOptions);

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
        config?.selectedResults.join("-").replace(/ /g, "_") || "rapport";
      doc.save(`rapport_resultats_${pdfClassNamesString}.pdf`);
      toast({
        title: "Exportation Réussie",
        description: "Le rapport PDF a été généré.",
      });
    } catch (e) {
      console.error("PDF Export Error: ", e);
      toast({
        variant: "destructive",
        title: "Erreur PDF",
        description: "Une erreur est survenue.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    reportData,
    toast,
    sortedStudentRows,
    activeOrderedColumns,
    columnStats,
    config,
    presentAtLeastOne,
    presentAtAll,
  ]);

  const isOpen = !!config;
  const handleClose = () => onOpenChange(false);

  return (
    <>
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={previewRef}>
          <ReportGraphsPreview reportData={reportData} />
        </div>
      </div>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-7xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-2xl font-semibold text-primary">
              Aperçu du Rapport des Résultats
            </DialogTitle>
            <DialogDescription>
              Rapport pour : {titleText}. Élèves concernés:{" "}
              {reportData?.filteredStudents.length ?? 0}.
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
                <ReportGraphsPreview reportData={reportData} />

                <Card>
                  <CardHeader>
                    <CardTitle>Données Détaillées des Élèves</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead
                            className="w-[150px] cursor-pointer text-center"
                            onClick={() => handleSort("nom")}
                          >
                            Nom {renderSortIcon("nom")}
                          </TableHead>
                          <TableHead
                            className="w-[150px] cursor-pointer text-center"
                            onClick={() => handleSort("prenom")}
                          >
                            Prénom {renderSortIcon("prenom")}
                          </TableHead>
                          {activeOrderedColumns.map((key) => {
                            const col = REPORT_COLUMNS.find(
                              (c) => c.key === key,
                            )!;
                            return (
                              <TableHead
                                key={key}
                                className="w-[110px] text-center p-0 align-middle"
                              >
                                <div className="flex flex-col h-full">
                                  <div
                                    className="flex-1 flex items-center justify-center text-xs font-normal border-b p-1 cursor-pointer hover:bg-muted/50"
                                    onClick={() => handleReorder(key)}
                                    title={`Mettre ${col.label} en premier`}
                                  >
                                    {col.shortLabel}/{col.maxScore}{" "}
                                    <ArrowRightLeft className="h-3 w-3 ml-1 text-muted-foreground" />
                                  </div>
                                  <div
                                    className="flex-1 flex items-center justify-center cursor-pointer hover:bg-muted/50"
                                    onClick={() => handleSort(key)}
                                  >
                                    {renderSortIcon(key)}
                                  </div>
                                </div>
                              </TableHead>
                            );
                          })}
                          <TableHead
                            className="w-[100px] text-center cursor-pointer"
                            onClick={() => handleSort("totalGeneral")}
                          >
                            Total {renderSortIcon("totalGeneral")}
                          </TableHead>
                          <TableHead
                            className="w-[100px] text-center cursor-pointer"
                            onClick={() => handleSort("moyenne")}
                          >
                            Moyenne /20 {renderSortIcon("moyenne")}
                          </TableHead>
                          <TableHead
                            className="w-[120px] text-center cursor-pointer"
                            onClick={() => handleSort("resultat")}
                          >
                            Résultat {renderSortIcon("resultat")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedStudentRows.map((student, index) => (
                          <TableRow key={student.id + index}>
                            <TableCell className="text-center">
                              {student.nom}
                            </TableCell>
                            <TableCell className="text-center">
                              {student.prenom}
                            </TableCell>
                            {activeOrderedColumns.map((key) => (
                              <TableCell
                                key={key}
                                className="text-center font-medium"
                              >
                                {formatNumber(
                                  student[key as keyof typeof student] as
                                    | number
                                    | undefined,
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-center font-semibold">
                              {formatNumber(student.totalGeneral)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-center font-semibold",
                                getMoyenneCellStyle(student.moyenne),
                              )}
                            >
                              {formatNumber(student.moyenne, 2)}
                            </TableCell>
                            <TableCell className="text-center">
                              {student.resultat}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/80 font-bold">
                          <TableHead
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Statistiques
                          </TableHead>
                          {activeOrderedColumns.map((key) => (
                            <TableHead
                              key={key}
                              className="text-center font-semibold"
                            >
                              {REPORT_COLUMNS.find((c) => c.key === key)!.label}
                            </TableHead>
                          ))}
                          <TableHead className="text-center font-semibold">
                            Total
                          </TableHead>
                          <TableHead className="text-center font-semibold">
                            Moy./20
                          </TableHead>
                          <TableHead className="text-center font-semibold">
                            Résultat
                          </TableHead>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Moyenne
                          </TableCell>
                          {activeOrderedColumns.map((key) => (
                            <TableCell key={key} className="text-center">
                              {formatNumber(columnStats[key]?.mean)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {formatNumber(columnStats.totalGeneral?.mean)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatNumber(columnStats.moyenne?.mean, 2)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Médiane
                          </TableCell>
                          {activeOrderedColumns.map((key) => (
                            <TableCell key={key} className="text-center">
                              {formatNumber(columnStats[key]?.median)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {formatNumber(columnStats.totalGeneral?.median)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatNumber(columnStats.moyenne?.median, 2)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Note Maximum
                          </TableCell>
                          {activeOrderedColumns.map((key) => (
                            <TableCell key={key} className="text-center">
                              {formatNumber(columnStats[key]?.max)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {formatNumber(columnStats.totalGeneral?.max)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatNumber(columnStats.moyenne?.max, 2)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Note Minimum
                          </TableCell>
                          {activeOrderedColumns.map((key) => (
                            <TableCell key={key} className="text-center">
                              {formatNumber(columnStats[key]?.min)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {formatNumber(columnStats.totalGeneral?.min)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatNumber(columnStats.moyenne?.min, 2)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Étendue
                          </TableCell>
                          {activeOrderedColumns.map((key) => (
                            <TableCell key={key} className="text-center">
                              {formatNumber(columnStats[key]?.range)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {formatNumber(columnStats.totalGeneral?.range)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatNumber(columnStats.moyenne?.range, 2)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Présents
                          </TableCell>
                          {activeOrderedColumns.map((key) => (
                            <TableCell key={key} className="text-center">
                              {columnStats[key]?.presentCount}
                            </TableCell>
                          ))}
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Présents à au moins une épreuve
                          </TableCell>
                          <TableCell
                            colSpan={activeOrderedColumns.length + 3}
                            className="text-center"
                          >
                            {presentAtLeastOne}
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-muted font-bold">
                          <TableCell
                            colSpan={2}
                            className="text-center font-semibold"
                          >
                            Présents à toutes les épreuves
                          </TableCell>
                          <TableCell
                            colSpan={activeOrderedColumns.length + 3}
                            className="text-center"
                          >
                            {presentAtAll}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
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
              ) : (
                <FileSignature className="mr-2 h-4 w-4" />
              )}
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
