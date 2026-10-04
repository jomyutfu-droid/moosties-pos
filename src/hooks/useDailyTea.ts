import { useQuery } from '@tanstack/react-query'
import { useSessionStore } from '@/store/session'
import { dailyTeaAction, type TeaData } from '@/lib/dailyTea'
export function useDailyTea(date?: string) {
  const token = useSessionStore(s => s.pinSessionToken)
  return useQuery({ queryKey: ['daily-tea', token, date], queryFn: () => dailyTeaAction<TeaData>(token, 'load', {date}), enabled: !!token, refetchInterval: 30_000 })
}
