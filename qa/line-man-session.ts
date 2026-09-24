const state = { activeStaff: {role:'owner',branch_id:null}, pinSessionToken:'fixture-not-a-real-token' }
export function useSessionStore(selector?: (s: typeof state) => unknown) { return selector ? selector(state) : state }
