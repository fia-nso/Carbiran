import { useEffect, useMemo, useRef, useState } from "react";
import type { Vehicule } from "@/types";

interface SearchableVehiculeSelectProps {
  vehicules: Vehicule[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function buildVehiculeLabel(vehicule: Vehicule) {
  return `${vehicule.vehicule} - ${vehicule.matricule}`;
}

export default function SearchableVehiculeSelect({
  vehicules,
  value,
  onChange,
  disabled = false,
}: SearchableVehiculeSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedVehicule = useMemo(
    () => vehicules.find((item) => String(item.id) === value) || null,
    [value, vehicules]
  );

  useEffect(() => {
    if (selectedVehicule) {
      setQuery(buildVehiculeLabel(selectedVehicule));
      return;
    }

    setQuery("");
  }, [selectedVehicule]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        if (selectedVehicule) {
          setQuery(buildVehiculeLabel(selectedVehicule));
        } else {
          setQuery("");
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedVehicule]);

  const filteredVehicules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return vehicules;
    }

    return vehicules.filter((item) =>
      [
        item.vehicule,
        item.matricule,
        item.chauffeurResponsable || "",
        item.zone,
      ].some((field) => field.toLowerCase().includes(normalizedQuery))
    );
  }, [query, vehicules]);

  function handleSelect(vehicule: Vehicule) {
    onChange(String(vehicule.id));
    setQuery(buildVehiculeLabel(vehicule));
    setIsOpen(false);
  }

  function handleInputChange(nextValue: string) {
    setQuery(nextValue);
    setIsOpen(true);

    if (!nextValue.trim()) {
      onChange("");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => handleInputChange(event.target.value)}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
        placeholder="Rechercher par vehicule, matricule ou chauffeur..."
      />

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {filteredVehicules.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">
                Aucun vehicule ne correspond a la recherche.
              </div>
            ) : (
              filteredVehicules.map((vehicule) => (
                <button
                  key={vehicule.id}
                  type="button"
                  onClick={() => handleSelect(vehicule)}
                  className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors duration-150 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">
                    {vehicule.vehicule}
                  </div>
                  <div className="text-sm text-gray-500">
                    {vehicule.matricule}
                    {vehicule.chauffeurResponsable
                      ? ` - ${vehicule.chauffeurResponsable}`
                      : ""}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
