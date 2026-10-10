import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { AnalyticsPage, MetricGrid, StatusList, TrendChart } from '../../components/AnalyticsDashboard'
import { money, wholeNumber } from '../../utils/analytics'

export default function BrandAnalytics() {
  const [range, setRange] = useState({})
  const [appliedRange, setAppliedRange] = useState({})
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/brand/analytics', { params: appliedRange })
      .then(({ data }) => active && setAnalytics(data.analytics))
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [appliedRange])

  const summary = analytics?.summary || {}
  return (
    <AnalyticsPage
      title="Brand analytics"
      intro="Sales, customers, order flow, and stock health for your brand."
      appliedRange={range}
      onApply={(next) => { setError(''); setLoading(true); setRange(next); setAppliedRange(next) }}
      loading={loading}
      error={error}
    >
      {analytics && (
        <div className="space-y-8">
          <MetricGrid metrics={[
            { label: 'Orders', value: wholeNumber(summary.orders) },
            { label: 'Delivered revenue', value: money(summary.revenue), note: `${wholeNumber(summary.deliveredOrders)} delivered orders` },
            { label: 'Average order value', value: money(summary.averageOrderValue) },
            { label: 'Customers', value: wholeNumber(summary.customers), note: `${wholeNumber(summary.repeatCustomers)} repeat customers` },
            { label: 'Products sold', value: wholeNumber(summary.productsSold) },
            { label: 'Pending orders', value: wholeNumber(summary.pendingOrders) },
            { label: 'Low stock', value: wholeNumber(summary.lowStockProducts) },
            { label: 'Out of stock', value: wholeNumber(summary.outOfStockProducts) },
          ]} />
          <TrendChart title="Daily delivered revenue" items={analytics.salesTrend} series={[{ key: 'revenue', label: 'Revenue', color: 'bg-pine', format: money }]} />
          <div className="grid gap-8 lg:grid-cols-2">
            <StatusList title="Order status" items={analytics.orderStatuses} />
            <StatusList title="Delivery status" items={analytics.deliveryStatuses} />
          </div>
          <section className="border-t border-line pt-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Best-selling products</h2>
            {analytics.topProducts.length === 0 ? <p className="py-4 text-sm text-muted">No delivered product sales in this date range.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.1em] text-muted"><tr><th className="pb-2 font-medium">Product</th><th className="pb-2 text-right font-medium">Units</th><th className="pb-2 text-right font-medium">Revenue</th></tr></thead>
                  <tbody className="divide-y divide-line">{analytics.topProducts.map((product) => <tr key={product.productId}><td className="py-3 font-medium text-ink">{product.productName}</td><td className="py-3 text-right tabular-nums text-muted">{wholeNumber(product.unitsSold)}</td><td className="py-3 text-right tabular-nums text-ink">{money(product.revenue)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="border-t border-line pt-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Inventory alerts</h2>
            {analytics.inventoryAlerts.length === 0 ? <p className="py-4 text-sm text-muted">No low-stock products.</p> : (
              <ul className="divide-y divide-line">{analytics.inventoryAlerts.map((item) => <li key={item.productId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="font-medium text-ink">{item.productName || 'Product'}</span><span className="text-xs uppercase text-warning">{item.status.replaceAll('_', ' ')}</span><span className="text-xs tabular-nums text-muted">{wholeNumber(item.availableQuantity)} available / {wholeNumber(item.quantity)} total</span></li>)}</ul>
            )}
          </section>
        </div>
      )}
    </AnalyticsPage>
  )
}