"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import {onAuthStateChanged} from "@/lib/local/session";
import {httpsCallable} from "@/lib/local/functions";
import {CalendarDays, CheckCircle, Loader2, Pencil, RefreshCw, Shapes} from "lucide-react";
import {auth, functions} from "@/lib/firebase";
import {getCurrentBrevetLockYear} from "@/lib/brevet-blanc-lock";
import {normalizeDivisionName} from "@/lib/division-names";
import {BREVET_DATA_UPDATED_EVENT} from "@/lib/brevet-data-events";
import {getCallableErrorMessage} from "@/lib/firebase-callable-error";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Badge} from "@/components/ui/badge";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {YearPicker} from "@/components/ui/year-picker";

type DivisionModule = "brevetBlanc" | "brevet" | "pix";
interface Division {
  name: string;
  counts: Record<DivisionModule, number>;
  lockedModules: DivisionModule[];
}
interface DivisionsResponse {success: boolean; year: string; divisions: Division[]}
interface RenameResponse {
  success: boolean;
  year: string;
  oldName: string;
  newName: string;
  counts: Record<DivisionModule, number>;
  message: string;
}
const ADMIN_EMAIL = "local-user@localhost";
const MODULE_LABELS = {brevetBlanc: "Brevet blanc", brevet: "DNB", pix: "PIX"};
const getDivisions = httpsCallable<{year: string}, DivisionsResponse>(functions, "getDivisions");
const renameDivision = httpsCallable<{year: string; oldName: string; newName: string}, RenameResponse>(functions, "renameDivision");

