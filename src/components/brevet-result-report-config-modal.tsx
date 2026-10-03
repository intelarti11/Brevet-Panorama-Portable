
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface BrevetResultReportConfig {
  selectedResults: string[];
}

interface BrevetResultReportConfigModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  availableResults: string[];
  onGenerate: (config: BrevetResultReportConfig) => void;
}

export function BrevetResultReportConfigModal({ isOpen, onOpenChange, availableResults, onGenerate }: BrevetResultReportConfigModalProps) {
  const [selectedResults, setSelectedResults] = useState<string[]>(() => availableResults);

  const handleResultToggle = (result: string) => {
    setSelectedResults(prev =>
      prev.includes(result)
        ? prev.filter(c => c !== result)
        : [...prev, result]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedResults(checked ? availableResults : []);
  };

  const handleSubmit = () => {
    onGenerate({ selectedResults });
    onOpenChange(false);
  };

  const isAllSelected = selectedResults.length === availableResults.length && availableResults.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurer le Rapport des Résultats</DialogTitle>
          <DialogDescription>
            Choisissez les résultats à inclure dans le rapport.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="font-semibold">Résultats</Label>
            <ScrollArea className="h-48 w-full rounded-md border p-4">
              <div className="flex items-center space-x-2 pb-2 border-b mb-2">
                <Checkbox
                  id="select-all-results"
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all-results" className="font-medium">Tout sélectionner</Label>
              </div>
              {availableResults.map(result => (
                <div key={result} className="flex items-center space-x-2 py-1">
                  <Checkbox
                    id={`result-${result}`}
                    checked={selectedResults.includes(result)}
                    onCheckedChange={() => handleResultToggle(result)}
                  />
                  <Label htmlFor={`result-${result}`}>{result}</Label>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="submit" onClick={handleSubmit} disabled={selectedResults.length === 0}>
            Générer le rapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
