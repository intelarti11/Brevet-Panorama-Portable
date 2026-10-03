
"use client";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBrevetConfigForYear } from "@/lib/brevet-config";

interface BrevetBlancStudentForModal {
  id: string;
  nom: string;
  prenom: string;
  classe?: string;
  notes?: {
    [subject: string]: {
      bb1?: number;
      bb2?: number;
    };
  };
}

interface BrevetBlancDetailModalProps {
  student: BrevetBlancStudentForModal | null;
  year?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function BrevetBlancDetailModal({ student, year, isOpen, onOpenChange }: BrevetBlancDetailModalProps) {
  if (!student) {
    return null;
  }

  const resolvedYear = year || new Date().getFullYear().toString();
  const config = getBrevetConfigForYear(resolvedYear);
  const sectionTitleClass = "text-base font-semibold text-primary mb-2 pt-4 first:pt-2";
  const normalizedClass = student.classe?.trim();
  const description = normalizedClass
    ? `Notes pour ${student.prenom} ${student.nom} (Classe: ${normalizedClass}).`
    : `Notes pour ${student.prenom} ${student.nom}.`;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold text-primary">
            Détails du Brevet Blanc
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto px-6">
          <div className="space-y-1 py-4">
            <h3 className={sectionTitleClass}>Notes par Matière</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Matière</TableHead>
                    <TableHead className="text-center font-semibold">Brevet Blanc 1</TableHead>
                    <TableHead className="text-center font-semibold">Brevet Blanc 2</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.subjects.map(matiere => (
                    <TableRow key={matiere}>
                      <TableCell className="font-medium">{matiere}</TableCell>
                      <TableCell className="text-center font-medium text-primary">
                        {(student.notes?.[matiere]?.bb1 !== undefined && student.notes?.[matiere]?.bb1 !== null) ? student.notes?.[matiere]?.bb1 : <span className="text-xs text-muted-foreground">ABS</span>}
                      </TableCell>
                       <TableCell className="text-center font-medium text-green-600">
                        {(student.notes?.[matiere]?.bb2 !== undefined && student.notes?.[matiere]?.bb2 !== null) ? student.notes?.[matiere]?.bb2 : <span className="text-xs text-muted-foreground">ABS</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-auto px-6 py-4 border-t bg-muted/30">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Fermer
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
