import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { CIRCUIT_BONS } from "@/hooks/useSignatures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const normalizeZone = (zone: string) => zone?.trim().toLowerCase();

function numberToWordsFr(n: number): string {
  const intPart = Math.floor(Math.abs(n));
  const ones = [
    "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
    "dix-sept", "dix-huit", "dix-neuf",
  ];

  function belowHundred(x: number): string {
    if (x < 20) return ones[x];
    const d = Math.floor(x / 10);
    const u = x % 10;
    if (d === 7) return u === 1 ? "soixante-et-onze" : `soixante-${ones[10 + u]}`;
    if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${ones[u]}`;
    if (d === 9) return `quatre-vingt-${ones[10 + u]}`;
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][d];
    return u === 0 ? tens : u === 1 && d < 7 ? `${tens}-et-un` : `${tens}-${ones[u]}`;
  }

  function belowThousand(x: number): string {
    if (x < 100) return belowHundred(x);
    const h = Math.floor(x / 100);
    const r = x % 100;
    const centWord = h === 1 ? "cent" : `${ones[h]} cent${r === 0 ? "s" : ""}`;
    return r === 0 ? centWord : `${centWord} ${belowHundred(r)}`;
  }

  function convert(x: number): string {
    if (x === 0) return "zéro";
    if (x < 1000) return belowThousand(x);
    if (x < 1_000_000) {
      const t = Math.floor(x / 1000);
      const r = x % 1000;
      const tWord = t === 1 ? "mille" : `${belowThousand(t)} mille`;
      return r === 0 ? tWord : `${tWord} ${belowThousand(r)}`;
    }
    const m = Math.floor(x / 1_000_000);
    const r = x % 1_000_000;
    const mWord = `${belowThousand(m)} million${m > 1 ? "s" : ""}`;
    return r === 0 ? mWord : `${mWord} ${convert(r)}`;
  }

  return n < 0 ? `moins ${convert(intPart)}` : convert(intPart);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BonData {
  id: string;
  demande_id: string;
  montant: number;
  n_liter: number;
  statut: string;
  matricule: string;
  typeVehicule: string;
  chauffeur: string;
  departement: string;
  date: string;
  bonNum: number;
}

interface SigEntry {
  role: string;
  signature_url: string | null;
  signe_le: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BonVerificationPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bon, setBon]           = useState<BonData | null>(null);
  const [sigs, setSigs]         = useState<SigEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchData() {
    setLoading(true);

    // 1. Charge le bon avec vehicule + demande
    const { data, error } = await supabase
      .from("demande_vehicules")
      .select(`
        id, montant, n_liter, statut, demande_id,
        demandes_ravitaillement (created_at, departement),
        vehicules (matricule, vehicule, chauffeur_responsable)
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    const demande  = Array.isArray(d.demandes_ravitaillement) ? d.demandes_ravitaillement[0] : d.demandes_ravitaillement;
    const vehicule = Array.isArray(d.vehicules)               ? d.vehicules[0]               : d.vehicules;

    // 2. Détermine le numéro du bon (même tri par zone que la fonction d'impression)
    const { data: allDv } = await supabase
      .from("demande_vehicules")
      .select("id, vehicules(zone)")
      .eq("demande_id", d.demande_id)
      .eq("statut", "valide");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = (allDv ?? []).sort((a: any, b: any) => {
      const za = (Array.isArray(a.vehicules) ? a.vehicules[0] : a.vehicules)?.zone ?? "";
      const zb = (Array.isArray(b.vehicules) ? b.vehicules[0] : b.vehicules)?.zone ?? "";
      return za.localeCompare(zb, "fr");
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idx = sorted.findIndex((v: any) => v.id === id);

    // 3. Signatures circuit bons : signatures_situation → user_id → signatures_utilisateurs → signature_url
    const { data: sigsRaw } = await supabase
      .from("signatures_situation")
      .select("role, signe_le, user_id")
      .eq("demande_id", d.demande_id)
      .eq("circuit", "bons");

    const sigEntries: SigEntry[] = [];
    if (sigsRaw && sigsRaw.length > 0) {
      const rows = sigsRaw as { role: string; signe_le: string; user_id: string }[];
      const userIds = rows.map((s) => s.user_id);

      const { data: userSigs } = await supabase
        .from("signatures_utilisateurs")
        .select("user_id, signature_url")
        .in("user_id", userIds);

      const urlByUser: Record<string, string | null> = {};
      for (const u of (userSigs ?? []) as { user_id: string; signature_url: string | null }[]) {
        urlByUser[u.user_id] = u.signature_url;
      }

      for (const s of rows) {
        sigEntries.push({
          role:          s.role,
          signe_le:      s.signe_le,
          signature_url: urlByUser[s.user_id] ?? null,
        });
      }
    }

    console.log('signatures chargées:', sigEntries);

    setBon({
      id:           d.id,
      demande_id:   d.demande_id,
      montant:      d.montant   ?? 0,
      n_liter:      d.n_liter   ?? 0,
      statut:       d.statut    ?? "en_attente",
      matricule:    vehicule?.matricule             ?? "—",
      typeVehicule: vehicule?.vehicule              ?? "—",
      chauffeur:    vehicule?.chauffeur_responsable ?? "—",
      departement:  demande?.departement            ?? "—",
      date:         demande?.created_at
        ? new Date(demande.created_at).toLocaleDateString("fr-FR")
        : "—",
      bonNum: idx >= 0 ? idx + 1 : 1,
    });
    setSigs(sigEntries);
    setLoading(false);
  }

  // ---------------------------------------------------------------------------
  // États de chargement / non trouvé
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-green-600 rounded-full" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4 text-center gap-6">
        <img
          src="/LOGO.webp"
          alt="RIMATEL"
          className="w-24 h-24 object-contain border-2 border-green-700 rounded-lg p-2 bg-white"
        />
        <div className="bg-white rounded-2xl shadow border border-red-200 p-8 max-w-sm w-full">
          <p className="text-5xl mb-3">❌</p>
          <p className="text-xl font-bold text-red-700 mb-2">BON NON VÉRIFIÉ</p>
          <p className="text-sm text-gray-500">
            Ce bon de carburant n'a pas pu être identifié dans le système RIMATEL.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Affichage du bon complet
  // ---------------------------------------------------------------------------

  const isCdpe       = normalizeZone(bon!.departement) === "cpde";
  const dirLine1     = isCdpe ? "Direction Générale" : "Direction Technique";
  const dirLine2     = isCdpe
    ? "La Cellule de Pilotage de déploiement et des extensions"
    : bon!.departement;

  const getSig = (role: string) => sigs.find((s) => s.role === role);

  const fields: [string, string][] = [
    ["Date",                             bon!.date],
    ["Matricule du véhicule",            bon!.matricule],
    ["Type de Voiture",                  bon!.typeVehicule],
    ["Nom du conducteur",                bon!.chauffeur],
    ["Quantité de carburant (Litres)",   formatNumber(bon!.n_liter)],
    ["Montant",                          `${formatNumber(bon!.montant)} MRU`],
    ["Montant en lettres",               numberToWordsFr(bon!.montant)],
    ["Station-service",                  ""],
    ["Signature du responsable Station", ""],
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-green-200 overflow-hidden">

        {/* En-tête : logo | direction | spacer */}
        <div className="flex items-center justify-between gap-4 p-5 border-b-2 border-green-700">
          <img
            src="/LOGO.webp"
            alt="RIMATEL"
            className="w-20 h-20 sm:w-28 sm:h-28 object-contain flex-shrink-0
                       border-2 border-green-700 rounded-lg p-2 bg-white"
          />
          <div className="flex-1 text-center min-w-0">
            <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug">{dirLine1}</p>
            <p className="text-gray-600 text-xs sm:text-sm mt-1 leading-snug">{dirLine2}</p>
            <p className="font-bold text-gray-800 text-xs sm:text-sm mt-2">
              Centre d'appel : 28888882
            </p>
          </div>
          <div className="w-20 sm:w-28 flex-shrink-0" />
        </div>

        {/* Titre du bon */}
        <div className="px-5 py-3 border-b border-dashed border-gray-400">
          <p className="text-center font-bold text-base sm:text-lg uppercase tracking-wide text-gray-900">
            BON DE CARBURANT N° : {bon!.bonNum}
          </p>
        </div>

        {/* Champs */}
        <div className="px-5 divide-y divide-gray-100">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-3 py-2.5">
              <span className="text-xs text-gray-500 flex-shrink-0 w-44 sm:w-52">{label} :</span>
              {value ? (
                <span className="text-sm font-medium text-gray-900 flex-1 break-words">{value}</span>
              ) : (
                <span className="flex-1 border-b border-gray-300 h-4 inline-block" />
              )}
            </div>
          ))}
        </div>

        {/* Signatures */}
        <div className="px-5 pt-5 pb-4 border-t border-gray-200 mt-2">
          <div className="grid grid-cols-3 gap-3">
            {CIRCUIT_BONS.map((step) => {
              const sig = getSig(step.role);
              return (
                <div key={step.role} className="flex flex-col items-center text-center">
                  <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-700 mb-2 leading-tight">
                    {step.label}
                  </p>
                  <div className="w-full h-16 flex items-center justify-center border-b border-gray-400">
                    {sig?.signature_url ? (
                      <img
                        src={sig.signature_url}
                        alt={step.label}
                        crossOrigin="anonymous"
                        className="max-h-14 max-w-full h-auto w-auto object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">Non signé</span>
                    )}
                  </div>
                  {sig?.signe_le && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(sig.signe_le).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Badge d'authenticité */}
        <div className="mx-5 mb-5 mt-3 rounded-xl bg-green-50 border-2 border-green-500 p-4 text-center">
          <p className="text-4xl mb-1">✅</p>
          <p className="font-bold text-base text-green-700">BON AUTHENTIQUE</p>
          <p className="text-xs text-green-600 mt-1">
            Ce bon a été identifié dans le système de gestion carburant RIMATEL.
          </p>
        </div>

      </div>

      <p className="mt-4 text-xs text-gray-400 text-center max-w-xs">
        Vérification effectuée via le système de gestion carburant RIMATEL.
      </p>
    </div>
  );
}
