-- คำขอทำงานล่วงเวลา: แยกจาก time_logs เพื่อไม่ให้ OT ที่ยังไม่อนุมัติปนกับค่าแรงปกติ
create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  time_log_id uuid not null references public.time_logs(id) on delete cascade,
  user_id uuid not null references public.users(id),
  ot_start timestamptz not null,
  ot_end timestamptz not null,
  minutes integer not null check (minutes > 0),
  hourly_wage numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  note text,
  constraint overtime_requests_time_log_unique unique (time_log_id),
  constraint overtime_requests_time_order check (ot_end > ot_start)
);

create index if not exists overtime_requests_status_idx
  on public.overtime_requests(status, requested_at desc);

alter table public.overtime_requests enable row level security;

drop policy if exists overtime_requests_read on public.overtime_requests;
create policy overtime_requests_read on public.overtime_requests
  for select to authenticated using (true);

drop policy if exists overtime_requests_insert on public.overtime_requests;
create policy overtime_requests_insert on public.overtime_requests
  for insert to authenticated with check (true);

drop policy if exists overtime_requests_update on public.overtime_requests;
create policy overtime_requests_update on public.overtime_requests
  for update to authenticated using (true) with check (true);
