// Map layer buttons cycle everything -> mine -> hidden -> everything.
export const nextLayerState = (state) => (state === 'all' ? 'mine' : state === 'mine' ? 'off' : 'all')
