"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, query, where, getDocs } from "@/lib/local/store";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Award,
  Book,
  Calculator,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  History,
  Landmark,
  Loader2,
  Percent,
  Users,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  buildBrevetBlancPanoramaReportData,
  type BrevetBlancPanoramaStudent as Student,
  type ScoreDistribution,
} from "@/lib/brevet-blanc-panorama-report";
import {
  exportBrevetBlancPanoramaPdf,
  exportBrevetBlancPanoramaXlsx,
} from "@/lib/brevet-blanc-panorama-export";
import {
  formatChartNumber,
  formatChartPercentage,
} from "@/lib/chart-label-formatters";
import { normalizeClassName } from "@/lib/student-class";

// Constants
const SCORE_CHART_COLORS = {
  gte15: "hsl(140, 70%, 35%)",
  gte10lt15: "hsl(110, 50%, 65%)",
  gte8lt10: "hsl(45, 90%, 55%)",
  lt8: "hsl(0, 80%, 60%)",
};

const barChartConfig = {
  averageBb1: {
    label: "Moyenne BB1",
    color: "hsl(var(--primary))",
  },
  averageBb2: {
    label: "Moyenne BB2",
    color: "hsl(var(--chart-admis))",
  },
} satisfies ChartConfig;

const pieChartConfig = {
  items: {
    label: "Notes",
  },
  gte15: {
    label: "≥ 15",
    color: SCORE_CHART_COLORS.gte15,
  },
  gte10lt15: {
    label: "10-14.9",
    color: SCORE_CHART_COLORS.gte10lt15,
  },
  gte8lt10: {
    label: "8-9.9",
    color: SCORE_CHART_COLORS.gte8lt10,
  },
  lt8: {
    label: "< 8",
    color: SCORE_CHART_COLORS.lt8,
  },
} satisfies ChartConfig;

const scoreLegendPayload = [
  {
    value: "Note ≥ 15",
    type: "square" as const,
    id: "s1",
    color: SCORE_CHART_COLORS.gte15,
  },
  {
    value: "10 ≤ Note < 15",
    type: "square" as const,
    id: "s2",
    color: SCORE_CHART_COLORS.gte10lt15,
  },
  {
    value: "8 ≤ Note < 10",
    type: "square" as const,
    id: "s3",
    color: SCORE_CHART_COLORS.gte8lt10,
  },
  {
    value: "Note < 8",
    type: "square" as const,
    id: "s4",
    color: SCORE_CHART_COLORS.lt8,
  },
];

