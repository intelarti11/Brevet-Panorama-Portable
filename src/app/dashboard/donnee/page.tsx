"use client";

import type { ChangeEvent } from "react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  SlidersHorizontal,
  FileSignature,
} from "lucide-react";
import {
  useFilters,
  type ProcessedStudentData,
  ALL_ACADEMIC_YEARS_VALUE,
} from "@/contexts/FilterContext";
import { StudentDetailModal } from "@/components/student-detail-modal";
import { Button } from "@/components/ui/button";
import {
  BrevetResultReportConfigModal,
  type BrevetResultReportConfig,
} from "@/components/brevet-result-report-config-modal";
import { BrevetResultReportModal } from "@/components/brevet-result-report-modal";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { ErrorDisplay } from "@/components/ui/error-display";

const normalizeText = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function DonneePage() {
  const { isLoading, error, students, selectedAcademicYear } = useFilters();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProcessedStudentData | null;
    direction: "ascending" | "descending";
  }>({ key: null, direction: "ascending" });
  const [selectedStudentForModal, setSelectedStudentForModal] =
    useState<ProcessedStudentData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const [isReportConfigModalOpen, setIsReportConfigModalOpen] = useState(false);
  const [reportConfig, setReportConfig] =
    useState<BrevetResultReportConfig | null>(null);

  const filteredData = useMemo(() => {
    let data = [...students];

    if (searchTerm) {
      const normalizedSearchTerm = normalizeText(searchTerm);
      data = data.filter(
        (student) =>
          normalizeText(student.nom).includes(normalizedSearchTerm) ||
          normalizeText(student.prenom).includes(normalizedSearchTerm) ||
          normalizeText(student.ine).includes(normalizedSearchTerm),
      );
    }

    if (sortConfig.key) {
      const sortKey = sortConfig.key;
      data.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        let comparison = 0;
        if (typeof valA === "number" && typeof valB === "number") {
          comparison = valA - valB;
        } else {
          comparison = normalizeText(String(valA)).localeCompare(
            normalizeText(String(valB)),
          );
        }
        return sortConfig.direction === "ascending" ? comparison : -comparison;
      });
    }
    return data;
  }, [searchTerm, students, sortConfig]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSort = (key: keyof ProcessedStudentData) => {
    let direction: "ascending" | "descending" = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const getBadgeVariant = (
    resultat: string | undefined,
  ):
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning" => {
    if (!resultat || normalizeText(resultat) === "n/a") return "outline";
    const lowerResultat = normalizeText(resultat);
    if (lowerResultat.includes("refuse")) return "destructive";
    if (lowerResultat.includes("absent")) return "outline";
    if (
      lowerResultat.includes("très bien") ||
      lowerResultat.includes("tres bien")
    )
      return "success";
    if (lowerResultat.includes("assez bien")) return "warning";
    if (lowerResultat.includes("bien")) return "success";
    if (lowerResultat.includes("admis")) return "success";
    return "secondary";
  };

  const renderSortIcon = (columnKey: keyof ProcessedStudentData) => {
    if (sortConfig.key !== columnKey)
      return (
        <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground/60" />
      );
    return sortConfig.direction === "ascending" ? (
      <ArrowUp className="ml-2 h-4 w-4 text-foreground" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 text-foreground" />
    );
  };

  const handleRowClick = (student: ProcessedStudentData) => {
    setSelectedStudentForModal(student);
    setIsDetailModalOpen(true);
  };

  const availableResultsForReport = useMemo(() => {
    if (filteredData.length === 0) return [];
    const resultSet = new Set<string>();
    for (const student of filteredData) {
      if (student.resultat && student.resultat.trim()) {
        resultSet.add(student.resultat);
      } else {
        resultSet.add("Non spécifié");
      }
    }
    return Array.from(resultSet).sort();
  }, [filteredData]);

  const handleGenerateReport = (config: BrevetResultReportConfig) => {
    setReportConfig(config);
  };

  const renderContent = () => {
    if (isLoading) {
      return <FullScreenLoader text="Chargement des données..." />;
    }

    if (error) {
      return <ErrorDisplay message={error} />;
    }

    if (selectedAcademicYear === ALL_ACADEMIC_YEARS_VALUE) {
      return (
        <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
          <SlidersHorizontal className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            Veuillez sélectionner une année
          </p>
          <p className="text-sm text-muted-foreground">
            Choisissez une année scolaire dans la barre latérale pour afficher
            les données.
          </p>
        </div>
      );
    }

    return (
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">
                Résultats des Élèves ({selectedAcademicYear})
              </CardTitle>
              <CardDescription>
                Liste des élèves correspondant aux critères. Affichage de{" "}
                {filteredData.length} sur {students.length} élèves.
              </CardDescription>
            </div>
            <Button
              onClick={() => setIsReportConfigModalOpen(true)}
              disabled={filteredData.length === 0}
            >
              <FileSignature className="mr-2 h-4 w-4" />
              Générer un Rapport
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredData.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead
                      className="w-[120px] cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("id")}
                    >
                      INE{renderSortIcon("id")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("nom")}
                    >
                      Nom{renderSortIcon("nom")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("prenom")}
                    >
                      Prénom{renderSortIcon("prenom")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("etablissement")}
                    >
                      Établissement{renderSortIcon("etablissement")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("serieType")}
                    >
                      Série{renderSortIcon("serieType")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("resultat")}
                    >
                      Résultat{renderSortIcon("resultat")}
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/80"
                      onClick={() => handleSort("moyenne")}
                    >
                      Moyenne (/20){renderSortIcon("moyenne")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((student) => (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => handleRowClick(student)}
                    >
                      <TableCell className="font-mono text-xs">
                        {student.ine}
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.nom}
                      </TableCell>
                      <TableCell>{student.prenom}</TableCell>
                      <TableCell>{student.etablissement}</TableCell>
                      <TableCell>{student.serieType || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant={getBadgeVariant(student.resultat)}>
                          {student.resultat || "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {student.moyenne?.toFixed(2) ?? "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
              <Search className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                Aucun élève trouvé
              </p>
              <p className="text-sm text-muted-foreground">
                Ajustez vos filtres ou importez des données pour cette année.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          Gestion des Données Élèves
        </h1>
        <p className="text-muted-foreground mt-1">
          Recherchez et consultez les résultats détaillés des élèves. Les
          filtres se trouvent dans la barre latérale.
        </p>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <SlidersHorizontal className="mr-2 h-5 w-5 text-primary" />
            Recherche Locale
          </CardTitle>
          <CardDescription>
            Affinez votre recherche sur les données actuellement affichées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              type="text"
              placeholder="Nom, Prénom, INE..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {renderContent()}

      {selectedStudentForModal && (
        <StudentDetailModal
          student={selectedStudentForModal}
          isOpen={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />
      )}

      {isReportConfigModalOpen && (
        <BrevetResultReportConfigModal
          isOpen={isReportConfigModalOpen}
          onOpenChange={setIsReportConfigModalOpen}
          availableResults={availableResultsForReport}
          onGenerate={handleGenerateReport}
        />
      )}

      {reportConfig && (
        <BrevetResultReportModal
          config={reportConfig}
          students={filteredData}
          onOpenChange={(isOpen) => {
            if (!isOpen) setReportConfig(null);
          }}
        />
      )}
    </div>
  );
}
