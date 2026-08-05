/**
 * T025 [US1] — Client HTTP : session par cookie et traitement des 401/403.
 *
 * Un 403 signifie « connecté mais sans permission » : il ne doit surtout pas
 * déconnecter l'utilisateur.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import api from '../services/api'
import { useAuthStore } from '../store/authStore'

beforeEach(() => {
  useAuthStore.setState({ utilisateur: null, statutSession: 'inconnu' })
})

describe('configuration Axios', () => {
  it('transmet les cookies de session', () => {
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('cible le préfixe /api', () => {
    expect(api.defaults.baseURL).toBe('/api')
  })

  it('n’ajoute aucun en-tête Authorization', async () => {
    const config = await Promise.resolve(
      api.interceptors.request.handlers
        .filter(Boolean)
        .reduce(
          (acc, h) => (h.fulfilled ? h.fulfilled(acc) : acc),
          { headers: {}, url: '/membres', method: 'get' }
        )
    )
    expect(config.headers.Authorization).toBeUndefined()
    expect(config.headers.authorization).toBeUndefined()
  })
})

/** Rejoue la chaîne d'intercepteurs de réponse sur une erreur donnée. */
async function jouerErreur(status, code) {
  const erreur = {
    response: { status, data: { code, message: 'x', request_id: 'r' } },
    config: { url: '/membres' },
  }
  const handlers = api.interceptors.response.handlers.filter(Boolean)
  let courant = Promise.reject(erreur)
  for (const h of handlers) {
    courant = courant.catch((e) => (h.rejected ? h.rejected(e) : Promise.reject(e)))
  }
  return courant.then(
    () => ({ rejete: false }),
    (e) => ({ rejete: true, erreur: e })
  )
}

describe('réponse 401', () => {
  it('vide la session locale', async () => {
    useAuthStore.setState({
      utilisateur: { id: 1, nom: 'A', email: 'a@test.local', role: 'admin' },
      statutSession: 'authentifie',
    })

    await jouerErreur(401, 'AUTHENTICATION_REQUIRED')

    expect(useAuthStore.getState().utilisateur).toBeNull()
    expect(useAuthStore.getState().statutSession).toBe('anonyme')
  })

  it('rejette toujours l’erreur pour que l’appelant puisse réagir', async () => {
    const resultat = await jouerErreur(401, 'AUTHENTICATION_REQUIRED')
    expect(resultat.rejete).toBe(true)
  })
})

describe('réponse 403', () => {
  it('conserve la session', async () => {
    const utilisateur = { id: 1, nom: 'A', email: 'a@test.local', role: 'lecteur' }
    useAuthStore.setState({ utilisateur, statutSession: 'authentifie' })

    await jouerErreur(403, 'FORBIDDEN')

    expect(useAuthStore.getState().utilisateur).toEqual(utilisateur)
    expect(useAuthStore.getState().statutSession).toBe('authentifie')
  })

  it('rejette l’erreur sans rediriger', async () => {
    useAuthStore.setState({
      utilisateur: { id: 1, nom: 'A', email: 'a@test.local', role: 'lecteur' },
      statutSession: 'authentifie',
    })
    const resultat = await jouerErreur(403, 'FORBIDDEN')
    expect(resultat.rejete).toBe(true)
    expect(useAuthStore.getState().utilisateur).not.toBeNull()
  })
})

describe('autres statuts', () => {
  it.each([400, 404, 409, 422, 500])('ne touche pas à la session sur %i', async (status) => {
    const utilisateur = { id: 1, nom: 'A', email: 'a@test.local', role: 'admin' }
    useAuthStore.setState({ utilisateur, statutSession: 'authentifie' })

    await jouerErreur(status, 'X')

    expect(useAuthStore.getState().utilisateur).toEqual(utilisateur)
  })
})

describe('store de session', () => {
  it('n’expose aucun jeton', () => {
    const etat = useAuthStore.getState()
    expect(etat).not.toHaveProperty('token')
    expect(etat).not.toHaveProperty('jwt')
  })

  it('expose le message d’erreur adapté à un refus de permission', () => {
    const { messagePourErreur } = useAuthStore.getState()
    expect(messagePourErreur({ response: { status: 403 } })).toMatch(/permission|autoris/i)
    expect(messagePourErreur({ response: { status: 401 } })).toMatch(/session|connect/i)
  })
})
