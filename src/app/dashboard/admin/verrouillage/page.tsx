"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {httpsCallable} from "@/lib/local/functions";
import {
  Loader2,
  LockKeyhole,
  RefreshCw,
  Shapes,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {Label} from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {ErrorDisplay} from "@/components/ui/error-display";
import {FullScreenLoader} from "@/components/ui/full-screen-loader";
import {useToast} from "@/hooks/use-toast";
import {getCallableErrorMessage} from "@/lib/firebase-callable-error";
import {functions as functionsInstance} from "@/lib/firebase";
import {
  type BrevetBlancLockStatus,
  type BrevetExam,
  formatBrevetExamLabel,
  getBrevetExamLocks,
  getCurrentBrevetLockYear,
} from "@/lib/brevet-blanc-lock";
import {
  type DataLockStatus,
  type LockableYearModule,
  type LockableYearsByModule,
  formatLockableModuleLabel,
  isDataYearLocked,
  normalizeDataLockStatus,
} from "@/lib/data-lock";

interface LockManagementResponse {
  success: boolean;
  brevetBlancLockStatus: BrevetBlancLockStatus;
  dataLockStatus: DataLockStatus;
  availableYears: LockableYearsByModule;
}

interface SetLockResponse {
  success: boolean;
  message: string;
}

const BREVET_EXAMS: BrevetExam[] = ["bb1", "bb2"];
const MODULES: LockableYearModule[] = ["brevet", "pix"];

function getInitialAvailableYears(currentYear: string): LockableYearsByModule {
  return {
    brevetBlanc: [currentYear],
    brevet: [currentYear],
    pix: [currentYear],
  };
}

export default function AdminVerrouillagePage() {
  const {toast} = useToast();
  const currentYear = useMemo(() => getCurrentBrevetLockYear(), []);

  const [brevetBlancLockStatus, setBrevetBlancLockStatus] =
    useState<BrevetBlancLockStatus>({});
  const [dataLockStatus, setDataLockStatus] = useState<DataLockStatus>({
    brevet: {},
    pix: {},
  });
  const [availableYears, setAvailableYears] = useState<LockableYearsByModule>(
    getInitialAvailableYears(currentYear)
  );

  const [selectedBrevetBlancYear, setSelectedBrevetBlancYear] =
    useState<string>(currentYear);
  const [selectedBrevetYear, setSelectedBrevetYear] = useState<string>(currentYear);
  const [selectedPixYear, setSelectedPixYear] = useState<string>(currentYear);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const callGetLockManagementData = useMemo(
    () =>
      functionsInstance
        ? httpsCallable<void, LockManagementResponse>(
            functionsInstance,
            "getLockManagementData"
          )
        : null,
    []
  );

  const callSetBrevetBlancLockStatus = useMemo(
    () =>
      functionsInstance
        ? httpsCallable<
            {year: string; exam: BrevetExam; locked: boolean},
            SetLockResponse
          >(functionsInstance, "setBrevetBlancLockStatus")
        : null,
    []
  );

  const callSetDataLockStatus = useMemo(
    () =>
      functionsInstance
        ? httpsCallable<
            {module: LockableYearModule; year: string; locked: boolean},
            SetLockResponse
          >(functionsInstance, "setDataLockStatus")
        : null,
    []
  );

  const currentBrevetBlancLocks = useMemo(
    () => getBrevetExamLocks(brevetBlancLockStatus, selectedBrevetBlancYear),
    [brevetBlancLockStatus, selectedBrevetBlancYear]
  );

  const fetchLockManagementData = useCallback(
    async (showLoader = true) => {
      if (!callGetLockManagementData) {
        const message = "Service de verrouillage non disponible.";
        setError(message);
        setIsLoading(false);
        return;
      }

      if (showLoader) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await callGetLockManagementData();
        if (!result.data.success) {
          throw new Error("Impossible de charger les verrouillages.");
        }

        const nextAvailableYears = result.data.availableYears ??
          getInitialAvailableYears(currentYear);
        const nextBrevetBlancLocks = result.data.brevetBlancLockStatus ?? {};
        const nextDataLocks = normalizeDataLockStatus(result.data.dataLockStatus);

        setAvailableYears(nextAvailableYears);
        setBrevetBlancLockStatus(nextBrevetBlancLocks);
        setDataLockStatus(nextDataLocks);

        setSelectedBrevetBlancYear((previousYear) =>
          nextAvailableYears.brevetBlanc.includes(previousYear) ?
            previousYear :
            nextAvailableYears.brevetBlanc[0] ?? currentYear
        );
        setSelectedBrevetYear((previousYear) =>
          nextAvailableYears.brevet.includes(previousYear) ?
            previousYear :
            nextAvailableYears.brevet[0] ?? currentYear
        );
        setSelectedPixYear((previousYear) =>
          nextAvailableYears.pix.includes(previousYear) ?
            previousYear :
            nextAvailableYears.pix[0] ?? currentYear
        );
      } catch (err: unknown) {
        const message = getCallableErrorMessage(
          err,
          "Impossible de charger la page de verrouillage.",
          "getLockManagementData"
        );
        setError(message);
        toast({
          variant: "destructive",
          title: "Chargement impossible",
          description: message,
          duration: 7000,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [callGetLockManagementData, currentYear, toast]
  );

  useEffect(() => {
    fetchLockManagementData(true);
  }, [fetchLockManagementData]);

  const handleBrevetBlancToggle = async (
    year: string,
    exam: BrevetExam,
    locked: boolean
  ) => {
    if (!callSetBrevetBlancLockStatus) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Service de verrouillage non disponible.",
      });
      return;
    }

    const actionKey = `bb:${year}:${exam}`;
    setActionLoading((previous) => ({...previous, [actionKey]: true}));

    try {
      const result = await callSetBrevetBlancLockStatus({year, exam, locked});
      if (!result.data.success) {
        throw new Error(result.data.message || "Mise a jour impossible.");
      }

      setBrevetBlancLockStatus((previous) => ({
        ...previous,
        [year]: {
          ...getBrevetExamLocks(previous, year),
          [exam]: locked,
        },
      }));
      toast({title: "Verrouillage mis a jour", description: result.data.message});
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Mise a jour impossible",
        description: getCallableErrorMessage(
          err,
          "Impossible de modifier le verrou du brevet blanc.",
          "setBrevetBlancLockStatus"
        ),
        duration: 7000,
      });
    } finally {
      setActionLoading((previous) => ({...previous, [actionKey]: false}));
    }
  };

  const handleDataLockToggle = async (
    module: LockableYearModule,
    year: string,
    locked: boolean
  ) => {
    if (!callSetDataLockStatus) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Service de verrouillage non disponible.",
      });
      return;
    }

    const actionKey = `${module}:${year}`;
    setActionLoading((previous) => ({...previous, [actionKey]: true}));

    try {
      const result = await callSetDataLockStatus({module, year, locked});
      if (!result.data.success) {
        throw new Error(result.data.message || "Mise a jour impossible.");
      }

      setDataLockStatus((previous) => ({
        ...previous,
        [module]: {
          ...previous[module],
          [year]: locked,
        },
      }));
      toast({title: "Verrouillage mis a jour", description: result.data.message});
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Mise a jour impossible",
        description: getCallableErrorMessage(
          err,
          "Impossible de modifier le verrouillage.",
          "setDataLockStatus"
        ),
        duration: 7000,
      });
    } finally {
      setActionLoading((previous) => ({...previous, [actionKey]: false}));
    }
  };

  if (isLoading) {
    return <FullScreenLoader text="Chargement des verrouillages..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={() => fetchLockManagementData(true)} />;
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Verrouillage des annees
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gere les annees en memoire pour la saisie et les imports. Le cas par
            cas admin reste l'outil d'exception.
          </p>
        </div>
        <Button
          onClick={() => fetchLockManagementData(true)}
          variant="outline"
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
            Brevet blanc
          </CardTitle>
          <CardDescription>
            Selectionne une annee deja presente en base ou l&apos;annee courante,
            puis verrouille BB1 et BB2 separement pour la saisie des notes et
            l&apos;import manuel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="brevet-blanc-lock-year">Annee a piloter</Label>
            <Select
              value={selectedBrevetBlancYear}
              onValueChange={setSelectedBrevetBlancYear}
            >
              <SelectTrigger id="brevet-blanc-lock-year">
                <SelectValue placeholder="Choisir une annee" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.brevetBlanc.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {BREVET_EXAMS.map((exam) => {
              const isLocked = currentBrevetBlancLocks[exam];
              const actionKey = `bb:${selectedBrevetBlancYear}:${exam}`;

              return (
                <div
                  key={exam}
                  className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Label className="font-medium text-base">
                      {formatBrevetExamLabel(exam)}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {isLocked ? "Saisie fermee" : "Saisie ouverte"} pour{" "}
                      {selectedBrevetBlancYear}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-semibold transition-colors ${
                        isLocked ? "text-destructive" : "text-green-600"
                      }`}
                    >
                      {isLocked ? "Fermee" : "Ouverte"}
                    </span>
                    <Button
                      variant={isLocked ? "outline" : "destructive"}
                      onClick={() =>
                        handleBrevetBlancToggle(
                          selectedBrevetBlancYear,
                          exam,
                          !isLocked
                        )
                      }
                      disabled={actionLoading[actionKey]}
                    >
                      {actionLoading[actionKey] ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LockKeyhole className="mr-2 h-4 w-4" />
                      )}
                      {isLocked ? "Rouvrir" : "Fermer"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {MODULES.map((module) => {
          const selectedYear = module === "brevet" ? selectedBrevetYear : selectedPixYear;
          const setSelectedYear =
            module === "brevet" ? setSelectedBrevetYear : setSelectedPixYear;
          const years = availableYears[module];
          const isLocked = isDataYearLocked(dataLockStatus, module, selectedYear);
          const actionKey = `${module}:${selectedYear}`;

          return (
            <Card key={module} className="shadow-lg rounded-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center">
                  {module === "brevet" ? (
                    <Trophy className="mr-2 h-5 w-5 text-primary" />
                  ) : (
                    <Shapes className="mr-2 h-5 w-5 text-primary" />
                  )}
                  {formatLockableModuleLabel(module)}
                </CardTitle>
                <CardDescription>
                  Verrouille ou deverrouille une annee deja en memoire pour
                  proteger les imports de {formatLockableModuleLabel(module).toLowerCase()}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="max-w-xs space-y-2">
                  <Label htmlFor={`${module}-lock-year`}>Annee en memoire</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger id={`${module}-lock-year`}>
                      <SelectValue placeholder="Choisir une annee" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label className="font-medium text-base">
                      {selectedYear}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {isLocked ? "Import ferme" : "Import ouvert"} pour cette annee
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-semibold transition-colors ${
                        isLocked ? "text-destructive" : "text-green-600"
                      }`}
                    >
                      {isLocked ? "Ferme" : "Ouvert"}
                    </span>
                    <Button
                      variant={isLocked ? "outline" : "destructive"}
                      onClick={() =>
                        handleDataLockToggle(module, selectedYear, !isLocked)
                      }
                      disabled={actionLoading[actionKey]}
                    >
                      {actionLoading[actionKey] ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LockKeyhole className="mr-2 h-4 w-4" />
                      )}
                      {isLocked ? "Deverrouiller" : "Verrouiller"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
