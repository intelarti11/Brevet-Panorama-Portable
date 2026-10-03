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
import { Input } from "@/components/ui/input";
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
  FileSearch2,
  Info,
  Database,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Search as SearchIcon,
  Loader2,
} from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { httpsCallable } from "@/lib/local/functions";
import { functions as functionsInstance } from "@/lib/firebase";
import type { PixStudentData } from "@/lib/pix-types";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";

type SortableKeys = "nom" | "nombrePix" | "classe";

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

const skillCategories = [
  { name: "1. Information et données", skills: ["1.1", "1.2", "1.3"] },
  {
    name: "2. Communication et collaboration",
    skills: ["2.1", "2.2", "2.3", "2.4"],
  },
  { name: "3. Création de contenu", skills: ["3.1", "3.2", "3.3", "3.4"] },
  { name: "4. Protection et sécurité", skills: ["4.1", "4.2", "4.3"] },
  { name: "5. Environnement numérique", skills: ["5.1", "5.2"] },
];

export default function PixDataPage() {
  const [studentsForSelectedYear, setStudentsForSelectedYear] = useState<
    PixStudentData[]
  >([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: SortableKeys | null;
    direction: "ascending" | "descending";
  } | null>(null);
  const [selectedStudentForModal, setSelectedStudentForModal] =
    useState<PixStudentData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
        setSelectedYear(
          (currentYear) => currentYear ?? data.years?.[0] ?? null,
        );
      } else {
        setAvailableYears([]);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des années:", error);
      setAvailableYears([]);
    }
    setIsLoadingYears(false);
  }, [callGetPixAvailableYears]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- triggers async loading of remote years on mount
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
        setStudentsForSelectedYear([]);
      }
      setIsLoadingStudents(false);
    },
    [callGetPixStudentsByYear],
  );

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setSearchTerm("");
    setSortConfig(null);
  };

  useEffect(() => {
    if (selectedYear) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- triggers async loading of remote students after the selected year changes
      fetchStudents(selectedYear);
    } else {
      setStudentsForSelectedYear([]);
    }
  }, [selectedYear, fetchStudents]);

  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  const displayedStudents = useMemo(() => {
    if (
      isLoadingStudents ||
      (studentsForSelectedYear.length === 0 && !searchTerm)
    ) {
      return studentsForSelectedYear;
    }

    let studentsToProcess = [...studentsForSelectedYear];

    if (searchTerm.trim() !== "") {
      const normalizedSearchTerm = normalizeText(searchTerm.trim());
      studentsToProcess = studentsToProcess.filter(
        (student) =>
          normalizeText(student.prenom).includes(normalizedSearchTerm) ||
          normalizeText(student.nom).includes(normalizedSearchTerm) ||
          (student.classe &&
            normalizeText(student.classe).includes(normalizedSearchTerm)),
      );
    }

    if (sortConfig && sortConfig.key) {
      studentsToProcess.sort((a, b) => {
        const valA = a[sortConfig.key!];
        const valB = b[sortConfig.key!];

        let comparison = 0;
        if (typeof valA === "number" && typeof valB === "number") {
          comparison = valA - valB;
        } else if (typeof valA === "string" && typeof valB === "string") {
          comparison = valA.localeCompare(valB, "fr", { sensitivity: "base" });
        }
        return sortConfig.direction === "ascending" ? comparison : -comparison;
      });
    }
    return studentsToProcess;
  }, [studentsForSelectedYear, searchTerm, sortConfig, isLoadingStudents]);

  const requestSort = (key: SortableKeys) => {
    let direction: "ascending" | "descending" = "ascending";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "ascending"
    ) {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey: SortableKeys) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4 opacity-30" />;
    }
    if (sortConfig.direction === "ascending") {
      return <ArrowUp className="ml-2 h-4 w-4 text-primary" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  const handleStudentSelect = (student: PixStudentData) => {
    setSelectedStudentForModal(student);
    setIsModalOpen(true);
  };

  if (isLoadingYears) {
    return <FullScreenLoader text="Chargement des années disponibles..." />;
  }

  return (
    <>
      <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        <Card className="w-full shadow-xl">
          <CardHeader>
            <div className="flex items-center space-x-3 mb-2">
              <FileSearch2 className="h-8 w-8 text-primary" />
              <CardTitle className="text-2xl font-headline">
                Exploration des Données PIX
              </CardTitle>
            </div>
            <CardDescription>
              Sélectionnez une année pour visualiser les données des élèves.
              Filtrez et triez les colonnes. Cliquez sur un élève pour voir le
              détail de ses compétences.
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="year-select"
                      className="text-sm font-medium shrink-0"
                    >
                      Année :
                    </label>
                    <Select
                      onValueChange={handleYearChange}
                      value={selectedYear || undefined}
                      disabled={isLoadingStudents}
                    >
                      <SelectTrigger
                        id="year-select"
                        className="w-full sm:w-[180px]"
                      >
                        <SelectValue placeholder="Choisissez" />
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
                  <div className="relative w-full sm:w-auto sm:flex-grow">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Rechercher par nom, prénom ou classe..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-full"
                      disabled={!selectedYear || isLoadingStudents}
                    />
                  </div>
                </div>

                {isLoadingStudents && selectedYear && (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2">
                      Chargement des données pour {selectedYear}...
                    </p>
                  </div>
                )}

                {!isLoadingStudents &&
                  selectedYear &&
                  displayedStudents.length > 0 && (
                    <div className="overflow-x-auto">
                      <h3 className="text-xl font-semibold mb-3">
                        Données pour l'année {selectedYear} (
                        {displayedStudents.length} élèves)
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Prénom</TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="px-1"
                                onClick={() => requestSort("nom")}
                              >
                                Nom {getSortIcon("nom")}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="px-1"
                                onClick={() => requestSort("classe")}
                              >
                                Classe {getSortIcon("classe")}
                              </Button>
                            </TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">
                              <Button
                                variant="ghost"
                                className="px-1"
                                onClick={() => requestSort("nombrePix")}
                              >
                                Nombre de Pix {getSortIcon("nombrePix")}
                              </Button>
                            </TableHead>
                            <TableHead>Date de Certification</TableHead>
                            <TableHead>Session</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayedStudents.map((student) => (
                            <TableRow
                              key={student.numeroCertification}
                              onClick={() => handleStudentSelect(student)}
                              className="cursor-pointer hover:bg-muted/80"
                            >
                              <TableCell>{student.prenom}</TableCell>
                              <TableCell>{student.nom}</TableCell>
                              <TableCell>{student.classe}</TableCell>
                              <TableCell>{student.statut}</TableCell>
                              <TableCell className="text-right">
                                {student.nombrePix}
                              </TableCell>
                              <TableCell>
                                {student.datePassageCertification}
                              </TableCell>
                              <TableCell>{student.session}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                {!isLoadingStudents &&
                  selectedYear &&
                  searchTerm &&
                  displayedStudents.length === 0 && (
                    <p className="text-muted-foreground text-center p-4 border rounded-md">
                      Aucun élève ne correspond à votre recherche "{searchTerm}"
                      pour l'année {selectedYear}.
                    </p>
                  )}

                {!isLoadingStudents &&
                  selectedYear &&
                  !searchTerm &&
                  displayedStudents.length === 0 &&
                  studentsForSelectedYear.length > 0 && (
                    <p className="text-muted-foreground text-center p-4 border rounded-md">
                      Aucun élève après filtrage/tri.
                    </p>
                  )}

                {!isLoadingStudents &&
                  selectedYear &&
                  !searchTerm &&
                  studentsForSelectedYear.length === 0 && (
                    <p className="text-muted-foreground text-center p-4 border rounded-md">
                      Aucune donnée d'élève n'a été trouvée pour l'année{" "}
                      {selectedYear}.
                    </p>
                  )}

                {!selectedYear &&
                  availableYears.length > 0 &&
                  !isLoadingStudents && (
                    <div className="mt-6 flex items-center justify-center space-x-2 text-sm text-accent-foreground bg-accent/20 p-3 rounded-md border border-accent/50">
                      <Info className="h-5 w-5 text-accent" />
                      <span>
                        Veuillez sélectionner une année pour afficher les
                        données.
                      </span>
                    </div>
                  )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedStudentForModal && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Détail des Compétences: {selectedStudentForModal.prenom}{" "}
                {selectedStudentForModal.nom}
              </DialogTitle>
              <DialogDescription>
                Classe: {selectedStudentForModal.classe} | Score Pix Total:{" "}
                {selectedStudentForModal.nombrePix}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              {skillCategories.map((category) => (
                <div
                  key={category.name}
                  className="p-3 border rounded-lg shadow-sm bg-card"
                >
                  <h4 className="text-md font-semibold mb-2 text-primary">
                    {category.name}
                  </h4>
                  <ul className="space-y-1.5 text-sm">
                    {category.skills.map((skillCode) => (
                      <li
                        key={skillCode}
                        className="flex justify-between items-center py-1 border-b border-border last:border-b-0"
                      >
                        <span className="text-card-foreground/90">
                          {
                            skillDetailsMap[
                              skillCode as keyof typeof skillDetailsMap
                            ]
                          }
                          :
                        </span>
                        <span className="font-medium text-card-foreground bg-primary/10 px-2 py-0.5 rounded-md">
                          {
                            selectedStudentForModal[
                              skillCode as keyof PixStudentData
                            ]
                          }
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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
