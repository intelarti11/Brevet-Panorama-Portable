
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs } from '@/lib/local/store';
import { db } from '@/lib/firebase';
import * as XLSX from 'xlsx-js-style';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, AlertTriangle, Frown, Users, ArrowRightLeft, BarChart2, FileSpreadsheet, FileSignature } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BrevetBlancClassDetailModal } from '@/components/brevet-blanc-class-detail-modal';
import { BrevetBlancClassComparisonModal } from '@/components/brevet-blanc-class-comparison-modal';
import { BrevetBlancReportConfigModal, type ReportConfig } from '@/components/brevet-blanc-report-config-modal';
import { BrevetBlancReportModal } from '@/components/brevet-blanc-report-modal';
import { getBrevetConfigForYear, calculateBrevetBlancAverage } from '@/lib/brevet-config';
import { getClassCellValue, normalizeClassName } from '@/lib/student-class';


export interface Student {
  id: string;
  NOM: string;
  PRENOM: string;
  CLASSE?: string;
  notes?: { [subject: string]: { bb1?: number; bb2?: number; } };
}
interface GroupedStudents {
  [className: string]: Student[];
}


export default function VoirNotesPage() {
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [isYearsLoading, setIsYearsLoading] = useState(true);

    const [students, setStudents] = useState<Student[]>([]);
    const [groupedStudents, setGroupedStudents] = useState<GroupedStudents>({});
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const config = useMemo(() => getBrevetConfigForYear(selectedYear || new Date().getFullYear().toString()), [selectedYear]);
    const isPostReform = !!config?.coefficients;

    const [orderedSubjects, setOrderedSubjects] = useState<string[]>([]);

    useEffect(() => {
        if(config) {
            setOrderedSubjects(Array.from(config.subjects));
        }
    }, [config]);


    const [selectedClassForModal, setSelectedClassForModal] = useState<{ className: string; students: Student[] } | null>(null);
    const [isClassDetailModalOpen, setIsClassDetailModalOpen] = useState(false);
    const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);

    const [isReportConfigModalOpen, setIsReportConfigModalOpen] = useState(false);
    const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);

    const { toast } = useToast();

    const handleSubjectHeaderClick = useCallback((subject: string) => {
        setOrderedSubjects(prevOrder => [ subject, ...prevOrder.filter(s => s !== subject) ]);
    }, []);

    const fetchYears = useCallback(async () => {
        setIsYearsLoading(true);
        try {
            const bbRef = collection(db, 'BrevetBlanc');
            const querySnapshot = await getDocs(bbRef);
            const yearsFromDb = new Set<string>();
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.anneeScolaire) yearsFromDb.add(data.anneeScolaire);
            });
            const sortedYears = Array.from(yearsFromDb).sort((a, b) => b.localeCompare(a));
            setAvailableYears(sortedYears);
            if (sortedYears.length > 0 && !selectedYear) setSelectedYear(sortedYears[0]);
        } catch (err: any) {
            console.error("Error fetching years:", err);
            toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de charger les années scolaires." });
        } finally {
            setIsYearsLoading(false);
        }
    }, [toast, selectedYear]);

    useEffect(() => { fetchYears(); }, [fetchYears]);

    const fetchAndGroupStudents = useCallback(async () => {
        if (!selectedYear) return;
        setIsLoadingData(true);
        setError(null);
        try {
            const studentsRef = collection(db, 'BrevetBlanc');
            const q = query(studentsRef, where("anneeScolaire", "==", selectedYear));
            const querySnapshot = await getDocs(q);
            const fetchedStudents: Student[] = [];
            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                fetchedStudents.push({
                    id: docSnap.id,
                    NOM: data.NOM,
                    PRENOM: data.PRENOM,
                    CLASSE: normalizeClassName(data.CLASSE),
                    notes: data.notes,
                });
            });
            setStudents(fetchedStudents);
            const grouped = fetchedStudents.reduce((acc, student) => {
                const className = normalizeClassName(student.CLASSE);
                if (!className) return acc;
                if (!acc[className]) acc[className] = [];
                acc[className].push(student);
                return acc;
            }, {} as GroupedStudents);
            Object.keys(grouped).forEach(className => { grouped[className].sort((a, b) => a.NOM.localeCompare(b.NOM)); });
            const sortedGroupedStudents = Object.keys(grouped).sort().reduce((obj, key) => { obj[key] = grouped[key]; return obj; }, {} as GroupedStudents);
            setGroupedStudents(sortedGroupedStudents);
        } catch (err: any) {
            console.error("Erreur de récupération des élèves :", err);
            setError("Impossible de charger la liste des élèves. " + err.message);
            toast({ variant: 'destructive', title: 'Erreur de chargement', description: err.message });
        } finally {
            setIsLoadingData(false);
        }
    }, [selectedYear, toast]);

    useEffect(() => { fetchAndGroupStudents(); }, [fetchAndGroupStudents]);

    const classAverages = useMemo(() => {
        const averages: { [className: string]: { [subject: string]: { bb1?: number; bb2?: number; } } } = {};
        if (!config) return averages;

        for (const className in groupedStudents) {
            const studentsInClass = groupedStudents[className];
            averages[className] = {};
            for (const subject of config.subjects) {
                let totalBb1 = 0, countBb1 = 0; let totalBb2 = 0, countBb2 = 0;
                studentsInClass.forEach(student => {
                    const noteBb1 = student.notes?.[subject]?.bb1; const noteBb2 = student.notes?.[subject]?.bb2;
                    if (noteBb1 !== undefined && noteBb1 !== null && !isNaN(noteBb1)) { totalBb1 += noteBb1; countBb1++; }
                    if (noteBb2 !== undefined && noteBb2 !== null && !isNaN(noteBb2)) { totalBb2 += noteBb2; countBb2++; }
                });
                const maxScore = config.maxScores[subject];
                averages[className][subject] = {
                    bb1: countBb1 > 0 ? ((totalBb1 / countBb1) / maxScore) * 20 : undefined,
                    bb2: countBb2 > 0 ? ((totalBb2 / countBb2) / maxScore) * 20 : undefined,
                };
            }
        }
        return averages;
    }, [groupedStudents, config]);

    const calculateStudentTotalScore = useCallback((student: Student, brevetKey: 'bb1' | 'bb2') => {
        if (!config || isPostReform) return undefined; // Don't calculate total for post-reform
        let totalScore = 0;
        let hasAnyNote = false;

        for (const matiere of config.subjects) {
            const note = student.notes?.[matiere]?.[brevetKey];
            if (note !== undefined && note !== null && !isNaN(note)) {
                totalScore += note;
                hasAnyNote = true;
            }
        }
        return hasAnyNote ? totalScore : undefined;
    }, [config, isPostReform]);


    const overallClassAverages = useMemo(() => {
        const averages: { [className: string]: { bb1?: number; bb2?: number } } = {};
        for (const className in groupedStudents) {
            const studentsInClass = groupedStudents[className];
            let sumOfStudentAveragesBb1 = 0, participatingStudentsBb1 = 0;
            let sumOfStudentAveragesBb2 = 0, participatingStudentsBb2 = 0;

            studentsInClass.forEach(student => {
                const avg1 = calculateBrevetBlancAverage(student, config, 'bb1');
                if (avg1 !== undefined) {
                    sumOfStudentAveragesBb1 += avg1;
                    participatingStudentsBb1++;
                }
                 const avg2 = calculateBrevetBlancAverage(student, config, 'bb2');
                if (avg2 !== undefined) {
                    sumOfStudentAveragesBb2 += avg2;
                    participatingStudentsBb2++;
                }
            });

            averages[className] = {
                bb1: participatingStudentsBb1 > 0 ? sumOfStudentAveragesBb1 / participatingStudentsBb1 : undefined,
                bb2: participatingStudentsBb2 > 0 ? sumOfStudentAveragesBb2 / participatingStudentsBb2 : undefined,
            };
        }
        return averages;
    }, [groupedStudents, config]);

    const handleClassDetailClick = (className: string, studentsInClass: Student[]) => {
      setSelectedClassForModal({ className, students: studentsInClass });
      setIsClassDetailModalOpen(true);
    };

    const handleGenerateReport = (config: ReportConfig) => {
        setReportConfig(config);
    };

    const handleExport = async (format: 'xlsx') => {
        if (students.length === 0) {
          toast({ title: "Exportation annulée", description: "Aucune donnée à exporter.", variant: "warning" });
          return;
        }
        setIsExporting(true);
        try {
            const wb = XLSX.utils.book_new();

            const applySummarySheetStyling = (worksheet: XLSX.WorkSheet, data: any[], headers: string[]) => {

                const getMoyenneExcelStyle = (moyenne?: number) => {
                    const style: any = { numFmt: "0.0", alignment: { horizontal: 'center', vertical: 'middle' } };
                    let bgColor = "", fontColor = "FFFFFF";
                    if (moyenne === undefined) return style;
                    if (moyenne >= 15) bgColor = "16A34A";
                    else if (moyenne >= 10) { bgColor = "4ADE80"; fontColor = "000000"; }
                    else if (moyenne >= 8) { bgColor = "FBBF24"; fontColor = "000000"; }
                    else bgColor = "DC2626";
                    if (bgColor) { style.fill = { fgColor: { rgb: bgColor }, patternType: "solid" }; style.font = { color: { rgb: fontColor } }; }
                    return style;
                };

                const headerRange = XLSX.utils.decode_range(worksheet['!ref']!);
                for (let R = 1; R <= headerRange.e.r; R++) {
                    for (let C = 3; C < headers.length; C++) { // Start after Nom, Prénom, Classe
                        const cell_address = XLSX.utils.encode_cell({c:C, r:R});
                        if(!worksheet[cell_address]) continue;
                        if (headers[C].includes('Moyenne')) {
                            worksheet[cell_address].s = getMoyenneExcelStyle(data[R-1][headers[C]]);
                        } else {
                            worksheet[cell_address].s = { alignment: { horizontal: 'center', vertical: 'middle' } };
                        }
                    }
                }
                const verticalHeaderStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', textRotation: 90, wrapText: true } };
                const normalHeaderStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }};

                for (let C = 0; C <= headerRange.e.c; ++C) {
                   const address = XLSX.utils.encode_cell({c: C, r: 0});
                   if (worksheet[address]) {
                     const headerText = headers[C] || "";
                      const isRotatedHeader = orderedSubjects.some(s => headerText.startsWith(config.subjects.find(subj => subj === s) || s)) || headerText.includes("Moyenne");
                     worksheet[address].s = isRotatedHeader ? verticalHeaderStyle : normalHeaderStyle;
                   }
                }
                if (!worksheet['!rows']) worksheet['!rows'] = [];
                worksheet['!rows'][0] = { hpx: 100 };

                const colWidths = headers.map(h => {
                    const isSubjectOrMoyenne = orderedSubjects.some(s => h.startsWith(config.subjects.find(subj => subj === s) || s)) || h.includes("Moyenne");
                    if(isSubjectOrMoyenne) return { wch: 8 };
                    if(h === 'Classe') return { wch: 10 };
                    return { wch: 18 };
                });
                worksheet['!cols'] = colWidths;
            };

            const createClassSheet = (students: Student[], brevetType: 'bb1' | 'bb2') => {
                if (!config) return null;
                const isPostReform = !!config.coefficients;

                let studentCountWithAnyNote = 0;
                let studentCountWithAllNotes = 0;

                const studentData = students.map((student) => {
                    const row: (string | number)[] = ['', student.NOM, student.PRENOM, getClassCellValue(student.CLASSE)];
                    let studentTotal = 0;
                    let noteCount = 0;
                    orderedSubjects.forEach(matiere => {
                        const note = student.notes?.[matiere]?.[brevetType];
                        if (note !== undefined && note !== null) { row.push(note); studentTotal += note; noteCount++; } else { row.push("ABS"); }
                    });
                    if(noteCount > 0) studentCountWithAnyNote++;
                    if(noteCount === orderedSubjects.length) studentCountWithAllNotes++;
                    const average = calculateBrevetBlancAverage(student, config, brevetType);
                    if (!isPostReform) row.push(noteCount > 0 ? studentTotal : "ABS", average !== undefined ? parseFloat(average.toFixed(1)) : "ABS");
                    else row.push(average !== undefined ? parseFloat(average.toFixed(1)) : "ABS");
                    return row;
                });
                if (studentCountWithAnyNote === 0) return null;

                const getColumnStats = (data: (number | string)[]) => {
                    const numbers = data.filter(d => typeof d === 'number') as number[];
                    if (numbers.length === 0) return { mean: 'N/A', median: 'N/A', max: 'N/A', min: 'N/A', range: 'N/A' };
                    const sum = numbers.reduce((acc, val) => acc + val, 0);
                    const mean = (sum / numbers.length).toFixed(1);
                    const sorted = [...numbers].sort((a, b) => a - b);
                    const mid = Math.floor(sorted.length / 2);
                    const median = sorted.length % 2 !== 0 ? sorted[mid].toFixed(1) : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
                    const max = Math.max(...numbers).toFixed(1);
                    const min = Math.min(...numbers).toFixed(1);
                    const range = (parseFloat(max) - parseFloat(min)).toFixed(1);
                    return { mean, median, max, min, range };
                };

                const columns: { [key: string]: (number|string)[] } = {};
                orderedSubjects.forEach((m) => columns[m] = []);
                if (!isPostReform) columns['Total'] = [];
                columns['Moyenne'] = [];
                studentData.forEach(row => {
                    orderedSubjects.forEach((m, i) => columns[m].push(row[4 + i]!));
                    if (!isPostReform) {
                        columns['Total'].push(row[4 + orderedSubjects.length]!);
                        columns['Moyenne'].push(row[5 + orderedSubjects.length]!);
                    } else columns['Moyenne'].push(row[4 + orderedSubjects.length]!);
                });

                const statRows: (string | number)[][] = [
                    ['', '', '', 'Moyenne'],
                    ['', '', '', 'Médiane'],
                    ['', '', '', 'Note maximum'],
                    ['', '', '', 'Note minimum'],
                    ['', '', '', 'Étendue']
                ];

                const allStats: Record<string, any> = orderedSubjects.reduce((acc, m) => ({...acc, [m]: getColumnStats(columns[m])}), {} as Record<string, any>);
                if (!isPostReform) allStats['Total'] = getColumnStats(columns['Total']);
                allStats['Moyenne'] = getColumnStats(columns['Moyenne']);
                ['mean', 'median', 'max', 'min', 'range'].forEach((statKey, index) => {
                    const row = statRows[index];
                    orderedSubjects.forEach(m => row.push(allStats[m][statKey]));
                    if (!isPostReform) row.push(allStats['Total'][statKey]);
                    row.push(allStats['Moyenne'][statKey]);
                });

                const header1 = ['', 'NOM', 'Prénom', 'Classe', ...orderedSubjects.map(s => config.subjects.find(subj => subj === s) || s), ...isPostReform ? [] : ['Total'], 'Moyenne'];
                const header2 = ['', '', '', '', ...orderedSubjects.map(() => ''), ...isPostReform ? [] : [''], '/20'];
                const fullData = [header1, header2, ...studentData, [], ...statRows];
                const ws = XLSX.utils.aoa_to_sheet(fullData);

                const headerRange = XLSX.utils.decode_range(ws['!ref']!);
                const verticalHeaderStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', textRotation: 90, wrapText: true } };
                const headerStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
                for (let C = 0; C <= headerRange.e.c; ++C) {
                    const addressRow1 = XLSX.utils.encode_cell({c: C, r: 0});
                    if(ws[addressRow1]) {
                        ws[addressRow1].s = verticalHeaderStyle;
                    }
                    const addressRow2 = XLSX.utils.encode_cell({c: C, r: 1});
                    if(ws[addressRow2]) ws[addressRow2].s = headerStyle;
                }
                if(!ws['!rows']) ws['!rows'] = [];
                ws['!rows'][0] = { hpx: 80 };
                ws['!rows'][1] = { hpx: 20 };

                const centerAlignStyle = { alignment: { horizontal: 'center', vertical: 'middle' } };

                const getMoyenneCellStyle = (moyenne?: number) => {
                    const style: any = { font: { bold: true }, alignment: { ...centerAlignStyle } };
                    let bgColor = "", fontColor = "FFFFFF";
                    if (moyenne === undefined) return style;
                    if (moyenne >= 15) bgColor = "16A34A";
                    else if (moyenne >= 10) { bgColor = "4ADE80"; fontColor = "000000"; }
                    else if (moyenne >= 8) { bgColor = "FBBF24"; fontColor = "000000"; }
                    else bgColor = "DC2626";
                    if (bgColor) { style.fill = { fgColor: { rgb: bgColor }, patternType: "solid" }; style.font = { color: { rgb: fontColor } }; }
                    return style;
                };

                for (let R = 2; R < 2 + studentData.length; ++R) {
                    for (let C = 3; C < 4 + orderedSubjects.length; ++C) {
                        const address = XLSX.utils.encode_cell({ r: R, c: C });
                        if (ws[address]) {
                            ws[address].s = { ...ws[address].s, ...centerAlignStyle };
                            if (ws[address].v === 'ABS') ws[address].s.font = { color: { rgb: "888888" } };
                        }
                    }
                    const averageCellAddress = XLSX.utils.encode_cell({ r: R, c: isPostReform ? 4 + orderedSubjects.length : 5 + orderedSubjects.length });
                    if(ws[averageCellAddress] && typeof ws[averageCellAddress].v === 'number') {
                         ws[averageCellAddress].s = getMoyenneCellStyle(ws[averageCellAddress].v as number);
                    }
                }

                 const statRowStyles = [
                    { fill: { fgColor: { rgb: "E0E7FF" } }, font: { bold: true }, alignment: { ...centerAlignStyle } },
                    { fill: { fgColor: { rgb: "D1FAE5" } }, font: { bold: true }, alignment: { ...centerAlignStyle } },
                    { fill: { fgColor: { rgb: "FEF9C3" } }, font: { bold: true }, alignment: { ...centerAlignStyle } },
                    { fill: { fgColor: { rgb: "FEE2E2" } }, font: { bold: true }, alignment: { ...centerAlignStyle } },
                    { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true }, alignment: { ...centerAlignStyle } },
                ];

                 const statsStartIndex = 2 + studentData.length + 1;
                 for (let R = statsStartIndex; R < statsStartIndex + 5; ++R) {
                    const style = statRowStyles[R - statsStartIndex];
                    if (style) {
                        for (let C = 0; C <= headerRange.e.c; ++C) {
                             const address = XLSX.utils.encode_cell({ r: R, c: C });
                             if (!ws[address]) ws[address] = { t: 's', v: '' };
                             ws[address].s = style;
                        }
                    }
                 }
                const presentStatsRow = ['', '', 'Présents à au moins une épreuve', studentCountWithAnyNote, ...Array(headerRange.e.c - 3).fill(null)];
                const allPresentStatsRow = ['', '', 'Présents à toutes les épreuves', studentCountWithAllNotes, ...Array(headerRange.e.c - 3).fill(null)];
                const presentRowIndex = statsStartIndex + 5;
                const allPresentRowIndex = statsStartIndex + 6;

                XLSX.utils.sheet_add_aoa(ws, [presentStatsRow], { origin: `A${presentRowIndex + 1}` });
                XLSX.utils.sheet_add_aoa(ws, [allPresentStatsRow], { origin: `A${allPresentRowIndex + 1}` });

                if (!ws['!merges']) ws['!merges'] = [];
                ws['!merges'].push({ s: { r: presentRowIndex, c: 3 }, e: { r: presentRowIndex, c: headerRange.e.c } });
                ws['!merges'].push({ s: { r: allPresentRowIndex, c: 3 }, e: { r: allPresentRowIndex, c: headerRange.e.c } });


                return ws;
            };

            const allStudentsDetailedData = students.map(student => {
                const averageBb1 = calculateBrevetBlancAverage(student, config, 'bb1');
                const averageBb2 = calculateBrevetBlancAverage(student, config, 'bb2');
                const row: { [key: string]: any } = {
                    'Nom': student.NOM,
                    'Prénom': student.PRENOM,
                    'Classe': getClassCellValue(student.CLASSE),
                    'Moyenne BB1': averageBb1 !== undefined ? parseFloat(averageBb1.toFixed(1)) : undefined,
                    'Moyenne BB2': averageBb2 !== undefined ? parseFloat(averageBb2.toFixed(1)) : undefined,
                };
                orderedSubjects.forEach(matiere => {
                    row[`${config.subjects.find(s => s === matiere) || matiere} BB1`] = student.notes?.[matiere]?.bb1;
                    row[`${config.subjects.find(s => s === matiere) || matiere} BB2`] = student.notes?.[matiere]?.bb2;
                });
                return row;
            });

            const subjectHeaders = orderedSubjects.flatMap(m => [`${config.subjects.find(s => s === m) || m} BB1`, `${config.subjects.find(s => s === m) || m} BB2`]);
            const headerOrder = ['Nom', 'Prénom', 'Classe', 'Moyenne BB1', 'Moyenne BB2', ...subjectHeaders];


            const alphaSorted = [...allStudentsDetailedData].sort((a, b) => a.Nom.localeCompare(b.Nom) || a.Prénom.localeCompare(b.Prénom));
            if (alphaSorted.length > 0) {
                const wsAlpha = XLSX.utils.json_to_sheet(alphaSorted, { header: headerOrder });
                applySummarySheetStyling(wsAlpha, alphaSorted, headerOrder);
                XLSX.utils.book_append_sheet(wb, wsAlpha, 'Tout (Alpha)');
            }
            const rankingSorted = [...allStudentsDetailedData].sort((a, b) => (b['Moyenne BB2'] ?? b['Moyenne BB1'] ?? -1) - (a['Moyenne BB2'] ?? a['Moyenne BB1'] ?? -1));
             if (rankingSorted.length > 0) {
                const wsRanking = XLSX.utils.json_to_sheet(rankingSorted, { header: headerOrder });
                applySummarySheetStyling(wsRanking, rankingSorted, headerOrder);
                XLSX.utils.book_append_sheet(wb, wsRanking, 'Tout (Classement)');
             }
            Object.entries(groupedStudents).forEach(([className, classStudents]) => {
                const ws_bb1 = createClassSheet(classStudents, 'bb1');
                if (ws_bb1) XLSX.utils.book_append_sheet(wb, ws_bb1, `${className} - BB1`);
                const ws_bb2 = createClassSheet(classStudents, 'bb2');
                if (ws_bb2) XLSX.utils.book_append_sheet(wb, ws_bb2, `${className} - BB2`);
            });

            if (wb.SheetNames.length === 0) {
                toast({ title: "Aucune donnée de note", description: "Aucune note n'a été trouvée pour les classes sélectionnées pour générer un export." });
                setIsExporting(false); return;
            }
            XLSX.writeFile(wb, `Export_Brevet_Blanc_${selectedYear}.${format}`, { bookType: format, cellStyles: true });
            toast({ title: `Exportation ${format.toUpperCase()} Réussie`, description: "Le fichier a été téléchargé." });
        } catch (exportError: any) {
          console.error("Failed to export data:", exportError);
          toast({ title: "Erreur d'exportation", description: `Une erreur est survenue: ${exportError.message}`, variant: "destructive" });
        } finally {
          setIsExporting(false);
        }
    };


    const renderContent = () => {
        if (isLoadingData || !config) {
            return (
                <Card>
                    <CardHeader> <Skeleton className="h-8 w-1/2" /> <Skeleton className="h-4 w-1/3" /> </CardHeader>
                    <CardContent className="space-y-4 pt-6"> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> </CardContent>
                </Card>
            );
        }

        if (error) {
            return (
                <Card className="text-center">
                  <CardHeader><CardTitle className="text-destructive flex justify-center items-center"><AlertTriangle className="mr-2 h-6 w-6"/>Une erreur est survenue</CardTitle></CardHeader>
                  <CardContent className="pt-6"><p className="text-muted-foreground">{error}</p><button onClick={fetchAndGroupStudents} className="mt-4"><Loader2 className="mr-2 h-4 w-4" />Réessayer</button></CardContent>
                </Card>
            );
        }

        if (students.length === 0) {
            return (
                <Card className="text-center">
                  <CardHeader><CardTitle className="flex justify-center items-center"><Frown className="mr-2 h-6 w-6"/>Aucun élève trouvé</CardTitle></CardHeader>
                  <CardContent className="pt-6"><p className="text-muted-foreground">Aucun élève trouvé pour l'année scolaire {selectedYear}. Veuillez importer une liste d'élèves.</p></CardContent>
                </Card>
            );
        }

        if (Object.keys(groupedStudents).length === 0) {
            return (
                <Card className="text-center">
                  <CardHeader><CardTitle className="flex justify-center items-center"><Frown className="mr-2 h-6 w-6"/>Aucune classe renseignee</CardTitle></CardHeader>
                  <CardContent className="pt-6"><p className="text-muted-foreground">Les eleves charges n'ont pas de classe renseignee. Les vues, rapports et statistiques par classe sont masques.</p></CardContent>
                </Card>
            );
        }

        return (
          <Accordion type="multiple" className="w-full space-y-4">
             {Object.entries(groupedStudents).map(([className, classStudents]) => (
                <AccordionItem value={className} key={className} className="border-none">
                  <Card className="shadow-md rounded-lg">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline rounded-t-lg data-[state=open]:bg-muted/50 data-[state=open]:border-b group">
                         <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2">
                            <div className="flex items-center gap-3"><Users className="h-6 w-6 text-primary"/><span className="text-lg font-medium">Classe : {className}</span></div>
                            <div className="flex items-center gap-x-4">
                                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-normal text-muted-foreground">
                                    <div className="flex items-center gap-1.5 font-semibold"><span className="text-foreground">Moy:</span><span className="font-bold text-primary">{overallClassAverages[className]?.bb1?.toFixed(1) ?? '-'}</span><span className="font-bold text-green-600">{overallClassAverages[className]?.bb2?.toFixed(1) ?? '-'}</span></div>
                                    {orderedSubjects.map(matiere => (<div key={`${className}-${matiere}-avg`} className="flex items-center gap-1.5"><span className="font-medium text-foreground">{config.abbreviations[matiere] || matiere}:</span><span className="font-semibold text-primary">{classAverages[className]?.[matiere]?.bb1?.toFixed(1) ?? '-'}</span><span className="font-semibold text-green-600">{classAverages[className]?.[matiere]?.bb2?.toFixed(1) ?? '-'}</span></div>))}
                                </div>
                                <div role="button" tabIndex={0} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity")}
                                    onMouseDown={(e) => { e.stopPropagation(); handleClassDetailClick(className, classStudents); }}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleClassDetailClick(className, classStudents); } }}
                                    aria-label={`Voir le panorama pour la classe ${className}`} title={`Panorama de la classe ${className}`}>
                                    <BarChart2 className="h-4 w-4" />
                                </div>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 sm:px-4 pb-4">
                        <div className="overflow-x-auto mt-2">
                          <Table>
                              <TableHeader>
                                  <TableRow>
                                    <TableHead className="sticky left-0 bg-card z-10 min-w-[120px] font-semibold">Nom</TableHead>
                                    <TableHead className="sticky left-[120px] bg-card z-10 min-w-[120px] font-semibold">Prénom</TableHead>
                                    {!isPostReform && <TableHead className="sticky left-[240px] bg-card z-10 min-w-[120px] font-semibold text-center">Total</TableHead>}
                                    <TableHead className={cn("sticky bg-card z-10 min-w-[120px] font-semibold text-center border-r", isPostReform ? "left-[240px]" : "left-[360px]")}>Moyenne</TableHead>
                                    {orderedSubjects.map(matiere => (<TableHead key={matiere} colSpan={2} className="text-center min-w-[140px] font-semibold cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleSubjectHeaderClick(matiere)} title={`Cliquer pour mettre ${config.subjects.find(s => s === matiere)} en premier`}><div className="flex items-center justify-center gap-2">{config.subjects.find(s => s === matiere)}<ArrowRightLeft className="h-3 w-3 text-muted-foreground" /></div></TableHead>))}
                                  </TableRow>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="sticky left-0 bg-muted/50 z-10 text-xs font-normal text-muted-foreground">{classStudents.length} élève(s)</TableHead>
                                    <TableHead className="sticky left-[120px] bg-muted/50 z-10"></TableHead>
                                    {!isPostReform && <TableHead className="sticky left-[240px] bg-muted/50 z-10"></TableHead>}
                                    <TableHead className={cn("sticky bg-muted/50 z-10 border-r", isPostReform ? "left-[240px]" : "left-[360px]")}>/20</TableHead>
                                    {orderedSubjects.map(matiere => (<React.Fragment key={`${matiere}-sub`}><TableHead className="text-center font-normal bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">BB1</TableHead><TableHead className="text-center font-normal border-r last:border-r-0 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">BB2</TableHead></React.Fragment>))}
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {classStudents.map((student) => {
                                      const averageBb1 = calculateBrevetBlancAverage(student, config, 'bb1');
                                      const totalScore1 = calculateStudentTotalScore(student, 'bb1');
                                      const averageBb2 = calculateBrevetBlancAverage(student, config, 'bb2');
                                      const totalScore2 = calculateStudentTotalScore(student, 'bb2');
                                      return (
                                        <TableRow key={student.id} className="even:bg-muted/30">
                                            <TableCell className="font-medium sticky left-0 bg-inherit z-10">{student.NOM}</TableCell>
                                            <TableCell className="sticky left-[120px] bg-inherit z-10">{student.PRENOM}</TableCell>
                                            {!isPostReform && (
                                              <TableCell className="font-medium text-center sticky left-[240px] bg-inherit z-10">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    {totalScore1 !== undefined ? (<span className="font-semibold text-primary">{totalScore1.toFixed(1)}</span>) : (<span className="text-xs text-muted-foreground">ABS</span>)}
                                                    {totalScore2 !== undefined ? (<span className="font-semibold text-green-600">{totalScore2.toFixed(1)}</span>) : (<span className="text-xs text-muted-foreground">ABS</span>)}
                                                </div>
                                              </TableCell>
                                            )}
                                            <TableCell className={cn("font-medium text-center sticky z-10 border-r", isPostReform ? "left-[240px]" : "left-[360px]", "bg-inherit")}>
                                                <div className="flex flex-col items-center gap-0.5">
                                                    {averageBb1 !== undefined ? (<span className="font-semibold text-primary">{averageBb1.toFixed(1)}</span>) : (<span className="text-xs text-muted-foreground">ABS</span>)}
                                                    {averageBb2 !== undefined ? (<span className="font-semibold text-green-600">{averageBb2.toFixed(1)}</span>) : (<span className="text-xs text-muted-foreground">ABS</span>)}
                                                </div>
                                            </TableCell>
                                            {orderedSubjects.map(matiere => (
                                                <React.Fragment key={`${student.id}-${matiere}`}>
                                                    <TableCell className="text-center font-medium text-primary">
                                                        {(student.notes?.[matiere]?.bb1 !== undefined && student.notes?.[matiere]?.bb1 !== null) ? student.notes?.[matiere]?.bb1.toFixed(1) : <span className="text-xs text-muted-foreground">ABS</span>}
                                                    </TableCell>
                                                    <TableCell className="text-center font-medium text-green-600 border-r last:border-r-0">
                                                        {(student.notes?.[matiere]?.bb2 !== undefined && student.notes?.[matiere]?.bb2 !== null) ? student.notes?.[matiere]?.bb2.toFixed(1) : <span className="text-xs text-muted-foreground">ABS</span>}
                                                    </TableCell>
                                                </React.Fragment>
                                            ))}
                                        </TableRow>
                                      );
                                  })}
                              </TableBody>
                          </Table>
                        </div>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
             ))}
          </Accordion>
        );
    }

    return (
        <div className="space-y-6 p-1 md:p-4">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground tracking-tight">Consulter les Notes du Brevet Blanc</h1>
                    <p className="text-muted-foreground mt-1">Visualisez les notes des élèves par classe. Cliquez sur un en-tête de matière pour la réorganiser.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Button onClick={() => setIsReportConfigModalOpen(true)} disabled={Object.keys(groupedStudents).length === 0}>
                        <FileSignature className="mr-2 h-4 w-4" />
                        Rapport
                    </Button>
                     <Button onClick={() => handleExport('xlsx')} disabled={isYearsLoading || isLoadingData || isExporting || students.length === 0}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                        Exporter (.xlsx)
                    </Button>
                    <Button onClick={() => setIsComparisonModalOpen(true)} disabled={Object.keys(groupedStudents).length === 0}><BarChart2 className="mr-2 h-4 w-4" />Comparer les Classes</Button>
                    <div className="w-full sm:w-52">
                        <Label htmlFor="year-select">Année Scolaire</Label>
                        <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isYearsLoading || availableYears.length === 0}>
                            <SelectTrigger id="year-select"><SelectValue placeholder={isYearsLoading ? "Chargement..." : "Choisir..."} /></SelectTrigger>
                            <SelectContent>{!isYearsLoading && availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent>
                        </Select>
                    </div>
                </div>
            </header>
            {renderContent()}

            {selectedClassForModal && config && (
                <BrevetBlancClassDetailModal isOpen={isClassDetailModalOpen} onOpenChange={setIsClassDetailModalOpen} className={selectedClassForModal.className} students={selectedClassForModal.students} config={config}/>
            )}

            {classAverages && overallClassAverages && (
                <BrevetBlancClassComparisonModal isOpen={isComparisonModalOpen} onOpenChange={setIsComparisonModalOpen} overallAverages={overallClassAverages} subjectAverages={classAverages} config={config} />
            )}

            {isReportConfigModalOpen && (
                <BrevetBlancReportConfigModal
                    isOpen={isReportConfigModalOpen}
                    onOpenChange={setIsReportConfigModalOpen}
                    availableClasses={Object.keys(groupedStudents)}
                    onGenerate={handleGenerateReport}
                />
            )}

            {reportConfig && (
                <BrevetBlancReportModal
                    config={reportConfig}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setReportConfig(null);
                    }}
                    students={students}
                    availableClasses={Object.keys(groupedStudents)}
                    year={selectedYear}
                />
            )}
        </div>
    );
}
