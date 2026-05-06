import { useMemo, useState } from "react";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import type { ActivityLog } from "@/types";

type ModuleFilter = "ALL" | "auth" | "users" | "vehicules" | "ravitaillements";

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("fr-FR");
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function asObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getModuleLabel(module: string) {
  switch (module) {
    case "auth":
      return "Connexion et securite";
    case "users":
      return "Utilisateurs";
    case "vehicules":
      return "Vehicules";
    case "ravitaillements":
      return "Ravitaillements";
    default:
      return module;
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "CREATE":
      return "Creation";
    case "UPDATE":
      return "Modification";
    case "DELETE":
      return "Suppression";
    case "UPDATE_ROLE":
      return "Changement de role";
    case "UPDATE_STATUT":
      return "Changement de statut";
    case "LOGIN":
      return "Connexion";
    case "LOGOUT":
      return "Deconnexion";
    case "UPDATE_PASSWORD":
      return "Changement de mot de passe";
    default:
      return action;
  }
}

function getActionTone(action: string) {
  switch (action) {
    case "DELETE":
      return "bg-red-100 text-red-800 border border-red-200";
    case "UPDATE":
    case "UPDATE_ROLE":
    case "UPDATE_STATUT":
    case "UPDATE_PASSWORD":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "LOGIN":
    case "LOGOUT":
      return "bg-blue-100 text-blue-800 border border-blue-200";
    case "CREATE":
      return "bg-green-100 text-green-800 border border-green-200";
    default:
      return "bg-gray-100 text-gray-800 border border-gray-200";
  }
}

function getTargetLabel(log: ActivityLog) {
  const beforeData = asObject(log.beforeData);
  const afterData = asObject(log.afterData);
  const source = afterData || beforeData;

  if (!source) {
    return log.targetId || "Element non precise";
  }

  const possibleFields = [
    "vehicule",
    "matricule",
    "email",
    "date",
    "commentaire",
    "id",
  ];

  for (const field of possibleFields) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return log.targetId || "Element non precise";
}

function getSimpleChangeLines(log: ActivityLog) {
  const beforeData = asObject(log.beforeData);
  const afterData = asObject(log.afterData);

  if (!beforeData && !afterData) {
    return [];
  }

  const labels: Record<string, string> = {
    role: "Role",
    statut: "Statut",
    email: "Email",
    nom: "Nom",
    prenom: "Prenom",
    vehicule: "Vehicule",
    matricule: "Matricule",
    zone: "Zone",
    montantRavitaille: "Montant ravitaille",
    nLiter: "Nombre de litres",
    kilometrage: "Kilometrage",
    commentaire: "Commentaire",
    date: "Date",
  };

  const keys = Object.keys(labels);
  const lines: string[] = [];

  for (const key of keys) {
    const beforeValue = beforeData?.[key];
    const afterValue = afterData?.[key];

    if (beforeValue === undefined && afterValue === undefined) {
      continue;
    }

    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      continue;
    }

    if (beforeValue === undefined) {
      lines.push(`${labels[key]} : ${String(afterValue ?? "-")}`);
      continue;
    }

    if (afterValue === undefined) {
      lines.push(`${labels[key]} : ${String(beforeValue ?? "-")}`);
      continue;
    }

    lines.push(
      `${labels[key]} : ${String(beforeValue ?? "-")} -> ${String(afterValue ?? "-")}`
    );
  }

  return lines.slice(0, 4);
}

function getReadableDescription(log: ActivityLog) {
  if (log.description?.trim()) {
    return log.description;
  }

  return `${getActionLabel(log.action)} sur ${getModuleLabel(log.module).toLowerCase()}.`;
}

export default function ActivityLogsPage() {
  const { logs, loading, error, reload } = useActivityLogs();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("ALL");

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return logs.filter((item) => {
      const matchesModule = moduleFilter === "ALL" || item.module === moduleFilter;

      const matchesSearch =
        !normalizedSearch ||
        [
          item.userEmail || "",
          getModuleLabel(item.module),
          getActionLabel(item.action),
          item.description || "",
          getTargetLabel(item),
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      return matchesModule && matchesSearch;
    });
  }, [logs, moduleFilter, search]);

  const stats = {
    total: filteredLogs.length,
    today: filteredLogs.filter((item) => {
      const currentDate = new Date().toISOString().slice(0, 10);
      return item.createdAt.slice(0, 10) === currentDate;
    }).length,
    users: filteredLogs.filter((item) => item.module === "users").length,
    ravitaillements: filteredLogs.filter((item) => item.module === "ravitaillements").length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <span className="text-2xl">L</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Historique des actions</h1>
                <p className="text-gray-600 mt-1">
                  Cette page montre qui a fait quoi, et a quel moment.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void reload()}
              className="bg-gradient-to-r from-green-500 to-teal-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
            >
              Actualiser
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Actions affichees</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Aujourd'hui</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{stats.today}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-sm text-amber-700 font-medium">Actions users</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{stats.users}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-sm text-orange-700 font-medium">Actions ravitaillements</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{stats.ravitaillements}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par utilisateur, action ou element..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white shadow-sm"
              />
            </div>
            <select
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value as ModuleFilter)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
            >
              <option value="ALL">Tous les types</option>
              <option value="auth">Connexion et securite</option>
              <option value="users">Utilisateurs</option>
              <option value="vehicules">Vehicules</option>
              <option value="ravitaillements">Ravitaillements</option>
            </select>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-10 text-center text-gray-600">
              Chargement de l'historique...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-10 text-center">
              <h3 className="text-lg font-medium text-gray-900">Aucune action trouvee</h3>
              <p className="mt-1 text-gray-500">
                Fais une action dans l'application puis reviens ici.
              </p>
            </div>
          ) : (
            filteredLogs.map((item) => {
              const changeLines = getSimpleChangeLines(item);

              return (
                <article
                  key={item.id}
                  className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                          {getModuleLabel(item.module)}
                        </span>
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getActionTone(
                            item.action
                          )}`}
                        >
                          {getActionLabel(item.action)}
                        </span>
                      </div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        {getReadableDescription(item)}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                          <p className="text-gray-500">Utilisateur</p>
                          <p className="font-medium text-gray-900">
                            {item.userEmail || "Utilisateur inconnu"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                          <p className="text-gray-500">Date et heure</p>
                          <p className="font-medium text-gray-900">
                            {formatDateTime(item.createdAt)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                          <p className="text-gray-500">Element concerne</p>
                          <p className="font-medium text-gray-900">{getTargetLabel(item)}</p>
                        </div>
                      </div>

                      {changeLines.length > 0 && (
                        <div className="rounded-xl bg-teal-50 border border-teal-100 px-4 py-3">
                          <p className="text-sm font-medium text-teal-800">
                            Resume des changements
                          </p>
                          <div className="mt-2 space-y-1 text-sm text-teal-900">
                            {changeLines.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      <details className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-gray-700">
                          Voir les details techniques
                        </summary>
                        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Avant</p>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                              {formatJson(item.beforeData) || "-"}
                            </pre>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Apres</p>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                              {formatJson(item.afterData) || "-"}
                            </pre>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
