import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/supabaseClient";

interface BonInfo {
  matricule: string;
  typeVehicule: string;
  chauffeur: string;
  montant: number;
  litres: number;
  date: string;
  departement: string;
  statut: string;
}

export default function BonVerificationPage() {
  const { id } = useParams<{ id: string }>();
  const [bon, setBon] = useState<BonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function fetchBon() {
      setLoading(true);
      const { data, error } = await supabase
        .from("demande_vehicules")
        .select(`
          id,
          montant,
          n_liter,
          statut,
          demande_id,
          vehicule_id,
          demandes_ravitaillement (
            created_at,
            departement
          ),
          vehicules (
            matricule,
            vehicule,
            chauffeur_responsable
          )
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
      const demande = Array.isArray(d.demandes_ravitaillement)
        ? d.demandes_ravitaillement[0]
        : d.demandes_ravitaillement;
      const vehicule = Array.isArray(d.vehicules)
        ? d.vehicules[0]
        : d.vehicules;

      setBon({
        matricule:    vehicule?.matricule ?? "—",
        typeVehicule: vehicule?.vehicule ?? "—",
        chauffeur:    vehicule?.chauffeur_responsable ?? "—",
        montant:      d.montant ?? 0,
        litres:       d.n_liter ?? 0,
        date:         demande?.created_at
          ? new Date(demande.created_at).toLocaleDateString("fr-FR")
          : "—",
        departement:  demande?.departement ?? "—",
        statut:       d.statut ?? "en_attente",
      });
      setLoading(false);
    }

    void fetchBon();
  }, [id]);

  const isValide = bon?.statut === "valide";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-green-500 rounded-full" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <img src="/rimatel-logo.jpeg" alt="RIMATEL" className="w-20 h-20 object-contain mb-6" />
        <div className="bg-white rounded-2xl shadow border border-red-200 p-8 max-w-sm w-full">
          <p className="text-4xl mb-3">❌</p>
          <p className="text-lg font-bold text-red-700 mb-2">BON NON VÉRIFIÉ</p>
          <p className="text-sm text-gray-500">
            Ce bon de carburant n'a pas pu être identifié dans le système RIMATEL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start px-4 py-8">
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <img src="/rimatel-logo.jpeg" alt="RIMATEL" className="w-20 h-20 object-contain mb-2" />
        <p className="text-sm font-semibold text-gray-600 uppercase tracking-widest">RIMATEL</p>
        <p className="text-xs text-gray-400">Vérification de bon de carburant</p>
      </div>

      {/* Statut badge */}
      <div
        className={`w-full max-w-sm rounded-2xl p-5 mb-5 text-center shadow ${
          isValide
            ? "bg-green-50 border-2 border-green-400"
            : "bg-orange-50 border-2 border-orange-400"
        }`}
      >
        <p className="text-4xl mb-2">{isValide ? "✅" : "❌"}</p>
        <p
          className={`text-lg font-bold ${
            isValide ? "text-green-700" : "text-orange-700"
          }`}
        >
          {isValide ? "BON AUTHENTIQUE" : "BON NON VALIDÉ"}
        </p>
        <p
          className={`text-xs mt-1 ${
            isValide ? "text-green-600" : "text-orange-600"
          }`}
        >
          {isValide
            ? "Ce bon a été validé par la Cellule CSÉ RIMATEL."
            : "Ce bon est en cours de traitement ou n'a pas encore été validé."}
        </p>
      </div>

      {/* Détails du bon */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Détails du bon
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            ["Matricule",    bon?.matricule],
            ["Type véhicule", bon?.typeVehicule],
            ["Chauffeur",    bon?.chauffeur],
            ["Département",  bon?.departement],
            ["Date",         bon?.date],
            ["Litres",       bon ? `${bon.litres.toLocaleString("fr-FR")} L` : "—"],
            ["Montant",      bon ? `${bon.montant.toLocaleString("fr-FR")} MRU` : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-baseline px-5 py-3 gap-4">
              <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
              <span className="text-sm font-medium text-gray-900 text-right">{value ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center max-w-xs">
        Vérification effectuée via le système de gestion carburant RIMATEL.
      </p>
    </div>
  );
}
