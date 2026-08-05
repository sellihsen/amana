import { FileSpreadsheet, FileText } from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { projeter } from '../utils/export'

/**
 * Exports XLSX et PDF.
 *
 * Les deux formats consomment la MÊME projection : ce qui est exporté est
 * exactement la collection filtrée affichée à l'écran, avec le même format de
 * montant et de date.
 */

function exporterExcel({ data, columns, filename }) {
  const { entetes, corpsTableur } = projeter(data, columns)

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([entetes, ...corpsTableur])

  // Format monétaire natif : la valeur reste un nombre exact, seul l'affichage
  // est francisé.
  const indicesEur = columns
    .map((c, i) => (c.format === 'eur' ? i : -1))
    .filter((i) => i >= 0)

  for (let ligne = 1; ligne <= corpsTableur.length; ligne += 1) {
    for (const colonne of indicesEur) {
      const adresse = XLSX.utils.encode_cell({ r: ligne, c: colonne })
      if (ws[adresse]) {
        ws[adresse].t = 'n'
        ws[adresse].z = '#,##0.00 €'
      }
    }
  }

  ws['!cols'] = columns.map((c) => ({ wch: c.width || 20 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Données')

  // `bookSST` conserve les chaînes Unicode telles quelles (accents, tirets
  // cadratins, symbole €).
  XLSX.writeFile(wb, `${filename || 'export'}.xlsx`, { bookSST: false, type: 'binary' })
}

function exporterPDF({ data, columns, filename, title }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const { entetes, corps } = projeter(data, columns)

  doc.setFontSize(16)
  doc.text(title || 'Export', 14, 20)

  doc.setFontSize(9)
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 28)

  autoTable(doc, {
    startY: 34,
    head: [entetes],
    body: corps,
    theme: 'striped',
    headStyles: { fillColor: [34, 113, 78], fontSize: 9 },
    styles: {
      fontSize: 8,
      // Helvetica couvre le latin-1 étendu : accents français et € sont rendus
      // correctement sans police externe.
      font: 'helvetica',
      overflow: 'linebreak',
    },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.format === 'eur') acc[i] = { halign: 'right' }
      return acc
    }, {}),
  })

  doc.save(`${filename || 'export'}.pdf`)
}

export default function ExportButtons({ data, columns, filename, title }) {
  if (!data || data.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => exporterExcel({ data, columns, filename, title })}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
      >
        <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Exporter en </span>Excel
      </button>
      <button
        type="button"
        onClick={() => exporterPDF({ data, columns, filename, title })}
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
      >
        <FileText className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Exporter en </span>PDF
      </button>
    </div>
  )
}
