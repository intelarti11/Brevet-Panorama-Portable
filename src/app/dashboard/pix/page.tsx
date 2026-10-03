"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Users,
  TrendingUp,
  BarChart as BarChartIcon,
  ArrowUpCircle,
  ArrowDownCircle,
  Trophy,
  Info,
  Database,
  UserCheck,
  Radar as RadarIcon,
  BookOpen,
  MessageSquare,
  PencilLine,
  ShieldCheck,
  Laptop,
  FileDown,
  Loader2,
} from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast";
import type { PixStudentData } from "@/lib/pix-types";
import { httpsCallable } from "@/lib/local/functions";
import { functions as functionsInstance } from "@/lib/firebase";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { exportPixYearAnalysisPdf } from "@/lib/pix-export";

interface ScoreDistributionData {
  range: string;
  count: number;
}

interface RadarChartDataPoint {
  subject: string;
  averageScore: number; // For year average
  score?: number; // For individual student score
  fullMark: number;
}

interface DetailedSkillAverage {
  code: string;
  name: string;
  averageScore: number;
  fullMark: number;
}

interface YearStats {
  studentCount: number;
  validatedCount: number;
  averagePixScore: string;
  minPixScore: number | string;
  maxPixScore: number | string;
  top5Students: PixStudentData[];
  scoreDistribution: ScoreDistributionData[];
  radarChartData: RadarChartDataPoint[];
  detailedSkillAverages: DetailedSkillAverage[];
}

