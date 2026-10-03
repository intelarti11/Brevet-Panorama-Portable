"use client";

import {useEffect, useMemo, useState} from "react";
import Link from "next/link";
import {getAuth, onAuthStateChanged, type User} from "@/lib/local/session";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "@/lib/local/store";
import {
  ArrowLeft,
  Database,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import {app, db} from "@/lib/firebase";
import {
  groupReplacementSlotsByWeek,
  parseReplacementCsv,
  type ReplacementImportParseResult,
  type ReplacementMetaDocument,
} from "@/lib/replacements";
import {Button} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {ErrorDisplay} from "@/components/ui/error-display";
import {FullScreenLoader} from "@/components/ui/full-screen-loader";
import {Textarea} from "@/components/ui/textarea";
import {useToast} from "@/hooks/use-toast";

const readFileAsText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
  }
};

export default function ReplacementImportPage() {
  const {toast} = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [canImport, setCanImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ReplacementImportParseResult | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [meta, setMeta] = useState<ReplacementMetaDocument | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setCanImport(false);
        setAuthLoading(false);
        return;
      }

      const isMainAdmin = currentUser.email === "local-user@localhost";

      setCanImport(
        isMainAdmin || (await currentUser.getIdTokenResult()).claims.replacementImporter === true
      );
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadMeta = async () => {
    setMetaLoading(true);
    try {
      const snapshot = await getDoc(doc(db, "replacementMeta", "current"));
      setMeta(snapshot.exists() ? (snapshot.data() as ReplacementMetaDocument) : null);
    } finally {
      setMetaLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !canImport) {
      setMetaLoading(false);
      return;
    }

    loadMeta();
  }, [user, canImport]);

  const analyzeSourceText = (text: string, nextSourceLabel: string) => {
    const parsed = parseReplacementCsv(text);

    if (parsed.validRows === 0 || parsed.slots.length === 0) {
      throw new Error(
        "Aucune ligne exploitable. Vérifiez les colonnes Date, Jour, Début, Classe et la colonne 'A donne lieu à...'."
      );
    }

    setParseResult(parsed);
    setSourceLabel(nextSourceLabel);
    toast({
      title: "Source analysée",
      description: `${parsed.validRows} ligne(s) valides, ${parsed.slots.length} créneau(x) généré(s).`,
    });
  };

  const resetAnalysis = () => {
    setParseResult(null);
    setSourceError(null);
    setSourceLabel("");
  };

  const handleFilePicked = async (file: File | null) => {
    setSelectedFile(file);
    resetAnalysis();

    if (!file) {
      return;
    }

    setIsReadingFile(true);
    try {
      const text = await readFileAsText(file);
      setPastedText(text);
      analyzeSourceText(text, file.name);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analyse du fichier impossible.";
      setSourceError(message);
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleAnalyzePastedText = () => {
    setSelectedFile(null);
    resetAnalysis();

    if (!pastedText.trim()) {
      setSourceError("Collez le contenu EDT avant de lancer l'analyse.");
      return;
    }

    try {
      analyzeSourceText(pastedText, "Copie manuelle EDT");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analyse du texte impossible.";
      setSourceError(message);
    }
  };

  const importableWeeks = useMemo(
    () => (parseResult ? groupReplacementSlotsByWeek(parseResult.slots) : []),
    [parseResult]
  );

  const handleImport = async () => {
    if (!user || !parseResult || !sourceLabel) {
      return;
    }

    setIsSaving(true);
    setSourceError(null);

    try {
      const batch = writeBatch(db);
      const existingWeeks = await getDocs(collection(db, "replacementWeeks"));

      existingWeeks.forEach((snapshot) => {
        batch.delete(snapshot.ref);
      });

      importableWeeks.forEach((week) => {
        batch.set(doc(db, "replacementWeeks", week.weekKey), {
          ...week,
          importedByEmail: user.email ?? null,
          importedAt: serverTimestamp(),
          sourceFileName: sourceLabel,
        });
      });

      batch.set(doc(db, "replacementMeta", "current"), {
        slotCount: parseResult.slots.length,
        weekCount: importableWeeks.length,
        updatedByEmail: user.email ?? null,
        updatedAt: serverTimestamp(),
        sourceFileName: sourceLabel,
      });

      await batch.commit();
      await loadMeta();

      toast({
        title: "Import terminé",
        description: `${parseResult.slots.length} créneau(x) sauvegardé(s) sur ${importableWeeks.length} semaine(s).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import impossible.";
      setSourceError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
    return <FullScreenLoader text="Vérification des droits..." />;
  }

  if (!user) {
    return (
      <ErrorDisplay
        asCard
        title="Connexion requise"
        message="Connectez-vous pour accéder à l'import des remplacements."
      />
    );
  }

  if (!canImport) {
    return (
      <ErrorDisplay
        asCard
        title="Accès restreint"
        message="Cette page est réservée aux utilisateurs autorisés à importer les créneaux de remplacement."
      />
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6 flex flex-col gap-2">
        <Button asChild variant="outline" className="self-start">
          <Link href="/dashboard/remplacements">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux remplacements
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Import des Créneaux de Remplacement
        </h1>
        <p className="text-muted-foreground">
          Collez le tableau EDT/Pronote des cours à remplacer ou importez un fichier CSV. L'import remplace
          la base actuelle des semaines disponibles.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            État de la base actuelle
          </CardTitle>
          <CardDescription>
            Résumé du dernier import enregistré dans la base locale.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metaLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des métadonnées...
            </div>
          ) : meta ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{meta.weekCount} semaine(s)</Badge>
              <Badge variant="outline">{meta.slotCount} créneau(x)</Badge>
              {meta.updatedByEmail ? (
                <Badge variant="outline">Importé par {meta.updatedByEmail}</Badge>
              ) : null}
              {meta.sourceFileName ? (
                <Badge variant="outline">{meta.sourceFileName}</Badge>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Aucun import précédent détecté.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <UploadCloud className="h-5 w-5 text-primary" />
            Copier-coller les remplacements depuis EDT / Pronote
          </CardTitle>
          <CardDescription>
            Collez ici l'export EDT. L'import de fichier reste disponible en
            secours. Colonnes attendues : Date, Jour, Début, Classe.
            Professeur, Durée, Matière, Salle et "A donne lieu à..." sont
            prises en compte si elles existent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            aria-label="Tableau des remplacements EDT / Pronote"
            value={pastedText}
            onChange={(event) => {
              setPastedText(event.target.value);
              setSelectedFile(null);
              resetAnalysis();
            }}
            disabled={isReadingFile || isSaving}
            className="min-h-[260px] font-mono text-xs"
            placeholder={"Collez ici le copier-coller EDT.\nLe format tabulé du presse-papiers est accepté."}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleAnalyzePastedText}
              disabled={isReadingFile || isSaving || !pastedText.trim()}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Analyser le texte collé
            </Button>
          </div>

          <div className="space-y-3 rounded-md border border-dashed p-4">
            <p className="text-sm font-medium">Ou importer un fichier</p>
            <Input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) => handleFilePicked(event.target.files?.[0] ?? null)}
              disabled={isReadingFile || isSaving}
              className="max-w-xl"
            />
          </div>

          {isReadingFile ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lecture et analyse du fichier...
            </div>
          ) : null}

          {selectedFile ? (
            <div className="text-sm text-muted-foreground">
              Fichier sélectionné : {selectedFile.name}
            </div>
          ) : null}

          {sourceLabel ? (
            <div className="text-sm text-muted-foreground">
              Source analysée : {sourceLabel}
            </div>
          ) : null}

          {sourceError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {sourceError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {parseResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Résultat de l'analyse
            </CardTitle>
            <CardDescription>
              Vérifiez les créneaux avant de remplacer la liste commune des remplacements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{parseResult.validRows} ligne(s) valides</Badge>
              <Badge variant="outline">{parseResult.skippedRows} ligne(s) ignorées</Badge>
              <Badge variant="outline">{parseResult.slots.length} créneau(x)</Badge>
              <Badge variant="outline">{importableWeeks.length} semaine(s)</Badge>
            </div>

            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              Semaines détectées :{" "}
              {parseResult.weekKeys.length > 0 ? parseResult.weekKeys.join(", ") : "aucune"}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleImport} disabled={isSaving || isReadingFile}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                {isSaving ? "Import en cours..." : "Importer les remplacements"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
