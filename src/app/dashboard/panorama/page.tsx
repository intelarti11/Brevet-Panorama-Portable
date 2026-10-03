"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ComponentProps,
  type ElementType,
} from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Percent,
  Award,
  PieChart as PieChartIcon,
  BarChart2,
  GraduationCap,
  BookText,
  Calculator,
  Landmark,
  FlaskConical,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Users,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LabelList,
  type PieLabelRenderProps,
} from "recharts";
import {
  useFilters,
  ALL_ACADEMIC_YEARS_VALUE,
} from "@/contexts/FilterContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Loader2 } from "lucide-react";
import { formatChartPercentage } from "@/lib/chart-label-formatters";
import { buildBrevetPanoramaReportData } from "@/lib/brevet-panorama-report";

interface ScoreDistribution {
  gte15: number;
  gte10lt15: number;
  gte8lt10: number;
  lt8: number;
  count: number; // Total students with a score for this subject
}

interface SubjectScoreDistributions {
  francais: ScoreDistribution;
  maths: ScoreDistribution;
  histoireGeo: ScoreDistribution;
  sciences: ScoreDistribution;
}

interface Stats {
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
  scoreDistribution: SubjectScoreDistributions;
}

const initialScoreDistribution: ScoreDistribution = {
  gte15: 0,
  gte10lt15: 0,
  gte8lt10: 0,
  lt8: 0,
  count: 0,
};

const initialStats: Stats = {
  totalStudents: 0,
  admis: 0,
  refuse: 0,
  successRate: 0,
  mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
  mentionPercentages: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
  averageOverallScoreAdmitted: undefined,
  averageFrancais: undefined,
  countFrancais: 0,
  averageMaths: undefined,
  countMaths: 0,
  averageHistoireGeo: undefined,
  countHistoireGeo: 0,
  averageSciences: undefined,
  countSciences: 0,
  scoreDistribution: {
    francais: { ...initialScoreDistribution },
    maths: { ...initialScoreDistribution },
    histoireGeo: { ...initialScoreDistribution },
    sciences: { ...initialScoreDistribution },
  },
};

const ACTUAL_CHART_COLORS = {
  admis: "hsl(160, 82%, 40%)",
  refuse: "hsl(0, 84%, 60%)",
  tresBien: "hsl(49, 96%, 77%)",
  bien: "hsl(223, 78%, 48%)",
  assezBien: "hsl(38, 92%, 51%)",
  sansMention: "hsl(215, 9%, 68%)",
};

const SCORE_CHART_COLORS = {
  gte15: "hsl(140, 70%, 35%)",
  gte10lt15: "hsl(110, 50%, 65%)",
  gte8lt10: "hsl(45, 90%, 55%)",
  lt8: "hsl(0, 80%, 60%)",
};

const normalizeForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const lightenHslColor = (hslColor: string, amount: number): string => {
  if (!hslColor || !hslColor.startsWith("hsl")) return hslColor;
  const match = hslColor.match(
    /hsl\(\s*([\d.]+)\s*,\s*([\d.]+%)\s*,\s*([\d.]+%)\s*\)/,
  );
  if (!match) return hslColor;
  const [, h, s, l] = match;
  let lightness = parseFloat(l);
  lightness = Math.min(100, lightness + amount);
  return `hsl(${h}, ${s}, ${lightness}%)`;
};

const calculateScoreOutOf20 = (
  score: number | undefined,
  maxScore: number,
): number | undefined => {
  if (score === undefined || score === null || maxScore <= 0) return undefined;
  return (score / maxScore) * 20;
};

const categorizeScore = (
  scoreOutOf20: number | undefined,
  distribution: ScoreDistribution,
) => {
  if (scoreOutOf20 === undefined) return;
  distribution.count++;
  if (scoreOutOf20 >= 15) distribution.gte15++;
  else if (scoreOutOf20 >= 10) distribution.gte10lt15++;
  else if (scoreOutOf20 >= 8) distribution.gte8lt10++;
  else distribution.lt8++;
};

