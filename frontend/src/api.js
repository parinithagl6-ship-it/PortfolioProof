const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the API. Check that the server is running and MongoDB is connected.')
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const fieldErrors = Array.isArray(data.errors)
      ? data.errors.map(({ field, message }) => [field, message].filter(Boolean).join(': ')).filter(Boolean)
      : []
    const error = new Error(
      fieldErrors.length
        ? fieldErrors.join(' ')
        : data.message || `Request failed (${response.status}).`,
    )
    error.status = response.status
    error.errors = data.errors || []
    throw error
  }
  return data
}

export const api = {
  health: () => request('/health'),
  me: () => request('/auth/me'),
  register: (details) => request('/auth/register', { method: 'POST', body: JSON.stringify(details) }),
  login: (details) => request('/auth/login', { method: 'POST', body: JSON.stringify(details) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  requestPasswordReset: (email) => request('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  resetPassword: (details) => request('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(details),
  }),
  oauthUrl: (provider, returnTo = window.location.href) => {
    const url = new URL(`${API_BASE}/auth/${provider}`, window.location.origin)
    url.searchParams.set('returnTo', returnTo)
    return url.toString()
  },
  publicPortfolio: (username = '') => request(`/portfolio${username ? `/${encodeURIComponent(username)}` : ''}`),
  chat: (messages) => request('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  dashboard: () => request('/dashboard/stats'),
  skills: () => request('/skills'),
  projects: () => request('/projects'),
  saveSkill: (skill) => request(skill._id ? `/skills/${skill._id}` : '/skills', {
    method: skill._id ? 'PUT' : 'POST',
    body: JSON.stringify(skill),
  }),
  deleteSkill: (id) => request(`/skills/${id}`, { method: 'DELETE' }),
  saveProject: (project) => request(project._id ? `/projects/${project._id}` : '/projects', {
    method: project._id ? 'PUT' : 'POST',
    body: JSON.stringify(project),
  }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
}