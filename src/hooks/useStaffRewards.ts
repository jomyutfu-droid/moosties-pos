import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getPinSessionToken } from '@/hooks/useAuth'
import { useSessionStore } from '@/store/session'

export type StaffRewardType = 'grab_review' | 'sales_volume' | 'closing_ot'
export type StaffRewardStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface StaffReward {
  id: string
  branch_id: string | null
  user_id: string
  user_name: string
  reward_date: string
  reward_type: StaffRewardType
  quantity: number
  amount: number
  status: StaffRewardStatus
  details_json: Record<string, unknown>
  requested_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  paid_by: string | null
  paid_at: string | null
  created_at: string
}

async function fetchStaffRewards(params: { from: string | null; to: string | null; status: StaffRewardStatus | null }): Promise<StaffReward[]> {
  const { data, error } = await supabase.rpc('get_staff_rewards', { p_token: getPinSessionToken(), p_from: params.from, p_to: params.to, p_status: params.status })
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, quantity: Number(row.quantity ?? 0), amount: Number(row.amount ?? 0), details_json: (row.details_json ?? {}) as Record<string, unknown> })) as StaffReward[]
}

export function useStaffRewards(from: string | null, to: string | null, status: StaffRewardStatus | null = null, enabled = true) {
  const token = useSessionStore((s) => s.pinSessionToken)
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  return useQuery({ queryKey: ['staff-rewards', activeStaffId, from, to, status], queryFn: () => fetchStaffRewards({ from, to, status }), enabled: Boolean(token && activeStaffId && enabled), refetchInterval: 30_000 })
}
export function usePendingStaffRewards(enabled = true) { return useStaffRewards(null, null, 'pending', enabled) }
export function useMyStaffRewards(from: string | null, to: string | null, enabled = true) {
  const activeStaffId = useSessionStore((s) => s.activeStaff?.id)
  const query = useStaffRewards(from, to, null, enabled)
  return { ...query, data: query.data?.filter((reward) => reward.user_id === activeStaffId) }
}
export function useRecordGrabReward() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (p: { userId: string; rewardDate: string; quantity: number }) => {
    const { data, error } = await supabase.rpc('record_grab_reward', { p_token: getPinSessionToken(), p_user_id: p.userId, p_reward_date: p.rewardDate, p_quantity: p.quantity })
    if (error) throw error
    return (Array.isArray(data) ? data[0] : data) as StaffReward
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-rewards'] }) })
}
export function useSubmitClosingOt() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (p: { rewardDate: string; orderAt: string; leftAt: string; note: string | null }) => {
    const { data, error } = await supabase.rpc('submit_closing_ot_reward', { p_token: getPinSessionToken(), p_reward_date: p.rewardDate, p_order_at: p.orderAt, p_left_at: p.leftAt, p_note: p.note })
    if (error) throw error
    return (Array.isArray(data) ? data[0] : data) as StaffReward
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-rewards'] }) })
}
export function useReviewStaffReward() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (p: { id: string; status: 'approved' | 'rejected' }) => {
    const { data, error } = await supabase.rpc('review_staff_reward', { p_token: getPinSessionToken(), p_id: p.id, p_status: p.status })
    if (error) throw error
    return (Array.isArray(data) ? data[0] : data) as StaffReward
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-rewards'] }) })
}
export function useMarkStaffRewardsPaid() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (p: { from: string; to: string; userId?: string | null }) => {
    const { data, error } = await supabase.rpc('mark_staff_rewards_paid', { p_token: getPinSessionToken(), p_from: p.from, p_to: p.to, p_user_id: p.userId ?? null })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return { updatedCount: Number(row?.updated_count ?? 0), totalAmount: Number(row?.total_amount ?? 0) }
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-rewards'] }) })
}
