
"use client";

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, Trash2, ShieldAlert, CheckCircle, Info } from 'lucide-react';
import { httpsCallable } from '@/lib/local/functions';
import { functions as functionsInstance } from '@/lib/firebase';
import { FullScreenLoader } from '@/components/ui/full-screen-loader';
import { ErrorDisplay } from '@/components/ui/error-display';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { getCallableErrorMessage } from '@/lib/firebase-callable-error';

interface DuplicateStudent {
    id: string;
    nom: string;
    prenom: string;
    classe?: string;
    anneeScolaire: string;
    notesCount: number;
}

type DuplicateGroup = DuplicateStudent[];

export default function DoublonsPage() {
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [docToDelete, setDocToDelete] = useState<DuplicateStudent | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isMassDeleteConfirmOpen, setIsMassDeleteConfirmOpen] = useState(false);
    const [isMassDeleting, setIsMassDeleting] = useState(false);
    const [docsToMassDelete, setDocsToMassDelete] = useState<string[]>([]);

    const { toast } = useToast();

    const callFindDuplicates = useMemo(() =>
        functionsInstance ? httpsCallable<void, { success: boolean; duplicates: DuplicateGroup[] }>(functionsInstance, 'findBrevetBlancDuplicates') : null,
        []
    );

    const callDeleteDocument = useMemo(() =>
        functionsInstance ? httpsCallable<{ docIds: string[] }, { success: boolean; message: string }>(functionsInstance, 'deleteBrevetBlancDocuments') : null,
        []
    );

    const handleFindDuplicates = useCallback(async () => {
        if (!callFindDuplicates) {
            setError("Service de fonctions non disponible.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setDuplicates([]);
        try {
            const result = await callFindDuplicates();
            if (result.data.success) {
                setDuplicates(result.data.duplicates);
                toast({
                    title: "Recherche terminée",
                    description: `${result.data.duplicates.length} groupe(s) de doublons trouvé(s).`
                });
            } else {
                throw new Error("La recherche de doublons a échoué.");
            }
        } catch (err: any) {
            const errorMessage = getCallableErrorMessage(err, "Une erreur est survenue lors de la recherche.", "findBrevetBlancDuplicates");
            setError(errorMessage);
            toast({ variant: 'destructive', title: "Erreur", description: errorMessage });
        } finally {
            setIsLoading(false);
        }
    }, [callFindDuplicates, toast]);

    const handleDeleteClick = (doc: DuplicateStudent) => {
        setDocToDelete(doc);
    };

    const confirmDelete = async () => {
        if (!docToDelete || !callDeleteDocument) return;
        setIsDeleting(true);
        try {
            const result = await callDeleteDocument({ docIds: [docToDelete.id] });
            if (result.data.success) {
                toast({ title: "Succès", description: "Le document en double a été supprimé." });
                // Refresh list by removing the deleted item
                setDuplicates(prev => {
                    const newDuplicates = prev.map(group =>
                        group.filter(student => student.id !== docToDelete.id)
                    ).filter(group => group.length > 1); // Keep group if it's still a duplicate
                    return newDuplicates;
                });
            } else {
                throw new Error(result.data.message);
            }
        } catch (err: any) {
             toast({
                variant: "destructive",
                title: "Erreur de suppression",
                description: getCallableErrorMessage(err, "Impossible de supprimer ce doublon.", "deleteBrevetBlancDocuments")
             });
        } finally {
            setIsDeleting(false);
            setDocToDelete(null);
        }
    };

    const handleMassDeleteClick = () => {
        const idsToDelete = duplicates.flatMap(group =>
            group.filter(student => student.notesCount === 0)
        ).map(student => student.id);

        if (idsToDelete.length === 0) {
            toast({
                title: "Aucun doublon vide",
                description: "Aucun doublon avec 0 champ de note n'a été trouvé.",
            });
            return;
        }

        setDocsToMassDelete(idsToDelete);
        setIsMassDeleteConfirmOpen(true);
    };

    const confirmMassDelete = async () => {
        if (docsToMassDelete.length === 0 || !callDeleteDocument) return;

        setIsMassDeleting(true);
        try {
            const result = await callDeleteDocument({ docIds: docsToMassDelete });
            if (result.data.success) {
                toast({ title: "Succès", description: `${docsToMassDelete.length} doublon(s) vide(s) ont été supprimés.` });
                handleFindDuplicates(); // Refresh the whole list
            } else {
                throw new Error(result.data.message);
            }
        } catch (err: any) {
             toast({
                variant: "destructive",
                title: "Erreur de suppression en masse",
                description: getCallableErrorMessage(err, "Impossible de supprimer les doublons.", "deleteBrevetBlancDocuments")
             });
        } finally {
            setIsMassDeleting(false);
            setIsMassDeleteConfirmOpen(false);
            setDocsToMassDelete([]);
        }
    };

    return (
        <>
            <div className="space-y-6 p-4 md:p-6 lg:p-8">
                <Card className="w-full shadow-xl">
                    <CardHeader>
                        <div className="flex items-center space-x-3 mb-2">
                            <ShieldAlert className="h-8 w-8 text-destructive" />
                            <CardTitle className="text-2xl font-headline">Gestion des Doublons (Brevet Blanc)</CardTitle>
                        </div>
                        <CardDescription>
                            Cet outil recherche les élèves en double (même nom, prénom et année scolaire) dans la base de données du Brevet Blanc. Cela se produit si vous importez une liste d'élèves sans identifiant unique (INE).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-4">
                        <Button onClick={handleFindDuplicates} disabled={isLoading || isMassDeleting}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Rechercher les doublons
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleMassDeleteClick}
                            disabled={isLoading || duplicates.length === 0 || isMassDeleting}
                        >
                            {isMassDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Supprimer les doublons vides
                        </Button>
                    </CardContent>
                </Card>

                {isLoading && <FullScreenLoader text="Recherche des doublons en cours..." />}

                {!isLoading && error && <ErrorDisplay message={error} onRetry={handleFindDuplicates} asCard />}

                {!isLoading && duplicates.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Résultats de la recherche</CardTitle>
                            <CardDescription>{duplicates.length} groupe(s) de doublons trouvé(s).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="multiple" className="w-full space-y-2">
                                {duplicates.map((group, index) => (
                                    <AccordionItem value={`item-${index}`} key={index} className="border rounded-md px-4">
                                        <AccordionTrigger>
                                            <div className="flex justify-between items-center w-full pr-4">
                                                <span>{group[0].prenom} {group[0].nom} ({group[0].anneeScolaire})</span>
                                                <span className="text-destructive font-bold">{group.length} entrées trouvées</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <ul className="space-y-2 pt-2">
                                                {group.map(student => (
                                                    <li key={student.id} className="flex justify-between items-center p-3 border rounded-md bg-muted/50">
                                                        <div>
                                                            <p className="font-medium">Classe: {student.classe || 'N/A'}</p>
                                                            <p className="text-xs text-muted-foreground mt-1">ID: {student.id}</p>
                                                            <Badge variant={student.notesCount > 0 ? 'success' : 'outline'} className="mt-2 text-xs">
                                                                {student.notesCount > 0 ? <CheckCircle className="mr-1 h-3 w-3" /> : <Info className="mr-1 h-3 w-3" />}
                                                                {student.notesCount} champ(s) de note(s)
                                                            </Badge>
                                                        </div>
                                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(student)}>
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Supprimer
                                                        </Button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>
                )}

                {!isLoading && duplicates.length === 0 && !error && (
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-center text-muted-foreground">Aucun doublon trouvé, ou aucune recherche effectuée.</p>
                        </CardContent>
                    </Card>
                )}
            </div>

            <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                    <AlertDialogDescription>
                        Êtes-vous sûr de vouloir supprimer cette entrée en double pour <strong className="font-bold">{docToDelete?.prenom} {docToDelete?.nom}</strong> ? Cette action est irréversible.
                        <br/>
                        <span className="text-xs text-muted-foreground mt-2 block">ID: {docToDelete?.id}</span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/80">
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Supprimer
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isMassDeleteConfirmOpen} onOpenChange={setIsMassDeleteConfirmOpen}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression en masse</AlertDialogTitle>
                    <AlertDialogDescription>
                        Êtes-vous sûr de vouloir supprimer les <strong className="font-bold">{docsToMassDelete.length}</strong> entrées en double qui n'ont aucune note ? Cette action est irréversible.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmMassDelete} disabled={isMassDeleting} className="bg-destructive hover:bg-destructive/80">
                        {isMassDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Supprimer {docsToMassDelete.length} élément(s)
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
