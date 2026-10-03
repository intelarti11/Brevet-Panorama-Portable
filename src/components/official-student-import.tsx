"use client";

import { useMemo, useState } from "react";
import { CheckCircle, FileArchive, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OfficialStudentExport } from "@/lib/student-roster-types";
import { ImportFileDropzone } from "@/components/import-file-dropzone";

interface Props {
  year: string;
  disabled?: boolean;
  disabledReason?: string;
  onBusyChange?: (busy: boolean) => void;
}

export function OfficialStudentImport({ year, disabled = false, disabledReason, onBusyChange }: Props) {
  const [parsed, setParsed] = useState<OfficialStudentExport | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ year: string; message: string } | null>(null);
  const isFileInputDisabled = isReading || isSaving;
  const thirdYearClasses = useMemo(() => parsed?.classes.filter((classroom) => classroom.recommendedForBrevet) ?? [], [parsed]);
  const thirdYearStudentCount = thirdYearClasses.reduce((total, classroom) => total + classroom.studentCount, 0);
  const selectedStudents = useMemo(() => parsed?.students.filter((student) => selectedClasses.includes(student.CLASSE || "Sans classe")) ?? [], [parsed, selectedClasses]);

  async function readFile(file?: File) {
    if (!file || isFileInputDisabled) return;
    setParsed(null);
    setSelectedClasses([]);
    setError(null);
    setSummary(null);
    setFileName(file.name);
    setIsReading(true);
    onBusyChange?.(true);
    try {
      const { parseOfficialStudentFile } = await import("@/lib/official-student-import");
      const result = await parseOfficialStudentFile(file);
      setParsed(result);
      setSelectedClasses(result.classes.filter((classroom) => classroom.recommendedForBrevet).map((classroom) => classroom.code));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de lire l’export officiel.");
    } finally { setIsReading(false); onBusyChange?.(false); }
  }

  async function save() {
    if (disabled || !year || selectedStudents.length === 0 || isSaving) return;
    setIsSaving(true);
    onBusyChange?.(true);
    setError(null);
    setSummary(null);
    try {
      const { saveOfficialStudentRoster } = await import("@/lib/student-roster");
      const result = await saveOfficialStudentRoster(selectedStudents, year);
      setSummary({ year, message: `${result.created} élève(s) ajouté(s), ${result.updated} identité(s) mise(s) à jour pour ${year}. Les notes existantes sont conservées.` });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d’enregistrer les élèves.");
    } finally { setIsSaving(false); onBusyChange?.(false); }
  }

  return (
    <Card className="shadow-lg rounded-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2"><Users className="size-5 shrink-0 text-primary" aria-hidden="true" /> Élèves depuis la base officielle de l’établissement</CardTitle>
        <CardDescription>Importez l’export élèves SIECLE / BEE (.zip ou .xml) pour reprendre les noms, prénoms, INE et classes des élèves de troisième. Les élèves seront rattachés à l’année du brevet choisie ci-dessus, même si l’année scolaire de l’export commence l’année précédente.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <ImportFileDropzone
            id="official-student-file"
            accept=".zip,.xml,application/zip,application/xml,text/xml"
            prompt={<>Glissez-déposez l’export élèves (.zip, .xml) ou <span className="font-semibold text-primary hover:underline">cliquez</span></>}
            onFilesSelected={(files) => void readFile(files[0])}
            disabled={isFileInputDisabled}
          >
            {fileName ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground break-all"><FileArchive className="size-4 shrink-0" aria-hidden="true" /> {fileName}</p> : null}
          </ImportFileDropzone>
          {isReading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Lecture de la base officielle…</p> : null}
        </div>
        {parsed ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{thirdYearStudentCount} élèves de troisième avec INE disponibles dans {thirdYearClasses.length} classe(s).{parsed.schoolYear ? ` Année scolaire indiquée par l’export : ${parsed.schoolYear}.` : ""}</p>
            {parsed.excludedStudentCount || parsed.missingIneCount ? <p className="text-sm text-muted-foreground">{parsed.excludedStudentCount} élève(s) sorti(s) écarté(s). {parsed.missingIneCount} élève(s) sans INE écarté(s).</p> : null}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">Classes de troisième à importer</legend>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={() => { setSelectedClasses(thirdYearClasses.map((classroom) => classroom.code)); setSummary(null); }}>Sélectionner toutes les 3e</Button>
                <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={() => { setSelectedClasses([]); setSummary(null); }}>Tout désélectionner</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {thirdYearClasses.map((classroom, index) => (
                  <div key={classroom.code} className="flex items-center gap-2">
                    <Checkbox id={`official-class-${index}`} checked={selectedClasses.includes(classroom.code)} disabled={isSaving} onCheckedChange={(checked) => { setSelectedClasses((previous) => checked === true ? [...previous, classroom.code] : previous.filter((value) => value !== classroom.code)); setSummary(null); }} />
                    <Label htmlFor={`official-class-${index}`}>{classroom.code} ({classroom.studentCount})</Label>
                  </div>
                ))}
              </div>
            </fieldset>
            <p role="status" className="text-sm font-medium">{selectedStudents.length} élève(s) sélectionné(s) pour la session du brevet de juin {year}.</p>
            {selectedStudents.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Classe</TableHead><TableHead>Nom</TableHead><TableHead>Prénom</TableHead><TableHead>INE</TableHead></TableRow></TableHeader>
                  <TableBody>{selectedStudents.slice(0, 8).map((student) => <TableRow key={student.INE}><TableCell>{student.CLASSE || "Sans classe"}</TableCell><TableCell>{student.NOM}</TableCell><TableCell>{student.PRENOM}</TableCell><TableCell className="whitespace-nowrap">{student.INE}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            ) : null}
            {selectedStudents.length > 8 ? <p className="text-xs text-muted-foreground">Aperçu des 8 premiers élèves de la sélection.</p> : null}
          </div>
        ) : null}
        {disabledReason ? <Alert><AlertDescription>{disabledReason}</AlertDescription></Alert> : null}
        {error ? <Alert variant="destructive"><AlertTitle>Import impossible</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {summary?.year === year ? <Alert><CheckCircle className="size-4" /><AlertTitle>Élèves enregistrés</AlertTitle><AlertDescription>{summary.message} Vous pouvez télécharger les modèles préremplis dans les imports DNB et brevet blanc.</AlertDescription></Alert> : null}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={() => void save()} disabled={disabled || isReading || isSaving || !year || selectedStudents.length === 0}>
          {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Users className="size-4" aria-hidden="true" />}
          {isSaving ? "Enregistrement des élèves…" : `Ajouter / mettre à jour ${selectedStudents.length} élève(s)`}
        </Button>
      </CardFooter>
    </Card>
  );
}
