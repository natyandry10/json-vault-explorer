/* Atelier Signal — Tableau de contrôle éditorial, rail latéral et rubans pour explorer des données locales. */
import initialTours from "@/data/tours-initial.json";
import { RecordInspector } from "@/components/RecordInspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarSeparator, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  VaultActivity, VaultFile, VaultRecord, clearVault, exportRecordsJSON, formatBytes, importSources,
  loadVault, purgeDuplicates, recordExport, seedInitialData,
} from "@/lib/vault";
import {
  Activity, AlertTriangle, Archive, BarChart3, CheckCircle2, ChevronRight, CircleHelp, Database,
  Download, FileJson2, Files, Filter, FolderSearch, History, Home as HomeIcon, Import, LayoutDashboard,
  ListFilter, Loader2, Menu, MoreHorizontal, Search, ShieldCheck, Sparkles, Trash2, Upload,
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type View = "dashboard" | "explorer" | "search" | "analysis" | "history";

const heroImage = "/manus-storage/json-vault-hero_4f8d0d62.jpg";
const inspectorImage = "/manus-storage/json-vault-inspector_b77f25fe.jpg";
const duplicatesImage = "/manus-storage/json-vault-duplicates_2f201036.jpg";
const markImage = "/manus-storage/json-vault-mark_f66995b0.png";

const navItems = [
  { id: "dashboard" as View, label: "Accueil", detail: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "explorer" as View, label: "Explorer", detail: "Lignes & détails", icon: Files },
  { id: "search" as View, label: "Find", detail: "Recherche ciblée", icon: FolderSearch },
  { id: "analysis" as View, label: "Analyse", detail: "Signaux & champs", icon: BarChart3 },
  { id: "history" as View, label: "Historique", detail: "Imports & actions", icon: History },
];

function numberFormat(value: number) { return new Intl.NumberFormat("fr-FR").format(value); }
function shortHash(value: unknown) { return String(value ?? "—").slice(0, 16); }
function cellValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 40);
  return String(value);
}
function relativeDate(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 1440) return `il y a ${Math.round(minutes / 60)} h`;
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function getColumns(records: VaultRecord[]) {
  const fields = new Set(records.flatMap((record) => Object.keys(record.data)));
  const priority = ["date_utc", "date_brute", "coefficient", "hash"];
  return [...priority.filter((key) => fields.has(key)), ...Array.from(fields).filter((key) => !priority.includes(key)).sort()].slice(0, 6);
}

function getNumericSeries(records: VaultRecord[]) {
  const preferred = ["coefficient", "amount", "value", "score", "total"];
  const fields = getColumns(records);
  const field = preferred.find((key) => records.some((record) => typeof record.data[key] === "number")) ?? fields.find((key) => records.some((record) => typeof record.data[key] === "number"));
  if (!field) return { field: "valeur", data: [] as Array<{ name: string; value: number }> };
  return {
    field,
    data: records.filter((record) => typeof record.data[field] === "number").slice(0, 48).reverse().map((record, index) => ({ name: String(index + 1), value: Number(record.data[field]) })),
  };
}

function MetricCard({ label, value, note, color, icon: Icon }: { label: string; value: string; note: string; color: string; icon: typeof Database }) {
  return <article className="metric-card paper-panel enter-stagger rounded-2xl border border-[#eadfc6] p-5" style={{ "--metric-color": color } as React.CSSProperties}>
    <div className="flex items-start justify-between"><p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#637684]">{label}</p><span className="flex size-8 items-center justify-center rounded-lg bg-[#f6f0df] text-[#284b63]"><Icon size={16} /></span></div>
    <p className="mt-5 font-display text-3xl font-semibold tracking-[-0.06em] text-[#223c52]">{value}</p><p className="mt-1 text-xs text-[#71808a]">{note}</p>
  </article>;
}

