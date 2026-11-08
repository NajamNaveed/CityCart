import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChatPanel from '../components/chat/ChatPanel'
import { PageHeader, Tabs, shell } from '../design'

const TABS = [
  { value: 'all', label: 'All chats' },
  { value: 'stores', label: 'Stores' },
  { value: 'providers', label: 'Service providers' },
]

const isTab = (value) => value === 'stores' || value === 'providers'

/**
 * The customer's chat page. One inbox for store conversations and direct
 * provider conversations; the tab decides which the panel loads. Links from
 * elsewhere pre-select it: /chat?product=<id> opens Stores, /chat?provider=<id>
 * opens Service providers and starts that thread.
 */
export default function Chat() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const derived = params.get('product') ? 'stores' : params.get('provider') ? 'providers' : 'all'
  const tab = isTab(raw) ? raw : derived
  const scope = tab === 'stores' ? 'store' : tab === 'providers' ? 'provider' : 'all'

  // A deep link without ?tab= still needs the tab in the URL: the panel clears
  // ?product / ?provider once the thread is open, and the tab must survive that.
  useEffect(() => {
    if (isTab(raw) || derived === 'all') return
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', derived)
      return next
    }, { replace: true })
  }, [raw, derived, setParams])

  function changeTab(value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('c')
      next.delete('k')
      next.delete('product')
      next.delete('provider')
      if (value === 'all') next.delete('tab')
      else next.set('tab', value)
      return next
    })
  }

  return (
    <div className="bg-canvas">
      <div className={`${shell} max-w-[1100px] pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Your account"
          title="Messages"
          lede="Questions about a product, or a service you want done — sellers and providers reply right in the thread."
          className="mb-6"
        />
        <Tabs items={TABS} value={tab} onChange={changeTab} label="Chat filters" className="mb-4" />
        <ChatPanel key={scope} mode="customer" source={scope} />
      </div>
    </div>
  )
}
