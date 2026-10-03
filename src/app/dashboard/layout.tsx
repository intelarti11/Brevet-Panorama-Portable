
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, LayoutGrid, PanelLeft, FileUp, Filter, AlertTriangle, CalendarRange, ShieldCheck, ClipboardEdit, Edit3, Eye, Users, GraduationCap, Shapes, BarChart2, User, FilePenLine, ShieldAlert, FileSearch, LockKeyhole } from 'lucide-react';
import * as React from 'react';

import Logo from '@/components/logo';
import {
  SidebarProvider as DefaultSidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton
} from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FilterProvider,
  useFilters,
  ALL_ACADEMIC_YEARS_VALUE,
  ALL_SERIE_TYPES_VALUE,
  ALL_ESTABLISHMENTS_VALUE
} from '@/contexts/FilterContext';
import { Skeleton } from '@/components/ui/skeleton';


interface DashboardLayoutProps {
  children: ReactNode;
}

function SidebarFilters() {
  const {
    isLoading,
    error: filterContextError,
    availableAcademicYears, selectedAcademicYear, setSelectedAcademicYear,
    availableSerieTypes, selectedSerieType, setSelectedSerieType,
    availableEstablishments, selectedEstablishment, setSelectedEstablishment
  } = useFilters();

  const pathname = (usePathname() ?? '/').replace(/\/$/, '') || '/';

  // Define which paths should show the Brevet Result filters
  const showBrevetResultFilters = [
    '/dashboard',
    '/dashboard/panorama',
    '/dashboard/pluriannuel',
    '/dashboard/donnee'
  ].includes(pathname);

  if (isLoading) {
    return (
      <div className="p-2 space-y-2">
        <p className="px-2 text-xs font-medium text-sidebar-foreground/70">Filtres (Chargement...)</p>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  // Always show error if it exists, as it might be a global context issue.
  if (filterContextError) {
    return (
      <div className="p-2">
        <div className="p-2 text-xs text-destructive-foreground bg-destructive/20 rounded-md border border-destructive/50">
          <p className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Erreur Filtres</p>
          {filterContextError}
        </div>
      </div>
    );
  }

  // Don't render filters if not on a relevant page.
  if (!showBrevetResultFilters) {
    return null;
  }

  return (
    <div className="pt-2">
      <div className="flex h-8 items-center gap-2 px-2 text-xs font-medium text-sidebar-foreground/70">
        <Filter className="h-4 w-4" />
        <span>Filtres Résultats Brevet</span>
      </div>
      <div className="space-y-3 p-2">
        <div>
          <label htmlFor="academicYear-filter-sidebar" className="block text-xs font-medium text-sidebar-foreground/80 mb-1">Année Scolaire</label>
          <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear} disabled={availableAcademicYears.length === 0}>
            <SelectTrigger id="academicYear-filter-sidebar" className="w-full h-8 text-xs bg-sidebar-background border-sidebar-border focus:ring-sidebar-ring">
              <SelectValue placeholder="Sélectionner Année" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACADEMIC_YEARS_VALUE}>Toutes les années</SelectItem>
              {availableAcademicYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="serieType-filter-sidebar" className="block text-xs font-medium text-sidebar-foreground/80 mb-1">Série</label>
          <Select value={selectedSerieType} onValueChange={setSelectedSerieType} disabled={availableSerieTypes.length === 0}>
            <SelectTrigger id="serieType-filter-sidebar" className="w-full h-8 text-xs bg-sidebar-background border-sidebar-border focus:ring-sidebar-ring">
              <SelectValue placeholder="Sélectionner Série" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SERIE_TYPES_VALUE}>Toutes les séries</SelectItem>
              {availableSerieTypes.map(serie => (
                <SelectItem key={serie} value={serie}>{serie}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="establishment-filter-sidebar" className="block text-xs font-medium text-sidebar-foreground/80 mb-1">Établissement</label>
          <Select value={selectedEstablishment} onValueChange={setSelectedEstablishment} disabled={availableEstablishments.length === 0}>
            <SelectTrigger id="establishment-filter-sidebar" className="w-full h-8 text-xs bg-sidebar-background border-sidebar-border focus:ring-sidebar-ring">
              <SelectValue placeholder="Sélectionner Établissement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ESTABLISHMENTS_VALUE}>Tous les établissements</SelectItem>
              {availableEstablishments.map(est => (
                <SelectItem key={est} value={est}>{est}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}


export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = (usePathname() ?? '/').replace(/\/$/, '') || '/';
  const [brevetOpen, setBrevetOpen] = React.useState(false);
  const [brevetBlancOpen, setBrevetBlancOpen] = React.useState(false);
  const [adminOpen, setAdminOpen] = React.useState(false);
  const [pixOpen, setPixOpen] = React.useState(false);
  const [replacementOpen, setReplacementOpen] = React.useState(false);

  React.useEffect(() => {
    const isBrevetPath = ['/dashboard', '/dashboard/panorama', '/dashboard/pluriannuel', '/dashboard/donnee'].includes(pathname);
    setBrevetOpen(isBrevetPath);

    const isBrevetBlancPath = pathname.startsWith('/dashboard/brevet-blanc');
    setBrevetBlancOpen(isBrevetBlancPath);

    const isPixPath = pathname.startsWith('/dashboard/pix');
    setPixOpen(isPixPath);

    const isReplacementPath = pathname.startsWith('/dashboard/remplacements');
    setReplacementOpen(isReplacementPath);

    const isAdminPath = pathname.startsWith('/dashboard/admin') || pathname === '/dashboard/import';
    setAdminOpen(isAdminPath);
  }, [pathname]);

  return (
    <FilterProvider>
      <DefaultSidebarProvider defaultOpen={true}>
        <Sidebar collapsible="none">
          <SidebarHeader className="flex items-center p-4">
            <div className="group-[[data-collapsible=icon][data-state=collapsed]]:hidden">
              <Logo className="text-2xl text-sidebar-foreground" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="p-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={brevetOpen}
                  tooltip={{ children: "Brevet", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/panorama">
                    <div className="flex items-center gap-2">
                      <GraduationCap />
                      <span>Brevet</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
                {brevetOpen && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/panorama"
                        isActive={pathname === '/dashboard/panorama' || pathname === '/dashboard'}
                      >
                        <LayoutGrid />
                        <span>Panorama</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/pluriannuel"
                        isActive={pathname === '/dashboard/pluriannuel'}
                      >
                        <CalendarRange />
                        <span>Pluriannuel</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/donnee"
                        isActive={pathname === '/dashboard/donnee'}
                      >
                        <Database />
                        <span>Données</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem className="mt-2">
                      <SidebarFilters />
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={brevetBlancOpen}
                  tooltip={{ children: "Brevet Blanc", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/brevet-blanc/panorama">
                    <div className="flex items-center gap-2">
                      <ClipboardEdit />
                      <span>Brevet Blanc</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
                {brevetBlancOpen && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/panorama"
                        isActive={pathname === '/dashboard/brevet-blanc/panorama'}
                      >
                        <BarChart2 />
                        <span>Panorama Blanc</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/pluriannuel"
                        isActive={pathname === '/dashboard/brevet-blanc/pluriannuel'}
                      >
                        <CalendarRange />
                        <span>Pluriannuel Blanc</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/saisie-notes"
                        isActive={pathname === '/dashboard/brevet-blanc/saisie-notes'}
                      >
                        <Edit3 />
                        <span>Saisir notes</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/voir-notes"
                        isActive={pathname === '/dashboard/brevet-blanc/voir-notes'}
                      >
                        <Eye />
                        <span>Voir notes</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/brevet-blanc/donnee"
                        isActive={pathname === '/dashboard/brevet-blanc/donnee'}
                      >
                        <Database />
                        <span>Données Blanc</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pixOpen}
                  tooltip={{ children: "PIX", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/pix">
                    <div className="flex items-center gap-2">
                      <Shapes />
                      <span>PIX</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
                {pixOpen && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/pix"
                        isActive={pathname === '/dashboard/pix'}
                      >
                        <BarChart2 />
                        <span>Analyse</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/pix/donnees"
                        isActive={pathname === '/dashboard/pix/donnees'}
                      >
                        <Database />
                        <span>Données</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/pix/profil"
                        isActive={pathname === '/dashboard/pix/profil'}
                      >
                        <User />
                        <span>Profil Élève</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={replacementOpen}
                  tooltip={{ children: "Remplacements", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/remplacements">
                    <div className="flex items-center gap-2">
                      <FileSearch />
                      <span>Remplacements</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
                {replacementOpen && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/remplacements"
                        isActive={pathname === '/dashboard/remplacements'}
                      >
                        <Users />
                        <span>Consultation</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        href="/dashboard/remplacements/import"
                        isActive={pathname === '/dashboard/remplacements/import'}
                      >
                        <FileUp />
                        <span>Importer les remplacements</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={adminOpen}
                    tooltip={{ children: "Administration", side: "right", align: "center" }}
                  >
                    <Link href="/dashboard/admin/divisions">
                        <div className="flex items-center gap-2">
                        <ShieldCheck />
                        <span>Administration</span>
                        </div>
                    </Link>
                  </SidebarMenuButton>
                  {adminOpen && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/divisions"
                          isActive={pathname === '/dashboard/admin/divisions'}
                        >
                          <Shapes />
                          <span>Divisions</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/verrouillage"
                          isActive={pathname === '/dashboard/admin/verrouillage'}
                        >
                          <LockKeyhole />
                          <span>Verrouillage</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                       <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/import"
                          isActive={pathname === '/dashboard/import'}
                        >
                          <FileUp />
                          <span>Import</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/import-manuel"
                          isActive={pathname === '/dashboard/admin/import-manuel'}
                        >
                          <FilePenLine />
                          <span>Import Manuel</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/doublons"
                          isActive={pathname === '/dashboard/admin/doublons'}
                        >
                          <ShieldAlert />
                          <span>Gérer Doublons</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          href="/dashboard/admin/cas-par-cas"
                          isActive={pathname === '/dashboard/admin/cas-par-cas'}
                        >
                          <FileSearch />
                          <span>Gestion cas par cas</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/dashboard/settings'}
                  tooltip={{ children: "Données locales", side: "right", align: "center" }}
                >
                  <Link href="/dashboard/settings">
                    <Database />
                    <span>Données locales</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
            <SidebarTrigger className="md:hidden" variant="outline" size="icon">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </SidebarTrigger>
            <div className="md:hidden">
              <Logo />
            </div>
            <span className="ml-auto text-xs text-muted-foreground sm:text-sm">
              Édition portable • Données locales
            </span>
          </header>
          <main className="flex-1 p-4 sm:px-6 sm:py-0">
            {children}
          </main>
        </SidebarInset>
      </DefaultSidebarProvider>
    </FilterProvider>
  );
}
