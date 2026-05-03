import { api } from "@/lib/api"

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-3xl font-semibold text-white">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-zinc-600 mt-1">{sub}</p>}
    </div>
  )
}

function statusColor(status: string) {
  if (status === "sent")    return "text-emerald-400"
  if (status === "failed")  return "text-red-400"
  if (status === "skipped") return "text-zinc-500"
  return "text-zinc-400"
}

export default async function OverviewPage() {
  const data = await api.overview()

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-white mb-1">Overview</h1>
      <p className="text-sm text-zinc-500 mb-8">Live snapshot of your drip engine</p>

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard label="Total contacts"    value={data.contacts}        />
        <StatCard label="Active enrolled"   value={data.active_enrolled} />
        <StatCard label="Sent today"        value={data.sent_today}      sub="last 24 hours" />
        <StatCard label="Total sent"        value={data.total_sent}      />
        <StatCard label="Total skipped"     value={data.total_skipped}   />
        <StatCard label="Total failed"      value={data.total_failed}    />
        <StatCard label="Unenrolled"        value={data.unenrolled}      />
      </div>

      {/* Recent activity */}
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Recent activity</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {data.recent_activity.length === 0 ? (
          <p className="text-sm text-zinc-600 px-5 py-6">No activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Sequence</th>
                <th className="text-left px-5 py-3 font-medium">Step</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_activity.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-300">{row.email}</td>
                  <td className="px-5 py-3 text-zinc-400">{row.sequence_id}</td>
                  <td className="px-5 py-3 text-zinc-400">{row.step_id}</td>
                  <td className={`px-5 py-3 font-medium ${statusColor(row.status)}`}>{row.status}</td>
                  <td className="px-5 py-3 text-zinc-600 text-xs">
                    {new Date(row.attempted_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}