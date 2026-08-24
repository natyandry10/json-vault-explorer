/* Atelier Signal — Panneau de détail éditorial pour une ligne JSON sélectionnée. */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VaultRecord } from "@/lib/vault";
import { Check, Copy, Fingerprint, FileJson2 } from "lucide-react";
import { useState } from "react";

type RecordInspectorProps = {
  record: VaultRecord | null;
  onOpenChange: (open: boolean) => void;
};

function present(value: unknown) {
  if (value === null) return "null";
  if (value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function RecordInspector({ record, onOpenChange }: RecordInspectorProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!record) return;
    await navigator.clipboard.writeText(JSON.stringify(record.data, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Sheet open={Boolean(record)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l-[#d5c9a9] bg-[#fffef8] p-0 sm:max-w-xl">
        {record && (
          <>
            <SheetHeader className="border-b border-[#e4dac0] bg-[#f6f0df] px-6 py-6 text-left">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#284b63] text-[#fffef8]"><FileJson2 size={18} /></span>
                <Badge className="rounded-sm bg-[#c84a34] px-2 font-mono text-[10px] tracking-[0.14em] text-white">LIGNE {String(record.sourceIndex + 1).padStart(4, "0")}</Badge>
              </div>
              <SheetTitle className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#223c52]">Détail de l’enregistrement</SheetTitle>
              <SheetDescription className="mt-1 font-mono text-xs text-[#5c6c78]">{record.sourceFileName} · importé le {new Date(record.importedAt).toLocaleString("fr-FR")}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-6 py-6">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-[#284b63]">Champs observés</p>
                  {record.duplicateOf ? <Badge className="rounded-sm bg-[#f3d2c7] text-[#8b2d1c]">Doublon détecté</Badge> : <Badge className="rounded-sm bg-[#dce7d8] text-[#2b5939]">Unique</Badge>}
                </div>
                <div className="divide-y divide-[#ece3cb] border-y border-[#ece3cb]">
                  {Object.entries(record.data).map(([key, value]) => (
                    <div className="grid grid-cols-[minmax(116px,0.8fr)_minmax(0,1.2fr)] gap-4 py-3" key={key}>
                      <span className="font-mono text-xs text-[#b14531]">{key}</span>
                      <span className="break-words text-sm leading-6 text-[#294056]">{present(value)}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-[#dfd1b5] bg-[#fbf8ed] p-4">
                <p className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-[#284b63]"><Fingerprint size={15} className="text-[#c84a34]" /> Empreinte de contrôle</p>
                <p className="font-mono text-xs text-[#536775]">{record.fingerprint}</p>
                {record.duplicateOf && <p className="mt-2 text-xs leading-5 text-[#8b2d1c]">Ce contenu est identique à une ligne déjà présente dans le coffre.</p>}
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-[#284b63]">JSON source</p>
                  <Button variant="outline" size="sm" className="focusable-control border-[#d9cbb0] bg-[#fffef8] text-[#284b63]" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copié" : "Copier"}</Button>
                </div>
                <pre className="max-h-96 overflow-auto rounded-xl bg-[#223c52] p-4 font-mono text-xs leading-6 text-[#eaf0e5]">{JSON.stringify(record.data, null, 2)}</pre>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
