"use client";

import { useMemo } from 'react';
import type { ReportConfig } from '@/components/brevet-blanc-report-config-modal';
import type { Student } from '@/app/dashboard/brevet-blanc/voir-notes/page';
import { getBrevetConfigForYear, calculateBrevetBlancAverage } from '@/lib/brevet-config';
import { normalizeClassName } from '@/lib/student-class';

export const useBrevetBlancReport = (config: ReportConfig | null, students: Student[], year: string) => {
  const reportData = useMemo(() => {
    if (!config || !year) return null;

    const brevetConfig = getBrevetConfigForYear(year);
    const filteredStudents = students.filter((student) => {
      const className = normalizeClassName(student.CLASSE);
      return className ? config.classNames.includes(className) : false;
    });

    const statsBB1 = {
        admis: 0, refuse: 0, successRate: 0,
        subjectAverages: {} as Record<string, number | undefined>
    };
    const statsBB2 = {
        admis: 0, refuse: 0, successRate: 0,
        subjectAverages: {} as Record<string, number | undefined>
    };

    filteredStudents.forEach(student => {
        const avg1 = calculateBrevetBlancAverage(student, brevetConfig, 'bb1');
        if (avg1 !== undefined) { if (avg1 >= 10) statsBB1.admis++; else statsBB1.refuse++; }

        const avg2 = calculateBrevetBlancAverage(student, brevetConfig, 'bb2');
        if (avg2 !== undefined) { if (avg2 >= 10) statsBB2.admis++; else statsBB2.refuse++; }
    });

    const getColumnStats = (data: (number | undefined)[]) => {
        const numbers = data.filter(d => typeof d === 'number' && !isNaN(d)) as number[];
        if (numbers.length === 0) return { mean: undefined };
        const sum = numbers.reduce((acc, val) => acc + val, 0);
        return { mean: sum / numbers.length };
    };

    const totalConsidered1 = statsBB1.admis + statsBB1.refuse;
    statsBB1.successRate = totalConsidered1 > 0 ? (statsBB1.admis / totalConsidered1) * 100 : 0;

    const totalConsidered2 = statsBB2.admis + statsBB2.refuse;
    statsBB2.successRate = totalConsidered2 > 0 ? (statsBB2.admis / totalConsidered2) * 100 : 0;

    brevetConfig.subjects.forEach(matiere => {
        statsBB1.subjectAverages[matiere] = getColumnStats(filteredStudents.map(s => s.notes?.[matiere]?.bb1)).mean;
        statsBB2.subjectAverages[matiere] = getColumnStats(filteredStudents.map(s => s.notes?.[matiere]?.bb2)).mean;
    });

    const comparisonChartData = brevetConfig.subjects.map(m => ({
        name: m,
        bb1: statsBB1.subjectAverages[m] ? (statsBB1.subjectAverages[m]! / brevetConfig.maxScores[m]) * 20 : undefined,
        bb2: statsBB2.subjectAverages[m] ? (statsBB2.subjectAverages[m]! / brevetConfig.maxScores[m]) * 20 : undefined,
    }));

    return { studentCount: filteredStudents.length, filteredStudents, config, statsBB1, statsBB2, comparisonChartData };
  }, [config, students, year]);

  return { reportData };
};
