"use client"
import { useState } from "react"

interface Timeline {
  contact: { email: string; name: string; timezone: string; properties: Record<string, unknown> }
  enrollments: { sequence_id: string; status: string; current_step: string; enrolled_at: string }[]
  events: { event_name: string; fired_at: string }[]
  delivery: { sequence_id: string; step_id: string; status: string; reason: string; attempted_at: string }[]
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    sent:      "bg-emerald-900/50 text-emerald-400",
    skipped:   "bg-zinc-800 text-zinc-400",
    failed:    "bg-red-900/50 text-red-400",
    active:    "bg-blue-900/50 text-blue-400",
    unenrolled:"bg-zinc-800 text-zinc-500",
  }
  return `text-xs px-2 py-0.5 rounded-full ${styles[status] ?? "bg-zinc-800 text-zinc-400"}`
}

export default function ContactsPage() {
  const [email, setEmail]       = useState("")
  const [query, setQuery]       = useState("")
  const [data, setData]         = useState<Timeline | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    setError("")
    setData(null)
    try {
      const res = await fetch(`/api/contact?email=${encodeURIComponent(query)}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.detail ?? "Not found")
        return
      }
      setData(await res.json())
    } catch {
      setError("Failed to reach API")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-white mb-1">Contacts</h1>
      <p className="text-sm text-zinc-500 mb-8">Search for a contact to see their full timeline</p>

      {/* Search bar */}
      <div className="flex gap-3 mb-8 max-w-lg">
        <input
          type="email"
          placeholder="john@gmail.com"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={search}
          disabled={loading}
          className="bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-6">{error}</p>
      )}

      {data && (
        <div className="flex flex-col gap-6">

          {/* Contact card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 mb-3">Contact</p>
            <p className="text-base font-medium text-white">{data.contact.name ?? data.contact.email}</p>
            <p className="text-sm text-zinc-500">{data.contact.email} · {data.contact.timezone}</p>
            {Object.keys(data.contact.properties).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(data.contact.properties).map(([k, v]) => (
                  <span key={k} className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Enrollments */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 mb-3">Enrollments ({data.enrollments.length})</p>
            {data.enrollments.length === 0 ? (
              <p className="text-sm text-zinc-600">None</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.enrollments.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-white">{e.sequence_id}</span>
                      <span className="text-xs text-zinc-600 ml-2">step: {e.current_step}</span>
                    </div>
                    <span className={statusBadge(e.status)}>{e.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 mb-3">Events fired ({data.events.length})</p>
            {data.events.length === 0 ? (
              <p className="text-sm text-zinc-600">None</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.events.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-white font-mono">{e.event_name}</span>
                    <span className="text-xs text-zinc-600">{new Date(e.fired_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery timeline */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 mb-3">Delivery history ({data.delivery.length})</p>
            {data.delivery.length === 0 ? (
              <p className="text-sm text-zinc-600">None</p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.delivery.map((d, i) => (
                  <div key={i} className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-white">{d.step_id}
                        <span className="text-zinc-600 ml-1 text-xs">in {d.sequence_id}</span>
                      </p>
                      {d.reason && <p className="text-xs text-zinc-600 mt-0.5">{d.reason}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={statusBadge(d.status)}>{d.status}</span>
                      <span className="text-xs text-zinc-700">{new Date(d.attempted_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}