
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import type { ReactNode } from 'react';

interface RequestStatusModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  logMessages: ReactNode[];
  isProcessing: boolean;
  title?: string;
  description?: string;
}

export function RequestStatusModal({
  isOpen,
  onOpenChange,
  logMessages,
  isProcessing,
  title = "Traitement de votre demande",
  description = "Veuillez patienter pendant que nous traitons votre action..."
}: RequestStatusModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={isProcessing ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (isProcessing) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {isProcessing && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[300px] w-full rounded-md border p-3 my-4 bg-muted/30">
          {logMessages.length === 0 && <p className="text-sm text-muted-foreground">En attente d'actions...</p>}
          {logMessages.map((msg, index) => (
            <div key={index} className="text-sm py-1 border-b border-muted/20 last:border-b-0">
              {msg}
            </div>
          ))}
        </ScrollArea>
        {!isProcessing && (
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
