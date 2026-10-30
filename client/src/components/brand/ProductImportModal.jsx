import { useEffect, useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Modal } from '../ui'
import { downloadFile } from '../../utils/download'
import { btnDark, btnOutline } from '../../ui'

const TEMPLATE =
  'name,sku,category,price,compareAtPrice,status,quantity,lowStockThreshold,description,images,branches\r\n' +
  'Sample Lawn Suit,LAWN-001,Lawn Collection,4500,5200,ACTIVE,20,5,"Soft 3-piece lawn",https://example.com/photo.jpg,Gulberg Shop|D Ground Shop\r\n'

// Upload a CSV: "Check file" validates every row without saving, "Import" saves the valid ones.
export default function ProductImportModal({ open, onClose, onImported }) {
  const input = useRef(null)
  const report = useRef(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Bring the result into view: it appears below the buttons, possibly off screen.
  useEffect(() => {
    if (result || error) report.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [result, error])

  function close() {
    setFile(null)
    setResult(null)
    setError('')
    onClose()
  }

  async function send(dryRun) {
    setBusy(true)
    setError('')
    try {
      const text = await file.text()
      const res = await api.post('/products/import', text, {
        params: dryRun ? { dryRun: 'true' } : undefined,
        headers: { 'Content-Type': 'text/csv' },
      })
      setResult(res.data)
      if (!dryRun && res.data.created + res.data.updated > 0) onImported()
    } catch (err) {
      setResult(null)
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Import products from CSV" maxWidth="max-w-2xl">
      <p className="text-[13.5px] text-muted">
        Upload a spreadsheet saved as CSV. New products are added and existing ones (same SKU, or same name) are updated.
        Products without a status are saved as drafts.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-muted">
        <li>Required columns: name, category, price. The category must be a CityCart category (use its name); branches must already exist.</li>
        <li>Separate several photos or branches with a | sign. Leave branches empty to sell at all branches.</li>
        <li>Up to 500 products per file.</li>
      </ul>
      <button type="button" onClick={() => downloadFile(TEMPLATE, 'products-template.csv')} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-pine underline">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download a template
      </button>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id="csv-file"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null)
            setResult(null)
            setError('')
          }}
        />
        <label htmlFor="csv-file" className={`${btnOutline} cursor-pointer`}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          {file ? 'Choose another file' : 'Choose CSV file'}
        </label>
        {file && <span className="truncate text-[13px] text-ink">{file.name}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={!file || busy} onClick={() => send(true)} className={btnOutline}>
          Check file
        </button>
        <button type="button" disabled={!file || busy} onClick={() => send(false)} className={btnDark}>
          {busy ? 'Working…' : 'Import'}
        </button>
      </div>

      <div ref={report} aria-live="polite" className="mt-4">
        {error && <p className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">{error}</p>}
        {result && (
          <div className="space-y-3 text-[13.5px]">
            <p className="rounded-md bg-paper px-3.5 py-2.5 text-ink">
              {result.dryRun ? 'Check complete. Nothing was saved yet. ' : 'Import finished. '}
              <strong>{result.created}</strong> {result.dryRun ? 'will be added' : 'added'}, <strong>{result.updated}</strong>{' '}
              {result.dryRun ? 'will be updated' : 'updated'}, <strong>{result.unchanged}</strong> already up to date,{' '}
              <strong>{result.failed}</strong> with problems.
            </p>
            {result.created + result.updated === 0 && result.failed === 0 && result.unchanged > 0 && (
              <p className="rounded-md bg-warning-soft px-3.5 py-2.5 text-warning">
                These products already exist in your shop with exactly these details, so nothing needed to change. To add new products, put each one on a new row with a name or SKU that is not in your shop yet.
              </p>
            )}
            {result.warnings.map((w) => (
              <p key={w} className="rounded-md bg-warning-soft px-3.5 py-2.5 text-warning">
                {w}
              </p>
            ))}
            {result.ignoredColumns.length > 0 && <p className="text-xs text-muted">Ignored columns: {result.ignoredColumns.join(', ')}</p>}
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-line">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-paper/60 text-[11px] uppercase tracking-[0.1em] text-muted">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row} className="border-t border-line align-top">
                        <td className="px-3 py-2">{e.row}</td>
                        <td className="px-3 py-2">{e.name || '(no name)'}</td>
                        <td className="px-3 py-2 text-clay">{e.messages.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
