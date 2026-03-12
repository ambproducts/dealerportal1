// ============================================================
// AmeriDex Dealer Portal - Advanced Deck Calculator v2.0.0
// File: ameridex-deck-calculator.js
// Date: 2026-03-12
// ============================================================
// The AmeriDex System = Grooved deck boards + Dexerdry seal
// integrated at $8/ft. The calculator defaults to System boards.
// No separate Dexerdry seal line item is needed for System.
//
// BlueClaw ($150) is a reusable compression tool for seating
// the Dexerdry seal. It is NOT a consumable and is NOT auto-
// calculated. Dealers add it manually when needed.
//
// Key features:
//   - Inline color picker with full-screen preview on click
//   - Standalone "Select Colors" section removed (redundant)
//   - Multi-option comparison (12', 16', 20', custom)
//   - Custom length rounding: whole foot preferred, .5' when
//     it saves significant waste
//   - Screw calculation: boardRows x joists x 2 per crossing
//   - Plug calculation: 1 plug per screw (375/box each)
//   - Pushes boards + screws + plugs + picture frame + breaker board + stairs (if on)
//   - Polygon drawing tool for visual deck shape input
//   - Breaker board auto-suggestion for large decks (span >= 16')
// ============================================================

(function () {
    'use strict';

    // === CONSTANTS ===
    var BOARD_WIDTH_INCH = 5.5;
    var GAP_INCH = 0.125;
    var EFFECTIVE_FT = (BOARD_WIDTH_INCH + GAP_INCH) / 12;
    var STD_LENGTHS = [12, 16, 20];
    var SCREWS_PER_BOX = 375;
    var PLUGS_PER_BOX = 375;
    var SCREWS_PER_CROSSING = 2;

    // === STATE ===
    var currentCalcResult = null;
    var selectedOptionIndex = null;
    var calcSelectedColor = null;

    // === HELPER: resolve color image path ===
    function colorImgPath(colorName) {
        var map = window.COLORIMAGES || {};
        return 'colors/' + (map[colorName] || colorName + '.png');
    }

    // === CUSTOM LENGTH ROUNDING ===
    function getCustomLength(spanFt) {
        if (spanFt <= 0) return 0;
        if (spanFt % 0.5 === 0) return spanFt;
        var ceilWhole = Math.ceil(spanFt);
        var wasteWhole = ceilWhole - spanFt;
        if (wasteWhole <= 0.5) return ceilWhole;
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

        options.sort(function (a, b) {
            if (a.wasteLinearFt !== b.wasteLinearFt) return a.wasteLinearFt - b.wasteLinearFt;
            return a.totalLinearFt - b.totalLinearFt;
        });

        if (options.length > 0) options[0].recommended = true;

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
        var totalPlugs = totalScrews;
        var plugBoxes = Math.ceil(totalPlugs / PLUGS_PER_BOX);
        return {
            screwsPerBoard: screwsPerBoard,
            totalScrews: totalScrews,
            screwBoxes: screwBoxes,
            totalPlugs: totalPlugs,
            plugBoxes: plugBoxes
        };
    }

    // === GET ACTIVE COLOR ===
    function getActiveColor() {
        return calcSelectedColor || window.selectedColor1 || 'Driftwood';
    }

    // === OPEN FULL-SCREEN COLOR PREVIEW ===
    function openColorPreview(colorName) {
        var modal = document.getElementById('colorModal');
        var modalImg = document.getElementById('colorLarge');
        var modalName = document.getElementById('colorName');
        if (!modal || !modalImg) return;

        modalImg.src = colorImgPath(colorName);
        modalImg.alt = colorName;
        if (modalName) modalName.textContent = colorName;
        modal.classList.add('active');
    }

    // === COLOR PICKER: UPDATE SELECTION STATE ===
    function updateCalcColorSelection(colorName) {
        calcSelectedColor = colorName;
        window.selectedColor1 = colorName;

        // Update all inline swatch states (class-driven)
        var swatches = document.querySelectorAll('#calc-color-swatches .calc-color-swatch');
        swatches.forEach(function (s) {
            var isThis = (s.getAttribute('data-color') === colorName);
            s.classList.toggle('active', isThis);

            var label = s.querySelector('.calc-swatch-label');
            if (label) {
                label.style.color = isThis ? '#2563eb' : '#6b7280';
            }
        });

        // Update inline preview image and label (always, no COLORIMAGES guard)
        var previewImg = document.getElementById('calc-color-preview-img');
        if (previewImg) {
            previewImg.src = colorImgPath(colorName);
            previewImg.alt = colorName;
        }

        var previewLabel = document.getElementById('calc-color-preview-label');
        if (previewLabel) {
            previewLabel.textContent = colorName;
        }

        // Update result color chip if visible
        var colorChip = document.getElementById('calc-result-color-chip');
        if (colorChip) {
            colorChip.textContent = colorName;
        }
    }

    // === REMOVE STANDALONE COLOR SECTION ===
    function removeStandaloneColorSection() {
        var colorsSection = document.getElementById('colors');
        if (colorsSection) {
            colorsSection.parentNode.removeChild(colorsSection);
            console.log('[DeckCalc] Removed standalone #colors section (now integrated in calculator)');
        }
    }

    // === UI: INJECT ADVANCED FIELDS ===
    function injectCalculatorUI() {
        var calcSection = document.getElementById('calculator');
        if (!calcSection) return;

        var formGrid = calcSection.querySelector('.form-grid');
        if (!formGrid) return;

        var fieldRows = formGrid.querySelectorAll('.field-row-2');
        var orientationRow = fieldRows.length >= 2 ? fieldRows[1] : null;
        if (!orientationRow) return;

        if (document.getElementById('calc-color-row')) return;

        calcSelectedColor = window.selectedColor1 || 'Driftwood';

        // --- Color Picker Row ---
        var colorRow = document.createElement('div');
        colorRow.id = 'calc-color-row';
        colorRow.style.cssText = 'margin-top:0.5rem;padding:1rem;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb';

        var colorLabel = '<label style="font-size:0.9rem;font-weight:600;color:#374151;margin-bottom:0.5rem;display:block">Board Color</label>';

        // Build swatches: ALL start with transparent border. Active state is class-only.
        var swatchesHtml = '<div id="calc-color-swatches" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-start">';
        var colors = window.COLORS || ['Driftwood', 'Khaki', 'Slate', 'Beachwood', 'Chestnut', 'Redwood', 'Hazelnut'];

        colors.forEach(function (c) {
            var isActive = (c === calcSelectedColor);
            var imgSrc = colorImgPath(c);
            swatchesHtml +=
                '<div class="calc-color-swatch' + (isActive ? ' active' : '') + '" data-color="' + c + '" ' +
                    'style="cursor:pointer;text-align:center;width:72px;transition:transform 0.15s" ' +
                    'title="Click to select ' + c + '">' +
                    '<div class="calc-swatch-img" style="position:relative;width:64px;height:44px;border-radius:8px;overflow:hidden;' +
                        'border:3px solid transparent;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:border-color 0.15s,box-shadow 0.15s">' +
                        '<img src="' + imgSrc + '" alt="' + c + '" ' +
                            'style="width:100%;height:100%;object-fit:cover;display:block" ' +
                            'onerror="this.style.background=\'#d4a574\';this.style.display=\'block\'">' +
                        '<div class="calc-swatch-expand" style="position:absolute;inset:0;display:flex;align-items:center;' +
                            'justify-content:center;background:rgba(0,0,0,0.35);opacity:0;transition:opacity 0.15s;pointer-events:none">' +
                            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                                '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline>' +
                                '<line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>' +
                            '</svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="calc-swatch-label" style="font-size:0.7rem;font-weight:600;margin-top:0.25rem;' +
                        'color:' + (isActive ? '#2563eb' : '#6b7280') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
                        c +
                    '</div>' +
                '</div>';
        });
        swatchesHtml += '</div>';

        // Preview panel
        var previewImgSrc = colorImgPath(calcSelectedColor);
        var previewHtml =
            '<div id="calc-color-preview" style="display:flex;align-items:center;gap:0.75rem;margin-top:0.75rem;' +
                'padding:0.6rem 0.85rem;background:white;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer" ' +
                'title="Click for full-screen preview">' +
                '<img id="calc-color-preview-img" src="' + previewImgSrc + '" alt="' + calcSelectedColor + '" ' +
                    'style="width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid #e5e7eb">' +
                '<div style="flex:1">' +
                    '<div style="font-size:0.78rem;color:#6b7280">Selected Color</div>' +
                    '<div id="calc-color-preview-label" style="font-size:1rem;font-weight:700;color:#111827">' +
                        calcSelectedColor +
                    '</div>' +
                    '<div style="font-size:0.72rem;color:#9ca3af;margin-top:0.15rem">Tap preview to view full screen</div>' +
                '</div>' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' +
                    '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline>' +
                    '<line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>' +
                '</svg>' +
            '</div>';

        colorRow.innerHTML = colorLabel + swatchesHtml + previewHtml;
        orientationRow.parentNode.insertBefore(colorRow, orientationRow.nextSibling);

        // --- Click handlers for swatches ---
        colorRow.querySelectorAll('.calc-color-swatch').forEach(function (swatch) {
            swatch.addEventListener('click', function () {
                updateCalcColorSelection(this.getAttribute('data-color'));
            });

            swatch.addEventListener('dblclick', function (e) {
                e.preventDefault();
                var colorName = this.getAttribute('data-color');
                updateCalcColorSelection(colorName);
                openColorPreview(colorName);
            });
        });

        // Click the preview panel to open full-screen modal
        var previewPanel = colorRow.querySelector('#calc-color-preview');
        if (previewPanel) {
            previewPanel.addEventListener('click', function () {
                openColorPreview(getActiveColor());
            });
        }

        // --- Board Type + Joist Spacing row ---
        var advancedRow = document.createElement('div');
        advancedRow.className = 'field-row-2';
        advancedRow.id = 'calc-advanced-row';
        advancedRow.innerHTML =
            '<div class="field">' +
                '<label for="calc-board-type">Board Type</label>' +
                '<select id="calc-board-type">' +
                    '<option value="system" selected>AmeriDex System (Board + Dexerdry Seal)</option>' +
                    '<option value="grooved">Grooved Boards only (no seal)</option>' +
                    '<option value="solid">Solid Edge Boards</option>' +
                '</select>' +
                '<div class="help-text">System includes integrated Dexerdry seal at the board price</div>' +
            '</div>' +
            '<div class="field">' +
                '<label for="calc-joist-spacing">Joist Spacing</label>' +
                '<select id="calc-joist-spacing">' +
                    '<option value="16" selected>16&quot; on center (standard)</option>' +
                    '<option value="12">12&quot; on center</option>' +
                '</select>' +
                '<div class="help-text">Determines screw and plug quantities</div>' +
            '</div>';
        colorRow.parentNode.insertBefore(advancedRow, colorRow.nextSibling);

        // --- Replace result container ---
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
                    '<div id="calc-result-color-bar" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;' +
                        'padding:0.45rem 0.7rem;background:#fff;border-radius:6px;border:1px solid #e5e7eb;font-size:0.85rem">' +
                        '<span style="color:#6b7280">Color:</span> ' +
                        '<span id="calc-result-color-chip" style="font-weight:700;color:#111827">' + calcSelectedColor + '</span>' +
                    '</div>' +
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

    // === INJECT STYLES ===
    function injectCalcColorStyles() {
        if (document.getElementById('calc-color-styles')) return;
        var style = document.createElement('style');
        style.id = 'calc-color-styles';
        style.textContent =
            '.calc-color-swatch:hover { transform: translateY(-2px); }' +
            '.calc-color-swatch:hover .calc-swatch-expand { opacity: 1 !important; }' +
            '.calc-color-swatch.active .calc-swatch-img {' +
                'border-color: #2563eb !important;' +
                'box-shadow: 0 0 0 2px rgba(37,99,235,0.25) !important;' +
            '}' +
            '.calc-color-swatch:not(.active) .calc-swatch-img {' +
                'border-color: transparent !important;' +
                'box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;' +
            '}' +
            '#calc-color-preview:hover { background: #f9fafb !important; border-color: #2563eb !important; }' +
            '@media (max-width: 768px) {' +
                '#calc-color-swatches { gap: 0.35rem !important; }' +
                '.calc-color-swatch { width: 56px !important; }' +
                '.calc-swatch-img { width: 48px !important; height: 36px !important; }' +
                '#calc-color-preview { margin-top: 0.5rem !important; }' +
                '#calc-options-desktop { display: none !important; }' +
                '#calc-options-mobile { display: block !important; }' +
                '#calc-advanced-row { grid-template-columns: 1fr !important; }' +
            '}' +
            '@media (min-width: 769px) {' +
                '#calc-options-mobile { display: none !important; }' +
            '}';
        document.head.appendChild(style);
    }

    // === UI: RENDER OPTIONS TABLE ===
    function renderOptionsTable(result) {
        var container = document.getElementById('calc-options-table');
        if (!container) return;

        var summaryEl = document.getElementById('calc-deck-summary');
        if (summaryEl) {
            summaryEl.textContent =
                result.deckAreaSqFt + ' sq ft | ' +
                result.coverageFt + "' x " + result.spanFt + "' | " +
                result.boardRows + ' board rows | ' +
                result.joistCount + ' joists @ ' + result.joistSpacingIn + '" OC';
        }

        var colorChip = document.getElementById('calc-result-color-chip');
        if (colorChip) colorChip.textContent = getActiveColor();

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

        // Mobile cards
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

        selectedOptionIndex = result.options.findIndex(function (o) { return o.recommended; });
        if (selectedOptionIndex === -1) selectedOptionIndex = 0;
        enableAcceptButton();
        renderFastenerSummary(result);

        container.querySelectorAll('tr[data-opt-idx]').forEach(function (row) {
            row.addEventListener('click', function () {
                selectedOptionIndex = parseInt(this.getAttribute('data-opt-idx'));
                var radio = this.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
                highlightSelectedRow();
                enableAcceptButton();
                renderFastenerSummary(result);
            });
        });

        container.querySelectorAll('div[data-opt-idx]').forEach(function (card) {
            card.addEventListener('click', function () {
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
            row.style.background = (idx === selectedOptionIndex)
                ? (opt.recommended ? '#f0fdf4' : '#eff6ff')
                : (opt.recommended ? '#f0fdf4' : '#ffffff');
        });
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

        var html =
            '<strong>Fasteners for ' + opt.label + ':</strong><br>' +
            'Screws: <strong>' + fasteners.totalScrews.toLocaleString() + '</strong> total = ' +
            '<strong>' + fasteners.screwBoxes + ' box' + s + '</strong> (375/box)<br>' +
            'Plugs: <strong>' + fasteners.totalPlugs.toLocaleString() + '</strong> total = ' +
            '<strong>' + fasteners.plugBoxes + ' box' + p + '</strong> (375/box)<br>' +
            '<span style="font-size:0.8rem;color:#4b5563">' +
                opt.boardRows + ' board rows &times; ' + result.joistCount + ' joists &times; ' +
                SCREWS_PER_CROSSING + ' screws per crossing = ' + fasteners.totalScrews.toLocaleString() + ' screws' +
            '</span>';

        // Additional Materials Preview
        var additionalItems = [];
        var pfOpt = window.currentQuote && window.currentQuote.options && window.currentQuote.options.pictureFrame;
        if (pfOpt === true) pfOpt = { enabled: true, type: 'single', color: null };
        if (pfOpt && pfOpt.enabled) {
            var perimeterFt = 2 * (result.coverageFt + result.spanFt);
            var pfBoardLen = result.spanFt <= 12 ? 12 : result.spanFt <= 16 ? 16 : 20;
            var pfBoards = Math.ceil(perimeterFt / pfBoardLen);
            if (pfOpt.type === 'double') pfBoards = pfBoards * 2;
            additionalItems.push('Picture frame: <strong>' + pfBoards + '</strong> solid edge board' + (pfBoards !== 1 ? 's' : '') + ' (' + (pfOpt.type === 'double' ? 'double' : 'single') + ')');
        }

        var bbOpt = window.currentQuote && window.currentQuote.options && window.currentQuote.options.breakerBoard;
        if (bbOpt && bbOpt.enabled) {
            var bbCoverage = result.coverageFt;
            var bbBoardLen = bbCoverage <= 12 ? 12 : bbCoverage <= 16 ? 16 : 20;
            var bbBoardCount = Math.ceil(bbCoverage / bbBoardLen);
            additionalItems.push('Breaker board: <strong>' + bbBoardCount + '</strong> solid edge board' + (bbBoardCount !== 1 ? 's' : ''));
        }

        var stOpt = window.currentQuote && window.currentQuote.options && window.currentQuote.options.stairs;
        if (stOpt === true) stOpt = { enabled: true, steps: 1, treadsPerStep: 1, risers: false, color: null, stairWidth: null };
        if (stOpt && stOpt.enabled) {
            var steps = stOpt.steps || 1;
            var treadsPerStep = stOpt.treadsPerStep || 1;
            var treadBoards = steps * treadsPerStep;
            var riserBoards = stOpt.risers ? steps : 0;
            var stairDesc = 'Stairs: <strong>' + treadBoards + '</strong> tread board' + (treadBoards !== 1 ? 's' : '');
            if (riserBoards > 0) stairDesc += ' + <strong>' + riserBoards + '</strong> riser board' + (riserBoards !== 1 ? 's' : '');
            additionalItems.push(stairDesc);
        }

        if (additionalItems.length > 0) {
            html += '<div style="margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid #86efac">' +
                '<strong>Additional Materials:</strong><br>';
            additionalItems.forEach(function(item) {
                html += '\u2022 ' + item + '<br>';
            });
            html += '</div>';
        }

        container.innerHTML = html;
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

        window.deckLengthFt = alongHouse;
        window.deckWidthFt = fromHouse;

        var orientation = document.getElementById('orientation').value;
        var wastePctInput = document.getElementById('waste-pct').value.trim();
        var wastePct = wastePctInput ? (parseFloat(wastePctInput) || 0) : 0;

        var joistSpacingEl = document.getElementById('calc-joist-spacing');
        var joistSpacing = joistSpacingEl ? (parseInt(joistSpacingEl.value) || 16) : 16;

        currentCalcResult = optimizeBoards(alongHouse, fromHouse, orientation, wastePct, joistSpacing);

        selectedOptionIndex = currentCalcResult.options.findIndex(function (o) { return o.recommended; });
        if (selectedOptionIndex === -1) selectedOptionIndex = 0;

        var recOpt = currentCalcResult.options[selectedOptionIndex];
        window.lastCalculation = {
            boardsNeeded: recOpt ? recOpt.totalBoards : 0,
            suggestedLength: recOpt ? recOpt.length : 0,
            wastePct: wastePct
        };

        renderOptionsTable(currentCalcResult);
        document.getElementById('calc-result-container').style.display = 'block';
        enableAcceptButton();

        // Breaker board auto-suggestion for large decks
        var breakerCheckbox = document.getElementById('breaker-board');
        var existingBanner = document.getElementById('breaker-suggestion-banner');
        if (existingBanner) existingBanner.parentNode.removeChild(existingBanner);
        if (currentCalcResult.spanFt >= 16 && breakerCheckbox && !breakerCheckbox.checked) {
            var banner = document.createElement('div');
            banner.id = 'breaker-suggestion-banner';
            banner.style.cssText = 'margin-top:0.75rem;padding:0.75rem 1rem;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:0.88rem;color:#92400e;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap';
            banner.innerHTML = '<span>\uD83D\uDCA1 This deck is ' + currentCalcResult.spanFt + '\' long \u2014 consider adding a breaker board for a cleaner look.</span>' +
                '<button type="button" class="btn btn-outline btn-sm" id="breaker-suggest-btn" style="font-size:0.8rem;padding:0.25rem 0.75rem;">Add Breaker Board</button>';
            var fastenerEl = document.getElementById('calc-fastener-summary');
            if (fastenerEl) fastenerEl.parentNode.insertBefore(banner, fastenerEl.nextSibling);
            document.getElementById('breaker-suggest-btn').addEventListener('click', function() {
                breakerCheckbox.checked = true;
                document.getElementById('breaker-config').classList.add('visible');
                banner.parentNode.removeChild(banner);
                breakerCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }

        var preview = document.getElementById('board-lines-preview');
        if (preview) preview.className = 'board-lines ' + orientation;

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
        var color = getActiveColor();
        var fasteners = calculateFasteners(opt.boardRows, currentCalcResult.joistCount);
        var itemsAdded = [];

        var lengthVal, customLengthVal;
        if (opt.isCustom) {
            lengthVal = 'custom';
            customLengthVal = opt.length;
        } else {
            lengthVal = opt.length;
            customLengthVal = null;
        }

        var boardTypeLabel = boardType === 'system' ? 'AmeriDex System'
                           : boardType === 'grooved' ? 'Grooved'
                           : 'Solid Edge';

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
            _sourceNote: opt.totalBoards + 'x ' + opt.label + ' ' + boardTypeLabel + ' (' + color + ')'
        });
        itemsAdded.push(opt.totalBoards + ' ' + boardTypeLabel + ' boards (' + opt.label + ', ' + color + ')');

        // 2. Screws
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

        // 3. Plugs
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

        // 4. Picture frame solid edge boards
        var pfOpt = window.currentQuote.options && window.currentQuote.options.pictureFrame;
        // Backward compat: boolean true means enabled single frame
        if (pfOpt === true) pfOpt = { enabled: true, type: 'single', color: null };
        if (pfOpt && pfOpt.enabled) {
            var perimeterFt = 2 * (currentCalcResult.coverageFt + currentCalcResult.spanFt);
            var pfBoardLen = currentCalcResult.spanFt <= 12 ? 12 :
                             currentCalcResult.spanFt <= 16 ? 16 : 20;
            var pfBoards = Math.ceil(perimeterFt / pfBoardLen);
            if (pfOpt.type === 'double') pfBoards = pfBoards * 2;
            var pfColor = pfOpt.color || color;

            window.currentQuote.lineItems.push({
                type: 'solid',
                color: pfColor,
                length: pfBoardLen,
                customLength: null,
                qty: pfBoards,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: 'Picture frame (' + (pfOpt.type === 'double' ? 'double' : 'single') + '): ' + Math.round(perimeterFt) + ' LF perimeter'
            });
            itemsAdded.push(pfBoards + ' solid edge boards (picture frame, ' + (pfOpt.type === 'double' ? 'double' : 'single') + ')');
        }

        // 5. Breaker board
        var bbOpt = window.currentQuote.options && window.currentQuote.options.breakerBoard;
        if (bbOpt && bbOpt.enabled) {
            var bbCoverage = currentCalcResult.coverageFt;
            var bbBoardLen = bbCoverage <= 12 ? 12 : bbCoverage <= 16 ? 16 : 20;
            var bbBoardCount = Math.ceil(bbCoverage / bbBoardLen);
            var bbColor = bbOpt.color || color;

            window.currentQuote.lineItems.push({
                type: 'solid',
                color: bbColor,
                length: bbBoardLen,
                customLength: null,
                qty: bbBoardCount,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: 'Breaker board: ' + Math.round(bbCoverage) + ' LF coverage (' + (bbOpt.position === 'custom' ? bbOpt.customOffset + ' ft offset' : 'center') + ')'
            });
            itemsAdded.push(bbBoardCount + ' solid edge board(s) (breaker board)');
        }

        // 6. Stair boards
        var stOpt = window.currentQuote.options && window.currentQuote.options.stairs;
        // Backward compat: boolean true means enabled with defaults
        if (stOpt === true) stOpt = { enabled: true, steps: 1, treadsPerStep: 1, risers: false, color: null, stairWidth: null };
        if (stOpt && stOpt.enabled) {
            var stairWidth = stOpt.stairWidth || currentCalcResult.coverageFt;
            var stBoardLen = stairWidth <= 12 ? 12 : stairWidth <= 16 ? 16 : 20;
            var stColor = stOpt.color || color;
            var steps = stOpt.steps || 1;
            var treadsPerStep = stOpt.treadsPerStep || 1;
            var treadBoards = steps * treadsPerStep;

            window.currentQuote.lineItems.push({
                type: 'solid',
                color: stColor,
                length: stBoardLen,
                customLength: null,
                qty: treadBoards,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: 'Stair treads: ' + steps + ' step(s) x ' + treadsPerStep + ' tread(s)' + (stOpt.stairWidth ? ', ' + stOpt.stairWidth + ' ft wide' : '')
            });
            itemsAdded.push(treadBoards + ' solid edge boards (stair treads)');

            if (stOpt.risers) {
                var riserBoards = steps;
                window.currentQuote.lineItems.push({
                    type: 'solid',
                    color: stColor,
                    length: stBoardLen,
                    customLength: null,
                    qty: riserBoards,
                    customDesc: '',
                    customUnitPrice: 0,
                    _source: 'calculator',
                    _sourceNote: 'Stair risers: ' + steps + ' riser(s)'
                });
                itemsAdded.push(riserBoards + ' solid edge boards (stair risers)');
            }
        }

        // Clean up and re-render
        window.deletedItems = [];
        if (typeof window.render === 'function') window.render();
        if (typeof window.updateTotalAndFasteners === 'function') window.updateTotalAndFasteners();
        if (typeof window.updateUndoButton === 'function') window.updateUndoButton();

        document.getElementById('calc-result-container').style.display = 'none';
        currentCalcResult = null;
        selectedOptionIndex = null;

        var msg = itemsAdded.length + ' line items added to your order:\n';
        itemsAdded.forEach(function (item) {
            msg += '\u2022 ' + item + '\n';
        });
        alert(msg);
    };

    // === INITIALIZATION ===
    function init() {
        console.log('[DeckCalc] Initializing advanced deck calculator v2.0.0');

        // Remove the standalone Select Colors section (now integrated here)
        removeStandaloneColorSection();

        injectCalculatorUI();
        injectCalcColorStyles();

        var oldCalcBtn = document.getElementById('calc-btn');
        if (oldCalcBtn) {
            var newCalcBtn = oldCalcBtn.cloneNode(true);
            oldCalcBtn.parentNode.replaceChild(newCalcBtn, oldCalcBtn);
            newCalcBtn.addEventListener('click', function () {
                window.calculateOnly();
            });
        }

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

    // === POLYGON DRAWING TOOL ===
    var polyState = { vertices: [], scale: 2, closed: false };
    var polyInitialized = false;

    window.initPolygonTool = function () {
        if (polyInitialized) return;
        polyInitialized = true;

        var canvas = document.getElementById('polygon-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var scaleInput = document.getElementById('polygon-scale');
        var useBtn = document.getElementById('polygon-use-btn');
        var clearBtn = document.getElementById('polygon-clear-btn');
        var dimsDiv = document.getElementById('polygon-dimensions');
        var alongSpan = document.getElementById('polygon-along');
        var fromSpan = document.getElementById('polygon-from');

        var SNAP_RADIUS = 10;

        function getScale() {
            return parseFloat(scaleInput.value) || 2;
        }

        function getGridSize() {
            // Grid size in pixels: canvas covers a reasonable number of grid cells
            return 30;
        }

        function canvasCoords(e) {
            var rect = canvas.getBoundingClientRect();
            var scaleX = canvas.width / rect.width;
            var scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }

        function drawGrid() {
            var gs = getGridSize();
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 0.5;
            for (var x = 0; x <= canvas.width; x += gs) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (var y = 0; y <= canvas.height; y += gs) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
            // House wall indicator at top
            ctx.fillStyle = '#6b7280';
            ctx.fillRect(0, 0, canvas.width, 3);
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.fillText('HOUSE WALL', 5, 14);
        }

        function dist(a, b) {
            return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
        }

        function edgeLengthFt(a, b) {
            var gs = getGridSize();
            var scale = getScale();
            var dx = (b.x - a.x) / gs * scale;
            var dy = (b.y - a.y) / gs * scale;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function drawEdgeLabel(a, b) {
            var len = edgeLengthFt(a, b);
            var mx = (a.x + b.x) / 2;
            var my = (a.y + b.y) / 2;
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#1e40af';
            ctx.textAlign = 'center';
            ctx.fillText(len.toFixed(1) + ' ft', mx, my - 5);
            ctx.textAlign = 'left';
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawGrid();

            var verts = polyState.vertices;
            if (verts.length === 0) return;

            // Draw filled polygon if closed
            if (polyState.closed && verts.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(verts[0].x, verts[0].y);
                for (var i = 1; i < verts.length; i++) {
                    ctx.lineTo(verts[i].x, verts[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
                ctx.fill();
            }

            // Draw edges
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            for (var i = 0; i < verts.length - 1; i++) {
                ctx.beginPath();
                ctx.moveTo(verts[i].x, verts[i].y);
                ctx.lineTo(verts[i + 1].x, verts[i + 1].y);
                ctx.stroke();
                drawEdgeLabel(verts[i], verts[i + 1]);
            }
            if (polyState.closed && verts.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(verts[verts.length - 1].x, verts[verts.length - 1].y);
                ctx.lineTo(verts[0].x, verts[0].y);
                ctx.stroke();
                drawEdgeLabel(verts[verts.length - 1], verts[0]);
            }

            // Draw vertices
            for (var i = 0; i < verts.length; i++) {
                ctx.beginPath();
                ctx.arc(verts[i].x, verts[i].y, 5, 0, Math.PI * 2);
                ctx.fillStyle = i === 0 ? '#dc2626' : '#2563eb';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        function computeBoundingBox() {
            var verts = polyState.vertices;
            if (verts.length < 3 || !polyState.closed) {
                dimsDiv.style.display = 'none';
                useBtn.style.display = 'none';
                return;
            }
            var gs = getGridSize();
            var scale = getScale();
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (var i = 0; i < verts.length; i++) {
                if (verts[i].x < minX) minX = verts[i].x;
                if (verts[i].x > maxX) maxX = verts[i].x;
                if (verts[i].y < minY) minY = verts[i].y;
                if (verts[i].y > maxY) maxY = verts[i].y;
            }
            var alongFt = Math.round(((maxX - minX) / gs * scale) * 10) / 10;
            var fromFt = Math.round(((maxY - minY) / gs * scale) * 10) / 10;
            alongSpan.textContent = alongFt;
            fromSpan.textContent = fromFt;
            dimsDiv.style.display = '';
            useBtn.style.display = '';
        }

        function clearPoly() {
            polyState.vertices = [];
            polyState.closed = false;
            dimsDiv.style.display = 'none';
            useBtn.style.display = 'none';
            draw();
        }

        canvas.addEventListener('click', function (e) {
            if (polyState.closed) return;
            var pt = canvasCoords(e);
            var verts = polyState.vertices;

            // Snap to first vertex to close
            if (verts.length >= 3) {
                if (dist(pt, verts[0]) < SNAP_RADIUS) {
                    polyState.closed = true;
                    draw();
                    computeBoundingBox();
                    return;
                }
            }

            verts.push(pt);
            draw();
        });

        canvas.addEventListener('dblclick', function (e) {
            e.preventDefault();
            if (polyState.closed || polyState.vertices.length < 3) return;
            polyState.closed = true;
            draw();
            computeBoundingBox();
        });

        clearBtn.addEventListener('click', clearPoly);

        useBtn.addEventListener('click', function () {
            var along = parseFloat(alongSpan.textContent) || 0;
            var from = parseFloat(fromSpan.textContent) || 0;
            if (along > 0 && from > 0) {
                document.getElementById('deck-len').value = along;
                document.getElementById('deck-wid').value = from;
            }
        });

        scaleInput.addEventListener('change', function () {
            polyState.scale = getScale();
            draw();
            computeBoundingBox();
        });

        draw();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 50);
        });
    } else {
        setTimeout(init, 50);
    }
})();
