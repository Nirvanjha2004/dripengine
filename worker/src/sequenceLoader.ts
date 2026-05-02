import * as fs from "fs"
import * as path from "path"
import * as yaml from "js-yaml"

// Read from env if it exists, otherwise default to local relative path
const SEQUENCES_DIR = process.env.SEQUENCES_DIR ?? path.resolve(__dirname, "../../sequences")

const cache: Record<string, any> = {}

/**
 * Loads a sequence YAML file by ID.
 * Cached in memory after first load.
 */
export function loadSequence(sequenceId: string): any | null {
  if (cache[sequenceId]) return cache[sequenceId]

  const filePath = path.join(SEQUENCES_DIR, `${sequenceId}.yaml`)
  if (!fs.existsSync(filePath)) return null

  const data = yaml.load(fs.readFileSync(filePath, "utf8"))
  cache[sequenceId] = data
  return data
}

/**
 * Finds a specific step inside a sequence by its ID.
 */
export function findStep(sequence: any, stepId: string): any | null {
  return sequence.steps?.find((s: any) => s.id === stepId) ?? null
}