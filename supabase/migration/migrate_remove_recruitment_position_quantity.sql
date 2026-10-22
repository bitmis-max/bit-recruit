-- Remove the recruitment quota field from positions.
alter table public.recruitment_positions
  drop column if exists quantity;
