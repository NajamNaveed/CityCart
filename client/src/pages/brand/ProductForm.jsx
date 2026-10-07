import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import Field from '../../components/Field'
import ImageUploader from '../../components/brand/ImageUploader'
import { Notice, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnPine, inputClass } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

const STATUS_OPTIONS = [
  ['ACTIVE', 'Active: visible in the shop'],
  ['DRAFT', 'Draft: hidden while you work on it'],
  ['INACTIVE', 'Inactive: hidden for now'],
]

function toForm(product, inventory) {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    compareAtPrice: product?.compareAtPrice != null ? String(product.compareAtPrice) : '',
    sku: product?.sku ?? '',
    categoryId: product?.categoryId ?? '',
    status: product && product.status !== 'ARCHIVED' ? product.status : 'ACTIVE',
    quantity: String(inventory?.quantity ?? 0),
    lowStockThreshold: String(inventory?.lowStockThreshold ?? 0),
  }
}

function FormBody({ id, product, inventory, categories }) {
  const navigate = useNavigate()
  const location = useLocation()
  const can = useCan()
  const canSave = can(id ? 'products.update' : 'products.create')
  const canArchive = can('products.delete')
  const initial = toForm(product, inventory)
  const [form, setForm] = useState(initial)
  const [images, setImages] = useState(product?.images ?? [])
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const archived = product?.status === 'ARCHIVED'
  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSaving(true)

    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      categoryId: form.categoryId,
      images,
      status: form.status,
      // Left out when empty: the API cannot clear these once set.
      ...(form.sku.trim() && { sku: form.sku.trim() }),
      ...(form.compareAtPrice !== '' && { compareAtPrice: Number(form.compareAtPrice) }),
    }

    let productId = id
    try {
      if (id) {
        await api.patch(`/products/${id}`, payload)
      } else {
        productId = (await api.post('/products', payload)).data.product._id
      }
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // Stock is its own record: only written when it changed (or for a brand-new product with stock).
    const stockChanged = form.quantity !== initial.quantity || form.lowStockThreshold !== initial.lowStockThreshold
    if (stockChanged) {
      try {
        await api.patch(`/inventory/${productId}`, {
          quantity: Number(form.quantity),
          lowStockThreshold: Number(form.lowStockThreshold),
        })
      } catch (err) {
        navigate(`/brand/products/${productId}`, {
          replace: true,
          state: { notice: `The product was saved, but stock could not be updated: ${getErrorMessage(err)}`, tone: 'warn' },
        })
        return
      }
    }
    navigate('/brand/products', { state: { notice: id ? 'Product saved.' : 'Product added.' } })
  }

  async function archive() {
    setSaving(true)
    try {
      await api.delete(`/products/${id}`)
      navigate('/brand/products', { state: { notice: 'Product archived. It is no longer shown in the shop.' } })
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
      setConfirmArchive(false)
    }
  }

  return (
    <>
      <PageHeader
        title={id ? 'Edit product' : 'Add product'}
        intro={archived ? 'This product is archived and hidden from the shop.' : undefined}
        action={
          <Link
            to="/brand/products"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition hover:border-ink"
          >
            Back to products
          </Link>
        }
      />
      <Notice tone={location.state?.tone}>{location.state?.notice}</Notice>

      {!canSave && (
        <p className="mb-6 rounded-md bg-paper px-3.5 py-2.5 text-sm text-muted">You can view this product but not change it.</p>
      )}

      <form onSubmit={onSubmit} className="max-w-3xl space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
            {error}
          </p>
        )}

        <fieldset disabled={!canSave} className="min-w-0 space-y-5">
        <fieldset className="grid gap-5 rounded-lg border border-line bg-white p-6">
          <legend className="sr-only">Details</legend>
          <div className="sm:col-span-2">
            <Field label="Name" id="name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea id="description" name="description" rows={5} value={form.description} onChange={onChange} className={`${inputClass} py-3`} />
          </div>
          <div>
            <label htmlFor="categoryId" className={labelClass}>
              Category
            </label>
            <select id="categoryId" name="categoryId" value={form.categoryId} onChange={onChange} className={`h-11 ${inputClass} ${fieldErrors.categoryId ? 'border-clay' : ''}`} required>
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && <p className="mt-1.5 text-xs text-clay">{fieldErrors.categoryId}</p>}
            {categories.length === 0 && (
              <p className="mt-1.5 text-xs text-muted">
                You need a category first.{' '}
                <Link to="/brand/categories" className="font-medium text-pine underline">
                  Create one
                </Link>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="status" className={labelClass}>
              Visibility
            </label>
            <select id="status" name="status" value={form.status} onChange={onChange} className={`h-11 ${inputClass}`}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="grid gap-5 rounded-lg border border-line bg-white p-6 sm:grid-cols-3">
          <legend className="sr-only">Pricing</legend>
          <Field label="Price (PKR)" id="price" name="price" type="number" min="0" step="0.01" value={form.price} onChange={onChange} error={fieldErrors.price} required />
          <Field label="Compare-at price" id="compareAtPrice" name="compareAtPrice" type="number" min="0" step="0.01" value={form.compareAtPrice} onChange={onChange} error={fieldErrors.compareAtPrice} hint="Optional. Shows a discount." />
          <Field label="SKU" id="sku" name="sku" value={form.sku} onChange={onChange} error={fieldErrors.sku} hint="Optional." />
        </fieldset>

        <fieldset className="grid gap-5 rounded-lg border border-line bg-white p-6 sm:grid-cols-2">
          <legend className="sr-only">Stock</legend>
          <Field label="Quantity in stock" id="quantity" name="quantity" type="number" min="0" step="1" value={form.quantity} onChange={onChange} />
          <Field label="Low stock warning at" id="lowStockThreshold" name="lowStockThreshold" type="number" min="0" step="1" value={form.lowStockThreshold} onChange={onChange} hint="Flagged as low stock at or below this number." />
        </fieldset>

        <div className="rounded-lg border border-line bg-white p-6">
          <p className={labelClass}>Photos</p>
          <ImageUploader images={images} onChange={setImages} name={form.name || 'Product'} />
        </div>

        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          {canSave && (
            <button type="submit" disabled={saving} className={btnPine}>
              {saving ? 'Saving…' : id ? 'Save changes' : 'Add product'}
            </button>
          )}
          {id && !archived && canArchive && !confirmArchive && (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="inline-flex h-11 items-center rounded-md border border-danger/40 bg-white px-5 text-[13px] font-medium text-danger transition hover:border-danger"
            >
              Archive product
            </button>
          )}
          {id && !archived && canArchive && confirmArchive && (
            <span className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft px-3.5 py-2 text-sm">
              <span className="text-ink">Hide this product from the shop?</span>
              <button
                type="button"
                onClick={archive}
                disabled={saving}
                className="inline-flex h-8 items-center rounded-md bg-danger px-3 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Yes, archive
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[12.5px] font-medium text-ink transition hover:border-ink"
              >
                Cancel
              </button>
            </span>
          )}
        </div>
      </form>
    </>
  )
}

export default function ProductForm() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState({ key: null, product: null, inventory: null, categories: [], error: '' })
  const key = id || 'new'

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/categories', { params: { brandId: user.brandId } }),
      id ? api.get(`/products/mine/${id}`) : Promise.resolve(null),
    ])
      .then(([cats, prod]) => {
        if (active) {
          setData({ key, categories: cats.data.categories, product: prod?.data.product ?? null, inventory: prod?.data.inventory ?? null, error: '' })
        }
      })
      .catch((err) => active && setData({ key, product: null, inventory: null, categories: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [id, key, user.brandId])

  if (data.key !== key)
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    )
  if (data.error) return <p className="text-clay">{data.error}</p>
  return <FormBody key={key} id={id} product={data.product} inventory={data.inventory} categories={data.categories} />
}