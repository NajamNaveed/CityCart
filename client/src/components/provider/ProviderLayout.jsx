import { Link } from 'react-router-dom'
import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  MapPin,
  Settings,
  Sparkles,
  Star,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import BillingAlert from '../billing/BillingAlert'
import DashboardLayout from '../dashboard/DashboardLayout'

const groups = [
  {
    label: 'Work',
    items: [
      { to: '/provider', label: 'Overview', end: true, icon: LayoutDashboard },
      { to: '/provider/bookings', label: 'Bookings', icon: CalendarClock },
      { to: '/provider/offerings', label: 'Services and prices', icon: Wrench },
      { to: '/provider/availability', label: 'Working hours', icon: CalendarDays },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/provider/reviews', label: 'Reviews', icon: Star },
      { to: '/provider/billing', label: 'Billing', icon: Wallet },
    ],
  },
  {
    label: 'Service profile',
    items: [
      { to: '/provider/profile', label: 'Profile and details', icon: Settings },
      { to: '/provider/area', label: 'Service area', icon: MapPin },
    ],
  },
]

export default function ProviderLayout() {
  const { user } = useAuth()
  const pending = user?.provider?.status === 'PENDING'
  const publicPage = user?.provider?.slug ? `/services/${user.provider.slug}` : '/services'

  const banners = (
    <>
      <BillingAlert billingPath="/provider/billing" />
      {pending && (
        <div className="flex items-center justify-center gap-2 bg-[#f8efd9] px-4 py-2 text-center text-[13px] text-[#855811]">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your application is waiting for CityCart review. Customers cannot find you yet.
        </div>
      )}
    </>
  )

  return (
    <DashboardLayout
      kind="provider"
      home="/provider"
      nav={groups}
      shopTo={publicPage}
      shopLabel="View public page"
      banners={banners}
      maxWidth="max-w-[1120px]"
      note={
        <>
          Customers see your starting price, then agree the job with you. CityCart takes 1% of completed bookings — see{' '}
          <Link to="/provider/billing" className="font-medium text-clay underline-offset-4 hover:underline">
            Billing
          </Link>
          .
        </>
      }
    />
  )
}
