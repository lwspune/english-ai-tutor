alter table sessions
  add column whisper_duration_seconds numeric,
  add column llm_input_tokens int,
  add column llm_output_tokens int;
