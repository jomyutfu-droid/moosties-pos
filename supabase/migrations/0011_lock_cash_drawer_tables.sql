-- After the RPC-backed cash UI is deployed, do not expose direct table writes.
-- The RPCs in 0010 enforce the existing PIN-session authorization model.
begin;

drop policy if exists allow_all_authenticated on public.cash_sessions;
drop policy if exists allow_all_authenticated on public.cash_movements;
revoke all on public.cash_sessions from anon, authenticated;
revoke all on public.cash_movements from anon, authenticated;

revoke execute on function public.open_cash_session(text,numeric) from anon;
revoke execute on function public.get_cash_session_summary(text,integer) from anon;
revoke execute on function public.get_cash_movements(text,uuid) from anon;
revoke execute on function public.add_cash_movement(text,uuid,text,numeric,text) from anon;
revoke execute on function public.close_cash_session(text,uuid,numeric,text) from anon;

commit;
