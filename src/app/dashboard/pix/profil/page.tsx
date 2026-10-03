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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  User,
  BarChart2,
  Activity,
  Info,
  Database,
  CalendarDays,
  Award,
  Users,
  Hash,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { httpsCallable } from "@/lib/local/functions";
import { functions as functionsInstance } from "@/lib/firebase";
import type { PixStudentData } from "@/lib/pix-types";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";

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
  { name: "1. Information et données", skills: ["1.1", "1.2", "1.3"] },
  {
    name: "2. Communication et collaboration",
    skills: ["2.1", "2.2", "2.3", "2.4"],
  },
  { name: "3. Création de contenu", skills: ["3.1", "3.2", "3.3", "3.4"] },
  { name: "4. Protection et sécurité", skills: ["4.1", "4.2", "4.3"] },
  { name: "5. Environnement numérique", skills: ["5.1", "5.2"] },
];

const SKILL_CATEGORIES_FOR_RADAR = [
  { name: "Info. & Données", subSkills: ["1.1", "1.2", "1.3"] },
  { name: "Com. & Collab.", subSkills: ["2.1", "2.2", "2.3", "2.4"] },
  { name: "Création Contenu", subSkills: ["3.1", "3.2", "3.3", "3.4"] },
  { name: "Protect. & Sécu.", subSkills: ["4.1", "4.2", "4.3"] },
  { name: "Env. Numérique", subSkills: ["5.1", "5.2"] },
];
const RADAR_CHART_FULL_MARK = 4;

interface StudentRadarChartDataPoint {
  subject: string;
  score: number;
  fullMark: number;
}

