/**
 * ameridex-toast.js — Lightweight toast notification system
 * Usage:
 *   window.showToast('Quote saved successfully', 'success');
 *   window.showToast('Sync failed — will retry', 'error');
 *   window.showToast('Settings updated', 'info');
 */
(function () {
    'use strict';

    var container = null;
    var ICONS = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    function ensureContainer() {
        if (container) return container;
        container = document.createElement('div');
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'false');
        document.body.appendChild(container);
        return container;
    }

    function showToast(message, type, durationMs) {
        type = type || 'info';
        durationMs = durationMs || 3500;

        var wrap = ensureContainer();

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.setAttribute('role', 'status');

        var icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = ICONS[type] || ICONS.info;

        var text = document.createElement('span');
        text.textContent = message;

        var dismiss = document.createElement('button');
        dismiss.className = 'toast-dismiss';
        dismiss.innerHTML = '&times;';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.addEventListener('click', function () {
            removeToast(toast);
        });

        toast.appendChild(icon);
        toast.appendChild(text);
        toast.appendChild(dismiss);
        wrap.appendChild(toast);

        // Trigger entrance animation
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                toast.classList.add('visible');
            });
        });

        // Auto-dismiss
        var timer = setTimeout(function () {
            removeToast(toast);
        }, durationMs);

        toast._timer = timer;
    }

    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        clearTimeout(toast._timer);
        toast.classList.remove('visible');
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 400);
    }

    window.showToast = showToast;
})();
