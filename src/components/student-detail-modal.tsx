
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
import type { ProcessedStudentData } from "@/contexts/FilterContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StudentDetailModalProps {
  student: ProcessedStudentData | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const normalizeTextForModal = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const DetailItem = ({ label, value, isBadge = false, badgeVariant }: {
    label: string;
    value?: string | number | null;
    isBadge?: boolean;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
 }) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 items-start border-b border-muted/30 last:border-b-0">
      <p className="text-sm font-medium text-muted-foreground col-span-1 break-words">{label}:</p>
      {isBadge ? (
        <div className="col-span-2">
             <Badge variant={badgeVariant} className="text-xs px-2 py-0.5">
                {String(value)}
            </Badge>
        </div>
      ) : (
         <p className="text-sm text-foreground col-span-2 break-words">{String(value)}</p>
      )}
    </div>
  );
};

export function StudentDetailModal({ student, isOpen, onOpenChange }: StudentDetailModalProps) {
  if (!student) {
    return null;
  }

  const getBadgeVariantForModal = (resultat?: string): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" => {
    if (!resultat || normalizeTextForModal(resultat) === 'n/a') return "outline";
    const lowerResultat = normalizeTextForModal(resultat);

    if (lowerResultat.includes('refuse')) return "destructive";
    if (lowerResultat.includes('absent')) return "outline";

    if (lowerResultat.includes('très bien') || lowerResultat.includes('tres bien')) return "success";
    if (lowerResultat.includes('assez bien')) return "warning";
    if (lowerResultat.includes('bien')) return "success";
    if (lowerResultat.includes('admis')) return "success";

    return "secondary";
  };

  const formatScoreWithBareme = (score?: number, bareme?: number): string | undefined => {
    if (score === undefined || score === null) {
      return undefined;
    }
    if (bareme !== undefined && bareme !== null) {
      return `${score.toFixed(1)} / ${bareme}`;
    }
    return score.toFixed(1); // Display score if no bareme
  };

  const sectionTitleClass = "text-base font-semibold text-foreground mb-2 pt-4 first:pt-2";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold text-primary">
            Détails de l'Élève
          </DialogTitle>
          <DialogDescription>
            Informations complètes pour {student.prenom} {student.nom} (INE: {student.ine}).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto px-6">
          <div className="space-y-1 py-4">

            <h3 className={sectionTitleClass}>Résultats au Brevet</h3>
            <DetailItem
                label="Résultat Global"
                value={student.resultat || 'N/A'}
                isBadge
                badgeVariant={getBadgeVariantForModal(student.resultat)}
            />
            <DetailItem label="Moyenne Générale" value={student.moyenne !== undefined && student.moyenne !== null ? student.moyenne.toFixed(2) + " / 20" : "N/A"} />
            <DetailItem label="Total Général des Points" value={student.totalGeneral !== undefined && student.totalGeneral !== null ? `${student.totalGeneral.toFixed(0)} points` : "N/A"} />
            <DetailItem label="Moyenne des épreuves terminales" value={formatScoreWithBareme(student.noteEpreuvesTerminales, 20)} />
            <DetailItem label="Moyenne du contrôle continu" value={formatScoreWithBareme(student.noteControleContinu, 20)} />

            <h3 className={sectionTitleClass}>Détail des Épreuves Finales</h3>
            <DetailItem label="Français" value={formatScoreWithBareme(student.scoreFrancais, 20)} />
            <DetailItem label="Mathématiques" value={formatScoreWithBareme(student.scoreMaths, 20)} />
            {student.scoreHistoireGeoSeul !== undefined || student.scoreEMC !== undefined ? (
              <>
                <DetailItem label="Histoire-géographie" value={formatScoreWithBareme(student.scoreHistoireGeoSeul, 20)} />
                <DetailItem label="Enseignement moral et civique" value={formatScoreWithBareme(student.scoreEMC, 20)} />
              </>
            ) : (
              <DetailItem label="Histoire-Géo. EMC" value={formatScoreWithBareme(student.scoreHistoireGeo, 20)} />
            )}
            <DetailItem label="Sciences" value={formatScoreWithBareme(student.scoreSciences, 20)} />
            <DetailItem label="Soutenance Orale DNB" value={formatScoreWithBareme(student.scoreOralDNB, 20)} />

            <h3 className={sectionTitleClass}>Détail du Contrôle Continu</h3>
            <DetailItem label="Socle Commun" value={formatScoreWithBareme(student.scoreSocleCommun, 20)} />
            <DetailItem label="Langues Vivantes" value={formatScoreWithBareme(student.scoreLVE, 20)} />
            <DetailItem label="Langages des Arts et du Corps" value={formatScoreWithBareme(student.scoreArtsPlastiques, 20)} />
            <DetailItem label="Éducation Musicale" value={formatScoreWithBareme(student.scoreEducationMusicale, 20)} />
            <DetailItem label="EPS" value={formatScoreWithBareme(student.scoreEPS, 20)} />
            <DetailItem label="Physique-Chimie" value={formatScoreWithBareme(student.scorePhysiqueChimie, 20)} />
            <DetailItem label="Sciences de la Vie" value={formatScoreWithBareme(student.scoreSciencesVie, 20)} />

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
