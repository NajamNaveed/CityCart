import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { AnalyticsPage, MetricGrid, StatusList, TrendChart } from '../../components/AnalyticsDashboard'
import { money, wholeNumber } from '../../utils/analytics'

export default function AdminAnalytics() {
  const [range, setRange] = useState({})
  const [appliedRange, setAppliedRange] = useState({})
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/admin/analytics', { params: appliedRange })
      .then(({ data }) => active && setAnalytics(data.analytics))
      .catch((err) => active && setError(getErrorMessage(err)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [appliedRange])

  const summary = analytics?.summary || {}
  return (
    <AnalyticsPage
      title="Platform analytics"
      intro="Marketplace volume, adoption, city performance, and brand sales."
      appliedRange={range}
      onApply={(next) => { setError(''); setLoading(true); setRange(next); setAppliedRange(next) }}
      loading={loading}
      error={error}
    >
      {analytics && (
        <div className="space-y-8">
          <MetricGrid metrics={[
            { label: 'GMV', value: money(summary.gmv), note: `${wholeNumber(summary.deliveredOrders)} delivered orders` },
            { label: 'Orders', value: wholeNumber(summary.orders), note: `${wholeNumber(summary.cancelledOrders)} cancelled` },
            { label: 'Brands', value: wholeNumber(summary.brands), note: `${wholeNumber(summary.activeBrands)} active` },
            { label: 'Customers', value: wholeNumber(summary.customers) },
            { label: 'Products', value: wholeNumber(summary.products) },
            { label: 'Est. commission', value: summary.estimatedCommission == null ? 'Not configured' : money(summary.estimatedCommission), note: summary.commissionRate == null ? '' : `At current ${summary.commissionRate}% default rate` },
          ]} />
          <TrendChart
            title="Marketplace growth by day"
            items={analytics.growthTrend}
            series={[
              { key: 'orders', label: 'Orders', color: 'bg-ink' },
              { key: 'newBrands', label: 'New brands', color: 'bg-clay' },
              { key: 'newCustomers', label: 'New customers', color: 'bg-pine' },
            ]}
          />
          <div className="grid gap-8 lg:grid-cols-2">
            <StatusList title="Order status" items={analytics.orderStatuses} />
            <section className="border-t border-line pt-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Orders by city</h2>
              {analytics.ordersByCity.length === 0 ? <p className="py-4 text-sm text-muted">No orders in this date range.</p> : (
                <ul className="divide-y divide-line">{analytics.ordersByCity.map((city) => <li key={city.cityId || city.city} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-medium text-ink">{city.city}</span><span className="text-xs text-muted">{wholeNumber(city.orders)} orders</span><span className="tabular-nums text-ink">{money(city.gmv)}</span></li>)}</ul>
              )}
            </section>
          </div>
          <section className="border-t border-line pt-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Top-performing brands</h2>
            {analytics.topBrands.length === 0 ? <p className="py-4 text-sm text-muted">No brand sales in this date range.</p> : (
              <ol className="divide-y divide-line">{analytics.topBrands.map((brand, index) => <li key={brand.brandId || brand.brandName} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="w-8 text-xs tabular-nums text-muted">{String(index + 1).padStart(2, '0')}</span><span className="flex-1 font-medium text-ink">{brand.brandName || 'Brand'}</span><span className="text-xs text-muted">{wholeNumber(brand.orders)} orders</span><span className="tabular-nums text-ink">{money(brand.gmv)}</span></li>)}</ol>
            )}
          </section>
        </div>
      )}
    </AnalyticsPage>
  )
}