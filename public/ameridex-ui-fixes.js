/**
 * ameridex-ui-fixes.js v1.0
 * Runtime UI adjustments for the dealer portal.
 *
 * v1.0 (2026-02-25):
 *   - Removes the redundant "Print Quote" dropdown button from the actions row.
 *     The "Print Customer Quote" submit button (in Quick Quote mode) already
 *     triggers the same showPrintPreview('customer') flow.
 *   - Moves the "Download PDF" option to a standalone button in the actions row
 *     so it remains accessible without the dropdown.
 */

(function () {
  'use strict';

  function applyUIFixes() {
    /* ── Remove the Print Quote dropdown ── */
    var printDropdown = document.getElementById('print-dropdown');
    if (!printDropdown) {
      console.warn('[ameridex-ui-fixes] #print-dropdown not found. Skipping removal.');
      return;
    }

    var actionsRow = printDropdown.parentElement;

    /* ── Create standalone Download PDF button ── */
    var pdfBtn = document.createElement('button');
    pdfBtn.type = 'button';
    pdfBtn.className = 'btn btn-ghost';
    pdfBtn.id = 'export-pdf-standalone';
    pdfBtn.textContent = 'Download PDF';
    pdfBtn.onclick = function () {
      if (typeof validateRequired === 'function' && !validateRequired()) return;
      if (typeof generatePDF === 'function') {
        generatePDF();
      } else {
        alert('PDF generation is not available.');
      }
    };

    /* Insert the PDF button where the dropdown was, then remove the dropdown */
    actionsRow.insertBefore(pdfBtn, printDropdown);
    actionsRow.removeChild(printDropdown);

    console.log('[ameridex-ui-fixes] v1.0 applied: Print Quote dropdown removed, Download PDF button added.');
  }

  /* Run after DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyUIFixes);
  } else {
    /* DOM already loaded (script is at bottom of page) */
    applyUIFixes();
  }
})();
