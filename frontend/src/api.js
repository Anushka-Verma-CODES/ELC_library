const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
export async function api(path, options={}) {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {'Content-Type':'application/json', ...(options.headers||{})},
    ...options
  })
  const data = await response.json().catch(()=>({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}
export const fmt = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—'
export const toLocalInput = date => {
  const p=n=>String(n).padStart(2,'0')
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
