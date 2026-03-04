/**
 * ameridex-version.js v1.0
 *
 * Displays the portal version number in a subtle fixed badge
 * at the bottom-left corner of the screen.
 *
 * Fetches from GET /api/version so the version string is
 * always in sync with package.json (single source of truth).
 *
 * Loaded via ameridex-bootstrap.js. No HTML edits required.
 *
 * v1.0 (2026-03-04)
 */
(function () {
    'use strict';

    function createBadge(version) {
        var badge = document.createElement('div');
        badge.id = 'ameridex-version-badge';
        badge.textContent = 'v' + version;
        badge.style.cssText = [
            'position: fixed',
            'bottom: 10px',
            'left: 12px',
            'font-size: 0.7rem',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'color: #94a3b8',
            'background: rgba(255,255,255,0.85)',
            'padding: 2px 8px',
            'border-radius: 4px',
            'pointer-events: none',
            'user-select: none',
            'z-index: 9999',
            'opacity: 0',
            'transition: opacity 0.4s ease'
        ].join(';');

        document.body.appendChild(badge);

        // Fade in
        requestAnimationFrame(function () {
            badge.style.opacity = '1';
        });
    }

    function fetchVersion() {
        fetch('/api/version')
            .then(function (res) {
                if (!res.ok) throw new Error('status ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data && data.version) {
                    createBadge(data.version);
                    console.log('[ameridex-version] Portal version: ' + data.version);
                }
            })
            .catch(function (err) {
                console.warn('[ameridex-version] Could not fetch version:', err.message);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fetchVersion);
    } else {
        fetchVersion();
    }
})();
