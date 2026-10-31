import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
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
import { GuestRoute, ProtectedRoute } from './components/RouteGuards'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Brands from './pages/Brands'
import Nearby from './pages/Nearby'
import ProductDetail from './pages/ProductDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderPlaced from './pages/OrderPlaced'
import MyOrders from './pages/MyOrders'
import Chat from './pages/Chat'
import MyOrderDetail from './pages/MyOrderDetail'
import Sell from './pages/Sell'
import SellerLogin from './pages/SellerLogin'
import Apply from './pages/Apply'
import AdminLogin from './pages/AdminLogin'
import Notifications from './pages/Notifications'
import NotFound from './pages/NotFound'

// The two dashboards load on demand — shoppers never download them.
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
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const AdminLanding = lazy(() => import('./pages/admin/Landing'))
const AdminBrands = lazy(() => import('./pages/admin/Brands'))
const AdminBrandDetail = lazy(() => import('./pages/admin/BrandDetail'))
const AdminOrders = lazy(() => import('./pages/admin/Orders'))
const AdminOrderDetail = lazy(() => import('./pages/admin/OrderDetail'))
const AdminCities = lazy(() => import('./pages/admin/Cities'))
const AdminBlocks = lazy(() => import('./pages/admin/Blocks'))
const AdminCategories = lazy(() => import('./pages/admin/Categories'))
const AdminCatalogue = lazy(() => import('./pages/admin/Catalogue'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminReviews = lazy(() => import('./pages/admin/Reviews'))
const AdminTeam = lazy(() => import('./pages/admin/Team'))
const AdminActivity = lazy(() => import('./pages/admin/Activity'))

function RouteFallback() {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">Loading…</div>
}

const BRAND_ROLES = ['BRAND_ADMIN', 'BRAND_EMPLOYEE']

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
                  <Route path="shop" element={<Shop />} />
                  <Route path="brands" element={<Brands />} />
                  <Route path="nearby" element={<Nearby />} />
                  <Route path="product/:id" element={<ProductDetail />} />

                  <Route element={<GuestRoute />}>
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                  </Route>

                  <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
                    <Route path="cart" element={<Cart />} />
                    <Route path="checkout" element={<Checkout />} />
                    <Route path="order-placed" element={<OrderPlaced />} />
                    <Route path="orders" element={<MyOrders />} />
                    <Route path="chat" element={<Chat />} />
                    <Route path="orders/:id" element={<MyOrderDetail />} />
                  </Route>

                  {/* The inbox is personal: any signed-in user may read their own. */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="notifications" element={<Notifications />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Route>

                {/* Sellers */}
                <Route element={<SellerLayout />}>
                  <Route path="sell" element={<Sell />} />
                  <Route element={<GuestRoute />}>
                    <Route path="sell/login" element={<SellerLogin />} />
                    <Route path="sell/apply" element={<Apply />} />
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
                    <Route path="reviews" element={<BrandReviews />} />
                    <Route path="team" element={<Team />} />
                    <Route path="riders" element={<Riders />} />
                    <Route path="analytics" element={<BrandAnalytics />} />
                    <Route element={<ProtectedRoute roles={['BRAND_ADMIN']} loginPath="/sell/login" />}>
                      <Route path="settings" element={<BrandSettings />} />
                      <Route path="branches" element={<BrandBranches />} />
                      <Route path="inventory" element={<InventoryHub />} />
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
                    <Route path="reviews" element={<AdminReviews />} />
                    <Route path="cities" element={<AdminCities />} />
                    <Route path="blocks" element={<AdminBlocks />} />
                    <Route path="categories" element={<AdminCategories />} />
                    <Route path="catalogue" element={<AdminCatalogue />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} loginPath="/admin/login" />}>
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
