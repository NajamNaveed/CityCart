import { useEffect, useRef, useState } from 'react'
import { Download, FileUp, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Modal } from '../ui'
import { downloadFile } from '../../utils/download'
import { btnDark, btnOutline } from '../../ui'

const TEMPLATE =
  'name,barcode,sku,price,compareAtPrice,status,quantity,lowStockThreshold,branches\r\n' +
  'Plain White Cotton Suit Length, 2.5 m,,WHITE-001,2400,2800,ACTIVE,20,5,Gulberg Shop|D Ground Shop\r\n'

// Upload a CSV: "Check file" validates every row without saving, "Import" saves the valid ones.
export default function ProductImportModal({ open, onClose, onImported }) {
  const input = useRef(null)
  const report = useRef(null)
  const probed = useRef(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  // AI clean (docs/29 Phase 3b). Hidden entirely when the kill switch answers 503.
  const [aiAvailable, setAiAvailable] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [clean, setClean] = useState(null)
  const [cleanError, setCleanError] = useState('')

  useEffect(() => {
    if (result || error) report.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [result, error])

  useEffect(() => {
    if (!open || probed.current) return
    probed.current = true
    api
      .post('/ai/ping')
      .then(() => setAiAvailable(true))
      .catch((err) => setAiAvailable(err?.response?.status !== 503))
  }, [open])

  function close() {
    setFile(null)
    setResult(null)
    setError('')
    setClean(null)
    setCleanError('')
    onClose()
  }

  function pick(next) {
    setFile(next)
    setResult(null)
    setError('')
    setClean(null)
    setCleanError('')
  }

  // The cleaner never writes: it hands back the same file with the cells fixed,
  // and the shop takes it to the ordinary Check file / Import buttons.
  async function cleanFile() {
    setCleaning(true)
    setCleanError('')
    try {
      const res = await api.post('/ai/csv-clean', await file.text(), {
        headers: { 'Content-Type': 'text/csv' },
      })
      setClean(res.data.data)
      setResult(null)
    } catch (err) {
      setClean(null)
      setCleanError(getErrorMessage(err))
    } finally {
      setCleaning(false)
    }
  }

  function applyCleaned() {
    const base = file.name.replace(/\.csv$/i, '')
    pick(new File([clean.csv], `${base}-cleaned.csv`, { type: 'text/csv' }))
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
      <p className="text-[13.5px] text-ink/55">
        Upload a spreadsheet saved as CSV. New products are added and existing ones (same SKU, or same name) are updated.
        Products without a status are saved as drafts.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-ink/55">
        <li>Required columns: name, price. The name (or barcode) must match a product in the CityCart catalogue, and branches must already exist. Products that are not in the catalogue can be requested from Add product.</li>
        <li>Separate several branches with a | sign. Leave branches empty to sell at all branches. Name, photos and description come from the catalogue.</li>
        <li>Up to 500 products per file.</li>
        <li>CityCart can fix the usual spreadsheet mistakes first — a price written “Rs 2,400”, a status written “live”, a name with two spaces in it — and shows every change before you import anything.</li>
      </ul>
      <button type="button" onClick={() => downloadFile(TEMPLATE, 'products-template.csv')} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-forest underline">
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
          onChange={(e) => pick(e.target.files?.[0] || null)}
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
        {aiAvailable && (
          <button
            type="button"
            disabled={!file || cleaning}
            onClick={cleanFile}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-tile border border-forest/40 bg-forest/5 px-4 text-[13px] font-medium text-forest transition hover:border-forest disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {cleaning ? 'Reading…' : clean ? 'Check again' : 'Clean it up first'}
          </button>
        )}
      </div>

      {aiAvailable && file && !clean && !cleanError && (
        <p className="mt-2 text-xs text-ink/55">
          A messy file — “Rs 2,400” as a price, a status written “live”, two spaces inside a name — can be fixed before it is
          checked. You see every change first and nothing is imported until you say so.
        </p>
      )}

      <div ref={report} aria-live="polite" className="mt-4">
        {error && <p className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">{error}</p>}
        {cleanError && <p className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">{cleanError}</p>}
        {clean && (
          <div className="space-y-3 text-[13.5px]">
            <p className="rounded-md bg-sand/50 px-3.5 py-2.5 text-ink">
              <strong>{clean.summary.cellsChanged}</strong> cells in <strong>{clean.summary.rowsChanged}</strong> of{' '}
              <strong>{clean.summary.rows}</strong> rows would change.{' '}
              <strong>{clean.summary.matched}</strong> rows already name a CityCart product,{' '}
              <strong>{clean.summary.unmatched}</strong> do not. Nothing has been imported yet.
            </p>
            {clean.summary.cellsChanged === 0 && clean.summary.unmatched === 0 && (
              <p className="rounded-md bg-forest/5 px-3.5 py-2.5 text-[13px] text-ink">
                Every row is already written the way CityCart reads it. Check the file and import it as it is.
              </p>
            )}
            {clean.degraded && (
              <p className="rounded-md bg-[#f8efd9] px-3.5 py-2.5 text-[#855811]">
                The assistant could not read every row, so the fixes below are CityCart’s own rules only.
              </p>
            )}
            {clean.warnings.map((w) => (
              <p key={w} className="rounded-md bg-[#f8efd9] px-3.5 py-2.5 text-[#855811]">
                {w}
              </p>
            ))}
            {clean.summary.notAsked > 0 && (
              <p className="text-xs text-ink/55">
                {clean.summary.notAsked} rows with a name CityCart could not find were left for you, because there is a limit to
                how many rows one check reads.
              </p>
            )}
            {clean.ignoredColumns.length > 0 && (
              <p className="text-xs text-ink/55">Columns CityCart does not import, kept in your file: {clean.ignoredColumns.join(', ')}</p>
            )}

            {clean.changes.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-md border border-line-warm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-sand/40 text-[11px] uppercase tracking-[0.1em] text-ink/55">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Column</th>
                      <th className="px-3 py-2">Was</th>
                      <th className="px-3 py-2">Now</th>
                      <th className="px-3 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clean.changes.map((c) => (
                      <tr key={`${c.line}-${c.column}-${c.to}`} className="border-t border-line-warm align-top">
                        <td className="px-3 py-2">{c.line}</td>
                        <td className="px-3 py-2">{c.column}</td>
                        <td className="px-3 py-2 text-ink/55 line-through">{c.from || '(empty)'}</td>
                        <td className="px-3 py-2 font-medium text-ink">{c.to || '(empty)'}</td>
                        <td className="px-3 py-2 text-ink/55">{c.rule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {clean.unmatched.length > 0 && (
              <div>
                <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.1em] text-ink/55">
                  CityCart has no product with these names
                </p>
                <ul className="max-h-40 divide-y divide-line-warm overflow-auto rounded-md border border-line-warm">
                  {clean.unmatched.map((u) => (
                    <li key={u.line} className="px-3 py-2 text-[12.5px]">
                      <span className="text-ink/55">Row {u.line}:</span>{' '}
                      <span className="font-medium text-ink">{u.name || '(no name)'}</span>
                      {u.suggestion && (
                        <span className="text-ink/55">
                          {' '}
                          — it may be “{u.suggestion}”, but CityCart did not find that product either, so the row was left as you
                          wrote it.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-ink/55">
                  These rows will fail the check. Request the product from Add product, or fix the name in your spreadsheet.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={applyCleaned} className={btnDark}>
                Use this file
              </button>
              <button type="button" onClick={() => setClean(null)} className={btnOutline}>
                Keep my file
              </button>
            </div>
          </div>
        )}
        {result && (
          <div className="space-y-3 text-[13.5px]">
            <p className="rounded-md bg-sand/50 px-3.5 py-2.5 text-ink">
              {result.dryRun ? 'Check complete. Nothing was saved yet. ' : 'Import finished. '}
              <strong>{result.created}</strong> {result.dryRun ? 'will be added' : 'added'}, <strong>{result.updated}</strong>{' '}
              {result.dryRun ? 'will be updated' : 'updated'}, <strong>{result.unchanged}</strong> already up to date,{' '}
              <strong>{result.failed}</strong> with problems.
            </p>
            {result.created + result.updated === 0 && result.failed === 0 && result.unchanged > 0 && (
              <p className="rounded-md bg-[#f8efd9] px-3.5 py-2.5 text-[#855811]">
                These products already exist in your shop with exactly these details, so nothing needed to change. To add new products, put each one on a new row with a name or SKU that is not in your shop yet.
              </p>
            )}
            {result.warnings.map((w) => (
              <p key={w} className="rounded-md bg-[#f8efd9] px-3.5 py-2.5 text-[#855811]">
                {w}
              </p>
            ))}
            {result.ignoredColumns.length > 0 && <p className="text-xs text-ink/55">Ignored columns: {result.ignoredColumns.join(', ')}</p>}
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-line-warm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-sand/40 text-[11px] uppercase tracking-[0.1em] text-ink/55">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row} className="border-t border-line-warm align-top">
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
