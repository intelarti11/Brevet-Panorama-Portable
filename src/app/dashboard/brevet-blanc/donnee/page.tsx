
'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from '@/lib/local/store';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, ArrowUp, ArrowDown, ChevronsUpDown, SlidersHorizontal, Database, FileSpreadsheet } from 'lucide-react';
import { BrevetBlancDetailModal } from '@/components/brevet-blanc-detail-modal';
import * as XLSX from 'xlsx-js-style';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FullScreenLoader } from '@/components/ui/full-screen-loader';
import { ErrorDisplay } from '@/components/ui/error-display';
import { Loader2 } from 'lucide-react';
import { getBrevetConfigForYear, calculateBrevetBlancAverage } from '@/lib/brevet-config';
import { getClassCellValue, normalizeClassName } from '@/lib/student-class';

interface BrevetBlancStudent {
  id: string;
  nom: string;
  prenom: string;
  classe: string;
  averageBb1?: number;
  averageBb2?: number;
  notesCountBb1: number;
  notesCountBb2: number;
  notes?: {
    [subject: string]: {
      bb1?: number;
      bb2?: number;
    };
  };
}

const normalizeText = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export default function DonneeBlancPage() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [isYearsLoading, setIsYearsLoading] = useState(true);

  const [students, setStudents] = useState<BrevetBlancStudent[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);

  const [filteredData, setFilteredData] = useState<BrevetBlancStudent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof BrevetBlancStudent | null; direction: 'ascending' | 'descending' }>({ key: 'nom', direction: 'ascending' });

  const [selectedStudentForModal, setSelectedStudentForModal] = useState<BrevetBlancStudent | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();

  const fetchYears = useCallback(async () => {
    setIsYearsLoading(true);
    try {
      const bbRef = collection(db, 'BrevetBlanc');
      const querySnapshot = await getDocs(bbRef);
      const yearsFromDb = new Set<string>();
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.anneeScolaire) yearsFromDb.add(data.anneeScolaire);
      });
      const sortedYears = Array.from(yearsFromDb).sort((a, b) => b.localeCompare(a));
      setAvailableYears(sortedYears);
      if (sortedYears.length > 0 && !selectedYear) {
        setSelectedYear(sortedYears[0]);
      }
    } catch (err: any) {
      setErrorData("Impossible de charger les années scolaires.");
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    } finally {
      setIsYearsLoading(false);
    }
  }, [toast, selectedYear]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  const fetchStudents = useCallback(async () => {
    if (!selectedYear) return;
    setIsLoadingData(true);
    setErrorData(null);
    try {
      const studentsRef = collection(db, 'BrevetBlanc');
      const q = query(studentsRef, where("anneeScolaire", "==", selectedYear));
      const querySnapshot = await getDocs(q);
      const config = getBrevetConfigForYear(selectedYear);

      const fetchedStudents: BrevetBlancStudent[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();

        const countNotes = (brevetKey: 'bb1' | 'bb2') => {
          if (!data.notes) return 0;
          return config.subjects.reduce((count, subject) => {
            if (data.notes[subject]?.[brevetKey] !== undefined) {
              return count + 1;
            }
            return count;
          }, 0);
        };

        const notesCountBb1 = countNotes('bb1');
        const notesCountBb2 = countNotes('bb2');

        const averageBb1 = calculateBrevetBlancAverage(data, config, 'bb1');
        const averageBb2 = calculateBrevetBlancAverage(data, config, 'bb2');

        return {
          id: docSnap.id,
          nom: data.NOM || 'N/A',
          prenom: data.PRENOM || 'N/A',
          classe: getClassCellValue(data.CLASSE),
          averageBb1,
          averageBb2,
          notesCountBb1,
          notesCountBb2,
          notes: data.notes,
        };
      });
      setStudents(fetchedStudents);
    } catch (err: any) {
      setErrorData("Impossible de charger les données des élèves: " + err.message);
      toast({ variant: 'destructive', title: 'Erreur de chargement', description: err.message });
    } finally {
      setIsLoadingData(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    let data = [...students];
    if (searchTerm) {
      const normalizedSearchTerm = normalizeText(searchTerm);
      data = data.filter(student =>
        normalizeText(student.nom).includes(normalizedSearchTerm) ||
        normalizeText(student.prenom).includes(normalizedSearchTerm) ||
        normalizeText(student.classe).includes(normalizedSearchTerm)
      );
    }
    if (sortConfig.key) {
      const sortKey = sortConfig.key;
      data.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else {
          comparison = normalizeText(String(valA)).localeCompare(normalizeText(String(valB)));
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    setFilteredData(data);
  }, [searchTerm, students, sortConfig]);

  const handleSort = (key: keyof BrevetBlancStudent) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleRowClick = (student: BrevetBlancStudent) => {
    setSelectedStudentForModal(student);
    setIsDetailModalOpen(true);
  };

  const renderSortIcon = (columnKey: keyof BrevetBlancStudent) => {
    if (sortConfig.key !== columnKey) return <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground/60" />;
    return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4 text-foreground" /> : <ArrowDown className="ml-2 h-4 w-4 text-foreground" />;
  };

  const handleExport = (format: 'xlsx' | 'ods') => {
    if (students.length === 0 || !selectedYear) {
      toast({
        title: "Exportation annulée",
        description: "Aucune donnée à exporter pour la sélection actuelle.",
        variant: "warning",
      });
      return;
    }
    setIsExporting(true);
    try {
      const config = getBrevetConfigForYear(selectedYear);

      // --- Sheet 1: Données Élèves (Detailed Data from current filter) ---
      const dataToExport = filteredData.map(student => {
        const row: { [key: string]: any } = {
          'Nom': student.nom, 'Prénom': student.prenom, 'Classe': student.classe,
        };
        config.subjects.forEach(matiere => {
          const maxScore = config.maxScores[matiere];
          row[`${matiere} BB1 (/${maxScore})`] = student.notes?.[matiere]?.bb1 ?? '';
          row[`${matiere} BB2 (/${maxScore})`] = student.notes?.[matiere]?.bb2 ?? '';
        });
        row['Moyenne BB1 (/20)'] = student.averageBb1?.toFixed(2) ?? '';
        row['Moyenne BB2 (/20)'] = student.averageBb2?.toFixed(2) ?? '';
        return row;
      });
      const detailWorksheet = XLSX.utils.json_to_sheet(dataToExport.length > 0 ? dataToExport : [{}]);
      if (dataToExport.length > 0) {
        const detailCols = Object.keys(dataToExport[0]).map(key => ({
            wch: Math.max(key.length, ...dataToExport.map(row => String(row[key] ?? '').length)) + 2
        }));
        detailWorksheet["!cols"] = detailCols;
      }

      // --- Sheet 2: Synthèse par Classe (Summary Data from all students of the year) ---
      const groupedByClass: { [className: string]: BrevetBlancStudent[] } = {};
      students.forEach(student => {
          const className = normalizeClassName(student.classe);
          if (!className) return;
          if (!groupedByClass[className]) groupedByClass[className] = [];
          groupedByClass[className].push(student);
      });

      const summaryData = Object.entries(groupedByClass).map(([className, classStudents]) => {
        const classAverages = { bb1: { total: 0, count: 0 }, bb2: { total: 0, count: 0 } };
        const subjectAverages: { [key: string]: { bb1: { total: 0, count: 0 }, bb2: { total: 0, count: 0 } } } = {};
        config.subjects.forEach(m => subjectAverages[m] = { bb1: { total: 0, count: 0 }, bb2: { total: 0, count: 0 } });

        classStudents.forEach(student => {
            if (student.averageBb1 !== undefined) {
              classAverages.bb1.total += student.averageBb1;
              classAverages.bb1.count++;
            }
            if (student.averageBb2 !== undefined) {
              classAverages.bb2.total += student.averageBb2;
              classAverages.bb2.count++;
            }
             config.subjects.forEach(matiere => {
                const noteBb1 = student.notes?.[matiere]?.bb1;
                const noteBb2 = student.notes?.[matiere]?.bb2;
                if (noteBb1 !== undefined && noteBb1 !== null) { subjectAverages[matiere].bb1.total += noteBb1; subjectAverages[matiere].bb1.count++; }
                if (noteBb2 !== undefined && noteBb2 !== null) { subjectAverages[matiere].bb2.total += noteBb2; subjectAverages[matiere].bb2.count++; }
            });
        });

        const row: { [key: string]: any } = {
            'Classe': className,
            'Nombre d\'élèves': classStudents.length,
            'Moyenne Générale BB1 (/20)': classAverages.bb1.count > 0 ? (classAverages.bb1.total / classAverages.bb1.count).toFixed(2) : 'N/A',
            'Moyenne Générale BB2 (/20)': classAverages.bb2.count > 0 ? (classAverages.bb2.total / classAverages.bb2.count).toFixed(2) : 'N/A',
        };
        config.subjects.forEach(matiere => {
            const maxScore = config.maxScores[matiere];
            row[`Moyenne ${matiere} BB1 (/${maxScore})`] = subjectAverages[matiere].bb1.count > 0 ? (subjectAverages[matiere].bb1.total / subjectAverages[matiere].bb1.count).toFixed(2) : 'N/A';
            row[`Moyenne ${matiere} BB2 (/${maxScore})`] = subjectAverages[matiere].bb2.count > 0 ? (subjectAverages[matiere].bb2.total / subjectAverages[matiere].bb2.count).toFixed(2) : 'N/A';
        });
        return row;
      }).sort((a, b) => a.Classe.localeCompare(b.Classe));

      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData.length > 0 ? summaryData : [{}]);
      if(summaryData.length > 0) {
        const summaryCols = Object.keys(summaryData[0]).map(key => ({
            wch: Math.max(key.length, ...summaryData.map(row => String(row[key] ?? '').length)) + 2
        }));
        summaryWorksheet["!cols"] = summaryCols;
      }

      // --- Create and Download Workbook ---
      const workbook = XLSX.utils.book_new();
      if (summaryData.length > 0) {
        XLSX.utils.book_append_sheet(workbook, summaryWorksheet, "Synthese par Classe");
      }
      XLSX.utils.book_append_sheet(workbook, detailWorksheet, `Donnees Eleves ${selectedYear}`);
      XLSX.writeFile(workbook, `Export_Brevet_Blanc_${selectedYear}.${format}`, { bookType: format });

      toast({ title: "Exportation réussie", description: `${students.length} lignes exportées sur deux onglets.` });
    } catch (exportError) {
      console.error("Failed to export data:", exportError);
      toast({ title: "Erreur d'exportation", description: "Une erreur est survenue lors de la création du fichier.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const renderContent = () => {
    const config = getBrevetConfigForYear(selectedYear || new Date().getFullYear().toString());

    if (isYearsLoading || isLoadingData) {
      return <FullScreenLoader text="Chargement des données..." />;
    }

    if (errorData) {
      return <ErrorDisplay message={errorData} onRetry={fetchStudents} asCard />;
    }

    if (availableYears.length === 0) {
        return (
             <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
              <Database className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Aucune donnée de Brevet Blanc trouvée</p>
              <p className="text-sm text-muted-foreground">Importez des listes d'élèves pour commencer.</p>
            </div>
        );
    }

    return (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-xl">Données du Brevet Blanc ({selectedYear})</CardTitle>
            <CardDescription>Liste des élèves. Affichage de {filteredData.length} sur {students.length} élèves.</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredData.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('nom')}>Nom{renderSortIcon('nom')}</TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('prenom')}>Prénom{renderSortIcon('prenom')}</TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('classe')}>Classe{renderSortIcon('classe')}</TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('averageBb1')}>Moyenne BB1 (/20){renderSortIcon('averageBb1')}</TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort('averageBb2')}>Moyenne BB2 (/20){renderSortIcon('averageBb2')}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredData.map((student) => (
                      <TableRow key={student.id} onClick={() => handleRowClick(student)} className="cursor-pointer hover:bg-muted/40">
                        <TableCell className="font-medium">{student.nom}</TableCell><TableCell>{student.prenom}</TableCell><TableCell>{student.classe}</TableCell>
                        <TableCell className="text-right">
                          {student.averageBb1 !== undefined ? (
                            <div className="flex flex-col items-end">
                              <span className="font-medium">{student.averageBb1.toFixed(2)}</span>
                              <span className="text-xs text-muted-foreground">({student.notesCountBb1}/{config.subjects.length} notes)</span>
                            </div>
                          ) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          {student.averageBb2 !== undefined ? (
                             <div className="flex flex-col items-end">
                              <span className="font-medium">{student.averageBb2.toFixed(2)}</span>
                              <span className="text-xs text-muted-foreground">({student.notesCountBb2}/{config.subjects.length} notes)</span>
                            </div>
                          ) : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg">
                <Search className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Aucun élève trouvé</p>
                <p className="text-sm text-muted-foreground">Ajustez votre recherche ou sélectionnez une autre année.</p>
              </div>
            )}
          </CardContent>
        </Card>
    );
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Données du Brevet Blanc</h1>
          <p className="text-muted-foreground mt-1">Recherchez et consultez les résultats des élèves aux brevets blancs.</p>
        </div>
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={isYearsLoading || isLoadingData || isExporting || students.length === 0}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                Exporter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('xlsx')}>Format Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('ods')}>Format OpenDocument (.ods)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-full sm:w-52">
            <Label htmlFor="year-select-donnee-blanc">Année Scolaire</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isYearsLoading || availableYears.length === 0}>
              <SelectTrigger id="year-select-donnee-blanc"><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>{!isYearsLoading && availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader><CardTitle className="flex items-center text-xl"><SlidersHorizontal className="mr-2 h-5 w-5 text-primary" />Recherche Locale</CardTitle></CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="search-donnee-blanc" type="text" placeholder="Nom, Prénom, Classe..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {renderContent()}

      {selectedStudentForModal && (
        <BrevetBlancDetailModal
          student={selectedStudentForModal}
          isOpen={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />
      )}
    </div>
  );
}
