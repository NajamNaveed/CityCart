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
import Checkout from './pages/Checkout'
import OrderPlaced from './pages/OrderPlaced'
import MyOrders from './pages/MyOrders'
import MyOrderDetail from './pages/MyOrderDetail'
import Sell from './pages/Sell'
import SellerLogin from './pages/SellerLogin'
import Apply from './pages/Apply'
import BrandLayout from './components/brand/BrandLayout'
import Overview from './pages/brand/Overview'
import BrandProducts from './pages/brand/Products'
import ProductForm from './pages/brand/ProductForm'
import Categories from './pages/brand/Categories'
import Orders from './pages/brand/Orders'
import OrderDetail from './pages/brand/OrderDetail'
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
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="order-placed" element={<OrderPlaced />} />
                  <Route path="orders" element={<MyOrders />} />
                  <Route path="orders/:id" element={<MyOrderDetail />} />
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
                  <Route path="categories" element={<Categories />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
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