const radarChartConfig = {
  score: { label: "Score Élève", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

export default function ProfilElevePage() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [studentsForYear, setStudentsForYear] = useState<PixStudentData[]>([]);
  const [selectedStudentNumero, setSelectedStudentNumero] = useState<
    string | null
  >(null);
  const [selectedStudent, setSelectedStudent] = useState<PixStudentData | null>(
    null,
  );
  const [studentRadarData, setStudentRadarData] = useState<
    StudentRadarChartDataPoint[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredStudentsForSelect, setFilteredStudentsForSelect] = useState<
    PixStudentData[]
  >([]);

  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

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
          setStudentsForYear([]);
          setSelectedStudentNumero(null);
        }
      } else {
        setAvailableYears([]);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des années:", error);
      setAvailableYears([]);
    }
    setIsLoadingYears(false);
  }, [selectedYear, callGetPixAvailableYears]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  const fetchStudents = useCallback(
    async (year: string) => {
      if (!callGetPixStudentsByYear) return;
      setIsLoadingStudents(true);
      setStudentsForYear([]);
      setSelectedStudentNumero(null);
      try {
        const result = await callGetPixStudentsByYear({ year });
        const data = result.data as {
          success: boolean;
          students?: PixStudentData[];
        };
        if (data.success && data.students) {
          setStudentsForYear(data.students);
        } else {
          setStudentsForYear([]);
        }
      } catch (error) {
        console.error(
          `Erreur lors de la récupération des élèves pour l'année ${year}:`,
          error,
        );
        setStudentsForYear([]);
      }
      setIsLoadingStudents(false);
    },
    [callGetPixStudentsByYear],
  );

  useEffect(() => {
    if (selectedYear) {
      fetchStudents(selectedYear);
    } else {
      setStudentsForYear([]);
      setSelectedStudentNumero(null);
    }
  }, [selectedYear, fetchStudents]);

  const normalizeText = useCallback((text: string): string => {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }, []);

  useEffect(() => {
    let filtered: PixStudentData[];
    if (!searchTerm.trim()) {
      filtered = [...studentsForYear];
    } else {
      const normalizedSearch = normalizeText(searchTerm);
      filtered = studentsForYear.filter(
        (student) =>
          normalizeText(student.prenom).includes(normalizedSearch) ||
          normalizeText(student.nom).includes(normalizedSearch) ||
          (student.classe &&
            normalizeText(student.classe).includes(normalizedSearch)),
      );
    }
    setFilteredStudentsForSelect(filtered);

    if (
      filtered.length === 1 &&
      selectedStudentNumero !== filtered[0].numeroCertification
    ) {
      setSelectedStudentNumero(filtered[0].numeroCertification);
    }
  }, [searchTerm, studentsForYear, normalizeText, selectedStudentNumero]);

  useEffect(() => {
    if (selectedStudentNumero && studentsForYear.length > 0) {
      const student = studentsForYear.find(
        (s) => s.numeroCertification === selectedStudentNumero,
      );
      setSelectedStudent(student || null);

      if (student) {
        const radarData = SKILL_CATEGORIES_FOR_RADAR.map((category) => {
          let totalScoreForCategory = 0;
          let skillsIncategoryCount = 0;
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
              skillsIncategoryCount++;
            }
          });
          const categoryAverageScore =
            skillsIncategoryCount > 0
              ? parseFloat(
                  (totalScoreForCategory / skillsIncategoryCount).toFixed(2),
                )
              : 0;
          return {
            subject: category.name,
            score: categoryAverageScore,
            fullMark: RADAR_CHART_FULL_MARK,
          };
        });
        setStudentRadarData(radarData);
      } else {
        setStudentRadarData([]);
      }
    } else {
      setSelectedStudent(null);
      setStudentRadarData([]);
    }
  }, [selectedStudentNumero, studentsForYear]);

  if (isLoadingYears && !selectedYear) {
    return <FullScreenLoader text="Chargement des données..." />;
  }

  return (
    <>
      <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        <Card className="w-full shadow-xl">
          <CardHeader>
            <div className="flex items-center space-x-3 mb-2">
              <User className="h-8 w-8 text-primary" />
              <CardTitle className="text-2xl font-headline">
                Profil Détaillé de l'Élève
              </CardTitle>
            </div>
            <CardDescription>
              Sélectionnez une année, recherchez puis sélectionnez un élève pour
              visualiser ses informations et performances PIX.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {availableYears.length === 0 && !isLoadingYears ? (
              <div className="flex flex-col items-center justify-center text-center p-8 border rounded-lg bg-muted/50">
                <Database className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold">
                  Aucune donnée disponible.
                </p>
                <p className="text-muted-foreground">
                  Veuillez importer des fichiers CSV via la page "Import".
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="year-select-profil"
                      className="text-sm font-medium"
                    >
                      Année :
                    </label>
                    <Select
                      onValueChange={(value) => {
                        setSelectedYear(value);
                        setSelectedStudentNumero(null);
                      }}
                      value={selectedYear || undefined}
                      disabled={isLoadingStudents || isLoadingYears}
                    >
                      <SelectTrigger id="year-select-profil" className="w-full">
                        <SelectValue
                          placeholder={
                            isLoadingYears ? "Chargement..." : "Année"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingYears && (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            Chargement des années...
                          </div>
                        )}
                        {!isLoadingYears &&
                          availableYears.map((year) => (
                            <SelectItem key={year} value={year}>
                              {year}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="student-search-profil"
                      className="text-sm font-medium"
                    >
                      Rechercher un élève :
                    </label>
                    <div className="relative">
                      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="student-search-profil"
                        type="search"
                        placeholder="Nom, prénom ou classe..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 w-full"
                        disabled={
                          !selectedYear ||
                          isLoadingStudents ||
                          (isLoadingYears && !availableYears.length)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-grow">
                  <label
                    htmlFor="student-select-profil"
                    className="text-sm font-medium shrink-0"
                  >
                    Élève :
                  </label>
                  <Select
                    onValueChange={setSelectedStudentNumero}
                    value={selectedStudentNumero || undefined}
                    disabled={
                      !selectedYear ||
                      isLoadingStudents ||
                      (isLoadingYears && !availableYears.length) ||
                      (studentsForYear.length === 0 && !searchTerm.trim())
                    }
                  >
                    <SelectTrigger
                      id="student-select-profil"
                      className="w-full"
                    >
                      <SelectValue
                        placeholder={
                          isLoadingStudents
                            ? "Chargement..."
                            : !selectedYear
                              ? "Sélectionnez une année"
                              : studentsForYear.length === 0 &&
                                  !searchTerm.trim()
                                ? "Aucun élève cette année"
                                : searchTerm.trim() &&
                                    filteredStudentsForSelect.length === 0
                                  ? "Aucun élève ne correspond"
                                  : "Sélectionner un élève"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingStudents ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Chargement des élèves...
                        </div>
                      ) : !selectedYear ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Sélectionnez d'abord une année.
                        </div>
                      ) : studentsForYear.length === 0 && !searchTerm.trim() ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Aucun élève trouvé pour {selectedYear}.
                        </div>
                      ) : filteredStudentsForSelect.length > 0 ? (
                        filteredStudentsForSelect.map((student) => (
                          <SelectItem
                            key={student.numeroCertification}
                            value={student.numeroCertification}
                          >
                            {student.prenom} {student.nom} (
                            {student.classe || "N/A"})
                          </SelectItem>
                        ))
                      ) : searchTerm.trim() &&
                        filteredStudentsForSelect.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Aucun élève ne correspond à "{searchTerm}".
                        </div>
                      ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Aucun élève à afficher pour la sélection.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {isLoadingStudents && selectedYear && (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2">
                      Chargement des élèves pour {selectedYear}...
                    </p>
                  </div>
                )}

                {!selectedYear &&
                  availableYears.length > 0 &&
                  !isLoadingStudents &&
                  !isLoadingYears && (
                    <div className="mt-6 flex items-center justify-center space-x-2 text-sm text-accent-foreground bg-accent/20 p-3 rounded-md border border-accent/50">
                      <Info className="h-5 w-5 text-accent" />
                      <span>
                        Veuillez sélectionner une année pour rechercher et
                        choisir un élève.
                      </span>
                    </div>
                  )}

                {selectedYear &&
                  !isLoadingStudents &&
                  studentsForYear.length === 0 &&
                  !searchTerm.trim() && (
                    <p className="text-muted-foreground text-center p-4 border rounded-md mt-4">
                      Aucune donnée d'élève n'a été trouvée pour l'année{" "}
                      {selectedYear}.
                    </p>
                  )}

                {selectedStudent ? (
                  <div className="space-y-8 mt-6">
                    <Card className="shadow-md">
                      <CardHeader>
                        <CardTitle className="text-xl font-headline flex items-center">
                          <User className="mr-2 h-6 w-6 text-primary" />
                          Informations Générales
                        </CardTitle>
                        <CardDescription>
                          {selectedStudent.prenom} {selectedStudent.nom}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div className="flex items-center">
                          <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                          <strong>Classe:</strong>
                          <span className="ml-2">{selectedStudent.classe}</span>
                        </div>
                        <div className="flex items-center">
                          <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                          <strong>Date de Naissance:</strong>
                          <span className="ml-2">
                            {selectedStudent.dateNaissance}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Award className="mr-2 h-4 w-4 text-muted-foreground" />
                          <strong>Statut PIX:</strong>
                          <span className="ml-2">{selectedStudent.statut}</span>
                        </div>
                        <div className="flex items-center">
                          <Activity className="mr-2 h-4 w-4 text-muted-foreground" />
                          <strong>Score PIX Total:</strong>
                          <span className="ml-2 font-semibold">
                            {selectedStudent.nombrePix}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
                          <strong>Session:</strong>
                          <span className="ml-2">
                            {selectedStudent.session}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                          <strong>Date Certification:</strong>
                          <span className="ml-2">
                            {selectedStudent.datePassageCertification}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="shadow-md">
                      <CardHeader>
                        <CardTitle className="text-xl font-headline flex items-center">
                          <BarChart2 className="mr-2 h-6 w-6 text-primary" />
                          Performance par Domaine (Radar)
                        </CardTitle>
                        <CardDescription>
                          Scores moyens de l'élève par grand domaine de
                          compétence (sur {RADAR_CHART_FULL_MARK}).
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {studentRadarData &&
                        studentRadarData.some((d) => d.score > 0) ? (
                          <ChartContainer
                            config={radarChartConfig}
                            className="h-[350px] w-full"
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart
                                cx="50%"
                                cy="50%"
                                outerRadius="80%"
                                data={studentRadarData}
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
                                  name="Score Élève"
                                  dataKey="score"
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
                            Pas de données de compétences pour le graphique
                            radar de cet élève.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="shadow-md">
                      <CardHeader>
                        <CardTitle className="text-xl font-headline flex items-center">
                          <Activity className="mr-2 h-6 w-6 text-primary" />
                          Détail des Compétences (Scores Individuels)
                        </CardTitle>
                        <CardDescription>
                          Scores de l'élève pour chacune des 16 compétences PIX
                          (sur {RADAR_CHART_FULL_MARK}).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {skillCategoriesForDetailedView.map((category) => (
                          <div
                            key={category.name}
                            className="p-4 border rounded-lg bg-card shadow-sm"
                          >
                            <h4 className="text-lg font-semibold mb-3 text-primary">
                              {category.name}
                            </h4>
                            <ul className="space-y-3">
                              {category.skills.map((skillCode) => {
                                const skillValue = selectedStudent[
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
                                      <span className="text-sm text-card-foreground/90">
                                        {skillDetailsMap[skillCode]}
                                      </span>
                                      <span className="text-sm font-medium text-primary">
                                        {score} / {RADAR_CHART_FULL_MARK}
                                      </span>
                                    </div>
                                    <Progress
                                      value={percentage}
                                      className="h-2"
                                    />
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                        {!SKILL_CODES.some((code) => {
                          const val = selectedStudent[
                            code as keyof PixStudentData
                          ] as string;
                          return val !== "0" && val !== "-" && val !== "";
                        }) && (
                          <p className="text-muted-foreground text-center p-4">
                            Aucun score de compétence détaillé disponible pour
                            cet élève.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  selectedYear &&
                  !isLoadingStudents &&
                  studentsForYear.length > 0 &&
                  !searchTerm.trim() && (
                    <div className="mt-6 flex items-center justify-center space-x-2 text-sm text-accent-foreground bg-accent/20 p-3 rounded-md border border-accent/50">
                      <Info className="h-5 w-5 text-accent" />
                      <span>
                        Veuillez sélectionner un élève pour afficher ses
                        détails.
                      </span>
                    </div>
                  )
                )}

                {selectedYear &&
                  !isLoadingStudents &&
                  searchTerm.trim() &&
                  filteredStudentsForSelect.length === 0 && (
                    <p className="text-muted-foreground text-center p-4 border rounded-md mt-4">
                      Aucun élève ne correspond à votre recherche "{searchTerm}"
                      pour l'année {selectedYear}.
                    </p>
                  )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
