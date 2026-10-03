"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Loader2,
  AlertTriangle,
  Users,
  Percent,
  TrendingUp,
  BarChartHorizontalBig,
  BookText,
  Calculator,
  Landmark,
  FlaskConical,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  Cell,
} from "recharts";
import {
  useFilters,
  type ProcessedStudentData,
  ALL_SERIE_TYPES_VALUE,
  ALL_ESTABLISHMENTS_VALUE,
} from "@/contexts/FilterContext";
import {
  formatChartNumber,
  formatChartPercentage,
} from "@/lib/chart-label-formatters";

interface YearlyStat {
  year: string;
  totalStudents: number;
  admis: number;
  refuse: number;
  successRate: number;
  averageOverallScoreAdmitted?: number;
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
  subjectAverages: {
    francais?: number;
    maths?: number;
    histoireGeo?: number;
    sciences?: number;
  };
}

const MAX_YEARS_TO_DISPLAY = 10;

const ACTUAL_CHART_COLORS = {
  admis: "hsl(var(--chart-admis))",
  refuse: "hsl(var(--destructive))",
  tresBien: "hsl(var(--chart-tres-bien))",
  bien: "hsl(var(--chart-bien))",
  assezBien: "hsl(var(--chart-assez-bien))",
  sansMention: "hsl(var(--chart-sans-mention))",
  successRate: "hsl(var(--primary))",
  averageScore: "hsl(var(--secondary))",
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

const subjectDetails = [
  {
    key: "francais",
    name: "Français",
    maxScore: 20,
    icon: BookText,
    color: "hsl(var(--chart-1))",
  },
  {
    key: "maths",
    name: "Mathématiques",
    maxScore: 20,
    icon: Calculator,
    color: "hsl(var(--chart-2))",
  },
  {
    key: "histoireGeo",
    name: "Histoire-Géographie",
    maxScore: 20,
    icon: Landmark,
    color: "hsl(var(--chart-3))",
  },
  {
    key: "sciences",
    name: "Sciences",
    maxScore: 20,
    icon: FlaskConical,
    color: "hsl(var(--chart-4))",
  },
];

export default function PluriannuelPage() {
  const {
    isLoading,
    error,
    allStudents,
    selectedSerieType,
    selectedEstablishment,
  } = useFilters();

  const [yearlyData, setYearlyData] = useState<YearlyStat[]>([]);
  const [hoveredBar, setHoveredBar] = useState<{
    chart: string;
    year: string;
    index: number | null;
  } | null>(null);

  useEffect(() => {
    if (allStudents.length === 0) {
      setYearlyData([]);
      return;
    }

    let studentsToProcess = allStudents;
    if (selectedSerieType && selectedSerieType !== ALL_SERIE_TYPES_VALUE) {
      studentsToProcess = studentsToProcess.filter(
        (s) => s.serieType === selectedSerieType,
      );
    }
    if (
      selectedEstablishment &&
      selectedEstablishment !== ALL_ESTABLISHMENTS_VALUE
    ) {
      studentsToProcess = studentsToProcess.filter(
        (s) => s.etablissement === selectedEstablishment,
      );
    }

    const studentsByYear = studentsToProcess.reduce(
      (acc, student) => {
        const year = student.academicYear;
        if (year) {
          if (!acc[year]) acc[year] = [];
          acc[year].push(student);
        }
        return acc;
      },
      {} as Record<string, ProcessedStudentData[]>,
    );

    const yearsInData = Object.keys(studentsByYear).sort(
      (a, b) => parseInt(b) - parseInt(a),
    );
    const recentYears = yearsInData.slice(0, MAX_YEARS_TO_DISPLAY);

    const statsPerYear: YearlyStat[] = recentYears.map((year) => {
      const studentsForYear = studentsByYear[year];
      const stat: YearlyStat = {
        year: year!,
        totalStudents: studentsForYear.length,
        admis: 0,
        refuse: 0,
        successRate: 0,
        averageOverallScoreAdmitted: undefined,
        mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
        mentionPercentages: {
          tresBien: 0,
          bien: 0,
          assezBien: 0,
          sansMention: 0,
        },
        subjectAverages: {
          francais: undefined,
          maths: undefined,
          histoireGeo: undefined,
          sciences: undefined,
        },
      };

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

      const normalizedAdmisStr = normalizeForComparison("admis");
      const normalizedTresBienStr = normalizeForComparison("très bien");
      const normalizedAssezBienStr = normalizeForComparison("assez bien");
      const normalizedBienStr = normalizeForComparison("bien");

      studentsForYear.forEach((student) => {
        const normalizedResultat = normalizeForComparison(student.resultat);
        if (normalizedResultat.includes(normalizedAdmisStr)) {
          stat.admis++;
          if (student.moyenne) {
            sumOverallScoresAdmitted += student.moyenne;
            countOverallScoresAdmitted++;
          }
          if (normalizedResultat.includes(normalizedTresBienStr))
            stat.mentions.tresBien++;
          else if (normalizedResultat.includes(normalizedBienStr))
            stat.mentions.bien++;
          else if (normalizedResultat.includes(normalizedAssezBienStr))
            stat.mentions.assezBien++;
          else stat.mentions.sansMention++;
        } else if (normalizedResultat.includes("refuse")) {
          stat.refuse++;
        }
        if (student.scoreFrancais !== undefined) {
          sumFrancais += student.scoreFrancais;
          countFrancais++;
        }
        if (student.scoreMaths !== undefined) {
          sumMaths += student.scoreMaths;
          countMaths++;
        }
        if (student.scoreHistoireGeo !== undefined) {
          sumHistoireGeo += student.scoreHistoireGeo;
          countHistoireGeo++;
        }
        if (student.scoreSciences !== undefined) {
          sumSciences += student.scoreSciences;
          countSciences++;
        }
      });

      const consideredForRate = stat.admis + stat.refuse;
      if (consideredForRate > 0)
        stat.successRate = parseFloat(
          ((stat.admis / consideredForRate) * 100).toFixed(1),
        );
      if (stat.admis > 0) {
        stat.mentionPercentages.tresBien = parseFloat(
          ((stat.mentions.tresBien / stat.admis) * 100).toFixed(1),
        );
        stat.mentionPercentages.bien = parseFloat(
          ((stat.mentions.bien / stat.admis) * 100).toFixed(1),
        );
        stat.mentionPercentages.assezBien = parseFloat(
          ((stat.mentions.assezBien / stat.admis) * 100).toFixed(1),
        );
        stat.mentionPercentages.sansMention = parseFloat(
          ((stat.mentions.sansMention / stat.admis) * 100).toFixed(1),
        );
      }
      stat.averageOverallScoreAdmitted =
        countOverallScoresAdmitted > 0
          ? parseFloat(
              (sumOverallScoresAdmitted / countOverallScoresAdmitted).toFixed(
                1,
              ),
            )
          : undefined;

      stat.subjectAverages = {
        francais:
          countFrancais > 0
            ? parseFloat((sumFrancais / countFrancais).toFixed(1))
            : undefined,
        maths:
          countMaths > 0
            ? parseFloat((sumMaths / countMaths).toFixed(1))
            : undefined,
        histoireGeo:
          countHistoireGeo > 0
            ? parseFloat((sumHistoireGeo / countHistoireGeo).toFixed(1))
            : undefined,
        sciences:
          countSciences > 0
            ? parseFloat((sumSciences / countSciences).toFixed(1))
            : undefined,
      };

      return stat;
    });

    setYearlyData(
      statsPerYear.sort((a, b) => parseInt(a.year) - parseInt(b.year)),
    );
  }, [allStudents, selectedSerieType, selectedEstablishment]);

  const mentionsChartDataProcessed = useMemo(() => {
    return yearlyData.map((stat) => ({
      year: stat.year,
      "Très Bien": stat.mentionPercentages.tresBien,
      Bien: stat.mentionPercentages.bien,
      "Assez Bien": stat.mentionPercentages.assezBien,
      "Sans Mention": stat.mentionPercentages.sansMention,
    }));
  }, [yearlyData]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">
          Chargement des données pluriannuelles...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] p-1 md:p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-destructive mb-2">
          Erreur de chargement
        </h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
      </div>
    );
  }

  if (yearlyData.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-primary tracking-tight">
            Analyse Pluriannuelle
          </h1>
          <p className="text-muted-foreground mt-2">
            Comparaison des indicateurs sur les {MAX_YEARS_TO_DISPLAY} dernières
            années.
          </p>
        </header>
        <Card className="shadow-md rounded-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                Aucune donnée pluriannuelle à afficher
              </p>
              <p className="text-sm text-muted-foreground">
                Importez des données sur plusieurs années ou ajustez les
                filtres.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderCustomTooltip = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
      const yearStat = yearlyData.find((d) => d.year === label);
      return (
        <div className="bg-background border border-border shadow-lg rounded-md p-3 text-sm">
          <p className="font-semibold text-foreground mb-1">{`Année : ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={`item-${index}`}
              style={{ color: entry.color }}
            >{`${entry.name} : ${entry.value}${entry.name.includes("Moyenne") ? "/20" : "%"}`}</p>
          ))}
          {yearStat && (
            <p className="text-xs text-muted-foreground mt-1">
              Total: {yearStat.totalStudents} élèves
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderMentionsTooltip = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
      const yearStat = yearlyData.find((stat) => stat.year === label);
      return (
        <div className="bg-background border border-border shadow-lg rounded-md p-3 text-sm">
          <p className="font-semibold text-foreground mb-1">{`Année : ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={`item-${index}`}
              style={{ color: entry.fill || entry.color }}
            >{`${entry.name} : ${entry.value}%`}</p>
          ))}
          {yearStat && (
            <p className="text-xs text-muted-foreground mt-1">
              Total admis: {yearStat.admis}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderSubjectTooltip = ({ active, payload, label, maxScore }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border shadow-lg rounded-md p-3 text-sm">
          <p className="font-semibold text-foreground mb-1">{`Année : ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {`Moyenne : ${entry.value?.toFixed(1) ?? "N/A"} / ${maxScore}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary tracking-tight">
          Analyse Pluriannuelle
        </h1>
        <p className="text-muted-foreground mt-2">
          Comparaison des indicateurs clés sur les {yearlyData.length} dernières
          années disponibles.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md rounded-lg">
          <CardHeader className="p-6">
            <CardTitle className="flex items-center text-xl text-primary">
              <Percent className="mr-2 h-5 w-5" />
              Taux de Réussite Annuel
            </CardTitle>
            <CardDescription className="mt-1">
              Évolution du taux de réussite (admis / (admis + refusés)).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yearlyData}
                margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  unit="%"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  domain={[0, 100]}
                />
                <RechartsTooltip
                  content={renderCustomTooltip}
                  cursor={{ fill: "hsl(var(--accent))", fillOpacity: 0.3 }}
                />
                <Bar
                  dataKey="successRate"
                  name="Taux de Réussite"
                  radius={[4, 4, 0, 0]}
                  onMouseEnter={(_d, i) =>
                    setHoveredBar({
                      chart: "successRate",
                      year: yearlyData[i].year,
                      index: i,
                    })
                  }
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {yearlyData.map((_e, i) => (
                    <Cell
                      key={`cell-sr-${i}`}
                      fill={
                        hoveredBar?.chart === "successRate" &&
                        hoveredBar.index === i
                          ? lightenHslColor(ACTUAL_CHART_COLORS.successRate, 15)
                          : ACTUAL_CHART_COLORS.successRate
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="successRate"
                    position="top"
                    offset={5}
                    className="fill-foreground"
                    fontSize={11}
                    formatter={formatChartPercentage}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-md rounded-lg">
          <CardHeader className="p-6">
            <CardTitle className="flex items-center text-xl text-primary">
              <TrendingUp className="mr-2 h-5 w-5" />
              Moyenne Générale Annuelle (Admis)
            </CardTitle>
            <CardDescription className="mt-1">
              Évolution de la moyenne générale (/20) des élèves admis.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yearlyData}
                margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  unit="/20"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  domain={[0, 20]}
                />
                <RechartsTooltip
                  content={renderCustomTooltip}
                  cursor={{ fill: "hsl(var(--accent))", fillOpacity: 0.3 }}
                />
                <Bar
                  dataKey="averageOverallScoreAdmitted"
                  name="Moyenne Générale"
                  radius={[4, 4, 0, 0]}
                  onMouseEnter={(_d, i) =>
                    setHoveredBar({
                      chart: "averageScore",
                      year: yearlyData[i].year,
                      index: i,
                    })
                  }
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {yearlyData.map((_e, i) => (
                    <Cell
                      key={`cell-avg-${i}`}
                      fill={
                        hoveredBar?.chart === "averageScore" &&
                        hoveredBar.index === i
                          ? lightenHslColor(
                              ACTUAL_CHART_COLORS.averageScore,
                              15,
                            )
                          : ACTUAL_CHART_COLORS.averageScore
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="averageOverallScoreAdmitted"
                    position="top"
                    offset={5}
                    className="fill-foreground"
                    fontSize={11}
                    formatter={formatChartNumber}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-md rounded-lg">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center text-xl text-primary">
            <BarChartHorizontalBig className="mr-2 h-5 w-5" />
            Répartition Annuelle des Mentions (% des Admis)
          </CardTitle>
          <CardDescription className="mt-1">
            Pourcentage des élèves admis ayant obtenu chaque type de mention.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[400px] p-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={mentionsChartDataProcessed}
              layout="horizontal"
              margin={{ top: 5, right: 20, left: 0, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="year"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <YAxis
                unit="%"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                domain={[0, 100]}
              />
              <RechartsTooltip
                content={renderMentionsTooltip}
                cursor={{ fill: "hsl(var(--accent))", fillOpacity: 0.3 }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => (
                  <span style={{ color: "hsl(var(--foreground))" }}>
                    {value}
                  </span>
                )}
              />
              <Bar
                dataKey="Très Bien"
                stackId="a"
                fill={ACTUAL_CHART_COLORS.tresBien}
                name="Très Bien"
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="Très Bien"
                  position="insideTop"
                  className="fill-primary-foreground"
                  fontSize={10}
                  formatter={(value) => formatChartPercentage(value, 5)}
                />
              </Bar>
              <Bar
                dataKey="Bien"
                stackId="a"
                fill={ACTUAL_CHART_COLORS.bien}
                name="Bien"
              >
                <LabelList
                  dataKey="Bien"
                  position="insideTop"
                  className="fill-primary-foreground"
                  fontSize={10}
                  formatter={(value) => formatChartPercentage(value, 5)}
                />
              </Bar>
              <Bar
                dataKey="Assez Bien"
                stackId="a"
                fill={ACTUAL_CHART_COLORS.assezBien}
                name="Assez Bien"
              >
                <LabelList
                  dataKey="Assez Bien"
                  position="insideTop"
                  className="fill-background"
                  fontSize={10}
                  formatter={(value) => formatChartPercentage(value, 5)}
                />
              </Bar>
              <Bar
                dataKey="Sans Mention"
                stackId="a"
                fill={ACTUAL_CHART_COLORS.sansMention}
                name="Sans Mention"
                radius={[0, 0, 4, 4]}
              >
                <LabelList
                  dataKey="Sans Mention"
                  position="insideTop"
                  className="fill-primary-foreground"
                  fontSize={10}
                  formatter={(value) => formatChartPercentage(value, 5)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mt-8">
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">
          Évolution par Matière
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {subjectDetails.map((subject) => {
            const chartData = yearlyData.map((stat) => ({
              year: stat.year,
              average:
                stat.subjectAverages[
                  subject.key as keyof typeof stat.subjectAverages
                ],
            }));

            const Icon = subject.icon;

            return (
              <Card key={subject.key} className="shadow-md rounded-lg">
                <CardHeader className="p-6">
                  <CardTitle className="flex items-center text-xl text-primary">
                    <Icon className="mr-2 h-5 w-5" />
                    {subject.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Évolution de la moyenne ramenée sur {subject.maxScore}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] p-6 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 20, right: 20, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="year"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                      />
                      <YAxis
                        unit=""
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                        domain={[0, subject.maxScore]}
                      />
                      <RechartsTooltip
                        content={(props) =>
                          renderSubjectTooltip({
                            ...props,
                            maxScore: subject.maxScore,
                          })
                        }
                        cursor={{
                          fill: "hsl(var(--accent))",
                          fillOpacity: 0.3,
                        }}
                      />
                      <Bar
                        dataKey="average"
                        name="Moyenne"
                        radius={[2, 2, 0, 0]}
                        fill={subject.color}
                      >
                        <LabelList
                          dataKey="average"
                          position="top"
                          offset={5}
                          className="fill-foreground"
                          fontSize={10}
                          formatter={formatChartNumber}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
