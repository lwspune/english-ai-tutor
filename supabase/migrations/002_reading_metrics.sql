alter table sessions
  add column if not exists count_omissions    int not null default 0,
  add column if not exists count_substitutions int not null default 0,
  add column if not exists score_phrasing     int not null default 0;
