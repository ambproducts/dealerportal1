// ============================================================
// AmeriDex Dealer Portal - Advanced Deck Calculator v1.0
// File: ameridex-deck-calculator.js
// Date: 2026-02-28
// ============================================================
// Replaces the basic deck calculator with a full optimization
// engine that recommends standard AND custom board lengths,
// auto-calculates screws and plugs, and pushes all line items
// to the order on Accept.
//
// Key improvements over inline calculator:
//   - Multi-option comparison (12', 16', 20', custom)
//   - Custom length rounding: whole foot preferred, .5' when
//     it saves significant waste
//   - Screw calculation: boardRows x joists x 2 per crossing
//   - Plug calculation: 1 plug per screw (face screw systems)
//   - Pushes boards + screws + plugs + picture frame + stairs
//   - Fixes waste percentage bug (ternary was inverted)
// ============================================================

(function () {
    'use strict';

    // === CONSTANTS ===
    var BOARD_WIDTH_INCH = 5.5;
    var GAP_INCH = 0.125;
    var EFFECTIVE_FT = (BOARD_WIDTH_INCH + GAP_INCH) / 12; // 0.46875 ft
    var STD_LENGTHS = [12, 16, 20];
    var SCREWS_PER_BOX = 375;
    var PLUGS_PER_BOX = 375;
    var SCREWS_PER_CROSSING = 2;

    // === STATE ===
    var currentCalcResult = null;
    var selectedOptionIndex = null;

    // === CUSTOM LENGTH ROUNDING ===
    // Whole foot by default. Uses .5' only when rounding to the
    // next whole foot would waste more than 0.5' per board.
    function getCustomLength(spanFt) {
        if (spanFt <= 0) return 0;
        // Already on a 0.5 boundary
        if (spanFt % 0.5 === 0) return spanFt;
        var ceilWhole = Math.ceil(spanFt);
        var wasteWhole = ceilWhole - spanFt;
        // If rounding up to whole foot wastes <= 6" per board, use whole
        if (wasteWhole <= 0.5) return ceilWhole;
        // Otherwise use .5' increment to reduce waste
        return Math.floor(spanFt) + 0.5;
    }

    // === BOARD OPTIMIZATION ENGINE ===
    function optimizeBoards(alongHouse, fromHouse, orientation, wastePct, joistSpacingIn) {
        var isPerpendicular = (orientation === 'perpendicular');
        var span = isPerpendicular ? fromHouse : alongHouse;
        var coverage = isPerpendicular ? alongHouse : fromHouse;
        var boardRows = Math.ceil(coverage / EFFECTIVE_FT);
        var wasteMultiplier = 1 + (wastePct / 100);
        var options = [];

        // --- Standard length options ---
        STD_LENGTHS.forEach(function (stdLen) {
            var boardsPerRow, totalBoardsRaw, wastePerRow, buttJoints, note;

            if (stdLen >= span) {
                boardsPerRow = 1;
                totalBoardsRaw = boardRows;
                wastePerRow = stdLen - span;
                buttJoints = false;
                note = 'Single board/row, ' + wastePerRow.toFixed(1) + "' trimmed each";
            } else {
                boardsPerRow = Math.ceil(span / stdLen);
                var coverPerRow = boardsPerRow * stdLen;
                wastePerRow = coverPerRow - span;
                totalBoardsRaw = boardRows * boardsPerRow;
                buttJoints = true;
                note = boardsPerRow + ' boards/row (butt joints), ' + wastePerRow.toFixed(1) + "' waste/row";
            }

            var totalBoards = Math.ceil(totalBoardsRaw * wasteMultiplier);
            var totalLinearFt = totalBoards * stdLen;
            var wasteLinearFt = boardRows * wastePerRow + (totalBoards - totalBoardsRaw) * stdLen;
            var materialWastePct = totalLinearFt > 0 ? (wasteLinearFt / totalLinearFt * 100) : 0;

            options.push({
                length: stdLen,
                label: stdLen + "' Standard",
                isCustom: false,
                boardsPerRow: boardsPerRow,
                boardRows: boardRows,
                totalBoards: totalBoards,
                totalLinearFt: Math.round(totalLinearFt),
                wasteLinearFt: Math.round(wasteLinearFt),
                wastePct: Math.round(materialWastePct * 10) / 10,
                buttJoints: buttJoints,
                note: note,
                recommended: false
            });
        });

        // --- Custom length option ---
        var customLen = getCustomLength(span);
        var isCustomSameAsStandard = (STD_LENGTHS.indexOf(customLen) !== -1);

        if (!isCustomSameAsStandard && customLen > 0) {
            var trimPerBoard = customLen - span;
            var totalBoardsRaw = boardRows;
            var totalBoards = Math.ceil(totalBoardsRaw * wasteMultiplier);
            var totalLinearFt = totalBoards * customLen;
            var wasteLinearFt = totalBoards * trimPerBoard;
            var materialWastePct = totalLinearFt > 0 ? (wasteLinearFt / totalLinearFt * 100) : 0;

            options.push({
                length: customLen,
                label: customLen + "' Custom",
                isCustom: true,
                boardsPerRow: 1,
                boardRows: boardRows,
                totalBoards: totalBoards,
                totalLinearFt: Math.round(totalLinearFt),
                wasteLinearFt: Math.round(wasteLinearFt),
                wastePct: Math.round(materialWastePct * 10) / 10,
                buttJoints: false,
                note: trimPerBoard === 0
                    ? 'Exact fit, zero waste'
                    : 'Custom cut, ' + trimPerBoard.toFixed(1) + "' trim tolerance",
                recommended: false
            });
        }

        // --- Sort by waste (least waste first) ---
        options.sort(function (a, b) {
            if (a.wasteLinearFt !== b.wasteLinearFt) return a.wasteLinearFt - b.wasteLinearFt;
            return a.totalLinearFt - b.totalLinearFt;
        });

        // Mark top option as recommended
        if (options.length > 0) options[0].recommended = true;

        // Joist count for fastener math
        var joistCount = Math.floor(alongHouse * 12 / joistSpacingIn) + 1;

        return {
            deckAreaSqFt: Math.round(alongHouse * fromHouse * 10) / 10,
            spanFt: span,
            coverageFt: coverage,
            alongHouse: alongHouse,
            fromHouse: fromHouse,
            boardRows: boardRows,
            orientation: orientation,
            joistCount: joistCount,
            joistSpacingIn: joistSpacingIn,
            wastePct: wastePct,
            options: options
        };
    }

    // === FASTENER CALCULATION ===
    function calculateFasteners(boardRows, joistCount) {
        var screwsPerBoard = joistCount * SCREWS_PER_CROSSING;
        var totalScrews = boardRows * screwsPerBoard;
        var screwBoxes = Math.ceil(totalScrews / SCREWS_PER_BOX);
        var totalPlugs = totalScrews; // 1 plug per screw
        var plugBoxes = Math.ceil(totalPlugs / PLUGS_PER_BOX);
        return {
            screwsPerBoard: screwsPerBoard,
            totalScrews: totalScrews,
            screwBoxes: screwBoxes,
            totalPlugs: totalPlugs,
            plugBoxes: plugBoxes
        };
    }

    // === UI: INJECT ADVANCED FIELDS ===
    function injectCalculatorUI() {
        var calcSection = document.getElementById('calculator');
        if (!calcSection) return;

        var formGrid = calcSection.querySelector('.form-grid');
        if (!formGrid) return;

        // Find the second .field-row-2 (orientation + waste row)
        var fieldRows = formGrid.querySelectorAll('.field-row-2');
        var orientationRow = fieldRows.length >= 2 ? fieldRows[1] : null;
        if (!orientationRow) return;

        // Don't inject twice
        if (document.getElementById('calc-advanced-row')) return;

        // Insert Board Type + Joist Spacing row after orientation row
        var newRow = document.createElement('div');
        newRow.className = 'field-row-2';
        newRow.id = 'calc-advanced-row';
        newRow.innerHTML =
            '<div class="field">' +
                '<label for="calc-board-type">Board Type</label>' +
                '<select id="calc-board-type">' +
                    '<option value="system" selected>System Boards (Grooved + Dexerdry)</option>' +
                    '<option value="grooved">Grooved Boards (no Dexerdry)</option>' +
                    '<option value="solid">Solid Edge Boards</option>' +
                '</select>' +
                '<div class="help-text">Product type added to line items</div>' +
            '</div>' +
            '<div class="field">' +
                '<label for="calc-joist-spacing">Joist Spacing</label>' +
                '<select id="calc-joist-spacing">' +
                    '<option value="16" selected>16&quot; on center (standard)</option>' +
                    '<option value="12">12&quot; on center</option>' +
                '</select>' +
                '<div class="help-text">Determines screw and plug quantities</div>' +
            '</div>';
        orientationRow.parentNode.insertBefore(newRow, orientationRow.nextSibling);

        // Replace result container with upgraded version
        var oldResult = document.getElementById('calc-result-container');
        if (oldResult) {
            var newResult = document.createElement('div');
            newResult.id = 'calc-result-container';
            newResult.style.display = 'none';
            newResult.innerHTML =
                '<div class="calc-result-box">' +
                    '<h3 style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">' +
                        '<span>Board Options</span>' +
                        '<span id="calc-deck-summary" style="font-size:0.82rem;font-weight:500;color:#6b7280"></span>' +
                    '</h3>' +
                    '<p style="font-size:0.85rem;color:#6b7280;margin:0 0 0.75rem">' +
                        'Select the best option for this project. Custom lengths minimize waste.' +
                    '</p>' +
                    '<div id="calc-options-table"></div>' +
                    '<div id="calc-fastener-summary" style="margin-top:1rem;padding:0.85rem;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:0.88rem;color:#166534;display:none"></div>' +
                    '<div class="calc-buttons-row">' +
                        '<button type="button" class="btn btn-primary btn-sm" id="add-suggestion-btn" disabled>Accept &amp; Add to Order</button>' +
                        '<button type="button" class="btn btn-ghost btn-sm" id="clear-calc-btn">Clear</button>' +
                    '</div>' +
                '</div>';
            oldResult.parentNode.replaceChild(newResult, oldResult);
        }
    }

    // === UI: RENDER OPTIONS TABLE ===
    function renderOptionsTable(result) {
        var container = document.getElementById('calc-options-table');
        if (!container) return;

        // Summary line
        var summaryEl = document.getElementById('calc-deck-summary');
        if (summaryEl) {
            summaryEl.textContent =
                result.deckAreaSqFt + ' sq ft | ' +
                result.coverageFt + "' x " + result.spanFt + "' | " +
                result.boardRows + ' board rows | ' +
                result.joistCount + ' joists @ ' + result.joistSpacingIn + '" OC';
        }

        var html = '';

        // Desktop table
        html += '<div id="calc-options-desktop" style="overflow-x:auto">';
        html += '<table style="width:100%;font-size:0.85rem;border-collapse:collapse">';
        html += '<thead style="background:#eff6ff"><tr>';
        html += '<th style="padding:0.5rem;text-align:center;border:1px solid #e5e7eb;width:36px"></th>';
        html += '<th style="padding:0.5rem;text-align:left;border:1px solid #e5e7eb">Length</th>';
        html += '<th style="padding:0.5rem;text-align:right;border:1px solid #e5e7eb">Boards</th>';
        html += '<th style="padding:0.5rem;text-align:right;border:1px solid #e5e7eb">Linear Ft</th>';
        html += '<th style="padding:0.5rem;text-align:right;border:1px solid #e5e7eb">Waste</th>';
        html += '<th style="padding:0.5rem;text-align:left;border:1px solid #e5e7eb">Notes</th>';
        html += '</tr></thead><tbody>';

        result.options.forEach(function (opt, idx) {
            var isRec = opt.recommended;
            var isSelected = (idx === selectedOptionIndex);
            var bgColor = isRec ? '#f0fdf4' : (isSelected ? '#eff6ff' : '#ffffff');
            var borderColor = isRec ? '#86efac' : '#e5e7eb';
            var wasteColor = opt.wastePct > 25 ? '#dc2626' : (opt.wastePct > 10 ? '#f59e0b' : '#16a34a');

            html += '<tr style="background:' + bgColor + ';cursor:pointer" data-opt-idx="' + idx + '">';
            html += '<td style="padding:0.5rem;text-align:center;border:1px solid ' + borderColor + '">';
            html += '<input type="radio" name="calc-option" value="' + idx + '"';
            if (isRec) html += ' checked';
            html += ' style="cursor:pointer;width:16px;height:16px">';
            html += '</td>';
            html += '<td style="padding:0.5rem;border:1px solid ' + borderColor + ';font-weight:600">';
            html += opt.label;
            if (isRec) html += ' <span style="background:#22c55e;color:#fff;padding:0.15rem 0.45rem;border-radius:999px;font-size:0.7rem;font-weight:700;vertical-align:middle">BEST</span>';
            if (opt.buttJoints) html += ' <span style="background:#fef3c7;color:#92400e;padding:0.15rem 0.45rem;border-radius:999px;font-size:0.7rem;vertical-align:middle">BUTT JOINTS</span>';
            html += '</td>';
            html += '<td style="padding:0.5rem;text-align:right;border:1px solid ' + borderColor + '">' + opt.totalBoards + '</td>';
            html += '<td style="padding:0.5rem;text-align:right;border:1px solid ' + borderColor + '">' + opt.totalLinearFt + ' ft</td>';
            html += '<td style="padding:0.5rem;text-align:right;border:1px solid ' + borderColor + ';color:' + wasteColor + ';font-weight:600">';
            html += opt.wasteLinearFt + ' ft (' + opt.wastePct + '%)';
            html += '</td>';
            html += '<td style="padding:0.5rem;border:1px solid ' + borderColor + ';font-size:0.8rem;color:#6b7280">' + opt.note + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        // Mobile cards (hidden on desktop via media query in main CSS)
        html += '<div id="calc-options-mobile" style="display:none">';
        result.options.forEach(function (opt, idx) {
            var isRec = opt.recommended;
            var wasteColor = opt.wastePct > 25 ? '#dc2626' : (opt.wastePct > 10 ? '#f59e0b' : '#16a34a');
            var bg = isRec ? '#f0fdf4' : '#ffffff';
            var border = isRec ? '2px solid #86efac' : '1px solid #e5e7eb';

            html += '<div data-opt-idx="' + idx + '" style="background:' + bg + ';border:' + border + ';border-radius:10px;padding:1rem;margin-bottom:0.75rem;cursor:pointer">';
            html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">';
            html += '<input type="radio" name="calc-option-mobile" value="' + idx + '"' + (isRec ? ' checked' : '') + ' style="width:18px;height:18px">';
            html += '<strong>' + opt.label + '</strong>';
            if (isRec) html += ' <span style="background:#22c55e;color:#fff;padding:0.1rem 0.4rem;border-radius:999px;font-size:0.7rem;font-weight:700">BEST</span>';
            if (opt.buttJoints) html += ' <span style="background:#fef3c7;color:#92400e;padding:0.1rem 0.4rem;border-radius:999px;font-size:0.7rem">BUTT JOINTS</span>';
            html += '</div>';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;font-size:0.85rem">';
            html += '<div>Boards: <strong>' + opt.totalBoards + '</strong></div>';
            html += '<div>Linear ft: <strong>' + opt.totalLinearFt + '</strong></div>';
            html += '<div style="color:' + wasteColor + '">Waste: <strong>' + opt.wasteLinearFt + ' ft (' + opt.wastePct + '%)</strong></div>';
            html += '</div>';
            html += '<div style="font-size:0.8rem;color:#6b7280;margin-top:0.4rem">' + opt.note + '</div>';
            html += '</div>';
        });
        html += '</div>';

        container.innerHTML = html;

        // Auto-select recommended
        selectedOptionIndex = result.options.findIndex(function (o) { return o.recommended; });
        if (selectedOptionIndex === -1) selectedOptionIndex = 0;
        enableAcceptButton();
        renderFastenerSummary(result);

        // Attach row click handlers (desktop)
        container.querySelectorAll('tr[data-opt-idx]').forEach(function (row) {
            row.addEventListener('click', function (e) {
                selectedOptionIndex = parseInt(this.getAttribute('data-opt-idx'));
                var radio = this.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
                highlightSelectedRow();
                enableAcceptButton();
                renderFastenerSummary(result);
            });
        });

        // Attach card click handlers (mobile)
        container.querySelectorAll('div[data-opt-idx]').forEach(function (card) {
            card.addEventListener('click', function (e) {
                selectedOptionIndex = parseInt(this.getAttribute('data-opt-idx'));
                var radio = this.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
                highlightSelectedRow();
                enableAcceptButton();
                renderFastenerSummary(result);
            });
        });
    }

    function highlightSelectedRow() {
        if (!currentCalcResult) return;
        var rows = document.querySelectorAll('#calc-options-table tr[data-opt-idx]');
        rows.forEach(function (row) {
            var idx = parseInt(row.getAttribute('data-opt-idx'));
            var opt = currentCalcResult.options[idx];
            if (!opt) return;
            if (idx === selectedOptionIndex) {
                row.style.background = opt.recommended ? '#f0fdf4' : '#eff6ff';
            } else {
                row.style.background = opt.recommended ? '#f0fdf4' : '#ffffff';
            }
        });
        // Mobile cards
        var cards = document.querySelectorAll('#calc-options-mobile div[data-opt-idx]');
        cards.forEach(function (card) {
            var idx = parseInt(card.getAttribute('data-opt-idx'));
            var opt = currentCalcResult.options[idx];
            if (!opt) return;
            if (idx === selectedOptionIndex) {
                card.style.borderColor = '#2563eb';
                card.style.background = '#eff6ff';
            } else {
                card.style.borderColor = opt.recommended ? '#86efac' : '#e5e7eb';
                card.style.background = opt.recommended ? '#f0fdf4' : '#ffffff';
            }
        });
    }

    function renderFastenerSummary(result) {
        var container = document.getElementById('calc-fastener-summary');
        if (!container || selectedOptionIndex === null) return;
        var opt = result.options[selectedOptionIndex];
        if (!opt) return;

        var fasteners = calculateFasteners(opt.boardRows, result.joistCount);
        var s = fasteners.screwBoxes === 1 ? '' : 'es';
        var p = fasteners.plugBoxes === 1 ? '' : 'es';

        container.innerHTML =
            '<strong>Fasteners for ' + opt.label + ':</strong><br>' +
            'Screws: <strong>' + fasteners.totalScrews.toLocaleString() + '</strong> total = ' +
            '<strong>' + fasteners.screwBoxes + ' box' + s + '</strong> (375/box)<br>' +
            'Plugs: <strong>' + fasteners.totalPlugs.toLocaleString() + '</strong> total = ' +
            '<strong>' + fasteners.plugBoxes + ' box' + p + '</strong> (375/box)<br>' +
            '<span style="font-size:0.8rem;color:#4b5563">' +
                opt.boardRows + ' board rows &times; ' + result.joistCount + ' joists &times; ' +
                SCREWS_PER_CROSSING + ' screws per crossing = ' + fasteners.totalScrews.toLocaleString() + ' screws' +
            '</span>';
        container.style.display = 'block';
    }

    function enableAcceptButton() {
        var btn = document.getElementById('add-suggestion-btn');
        if (btn) btn.disabled = (selectedOptionIndex === null);
    }

    // === OVERRIDE: calculateOnly ===
    window.calculateOnly = function () {
        var alongHouse = parseFloat(document.getElementById('deck-len').value) || 0;
        var fromHouse = parseFloat(document.getElementById('deck-wid').value) || 0;

        if (alongHouse <= 0 || fromHouse <= 0) {
            alert('Please enter both deck dimensions greater than 0.');
            return;
        }

        // Store globally for backward compat with fastener hint
        window.deckLengthFt = alongHouse;
        window.deckWidthFt = fromHouse;

        var orientation = document.getElementById('orientation').value;

        // BUG FIX: original had inverted ternary that always returned 0
        var wastePctInput = document.getElementById('waste-pct').value.trim();
        var wastePct = wastePctInput ? (parseFloat(wastePctInput) || 0) : 0;

        var joistSpacingEl = document.getElementById('calc-joist-spacing');
        var joistSpacing = joistSpacingEl ? (parseInt(joistSpacingEl.value) || 16) : 16;

        // Run optimizer
        currentCalcResult = optimizeBoards(alongHouse, fromHouse, orientation, wastePct, joistSpacing);

        // Auto-select recommended option
        selectedOptionIndex = currentCalcResult.options.findIndex(function (o) { return o.recommended; });
        if (selectedOptionIndex === -1) selectedOptionIndex = 0;

        // Backward compat: set lastCalculation for any code that reads it
        var recOpt = currentCalcResult.options[selectedOptionIndex];
        window.lastCalculation = {
            boardsNeeded: recOpt ? recOpt.totalBoards : 0,
            suggestedLength: recOpt ? recOpt.length : 0,
            wastePct: wastePct
        };

        // Render results
        renderOptionsTable(currentCalcResult);
        document.getElementById('calc-result-container').style.display = 'block';
        enableAcceptButton();

        // Update diagram
        var preview = document.getElementById('board-lines-preview');
        if (preview) preview.className = 'board-lines ' + orientation;

        // Scroll result into view
        var resultBox = document.getElementById('calc-result-container');
        if (resultBox) resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // === OVERRIDE: addSuggestionToOrder ===
    window.addSuggestionToOrder = function () {
        if (!currentCalcResult || selectedOptionIndex === null) {
            alert('Please calculate and select an option first.');
            return;
        }

        var opt = currentCalcResult.options[selectedOptionIndex];
        if (!opt) return;

        var boardTypeEl = document.getElementById('calc-board-type');
        var boardType = boardTypeEl ? boardTypeEl.value : 'system';
        var color = window.selectedColor1 || 'Driftwood';
        var fasteners = calculateFasteners(opt.boardRows, currentCalcResult.joistCount);
        var itemsAdded = [];

        // Determine length for line item
        var lengthVal, customLengthVal;
        if (opt.isCustom) {
            lengthVal = 'custom';
            customLengthVal = opt.length;
        } else {
            lengthVal = opt.length;
            customLengthVal = null;
        }

        // 1. Decking boards
        window.currentQuote.lineItems.push({
            type: boardType,
            color: color,
            length: lengthVal,
            customLength: customLengthVal,
            qty: opt.totalBoards,
            customDesc: '',
            customUnitPrice: 0,
            _source: 'calculator',
            _sourceNote: opt.totalBoards + 'x ' + opt.label + ' ' + boardType + ' (' + color + ')'
        });
        itemsAdded.push(opt.totalBoards + ' ' + boardType + ' boards (' + opt.label + ', ' + color + ')');

        // 2. Screws (always)
        if (fasteners.screwBoxes > 0) {
            window.currentQuote.lineItems.push({
                type: 'screws',
                color: null,
                length: null,
                customLength: null,
                qty: fasteners.screwBoxes,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: fasteners.totalScrews + ' screws = ' + fasteners.screwBoxes + ' boxes'
            });
            itemsAdded.push(fasteners.screwBoxes + ' box(es) screws (' + fasteners.totalScrews.toLocaleString() + ' total)');
        }

        // 3. Plugs (always for face screw, 1 per screw)
        if (fasteners.plugBoxes > 0) {
            window.currentQuote.lineItems.push({
                type: 'plugs',
                color: null,
                length: null,
                customLength: null,
                qty: fasteners.plugBoxes,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: fasteners.totalPlugs + ' plugs = ' + fasteners.plugBoxes + ' boxes'
            });
            itemsAdded.push(fasteners.plugBoxes + ' box(es) plugs (' + fasteners.totalPlugs.toLocaleString() + ' total)');
        }

        // 4. Picture frame solid edge boards (if checked)
        if (window.currentQuote.options && window.currentQuote.options.pictureFrame) {
            var perimeterFt = 2 * (currentCalcResult.coverageFt + currentCalcResult.spanFt);
            // Use longest standard that fits, or match the deck board length
            var pfBoardLen = currentCalcResult.spanFt <= 12 ? 12 :
                             currentCalcResult.spanFt <= 16 ? 16 : 20;
            var pfBoards = Math.ceil(perimeterFt / pfBoardLen);

            window.currentQuote.lineItems.push({
                type: 'solid',
                color: color,
                length: pfBoardLen,
                customLength: null,
                qty: pfBoards,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: 'Picture frame: ' + Math.round(perimeterFt) + ' LF perimeter'
            });
            itemsAdded.push(pfBoards + ' solid edge boards (picture frame)');
        }

        // 5. Stair boards (if checked)
        if (window.currentQuote.options && window.currentQuote.options.stairs) {
            // Default assumption: 4 treads (2 boards each) + 4 risers (1 board each)
            var stairBoards = 12;
            window.currentQuote.lineItems.push({
                type: 'solid',
                color: color,
                length: 12,
                customLength: null,
                qty: stairBoards,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: 'Stairs: 4 treads (2 boards ea) + 4 risers'
            });
            itemsAdded.push(stairBoards + ' solid edge boards (stairs)');
        }

        // Clean up and re-render
        window.deletedItems = [];
        if (typeof window.render === 'function') window.render();
        if (typeof window.updateTotalAndFasteners === 'function') window.updateTotalAndFasteners();
        if (typeof window.updateUndoButton === 'function') window.updateUndoButton();

        // Reset calculator state
        document.getElementById('calc-result-container').style.display = 'none';
        currentCalcResult = null;
        selectedOptionIndex = null;

        // Show confirmation
        var msg = itemsAdded.length + ' line items added to your order:\n';
        itemsAdded.forEach(function (item) {
            msg += '\u2022 ' + item + '\n';
        });
        alert(msg);
    };

    // === MOBILE RESPONSIVE SUPPORT ===
    function setupMobileResponsive() {
        var style = document.createElement('style');
        style.textContent =
            '@media (max-width: 768px) {' +
                '#calc-options-desktop { display: none !important; }' +
                '#calc-options-mobile { display: block !important; }' +
                '#calc-advanced-row { grid-template-columns: 1fr !important; }' +
            '}' +
            '@media (min-width: 769px) {' +
                '#calc-options-mobile { display: none !important; }' +
            '}';
        document.head.appendChild(style);
    }

    // === INITIALIZATION ===
    function init() {
        console.log('[DeckCalc] Initializing advanced deck calculator v1.0');

        // Inject new UI fields
        injectCalculatorUI();
        setupMobileResponsive();

        // Clone-replace the Calculate button to remove old listeners
        var oldCalcBtn = document.getElementById('calc-btn');
        if (oldCalcBtn) {
            var newCalcBtn = oldCalcBtn.cloneNode(true);
            oldCalcBtn.parentNode.replaceChild(newCalcBtn, oldCalcBtn);
            newCalcBtn.addEventListener('click', function () {
                window.calculateOnly();
            });
        }

        // Attach listeners for new result buttons
        // (These are new DOM elements from injectCalculatorUI, no old listeners)
        var addBtn = document.getElementById('add-suggestion-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                window.addSuggestionToOrder();
            });
        }

        var clearBtn = document.getElementById('clear-calc-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                document.getElementById('calc-result-container').style.display = 'none';
                currentCalcResult = null;
                selectedOptionIndex = null;
                window.lastCalculation = null;
            });
        }

        // Keep orientation preview working
        var orientSel = document.getElementById('orientation');
        if (orientSel) {
            orientSel.addEventListener('change', function () {
                var preview = document.getElementById('board-lines-preview');
                if (preview) preview.className = 'board-lines ' + this.value;
                var helpText = document.getElementById('orientation-help');
                if (helpText) {
                    helpText.textContent = this.value === 'perpendicular'
                        ? 'Boards will run away from the house, toward the yard'
                        : 'Boards will run along the house wall';
                }
            });
        }

        console.log('[DeckCalc] Ready. Board width: ' + BOARD_WIDTH_INCH + '"  Gap: ' + GAP_INCH + '"  Effective: ' + EFFECTIVE_FT.toFixed(6) + ' ft/board');
    }

    // Run after a short delay to ensure main HTML script has finished
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 50);
        });
    } else {
        setTimeout(init, 50);
    }
})();
