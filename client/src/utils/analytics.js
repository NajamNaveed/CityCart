import { formatPrice } from '../ui'

export const money = (value) => formatPrice(value ?? 0)
export const wholeNumber = (value) => new Intl.NumberFormat().format(value ?? 0)