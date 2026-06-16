import { useState, useEffect, useRef } from "react";
import { useAuthContext } from "@/context/AuthProvider";
import { useSignatures, getCircuitRole } from "@/hooks/useSignatures";

export default function UploadSignaturePage() {
  const { user } = useAuthContext();
  const { fetchSignatureUtilisateur, uploadSignatureUtilisateur } = useSignatures();

  const [currentUrl, setCurrentUrl]   = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
  const [file, setFile]               = useState<File | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [success, setSuccess]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const inputRef                      = useRef<HTMLInputElement>(null);

  const circuitRole = user ? getCircuitRole(user.role, user.circuit_role) : null;

  // Charge la signature existante
  useEffect(() => {
    void fetchSignatureUtilisateur().then((sig) => {
      if (sig?.signature_url) setCurrentUrl(sig.signature_url);
    });
  }, [fetchSignatureUtilisateur]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) return;
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setSuccess(false);
    setError(null);
  }

  async function handleUpload() {
    if (!file || !circuitRole) return;
    setUploading(true);
    setError(null);
    setSuccess(false);
    try {
      const url = await uploadSignatureUtilisateur(file, circuitRole);
      setCurrentUrl(`${url}?t=${Date.now()}`);
      setPreviewUrl(null);
      setFile(null);
      setSuccess(true);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'upload.");
    } finally {
      setUploading(false);
    }
  }

  if (!circuitRole) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <p className="text-gray-500">Vous n'êtes pas autorisé à enregistrer une signature.</p>
      </div>
    );
  }

  const ROLE_LABELS: Record<string, string> = {
    chef_departement:      "Chef Département",
    chef_cellule:          "Chef Cellule CSÉ",
    directeur_technique:   "Directeur Technique",
    directeur_general:     "Directeur Général",
    directrice_financiere: "Directrice Financière",
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900">Ma signature</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rôle de signature : <strong>{ROLE_LABELS[circuitRole] ?? circuitRole}</strong>
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Uploadez une image de votre signature manuscrite (JPG ou PNG, fond blanc de préférence).
          Elle sera apposée automatiquement sur les documents lors de la validation du circuit.
        </p>
      </div>

      {/* Signature actuelle */}
      {currentUrl && (
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Signature enregistrée</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-center">
            <img
              src={currentUrl}
              alt="Ma signature"
              className="max-h-24 max-w-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6 space-y-4">
        <p className="text-sm font-semibold text-gray-700">
          {currentUrl ? "Remplacer ma signature" : "Enregistrer ma signature"}
        </p>

        {/* Zone de drop / sélection */}
        <label
          htmlFor="sig-file"
          className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-teal-400 hover:bg-teal-50 cursor-pointer transition-colors"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Aperçu" className="max-h-28 max-w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-400">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm">Cliquer pour choisir une image</span>
              <span className="text-xs text-gray-300">JPG, PNG — fond blanc recommandé</span>
            </div>
          )}
        </label>
        <input
          id="sig-file"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg"
          className="sr-only"
          onChange={handleFileChange}
        />

        {previewUrl && (
          <button
            type="button"
            onClick={() => { setPreviewUrl(null); setFile(null); }}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Supprimer la sélection
          </button>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            Signature enregistrée avec succès.
          </p>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Enregistrement…" : "Enregistrer ma signature"}
        </button>
      </div>

      <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80" />
    </div>
  );
}
