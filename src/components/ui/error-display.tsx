"use client";

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './card';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  asCard?: boolean;
}

export function ErrorDisplay({
  title = "Erreur de chargement",
  message,
  onRetry,
  asCard = false
}: ErrorDisplayProps) {
  const content = (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-semibold text-destructive mb-2">{title}</h2>
      <p className="text-muted-foreground max-w-md mb-4">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      )}
    </div>
  );

  if (asCard) {
      return (
        <Card>
            <CardHeader>
                <CardTitle className="text-destructive flex justify-center items-center">
                    <AlertTriangle className="mr-2 h-6 w-6"/>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">{message}</p>
                {onRetry && (
                     <div className="flex justify-center mt-4">
                        <Button onClick={onRetry} variant="outline">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Réessayer
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="flex items-center justify-center h-[calc(100vh-15rem)]">
        {content}
    </div>
  );
}
