import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { CityProvider } from './context/CityProvider'
import { CartProvider } from './context/CartProvider'
import StoreLayout from './components/StoreLayout'
import { GuestRoute, ProtectedRoute } from './components/RouteGuards'
import Home from './pages/Home'
import Shop from './pages/Shop'
import ProductDetail from './pages/ProductDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import Cart from './pages/Cart'
import NotFound from './pages/NotFound'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CityProvider>
          <CartProvider>
            <Routes>
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
            </Routes>
          </CartProvider>
        </CityProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App