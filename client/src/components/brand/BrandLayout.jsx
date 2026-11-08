import {
  Bike,
  ChartLine,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Star,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import BillingAlert from '../billing/BillingAlert'
import DashboardLayout from '../dashboard/DashboardLayout'

export default function BrandLayout() {
  const { user } = useAuth()
  const can = useCan()
  const owner = user?.role === 'BRAND_ADMIN'

  const groups = [
    {
      label: 'Daily work',
      items: [
        { to: '/brand', label: 'Overview', end: true, icon: LayoutDashboard },
        can('orders.view') && { to: '/brand/orders', label: 'Orders', icon: Package },
        can('messages.view') && { to: '/brand/messages', label: 'Messages', icon: MessageCircle },
        can('delivery.view') && { to: '/brand/deliveries', label: 'Deliveries', icon: Truck },
        can('delivery.view') && { to: '/brand/returns', label: 'Returns', icon: RotateCcw },
      ],
    },
    {
      label: 'Catalogue',
      items: [
        can('products.view') && { to: '/brand/products', label: 'Products', icon: ShoppingBag },
        can('inventory.manage') && { to: '/brand/inventory', label: 'Quick inventory', icon: Warehouse },
        can('products.view') && { to: '/brand/reviews', label: 'Reviews', icon: Star },
        can('analytics.view') && { to: '/brand/analytics', label: 'Analytics', icon: ChartLine },
      ],
    },
    {
      label: 'Team and settings',
      items: [
        can('employees.view') && { to: '/brand/team', label: 'Team', icon: Users },
        can('riders.view') && { to: '/brand/riders', label: 'Riders', icon: Bike },
        owner && { to: '/brand/branches', label: 'Branches', icon: MapPin },
        owner && { to: '/brand/billing', label: 'Billing', icon: Wallet },
        owner && { to: '/brand/settings', label: 'Settings', icon: Settings },
      ],
    },
  ].map((group) => ({ ...group, items: group.items.filter(Boolean) }))

  const banners = (
    <>
      <BillingAlert billingPath="/brand/billing" />
      {user?.access?.restricted && (
        <div role="alert" className="bg-clay px-4 py-2 text-center text-[13px] text-white">
          This brand has been terminated. The account is read-only until{' '}
          {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}
    </>
  )

  return (
    <DashboardLayout
      kind="brand"
      home="/brand"
      nav={groups}
      shopTo="/"
      shopLabel="View shop"
      banners={banners}
      maxWidth="max-w-[1200px]"
      note={
        <>
          CityCart takes 1% of completed sales. Payouts, invoices and the 7-day due date are explained in{' '}
          <Link to="/brand/billing" className="font-medium text-clay underline-offset-4 hover:underline">
            Billing
          </Link>
          .
        </>
      }
    />
  )
}
