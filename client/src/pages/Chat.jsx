import ChatPanel from '../components/chat/ChatPanel'
import { wrap } from '../ui'

// The customer's chat page. Reached from "Chat with seller" on a product
// (/chat?product=<id>) or from the Messages link in the header.
export default function Chat() {
  return (
    <div className={`${wrap} py-8 sm:py-10`}>
      <h1 className="font-display mb-5 text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">Messages</h1>
      <ChatPanel mode="customer" />
    </div>
  )
}
