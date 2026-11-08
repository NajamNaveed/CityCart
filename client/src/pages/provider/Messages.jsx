import { Link } from 'react-router-dom'
import ChatPanel from '../../components/chat/ChatPanel'
import { PageHeader } from '../../components/brand/Bits'
import { textLink } from '../../design'

// Direct conversations with customers. A conversation about a specific job
// still lives inside that booking, which is why the note below links back.
export default function ProviderMessages() {
  return (
    <>
      <PageHeader
        title="Messages"
        intro="Customers can ask you about a job before booking. Replies are private between you and that customer."
      />
      <ChatPanel mode="provider" source="provider" />
      <p className="mt-4 text-[12.5px] text-ink/55">
        A conversation about a specific booking stays in that booking —{' '}
        <Link to="/provider/bookings" className={textLink}>
          open Bookings
        </Link>
        .
      </p>
    </>
  )
}
