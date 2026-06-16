import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Intercepteur — ajoute le token automatiquement
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('carbiran_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auth
export const apiLogin = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const apiMe = () =>
  api.get('/auth/me').then(r => r.data)

export const apiLogout = () =>
  api.post('/auth/logout').then(r => r.data)

// Demandes
export const apiGetDemandes = () =>
  api.get('/demandes').then(r => r.data)

export const apiGetDemande = (id: string) =>
  api.get(`/demandes/${id}`).then(r => r.data)

export const apiCreateDemande = (data: any) =>
  api.post('/demandes', data).then(r => r.data)

export const apiUpdateDemande = (id: string, data: any) =>
  api.patch(`/demandes/${id}`, data).then(r => r.data)

export const apiDeleteDemande = (id: string) =>
  api.delete(`/demandes/${id}`).then(r => r.data)

// Véhicules
export const apiGetVehicules = () =>
  api.get('/vehicules').then(r => r.data)

export const apiCreateVehicule = (data: any) =>
  api.post('/vehicules', data).then(r => r.data)

export const apiUpdateVehicule = (id: string, data: any) =>
  api.patch(`/vehicules/${id}`, data).then(r => r.data)

export const apiDeleteVehicule = (id: string) =>
  api.delete(`/vehicules/${id}`).then(r => r.data)

// Ravitaillements
export const apiGetRavitaillements = () =>
  api.get('/ravitaillements').then(r => r.data)

export const apiCreateRavitaillement = (data: any) =>
  api.post('/ravitaillements', data).then(r => r.data)

export const apiUpdateRavitaillement = (id: string, data: any) =>
  api.patch(`/ravitaillements/${id}`, data).then(r => r.data)

export const apiDeleteRavitaillement = (id: string) =>
  api.delete(`/ravitaillements/${id}`).then(r => r.data)

// Véhicules d'une demande
export const apiReplaceDemandeVehicules = (demandeId: string, vehicule_ids: number[]) =>
  api.patch(`/demandes/${demandeId}/vehicules`, { vehicule_ids }).then(r => r.data)

export const apiPatchDemandeVehicule = (demandeId: string, dvId: string, data: Record<string, unknown>) =>
  api.patch(`/demandes/${demandeId}/vehicules/${dvId}`, data).then(r => r.data)

// Signatures
export const apiGetSignatures = (demandeId: string) =>
  api.get(`/signatures/${demandeId}`).then(r => r.data)

export const apiSigner = (data: any) =>
  api.post('/signatures', data).then(r => r.data)

export const apiGetSignatureUtilisateur = () =>
  api.get('/signatures/utilisateur/me').then(r => r.data)

export const apiUploadSignature = (file: File, circuitRole?: string) => {
  const form = new FormData()
  form.append('signature', file)
  if (circuitRole) form.append('circuit_role', circuitRole)
  return api.post('/signatures/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

// Notifications
export const apiGetNotifications = () =>
  api.get('/notifications').then(r => r.data)

export const apiMarquerLu = (id: string) =>
  api.patch(`/notifications/${id}/lu`).then(r => r.data)

export const apiMarquerToutesLues = () =>
  api.patch('/notifications/all/lu').then(r => r.data)

// Users (Admin uniquement)
export const apiGetUsers = () =>
  api.get('/auth/users').then(r => r.data)

export const apiCreateUser = (data: any) =>
  api.post('/auth/users', data).then(r => r.data)

export const apiUpdateUser = (id: string, data: any) =>
  api.patch(`/auth/users/${id}`, data).then(r => r.data)

export const apiDeleteUser = (id: string) =>
  api.delete(`/auth/users/${id}`).then(r => r.data)

// Activity logs
export const apiGetLogs = () =>
  api.get('/logs').then(r => r.data)

export const apiWriteLog = (data: any) =>
  api.post('/logs', data).then(r => r.data)

// Bon vérification (public)
export const apiGetBon = (dvId: string) =>
  api.get(`/demandes/bons/${dvId}`).then(r => r.data)

// Storage
export const apiUploadPhoto = (file: File, demandeVehiculeId: string, type: string) => {
  const form = new FormData()
  form.append('photo', file)
  form.append('demande_vehicule_id', demandeVehiculeId)
  form.append('type', type)
  return api.post('/storage/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export default api