export default function PanoramaPage() {
  const { isLoading, error, students, selectedAcademicYear } = useFilters();

  const [stats, setStats] = useState<Stats>(initialStats);
  const [hoveredPieIndex, setHoveredPieIndex] = useState<number | null>(null);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredScorePie, setHoveredScorePie] = useState<{
    subject: keyof SubjectScoreDistributions;
    index: number | null;
  } | null>(null);

  const [isExportingReport, setIsExportingReport] = useState<"xlsx" | "pdf" | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (students.length === 0) {
      setStats(initialStats);
      return;
    }

    const newStats: Stats = {
      ...initialStats,
      mentions: { ...initialStats.mentions },
      mentionPercentages: { ...initialStats.mentionPercentages },
      scoreDistribution: {
        francais: { ...initialScoreDistribution },
        maths: { ...initialScoreDistribution },
        histoireGeo: { ...initialScoreDistribution },
        sciences: { ...initialScoreDistribution },
      },
    };
    newStats.totalStudents = students.length;

    const normalizedAdmisStr = normalizeForComparison("admis");
    const normalizedTresBienStr = normalizeForComparison("très bien");
    const normalizedAssezBienStr = normalizeForComparison("assez bien");
    const normalizedBienStr = normalizeForComparison("bien");

    let sumOverallScoresAdmitted = 0,
      countOverallScoresAdmitted = 0;
    let sumFrancais = 0,
      countFrancais = 0;
    let sumMaths = 0,
      countMaths = 0;
    let sumHistoireGeo = 0,
      countHistoireGeo = 0;
    let sumSciences = 0,
      countSciences = 0;

    students.forEach((student) => {
      const normalizedResultat = normalizeForComparison(student.resultat);
      if (normalizedResultat.includes(normalizedAdmisStr)) {
        newStats.admis++;
        if (student.moyenne !== undefined && student.moyenne !== null) {
          sumOverallScoresAdmitted += student.moyenne;
          countOverallScoresAdmitted++;
        }
        if (normalizedResultat.includes(normalizedTresBienStr)) {
          newStats.mentions.tresBien++;
        } else if (normalizedResultat.includes(normalizedAssezBienStr)) {
          newStats.mentions.assezBien++;
        } else if (normalizedResultat.includes(normalizedBienStr)) {
          newStats.mentions.bien++;
        } else {
          newStats.mentions.sansMention++;
        }
      } else if (normalizedResultat.includes("refuse")) {
        newStats.refuse++;
      }

      if (student.scoreFrancais !== undefined) {
        sumFrancais += student.scoreFrancais;
        countFrancais++;
        categorizeScore(
          calculateScoreOutOf20(student.scoreFrancais, 20),
          newStats.scoreDistribution.francais,
        );
      }
      if (student.scoreMaths !== undefined) {
        sumMaths += student.scoreMaths;
        countMaths++;
        categorizeScore(
          calculateScoreOutOf20(student.scoreMaths, 20),
          newStats.scoreDistribution.maths,
        );
      }
      if (student.scoreHistoireGeo !== undefined) {
        sumHistoireGeo += student.scoreHistoireGeo;
        countHistoireGeo++;
        categorizeScore(
          calculateScoreOutOf20(student.scoreHistoireGeo, 20),
          newStats.scoreDistribution.histoireGeo,
        );
      }
      if (student.scoreSciences !== undefined) {
        sumSciences += student.scoreSciences;
        countSciences++;
        categorizeScore(
          calculateScoreOutOf20(student.scoreSciences, 20),
          newStats.scoreDistribution.sciences,
        );
      }
    });

    const consideredForRate = newStats.admis + newStats.refuse;
    newStats.successRate =
      consideredForRate > 0
        ? parseFloat(((newStats.admis / consideredForRate) * 100).toFixed(1))
        : 0;

    if (newStats.admis > 0) {
      newStats.mentionPercentages.tresBien = parseFloat(
        ((newStats.mentions.tresBien / newStats.admis) * 100).toFixed(1),
      );
      newStats.mentionPercentages.bien = parseFloat(
        ((newStats.mentions.bien / newStats.admis) * 100).toFixed(1),
      );
      newStats.mentionPercentages.assezBien = parseFloat(
        ((newStats.mentions.assezBien / newStats.admis) * 100).toFixed(1),
      );
      newStats.mentionPercentages.sansMention = parseFloat(
        ((newStats.mentions.sansMention / newStats.admis) * 100).toFixed(1),
      );
    }

    newStats.averageOverallScoreAdmitted =
      countOverallScoresAdmitted > 0
        ? parseFloat(
            (sumOverallScoresAdmitted / countOverallScoresAdmitted).toFixed(1),
          )
        : undefined;
    newStats.averageFrancais =
      countFrancais > 0
        ? parseFloat((sumFrancais / countFrancais).toFixed(1))
        : undefined;
    newStats.countFrancais = countFrancais;
    newStats.averageMaths =
      countMaths > 0
        ? parseFloat((sumMaths / countMaths).toFixed(1))
        : undefined;
    newStats.countMaths = countMaths;
    newStats.averageHistoireGeo =
      countHistoireGeo > 0
        ? parseFloat((sumHistoireGeo / countHistoireGeo).toFixed(1))
        : undefined;
    newStats.countHistoireGeo = countHistoireGeo;
    newStats.averageSciences =
      countSciences > 0
        ? parseFloat((sumSciences / countSciences).toFixed(1))
        : undefined;
    newStats.countSciences = countSciences;

    setStats(newStats);
  }, [students]);

  const resultsChartData = useMemo(
    () =>
      [
        { name: "Admis", value: stats.admis, fill: ACTUAL_CHART_COLORS.admis },
        {
          name: "Refusé",
          value: stats.refuse,
          fill: ACTUAL_CHART_COLORS.refuse,
        },
      ].filter((item) => item.value > 0),
    [stats.admis, stats.refuse],
  );

  const mentionsChartData = useMemo(
    () =>
      [
        {
          name: "Très Bien",
          value: stats.mentions.tresBien,
          fill: ACTUAL_CHART_COLORS.tresBien,
          percentage: stats.mentionPercentages.tresBien,
        },
        {
          name: "Bien",
          value: stats.mentions.bien,
          fill: ACTUAL_CHART_COLORS.bien,
          percentage: stats.mentionPercentages.bien,
        },
        {
          name: "Assez Bien",
          value: stats.mentions.assezBien,
          fill: ACTUAL_CHART_COLORS.assezBien,
          percentage: stats.mentionPercentages.assezBien,
        },
        {
          name: "Sans Mention",
          value: stats.mentions.sansMention,
          fill: ACTUAL_CHART_COLORS.sansMention,
          percentage: stats.mentionPercentages.sansMention,
        },
      ].filter((item) => item.value > 0),
    [stats.mentions, stats.mentionPercentages],
  );

  const subjectScoreChartData = (
    subjectKey: keyof SubjectScoreDistributions,
  ) => {
    const distribution = stats.scoreDistribution[subjectKey];
    if (!distribution || distribution.count === 0) return [];
    return [
      {
        name: "≥ 15",
        value: distribution.gte15,
        fill: SCORE_CHART_COLORS.gte15,
        percentage: (distribution.gte15 / distribution.count) * 100,
      },
      {
        name: "10-14.9",
        value: distribution.gte10lt15,
        fill: SCORE_CHART_COLORS.gte10lt15,
        percentage: (distribution.gte10lt15 / distribution.count) * 100,
      },
      {
        name: "8-9.9",
        value: distribution.gte8lt10,
        fill: SCORE_CHART_COLORS.gte8lt10,
        percentage: (distribution.gte8lt10 / distribution.count) * 100,
      },
      {
        name: "< 8",
        value: distribution.lt8,
        fill: SCORE_CHART_COLORS.lt8,
        percentage: (distribution.lt8 / distribution.count) * 100,
      },
    ].filter((item) => item.value > 0);
  };

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
  ] satisfies NonNullable<ComponentProps<typeof ChartLegendContent>["payload"]>;

  const noDataForFilters = students.length === 0 && !isLoading;
  const reportYearLabel =
    selectedAcademicYear === ALL_ACADEMIC_YEARS_VALUE
      ? "Toutes années"
      : selectedAcademicYear;
  const reportData = useMemo(
    () => buildBrevetPanoramaReportData(students, reportYearLabel, stats),
    [reportYearLabel, stats, students],
  );

  const handleExportReport = useCallback(async (format: "xlsx" | "pdf") => {
    if (!selectedAcademicYear || noDataForFilters) {
      toast({
        variant: "destructive",
        title: "Exportation impossible",
        description: "Aucune donnée à exporter pour les filtres actuels.",
      });
      return;
    }

    setIsExportingReport(format);

    try {
      const { exportBrevetPanoramaFullPdf, exportBrevetPanoramaXlsx } = await import(
        "@/lib/brevet-panorama-full-export"
      );
      if (format === "xlsx") {
        exportBrevetPanoramaXlsx(reportData);
      } else {
        await exportBrevetPanoramaFullPdf(reportData);
      }
      toast({
        title: "Export terminé",
        description:
          format === "xlsx"
            ? "Le bilan complet Excel a été téléchargé."
            : "Le bilan complet PDF a été téléchargé.",
      });
    } catch (error) {
      console.error("Erreur lors de la génération du bilan complet:", error);
      toast({
        variant: "destructive",
        title: "Erreur d'exportation",
        description: "Une erreur est survenue lors de la création du bilan.",
      });
    } finally {
      setIsExportingReport(null);
    }
  }, [noDataForFilters, reportData, selectedAcademicYear, toast]);

  if (isLoading) {
    return <FullScreenLoader text="Chargement du panorama..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  const renderSubjectScorePieChart = (
    subjectKey: keyof SubjectScoreDistributions,
    title: string,
    Icon: ElementType,
    isForExport = false,
  ) => {
    const data = subjectScoreChartData(subjectKey);
    const totalCount = stats.scoreDistribution[subjectKey]?.count || 0;
    return (
      <Card className="shadow-md rounded-lg">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center text-xl text-primary">
            <Icon className="mr-2 h-5 w-5 text-primary" />
            Répartition Notes {title}
          </CardTitle>
          <CardDescription className="mt-1">
            Distribution des notes (/20) pour {totalCount} élèves.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {totalCount > 0 && data.length > 0 ? (
            <ChartContainer
              config={{}}
              className="mx-auto aspect-square max-h-[250px]"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _name, props) => (
                        <div className="flex flex-col">
                          <span className="font-semibold capitalize">
                            {props.payload?.name}
                          </span>
                          <span>
                            Nombre: {value} (
                            {props.payload?.percentage?.toFixed(1) ?? 0}%)
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  labelLine={false}
                  onMouseEnter={(_d, index) =>
                    setHoveredScorePie({ subject: subjectKey, index })
                  }
                  onMouseLeave={() => setHoveredScorePie(null)}
                  isAnimationActive={!isForExport}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-score-${subjectKey}-${index}`}
                      fill={
                        hoveredScorePie?.subject === subjectKey &&
                        hoveredScorePie?.index === index
                          ? lightenHslColor(entry.fill as string, 15)
                          : (entry.fill as string)
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="percentage"
                    position="inside"
                    formatter={(value) => formatChartPercentage(value, 5)}
                    className="fill-primary-foreground text-xs font-medium"
                    style={{ pointerEvents: "none" }}
                  />
                </Pie>
                <ChartLegend
                  content={
                    <ChartLegendContent
                      payload={scoreLegendPayload}
                      className="flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-4"
                    />
                  }
                />
              </PieChart>
            </ChartContainer>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              Pas de données de notes pour {title}.
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const StatsCards = () => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Nombre d'Élèves
          </CardTitle>
          <Users className="h-6 w-6 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">
            {stats.totalStudents}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            total des élèves pour la sélection
          </p>
        </CardContent>
      </Card>
      <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Taux de Réussite
          </CardTitle>
          <Percent className="h-6 w-6 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">
            {stats.successRate}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.admis} admis sur{" "}
            {stats.admis + stats.refuse > 0
              ? stats.admis + stats.refuse
              : stats.totalStudents}{" "}
            élèves
          </p>
        </CardContent>
      </Card>
      <Card className="group shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Moyenne Générale (Admis)
          </CardTitle>
          <GraduationCap className="h-6 w-6 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-4xl font-bold text-primary group-hover:scale-105 transition-transform duration-200 ease-in-out">
            {stats.averageOverallScoreAdmitted?.toFixed(1) ?? "N/A"}/20
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            moyenne des élèves admis
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const ResultsAndMentionsCharts = ({
    isForExport = false,
  }: {
    isForExport?: boolean;
  }) => (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
      <Card className="shadow-md rounded-lg">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center text-xl text-primary">
            <PieChartIcon className="mr-2 h-5 w-5" />
            Répartition des Résultats
          </CardTitle>
          <CardDescription className="mt-1">
            Distribution des élèves admis et refusés.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {stats.admis + stats.refuse > 0 ? (
            <ChartContainer
              config={{}}
              className="mx-auto aspect-square max-h-[300px]"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _name, props) => (
                        <div className="flex flex-col">
                          <span className="font-semibold capitalize">
                            {props.payload?.name}
                          </span>
                          <span>Nombre: {value}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={resultsChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={60}
                  labelLine={false}
                  onMouseEnter={(_data, index) => setHoveredPieIndex(index)}
                  onMouseLeave={() => setHoveredPieIndex(null)}
                  isAnimationActive={!isForExport}
                  label={({
                    cx,
                    cy,
                    midAngle = 0,
                    innerRadius = 0,
                    outerRadius = 0,
                    percent = 0,
                    name,
                    value,
                  }: PieLabelRenderProps) => {
                    const RADIAN = Math.PI / 180;
                    const radius =
                      innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    if (percent < 0.05) return null;
                    return (
                      <text
                        x={x}
                        y={y}
                        fill="hsl(var(--foreground))"
                        textAnchor={x > cx ? "start" : "end"}
                        dominantBaseline="central"
                        fontSize="12px"
                        fontWeight="medium"
                      >{`${name} (${value})`}</text>
                    );
                  }}
                >
                  {resultsChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        hoveredPieIndex === index
                          ? lightenHslColor(entry.fill as string, 15)
                          : (entry.fill as string)
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              Pas de données (admis/refusés) à afficher.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-md rounded-lg">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center text-xl text-primary">
            <BarChart2 className="mr-2 h-5 w-5" />
            Répartition des Mentions
          </CardTitle>
          <CardDescription className="mt-1">
            Distribution des mentions pour les élèves admis.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {stats.admis > 0 && mentionsChartData.length > 0 ? (
            <ChartContainer
              config={mentionsChartData.reduce(
                (acc, { name }) => ({ ...acc, [name]: { label: name } }),
                {},
              )}
              className="w-full h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mentionsChartData}
                  layout="vertical"
                  margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    dataKey="value"
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={70}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, _name, props) => (
                          <div className="flex flex-col p-1">
                            <span className="font-semibold">
                              {props.payload.name}
                            </span>
                            <span>Effectif: {value}</span>
                            <span>{props.payload.percentage}% des admis</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey="value"
                    radius={4}
                    onMouseEnter={(_data, index) => setHoveredBarIndex(index)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                    isAnimationActive={!isForExport}
                  >
                    {mentionsChartData.map((entry, index) => (
                      <Cell
                        key={`cell-mention-${index}`}
                        fill={
                          hoveredBarIndex === index
                            ? lightenHslColor(entry.fill as string, 15)
                            : (entry.fill as string)
                        }
                      />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      offset={8}
                      className="fill-foreground"
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              Pas d'élèves admis avec mention à afficher.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const SubjectScoreCharts = ({
    isForExport = false,
  }: {
    isForExport?: boolean;
  }) => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
      {renderSubjectScorePieChart(
        "francais",
        "Français",
        BookText,
        isForExport,
      )}
      {renderSubjectScorePieChart(
        "maths",
        "Mathématiques",
        Calculator,
        isForExport,
      )}
      {renderSubjectScorePieChart(
        "histoireGeo",
        "Histoire-Géo.",
        Landmark,
        isForExport,
      )}
      {renderSubjectScorePieChart(
        "sciences",
        "Sciences",
        FlaskConical,
        isForExport,
      )}
    </div>
  );

  const SubjectAverageCards = () => (
    <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
      <CardHeader className="p-6">
        <CardTitle className="text-xl text-primary">
          Moyennes par Matières Principales
        </CardTitle>
        <CardDescription className="mt-1">
          Toutes les notes sont ramenées sur 20 pour comparer les sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-6 pt-4 md:grid-cols-4 p-6">
        <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all hover:bg-muted/50 hover:scale-[1.02]">
          <BookText className="h-7 w-7 text-primary mb-2" />
          <p className="text-sm font-medium">Français</p>
          <p className="text-2xl font-bold mt-1 text-primary">
            {stats.averageFrancais?.toFixed(1) ?? "N/A"}
          </p>
          <p className="text-xs text-muted-foreground">
            ({stats.countFrancais ?? 0} élèves, /20)
          </p>
        </div>
        <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all hover:bg-muted/50 hover:scale-[1.02]">
          <Calculator className="h-7 w-7 text-primary mb-2" />
          <p className="text-sm font-medium">Mathématiques</p>
          <p className="text-2xl font-bold mt-1 text-primary">
            {stats.averageMaths?.toFixed(1) ?? "N/A"}
          </p>
          <p className="text-xs text-muted-foreground">
            ({stats.countMaths ?? 0} élèves, /20)
          </p>
        </div>
        <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all hover:bg-muted/50 hover:scale-[1.02]">
          <Landmark className="h-7 w-7 text-primary mb-2" />
          <p className="text-sm font-medium">Histoire-Géo.</p>
          <p className="text-2xl font-bold mt-1 text-primary">
            {stats.averageHistoireGeo?.toFixed(1) ?? "N/A"}
          </p>
          <p className="text-xs text-muted-foreground">
            ({stats.countHistoireGeo ?? 0} élèves, /20)
          </p>
        </div>
        <div className="group flex flex-col items-center text-center p-4 rounded-lg bg-muted/30 transition-all hover:bg-muted/50 hover:scale-[1.02]">
          <FlaskConical className="h-7 w-7 text-primary mb-2" />
          <p className="text-sm font-medium">Sciences</p>
          <p className="text-2xl font-bold mt-1 text-primary">
            {stats.averageSciences?.toFixed(1) ?? "N/A"}
          </p>
          <p className="text-xs text-muted-foreground">
            ({stats.countSciences ?? 0} élèves, /20)
          </p>
        </div>
      </CardContent>
    </Card>
  );

  const MentionsCards = () => (
    <Card className="shadow-md rounded-lg transition-all duration-200 ease-in-out hover:shadow-lg hover:ring-2 hover:ring-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
        <CardTitle className="text-xl font-medium text-primary">
          Mentions
        </CardTitle>
        <Award className="h-6 w-6 text-primary" />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 pt-4 sm:grid-cols-4 p-6 pb-6">
        <div className="group p-2 rounded-lg transition-all hover:bg-primary/10 hover:scale-[1.02]">
          <p className="text-sm font-semibold">Très Bien</p>
          <p className="text-4xl font-bold text-primary">
            {stats.mentions.tresBien}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.admis > 0 ? stats.mentionPercentages.tresBien : 0}% des admis
          </p>
        </div>
        <div className="group p-2 rounded-lg transition-all hover:bg-primary/10 hover:scale-[1.02]">
          <p className="text-sm font-semibold">Bien</p>
          <p className="text-4xl font-bold text-primary">
            {stats.mentions.bien}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.admis > 0 ? stats.mentionPercentages.bien : 0}% des admis
          </p>
        </div>
        <div className="group p-2 rounded-lg transition-all hover:bg-primary/10 hover:scale-[1.02]">
          <p className="text-sm font-semibold">Assez Bien</p>
          <p className="text-4xl font-bold text-primary">
            {stats.mentions.assezBien}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.admis > 0 ? stats.mentionPercentages.assezBien : 0}% des
            admis
          </p>
        </div>
        <div className="group p-2 rounded-lg transition-all hover:bg-primary/10 hover:scale-[1.02]">
          <p className="text-sm font-semibold">Sans Mention</p>
          <p className="text-4xl font-bold text-primary">
            {stats.mentions.sansMention}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.admis > 0 ? stats.mentionPercentages.sansMention : 0}% des
            admis
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="space-y-6 p-4 md:p-6">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">
              Panorama des Résultats
            </h1>
            <p className="text-muted-foreground mt-2">
              Visualisez les statistiques clés. Utilisez les filtres dans la
              barre latérale.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={Boolean(isExportingReport) || noDataForFilters}>
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
        </header>
        <div>
          {noDataForFilters ? (
            <Card className="shadow-md rounded-lg">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    Aucune donnée pour les filtres sélectionnés
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ajustez vos filtres ou importez des données.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <StatsCards />
              <ResultsAndMentionsCharts />
              <div className="mt-6">
                <h2 className="text-2xl font-semibold text-primary mb-4 tracking-tight">
                  Analyse des Notes par Matière (/20)
                </h2>
                <SubjectScoreCharts />
              </div>
              <SubjectAverageCards />
              <MentionsCards />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