const barChartConfig = {
  count: {
    label: "Nombre d'élèves : ",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const SKILL_CODES: (keyof PixStudentData)[] = [
  "1.1",
  "1.2",
  "1.3",
  "2.1",
  "2.2",
  "2.3",
  "2.4",
  "3.1",
  "3.2",
  "3.3",
  "3.4",
  "4.1",
  "4.2",
  "4.3",
  "5.1",
  "5.2",
];

const skillDetailsMap: Record<string, string> = {
  "1.1": "Mener une recherche et une veille d'information",
  "1.2": "Gérer des données",
  "1.3": "Traiter des données",
  "2.1": "Interagir",
  "2.2": "Partager et publier",
  "2.3": "Collaborer",
  "2.4": "S'insérer dans un monde numérique",
  "3.1": "Développer des documents textuels",
  "3.2": "Développer des documents multimédia",
  "3.3": "Adapter les documents à leur finalité",
  "3.4": "Programmer",
  "4.1": "Sécuriser l’environnement numérique",
  "4.2": "Protéger les données personnelles et la vie privée",
  "4.3": "Protéger la santé, le bien-être et l’environnement",
  "5.1": "Résoudre des problèmes techniques",
  "5.2": "Évoluer dans un environnement numérique",
};

const skillCategoriesForDetailedView = [
  {
    name: "1. Information et données",
    icon: BookOpen,
    skills: ["1.1", "1.2", "1.3"],
  },
  {
    name: "2. Communication et collaboration",
    icon: MessageSquare,
    skills: ["2.1", "2.2", "2.3", "2.4"],
  },
  {
    name: "3. Création de contenu",
    icon: PencilLine,
    skills: ["3.1", "3.2", "3.3", "3.4"],
  },
  {
    name: "4. Protection et sécurité",
    icon: ShieldCheck,
    skills: ["4.1", "4.2", "4.3"],
  },
  { name: "5. Environnement numérique", icon: Laptop, skills: ["5.1", "5.2"] },
];

const SKILL_CATEGORIES_FOR_RADAR = [
  {
    name: "Info. & Données",
    subSkills: ["1.1", "1.2", "1.3"],
    color: "hsl(var(--chart-1))",
  },
  {
    name: "Com. & Collab.",
    subSkills: ["2.1", "2.2", "2.3", "2.4"],
    color: "hsl(var(--chart-2))",
  },
  {
    name: "Création Contenu",
    subSkills: ["3.1", "3.2", "3.3", "3.4"],
    color: "hsl(var(--chart-3))",
  },
  {
    name: "Protect. & Sécu.",
    subSkills: ["4.1", "4.2", "4.3"],
    color: "hsl(var(--chart-4))",
  },
  {
    name: "Env. Numérique",
    subSkills: ["5.1", "5.2"],
    color: "hsl(var(--chart-5))",
  },
];
const RADAR_CHART_FULL_MARK = 4;

const yearRadarChartConfig = {
  averageScore: {
    label: "Score Moyen Année",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const studentModalRadarChartConfig = {
  score: {
    label: "Score Élève",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export default function PixDashboardPage() {
  const [studentsForSelectedYear, setStudentsForSelectedYear] = useState<
    PixStudentData[]
  >([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [yearStats, setYearStats] = useState<YearStats | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [selectedStudentForModal, setSelectedStudentForModal] =
    useState<PixStudentData | null>(null);
  const [studentModalRadarData, setStudentModalRadarData] = useState<
    RadarChartDataPoint[]
  >([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);

  const callGetPixAvailableYears = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "getPixAvailableYears")
        : null,
    [],
  );
  const callGetPixStudentsByYear = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "getPixStudentsByYear")
        : null,
    [],
  );

  const fetchYears = useCallback(async () => {
    if (!callGetPixAvailableYears) return;
    setIsLoadingYears(true);
    try {
      const result = await callGetPixAvailableYears();
      const data = result.data as { success: boolean; years?: string[] };
      if (data.success && data.years) {
        setAvailableYears(data.years);
        if (data.years.length > 0 && !selectedYear) {
          setSelectedYear(data.years[0]);
        } else if (data.years.length === 0) {
          setSelectedYear(null);
          setYearStats(null);
        }
      } else {
        throw new Error("Failed to fetch years.");
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des années:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les années disponibles.",
      });
      setAvailableYears([]);
      setSelectedYear(null);
      setYearStats(null);
    }
    setIsLoadingYears(false);
  }, [selectedYear, toast, callGetPixAvailableYears]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  const fetchStudents = useCallback(
    async (year: string) => {
      if (!callGetPixStudentsByYear) return;
      setIsLoadingStudents(true);
      setStudentsForSelectedYear([]);
      try {
        const result = await callGetPixStudentsByYear({ year });
        const data = result.data as {
          success: boolean;
          students?: PixStudentData[];
        };
        if (data.success && data.students) {
          setStudentsForSelectedYear(data.students);
        } else {
          setStudentsForSelectedYear([]);
        }
      } catch (error) {
        console.error(
          `Erreur lors de la récupération des élèves pour l'année ${year}:`,
          error,
        );
        toast({
          variant: "destructive",
          title: "Erreur",
          description: `Impossible de charger les données pour l'année ${year}.`,
        });
        setStudentsForSelectedYear([]);
      }
      setIsLoadingStudents(false);
    },
    [toast, callGetPixStudentsByYear],
  );

  useEffect(() => {
    if (selectedYear) {
      fetchStudents(selectedYear);
    } else {
      setStudentsForSelectedYear([]);
      setYearStats(null);
    }
  }, [selectedYear, fetchStudents]);

  useEffect(() => {
    if (selectedYear && studentsForSelectedYear) {
      const defaultStats: YearStats = {
        studentCount: 0,
        validatedCount: 0,
        averagePixScore: "N/A",
        minPixScore: "N/A",
        maxPixScore: "N/A",
        top5Students: [],
        scoreDistribution: [],
        radarChartData: SKILL_CATEGORIES_FOR_RADAR.map((cat) => ({
          subject: cat.name,
          averageScore: 0,
          fullMark: RADAR_CHART_FULL_MARK,
        })),
        detailedSkillAverages: SKILL_CODES.map((code) => ({
          code: code as string,
          name: skillDetailsMap[code as string] || (code as string),
          averageScore: 0,
          fullMark: RADAR_CHART_FULL_MARK,
        })),
      };

      if (studentsForSelectedYear.length === 0) {
        setYearStats(defaultStats);
        return;
      }

      const studentCount = studentsForSelectedYear.length;
      const validatedCount = studentsForSelectedYear.filter(
        (s) => s.statut === "Validée",
      ).length;
      const totalPixSum = studentsForSelectedYear.reduce(
        (sum, student) => sum + student.nombrePix,
        0,
      );
      const averagePixScore =
        studentCount > 0 ? (totalPixSum / studentCount).toFixed(0) : "N/A";

      const pixScores = studentsForSelectedYear.map((s) => s.nombrePix);
      const minPixScore = studentCount > 0 ? Math.min(...pixScores) : "N/A";
      const maxPixScore = studentCount > 0 ? Math.max(...pixScores) : "N/A";

      const sortedStudents = [...studentsForSelectedYear].sort(
        (a, b) => b.nombrePix - a.nombrePix,
      );
      const top5StudentsFullData = sortedStudents.slice(0, 5);

      const scoreRanges = [
        { label: "0-50", min: 0, max: 50 },
        { label: "51-100", min: 51, max: 100 },
        { label: "101-150", min: 101, max: 150 },
        { label: "151-200", min: 151, max: 200 },
        { label: "201-250", min: 201, max: 250 },
        { label: "251-300", min: 251, max: 300 },
        { label: "301-350", min: 301, max: 350 },
        { label: "351-400", min: 351, max: 400 },
        { label: "401-450", min: 401, max: 450 },
        { label: "451-500+", min: 451, max: Infinity },
      ];

      const scoreDistribution = scoreRanges.map((range) => {
        const count = studentsForSelectedYear.filter(
          (student) =>
            student.nombrePix >= range.min && student.nombrePix <= range.max,
        ).length;
        return { range: range.label, count };
      });

      const calculatedRadarData = SKILL_CATEGORIES_FOR_RADAR.map((category) => {
        let totalSubSkillSumForCategory = 0;
        let totalSubSkillInstancesForCategory = 0;
        studentsForSelectedYear.forEach((student) => {
          category.subSkills.forEach((subSkillCode) => {
            const scoreStr = student[
              subSkillCode as keyof PixStudentData
            ] as string;
            const score = parseInt(
              scoreStr === "-" || scoreStr === "" ? "0" : scoreStr,
              10,
            );
            if (!isNaN(score)) {
              totalSubSkillSumForCategory += score;
              totalSubSkillInstancesForCategory++;
            }
          });
        });
        const categoryAverage =
          totalSubSkillInstancesForCategory > 0
            ? parseFloat(
                (
                  totalSubSkillSumForCategory /
                  totalSubSkillInstancesForCategory
                ).toFixed(2),
              )
            : 0;
        return {
          subject: category.name,
          averageScore: categoryAverage,
          fullMark: RADAR_CHART_FULL_MARK,
        };
      });

      const calculatedDetailedSkillAverages = SKILL_CODES.map((skillCode) => {
        let totalScore = 0;
        let count = 0;
        studentsForSelectedYear.forEach((student) => {
          const scoreStr = student[skillCode as keyof PixStudentData] as string;
          const score = parseInt(
            scoreStr === "-" || scoreStr === "" ? "0" : scoreStr,
            10,
          );
          if (!isNaN(score)) {
            totalScore += score;
            count++;
          }
        });
        const average =
          count > 0 ? parseFloat((totalScore / count).toFixed(2)) : 0;
        return {
          code: skillCode as string,
          name: skillDetailsMap[skillCode as string] || (skillCode as string),
          averageScore: average,
          fullMark: RADAR_CHART_FULL_MARK,
        };
      });

      setYearStats({
        studentCount,
        validatedCount,
        averagePixScore,
        minPixScore,
        maxPixScore,
        top5Students: top5StudentsFullData,
        scoreDistribution,
        radarChartData: calculatedRadarData,
        detailedSkillAverages: calculatedDetailedSkillAverages,
      });
    } else if (!selectedYear && !isLoadingYears) {
      setYearStats(null);
    }
  }, [selectedYear, studentsForSelectedYear, isLoadingYears]);

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
  };

  const handleTopStudentSelect = (student: PixStudentData) => {
    setSelectedStudentForModal(student);

    const radarData = SKILL_CATEGORIES_FOR_RADAR.map((category) => {
      let totalScoreForCategory = 0;
      let skillsInCategoryCount = 0;
      category.subSkills.forEach((subSkillCode) => {
        const scoreStr = student[
          subSkillCode as keyof PixStudentData
        ] as string;
        const score = parseInt(
          scoreStr === "-" || scoreStr === "" ? "0" : scoreStr,
          10,
        );
        if (!isNaN(score)) {
          totalScoreForCategory += score;
          skillsInCategoryCount++;
        }
      });
      const categoryAverageScore =
        skillsInCategoryCount > 0
          ? parseFloat(
              (totalScoreForCategory / skillsInCategoryCount).toFixed(2),
            )
          : 0;
      return {
        subject: category.name,
        score: categoryAverageScore,
        averageScore: 0,
        fullMark: RADAR_CHART_FULL_MARK,
      };
    });
    setStudentModalRadarData(radarData);
    setIsModalOpen(true);
  };

  const handleExportToPDF = async () => {
    if (!selectedYear) {
      toast({
        variant: "destructive",
        title: "Erreur Exportation",
        description: "Aucune année sélectionnée.",
      });
      return;
    }
    if (!yearStats || yearStats.studentCount === 0) {
      toast({
        variant: "destructive",
        title: "Erreur Exportation",
        description: `Aucune donnée à exporter pour l'année ${selectedYear}.`,
      });
      return;
    }
    setIsExporting(true);
    try {
      await exportPixYearAnalysisPdf(selectedYear, yearStats);
      toast({
        title: "Exportation Réussie",
        description: `Le fichier tableau_analyse_pix_${selectedYear}.pdf a été téléchargé.`,
      });
    } catch (error) {
      console.error("Erreur lors de l'exportation PDF:", error);
      toast({
        variant: "destructive",
        title: "Erreur Exportation PDF",
        description: "Une erreur est survenue lors de la génération du PDF.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const hasSkillDataForYearRadar =
    yearStats?.radarChartData &&
    yearStats.radarChartData.some((d) => d.averageScore > 0);
  const hasDetailedSkillDataForYear =
    yearStats?.detailedSkillAverages &&
    yearStats.detailedSkillAverages.some((d) => d.averageScore > 0);
  const hasSkillDataForStudentModalRadar =
    studentModalRadarData &&
    studentModalRadarData.some((d) => d.score && d.score > 0);

  if (isLoadingYears) {
    return <FullScreenLoader text="Chargement des années disponibles..." />;
  }

  return (
    <>
      <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        <Card className="w-full shadow-xl" id="dashboard-main-card">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <BarChartIcon className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl font-headline">
                  Analyse Annuelle Détaillée PIX
                </CardTitle>
              </div>
              <CardDescription>
                Statistiques clés et moyennes de compétences pour l'année
                sélectionnée.
              </CardDescription>
            </div>
            <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Select
                onValueChange={handleYearChange}
                value={selectedYear || undefined}
                disabled={isLoadingStudents}
              >
                <SelectTrigger
                  id="year-select-dashboard-top"
                  className="w-full sm:w-[180px]"
                >
                  <SelectValue placeholder="Année" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleExportToPDF}
                disabled={
                  isExporting ||
                  !selectedYear ||
                  !yearStats ||
                  yearStats.studentCount === 0
                }
                className="w-full sm:w-auto"
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                Exporter PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {availableYears.length === 0 && !isLoadingYears ? (
              <div className="flex flex-col items-center justify-center text-center p-8 border rounded-lg bg-muted/50">
                <Database className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold">
                  Aucune donnée à analyser.
                </p>
                <p className="text-muted-foreground">
                  Veuillez importer des fichiers CSV via la page "Import" pour
                  alimenter la base de données.
                </p>
              </div>
            ) : (
              <>
                {isLoadingStudents && selectedYear && (
                  <FullScreenLoader
                    text={`Chargement des données pour ${selectedYear}...`}
                  />
                )}

                {!isLoadingStudents &&
                  !selectedYear &&
                  availableYears.length > 0 && (
                    <div className="mt-6 flex items-center justify-center space-x-2 text-lg text-accent-foreground bg-accent/20 p-4 rounded-md border border-accent/50">
                      <Info className="h-6 w-6 text-accent" />
                      <span>
                        Veuillez sélectionner une année pour afficher les
                        statistiques.
                      </span>
                    </div>
                  )}

                {!isLoadingStudents &&
                  selectedYear &&
                  (!yearStats || yearStats.studentCount === 0) && (
                    <p className="text-muted-foreground text-center p-6 border rounded-md mt-4 text-lg">
                      Aucune donnée d'élève trouvée pour l'année {selectedYear}.
                    </p>
                  )}

                {!isLoadingStudents &&
                  selectedYear &&
                  yearStats &&
                  yearStats.studentCount > 0 && (
                    <div className="space-y-8">
                      <div
                        id="pdf-page-1-content"
                        className="space-y-8 bg-card p-4 rounded-lg"
                      >
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                          <Card className="shadow-md hover:shadow-lg transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium">
                                Nombre d'Élèves
                              </CardTitle>
                              <Users className="h-6 w-6 text-primary" />
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {yearStats.studentCount}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Total des élèves enregistrés.
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="shadow-md hover:shadow-lg transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium">
                                Total Validé
                              </CardTitle>
                              <UserCheck className="h-6 w-6 text-primary" />
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {yearStats.validatedCount}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Élèves avec une certification validée.
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="shadow-md hover:shadow-lg transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium">
                                Score Pix Moyen
                              </CardTitle>
                              <TrendingUp className="h-6 w-6 text-primary" />
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {yearStats.averagePixScore}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Moyenne calculée sur les élèves.
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="shadow-md hover:shadow-lg transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium">
                                Score Pix Minimum
                              </CardTitle>
                              <ArrowDownCircle className="h-6 w-6 text-primary" />
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {yearStats.minPixScore}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Score le plus bas enregistré.
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="shadow-md hover:shadow-lg transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium">
                                Score Pix Maximum
                              </CardTitle>
                              <ArrowUpCircle className="h-6 w-6 text-primary" />
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {yearStats.maxPixScore}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Score le plus haut enregistré.
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                          <Card className="shadow-md">
                            <CardHeader>
                              <div className="flex items-center space-x-2">
                                <BarChartIcon className="h-6 w-6 text-primary" />
                                <CardTitle className="text-xl font-headline">
                                  Distribution des Scores Pix
                                </CardTitle>
                              </div>
                              <CardDescription>
                                Nombre d'élèves par tranche de score Pix pour
                                l'année {selectedYear}.
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              {yearStats.scoreDistribution &&
                              yearStats.scoreDistribution.some(
                                (d) => d.count > 0,
                              ) ? (
                                <ChartContainer
                                  config={barChartConfig}
                                  className="h-[300px] w-full"
                                >
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <BarChart
                                      accessibilityLayer
                                      data={yearStats.scoreDistribution}
                                      margin={{
                                        top: 5,
                                        right: 20,
                                        left: -20,
                                        bottom: 5,
                                      }}
                                    >
                                      <CartesianGrid
                                        vertical={false}
                                        strokeDasharray="3 3"
                                      />
                                      <XAxis
                                        dataKey="range"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        angle={-30}
                                        textAnchor="end"
                                        height={50}
                                        interval={0}
                                      />
                                      <YAxis
                                        allowDecimals={false}
                                        tickMargin={8}
                                      />
                                      <RechartsTooltip
                                        cursor={false}
                                        content={<ChartTooltipContent />}
                                      />
                                      <Bar
                                        dataKey="count"
                                        radius={4}
                                        onMouseEnter={(_data, index) =>
                                          setActiveBarIndex(index)
                                        }
                                        onMouseLeave={() =>
                                          setActiveBarIndex(null)
                                        }
                                      >
                                        {yearStats.scoreDistribution.map(
                                          (_entry, index) => (
                                            <Cell
                                              key={`cell-${index}`}
                                              cursor="pointer"
                                              fill={
                                                activeBarIndex === index
                                                  ? "hsl(var(--primary))"
                                                  : barChartConfig.count.color
                                              }
                                            />
                                          ),
                                        )}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </ChartContainer>
                              ) : (
                                <p className="text-muted-foreground text-center p-4">
                                  Pas de données de distribution.
                                </p>
                              )}
                            </CardContent>
                          </Card>

                          <Card className="shadow-md">
                            <CardHeader>
                              <div className="flex items-center space-x-2">
                                {" "}
                                <RadarIcon className="h-6 w-6 text-primary" />
                                <CardTitle className="text-xl font-headline">
                                  Performance Moyenne par Domaine
                                </CardTitle>
                              </div>
                              <CardDescription>
                                Score moyen de l'année {selectedYear} pour
                                chaque domaine (échelle 0-
                                {RADAR_CHART_FULL_MARK}).
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              {yearStats.radarChartData &&
                              hasSkillDataForYearRadar ? (
                                <ChartContainer
                                  config={yearRadarChartConfig}
                                  className="h-[300px] w-full"
                                >
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <RadarChart
                                      cx="50%"
                                      cy="50%"
                                      outerRadius="80%"
                                      data={yearStats.radarChartData}
                                    >
                                      <PolarGrid />
                                      <PolarAngleAxis
                                        dataKey="subject"
                                        tick={{ fontSize: 12 }}
                                      />
                                      <PolarRadiusAxis
                                        angle={30}
                                        domain={[0, RADAR_CHART_FULL_MARK]}
                                        allowDecimals={false}
                                        tickCount={RADAR_CHART_FULL_MARK + 1}
                                      />
                                      <Radar
                                        name="Score Moyen Année"
                                        dataKey="averageScore"
                                        stroke="hsl(var(--primary))"
                                        fill="hsl(var(--primary))"
                                        fillOpacity={0.6}
                                      />
                                      <RechartsTooltip
                                        content={<ChartTooltipContent />}
                                      />
                                      <Legend
                                        wrapperStyle={{
                                          fontSize: "0.8rem",
                                          paddingTop: "10px",
                                        }}
                                      />
                                    </RadarChart>
                                  </ResponsiveContainer>
                                </ChartContainer>
                              ) : (
                                <p className="text-muted-foreground text-center p-4">
                                  Pas de données de compétences pour le radar de
                                  l'année.
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                        <Card className="shadow-md">
                          <CardHeader>
                            <div className="flex items-center space-x-2">
                              {" "}
                              <Trophy className="h-6 w-6 text-primary" />
                              <CardTitle className="text-xl font-headline">
                                Top 5 Élèves - {selectedYear}
                              </CardTitle>
                            </div>
                            <CardDescription>
                              Classement des 5 meilleurs élèves par score Pix.
                              Cliquez sur un élève pour voir ses détails.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {yearStats.top5Students.length > 0 ? (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[50px]">
                                        #
                                      </TableHead>
                                      <TableHead>Prénom</TableHead>
                                      <TableHead>Nom</TableHead>
                                      <TableHead>Classe</TableHead>
                                      <TableHead className="text-right">
                                        Score Pix
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {yearStats.top5Students.map(
                                      (student, index) => (
                                        <TableRow
                                          key={student.numeroCertification}
                                          onClick={() =>
                                            handleTopStudentSelect(student)
                                          }
                                          className="cursor-pointer hover:bg-muted/80"
                                        >
                                          <TableCell className="font-medium">
                                            {index + 1}
                                          </TableCell>
                                          <TableCell>
                                            {student.prenom}
                                          </TableCell>
                                          <TableCell>{student.nom}</TableCell>
                                          <TableCell>
                                            {student.classe}
                                          </TableCell>
                                          <TableCell className="text-right font-semibold">
                                            {student.nombrePix}
                                          </TableCell>
                                        </TableRow>
                                      ),
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-center p-4">
                                Aucun élève dans le top 5.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      <div
                        id="pdf-page-2-content"
                        className="bg-card p-4 rounded-lg"
                      >
                        <Card className="shadow-md">
                          <CardHeader>
                            <div className="flex items-center space-x-2">
                              {" "}
                              <BarChartIcon className="h-6 w-6 text-primary" />
                              <CardTitle className="text-xl font-headline">
                                Moyenne par Compétence Détaillée (Année) -{" "}
                                {selectedYear}
                              </CardTitle>
                            </div>
                            <CardDescription>
                              {" "}
                              Score moyen de l'année {selectedYear} pour chacune
                              des 16 compétences (échelle 0-
                              {RADAR_CHART_FULL_MARK}).
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {yearStats.detailedSkillAverages &&
                            hasDetailedSkillDataForYear ? (
                              <div className="space-y-6">
                                {skillCategoriesForDetailedView.map(
                                  (category) => {
                                    const skillsInCategory =
                                      yearStats.detailedSkillAverages.filter(
                                        (skill) =>
                                          category.skills.includes(skill.code),
                                      );
                                    if (skillsInCategory.length === 0)
                                      return null;
                                    return (
                                      <div
                                        key={category.name}
                                        className="p-4 border rounded-lg bg-card shadow-sm"
                                      >
                                        <h4 className="text-lg font-semibold mb-3 flex items-center">
                                          {" "}
                                          <category.icon className="mr-2 h-5 w-5 text-primary" />{" "}
                                          {category.name}{" "}
                                        </h4>
                                        <ul className="space-y-3">
                                          {skillsInCategory.map((skill) => (
                                            <li key={skill.code}>
                                              <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm text-card-foreground/90">
                                                  {skill.name}
                                                </span>
                                                <span className="text-sm font-medium text-primary">
                                                  {" "}
                                                  {skill.averageScore.toFixed(
                                                    2,
                                                  )}{" "}
                                                  / {skill.fullMark}{" "}
                                                </span>
                                              </div>
                                              <Progress
                                                value={
                                                  (skill.averageScore /
                                                    skill.fullMark) *
                                                  100
                                                }
                                                className="h-2"
                                              />
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-center p-4">
                                Pas de données de compétences détaillées pour
                                l'année.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedStudentForModal && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Détail de l'Élève: {selectedStudentForModal.prenom}{" "}
                {selectedStudentForModal.nom}
              </DialogTitle>
              <DialogDescription>
                Classe: {selectedStudentForModal.classe} | Score Pix Total:{" "}
                {selectedStudentForModal.nombrePix}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-6">
              <Card className="shadow-md">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <RadarIcon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">
                      Performance par Domaine (Élève)
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Scores de l'élève par grand domaine (sur{" "}
                    {RADAR_CHART_FULL_MARK}).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {studentModalRadarData && hasSkillDataForStudentModalRadar ? (
                    <ChartContainer
                      config={studentModalRadarChartConfig}
                      className="h-[300px] w-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                          data={studentModalRadarData}
                        >
                          <PolarGrid />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fontSize: 11 }}
                          />
                          <PolarRadiusAxis
                            angle={30}
                            domain={[0, RADAR_CHART_FULL_MARK]}
                            allowDecimals={false}
                            tickCount={RADAR_CHART_FULL_MARK + 1}
                          />
                          <Radar
                            name="Score Élève"
                            dataKey="score"
                            stroke="hsl(var(--chart-2))"
                            fill="hsl(var(--chart-2))"
                            fillOpacity={0.6}
                          />
                          <RechartsTooltip content={<ChartTooltipContent />} />
                          <Legend
                            wrapperStyle={{
                              fontSize: "0.8rem",
                              paddingTop: "10px",
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  ) : (
                    <p className="text-muted-foreground text-center p-4">
                      Pas de données radar pour cet élève.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-md">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <BarChartIcon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">
                      Détail des Compétences (Élève)
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Scores de l'élève pour chacune des 16 compétences (sur{" "}
                    {RADAR_CHART_FULL_MARK}).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {skillCategoriesForDetailedView.map((category) => (
                    <div
                      key={category.name}
                      className="p-3 border rounded-lg shadow-sm bg-card mb-4 last:mb-0"
                    >
                      <h4 className="text-md font-semibold mb-2 text-primary flex items-center">
                        <category.icon className="mr-2 h-5 w-5" />
                        {category.name}
                      </h4>
                      <ul className="space-y-1.5 text-sm">
                        {category.skills.map((skillCode) => {
                          const skillValue = selectedStudentForModal[
                            skillCode as keyof PixStudentData
                          ] as string;
                          const score = parseInt(
                            skillValue === "-" || skillValue === ""
                              ? "0"
                              : skillValue,
                            10,
                          );
                          const percentage =
                            RADAR_CHART_FULL_MARK > 0
                              ? (score / RADAR_CHART_FULL_MARK) * 100
                              : 0;
                          return (
                            <li key={skillCode}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-card-foreground/90">
                                  {skillDetailsMap[skillCode]}
                                </span>
                                <span className="font-medium text-primary">
                                  {score} / {RADAR_CHART_FULL_MARK}
                                </span>
                              </div>
                              <Progress value={percentage} className="h-2" />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {!SKILL_CODES.some((code) => {
                    const val = selectedStudentForModal[
                      code as keyof PixStudentData
                    ] as string;
                    return val !== "0" && val !== "-" && val !== "";
                  }) && (
                    <p className="text-muted-foreground text-center p-4">
                      Aucun score de compétence détaillé disponible pour cet
                      élève.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Fermer
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
