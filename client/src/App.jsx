import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { CityProvider } from './context/CityProvider'
import { CartProvider } from './context/CartProvider'
import StoreLayout from './components/StoreLayout'
import SellerLayout from './components/SellerLayout'
import { GuestRoute, ProtectedRoute } from './components/RouteGuards'
import Home from './pages/Home'
import Shop from './pages/Shop'
import ProductDetail from './pages/ProductDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import Cart from './pages/Cart'
import Sell from './pages/Sell'
import SellerLogin from './pages/SellerLogin'
import Apply from './pages/Apply'
import BrandHome from './pages/BrandHome'
import AdminLogin from './pages/AdminLogin'
import AdminHome from './pages/AdminHome'
import NotFound from './pages/NotFound'

const BRAND_ROLES = ['BRAND_ADMIN', 'BRAND_EMPLOYEE']

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CityProvider>
          <CartProvider>
            <Routes>
              {/* Shoppers */}
              <Route element={<StoreLayout />}>
                <Route index element={<Home />} />
                <Route path="shop" element={<Shop />} />
                <Route path="product/:id" element={<ProductDetail />} />

                <Route element={<GuestRoute />}>
                  <Route path="login" element={<Login />} />
                  <Route path="register" element={<Register />} />
                </Route>

                <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
                  <Route path="cart" element={<Cart />} />
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
                <Route element={<ProtectedRoute roles={BRAND_ROLES} loginPath="/sell/login" />}>
                  <Route path="brand" element={<BrandHome />} />
                </Route>
              </Route>

              {/* Super admin: unlinked, no shared layout */}
              <Route element={<GuestRoute />}>
                <Route path="admin/login" element={<AdminLogin />} />
              </Route>
              <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} loginPath="/admin/login" />}>
                <Route path="admin" element={<AdminHome />} />
              </Route>
            </Routes>
          </CartProvider>
        </CityProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App