export default function Home() {
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [activities, setActivities] = useState<VaultActivity[]>([]);
  const [view, setView] = useState<View>(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    return navItems.some((item) => item.id === requestedView) ? requestedView as View : "dashboard";
  });
  const [query, setQuery] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<VaultRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [storageUsage, setStorageUsage] = useState({ usage: 0, quota: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const snapshot = await loadVault();
    setRecords(snapshot.records); setFiles(snapshot.files); setActivities(snapshot.activities);
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      setStorageUsage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await seedInitialData(initialTours);
        if (mounted) await refresh();
      } catch (error) {
        console.error(error);
        toast.error("Le coffre local n’a pas pu être ouvert.");
      } finally { if (mounted) setIsLoading(false); }
    })();
    return () => { mounted = false; };
  }, [refresh]);

  const duplicateCount = useMemo(() => records.filter((record) => record.duplicateOf).length, [records]);
  const uniqueCount = records.length - duplicateCount;
  const dataBytes = useMemo(() => new Blob([JSON.stringify(records.map((record) => record.data))]).size, [records]);
  const columns = useMemo(() => getColumns(records), [records]);
  const series = useMemo(() => getNumericSeries(records), [records]);
  const filteredRecords = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("fr");
    return records.filter((record) => {
      if (duplicatesOnly && !record.duplicateOf) return false;
      return !term || JSON.stringify(record.data).toLocaleLowerCase("fr").includes(term) || record.sourceFileName.toLocaleLowerCase("fr").includes(term);
    });
  }, [records, query, duplicatesOnly]);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const jsonFiles = Array.from(event.target.files ?? []);
    if (!jsonFiles.length) return;
    setIsImporting(true);
    try {
      const sources = await Promise.all(jsonFiles.map(async (file) => ({ name: file.name, content: JSON.parse(await file.text()) as unknown, bytes: file.size })));
      const result = await importSources(sources);
      await refresh();
      setView("explorer"); setDuplicatesOnly(false);
      toast.success(`${result.added} lignes importées`, { description: `${result.unique} nouvelles · ${result.duplicates} doublons signalés` });
    } catch (error) {
      console.error(error);
      toast.error("Import impossible", { description: "Chaque fichier doit contenir du JSON valide." });
    } finally { setIsImporting(false); event.target.value = ""; }
  };

  const exportVault = async () => {
    if (!records.length) return toast.message("Le coffre est vide.");
    const blob = new Blob([exportRecordsJSON(records)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `json-vault-export-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
    await recordExport(records); await refresh();
    toast.success("Export JSON prêt", { description: `${numberFormat(records.length)} lignes ont été regroupées dans un fichier.` });
  };

  const removeDuplicates = async () => {
    if (!duplicateCount) return toast.message("Aucun doublon n’a été détecté.");
    if (!window.confirm(`Retirer définitivement ${duplicateCount} ligne(s) dupliquée(s) du coffre local ?`)) return;
    const removed = await purgeDuplicates(); await refresh();
    toast.success(`${removed} doublon(s) retiré(s)`);
  };

  const emptyVault = async () => {
    if (!window.confirm("Effacer tous les fichiers, lignes et l’historique enregistrés dans ce navigateur ?")) return;
    await clearVault(); await refresh(); setSelectedRecord(null); setView("dashboard");
    toast.success("Le coffre local a été vidé.");
  };

  const startImport = () => inputRef.current?.click();
  const activateDuplicates = () => { setView("explorer"); setDuplicatesOnly(true); setQuery(""); };

  const contentTitle = navItems.find((item) => item.id === view)?.label ?? "Accueil";
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#f8f3e6]"><div className="flex items-center gap-3 font-display text-sm text-[#284b63]"><Loader2 className="animate-spin" /> Ouverture du coffre local…</div></div>;

  return <SidebarProvider defaultOpen>
    <Sidebar variant="sidebar" collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 px-2 py-2">
          <img src={markImage} alt="Logo JSON Vault" className="size-10 shrink-0 object-contain" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="font-display text-[15px] font-bold tracking-[-0.05em] text-[#fffef8]">JSON VAULT</p><p className="font-mono text-[9px] tracking-[0.18em] text-[#a7b9c4]">EXPLORER</p></div>
        </div>
      </SidebarHeader>
      <SidebarSeparator className="mx-4 bg-white/15" />
      <SidebarContent className="px-2 py-4">
        <SidebarGroup className="p-0"><SidebarGroupLabel className="px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a7b9c4]">Atelier</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{navItems.map(({ id, label, icon: Icon }) => <SidebarMenuItem key={id}>
            <SidebarMenuButton tooltip={label} isActive={view === id} onClick={() => { setView(id); if (id !== "explorer") setDuplicatesOnly(false); }} className={`h-11 rounded-lg px-3 text-[#eaf0e5] hover:bg-white/10 hover:text-white ${view === id ? "nav-active bg-white/10 text-white" : ""}`}><Icon size={17} /><span className="font-medium">{label}</span></SidebarMenuButton>
            {id === "explorer" && records.length > 0 && <SidebarMenuBadge className="right-3 font-mono text-[10px] text-[#c8d4db]">{numberFormat(records.length)}</SidebarMenuBadge>}
          </SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto p-0"><SidebarGroupLabel className="px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a7b9c4]">Coffre</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2 px-3 group-data-[collapsible=icon]:hidden"><div className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="mb-2 flex items-center justify-between text-xs text-[#d7e0db]"><span>Stockage local</span><span className="font-mono">{storageUsage.quota ? `${Math.min(100, Math.round((storageUsage.usage / storageUsage.quota) * 100))}%` : "—"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#d9b76a]" style={{ width: `${storageUsage.quota ? Math.max(2, Math.min(100, (storageUsage.usage / storageUsage.quota) * 100)) : 2}%` }} /></div><p className="mt-2 font-mono text-[10px] text-[#a7b9c4]">{formatBytes(dataBytes)} de données</p></div></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-white/10 p-3"><Button onClick={startImport} className="focusable-control h-10 w-full rounded-lg bg-[#c84a34] font-display text-sm text-white hover:bg-[#a83c2a] group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:p-0"><Upload size={16} /><span className="group-data-[collapsible=icon]:hidden">Importer un JSON</span></Button></SidebarFooter>
    </Sidebar>
    <SidebarInset className="min-w-0 bg-transparent">
      <input ref={inputRef} className="hidden" type="file" accept="application/json,.json" multiple onChange={importFiles} />
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e8dec6] bg-[#f8f3e6]/90 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3"><SidebarTrigger className="focusable-control rounded-lg border border-[#e4d8bd] bg-[#fffef8] text-[#284b63]" /><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a8b94]">Atelier / {contentTitle}</p><p className="font-display text-sm font-semibold text-[#223c52]">Vos JSON, rangés comme des preuves.</p></div></div>
        <div className="flex items-center gap-2"><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="focusable-control hidden border-[#ded1b4] bg-[#fffef8] text-[#284b63] sm:inline-flex" onClick={() => toast.message("Toutes les données restent dans ce navigateur via IndexedDB.")}><CircleHelp size={17} /></Button></TooltipTrigger><TooltipContent>Vos données ne quittent pas ce navigateur.</TooltipContent></Tooltip><Button variant="outline" onClick={exportVault} className="focusable-control hidden border-[#ded1b4] bg-[#fffef8] text-[#284b63] hover:bg-[#f4edda] sm:inline-flex"><Download size={15} />Exporter</Button><Button onClick={startImport} className="focusable-control rounded-lg bg-[#284b63] text-white hover:bg-[#1c3447]"><Import size={15} /> <span className="hidden sm:inline">Ajouter JSON</span></Button></div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="data-ribbon mb-7 flex min-h-11 items-center gap-3 rounded-l-lg bg-[#284b63] px-4 pr-16 text-white"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#cbd8d1]">Vue active</span><span className="h-4 w-px bg-white/30" /><span className="font-display text-sm font-semibold">{contentTitle}</span><span className="hidden font-mono text-[10px] text-[#d9b76a] md:inline">[JV/01]</span><span className="ml-auto hidden font-mono text-[10px] text-[#d9b76a] sm:inline">{numberFormat(records.length)} LIGNES · {numberFormat(files.length)} FICHIER{files.length > 1 ? "S" : ""}</span></div>

        {view === "dashboard" && <DashboardView records={records} files={files} activities={activities} series={series} duplicateCount={duplicateCount} uniqueCount={uniqueCount} dataBytes={dataBytes} onImport={startImport} onDuplicates={activateDuplicates} onExport={exportVault} onNavigate={setView} />}
        {view === "explorer" && <ExplorerView records={filteredRecords} columns={columns} query={query} duplicatesOnly={duplicatesOnly} onQuery={setQuery} onDuplicateChange={setDuplicatesOnly} onSelect={setSelectedRecord} onPurge={removeDuplicates} />}
        {view === "search" && <SearchView records={filteredRecords} query={query} onQuery={setQuery} onSelect={setSelectedRecord} onViewAll={() => setView("explorer")} />}
        {view === "analysis" && <AnalysisView records={records} files={files} duplicateCount={duplicateCount} uniqueCount={uniqueCount} series={series} onDuplicate={activateDuplicates} />}
        {view === "history" && <HistoryView activities={activities} files={files} onClear={emptyVault} onExport={exportVault} />}
      </main>
      <RecordInspector record={selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)} />
      {isImporting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#223c52]/45 backdrop-blur-sm"><div className="rounded-2xl bg-[#fffef8] px-6 py-5 shadow-2xl"><div className="flex items-center gap-3 font-display font-semibold text-[#284b63]"><Loader2 className="animate-spin text-[#c84a34]" size={20} />Lecture, contrôle et archivage…</div></div></div>}
    </SidebarInset>
  </SidebarProvider>;
}

function DashboardView({ records, files, activities, series, duplicateCount, uniqueCount, dataBytes, onImport, onDuplicates, onExport, onNavigate }: { records: VaultRecord[]; files: VaultFile[]; activities: VaultActivity[]; series: ReturnType<typeof getNumericSeries>; duplicateCount: number; uniqueCount: number; dataBytes: number; onImport: () => void; onDuplicates: () => void; onExport: () => void; onNavigate: (view: View) => void }) {
  const latestFile = files[0];
  return <div className="space-y-6">
    <section className="atelier-hero relative overflow-hidden rounded-3xl bg-[#eee5ce] px-6 py-8 sm:px-9 lg:min-h-[280px] lg:py-10">
      <img src={heroImage} alt="Illustration abstraite d’un coffre de données" className="absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-80 lg:w-[58%]" />
      <div className="absolute inset-y-0 right-0 w-full bg-gradient-to-r from-[#eee5ce] via-[#eee5ce]/95 to-[#eee5ce]/10 lg:w-[68%]" />
      <div className="hero-vault-mark" aria-hidden="true"><span>[</span><span>]</span><small>VAULT</small></div><div className="relative max-w-xl"><Badge className="rounded-sm bg-[#284b63] font-mono text-[10px] tracking-[0.15em] text-white">COFFRE LOCAL ACTIF</Badge><h1 className="mt-4 font-display text-4xl font-semibold tracking-[-0.06em] text-[#223c52] sm:text-5xl">De l’archive brute<br />au signal exploitable.</h1><p className="mt-4 max-w-md text-sm leading-6 text-[#536775]">Chaque fichier reste dans le navigateur. Importez plusieurs JSON, inspectez chaque ligne, repérez les contenus identiques et réexportez le coffre au besoin.</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={onImport} className="focusable-control rounded-lg bg-[#c84a34] text-white hover:bg-[#a83c2a]"><Upload size={16} />Importer des fichiers</Button><Button variant="outline" onClick={() => onNavigate("explorer")} className="focusable-control border-[#cdbf9e] bg-[#fffef8]/80 text-[#284b63] hover:bg-white"><Files size={16} />Voir les lignes</Button></div></div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Lignes archivées" value={numberFormat(records.length)} note={`${numberFormat(uniqueCount)} contenus uniques`} color="#284b63" icon={Database} /><MetricCard label="Fichiers source" value={numberFormat(files.length)} note={latestFile ? `dernier : ${latestFile.name}` : "en attente d’import"} color="#d9b76a" icon={FileJson2} /><MetricCard label="Doublons signalés" value={numberFormat(duplicateCount)} note={duplicateCount ? "contenus identiques conservés" : "aucun contenu identique"} color="#c84a34" icon={ShieldCheck} /><MetricCard label="Poids du coffre" value={formatBytes(dataBytes)} note="JSON compressible à l’export" color="#62889c" icon={Archive} /></section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
      <article className="paper-panel rounded-2xl border border-[#eadfc6] p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Signal numérique</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-[#223c52]">Variation de « {series.field} »</h2></div><Badge className="rounded-sm bg-[#e6efd9] text-[#355642]">{series.data.length} points</Badge></div><div className="mt-6 h-[235px]">{series.data.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={series.data} margin={{ top: 12, right: 6, left: -16, bottom: 0 }}><defs><linearGradient id="signalFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#284b63" stopOpacity={0.32} /><stop offset="100%" stopColor="#284b63" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e8ddc5" strokeDasharray="3 5" /><XAxis dataKey="name" hide /><YAxis tick={{ fill: "#71808a", fontSize: 10 }} axisLine={false} tickLine={false} width={34} /><ChartTooltip cursor={{ stroke: "#c84a34", strokeWidth: 1 }} contentStyle={{ borderRadius: 10, border: "1px solid #e3d6ba", background: "#fffef8", fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke="#284b63" strokeWidth={2.5} fill="url(#signalFill)" /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#dbcdae] text-sm text-[#71808a]">Aucun champ numérique détecté.</div>}</div></article>
      <article className="relative overflow-hidden rounded-2xl border border-[#ebd5cc] bg-[#fff7f3] p-5 sm:p-6"><img src={duplicatesImage} alt="Illustration abstraite de doublons" className="absolute inset-y-0 right-0 h-full w-[52%] object-cover opacity-25" /><div className="relative"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a5b4c]">Contrôle d’identité</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-[#713021]">Doublons sous surveillance</h2><p className="mt-3 max-w-[260px] text-sm leading-6 text-[#805446]">L’application compare la structure et toutes les valeurs de chaque ligne avant de l’archiver.</p><div className="mt-6 flex items-end gap-4"><span className="font-display text-5xl font-semibold tracking-[-0.08em] text-[#c84a34]">{numberFormat(duplicateCount)}</span><span className="pb-1 text-xs leading-4 text-[#805446]">ligne{duplicateCount > 1 ? "s" : ""}<br />identique{duplicateCount > 1 ? "s" : ""}</span></div><div className="mt-5 flex gap-3"><Button size="sm" onClick={onDuplicates} className="focusable-control bg-[#c84a34] text-white hover:bg-[#a83c2a]">Examiner</Button><Button size="sm" variant="outline" onClick={onExport} className="focusable-control border-[#d7aea2] bg-white/60 text-[#8b2d1c]">Exporter tout</Button></div></div></article>
    </section>
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]"><article className="paper-panel rounded-2xl border border-[#eadfc6] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Derniers fichiers</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-[#223c52]">Imports conservés</h2></div><Button variant="ghost" size="sm" onClick={() => onNavigate("history")} className="text-[#284b63]">Historique <ChevronRight size={15} /></Button></div><div className="space-y-3">{files.slice(0, 3).map((file) => <div key={file.id} className="flex items-center gap-3 rounded-xl border border-[#ece1ca] bg-[#fffef8] p-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#e9f0ed] text-[#284b63]"><FileJson2 size={18} /></span><div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-semibold text-[#284b63]">{file.name}</p><p className="mt-0.5 font-mono text-[10px] text-[#73838d]">{numberFormat(file.totalRecords)} lignes · {file.fields.length} champs · {relativeDate(file.importedAt)}</p></div><span className="font-mono text-xs text-[#c84a34]">{file.duplicates ? `${file.duplicates} dup.` : "net"}</span></div>)}{!files.length && <div className="rounded-xl border border-dashed border-[#dfd2b6] p-6 text-center text-sm text-[#71808a]">Votre premier fichier JSON apparaîtra ici.</div>}</div></article>
      <article className="rounded-2xl bg-[#284b63] p-5 text-[#fffef8] sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#cbd8d1]">Activité récente</p><div className="mt-4 space-y-4">{activities.slice(0, 4).map((activity) => <div key={activity.id} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#d9b76a]" /><div><p className="text-sm font-medium">{activity.title}</p><p className="mt-1 text-xs leading-5 text-[#bdcad0]">{activity.detail}</p><p className="mt-1 font-mono text-[10px] text-[#8fa5b2]">{relativeDate(activity.createdAt)}</p></div></div>)}{!activities.length && <p className="text-sm text-[#bdcad0]">Aucune activité à afficher.</p>}</div></article></section>
  </div>;
}

function ExplorerView({ records, columns, query, duplicatesOnly, onQuery, onDuplicateChange, onSelect, onPurge }: { records: VaultRecord[]; columns: string[]; query: string; duplicatesOnly: boolean; onQuery: (value: string) => void; onDuplicateChange: (checked: boolean) => void; onSelect: (record: VaultRecord) => void; onPurge: () => void }) {
  return <div className="space-y-5"><section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Table d’inspection</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.06em] text-[#223c52]">Chaque ligne, en contexte.</h1><p className="mt-2 text-sm text-[#687983]">Cliquez sur une ligne pour inspecter ses champs et son JSON source.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onDuplicateChange(!duplicatesOnly)} className={`focusable-control border-[#d8c9ad] ${duplicatesOnly ? "bg-[#f5d8cf] text-[#8b2d1c]" : "bg-[#fffef8] text-[#284b63]"}`}><Filter size={15} />{duplicatesOnly ? "Doublons uniquement" : "Tous les enregistrements"}</Button>{duplicatesOnly && <Button variant="outline" onClick={onPurge} className="focusable-control border-[#dcb4a8] bg-[#fff7f4] text-[#8b2d1c]"><Trash2 size={15} />Retirer les doublons</Button>}</div></section><section className="paper-panel overflow-hidden rounded-2xl border border-[#eadfc6]"><div className="flex flex-col gap-3 border-b border-[#eadfc6] bg-[#fbf7eb] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative max-w-xl flex-1"><Search className="absolute top-1/2 left-3 -translate-y-1/2 text-[#8a979b]" size={16} /><Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Rechercher dans toutes les valeurs, hash, date…" className="h-10 border-[#ded1b4] bg-[#fffef8] pl-9 text-sm" /></div><div className="flex items-center gap-3 text-xs text-[#71808a]"><span className="font-mono">{numberFormat(records.length)} résultat{records.length > 1 ? "s" : ""}</span><Badge className="rounded-sm bg-[#e6efd9] text-[#355642]">Local</Badge></div></div><ScrollArea className="w-full"><table className="w-full min-w-[850px] border-collapse text-left"><thead className="bg-[#f2ead7]"><tr><th className="w-16 px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[#71808a]">Ligne</th>{columns.map((column) => <th key={column} className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[#71808a]">{column}</th>)}<th className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[#71808a]">État</th><th className="w-12" /></tr></thead><tbody>{records.slice(0, 250).map((record) => <tr key={record.id} onClick={() => onSelect(record)} className="record-row cursor-pointer border-t border-[#efe5d0] bg-[#fffef8]"><td className="px-4 py-3.5 font-mono text-[11px] text-[#8a979b]">{String(record.sourceIndex + 1).padStart(4, "0")}</td>{columns.map((column) => <td key={column} className={`max-w-[210px] truncate px-4 py-3.5 text-sm ${column === "hash" ? "font-mono text-xs text-[#5f7380]" : "text-[#294056]"}`}>{column === "hash" ? shortHash(record.data[column]) : cellValue(record.data[column])}</td>)}<td className="px-4 py-3.5">{record.duplicateOf ? <Badge className="rounded-sm bg-[#f5d8cf] text-[#8b2d1c]">Doublon</Badge> : <Badge className="rounded-sm bg-[#e4efdf] text-[#355642]">Unique</Badge>}</td><td className="px-4 py-3.5 text-[#6d7d86]"><MoreHorizontal size={18} /></td></tr>)}{!records.length && <tr><td colSpan={columns.length + 3} className="p-12 text-center"><Files className="mx-auto mb-3 text-[#a2adb0]" /><p className="font-display font-semibold text-[#284b63]">Aucune ligne ne correspond à ce filtre.</p><p className="mt-1 text-sm text-[#71808a]">Essayez une autre recherche ou importez un nouveau JSON.</p></td></tr>}</tbody></table></ScrollArea>{records.length > 250 && <div className="border-t border-[#eadfc6] bg-[#fbf7eb] px-4 py-3 text-center font-mono text-[10px] text-[#71808a]">Affichage des 250 premières lignes · utilisez la recherche pour resserrer la vue</div>}</section></div>;
}

function SearchView({ records, query, onQuery, onSelect, onViewAll }: { records: VaultRecord[]; query: string; onQuery: (value: string) => void; onSelect: (record: VaultRecord) => void; onViewAll: () => void }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><section><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Find / Recherche profonde</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.06em] text-[#223c52]">Retrouvez une valeur, où qu’elle se cache.</h1><div className="paper-panel mt-6 rounded-2xl border border-[#eadfc6] p-5"><div className="relative"><Search className="absolute top-1/2 left-4 -translate-y-1/2 text-[#c84a34]" size={20} /><Input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Ex. 2026-08-24, 12.53, B181FE…" className="h-14 border-[#d9c9aa] bg-[#fffef8] pl-11 font-display text-base" /></div><p className="mt-3 text-xs text-[#71808a]">La recherche parcourt les noms de fichiers et toutes les clés et valeurs JSON, y compris les champs imbriqués.</p></div><div className="mt-5 space-y-3">{query && records.slice(0, 12).map((record) => <button type="button" key={record.id} onClick={() => onSelect(record)} className="focusable-control paper-panel flex w-full items-center gap-4 rounded-xl border border-[#eadfc6] p-4 text-left hover:border-[#c8b68e]"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e9f0ed] text-[#284b63]"><FileJson2 size={17} /></span><div className="min-w-0 flex-1"><p className="font-display text-sm font-semibold text-[#284b63]">{record.sourceFileName} <span className="font-mono text-[10px] font-normal text-[#7a8b94]">· ligne {record.sourceIndex + 1}</span></p><p className="mt-1 truncate font-mono text-[11px] text-[#637684]">{JSON.stringify(record.data)}</p></div>{record.duplicateOf && <Badge className="rounded-sm bg-[#f5d8cf] text-[#8b2d1c]">doublon</Badge>}<ChevronRight size={17} className="text-[#9aa8ad]" /></button>)}{query && !records.length && <div className="rounded-xl border border-dashed border-[#dbcdae] p-9 text-center text-sm text-[#71808a]">Aucun élément ne contient « {query} ».</div>}{!query && <div className="mt-7 rounded-2xl border border-dashed border-[#d7c8a9] bg-[#faf5e8] p-9 text-center"><FolderSearch className="mx-auto mb-3 text-[#c84a34]" size={25} /><p className="font-display font-semibold text-[#284b63]">Commencez par un mot-clé.</p><p className="mt-1 text-sm text-[#71808a]">Une date, une valeur, une référence ou un fragment de hash fonctionne.</p></div>}</div></section><aside className="relative overflow-hidden rounded-2xl bg-[#284b63] p-6 text-[#fffef8]"><img src={inspectorImage} alt="Illustration abstraite d’inspection de données" className="absolute right-0 bottom-0 h-[47%] w-full object-cover opacity-25 mix-blend-screen" /><div className="relative"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#cbd8d1]">Raccourci de lecture</p><h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.05em]">La recherche n’efface aucun contexte.</h2><p className="mt-3 text-sm leading-6 text-[#c3d0d5]">Ouvrez un résultat pour voir son origine, son empreinte locale et la structure complète de la ligne.</p><Button variant="outline" onClick={onViewAll} className="focusable-control mt-6 border-white/25 bg-white/10 text-white hover:bg-white/20">Afficher toutes les lignes</Button></div></aside></div>;
}

function AnalysisView({ records, files, duplicateCount, uniqueCount, series, onDuplicate }: { records: VaultRecord[]; files: VaultFile[]; duplicateCount: number; uniqueCount: number; series: ReturnType<typeof getNumericSeries>; onDuplicate: () => void }) {
  const allFields = useMemo(() => { const counts = new Map<string, number>(); records.forEach((record) => Object.keys(record.data).forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1))); return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]); }, [records]);
  const numericValues = useMemo(() => series.data.map((item) => item.value), [series]);
  const maximum = numericValues.length ? Math.max(...numericValues) : 0;
  const average = numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : 0;
  return <div className="space-y-6"><section className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Analyse de structure</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.06em] text-[#223c52]">Ce que le coffre raconte.</h1></div><Badge className="w-fit rounded-sm bg-[#e4efdf] px-3 py-1.5 text-[#355642]">{numberFormat(uniqueCount)} contenus distincts</Badge></section><section className="grid gap-4 md:grid-cols-3"><MetricCard label="Champs observés" value={numberFormat(allFields.length)} note="union des structures importées" color="#284b63" icon={ListFilter} /><MetricCard label={`Moyenne ${series.field}`} value={average ? average.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"} note="sur les valeurs numériques reconnues" color="#d9b76a" icon={Sparkles} /><MetricCard label={`Maximum ${series.field}`} value={maximum ? maximum.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"} note="plus forte valeur affichée" color="#c84a34" icon={AlertTriangle} /></section><section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]"><article className="paper-panel rounded-2xl border border-[#eadfc6] p-5 sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Couverture des champs</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-[#223c52]">Les clés les plus présentes</h2><div className="mt-6 space-y-4">{allFields.slice(0, 9).map(([field, count]) => <div key={field}><div className="mb-1.5 flex justify-between text-xs"><span className="font-mono text-[#284b63]">{field}</span><span className="text-[#71808a]">{numberFormat(count)} / {numberFormat(records.length)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#ece2cb]"><div className="h-full rounded-full bg-[#284b63]" style={{ width: `${records.length ? (count / records.length) * 100 : 0}%` }} /></div></div>)}{!allFields.length && <p className="text-sm text-[#71808a]">Importez un fichier pour analyser sa structure.</p>}</div></article><article className="rounded-2xl border border-[#e8d2cc] bg-[#fff6f2] p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a5b4c]">Intégrité</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-[#713021]">Rapport de duplication</h2></div><ShieldCheck className="text-[#c84a34]" /></div><div className="mt-6 rounded-xl bg-white/65 p-4"><div className="flex items-center justify-between"><span className="text-sm text-[#805446]">Lignes identiques</span><span className="font-display text-3xl font-semibold tracking-[-0.06em] text-[#c84a34]">{numberFormat(duplicateCount)}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f0d6cf]"><div className="h-full rounded-full bg-[#c84a34]" style={{ width: `${records.length ? (duplicateCount / records.length) * 100 : 0}%` }} /></div><p className="mt-3 text-xs leading-5 text-[#8e6658]">Les doublons sont conservés avec leur fichier et leur position d’origine. Vous gardez ainsi la traçabilité avant de décider de les retirer.</p></div><Button onClick={onDuplicate} className="focusable-control mt-5 bg-[#c84a34] text-white hover:bg-[#a83c2a]">Ouvrir les doublons <ChevronRight size={15} /></Button></article></section><section className="paper-panel rounded-2xl border border-[#eadfc6] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Inventaire</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-[#223c52]">Résumé par fichier</h2></div><span className="font-mono text-[10px] text-[#71808a]">{numberFormat(files.length)} SOURCE{files.length > 1 ? "S" : ""}</span></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{files.map((file) => <div key={file.id} className="rounded-xl border border-[#e8dec7] bg-[#fffef8] p-4"><p className="truncate font-display text-sm font-semibold text-[#284b63]">{file.name}</p><p className="mt-2 font-mono text-[10px] text-[#71808a]">{numberFormat(file.totalRecords)} lignes · {file.fields.length} champs</p><div className="mt-3 flex gap-2">{file.fields.slice(0, 3).map((field) => <span key={field} className="rounded-sm bg-[#f4eedc] px-1.5 py-1 font-mono text-[9px] text-[#5e7080]">{field}</span>)}</div></div>)}</div></section></div>;
}

function HistoryView({ activities, files, onClear, onExport }: { activities: VaultActivity[]; files: VaultFile[]; onClear: () => void; onExport: () => void }) {
  const kindIcon = { import: Import, seed: Sparkles, export: Download, purge: Trash2 };
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><section><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#71808a]">Journal d’atelier</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.06em] text-[#223c52]">Chaque opération laisse une trace.</h1><article className="paper-panel mt-6 rounded-2xl border border-[#eadfc6] p-5 sm:p-6"><div className="space-y-1">{activities.map((activity) => { const Icon = kindIcon[activity.kind]; return <div key={activity.id} className="flex gap-4 border-b border-[#eee3cc] py-4 last:border-b-0"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#edf1e9] text-[#284b63]"><Icon size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-display text-sm font-semibold text-[#284b63]">{activity.title}</p><span className="font-mono text-[10px] text-[#7e8d95]">{new Date(activity.createdAt).toLocaleString("fr-FR")}</span></div><p className="mt-1 text-xs leading-5 text-[#71808a]">{activity.detail}</p></div></div>; })}{!activities.length && <div className="py-12 text-center text-sm text-[#71808a]">Les imports, exports et opérations apparaîtront dans ce journal.</div>}</div></article></section><aside className="space-y-4"><article className="rounded-2xl bg-[#284b63] p-6 text-[#fffef8]"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#cbd8d1]">Portabilité</p><h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.05em]">Votre archive vous suit.</h2><p className="mt-3 text-sm leading-6 text-[#c3d0d5]">Exportez tous les objets JSON à tout moment, sans format propriétaire ni verrouillage.</p><Button onClick={onExport} variant="outline" className="focusable-control mt-5 border-white/25 bg-white/10 text-white hover:bg-white/20"><Download size={15} />Exporter le coffre</Button></article><article className="rounded-2xl border border-[#e8d2cc] bg-[#fff6f2] p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a5b4c]">Zone de prudence</p><h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.05em] text-[#713021]">Réinitialiser ce navigateur</h2><p className="mt-3 text-sm leading-6 text-[#8e6658]">Cette action supprime les {numberFormat(files.length)} fichier{files.length > 1 ? "s" : ""} et les données archivées localement.</p><Button onClick={onClear} variant="outline" className="focusable-control mt-5 border-[#dcb4a8] bg-white/70 text-[#8b2d1c] hover:bg-[#fbe4dc]"><Trash2 size={15} />Vider le coffre</Button></article></aside></div>;
}
