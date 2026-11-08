import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider } from './context/AuthProvider'
import { CityProvider } from './context/CityProvider'
import { NearbyProvider } from './context/NearbyProvider'
import { CartProvider } from './context/CartProvider'
import { NotificationProvider } from './context/NotificationProvider'
import { ChatProvider } from './context/ChatProvider'
import { Toaster } from './components/ui'
import StoreLayout from './components/StoreLayout'
import SellerLayout from './components/SellerLayout'
import { GuestRoute, NoIndexLayout, ProtectedRoute } from './components/RouteGuards'
import Home from './pages/Home'
import Nearby from './pages/Nearby'
import Sell from './pages/Sell'
import NotFound from './pages/NotFound'

// Reached from a card or a link rather than the initial screen, so these
// route chunks load on demand.
const Brands = lazy(() => import('./pages/Brands'))
const StorePage = lazy(() => import('./pages/StorePage'))
const Services = lazy(() => import('./pages/Services'))
const ServiceProvider = lazy(() => import('./pages/ServiceProvider'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))

// Account, auth and application screens are never on the first screen, so a
// guest reading the shop does not download them.
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const OrderPlaced = lazy(() => import('./pages/OrderPlaced'))
const MyOrders = lazy(() => import('./pages/MyOrders'))
const MyBookings = lazy(() => import('./pages/MyBookings'))
const MyBookingDetail = lazy(() => import('./pages/MyBookingDetail'))
const MyAddresses = lazy(() => import('./pages/MyAddresses'))
const Chat = lazy(() => import('./pages/Chat'))
const MyOrderDetail = lazy(() => import('./pages/MyOrderDetail'))
const SellerLogin = lazy(() => import('./pages/SellerLogin'))
const Apply = lazy(() => import('./pages/Apply'))
const ProviderApply = lazy(() => import('./pages/ProviderApply'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const Notifications = lazy(() => import('./pages/Notifications'))

// The two dashboards load on demand — shoppers never download them.
const DesignSystem = lazy(() => import('./pages/DesignSystem'))
const Help = lazy(() => import('./pages/Help'))
const Contact = lazy(() => import('./pages/Contact'))
const PolicyPage = lazy(() => import('./pages/legal/PolicyPage'))
const BrandLayout = lazy(() => import('./components/brand/BrandLayout'))
const Overview = lazy(() => import('./pages/brand/Overview'))
const BrandProducts = lazy(() => import('./pages/brand/Products'))
const ProductForm = lazy(() => import('./pages/brand/ProductForm'))
const BrandOrders = lazy(() => import('./pages/brand/Orders'))
const BrandMessages = lazy(() => import('./pages/brand/Messages'))
const BrandOrderDetail = lazy(() => import('./pages/brand/OrderDetail'))
const Deliveries = lazy(() => import('./pages/brand/Deliveries'))
const Team = lazy(() => import('./pages/brand/Team'))
const Riders = lazy(() => import('./pages/brand/Riders'))
const BrandBranches = lazy(() => import('./pages/brand/Branches'))
const BrandSettings = lazy(() => import('./pages/brand/Settings'))
const BrandAnalytics = lazy(() => import('./pages/brand/Analytics'))
const InventoryHub = lazy(() => import('./pages/brand/InventoryHub'))
const BrandReviews = lazy(() => import('./pages/brand/Reviews'))
const BrandReturns = lazy(() => import('./pages/brand/Returns'))
const BrandReturnDetail = lazy(() => import('./pages/brand/ReturnDetail'))
const ProviderLayout = lazy(() => import('./components/provider/ProviderLayout'))
const ProviderOverview = lazy(() => import('./pages/provider/Overview'))
const ProviderProfile = lazy(() => import('./pages/provider/Profile'))
const ProviderArea = lazy(() => import('./pages/provider/Area'))
const ProviderOfferings = lazy(() => import('./pages/provider/Offerings'))
const ProviderBookings = lazy(() => import('./pages/provider/Bookings'))
const ProviderBookingDetail = lazy(() => import('./pages/provider/BookingDetail'))
const ProviderAvailability = lazy(() => import('./pages/provider/Availability'))
const ProviderReviews = lazy(() => import('./pages/provider/Reviews'))
const ProviderMessages = lazy(() => import('./pages/provider/Messages'))
const ProviderSettings = lazy(() => import('./pages/provider/Settings'))
const SellerBilling = lazy(() => import('./pages/billing/Billing'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const AdminLanding = lazy(() => import('./pages/admin/Landing'))
const AdminBrands = lazy(() => import('./pages/admin/Brands'))
const AdminBrandDetail = lazy(() => import('./pages/admin/BrandDetail'))
const AdminProviders = lazy(() => import('./pages/admin/Providers'))
const AdminProviderDetail = lazy(() => import('./pages/admin/ProviderDetail'))
const AdminOrders = lazy(() => import('./pages/admin/Orders'))
const AdminOrderDetail = lazy(() => import('./pages/admin/OrderDetail'))
const AdminReturns = lazy(() => import('./pages/admin/Returns'))
const AdminCities = lazy(() => import('./pages/admin/Cities'))
const AdminBlocks = lazy(() => import('./pages/admin/Blocks'))
const AdminCategories = lazy(() => import('./pages/admin/Categories'))
const AdminServiceCategories = lazy(() => import('./pages/admin/ServiceCategories'))
const AdminCatalogue = lazy(() => import('./pages/admin/Catalogue'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminReviews = lazy(() => import('./pages/admin/Reviews'))
const AdminServiceBookings = lazy(() => import('./pages/admin/ServiceBookings'))
const AdminServiceReviews = lazy(() => import('./pages/admin/ServiceReviews'))
const AdminTeam = lazy(() => import('./pages/admin/Team'))
const AdminActivity = lazy(() => import('./pages/admin/Activity'))
const AdminBilling = lazy(() => import('./pages/admin/Billing'))

function RouteFallback() {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">Loading…</div>
}

const BRAND_ROLES = ['BRAND_ADMIN', 'BRAND_EMPLOYEE']

// A brand's public page used to live at /brands/:id; storefronts replaced it.
function RetiredBrandLink() {
  const { id } = useParams()
  return <Navigate to={`/store/${id}`} replace />
}

// Every navigation starts at the top of the new page. 'instant' overrides the
// site's smooth-scroll CSS, which would otherwise animate the jump.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        {/* Notifications need the signed-in user only; its socket lives as long as the session. */}
        <NotificationProvider>
          <ChatProvider>
          <CityProvider>
            <NearbyProvider>
            <CartProvider>
              <Toaster />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                {/* Shoppers */}
                <Route element={<StoreLayout />}>
                  <Route index element={<Home />} />
                  <Route path="brands" element={<Brands />} />
                  <Route path="nearby" element={<Nearby />} />
                  <Route path="store/:id" element={<StorePage />} />

                  {/* Retired URLs from earlier versions of the shop. */}
                  <Route path="shop" element={<Navigate to="/nearby" replace />} />
                  <Route path="brands/:id" element={<RetiredBrandLink />} />
                  <Route path="services" element={<Services />} />
                  <Route path="services/:slug" element={<ServiceProvider />} />
                  <Route path="product/:id" element={<ProductDetail />} />

                  {/* Support and the draft legal pages are public. */}
                  <Route path="help" element={<Help />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="privacy" element={<PolicyPage page="privacy" />} />
                  <Route path="terms" element={<PolicyPage page="terms" />} />
                  <Route path="refund-policy" element={<PolicyPage page="refund-policy" />} />
                  <Route path="seller-agreement" element={<PolicyPage page="seller-agreement" />} />
                  <Route path="provider-agreement" element={<PolicyPage page="provider-agreement" />} />

                  {/* Email links and password recovery work signed in or out. */}
                  <Route element={<NoIndexLayout />}>
                    <Route path="verify-email" element={<VerifyEmail />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="reset-password" element={<ResetPassword />} />
                  </Route>

                  <Route element={<GuestRoute />}>
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                  </Route>

                  <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
                    <Route path="cart" element={<Cart />} />
                    <Route path="checkout" element={<Checkout />} />
                    <Route path="order-placed" element={<OrderPlaced />} />
                    <Route path="orders" element={<MyOrders />} />
                    <Route path="bookings" element={<MyBookings />} />
                    <Route path="bookings/:id" element={<MyBookingDetail />} />
                    <Route path="addresses" element={<MyAddresses />} />
                    <Route path="chat" element={<Chat />} />
                    <Route path="orders/:id" element={<MyOrderDetail />} />
                  </Route>

                  {/* The inbox is personal: any signed-in user may read their own. */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="notifications" element={<Notifications />} />
                  </Route>

                  {/* Dev-only reference for the frozen v3 primitives. */}
                  {import.meta.env.DEV && <Route path="design" element={<DesignSystem />} />}

                  <Route path="*" element={<NotFound />} />
                </Route>

                {/* Sellers */}
                <Route element={<SellerLayout />}>
                  <Route path="sell" element={<Sell />} />
                  <Route element={<GuestRoute />}>
                    <Route path="sell/login" element={<SellerLogin />} />
                    <Route path="sell/apply" element={<Apply />} />
                    <Route path="sell/service/login" element={<SellerLogin portal="service" />} />
                    <Route path="provider/apply" element={<ProviderApply />} />
                  </Route>
                </Route>

                {/* Provider dashboard: its own layout, one provider account */}
                <Route element={<ProtectedRoute roles={['SERVICE_PROVIDER']} loginPath="/sell/service/login" />}>
                  <Route path="provider" element={<ProviderLayout />}>
                    <Route index element={<ProviderOverview />} />
                    <Route path="offerings" element={<ProviderOfferings />} />
                    <Route path="bookings" element={<ProviderBookings />} />
                    <Route path="bookings/:id" element={<ProviderBookingDetail />} />
                    <Route path="availability" element={<ProviderAvailability />} />
                    <Route path="messages" element={<ProviderMessages />} />
                    <Route path="reviews" element={<ProviderReviews />} />
                    <Route path="profile" element={<ProviderProfile />} />
                    <Route path="area" element={<ProviderArea />} />
                    <Route path="settings" element={<ProviderSettings />} />
                    <Route path="billing" element={<SellerBilling />} />
                    <Route path="notifications" element={<Notifications />} />
                  </Route>
                </Route>

                {/* Brand dashboard: its own layout, brand staff only */}
                <Route element={<ProtectedRoute roles={BRAND_ROLES} loginPath="/sell/login" />}>
                  <Route path="brand" element={<BrandLayout />}>
                    <Route index element={<Overview />} />
                    <Route path="products" element={<BrandProducts />} />
                    <Route path="products/new" element={<ProductForm />} />
                    <Route path="products/:id" element={<ProductForm />} />
                    <Route path="orders" element={<BrandOrders />} />
                    <Route path="messages" element={<BrandMessages />} />
                    <Route path="orders/:id" element={<BrandOrderDetail />} />
                    <Route path="deliveries" element={<Deliveries />} />
                    <Route path="returns" element={<BrandReturns />} />
                    <Route path="returns/:id" element={<BrandReturnDetail />} />
                    <Route path="reviews" element={<BrandReviews />} />
                    <Route path="team" element={<Team />} />
                    <Route path="riders" element={<Riders />} />
                    <Route path="analytics" element={<BrandAnalytics />} />
                    <Route element={<ProtectedRoute roles={['BRAND_ADMIN']} loginPath="/sell/login" />}>
                      <Route path="settings" element={<BrandSettings />} />
                      <Route path="branches" element={<BrandBranches />} />
                      <Route path="inventory" element={<InventoryHub />} />
                      <Route path="billing" element={<SellerBilling />} />
                    </Route>
                    <Route path="notifications" element={<Notifications />} />
                  </Route>
                </Route>

                {/* Platform admin: unlinked; the super admin and their partners */}
                <Route element={<GuestRoute />}>
                  <Route path="admin/login" element={<AdminLogin />} />
                </Route>
                <Route element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN_PARTNER']} loginPath="/admin/login" />}>
                  <Route path="admin" element={<AdminLayout />}>
                    <Route index element={<AdminLanding />} />
                    <Route path="brands" element={<AdminBrands />} />
                    <Route path="brands/:id" element={<AdminBrandDetail />} />
                    <Route path="orders" element={<AdminOrders />} />
                    <Route path="orders/:id" element={<AdminOrderDetail />} />
                    <Route path="service-bookings" element={<AdminServiceBookings />} />
                    <Route path="returns" element={<AdminReturns />} />
                    <Route path="reviews" element={<AdminReviews />} />
                    <Route path="service-reviews" element={<AdminServiceReviews />} />
                    <Route path="cities" element={<AdminCities />} />
                    <Route path="blocks" element={<AdminBlocks />} />
                    <Route path="categories" element={<AdminCategories />} />
                    <Route path="service-categories" element={<AdminServiceCategories />} />
                    <Route path="catalogue" element={<AdminCatalogue />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} loginPath="/admin/login" />}>
                      <Route path="providers" element={<AdminProviders />} />
                      <Route path="providers/:id" element={<AdminProviderDetail />} />
                      <Route path="billing" element={<AdminBilling />} />
                      <Route path="team" element={<AdminTeam />} />
                      <Route path="activity" element={<AdminActivity />} />
                    </Route>
                    <Route path="notifications" element={<Notifications />} />
                  </Route>
                </Route>
              </Routes>
              </Suspense>
            </CartProvider>
            </NearbyProvider>
          </CityProvider>
          </ChatProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