// Main Component
export default function PanoramaBlancPage() {
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [isYearsLoading, setIsYearsLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState<
    "xlsx" | "pdf" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchYears = useCallback(async () => {
    setIsYearsLoading(true);
    try {
      const bbRef = collection(db, "BrevetBlanc");
      const querySnapshot = await getDocs(bbRef);
      const yearsFromDb = new Set<string>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.anneeScolaire) yearsFromDb.add(data.anneeScolaire);
      });
      const sortedYears = Array.from(yearsFromDb).sort((a, b) =>
        b.localeCompare(a),
      );
      setAvailableYears(sortedYears);
      setSelectedYear((currentYear) =>
        currentYear && sortedYears.includes(currentYear)
          ? currentYear
          : (sortedYears[0] ?? ""),
      );
    } catch (err: any) {
      setError("Impossible de charger les années scolaires.");
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err.message,
      });
    } finally {
      setIsYearsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  const fetchStudents = useCallback(async () => {
    if (!selectedYear) return;
    setIsLoadingData(true);
    setError(null);
    try {
      const studentsRef = collection(db, "BrevetBlanc");
      const q = query(studentsRef, where("anneeScolaire", "==", selectedYear));
      const querySnapshot = await getDocs(q);
      const fetchedStudents: Student[] = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        NOM: docSnap.data().NOM,
        PRENOM: docSnap.data().PRENOM,
        CLASSE: normalizeClassName(docSnap.data().CLASSE),
        SEXE: docSnap.data().SEXE,
        isBoursier: docSnap.data().isBoursier,
        notes: docSnap.data().notes,
      }));
      setStudents(fetchedStudents);
    } catch (err: any) {
      setError("Impossible de charger les données des élèves. " + err.message);
      toast({
        variant: "destructive",
        title: "Erreur de chargement",
        description: err.message,
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const reportData = useMemo(
    () => buildBrevetBlancPanoramaReportData(students, selectedYear),
    [students, selectedYear],
  );
  const stats = reportData.stats;
  const genderStats = stats.genderBreakdown;
  const scholarshipStats = stats.scholarshipBreakdown;

  const handleExportReport = useCallback(
    async (format: "xlsx" | "pdf") => {
      if (students.length === 0) {
        toast({
          variant: "destructive",
          title: "Export impossible",
          description: "Aucune donnée n'est disponible pour générer le bilan.",
        });
        return;
      }

      setIsExportingReport(format);
      try {
        if (format === "xlsx") {
          exportBrevetBlancPanoramaXlsx(reportData);
        } else {
          await exportBrevetBlancPanoramaPdf(reportData);
        }

        toast({
          title: "Export terminé",
          description:
            format === "xlsx"
              ? "Le bilan complet Excel a été téléchargé."
              : "Le bilan complet PDF a été téléchargé.",
        });
      } catch (exportError: any) {
        console.error("Erreur export bilan panorama:", exportError);
        toast({
          variant: "destructive",
          title: "Erreur d'export",
          description:
            exportError?.message || "Le bilan complet n'a pas pu être généré.",
        });
      } finally {
        setIsExportingReport(null);
      }
    },
    [reportData, students.length, toast],
  );

  const scoreDistributionPieData = (dist: ScoreDistribution) => {
    if (!dist || dist.count === 0) return [];
    const calculatePercentage = (value: number) =>
      dist.count > 0 ? (value / dist.count) * 100 : 0;
    return [
      {
        name: "gte15",
        value: dist.gte15,
        fill: SCORE_CHART_COLORS.gte15,
        percentage: calculatePercentage(dist.gte15),
      },
      {
        name: "gte10lt15",
        value: dist.gte10lt15,
        fill: SCORE_CHART_COLORS.gte10lt15,
        percentage: calculatePercentage(dist.gte10lt15),
      },
      {
        name: "gte8lt10",
        value: dist.gte8lt10,
        fill: SCORE_CHART_COLORS.gte8lt10,
        percentage: calculatePercentage(dist.gte8lt10),
      },
      {
        name: "lt8",
        value: dist.lt8,
        fill: SCORE_CHART_COLORS.lt8,
        percentage: calculatePercentage(dist.lt8),
      },
    ].filter((item) => item.value > 0);
  };

  const renderLoading = () => (
    <FullScreenLoader text="Chargement du panorama..." />
  );

  const renderError = () => <ErrorDisplay message={error!} />;

  const renderNoData = () => (
    <Card className="text-center">
      <CardHeader>
        <CardTitle className="flex justify-center items-center">
          <History className="mr-2 h-6 w-6" />
          Aucune Donnée
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Aucune donnée trouvée pour l'année scolaire {selectedYear}.
        </p>
      </CardContent>
    </Card>
  );

  if (isYearsLoading) return renderLoading();

  const config = reportData.config;
  const isReportExportDisabled =
    isLoadingData || isExportingReport !== null || students.length === 0;

  const formatAverageStat = (value: number | undefined) =>
    value === undefined ? "N/A" : value.toFixed(2);

  const formatRateStat = (value: number | undefined) =>
    value === undefined ? "N/A" : `${value.toFixed(0)} %`;

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Panorama du Brevet Blanc
          </h1>
          <p className="text-muted-foreground mt-1">
            Analyse des performances aux brevets blancs.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={isReportExportDisabled}>
                {isExportingReport ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                Bilan complet
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportReport("xlsx")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportReport("pdf")}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-full sm:w-52">
            <Label htmlFor="year-select-panorama">Année Scolaire</Label>
            <Select
              value={selectedYear}
              onValueChange={setSelectedYear}
              disabled={availableYears.length === 0}
            >
              <SelectTrigger id="year-select-panorama">
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {isLoadingData ? (
        renderLoading()
      ) : error ? (
        renderError()
      ) : students.length === 0 ? (
        renderNoData()
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Élèves Inscrits
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalStudents}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Moyenne Générale BB1
                </CardTitle>
                <Book className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.averageBb1?.toFixed(2) ?? "N/A"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.participationBb1} participants
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Moyenne Générale BB2
                </CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.averageBb2?.toFixed(2) ?? "N/A"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.participationBb2} participants
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Progression
                </CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.averageBb2 && stats.averageBb1
                    ? (stats.averageBb2 - stats.averageBb1).toFixed(2)
                    : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground">
                  points de moyenne
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Filles / Garçons</CardTitle>
              <CardDescription>
                Sexe renseigné pour {genderStats.specifiedCount} élève(s) sur {stats.totalStudents}.
                {genderStats.unspecifiedCount > 0
                  ? ` ${genderStats.unspecifiedCount} élève(s) sans donnée de sexe ne sont pas inclus dans ce bloc.`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Filles</h3>
                    <p className="text-sm text-muted-foreground">
                      {genderStats.filles.totalStudents} élève(s)
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB1</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(genderStats.filles.averageBb1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB2</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(genderStats.filles.averageBb2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Progression</p>
                    <p className="text-base font-semibold text-green-600">
                      {formatAverageStat(genderStats.filles.progression)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB1</p>
                    <p className="text-base font-semibold">
                      {genderStats.filles.participationBb1}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB2</p>
                    <p className="text-base font-semibold">
                      {genderStats.filles.participationBb2}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taux de réussite BB2</p>
                    <p className="text-base font-semibold">
                      {formatRateStat(genderStats.filles.successRateBb2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Garçons</h3>
                    <p className="text-sm text-muted-foreground">
                      {genderStats.garcons.totalStudents} élève(s)
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB1</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(genderStats.garcons.averageBb1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB2</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(genderStats.garcons.averageBb2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Progression</p>
                    <p className="text-base font-semibold text-green-600">
                      {formatAverageStat(genderStats.garcons.progression)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB1</p>
                    <p className="text-base font-semibold">
                      {genderStats.garcons.participationBb1}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB2</p>
                    <p className="text-base font-semibold">
                      {genderStats.garcons.participationBb2}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taux de réussite BB2</p>
                    <p className="text-base font-semibold">
                      {formatRateStat(genderStats.garcons.successRateBb2)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Boursiers / Non-boursiers</CardTitle>
              <CardDescription>
                Comparaison des effectifs, moyennes, participations et taux de réussite.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Boursiers</h3>
                    <p className="text-sm text-muted-foreground">
                      {scholarshipStats.boursiers.totalStudents} élève(s)
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB1</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(scholarshipStats.boursiers.averageBb1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB2</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(scholarshipStats.boursiers.averageBb2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Progression</p>
                    <p className="text-base font-semibold text-green-600">
                      {formatAverageStat(scholarshipStats.boursiers.progression)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB1</p>
                    <p className="text-base font-semibold">
                      {scholarshipStats.boursiers.participationBb1}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB2</p>
                    <p className="text-base font-semibold">
                      {scholarshipStats.boursiers.participationBb2}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taux de réussite BB2</p>
                    <p className="text-base font-semibold">
                      {formatRateStat(scholarshipStats.boursiers.successRateBb2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Non-boursiers</h3>
                    <p className="text-sm text-muted-foreground">
                      {scholarshipStats.nonBoursiers.totalStudents} élève(s)
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB1</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(scholarshipStats.nonBoursiers.averageBb1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne BB2</p>
                    <p className="text-base font-semibold">
                      {formatAverageStat(scholarshipStats.nonBoursiers.averageBb2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Progression</p>
                    <p className="text-base font-semibold text-green-600">
                      {formatAverageStat(scholarshipStats.nonBoursiers.progression)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB1</p>
                    <p className="text-base font-semibold">
                      {scholarshipStats.nonBoursiers.participationBb1}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Participation BB2</p>
                    <p className="text-base font-semibold">
                      {scholarshipStats.nonBoursiers.participationBb2}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taux de réussite BB2</p>
                    <p className="text-base font-semibold">
                      {formatRateStat(scholarshipStats.nonBoursiers.successRateBb2)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Moyennes par matières (/20)</CardTitle>
              <CardDescription>
                Comparaison des moyennes pour chaque matière entre les deux
                brevets blancs.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ChartContainer config={barChartConfig} className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.subjectAverages}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="subject" />
                    <YAxis domain={[0, 20]} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar
                      dataKey="averageBb1"
                      name="Moyenne BB1"
                      fill="var(--color-averageBb1)"
                      radius={[4, 4, 0, 0]}
                    >
                      <LabelList
                        dataKey="averageBb1"
                        position="insideTop"
                        className="fill-primary-foreground"
                        fontSize={12}
                        formatter={formatChartNumber}
                      />
                    </Bar>
                    <Bar
                      dataKey="averageBb2"
                      name="Moyenne BB2"
                      fill="var(--color-averageBb2)"
                      radius={[4, 4, 0, 0]}
                    >
                      <LabelList
                        dataKey="averageBb2"
                        position="insideTop"
                        className="fill-primary-foreground"
                        fontSize={12}
                        formatter={formatChartNumber}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  Répartition des moyennes globales (/20) (BB1)
                </CardTitle>
                <CardDescription>
                  {stats.overallDistributionBb1.count} participants
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ChartContainer
                  config={pieChartConfig}
                  className="w-full h-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        content={
                          <ChartTooltipContent nameKey="name" hideLabel />
                        }
                      />
                      <Pie
                        data={scoreDistributionPieData(
                          stats.overallDistributionBb1,
                        )}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                      >
                        {scoreDistributionPieData(
                          stats.overallDistributionBb1,
                        ).map((entry) => (
                          <Cell key={`cell-${entry.name}`} fill={entry.fill} />
                        ))}
                        <LabelList
                          dataKey="percentage"
                          position="inside"
                          formatter={(value) => formatChartPercentage(value, 5)}
                          className="fill-primary-foreground text-xs font-medium"
                        />
                      </Pie>
                      <ChartLegend content={<ChartLegendContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  Répartition des moyennes globales (/20) (BB2)
                </CardTitle>
                <CardDescription>
                  {stats.overallDistributionBb2.count} participants
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ChartContainer
                  config={pieChartConfig}
                  className="w-full h-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        content={
                          <ChartTooltipContent nameKey="name" hideLabel />
                        }
                      />
                      <Pie
                        data={scoreDistributionPieData(
                          stats.overallDistributionBb2,
                        )}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                      >
                        {scoreDistributionPieData(
                          stats.overallDistributionBb2,
                        ).map((entry) => (
                          <Cell key={`cell-${entry.name}`} fill={entry.fill} />
                        ))}
                        <LabelList
                          dataKey="percentage"
                          position="inside"
                          formatter={(value) => formatChartPercentage(value, 5)}
                          className="fill-primary-foreground text-xs font-medium"
                        />
                      </Pie>
                      <ChartLegend content={<ChartLegendContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <h2 className="text-2xl font-semibold text-primary mb-4 tracking-tight">
              Analyse des Notes par Matière (/20)
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {config.subjects.map((matiere) => {
                const distBb1 = stats.distributionBySubjectBb1[matiere];
                const distBb2 = stats.distributionBySubjectBb2[matiere];
                const dataBb1 = scoreDistributionPieData(distBb1);
                const dataBb2 = scoreDistributionPieData(distBb2);

                const getIconForSubject = (subject: string) => {
                  switch (subject) {
                    case "Français":
                      return Book;
                    case "Mathématiques":
                      return Calculator;
                    case "Histoire-Géographie-Enseignement moral et civique":
                      return Landmark;
                    case "Histoire-Géographie":
                      return Landmark;
                    case "Enseignement moral et civique":
                      return Landmark;
                    case "Physique-Chimie":
                      return FlaskConical;
                    case "Sciences de la Vie et de la Terre":
                      return FlaskConical;
                    case "Technologie":
                      return History;
                    case "Oral de soutenance":
                      return Award;
                    default:
                      return Award;
                  }
                };
                const Icon = getIconForSubject(matiere);
                const showLegend =
                  (distBb1 && distBb1.count > 0) ||
                  (distBb2 && distBb2.count > 0);

                return (
                  <Card key={matiere}>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <Icon className="mr-2 h-5 w-5 text-primary" />
                        {matiere}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 place-items-center">
                      {distBb1 && distBb1.count > 0 ? (
                        <div className="flex flex-col items-center">
                          <h3 className="text-sm font-medium mb-1">
                            Brevet Blanc 1
                          </h3>
                          <p className="text-xs text-muted-foreground mb-2">
                            {distBb1.count} notes
                          </p>
                          <ChartContainer
                            config={pieChartConfig}
                            className="w-full h-[150px]"
                          >
                            <ResponsiveContainer>
                              <PieChart>
                                <Tooltip
                                  content={
                                    <ChartTooltipContent
                                      nameKey="name"
                                      hideLabel
                                    />
                                  }
                                />
                                <Pie
                                  data={dataBb1}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={30}
                                  outerRadius={50}
                                  paddingAngle={2}
                                >
                                  {dataBb1.map((entry) => (
                                    <Cell
                                      key={`cell-bb1-${matiere}-${entry.name}`}
                                      fill={entry.fill}
                                    />
                                  ))}
                                  <LabelList
                                    dataKey="percentage"
                                    position="inside"
                                    formatter={(value) =>
                                      formatChartPercentage(value, 5)
                                    }
                                    className="fill-primary-foreground text-xs font-medium"
                                  />
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                        </div>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground p-4 h-[200px] flex items-center">
                          Pas de données BB1
                        </div>
                      )}

                      {distBb2 && distBb2.count > 0 ? (
                        <div className="flex flex-col items-center">
                          <h3 className="text-sm font-medium mb-1">
                            Brevet Blanc 2
                          </h3>
                          <p className="text-xs text-muted-foreground mb-2">
                            {distBb2.count} notes
                          </p>
                          <ChartContainer
                            config={pieChartConfig}
                            className="w-full h-[150px]"
                          >
                            <ResponsiveContainer>
                              <PieChart>
                                <Tooltip
                                  content={
                                    <ChartTooltipContent
                                      nameKey="name"
                                      hideLabel
                                    />
                                  }
                                />
                                <Pie
                                  data={dataBb2}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={30}
                                  outerRadius={50}
                                  paddingAngle={2}
                                >
                                  {dataBb2.map((entry) => (
                                    <Cell
                                      key={`cell-bb2-${matiere}-${entry.name}`}
                                      fill={entry.fill}
                                    />
                                  ))}
                                  <LabelList
                                    dataKey="percentage"
                                    position="inside"
                                    formatter={(value) =>
                                      formatChartPercentage(value, 5)
                                    }
                                    className="fill-primary-foreground text-xs font-medium"
                                  />
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                        </div>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground p-4 h-[200px] flex items-center">
                          Pas de données BB2
                        </div>
                      )}
                    </CardContent>
                    {showLegend && (
                      <CardFooter className="flex justify-center pt-2 pb-4">
                        <ChartContainer
                          config={pieChartConfig}
                          className="mx-auto aspect-auto h-auto w-auto p-0"
                        >
                          {/* A dummy PieChart is needed for the ResponsiveContainer inside ChartContainer to render its children */}
                          <PieChart>
                            <ChartLegend
                              content={
                                <ChartLegendContent
                                  payload={scoreLegendPayload}
                                  className="flex-wrap justify-center gap-x-2 gap-y-1 text-xs"
                                />
                              }
                            />
                          </PieChart>
                        </ChartContainer>
                      </CardFooter>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