export default function AdminDivisionsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [year, setYear] = useState(getCurrentBrevetLockYear);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<{year: string; divisions: Division[]; error: string | null} | null>(null);
  const [editing, setEditing] = useState<{year: string; division: Division} | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RenameResponse | null>(null);

  useEffect(() => onAuthStateChanged(auth, (user) => setIsAdmin(user?.email === ADMIN_EMAIL)), []);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    getDivisions({year}).then(({data}) => {
      if (!data.success || data.year !== year) throw new Error("Impossible de charger les divisions.");
      if (active) setListing({year, divisions: data.divisions, error: null});
    }).catch((error: unknown) => {
      if (active) setListing({year, divisions: [], error: getCallableErrorMessage(error, "Impossible de charger les divisions.", "getDivisions")});
    });
    return () => { active = false; };
  }, [isAdmin, year, revision]);

  const refresh = () => {
    setListing(null);
    setRevision((previous) => previous + 1);
  };
  const currentListing = listing?.year === year ? listing : null;
  const divisions = currentListing?.divisions ?? [];
  const nameDraft = newName.trim();
  const collision = editing && divisions.some((division) =>
    division.name !== editing.division.name &&
    normalizeDivisionName(division.name) === normalizeDivisionName(nameDraft)
  );
  const invalidName = !nameDraft || nameDraft.length > 60 || /[\u0000-\u001f\u007f]/.test(nameDraft);

  const save = async () => {
    if (!editing || saving || invalidName || collision || nameDraft === editing.division.name) return;
    setSaving(true);
    setRenameError(null);
    try {
      const {data} = await renameDivision({year: editing.year, oldName: editing.division.name, newName: nameDraft});
      if (!data.success) throw new Error(data.message || "Renommage impossible.");
      setSuccess(data);
      setEditing(null);
      refresh();
      window.dispatchEvent(new Event(BREVET_DATA_UPDATED_EVENT));
    } catch (error: unknown) {
      setRenameError(getCallableErrorMessage(error, "Impossible de renommer cette division.", "renameDivision"));
    } finally {
      setSaving(false);
    }
  };

  if (isAdmin === null) return <p role="status" className="flex items-center gap-2 p-4"><Loader2 className="size-4 animate-spin" />Vérification de l’accès…</p>;
  if (!isAdmin) return <Alert variant="destructive"><AlertTitle>Accès réservé à l’administration</AlertTitle><AlertDescription>Connectez-vous avec le compte administrateur pour renommer les divisions.</AlertDescription></Alert>;

  return (
    <div className="flex flex-col gap-6 p-1 md:p-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Divisions</h1>
        <p className="text-muted-foreground">Renommez les divisions de l’établissement, par exemple « 3EME 1D » en « 3e 1 ».</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Année du brevet</CardTitle>
          <CardDescription>Le changement concerne uniquement l’année choisie.</CardDescription>
        </CardHeader>
        <CardContent>
          <Popover open={yearPickerOpen} onOpenChange={setYearPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={saving} aria-label="Choisir l’année du brevet">
                <CalendarDays data-icon="inline-start" />Brevet — juin {year}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <YearPicker selectedYear={Number(year)} onSelectYear={(value) => {
                setYear(String(value));
                setYearPickerOpen(false);
              }} />
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>
      {success?.year === year ? (
        <Alert>
          <CheckCircle className="size-4" />
          <AlertTitle>Division renommée</AlertTitle>
          <AlertDescription>{success.message} Les notes et les identités sont conservées. Les prochains imports utiliseront aussi ce nouveau nom.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><Shapes className="size-5" />Divisions pour {year}</CardTitle>
            <Button variant="outline" onClick={refresh} disabled={!currentListing || saving}>
              <RefreshCw data-icon="inline-start" />Actualiser
            </Button>
          </div>
          <CardDescription>Le renommage met à jour les fiches des élèves et leurs résultats DNB et PIX associés à cette division pour {year}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!currentListing ? <p role="status" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Chargement des divisions…</p> :
            currentListing.error ? <Alert variant="destructive"><AlertTitle>Chargement impossible</AlertTitle><AlertDescription>{currentListing.error}</AlertDescription></Alert> :
              divisions.length === 0 ? <p className="text-muted-foreground">Aucune division pour {year}. Importez d’abord les élèves ou leurs résultats pour cette année.</p> : (
                <Table className="w-full">
                  <TableHeader><TableRow>
                    <TableHead>Division</TableHead><TableHead>Élèves / BB</TableHead><TableHead>DNB</TableHead><TableHead>PIX</TableHead><TableHead>Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{divisions.map((division) => (
                    <TableRow key={division.name}>
                      <TableCell className="font-medium">{division.name}</TableCell>
                      <TableCell>{division.counts.brevetBlanc}</TableCell>
                      <TableCell>{division.counts.brevet}</TableCell>
                      <TableCell>{division.counts.pix}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <Button variant="outline" size="sm" disabled={saving || division.lockedModules.length > 0} aria-label={`Renommer ${division.name}`} onClick={() => {
                            setEditing({year, division});
                            setNewName(division.name);
                            setRenameError(null);
                          }}><Pencil data-icon="inline-start" />Renommer</Button>
                          {division.lockedModules.length > 0 ? <Badge variant="secondary">Verrouillé : {division.lockedModules.map((module) => MODULE_LABELS[module]).join(", ")}</Badge> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
          <p className="text-sm text-muted-foreground">Si une division est verrouillée, ouvrez l’année concernée dans <Link className="underline underline-offset-4" href="/dashboard/admin/verrouillage">Administration &gt; Verrouillage</Link> avant de la renommer.</p>
        </CardContent>
      </Card>
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto" onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Renommer la division</DialogTitle>
            <DialogDescription>« {editing?.division.name} » pour le brevet de juin {editing?.year}. Les notes et les identités seront conservées.</DialogDescription>
          </DialogHeader>
          <fieldset disabled={saving} className="flex flex-col gap-3">
            <Label htmlFor="division-new-name">Nouveau nom</Label>
            <Input id="division-new-name" value={newName} onChange={(event) => { setNewName(event.target.value); setRenameError(null); }} placeholder="Ex. : 3e 1" maxLength={60} aria-invalid={Boolean(collision || renameError)} aria-describedby="division-name-help" />
            <p id="division-name-help" className="text-sm text-muted-foreground">Pour une division de troisième, conservez un libellé commençant par 3 ou « troisième ».</p>
          </fieldset>
          {editing ? <p className="text-sm">Fiches concernées : {editing.division.counts.brevetBlanc} élèves / BB, {editing.division.counts.brevet} DNB, {editing.division.counts.pix} PIX.</p> : null}
          {collision ? <Alert variant="destructive"><AlertDescription>Ce nom existe déjà pour cette année. Choisissez un autre nom pour conserver les divisions distinctes.</AlertDescription></Alert> : null}
          {renameError ? <Alert variant="destructive"><AlertDescription>{renameError}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>Annuler</Button>
            <Button disabled={saving || invalidName || Boolean(collision) || nameDraft === editing?.division.name} onClick={save}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}
              {saving ? "Renommage…" : "Confirmer le renommage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
