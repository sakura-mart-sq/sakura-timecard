-- Existing projects may still have the old compatibility value.
-- Normalize those rows so the application only uses draft/published.
update public.shifts
set status = 'published'
where status::text = 'closed';
