import { api } from "@/lib/api"

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-6 text-right">{value}</span>
    </div>
  )
}

export default async function SequencesPage() {
  const data = await api.sequences()
  const sequences = data.sequences

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-white mb-1">Sequences</h1>
      <p className="text-sm text-zinc-500 mb-8">Health of each email sequence</p>

      {sequences.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-10 text-center">
          <p className="text-sm text-zinc-500">No sequences have run yet.</p>
          <p className="text-xs text-zinc-700 mt-1">Enroll a contact to see data here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sequences.map((seq) => {
            const total = seq.sent + seq.skipped + seq.failed
            return (
              <div key={seq.sequence_id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-sm font-medium text-white">{seq.sequence_id}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{seq.active} actively enrolled</p>
                  </div>
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">
                    {total} total jobs
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">Sent</p>
                    <Bar value={seq.sent}    max={total} color="bg-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">Skipped</p>
                    <Bar value={seq.skipped} max={total} color="bg-zinc-500" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">Failed</p>
                    <Bar value={seq.failed}  max={total} color="bg-red-500" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}