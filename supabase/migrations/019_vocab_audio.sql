-- v2 TTS: per-word pronunciation MP3s, generated once via OpenAI TTS and
-- cached in a public Supabase Storage bucket. Frontend plays the audio
-- on tap via a small speaker button on vocab cards and the definition sheet.

alter table vocabulary_words
  add column if not exists audio_path text;

-- Public bucket so the frontend can stream MP3s without auth.
insert into storage.buckets (id, name, public)
values ('vocab-audio', 'vocab-audio', true)
on conflict (id) do nothing;

-- Anyone can read the audio (it's pronunciation, not sensitive).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read vocab-audio'
  ) then
    create policy "public read vocab-audio"
      on storage.objects for select
      using (bucket_id = 'vocab-audio');
  end if;
end $$;
