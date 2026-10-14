import ChatPanel from '../../components/chat/ChatPanel'
import { PageHeader } from '../../components/brand/Bits'
import { useCan } from '../../hooks/useCan'

// The seller's inbox: customers' questions, answered for the brand.
export default function Messages() {
  const can = useCan()
  return (
    <>
      <PageHeader title="Messages" intro="Customers' questions about your products. Replies are sent in the name of your brand." />
      <ChatPanel mode="brand" canReply={can('messages.manage')} />
    </>
  )
}
