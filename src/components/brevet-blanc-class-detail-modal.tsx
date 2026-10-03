"use client";

import { useMemo } from "react";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  calculateBrevetBlancAverage,
  type BrevetConfig,
} from "@/lib/brevet-config";

// --- Data Structures & Constants ---
interface Student {
  id: string;
  notes?: { [subject: string]: { bb1?: number; bb2?: number } };
}

interface ScoreDistribution {
  gte15: number;
  gte10lt15: number;
  gte8lt10: number;
  lt8: number;
  count: number;
}

const SCORE_CHART_COLORS = {
  gte15: "hsl(140, 70%, 35%)",
  gte10lt15: "hsl(110, 50%, 65%)",
  gte8lt10: "hsl(45, 90%, 55%)",
  lt8: "hsl(0, 80%, 60%)",
};
const initialScoreDistribution: ScoreDistribution = {
  gte15: 0,
  gte10lt15: 0,
  gte8lt10: 0,
  lt8: 0,
  count: 0,
};
const pieChartConfig = {
  items: { label: "Notes" },
  gte15: { label: "≥ 15", color: SCORE_CHART_COLORS.gte15 },
  gte10lt15: { label: "10-14.9", color: SCORE_CHART_COLORS.gte10lt15 },
  gte8lt10: { label: "8-9.9", color: SCORE_CHART_COLORS.gte8lt10 },
  lt8: { label: "< 8", color: SCORE_CHART_COLORS.lt8 },
} satisfies ChartConfig;

// --- Modal Component ---
interface BrevetBlancClassDetailModalProps {
  students: Student[];
  className: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  config: BrevetConfig;
}

