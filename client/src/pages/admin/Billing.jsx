import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Banknote, FileText, Percent, RefreshCw, WalletCards } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnGhost, card, formatDate } from '../../ui'
import { formatPaisa } from '../../utils/billingUi'
import InvoicesTab from './billing/InvoicesTab'
import ClaimsTab from './billing/ClaimsTab'
import SellersTab from './billing/SellersTab'
import SettingsTab from './billing/SettingsTab'
import HelpTab from './billing/HelpTab'

const TABS = ['Reports', 'Invoices', 'Claims', 'Sellers', 'Settings', 'Help']

const AGEING_LABELS = {
  '-100000': 'Not yet due',
  0: '0–6 days overdue',
  7: '7–13 days overdue',
  14: '14+ days overdue',
  OTHER: 'Older',
}

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="Billing" className="mb-6 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
            active === tab ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className={`${card} p-5`}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  )
}

function Reports({ report }) {
  const buckets = new Map(report.ageing.map((bucket) => [String(bucket.daysOverdueFrom), bucket]))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={WalletCards}
          label="Outstanding"
          value={formatPaisa(report.outstandingPaisa)}
          hint={`${report.outstandingInvoices} unpaid invoice${report.outstandingInvoices === 1 ? '' : 's'}${
            report.oldestDueAt ? ` · oldest due ${formatDate(report.oldestDueAt)}` : ''
          }`}
        />
        <Stat
          icon={AlertTriangle}
          label="Overdue"
          value={formatPaisa(report.overduePaisa)}
          hint="Past the invoice due date."
        />
        <Stat
          icon={Banknote}
          label="Collected this month"
          value={formatPaisa(report.collectedThisMonthPaisa)}
          hint={`${report.claimsThisMonth} verified payment${report.claimsThisMonth === 1 ? '' : 's'}.`}
        />
        <Stat
          icon={Percent}
          label="1% commission to date"
          value={formatPaisa(report.accruedCommissionPaisa)}
          hint={`On ${formatPaisa(report.accruedSalesPaisa)} of completed sales.`}
        />
      </div>

      <div className={`${card} p-5`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <FileText className="h-4.5 w-4.5 text-pine" aria-hidden="true" /> Unpaid by age
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          How long the outstanding balance has been waiting. Sellers move to paused orders, then hidden listings, as it
          ages.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {Object.entries(AGEING_LABELS)
            .filter(([key]) => key !== 'OTHER')
            .map(([key, label]) => {
              const bucket = buckets.get(key)
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                  <span className="text-ink">{label}</span>
                  <span className="flex items-center gap-4">
                    <span className="text-muted">
                      {bucket ? `${bucket.invoices} invoice${bucket.invoices === 1 ? '' : 's'}` : '—'}
                    </span>
                    <span className="w-28 text-right font-medium text-ink">
                      {formatPaisa(bucket?.amountPaisa || 0)}
                    </span>
                  </span>
                </li>
              )
            })}
          {buckets.has('OTHER') && (
            <li className="flex items-center justify-between gap-3 py-3 text-[13px]">
              <span className="text-ink">Other</span>
              <span className="w-28 text-right font-medium text-ink">
                {formatPaisa(buckets.get('OTHER').amountPaisa)}
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

export default function AdminBilling() {
  const [tab, setTab] = useState(TABS[0])
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const loadReports = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/billing/reports')
      setReport(data.report)
      setError('')
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports, version])

  const refresh = () => setVersion((current) => current + 1)

  return (
    <>
      <PageHeader
        title="Billing"
        intro="1% commission, monthly invoices, payments and freezes across every seller."
        action={
          <button type="button" onClick={refresh} className={btnGhost}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        }
      />

      {error && <p className="mb-5 rounded-md bg-clay/5 px-3 py-2 text-sm text-clay">{error}</p>}

      <Tabs active={tab} onChange={setTab} />

      {tab === 'Reports' &&
        (report ? (
          <Reports report={report} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ))}

      {tab === 'Invoices' && <InvoicesTab onChanged={refresh} />}
      {tab === 'Claims' && <ClaimsTab onChanged={refresh} />}
      {tab === 'Sellers' && <SellersTab onChanged={refresh} />}
      {tab === 'Settings' && <SettingsTab onChanged={refresh} />}
      {tab === 'Help' && <HelpTab />}
    </>
  )
}
