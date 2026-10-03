"use client";

import type {ReactNode} from "react";
import {useMemo, useState} from "react";
import {httpsCallable} from "@/lib/local/functions";
import {
  AlertTriangle,
  FileSearch,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import {functions as functionsInstance} from "@/lib/firebase";
import {getCallableErrorMessage} from "@/lib/firebase-callable-error";
import {useToast} from "@/hooks/use-toast";
import {Button} from "@/components/ui/button";
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
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Textarea} from "@/components/ui/textarea";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Switch} from "@/components/ui/switch";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";

type CollectionKey = "BrevetBlanc" | "brevetResults" | "pixResults";
type PrimitiveValue = string | number | boolean | null;
type EditableValue = PrimitiveValue | EditableRecord | EditableValue[];

interface EditableRecord {
  [key: string]: EditableValue;
}

interface SearchResultSummary {
  collection: CollectionKey;
  id: string;
  displayName: string;
  className: string;
  year: string;
  subtitle: string;
}

interface RecordDetail extends SearchResultSummary {
  data: EditableRecord;
}

interface SearchResponse {
  success: boolean;
  results: SearchResultSummary[];
  totalMatches: number;
  truncated: boolean;
}

interface GetRecordResponse {
  success: boolean;
  record: RecordDetail;
}

interface UpdateRecordResponse {
  success: boolean;
  message: string;
}

interface DeleteRecordResponse {
  success: boolean;
  message: string;
}

const COLLECTION_OPTIONS: Array<{
  value: CollectionKey;
  label: string;
  yearLabel: string;
  helper: string;
}> = [
  {
    value: "BrevetBlanc",
    label: "Brevet blanc",
    yearLabel: "Annee scolaire",
    helper: "Nom, prenom, classe, identifiant interne",
  },
  {
    value: "brevetResults",
    label: "Brevet officiel",
    yearLabel: "Annee d'import",
    helper: "INE, nom, prenom, classe, etablissement",
  },
  {
    value: "pixResults",
    label: "PIX",
    yearLabel: "Annee certification",
    helper: "Nom, prenom, classe, numero certification",
  },
];

const BREVET_RESULT_NUMBER_FIELDS = new Set([
  "TOTAL GENERAL",
  "Moyenne sur 20",
  "scoreFrancais",
  "scoreMaths",
  "scoreHistoireGeo",
  "scoreSciences",
  "scoreOralDNB",
  "scoreLVE",
  "scoreArtsPlastiques",
  "scoreEducationMusicale",
  "scoreEPS",
  "scorePhysiqueChimie",
  "scoreSciencesVie",
  "scoreSocleCommun",
]);

function isEditableRecord(value: EditableValue | unknown): value is EditableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneEditableRecord<T extends EditableRecord>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatLabel(label: string): string {
  return label.replace(/_/g, " ");
}

function inferFieldKind(
  collection: CollectionKey,
  path: string[],
  value: PrimitiveValue
): "string" | "number" | "boolean" {
  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  const lastSegment = path[path.length - 1];

  if (collection === "BrevetBlanc" && path[0] === "notes" && (lastSegment === "bb1" || lastSegment === "bb2")) {
    return "number";
  }

  if (collection === "brevetResults" && BREVET_RESULT_NUMBER_FIELDS.has(lastSegment)) {
    return "number";
  }

  if (collection === "pixResults" && lastSegment === "nombrePix") {
    return "number";
  }

  return "string";
}

function updateValueAtPath(
  source: EditableRecord,
  path: string[],
  value: PrimitiveValue
): EditableRecord {
  const cloned = cloneEditableRecord(source);
  let cursor: EditableRecord = cloned;

  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index];
    const current = cursor[key];
    if (!isEditableRecord(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as EditableRecord;
  }

  cursor[path[path.length - 1]] = value;
  return cloned;
}

