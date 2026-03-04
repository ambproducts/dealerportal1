/**
 * ameridex-bootstrap.js v1.1
 * Dynamically loads additional scripts that were missing from the
 * static <script> tags in dealer-portal.html.
 *
 * This file should be added as a <script> tag at the bottom of
 * dealer-portal.html, after all other scripts.
 *
 * It loads (in order):
 *   1. ameridex-print-branding.js  (branded print output with logo)
 *   2. ameridex-ui-fixes.js        (removes redundant Print Quote dropdown)
 *   3. ameridex-version.js         (version badge bottom-left corner)
 *
 * v1.1 (2026-03-04) - Added ameridex-version.js
 * v1.0 (2026-02-25)
 */

(function () {
  'use strict';

  var SCRIPTS_TO_LOAD = [
    'ameridex-print-branding.js',
    'ameridex-ui-fixes.js',
    'ameridex-version.js'
  ];

  var index = 0;

  function loadNext() {
    if (index >= SCRIPTS_TO_LOAD.length) {
      console.log('[ameridex-bootstrap] All scripts loaded successfully.');
      return;
    }

    var src = SCRIPTS_TO_LOAD[index];
    var script = document.createElement('script');
    script.src = src;
    script.onload = function () {
      console.log('[ameridex-bootstrap] Loaded: ' + src);
      index++;
      loadNext();
    };
    script.onerror = function () {
      console.error('[ameridex-bootstrap] FAILED to load: ' + src);
      index++;
      loadNext();
    };
    document.body.appendChild(script);
  }

  loadNext();
})();
