
"use client";

import { useMemo } from 'react';
import type { BrevetResultReportConfig } from '@/components/brevet-result-report-config-modal';
import type { ProcessedStudentData } from '@/contexts/FilterContext';

const REPORT_COLUMNS = [
  { key: 'scoreFrancais', label: 'Français', shortLabel: 'Français', maxScore: 20 },
  { key: 'scoreMaths', label: 'Mathématiques', shortLabel: 'Maths', maxScore: 20 },
  { key: 'scoreHistoireGeo', label: 'Histoire-Géo, EMC', shortLabel: 'H-G, EMC', maxScore: 20 },
  { key: 'scoreSciences', label: 'Sciences', shortLabel: 'Sciences', maxScore: 20 },
  { key: 'scoreOralDNB', label: 'Soutenance Orale', shortLabel: 'Oral', maxScore: 20 },
  { key: 'scoreSocleCommun', label: 'Socle Commun', shortLabel: 'Socle', maxScore: 20 },
];

const normalizeTextForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
};

const getColumnStats = (data: (number | undefined)[]) => {
    const numbers = data.filter(d => typeof d === 'number' && !isNaN(d)) as number[];
    if (numbers.length === 0) return { mean: undefined, median: undefined, max: undefined, min: undefined, range: undefined, presentCount: 0, totalCount: data.length };

    const sum = numbers.reduce((acc, val) => acc + val, 0);
    const mean = sum / numbers.length;

    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const max = Math.max(...numbers);
    const min = Math.min(...numbers);
    const range = max - min;

    return { mean, median, max, min, range, presentCount: numbers.length, totalCount: data.length };
};


export const useBrevetResultReport = (config: BrevetResultReportConfig | null, students: ProcessedStudentData[], sortConfig: { key: string; direction: 'asc' | 'desc'; } | null) => {

    const reportData = useMemo(() => {
        if (!config) return null;

        const filteredStudents = students.filter(s => config.selectedResults.includes(s.resultat || 'Non spécifié'));

        const stats = {
            admis: 0, refuse: 0, successRate: 0, totalStudents: 0,
            mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 0 },
            subjectAveragesChartData: [] as { name: string; average?: number }[],
        };

        const normalizedAdmisStr = normalizeTextForComparison('admis');
        const normalizedTresBienStr = normalizeTextForComparison('très bien');
        const normalizedAssezBienStr = normalizeTextForComparison('assez bien');
        const normalizedBienStr = normalizeTextForComparison('bien');

        filteredStudents.forEach(student => {
          const normalizedResultat = normalizeTextForComparison(student.resultat);
          if (normalizedResultat.includes(normalizedAdmisStr)) {
            stats.admis++;
            if (normalizedResultat.includes(normalizedTresBienStr)) stats.mentions.tresBien++;
            else if (normalizedResultat.includes(normalizedAssezBienStr)) stats.mentions.assezBien++;
            else if (normalizedResultat.includes(normalizedBienStr)) stats.mentions.bien++;
            else stats.mentions.sansMention++;
          } else if (normalizeTextForComparison(student.resultat).includes("refuse")) {
            stats.refuse++;
          }
        });

        const totalConsidered = stats.admis + stats.refuse;
        stats.totalStudents = totalConsidered;
        stats.successRate = totalConsidered > 0 ? (stats.admis / totalConsidered) * 100 : 0;

        stats.subjectAveragesChartData = REPORT_COLUMNS.map(col => {
            const colStats = getColumnStats(filteredStudents.map(s => s[col.key as keyof typeof s] as number | undefined));
            const averageOutOf20 = colStats.mean !== undefined ? (colStats.mean / col.maxScore) * 20 : undefined;
            return {
                name: col.label,
                average: averageOutOf20,
            };
        }).filter((entry) => entry.average !== undefined);

        return { filteredStudents, config, stats };
    }, [config, students]);


    const sortedStudentRows = useMemo(() => {
        if (!reportData) return [];
        if (!sortConfig) return reportData.filteredStudents;

        return [...reportData.filteredStudents].sort((a, b) => {
            const { key, direction } = sortConfig;
            const rawValA = a[key as keyof ProcessedStudentData];
            const rawValB = b[key as keyof ProcessedStudentData];
            const valA = typeof rawValA === 'string' || typeof rawValA === 'number' ? rawValA : undefined;
            const valB = typeof rawValB === 'string' || typeof rawValB === 'number' ? rawValB : undefined;

            if (valA === undefined && valB === undefined) return 0;
            if (valA === undefined) return 1;
            if (valB === undefined) return -1;

            if (typeof valA === 'number' && typeof valB === 'number') {
                return direction === 'asc' ? valA - valB : valB - valA;
            }
            if (typeof valA === 'string' && typeof valB === 'string') {
                return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return 0;
        });
    }, [reportData, sortConfig]);

    const columnStats = useMemo(() => {
        if (!reportData) return {};
        const stats: Record<string, ReturnType<typeof getColumnStats>> = {};
        const { filteredStudents } = reportData;

        REPORT_COLUMNS.forEach(col => {
            stats[col.key] = getColumnStats(filteredStudents.map(s => s[col.key as keyof typeof s] as number | undefined));
        });
        stats['totalGeneral'] = getColumnStats(filteredStudents.map(s => s.totalGeneral));
        stats['moyenne'] = getColumnStats(filteredStudents.map(s => s.moyenne));

        return stats;
    }, [reportData]);

    const titleText = useMemo(() => {
        if (!reportData) return "Chargement...";
        const { selectedResults } = reportData.config;
        if (selectedResults.length > 3) {
          return `${selectedResults.length} résultats sélectionnés`;
        }
        return selectedResults.join(', ');
    }, [reportData]);

    return { reportData, sortedStudentRows, columnStats, titleText };
};
