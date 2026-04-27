const WHISPER_COST_PER_MINUTE = 0.006
const GPT_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000
const GPT_OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000

export function computeSessionCost({ whisper_duration_seconds, llm_input_tokens, llm_output_tokens }) {
  const hasWhisper = whisper_duration_seconds != null
  const hasGpt = llm_input_tokens != null || llm_output_tokens != null

  if (!hasWhisper && !hasGpt) return null

  const whisperCost = hasWhisper
    ? (whisper_duration_seconds / 60) * WHISPER_COST_PER_MINUTE
    : 0

  const gptCost = hasGpt
    ? (llm_input_tokens ?? 0) * GPT_INPUT_COST_PER_TOKEN +
      (llm_output_tokens ?? 0) * GPT_OUTPUT_COST_PER_TOKEN
    : 0

  return whisperCost + gptCost
}

export function formatCost(usd) {
  if (usd === null || usd === undefined) return '—'
  return `$${usd.toFixed(4)}`
}
