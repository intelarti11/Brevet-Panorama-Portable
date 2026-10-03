"use client";

import React, { useState, useEffect } from "react";
import { collection, getDocs } from "@/lib/local/store";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Users,
  TrendingUp,
  Book,
  Calculator,
  Landmark,
  FlaskConical,
  Leaf,
  Cpu,
  Award,
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
} from "recharts";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  getBrevetConfigForYear,
  calculateBrevetBlancAverage,
  ALL_BREVET_SUBJECTS,
} from "@/lib/brevet-config";
import { formatChartNumber } from "@/lib/chart-label-formatters";

// Data Structures
interface YearlyStat {
  year: string;
  totalStudents: number;
  participationBb1: number;
  participationBb2: number;
  averageBb1?: number;
  averageBb2?: number;
  subjectAverages: {
    bb1: { [subject: string]: number | undefined };
    bb2: { [subject: string]: number | undefined };
  };
}

const MAX_YEARS_TO_DISPLAY = 10;

const PluriannuelBlancPage = () => {
  const [yearlyData, setYearlyData] = useState<YearlyStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const querySnapshot = await getDocs(collection(db, "BrevetBlanc"));
        const studentsByYear: Record<string, any[]> = {};

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const year = data.anneeScolaire;
          if (year) {
            if (!studentsByYear[year]) studentsByYear[year] = [];
            studentsByYear[year].push(data);
          }
        });

        const yearsInData = Object.keys(studentsByYear).sort(
          (a, b) => parseInt(b) - parseInt(a),
        );
        const recentYears = yearsInData.slice(0, MAX_YEARS_TO_DISPLAY);

        const statsPerYear: YearlyStat[] = recentYears.map((year) => {
          const studentsForYear = studentsByYear[year];
          const config = getBrevetConfigForYear(year);

          let participatingStudentsBb1 = 0;
          let participatingStudentsBb2 = 0;
          let sumOfStudentAveragesBb1 = 0;
          let sumOfStudentAveragesBb2 = 0;

          const subjectTotals: {
            bb1: { [subject: string]: { total: number; count: number } };
            bb2: { [subject: string]: { total: number; count: number } };
          } = { bb1: {}, bb2: {} };

          config.subjects.forEach((m) => {
            subjectTotals.bb1[m] = { total: 0, count: 0 };
            subjectTotals.bb2[m] = { total: 0, count: 0 };
          });

          studentsForYear.forEach((student) => {
            const avg1 = calculateBrevetBlancAverage(student, config, "bb1");
            if (avg1 !== undefined) {
              sumOfStudentAveragesBb1 += avg1;
              participatingStudentsBb1++;
            }
            const avg2 = calculateBrevetBlancAverage(student, config, "bb2");
            if (avg2 !== undefined) {
              sumOfStudentAveragesBb2 += avg2;
              participatingStudentsBb2++;
            }

            if (student.notes) {
              config.subjects.forEach((matiere) => {
                const noteBb1 = student.notes[matiere]?.bb1;
                const noteBb2 = student.notes[matiere]?.bb2;
                if (
                  noteBb1 !== undefined &&
                  noteBb1 !== null &&
                  !isNaN(noteBb1)
                ) {
                  subjectTotals.bb1[matiere].total += noteBb1;
                  subjectTotals.bb1[matiere].count++;
                }
                if (
                  noteBb2 !== undefined &&
                  noteBb2 !== null &&
                  !isNaN(noteBb2)
                ) {
                  subjectTotals.bb2[matiere].total += noteBb2;
                  subjectTotals.bb2[matiere].count++;
                }
              });
            }
          });

          const subjectAverages: {
            bb1: { [subject: string]: number | undefined };
            bb2: { [subject: string]: number | undefined };
          } = { bb1: {}, bb2: {} };

          config.subjects.forEach((m) => {
            const maxScore = config.maxScores[m];
            const { total: totalBb1, count: countBb1 } = subjectTotals.bb1[m];
            subjectAverages.bb1[m] =
              countBb1 > 0 ? (totalBb1 / countBb1 / maxScore) * 20 : undefined;

            const { total: totalBb2, count: countBb2 } = subjectTotals.bb2[m];
            subjectAverages.bb2[m] =
              countBb2 > 0 ? (totalBb2 / countBb2 / maxScore) * 20 : undefined;
          });

          return {
            year,
            totalStudents: studentsForYear.length,
            participationBb1: participatingStudentsBb1,
            participationBb2: participatingStudentsBb2,
            averageBb1:
              participatingStudentsBb1 > 0
                ? sumOfStudentAveragesBb1 / participatingStudentsBb1
                : undefined,
            averageBb2:
              participatingStudentsBb2 > 0
                ? sumOfStudentAveragesBb2 / participatingStudentsBb2
                : undefined,
            subjectAverages,
          };
        });

        setYearlyData(
          statsPerYear.sort((a, b) => parseInt(a.year) - parseInt(b.year)),
        );
      } catch (err: any) {
        setError(
          "Impossible de charger les données pluriannuelles. " + err.message,
        );
        toast({
          variant: "destructive",
          title: "Erreur",
          description: err.message,
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const renderCustomTooltip = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border shadow-lg rounded-md p-3 text-sm">
          <p className="font-semibold text-foreground mb-1">{`Année : ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {`${entry.name} : ${entry.value?.toFixed(2) ?? "N/A"}/20`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const getIconForSubject = (
    subject: string,
  ): React.ComponentType<{ className?: string }> => {
    if (subject.includes("Français")) return Book;
    if (subject.includes("Math")) return Calculator;
    if (subject.includes("Histoire")) return Landmark;
    if (subject.includes("EMC") || subject.includes("moral")) return Landmark;
    if (subject.includes("Physique")) return FlaskConical;
    if (subject.includes("Vie")) return Leaf;
    if (subject.includes("Technologie")) return Cpu;
    if (subject.includes("Oral")) return Award;
    return TrendingUp;
  };

  if (isLoading) {
    return <FullScreenLoader text="Chargement des données pluriannuelles..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  if (yearlyData.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-primary tracking-tight">
            Analyse Pluriannuelle du Brevet Blanc
          </h1>
          <p className="text-muted-foreground mt-2">
            Comparaison des moyennes sur les {MAX_YEARS_TO_DISPLAY} dernières
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
                Importez des données sur plusieurs années.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary tracking-tight">
          Analyse Pluriannuelle du Brevet Blanc
        </h1>
        <p className="text-muted-foreground mt-2">
          Comparaison des moyennes générales sur les {yearlyData.length}{" "}
          dernières années disponibles.
        </p>
      </header>

      <Card className="shadow-md rounded-lg">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center text-xl text-primary">
            <TrendingUp className="mr-2 h-5 w-5" />
            Évolution des Moyennes Générales
          </CardTitle>
          <CardDescription className="mt-1">
            Comparaison des moyennes générales (/20) pour le Brevet Blanc 1 et
            le Brevet Blanc 2.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[400px] p-6">
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
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => (
                  <span style={{ color: "hsl(var(--foreground))" }}>
                    {value}
                  </span>
                )}
              />

              <Bar
                dataKey="averageBb1"
                name="Moyenne BB1"
                radius={[4, 4, 0, 0]}
                fill="hsl(var(--secondary))"
              >
                <LabelList
                  dataKey="averageBb1"
                  position="top"
                  offset={5}
                  className="fill-foreground"
                  fontSize={11}
                  formatter={formatChartNumber}
                />
              </Bar>

              <Bar
                dataKey="averageBb2"
                name="Moyenne BB2"
                radius={[4, 4, 0, 0]}
                fill="hsl(var(--primary))"
              >
                <LabelList
                  dataKey="averageBb2"
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

      <div className="mt-8">
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">
          Évolution par Matière
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {ALL_BREVET_SUBJECTS.map((matiere) => {
            const subjectChartData = yearlyData.map((stat) => ({
              year: stat.year,
              averageBb1: stat.subjectAverages.bb1[matiere],
              averageBb2: stat.subjectAverages.bb2[matiere],
            }));

            if (
              !subjectChartData.some(
                (d) => d.averageBb1 !== undefined || d.averageBb2 !== undefined,
              )
            ) {
              return null;
            }

            const Icon = getIconForSubject(matiere);

            return (
              <Card key={matiere} className="shadow-md rounded-lg">
                <CardHeader className="p-6">
                  <CardTitle className="flex items-center text-xl text-primary">
                    <Icon className="mr-2 h-5 w-5" />
                    {matiere}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Évolution des moyennes (/20) pour les Brevets Blancs 1 et 2.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] p-6 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={subjectChartData}
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
                        unit="/20"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                        domain={[0, 20]}
                      />
                      <RechartsTooltip
                        content={renderCustomTooltip}
                        cursor={{
                          fill: "hsl(var(--accent))",
                          fillOpacity: 0.3,
                        }}
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
                        dataKey="averageBb1"
                        name="Moyenne BB1"
                        radius={[2, 2, 0, 0]}
                        fill="hsl(var(--secondary))"
                      >
                        <LabelList
                          dataKey="averageBb1"
                          position="top"
                          offset={5}
                          className="fill-foreground"
                          fontSize={10}
                          formatter={formatChartNumber}
                        />
                      </Bar>
                      <Bar
                        dataKey="averageBb2"
                        name="Moyenne BB2"
                        radius={[2, 2, 0, 0]}
                        fill="hsl(var(--primary))"
                      >
                        <LabelList
                          dataKey="averageBb2"
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
};

export default PluriannuelBlancPage;
