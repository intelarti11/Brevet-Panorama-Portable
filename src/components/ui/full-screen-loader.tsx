"use client";

import { Loader2 } from 'lucide-react';

interface FullScreenLoaderProps {
  text?: string;
}

export function FullScreenLoader({ text = "Chargement des données..." }: FullScreenLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-15rem)] p-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}
