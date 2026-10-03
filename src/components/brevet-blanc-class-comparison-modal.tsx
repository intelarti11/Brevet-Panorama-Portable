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
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import type { BrevetConfig } from "@/lib/brevet-config";

// --- Data Structures & Constants ---
interface ClassAverages {
  [className: string]: {
    [subject: string]: { bb1?: number; bb2?: number };
  };
}

interface OverallClassAverages {
  [className: string]: { bb1?: number; bb2?: number };
}

const barChartConfig = {
  bb1: { label: "Moyenne BB1", color: "hsl(var(--secondary))" },
  bb2: { label: "Moyenne BB2", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

// --- Modal Component ---
interface BrevetBlancClassComparisonModalProps {
  overallAverages: OverallClassAverages;
  subjectAverages: ClassAverages;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  config: BrevetConfig;
}

export function BrevetBlancClassComparisonModal({
  overallAverages,
  subjectAverages,
  isOpen,
  onOpenChange,
  config,
}: BrevetBlancClassComparisonModalProps) {
  const overallChartData = useMemo(() => {
    return Object.entries(overallAverages)
      .map(([className, averages]) => ({
        name: className,
        bb1: averages.bb1,
        bb2: averages.bb2,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [overallAverages]);

  const subjectChartData = useMemo(() => {
    const dataBySubject: {
      [subject: string]: { name: string; bb1?: number; bb2?: number }[];
    } = {};
    config.subjects.forEach((subject) => {
      dataBySubject[subject] = Object.entries(subjectAverages)
        .map(([className, classSubjAvgs]) => {
          const averages = classSubjAvgs[subject];
          return {
            name: className,
            bb1: averages?.bb1,
            bb2: averages?.bb2,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    });
    return dataBySubject;
  }, [subjectAverages, config.subjects]);

  const grandTotalAverages = useMemo(() => {
    const totalAvgs = {
      bb1: { sum: 0, count: 0 },
      bb2: { sum: 0, count: 0 },
    };

    Object.values(overallAverages).forEach((avg) => {
      if (avg.bb1 !== undefined && !isNaN(avg.bb1)) {
        totalAvgs.bb1.sum += avg.bb1;
        totalAvgs.bb1.count++;
      }
      if (avg.bb2 !== undefined && !isNaN(avg.bb2)) {
        totalAvgs.bb2.sum += avg.bb2;
        totalAvgs.bb2.count++;
      }
    });

    return {
      bb1:
        totalAvgs.bb1.count > 0
          ? totalAvgs.bb1.sum / totalAvgs.bb1.count
          : undefined,
      bb2:
        totalAvgs.bb2.count > 0
          ? totalAvgs.bb2.sum / totalAvgs.bb2.count
          : undefined,
    };
  }, [overallAverages]);

  const grandTotalSubjectAverages = useMemo(() => {
    const totals: {
      [subject: string]: {
        bb1: { sum: number; count: number };
        bb2: { sum: number; count: number };
      };
    } = {};

    config.subjects.forEach((subject) => {
      totals[subject] = {
        bb1: { sum: 0, count: 0 },
        bb2: { sum: 0, count: 0 },
      };

      Object.values(subjectAverages).forEach((classSubjAvgs) => {
        const subjAvg = classSubjAvgs[subject];
        if (subjAvg) {
          if (subjAvg.bb1 !== undefined && !isNaN(subjAvg.bb1)) {
            totals[subject].bb1.sum += subjAvg.bb1;
            totals[subject].bb1.count++;
          }
          if (subjAvg.bb2 !== undefined && !isNaN(subjAvg.bb2)) {
            totals[subject].bb2.sum += subjAvg.bb2;
            totals[subject].bb2.count++;
          }
        }
      });
    });

    const finalAverages: { [subject: string]: { bb1?: number; bb2?: number } } =
      {};
    config.subjects.forEach((subject) => {
      finalAverages[subject] = {
        bb1:
          totals[subject].bb1.count > 0
            ? totals[subject].bb1.sum / totals[subject].bb1.count
            : undefined,
        bb2:
          totals[subject].bb2.count > 0
            ? totals[subject].bb2.sum / totals[subject].bb2.count
            : undefined,
      };
    });

    return finalAverages;
  }, [subjectAverages, config.subjects]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-2xl font-semibold text-primary">
            Comparaison des Classes
          </DialogTitle>
          <DialogDescription>
            Analyse comparative des moyennes des classes pour les deux brevets
            blancs.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
          <Card>
            <CardHeader>
              <CardTitle>Moyennes Générales par Classe (/20)</CardTitle>
              <CardDescription>
                Comparaison des moyennes générales de chaque classe. La ligne
                pointillée représente la moyenne de toutes les classes.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ChartContainer config={barChartConfig} className="w-full h-full">
                <ResponsiveContainer>
                  <BarChart data={overallChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} tickMargin={5} />
                    <YAxis domain={[0, 20]} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    {grandTotalAverages.bb1 !== undefined && (
                      <ReferenceLine
                        y={grandTotalAverages.bb1}
                        stroke="var(--color-bb1)"
                        strokeDasharray="3 3"
                      />
                    )}
                    {grandTotalAverages.bb2 !== undefined && (
                      <ReferenceLine
                        y={grandTotalAverages.bb2}
                        stroke="var(--color-bb2)"
                        strokeDasharray="3 3"
                      />
                    )}
                    <Bar
                      dataKey="bb1"
                      name="Moyenne BB1"
                      fill="var(--color-bb1)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="bb2"
                      name="Moyenne BB2"
                      fill="var(--color-bb2)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="mt-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">
              Comparaison par Matière (/20)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {config.subjects.map((matiere) => {
                const data = subjectChartData[matiere];
                const averagesForSubject = grandTotalSubjectAverages[matiere];
                return (
                  <Card key={matiere}>
                    <CardHeader>
                      <CardTitle className="text-lg">{matiere}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ChartContainer
                        config={barChartConfig}
                        className="w-full h-full"
                      >
                        <ResponsiveContainer>
                          <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              fontSize={12}
                              tickMargin={5}
                            />
                            <YAxis domain={[0, 20]} fontSize={12} />
                            <Tooltip content={<ChartTooltipContent />} />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            {averagesForSubject?.bb1 !== undefined && (
                              <ReferenceLine
                                y={averagesForSubject.bb1}
                                stroke="var(--color-bb1)"
                                strokeDasharray="2 2"
                              />
                            )}
                            {averagesForSubject?.bb2 !== undefined && (
                              <ReferenceLine
                                y={averagesForSubject.bb2}
                                stroke="var(--color-bb2)"
                                strokeDasharray="2 2"
                              />
                            )}
                            <Bar
                              dataKey="bb1"
                              name="BB1"
                              fill="var(--color-bb1)"
                              radius={[2, 2, 0, 0]}
                            />
                            <Bar
                              dataKey="bb2"
                              name="BB2"
                              fill="var(--color-bb2)"
                              radius={[2, 2, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
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
