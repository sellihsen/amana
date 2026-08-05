import axios from 'axios'
import { useAuthStore } from '../store/authStore'

/**
 * Client HTTP unique de l'application.
 *
 * La session voyage dans un cookie HttpOnly : `withCredentials` suffit, et
 * aucun en-tête `Authorization` n'est construit ici — le code de la page n'a
 * jamais accès au jeton, ce qui est précisément l'objectif.
 */
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (reponse) => reponse,
  (erreur) => {
    const statut = erreur?.response?.status

    // 401 : la session est absente, expirée ou révoquée → on nettoie l'état
    // local. La redirection est laissée aux gardes de routage, qui savent où
    // se trouve l'utilisateur.
    if (statut === 401) {
      useAuthStore.getState().effacerSession()
    }

    // 403 : l'utilisateur EST connecté mais n'a pas la permission. Le
    // déconnecter serait faux et lui ferait perdre son travail.

    return Promise.reject(erreur)
  }
)

export default api
