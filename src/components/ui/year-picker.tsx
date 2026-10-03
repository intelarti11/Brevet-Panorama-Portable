
"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface YearPickerProps {
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
  initialDisplayYear?: number;
  minYear?: number;
  maxYear?: number;
}

const YEARS_IN_VIEW = 12; // Display 12 years (e.g., 4x3 grid)

export function YearPicker({
  selectedYear,
  onSelectYear,
  initialDisplayYear,
  minYear = new Date().getFullYear() - 100, // Default min year
  maxYear = new Date().getFullYear() + 10,  // Default max year
}: YearPickerProps) {
  const [currentBlockStartYear, setCurrentBlockStartYear] = React.useState(() => {
    const yearToUse = initialDisplayYear || selectedYear || new Date().getFullYear();
    // Adjust to the start of a 12-year block
    return Math.floor((yearToUse - minYear) / YEARS_IN_VIEW) * YEARS_IN_VIEW + minYear;
  });

  const yearsToDisplay = React.useMemo(() => {
    return Array.from({ length: YEARS_IN_VIEW }, (_, i) => currentBlockStartYear + i).filter(
      (year) => year >= minYear && year <= maxYear
    );
  }, [currentBlockStartYear, minYear, maxYear]);

  const handlePreviousBlock = () => {
    setCurrentBlockStartYear((prev) => Math.max(minYear, prev - YEARS_IN_VIEW));
  };

  const handleNextBlock = () => {
    setCurrentBlockStartYear((prev) => Math.min(maxYear - YEARS_IN_VIEW + 1, prev + YEARS_IN_VIEW));
  };

  const displayRangeStart = currentBlockStartYear;
  const displayRangeEnd = Math.min(maxYear, currentBlockStartYear + YEARS_IN_VIEW - 1);

  return (
    <div className={cn('w-full space-y-2 p-3')}>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handlePreviousBlock}
          disabled={currentBlockStartYear <= minYear}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous year block</span>
        </Button>
        <div className="text-sm font-medium">
          {displayRangeStart} - {displayRangeEnd}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleNextBlock}
          disabled={currentBlockStartYear + YEARS_IN_VIEW > maxYear}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next year block</span>
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {yearsToDisplay.map((year) => (
          <Button
            key={year}
            variant={year === selectedYear ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'w-full justify-center text-xs',
              year === selectedYear && 'font-semibold',
            )}
            onClick={() => onSelectYear(year)}
            disabled={year < minYear || year > maxYear}
          >
            {year}
          </Button>
        ))}
      </div>
    </div>
  );
}
