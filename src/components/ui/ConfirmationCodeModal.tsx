import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface ConfirmationCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "warning";
}

function generateCode() {
  return Array.from({ length: 5 }, () => Math.floor(Math.random() * 10)).join("");
}

export default function ConfirmationCodeModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "danger",
}: ConfirmationCodeModalProps) {
  const [typedCode, setTypedCode] = useState("");
  const [securityCode, setSecurityCode] = useState(generateCode);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTypedCode("");
      setSubmitting(false);
      return;
    }

    setTypedCode("");
    setSecurityCode(generateCode());
  }, [isOpen]);

  const isMatching = useMemo(
    () => typedCode.trim() === securityCode,
    [typedCode, securityCode]
  );

  async function handleConfirm() {
    if (!isMatching) {
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const toneClasses =
    tone === "danger"
      ? {
          badge: "bg-red-50 border-red-200 text-red-800",
          button: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700",
        }
      : {
          badge: "bg-amber-50 border-amber-200 text-amber-800",
          button: "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700",
        };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        <div className={`rounded-xl border p-4 text-sm ${toneClasses.badge}`}>
          {description}
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600 mb-2">
            Pour confirmer, recopiez ce code de securite a 5 chiffres :
          </p>
          <div className="font-mono text-3xl tracking-[0.4em] text-gray-900 text-center select-none">
            {securityCode}
          </div>
        </div>

        <div>
          <label htmlFor="confirmation-code" className="block text-sm font-medium text-gray-700 mb-2">
            Code de confirmation
          </label>
          <input
            id="confirmation-code"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={typedCode}
            onChange={(event) => setTypedCode(event.target.value.replace(/\D/g, "").slice(0, 5))}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 font-mono tracking-[0.3em] text-center"
            placeholder="00000"
            autoFocus
          />
          {!isMatching && typedCode.length > 0 && (
            <p className="mt-2 text-sm text-red-600">Le code saisi ne correspond pas.</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isMatching || submitting}
            className={`px-6 py-3 text-white rounded-xl transition-all duration-200 shadow-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed ${toneClasses.button}`}
          >
            {submitting ? "Verification..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