export function BrevetBlancClassDetailModal({
  students,
  className,
  isOpen,
  onOpenChange,
  config,
}: BrevetBlancClassDetailModalProps) {
  const classStats = useMemo(() => {
    if (!students || students.length === 0) return null;

    let globalTotalScoreBb1 = 0,
      participantCountBb1 = 0;
    let globalTotalScoreBb2 = 0,
      participantCountBb2 = 0;
    const overallDistributionBb1: ScoreDistribution = {
      ...initialScoreDistribution,
    };
    const overallDistributionBb2: ScoreDistribution = {
      ...initialScoreDistribution,
    };

    const subjectAverages: {
      [subject: string]: { bb1?: number; bb2?: number };
    } = {};
    config.subjects.forEach((matiere) => {
      let totalBb1 = 0,
        countBb1 = 0;
      let totalBb2 = 0,
        countBb2 = 0;
      students.forEach((student) => {
        const noteBb1 = student.notes?.[matiere]?.bb1;
        const noteBb2 = student.notes?.[matiere]?.bb2;
        if (noteBb1 !== undefined && noteBb1 !== null && !isNaN(noteBb1)) {
          totalBb1 += noteBb1;
          countBb1++;
        }
        if (noteBb2 !== undefined && noteBb2 !== null && !isNaN(noteBb2)) {
          totalBb2 += noteBb2;
          countBb2++;
        }
      });
      subjectAverages[matiere] = {
        bb1: countBb1 > 0 ? totalBb1 / countBb1 : undefined,
        bb2: countBb2 > 0 ? totalBb2 / countBb2 : undefined,
      };
    });

    students.forEach((student) => {
      const averageBb1 = calculateBrevetBlancAverage(student, config, "bb1");
      if (averageBb1 !== undefined) {
        globalTotalScoreBb1 += averageBb1;
        participantCountBb1++;
        if (averageBb1 >= 15) overallDistributionBb1.gte15++;
        else if (averageBb1 >= 10) overallDistributionBb1.gte10lt15++;
        else if (averageBb1 >= 8) overallDistributionBb1.gte8lt10++;
        else overallDistributionBb1.lt8++;
        overallDistributionBb1.count++;
      }

      const averageBb2 = calculateBrevetBlancAverage(student, config, "bb2");
      if (averageBb2 !== undefined) {
        globalTotalScoreBb2 += averageBb2;
        participantCountBb2++;
        if (averageBb2 >= 15) overallDistributionBb2.gte15++;
        else if (averageBb2 >= 10) overallDistributionBb2.gte10lt15++;
        else if (averageBb2 >= 8) overallDistributionBb2.gte8lt10++;
        else overallDistributionBb2.lt8++;
        overallDistributionBb2.count++;
      }
    });

    return {
      averageBb1:
        participantCountBb1 > 0
          ? globalTotalScoreBb1 / participantCountBb1
          : undefined,
      averageBb2:
        participantCountBb2 > 0
          ? globalTotalScoreBb2 / participantCountBb2
          : undefined,
      distributionBb1: overallDistributionBb1,
      distributionBb2: overallDistributionBb2,
      subjectAverages,
    };
  }, [students, config]);

  const scoreDistributionPieData = (dist?: ScoreDistribution) => {
    if (!dist || dist.count === 0) return [];
    return [
      { name: "≥ 15", value: dist.gte15, key: "gte15" },
      { name: "10-14.9", value: dist.gte10lt15, key: "gte10lt15" },
      { name: "8-9.9", value: dist.gte8lt10, key: "gte8lt10" },
      { name: "< 8", value: dist.lt8, key: "lt8" },
    ].filter((item) => item.value > 0);
  };

  if (!isOpen || !classStats) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-2xl font-semibold text-primary">
            Panorama de la Classe: {className}
          </DialogTitle>
          <DialogDescription>
            {students.length} élèves dans cette classe.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Moyenne BB1</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {classStats.averageBb1?.toFixed(2) ?? "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Moyenne BB2</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {classStats.averageBb2?.toFixed(2) ?? "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Progression</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-success">
                  {classStats.averageBb2 && classStats.averageBb1
                    ? (classStats.averageBb2 - classStats.averageBb1).toFixed(2)
                    : "N/A"}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Répartition des Moyennes (BB1)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[250px]">
                {classStats.distributionBb1.count > 0 ? (
                  <ChartContainer
                    config={pieChartConfig}
                    className="w-full h-full"
                  >
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={scoreDistributionPieData(
                            classStats.distributionBb1,
                          )}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                        >
                          <ChartTooltip
                            content={
                              <ChartTooltipContent nameKey="name" hideLabel />
                            }
                          />
                          {scoreDistributionPieData(
                            classStats.distributionBb1,
                          ).map((entry) => (
                            <Cell
                              key={`cell-bb1-${entry.key}`}
                              fill={
                                SCORE_CHART_COLORS[
                                  entry.key as keyof typeof SCORE_CHART_COLORS
                                ]
                              }
                            />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <p className="text-center text-muted-foreground p-8">
                    Pas de données pour BB1.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Répartition des Moyennes (BB2)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[250px]">
                {classStats.distributionBb2.count > 0 ? (
                  <ChartContainer
                    config={pieChartConfig}
                    className="w-full h-full"
                  >
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={scoreDistributionPieData(
                            classStats.distributionBb2,
                          )}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                        >
                          <ChartTooltip
                            content={
                              <ChartTooltipContent nameKey="name" hideLabel />
                            }
                          />
                          {scoreDistributionPieData(
                            classStats.distributionBb2,
                          ).map((entry) => (
                            <Cell
                              key={`cell-bb2-${entry.key}`}
                              fill={
                                SCORE_CHART_COLORS[
                                  entry.key as keyof typeof SCORE_CHART_COLORS
                                ]
                              }
                            />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <p className="text-center text-muted-foreground p-8">
                    Pas de données pour BB2.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">
              Moyennes par Matière
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {classStats.subjectAverages &&
                config.subjects.map((matiere) => {
                  const averages = classStats.subjectAverages?.[matiere];
                  if (!averages) return null;
                  return (
                    <Card key={matiere}>
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium">
                          {config.abbreviations[matiere] || matiere}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          sur {config.maxScores[matiere]} points
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-muted-foreground">
                            Moy. BB1:
                          </span>
                          <span className="text-lg font-bold">
                            {averages.bb1?.toFixed(1) ?? "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-muted-foreground">
                            Moy. BB2:
                          </span>
                          <span className="text-lg font-bold text-success">
                            {averages.bb2?.toFixed(1) ?? "N/A"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Fermer
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
