import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { AnalyticsPage, MetricGrid, StatusList, TrendChart } from '../../components/AnalyticsDashboard'
import { money, wholeNumber } from '../../utils/analytics'

export default function AdminAnalytics() {
  const [range, setRange] = useState({})
  const [appliedRange, setAppliedRange] = useState({})
  const [analytics, setAnalytics] = useState(null)
  const [usage, setUsage] = useState(null)
  const [usageError, setUsageError] = useState('')
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

  // AI usage is a separate read so a failure there never blanks the platform
  // numbers, and it keeps working when the AI kill switch is off.
  useEffect(() => {
    let active = true
    setUsage(null)
    setUsageError('')
    api
      .get('/admin/ai-usage', { params: appliedRange })
      .then(({ data }) => active && setUsage(data.usage))
      .catch((err) => active && setUsageError(getErrorMessage(err)))
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
              { key: 'orders', label: 'Orders', color: 'bg-noir' },
              { key: 'newBrands', label: 'New brands', color: 'bg-clay' },
              { key: 'newCustomers', label: 'New customers', color: 'bg-forest' },
            ]}
          />
          <div className="grid gap-8 lg:grid-cols-2">
            <StatusList title="Order status" items={analytics.orderStatuses} />
            <section className="border-t border-line-warm pt-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Orders by city</h2>
              {analytics.ordersByCity.length === 0 ? <p className="py-4 text-sm text-ink/55">No orders in this date range.</p> : (
                <ul className="divide-y divide-line-warm">{analytics.ordersByCity.map((city) => <li key={city.cityId || city.city} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-medium text-ink">{city.city}</span><span className="text-xs text-ink/55">{wholeNumber(city.orders)} orders</span><span className="tabular-nums text-ink">{money(city.gmv)}</span></li>)}</ul>
              )}
            </section>
          </div>
          <section className="border-t border-line-warm pt-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Top-performing brands</h2>
            {analytics.topBrands.length === 0 ? <p className="py-4 text-sm text-ink/55">No brand sales in this date range.</p> : (
              <ol className="divide-y divide-line-warm">{analytics.topBrands.map((brand, index) => <li key={brand.brandId || brand.brandName} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="w-8 text-xs tabular-nums text-ink/55">{String(index + 1).padStart(2, '0')}</span><span className="flex-1 font-medium text-ink">{brand.brandName || 'Brand'}</span><span className="text-xs text-ink/55">{wholeNumber(brand.orders)} orders</span><span className="tabular-nums text-ink">{money(brand.gmv)}</span></li>)}</ol>
            )}
          </section>
          <section className="border-t border-line-warm pt-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">AI assistant usage</h2>
              <p className="text-xs text-ink/55">A failed request is answered by deterministic text instead.</p>
            </div>
            {usageError ? (
              <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{usageError}</p>
            ) : !usage ? (
              <p className="py-4 text-sm text-ink/55">Loading AI usage…</p>
            ) : usage.totals.requests === 0 ? (
              <p className="py-4 text-sm text-ink/55">No AI requests in this date range.</p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Requests', wholeNumber(usage.totals.requests), `${wholeNumber(usage.totals.users)} users`],
                    ['Success', `${usage.totals.successRate}%`, `${wholeNumber(usage.totals.ok)} answered by a provider`],
                    ['Fallback', `${usage.totals.fallbackRate}%`, `${wholeNumber(usage.totals.failed)} fell back to rules text`],
                    ['Tokens', wholeNumber(usage.totals.totalTokens), `${wholeNumber(usage.totals.promptTokens)} in, ${wholeNumber(usage.totals.completionTokens)} out`],
                  ].map(([label, value, note]) => (
                    <div key={label} className="rounded-tile border border-line-warm bg-paper-warm px-4 py-3">
                      <p className="text-xs text-ink/55">{label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
                      <p className="text-xs text-ink/55">{note}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-line-warm text-left text-xs text-ink/55">
                        <th className="py-2 pr-3 font-medium">Agent</th>
                        <th className="py-2 pr-3 text-right font-medium">Requests</th>
                        <th className="py-2 pr-3 text-right font-medium">Users</th>
                        <th className="py-2 pr-3 text-right font-medium">Success</th>
                        <th className="py-2 pr-3 text-right font-medium">Fallback</th>
                        <th className="py-2 pr-3 text-right font-medium">Retried</th>
                        <th className="py-2 pr-3 text-right font-medium">Tokens</th>
                        <th className="py-2 text-right font-medium">Avg time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-warm">
                      {usage.agents.map((agent) => (
                        <tr key={agent.agent}>
                          <td className="py-2.5 pr-3 font-medium text-ink">{agent.agent}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{wholeNumber(agent.requests)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{wholeNumber(agent.users)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{agent.successRate}%</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{agent.fallbackRate}%</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{agent.retryRate}%</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{wholeNumber(agent.totalTokens)}</td>
                          <td className="py-2.5 text-right tabular-nums">{wholeNumber(agent.avgMs)} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {usage.truncated && <p className="mt-3 text-xs text-ink/55">Showing the newest {wholeNumber(usage.totals.requests)} requests only.</p>}
              </>
            )}
          </section>
        </div>
      )}
    </AnalyticsPage>
  )
}