function parseJsonDraft(jsonDraft: string): EditableRecord {
  const parsed = JSON.parse(jsonDraft) as EditableValue;
  if (!isEditableRecord(parsed)) {
    throw new Error("Le JSON doit representer un objet a la racine.");
  }

  return parsed;
}

export default function AdminCaseByCasePage() {
  const {toast} = useToast();
  const [selectedCollection, setSelectedCollection] = useState<CollectionKey>("BrevetBlanc");
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultSummary[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(null);
  const [editorData, setEditorData] = useState<EditableRecord | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [activeEditorTab, setActiveEditorTab] = useState("fields");
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<RecordDetail | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const collectionMeta = COLLECTION_OPTIONS.find((option) => option.value === selectedCollection) ?? COLLECTION_OPTIONS[0];

  const callSearchRecords = useMemo(() =>
    functionsInstance ?
      httpsCallable<{collection: CollectionKey; searchTerm: string; year: string}, SearchResponse>(
        functionsInstance,
        "adminSearchStudentRecords"
      ) :
      null,
  []);

  const callGetRecord = useMemo(() =>
    functionsInstance ?
      httpsCallable<{collection: CollectionKey; id: string}, GetRecordResponse>(
        functionsInstance,
        "adminGetStudentRecord"
      ) :
      null,
  []);

  const callUpdateRecord = useMemo(() =>
    functionsInstance ?
      httpsCallable<{collection: CollectionKey; id: string; data: EditableRecord}, UpdateRecordResponse>(
        functionsInstance,
        "adminUpdateStudentRecord"
      ) :
      null,
  []);

  const callDeleteRecord = useMemo(() =>
    functionsInstance ?
      httpsCallable<{collection: CollectionKey; id: string}, DeleteRecordResponse>(
        functionsInstance,
        "adminDeleteStudentRecord"
      ) :
      null,
  []);

  const resetEditor = () => {
    setSelectedRecord(null);
    setEditorData(null);
    setJsonDraft("");
    setActiveEditorTab("fields");
  };

  const handleSearch = async () => {
    if (!callSearchRecords) {
      toast({variant: "destructive", title: "Erreur", description: "Service de recherche non disponible."});
      return;
    }

    if (!searchTerm.trim() && !yearFilter.trim()) {
      toast({
        variant: "destructive",
        title: "Recherche incomplete",
        description: "Saisissez un terme de recherche ou une annee.",
      });
      return;
    }

    setIsSearching(true);
    resetEditor();

    try {
      const result = await callSearchRecords({
        collection: selectedCollection,
        searchTerm: searchTerm.trim(),
        year: yearFilter.trim(),
      });

      if (!result.data.success) {
        throw new Error("La recherche a echoue.");
      }

      setSearchResults(result.data.results);
      setTotalMatches(result.data.totalMatches);
      setIsTruncated(result.data.truncated);

      toast({
        title: "Recherche terminee",
        description: `${result.data.totalMatches} resultat(s) trouve(s).`,
      });
    } catch (error: any) {
      console.error("Erreur recherche cas par cas:", error);
      setSearchResults([]);
      setTotalMatches(0);
      setIsTruncated(false);
      toast({
        variant: "destructive",
        title: "Erreur de recherche",
        description: getCallableErrorMessage(
          error,
          "Impossible d'effectuer la recherche.",
          "adminSearchStudentRecords"
        ),
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadRecord = async (result: SearchResultSummary) => {
    if (!callGetRecord) {
      toast({variant: "destructive", title: "Erreur", description: "Service de chargement non disponible."});
      return;
    }

    setIsLoadingRecord(true);

    try {
      const response = await callGetRecord({collection: result.collection, id: result.id});
      if (!response.data.success) {
        throw new Error("Le chargement du dossier a echoue.");
      }

      const freshRecord = response.data.record;
      setSelectedRecord(freshRecord);
      setEditorData(cloneEditableRecord(freshRecord.data));
      setJsonDraft(JSON.stringify(freshRecord.data, null, 2));
      setActiveEditorTab("fields");
    } catch (error: any) {
      console.error("Erreur chargement dossier:", error);
      toast({
        variant: "destructive",
        title: "Erreur de chargement",
        description: getCallableErrorMessage(
          error,
          "Impossible de charger le dossier eleve.",
          "adminGetStudentRecord"
        ),
      });
    } finally {
      setIsLoadingRecord(false);
    }
  };

  const handlePrimitiveChange = (path: string[], value: PrimitiveValue) => {
    if (!editorData || !selectedRecord) {
      return;
    }

    const nextData = updateValueAtPath(editorData, path, value);
    setEditorData(nextData);
    setJsonDraft(JSON.stringify(nextData, null, 2));
  };

  const handleReset = () => {
    if (!selectedRecord) {
      return;
    }

    const restored = cloneEditableRecord(selectedRecord.data);
    setEditorData(restored);
    setJsonDraft(JSON.stringify(restored, null, 2));
    toast({title: "Modifications annulees", description: "Le dossier a ete recharge depuis la derniere version enregistree."});
  };

  const handleApplyJson = () => {
    try {
      const parsed = parseJsonDraft(jsonDraft);
      setEditorData(parsed);
      toast({title: "JSON applique", description: "Les champs visuels ont ete synchronises."});
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "JSON invalide",
        description: error.message || "Le contenu JSON ne peut pas etre applique.",
      });
    }
  };

  const handleSave = async () => {
    if (!callUpdateRecord || !selectedRecord || !editorData) {
      return;
    }

    let payload = editorData;

    if (activeEditorTab === "json") {
      try {
        payload = parseJsonDraft(jsonDraft);
        setEditorData(payload);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "JSON invalide",
          description: error.message || "Corrigez le JSON avant l'enregistrement.",
        });
        return;
      }
    }

    setIsSaving(true);

    try {
      const response = await callUpdateRecord({
        collection: selectedRecord.collection,
        id: selectedRecord.id,
        data: payload,
      });

      if (!response.data.success) {
        throw new Error("L'enregistrement a echoue.");
      }

      toast({title: "Modification enregistree", description: response.data.message});
      await handleLoadRecord(selectedRecord);
    } catch (error: any) {
      console.error("Erreur sauvegarde cas par cas:", error);
      toast({
        variant: "destructive",
        title: "Erreur d'enregistrement",
        description: getCallableErrorMessage(
          error,
          "Impossible de sauvegarder les modifications.",
          "adminUpdateStudentRecord"
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!callDeleteRecord || !recordToDelete) {
      return;
    }

    const deletedRecord = recordToDelete;
    const deletedRecordLabel = deletedRecord.displayName || deletedRecord.id;
    const collectionLabel = COLLECTION_OPTIONS.find(
      (option) => option.value === deletedRecord.collection
    )?.label || deletedRecord.collection;

    setIsDeleting(true);

    try {
      const response = await callDeleteRecord({
        collection: deletedRecord.collection,
        id: deletedRecord.id,
      });

      if (!response.data.success) {
        throw new Error("La suppression a echoue.");
      }

      setSearchResults((previousResults) =>
        previousResults.filter((entry) => (
          entry.collection !== deletedRecord.collection || entry.id !== deletedRecord.id
        ))
      );
      const nextTotalMatches = Math.max(0, totalMatches - 1);
      setTotalMatches(nextTotalMatches);
      setIsTruncated(nextTotalMatches > 50);
      resetEditor();
      setRecordToDelete(null);

      toast({
        title: "Fiche supprimee",
        description: `La fiche de ${deletedRecordLabel} a ete supprimee dans ${collectionLabel}.`,
      });
    } catch (error: any) {
      console.error("Erreur suppression cas par cas:", error);
      toast({
        variant: "destructive",
        title: "Erreur de suppression",
        description: getCallableErrorMessage(
          error,
          "Impossible de supprimer la fiche selectionnee.",
          "adminDeleteStudentRecord"
        ),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderPrimitiveField = (path: string[], value: PrimitiveValue) => {
    if (!selectedRecord) {
      return null;
    }

    const fieldKind = inferFieldKind(selectedRecord.collection, path, value);
    const fieldLabel = formatLabel(path[path.length - 1]);
    const helperPath = path.slice(0, -1).map(formatLabel).join(" / ");

    return (
      <div key={path.join("::")} className="rounded-md border p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{fieldLabel}</p>
            {helperPath ? <p className="text-xs text-muted-foreground">{helperPath}</p> : null}
          </div>
          <Badge variant="outline">{fieldKind}</Badge>
        </div>

        {fieldKind === "boolean" ? (
          <div className="flex items-center gap-3">
            <Switch
              checked={Boolean(value)}
              onCheckedChange={(checked) => handlePrimitiveChange(path, checked)}
            />
            <span className="text-sm text-muted-foreground">
              {value ? "Active" : "Desactive"}
            </span>
          </div>
        ) : fieldKind === "number" ? (
          <Input
            type="number"
            step="any"
            value={value === null ? "" : String(value)}
            placeholder="Laisser vide pour null"
            onChange={(event) => {
              const rawValue = event.target.value.trim();
              if (rawValue === "") {
                handlePrimitiveChange(path, null);
                return;
              }

              const parsedValue = Number(rawValue.replace(",", "."));
              if (!Number.isNaN(parsedValue)) {
                handlePrimitiveChange(path, parsedValue);
              }
            }}
          />
        ) : (
          <Input
            value={typeof value === "string" ? value : ""}
            placeholder={value === null ? "Valeur vide" : ""}
            onChange={(event) => handlePrimitiveChange(path, event.target.value)}
          />
        )}
      </div>
    );
  };

  const renderNode = (node: EditableValue, path: string[] = []): ReactNode => {
    if (Array.isArray(node)) {
      return (
        <div key={path.join("::")} className="rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">{formatLabel(path[path.length - 1] ?? "Tableau")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Les tableaux se modifient via l'onglet JSON.
          </p>
          <Textarea readOnly className="mt-3 min-h-[120px] font-mono text-xs" value={JSON.stringify(node, null, 2)} />
        </div>
      );
    }

    if (isEditableRecord(node)) {
      const entries = Object.entries(node);
      return (
        <div key={path.join("::")} className="space-y-3">
          {path.length > 0 ? (
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="mb-3">
                <p className="font-semibold">{formatLabel(path[path.length - 1])}</p>
                {path.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {path.slice(0, -1).map(formatLabel).join(" / ")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-3">
                {entries.map(([key, value]) => renderNode(value, [...path, key]))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {entries.filter(([, value]) => !isEditableRecord(value) && !Array.isArray(value)).length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {entries
                    .filter(([, value]) => !isEditableRecord(value) && !Array.isArray(value))
                    .map(([key, value]) => renderPrimitiveField([key], value as PrimitiveValue))}
                </div>
              ) : null}

              {entries.filter(([, value]) => isEditableRecord(value) || Array.isArray(value)).length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-3">
                  {entries
                    .filter(([, value]) => isEditableRecord(value) || Array.isArray(value))
                    .map(([key, value]) => (
                      <AccordionItem key={key} value={key} className="rounded-md border px-4">
                        <AccordionTrigger>{formatLabel(key)}</AccordionTrigger>
                        <AccordionContent>{renderNode(value, [key])}</AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    return renderPrimitiveField(path, node);
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestion cas par cas</h1>
        <p className="mt-1 text-muted-foreground">
          Recherchez un eleve dans une base, ouvrez sa fiche puis modifiez les champs necessaires, y compris les notes.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileSearch className="h-5 w-5 text-primary" />
            Rechercher une fiche eleve
          </CardTitle>
          <CardDescription>
            La recherche s&apos;effectue dans une source a la fois. Utilisez l&apos;annee pour reduire le volume et aller plus vite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={selectedCollection} onValueChange={(value) => setSelectedCollection(value as CollectionKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une source" />
                </SelectTrigger>
                <SelectContent>
                  {COLLECTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{collectionMeta.yearLabel}</Label>
              <Input
                placeholder="Ex. 2025"
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label>Recherche</Label>
              <Input
                placeholder={collectionMeta.helper}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Rechercher
            </Button>
            <p className="text-sm text-muted-foreground">
              Champs supportes: {collectionMeta.helper}.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Resultats</CardTitle>
          <CardDescription>
            {totalMatches} resultat(s){isTruncated ? " affiches partiellement (50 max)." : "."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {searchResults.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              Aucune fiche affichee pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nom</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Annee</TableHead>
                    <TableHead>Identifiant</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((result) => (
                    <TableRow key={`${result.collection}:${result.id}`}>
                      <TableCell className="font-medium">{result.displayName}</TableCell>
                      <TableCell>{result.className || "Non renseignee"}</TableCell>
                      <TableCell>{result.year || "Non renseignee"}</TableCell>
                      <TableCell className="font-mono text-xs">{result.id}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadRecord(result)}
                          disabled={isLoadingRecord}
                        >
                          {isLoadingRecord ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <FileSearch className="mr-2 h-4 w-4" />
                          )}
                          Ouvrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {isTruncated ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <p>Affichage limite a 50 resultats. Ajoutez un terme ou une annee pour affiner la recherche.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Fiche en cours d&apos;edition</CardTitle>
              <CardDescription>
                {selectedRecord ? `${selectedRecord.displayName} • ${selectedRecord.subtitle || selectedRecord.id}` : "Selectionnez une fiche dans les resultats."}
              </CardDescription>
            </div>
            {selectedRecord ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {COLLECTION_OPTIONS.find((option) => option.value === selectedRecord.collection)?.label}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {selectedRecord.id}
                </Badge>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedRecord || !editorData ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              Ouvrez d&apos;abord un eleve pour editer ses donnees.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSave} disabled={isSaving || isLoadingRecord}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Enregistrer
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={isSaving || isLoadingRecord}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reinitialiser
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRecordToDelete(selectedRecord)}
                  disabled={isSaving || isLoadingRecord || isDeleting}
                >
                  {isDeleting && recordToDelete?.id === selectedRecord.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Supprimer la fiche
                </Button>
                <p className="text-sm text-muted-foreground">
                  L&apos;identifiant du document n&apos;est pas modifiable. La suppression retire la fiche de la base selectionnee.
                </p>
              </div>

              <Tabs value={activeEditorTab} onValueChange={setActiveEditorTab}>
                <TabsList>
                  <TabsTrigger value="fields">Champs</TabsTrigger>
                  <TabsTrigger value="json">JSON avance</TabsTrigger>
                </TabsList>

                <TabsContent value="fields" className="space-y-4">
                  {renderNode(editorData)}
                </TabsContent>

                <TabsContent value="json" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Document complet</Label>
                    <Textarea
                      value={jsonDraft}
                      onChange={(event) => setJsonDraft(event.target.value)}
                      className="min-h-[520px] font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handleApplyJson}>
                      Appliquer le JSON
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Utilisez ce mode pour les structures complexes ou les champs rarement modifies.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!recordToDelete} onOpenChange={(open) => !open && !isDeleting && setRecordToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression de la fiche</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible. La fiche de <strong className="font-bold">{recordToDelete?.displayName}</strong>
              {" "}sera supprimee de la collection{" "}
              <strong className="font-bold">{COLLECTION_OPTIONS.find((option) => option.value === recordToDelete?.collection)?.label}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRecordToDelete(null)} disabled={isDeleting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Supprimer definitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
