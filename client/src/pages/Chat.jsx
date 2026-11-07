import ChatPanel from '../components/chat/ChatPanel'
import { PageHeader, shell } from '../design'

// The customer's chat page. Reached from "Chat with seller" on a product
// (/chat?product=<id>) or from the Messages link in the header.
export default function Chat() {
  return (
    <div className="bg-canvas">
      <div className={`${shell} max-w-[1100px] pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Your account"
          title="Messages"
          lede="Questions about a product or an order live here. Sellers reply right in the thread."
          className="mb-6"
        />
        <ChatPanel mode="customer" />
      </div>
    </div>
  )
}
