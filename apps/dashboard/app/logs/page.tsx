import { api } from "@/lib/api"

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    sent:    "bg-emerald-900/50 text-emerald-400",
    skipped: "bg-zinc-800 text-zinc-400",
    failed:  "bg-red-900/50 text-red-400",
  }
  return `text-xs px-2 py-0.5 rounded-full ${styles[status] ?? "bg-zinc-800 text-zinc-400"}`
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; sequence_id?: string }
}) {
  const page        = Number(searchParams.page ?? 1)
  const status      = searchParams.status
  const sequence_id = searchParams.sequence_id

  const data = await api.logs(page, status, sequence_id)

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-white mb-1">Delivery logs</h1>
      <p className="text-sm text-zinc-500 mb-2">
        {data.total.toLocaleString()} total entries
      </p>

      {/* Filter bar */}
      <div className="flex gap-3 mb-6 text-xs">
        {["", "sent", "skipped", "failed"].map((s) => (
          <a
            key={s}
            href={s ? `/logs?status=${s}` : "/logs"}
            className={`px-3 py-1.5 rounded-full border transition-colors ${
              (status ?? "") === s
                ? "border-zinc-500 text-white bg-zinc-800"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s || "All"}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {data.logs.length === 0 ? (
          <p className="text-sm text-zinc-600 px-5 py-8 text-center">No logs found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Sequence</th>
                <th className="text-left px-5 py-3 font-medium">Step</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Reason</th>
                <th className="text-left px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log, i) => (
                <tr key={i} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40">
                  <td className="px-5 py-3 text-zinc-300">{log.email}</td>
                  <td className="px-5 py-3 text-zinc-400">{log.sequence_id}</td>
                  <td className="px-5 py-3 text-zinc-400">{log.step_id}</td>
                  <td className="px-5 py-3">
                    <span className={statusBadge(log.status)}>{log.status}</span>
                  </td>
                  <td className="px-5 py-3 text-zinc-600 max-w-xs truncate">{log.reason ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-600 text-xs whitespace-nowrap">
                    {new Date(log.attempted_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div className="flex gap-2 mt-5 justify-end">
          {page > 1 && (
            <a
              href={`/logs?page=${page - 1}${status ? `&status=${status}` : ""}`}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white"
            >
              Previous
            </a>
          )}
          <span className="text-xs px-3 py-1.5 text-zinc-600">
            Page {page} of {data.total_pages}
          </span>
          {page < data.total_pages && (
            <a
              href={`/logs?page=${page + 1}${status ? `&status=${status}` : ""}`}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white"
            >
              Next
            </a>
          )}
        </div>
      )}
    </div>
  )
}