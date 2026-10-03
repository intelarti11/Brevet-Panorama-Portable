
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ReportConfig {
  classNames: string[];
  brevetType: 'bb1' | 'bb2' | 'comparison';
}

interface BrevetBlancReportConfigModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  availableClasses: string[];
  onGenerate: (config: ReportConfig) => void;
}

export function BrevetBlancReportConfigModal({ isOpen, onOpenChange, availableClasses, onGenerate }: BrevetBlancReportConfigModalProps) {
  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => availableClasses);
  const [brevetType, setBrevetType] = useState<'bb1' | 'bb2' | 'comparison'>('comparison');

  const handleClassToggle = (className: string) => {
    setSelectedClasses(prev =>
      prev.includes(className)
        ? prev.filter(c => c !== className)
        : [...prev, className]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedClasses(checked ? availableClasses : []);
  };

  const handleSubmit = () => {
    onGenerate({
      classNames: selectedClasses,
      brevetType: brevetType
    });
    onOpenChange(false);
  };

  const isAllSelected = selectedClasses.length === availableClasses.length && availableClasses.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurer le Rapport</DialogTitle>
          <DialogDescription>
            Choisissez les classes et le brevet à inclure dans le rapport.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="font-semibold">Brevet Blanc</Label>
            <RadioGroup value={brevetType} onValueChange={(value) => setBrevetType(value as 'bb1' | 'bb2' | 'comparison')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bb1" id="r-bb1" />
                <Label htmlFor="r-bb1">Brevet Blanc 1</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bb2" id="r-bb2" />
                <Label htmlFor="r-bb2">Brevet Blanc 2</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="comparison" id="r-comparison" />
                <Label htmlFor="r-comparison">Comparaison des deux</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label className="font-semibold">Classes</Label>
            <ScrollArea className="h-40 w-full rounded-md border p-4">
              <div className="flex items-center space-x-2 pb-2 border-b mb-2">
                <Checkbox
                  id="select-all"
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all" className="font-medium">Tout sélectionner</Label>
              </div>
              {availableClasses.map(className => (
                <div key={className} className="flex items-center space-x-2 py-1">
                  <Checkbox
                    id={`class-${className}`}
                    checked={selectedClasses.includes(className)}
                    onCheckedChange={() => handleClassToggle(className)}
                  />
                  <Label htmlFor={`class-${className}`}>{className}</Label>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="submit" onClick={handleSubmit} disabled={selectedClasses.length === 0}>
            Générer le rapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
