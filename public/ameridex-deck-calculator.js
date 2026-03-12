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

    // Convert decimal feet to feet-inches string, e.g. 12.5 → 12' 6"
    function fmtFtIn(decimalFt) {
        var totalInches = Math.round(decimalFt * 12);
        var feet = Math.floor(totalInches / 12);
        var inches = totalInches % 12;
        if (inches === 0) return feet + "'";
        if (feet === 0) return inches + '"';
        return feet + "' " + inches + '"';
    }
    window.fmtFtIn = fmtFtIn;

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

    // === POLYGON AREA (Shoelace formula) ===
    function polygonAreaSqFt(verts, gs, scale) {
        var n = verts.length;
        var area = 0;
        for (var i = 0; i < n; i++) {
            var j = (i + 1) % n;
            area += verts[i].x * verts[j].y;
            area -= verts[j].x * verts[i].y;
        }
        area = Math.abs(area) / 2;
        var pxPerFt = gs / scale;
        return area / (pxPerFt * pxPerFt);
    }

    // === POLYGON-AWARE BOARD CALCULATION ===
    // Sweeps across the polygon in EFFECTIVE_FT increments, finds line-polygon
    // intersections for each row, determines board counts per row, and returns
    // a result structure compatible with optimizeBoards().
    function computePolygonBoards(verts, gs, scale, orientation, wastePct, joistSpacingIn) {
        var isPerpendicular = (orientation === 'perpendicular');
        var wasteMultiplier = 1 + (wastePct / 100);
        var pxPerFt = gs / scale;

        // Convert vertices to feet
        var vertsFt = verts.map(function (v) {
            return { x: v.x / pxPerFt, y: v.y / pxPerFt };
        });

        // Bounding box in feet
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < vertsFt.length; i++) {
            if (vertsFt[i].x < minX) minX = vertsFt[i].x;
            if (vertsFt[i].x > maxX) maxX = vertsFt[i].x;
            if (vertsFt[i].y < minY) minY = vertsFt[i].y;
            if (vertsFt[i].y > maxY) maxY = vertsFt[i].y;
        }
        var alongHouse = maxX - minX;
        var fromHouse = maxY - minY;
        var truAreaSqFt = polygonAreaSqFt(verts, gs, scale);

        // Sweep axis: perpendicular boards run vertically (sweep along X),
        // parallel boards run horizontally (sweep along Y).
        var sweepMin, sweepMax;
        if (isPerpendicular) {
            sweepMin = minX; sweepMax = maxX;
        } else {
            sweepMin = minY; sweepMax = maxY;
        }

        // Find intersections of a sweep line with the polygon edges.
        // sweepVal is the position on the sweep axis; returns sorted list of
        // intersection values on the board axis.
        function findIntersections(sweepVal) {
            var hits = [];
            var n = vertsFt.length;
            for (var i = 0; i < n; i++) {
                var j = (i + 1) % n;
                var a = vertsFt[i], b = vertsFt[j];
                var aSweep, bSweep, aBoard, bBoard;
                if (isPerpendicular) {
                    aSweep = a.x; bSweep = b.x; aBoard = a.y; bBoard = b.y;
                } else {
                    aSweep = a.y; bSweep = b.y; aBoard = a.x; bBoard = b.x;
                }
                // Check if edge straddles the sweep line
                if ((aSweep <= sweepVal && bSweep > sweepVal) ||
                    (bSweep <= sweepVal && aSweep > sweepVal)) {
                    var t = (sweepVal - aSweep) / (bSweep - aSweep);
                    hits.push(aBoard + t * (bBoard - aBoard));
                }
            }
            hits.sort(function (a, b) { return a - b; });
            return hits;
        }

        // Detect whether an edge crossing the sweep line at a given position
        // is angled (not perpendicular to the board direction).
        function hasAngledEdgeAt(sweepVal) {
            var n = vertsFt.length;
            for (var i = 0; i < n; i++) {
                var j = (i + 1) % n;
                var a = vertsFt[i], b = vertsFt[j];
                var aSweep, bSweep;
                if (isPerpendicular) {
                    aSweep = a.x; bSweep = b.x;
                } else {
                    aSweep = a.y; bSweep = b.y;
                }
                if ((aSweep <= sweepVal && bSweep > sweepVal) ||
                    (bSweep <= sweepVal && aSweep > sweepVal)) {
                    // If the edge also has a component along the sweep axis,
                    // the cut will be angled.
                    var dSweep = Math.abs(bSweep - aSweep);
                    var dBoard = Math.abs(isPerpendicular ? (b.y - a.y) : (b.x - a.x));
                    if (dSweep > 0.01 && dBoard > 0.01) return true;
                }
            }
            return false;
        }

        // Compute the cut angle (deviation from perpendicular) for edges
        // crossing the sweep line at a given board-axis hit position.
        // Returns an array of { angle, side } for the entry (min) and exit (max) hits.
        function edgeCutAngles(sweepVal, hitMin, hitMax) {
            var n = vertsFt.length;
            var startAngle = 0, endAngle = 0;
            for (var i = 0; i < n; i++) {
                var j = (i + 1) % n;
                var a = vertsFt[i], b = vertsFt[j];
                var aSweep, bSweep, aBoard, bBoard;
                if (isPerpendicular) {
                    aSweep = a.x; bSweep = b.x; aBoard = a.y; bBoard = b.y;
                } else {
                    aSweep = a.y; bSweep = b.y; aBoard = a.x; bBoard = b.x;
                }
                if ((aSweep <= sweepVal && bSweep > sweepVal) ||
                    (bSweep <= sweepVal && aSweep > sweepVal)) {
                    var t = (sweepVal - aSweep) / (bSweep - aSweep);
                    var hitBoard = aBoard + t * (bBoard - aBoard);
                    // Edge angle: atan2(dSweep, dBoard) gives angle from board axis
                    var dSweep = Math.abs(bSweep - aSweep);
                    var dBoard = Math.abs(bBoard - aBoard);
                    var angleDeg = (dSweep > 0.01 && dBoard > 0.01)
                        ? Math.round(Math.atan2(dSweep, dBoard) * (180 / Math.PI))
                        : 0;
                    // Assign to start (entry) or end (exit) based on proximity
                    if (Math.abs(hitBoard - hitMin) < 0.01) startAngle = angleDeg;
                    if (Math.abs(hitBoard - hitMax) < 0.01) endAngle = angleDeg;
                }
            }
            return { startAngle: startAngle, endAngle: endAngle };
        }

        var ANGLE_CUT_WASTE = 0.05; // 5% extra waste for angled cuts
        var MIN_SEGMENT_FT = 0.5;   // ignore slivers smaller than 6 inches

        // Build per-standard-length tallies
        var optionData = {};
        STD_LENGTHS.forEach(function (stdLen) {
            optionData[stdLen] = { totalBoards: 0, totalLinearFt: 0, wasteLinearFt: 0, buttJointRows: 0 };
        });

        var totalBoardRows = 0;
        var cutDetails = [];

        for (var pos = sweepMin + EFFECTIVE_FT / 2; pos < sweepMax; pos += EFFECTIVE_FT) {
            var hits = findIntersections(pos);
            var angled = hasAngledEdgeAt(pos);

            // Pair intersections: [entry, exit, entry, exit, ...]
            for (var h = 0; h + 1 < hits.length; h += 2) {
                var segLen = hits[h + 1] - hits[h];
                if (segLen < MIN_SEGMENT_FT) continue;

                totalBoardRows++;
                var angleFactor = angled ? (1 + ANGLE_CUT_WASTE) : 1;

                // Collect cut detail for this row
                var angles = edgeCutAngles(pos, hits[h], hits[h + 1]);
                cutDetails.push({
                    row: totalBoardRows,
                    positionFt: Math.round((pos - sweepMin) * 100) / 100,
                    lengthFt: Math.round(segLen * 100) / 100,
                    startCut: angles.startAngle > 0 ? 'angled' : 'straight',
                    endCut: angles.endAngle > 0 ? 'angled' : 'straight',
                    startAngle: angles.startAngle,
                    endAngle: angles.endAngle
                });

                STD_LENGTHS.forEach(function (stdLen) {
                    var d = optionData[stdLen];
                    var effectiveSegLen = segLen * angleFactor;
                    if (stdLen >= effectiveSegLen) {
                        d.totalBoards += 1;
                        d.totalLinearFt += stdLen;
                        d.wasteLinearFt += (stdLen - effectiveSegLen);
                    } else {
                        var boardsNeeded = Math.ceil(effectiveSegLen / stdLen);
                        d.totalBoards += boardsNeeded;
                        d.totalLinearFt += boardsNeeded * stdLen;
                        d.wasteLinearFt += (boardsNeeded * stdLen - effectiveSegLen);
                        d.buttJointRows++;
                    }
                });
            }
        }

        // Build options array matching optimizeBoards() format
        var options = [];
        STD_LENGTHS.forEach(function (stdLen) {
            var d = optionData[stdLen];
            var totalBoardsWithWaste = Math.ceil(d.totalBoards * wasteMultiplier);
            var extraWasteBoards = totalBoardsWithWaste - d.totalBoards;
            var totalLF = totalBoardsWithWaste * stdLen;
            var wasteLF = d.wasteLinearFt + extraWasteBoards * stdLen;
            var wastePctActual = totalLF > 0 ? (wasteLF / totalLF * 100) : 0;

            options.push({
                length: stdLen,
                label: stdLen + "' Standard",
                isCustom: false,
                boardsPerRow: d.totalBoards > 0 ? Math.round(d.totalBoards / Math.max(totalBoardRows, 1) * 10) / 10 : 0,
                boardRows: totalBoardRows,
                totalBoards: totalBoardsWithWaste,
                totalLinearFt: Math.round(totalLF),
                wasteLinearFt: Math.round(wasteLF),
                wastePct: Math.round(wastePctActual * 10) / 10,
                buttJoints: d.buttJointRows > 0,
                note: d.buttJointRows > 0
                    ? d.buttJointRows + ' rows need butt joints, polygon shape'
                    : 'Single board/row, polygon shape',
                recommended: false
            });
        });

        options.sort(function (a, b) {
            if (a.wasteLinearFt !== b.wasteLinearFt) return a.wasteLinearFt - b.wasteLinearFt;
            return a.totalLinearFt - b.totalLinearFt;
        });
        if (options.length > 0) options[0].recommended = true;

        var joistCount = Math.floor(alongHouse * 12 / joistSpacingIn) + 1;

        // Build cut summary
        var straightRows = 0;
        var angledRows = 0;
        var uniqueAnglesSet = {};
        for (var ci = 0; ci < cutDetails.length; ci++) {
            var cd = cutDetails[ci];
            if (cd.startAngle === 0 && cd.endAngle === 0) {
                straightRows++;
            } else {
                angledRows++;
                if (cd.startAngle > 0) uniqueAnglesSet[cd.startAngle] = true;
                if (cd.endAngle > 0) uniqueAnglesSet[cd.endAngle] = true;
            }
        }
        var uniqueAngles = Object.keys(uniqueAnglesSet).map(Number).sort(function(a, b) { return a - b; });

        // Build descriptive waste note
        var angledWasteNote = '';
        if (angledRows > 0) {
            // Find contiguous runs of angled rows
            var angledRowNums = cutDetails.filter(function(c) { return c.startAngle > 0 || c.endAngle > 0; })
                .map(function(c) { return c.row; });
            var firstAngled = angledRowNums[0];
            var lastAngled = angledRowNums[angledRowNums.length - 1];
            var angleDesc = uniqueAngles.join('\u00B0/') + '\u00B0';
            var sideDesc = [];
            var hasStart = cutDetails.some(function(c) { return c.startAngle > 0; });
            var hasEnd = cutDetails.some(function(c) { return c.endAngle > 0; });
            if (hasStart) sideDesc.push('house-side');
            if (hasEnd) sideDesc.push('yard-side');
            angledWasteNote = 'Rows ' + firstAngled + '\u2013' + lastAngled + ' need a ' + angleDesc + ' angled cut on ' + sideDesc.join(' and ') + ' end';
        }

        var cutSummary = {
            totalRows: totalBoardRows,
            straightRows: straightRows,
            angledRows: angledRows,
            uniqueAngles: uniqueAngles,
            angledWasteNote: angledWasteNote
        };

        return {
            deckAreaSqFt: Math.round(truAreaSqFt * 10) / 10,
            spanFt: isPerpendicular ? fromHouse : alongHouse,
            coverageFt: isPerpendicular ? alongHouse : fromHouse,
            alongHouse: Math.round(alongHouse * 10) / 10,
            fromHouse: Math.round(fromHouse * 10) / 10,
            boardRows: totalBoardRows,
            orientation: orientation,
            joistCount: joistCount,
            joistSpacingIn: joistSpacingIn,
            wastePct: wastePct,
            options: options,
            isPolygon: true,
            cutDetails: cutDetails,
            cutSummary: cutSummary
        };
    }

    // === CUT LIST OPTIMIZER (First-Fit-Decreasing Bin Packing) ===
    var KERF_FT = 0.021;        // ~1/4" saw blade width
    var MIN_REUSABLE_FT = 1.0;  // offcuts under 1' are always waste

    function generateCutList(cutDetails, boardLength) {
        // Build segment list from cutDetails
        var segments = cutDetails.map(function (cd) {
            var maxAngle = Math.max(cd.startAngle || 0, cd.endAngle || 0);
            return {
                row: cd.row,
                cutLength: cd.lengthFt,
                angle: maxAngle,
                cutType: maxAngle > 0 ? 'angled' : 'straight'
            };
        });

        // Sort longest-first (FFD)
        segments.sort(function (a, b) { return b.cutLength - a.cutLength; });

        var boards = []; // each: { boardNum, boardLength, cuts[], remaining }

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var needed = seg.cutLength + KERF_FT; // cut + kerf
            var placed = false;

            // Try to fit into an existing board's remaining space
            for (var b = 0; b < boards.length; b++) {
                if (boards[b].remaining >= needed && boards[b].remaining >= MIN_REUSABLE_FT) {
                    boards[b].cuts.push({
                        row: seg.row,
                        cutLength: seg.cutLength,
                        angle: seg.angle,
                        cutType: seg.cutType,
                        isReuse: true
                    });
                    boards[b].remaining -= needed;
                    placed = true;
                    break;
                }
            }

            // Allocate a new board
            if (!placed) {
                boards.push({
                    boardNum: boards.length + 1,
                    boardLength: boardLength,
                    cuts: [{
                        row: seg.row,
                        cutLength: seg.cutLength,
                        angle: seg.angle,
                        cutType: seg.cutType,
                        isReuse: false
                    }],
                    remaining: boardLength - needed
                });
            }
        }

        // Compute summary stats
        var totalWaste = 0;
        var reuseCount = 0;
        for (var bi = 0; bi < boards.length; bi++) {
            var bd = boards[bi];
            var totalUsed = 0;
            for (var ci = 0; ci < bd.cuts.length; ci++) {
                totalUsed += bd.cuts[ci].cutLength + KERF_FT;
                if (bd.cuts[ci].isReuse) reuseCount++;
            }
            bd.totalUsed = totalUsed;
            bd.wasteLength = boardLength - totalUsed;
            bd.offcutLength = bd.remaining;
            bd.offcutUsed = bd.cuts.length > 1;
        }
        for (var wi = 0; wi < boards.length; wi++) {
            totalWaste += boards[wi].wasteLength;
        }

        var totalLinear = boards.length * boardLength;
        var wastePct = totalLinear > 0 ? (totalWaste / totalLinear * 100) : 0;

        return {
            boards: boards,
            totalBoardsPurchased: boards.length,
            totalWasteFt: Math.round(totalWaste * 10) / 10,
            wastePct: Math.round(wastePct * 10) / 10,
            reuseCount: reuseCount,
            reuseNote: reuseCount > 0
                ? reuseCount + ' offcut' + (reuseCount !== 1 ? 's' : '') + ' reused, saving ' + reuseCount + ' board' + (reuseCount !== 1 ? 's' : '')
                : 'No offcuts large enough to reuse'
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
            var summaryText = result.deckAreaSqFt + ' sq ft' +
                (result.isPolygon ? ' (polygon)' : '') + ' | ' +
                fmtFtIn(result.coverageFt) + ' x ' + fmtFtIn(result.spanFt) + ' | ' +
                result.boardRows + ' board rows | ' +
                result.joistCount + ' joists @ ' + result.joistSpacingIn + '" OC';
            summaryEl.textContent = summaryText;
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
            html += '<td style="padding:0.5rem;text-align:right;border:1px solid ' + borderColor + '">' + fmtFtIn(opt.totalLinearFt) + '</td>';
            html += '<td style="padding:0.5rem;text-align:right;border:1px solid ' + borderColor + ';color:' + wasteColor + ';font-weight:600">';
            html += fmtFtIn(opt.wasteLinearFt) + ' (' + opt.wastePct + '%)';
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
            html += '<div>Linear ft: <strong>' + fmtFtIn(opt.totalLinearFt) + '</strong></div>';
            html += '<div style="color:' + wasteColor + '">Waste: <strong>' + fmtFtIn(opt.wasteLinearFt) + ' (' + opt.wastePct + '%)</strong></div>';
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

        // === MATERIAL SHOPPING LIST ===
        var boardTypeEl = document.getElementById('calc-board-type');
        var boardType = boardTypeEl ? boardTypeEl.value : 'system';
        var color = getActiveColor();
        var pricePerFt = boardType === 'system' ? 8 : 6;
        var solidPricePerFt = 6;
        var boardTypeLabel = boardType === 'system' ? 'AmeriDex System'
                           : boardType === 'grooved' ? 'Grooved'
                           : 'Solid Edge';

        var totalItemCount = 0;
        var totalBoxCount = 0;
        var estimatedTotal = 0;

        // Deck boards price
        var deckBoardPrice = opt.totalBoards * opt.length * pricePerFt;
        totalItemCount += opt.totalBoards;
        estimatedTotal += deckBoardPrice;

        // Fastener boxes
        var screwBoxPrice = 37.00;
        var plugBoxPrice = 33.79;
        totalBoxCount += fasteners.screwBoxes + fasteners.plugBoxes;
        estimatedTotal += fasteners.screwBoxes * screwBoxPrice + fasteners.plugBoxes * plugBoxPrice;

        // Collect solid edge items for shopping list
        var solidItems = [];

        var pfCheck = document.getElementById('pic-frame');
        if (pfCheck && pfCheck.checked) {
            var slPfType = (document.getElementById('pf-type') || {}).value || 'single';
            var slPfLongSide = Math.max(result.coverageFt, result.spanFt);
            var slPfBoardLen = slPfLongSide <= 12 ? 12 : slPfLongSide <= 16 ? 16 : 20;
            var slBoardsAlongSpan = Math.ceil(result.spanFt / slPfBoardLen) * 2;
            var slBoardsAlongCoverage = Math.ceil(result.coverageFt / slPfBoardLen) * 2;
            var slPfBoards = slBoardsAlongSpan + slBoardsAlongCoverage;
            if (slPfType === 'double') slPfBoards = slPfBoards * 2;
            var slPfColor = ((document.getElementById('pf-color-swatches') || {}).dataset && document.getElementById('pf-color-swatches').dataset.selected) || color;
            var slPfPrice = slPfBoards * slPfBoardLen * solidPricePerFt;
            solidItems.push({ qty: slPfBoards, length: slPfBoardLen, color: slPfColor, label: 'picture frame' + (slPfType === 'double' ? ', double' : ''), price: slPfPrice });
            totalItemCount += slPfBoards;
            estimatedTotal += slPfPrice;
        }

        var bbCheck = document.getElementById('breaker-board');
        if (bbCheck && bbCheck.checked) {
            var slBbCoverage = result.coverageFt;
            var slBbBoardLen = slBbCoverage <= 12 ? 12 : slBbCoverage <= 16 ? 16 : 20;
            var slBbBoardCount = Math.ceil(slBbCoverage / slBbBoardLen);
            var slBbColor = ((document.getElementById('breaker-color-swatches') || {}).dataset && document.getElementById('breaker-color-swatches').dataset.selected) || color;
            var slBbPrice = slBbBoardCount * slBbBoardLen * solidPricePerFt;
            solidItems.push({ qty: slBbBoardCount, length: slBbBoardLen, color: slBbColor, label: 'breaker board', price: slBbPrice });
            totalItemCount += slBbBoardCount;
            estimatedTotal += slBbPrice;
        }

        var stCheck = document.getElementById('stairs');
        if (stCheck && stCheck.checked) {
            var slSteps = parseInt((document.getElementById('stair-steps') || {}).value) || 1;
            var slTreadsPerStep = parseInt((document.getElementById('stair-treads') || {}).value) || 1;
            var slTreadBoards = slSteps * slTreadsPerStep;
            var slHasRisers = document.getElementById('stair-risers') && document.getElementById('stair-risers').checked;
            var slRiserBoards = slHasRisers ? slSteps : 0;
            var slStairWidth = parseFloat((document.getElementById('stair-width') || {}).value) || result.coverageFt;
            var slStBoardLen = slStairWidth <= 12 ? 12 : slStairWidth <= 16 ? 16 : 20;
            var slStColor = ((document.getElementById('stair-color-swatches') || {}).dataset && document.getElementById('stair-color-swatches').dataset.selected) || color;
            var slTreadPrice = slTreadBoards * slStBoardLen * solidPricePerFt;
            solidItems.push({ qty: slTreadBoards, length: slStBoardLen, color: slStColor, label: 'stair treads', price: slTreadPrice });
            totalItemCount += slTreadBoards;
            estimatedTotal += slTreadPrice;
            if (slRiserBoards > 0) {
                var slRiserPrice = slRiserBoards * slStBoardLen * solidPricePerFt;
                solidItems.push({ qty: slRiserBoards, length: slStBoardLen, color: slStColor, label: 'stair risers', price: slRiserPrice });
                totalItemCount += slRiserBoards;
                estimatedTotal += slRiserPrice;
            }
        }

        function fmtMoney(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

        var html = '<div style="background:#fff;border-left:4px solid #2563eb;border:1px solid #dbeafe;border-left:4px solid #2563eb;border-radius:8px;padding:1rem;margin-bottom:1rem">' +
            '<div style="font-size:1rem;font-weight:700;color:#1e40af;margin-bottom:0.6rem">\uD83D\uDCCB MATERIAL SHOPPING LIST</div>' +
            '<table style="width:100%;font-size:0.85rem;border-collapse:collapse">' +
            '<tr style="border-bottom:1px solid #e5e7eb"><td colspan="3" style="padding:4px 0;font-weight:600;color:#374151">DECKING</td></tr>' +
            '<tr><td style="padding:2px 0">\u2022 ' + opt.totalBoards + 'x ' + boardTypeLabel + ' boards, ' + opt.length + '\', ' + color + '</td>' +
            '<td style="text-align:right;padding:2px 0;color:#374151">' + fmtMoney(deckBoardPrice) + '</td></tr>' +
            '<tr style="border-bottom:1px solid #e5e7eb"><td colspan="3" style="padding:6px 0 4px;font-weight:600;color:#374151">FASTENERS</td></tr>' +
            '<tr><td style="padding:2px 0">\u2022 ' + fasteners.screwBoxes + 'x Screw box' + s + ' (375/box)</td>' +
            '<td style="text-align:right;padding:2px 0;color:#6b7280">' + fmtMoney(fasteners.screwBoxes * screwBoxPrice) + '</td></tr>' +
            '<tr><td style="padding:2px 0">\u2022 ' + fasteners.plugBoxes + 'x Plug box' + p + ' (375/box)</td>' +
            '<td style="text-align:right;padding:2px 0;color:#6b7280">' + fmtMoney(fasteners.plugBoxes * plugBoxPrice) + '</td></tr>';

        if (solidItems.length > 0) {
            html += '<tr style="border-bottom:1px solid #e5e7eb"><td colspan="3" style="padding:6px 0 4px;font-weight:600;color:#374151">SOLID EDGE BOARDS</td></tr>';
            for (var si = 0; si < solidItems.length; si++) {
                var item = solidItems[si];
                html += '<tr><td style="padding:2px 0">\u2022 ' + item.qty + 'x Solid Edge, ' + item.length + '\', ' + item.color + ' (' + item.label + ')</td>' +
                    '<td style="text-align:right;padding:2px 0;color:#374151">' + fmtMoney(item.price) + '</td></tr>';
            }
        }

        html += '<tr style="border-top:2px solid #1e40af"><td style="padding:6px 0;font-weight:700;color:#1e40af">TOTAL: ' + totalItemCount + ' boards + ' + totalBoxCount + ' boxes</td>' +
            '<td style="text-align:right;padding:6px 0;font-weight:700;color:#1e40af;font-size:1rem">' + fmtMoney(estimatedTotal) + '</td></tr>' +
            '</table></div>';

        html +=
            '<strong>Fasteners for ' + opt.label + ':</strong><br>' +
            'Screws: <strong>' + fasteners.totalScrews.toLocaleString() + '</strong> total = ' +
            '<strong>' + fasteners.screwBoxes + ' box' + s + '</strong> (375/box)<br>' +
            'Plugs: <strong>' + fasteners.totalPlugs.toLocaleString() + '</strong> total = ' +
            '<strong>' + fasteners.plugBoxes + ' box' + p + '</strong> (375/box)<br>' +
            '<span style="font-size:0.8rem;color:#4b5563">' +
                opt.boardRows + ' board rows &times; ' + result.joistCount + ' joists &times; ' +
                SCREWS_PER_CROSSING + ' screws per crossing = ' + fasteners.totalScrews.toLocaleString() + ' screws' +
            '</span>';

        // Additional Materials Preview — read directly from DOM checkboxes
        var additionalItems = [];
        var pfCheck = document.getElementById('pic-frame');
        if (pfCheck && pfCheck.checked) {
            var pfType = (document.getElementById('pf-type') || {}).value || 'single';
            var pfLongSide = Math.max(result.coverageFt, result.spanFt);
            var pfBoardLen = pfLongSide <= 12 ? 12 : pfLongSide <= 16 ? 16 : 20;
            var boardsAlongSpan = Math.ceil(result.spanFt / pfBoardLen) * 2;
            var boardsAlongCoverage = Math.ceil(result.coverageFt / pfBoardLen) * 2;
            var pfBoards = boardsAlongSpan + boardsAlongCoverage;
            if (pfType === 'double') pfBoards = pfBoards * 2;
            additionalItems.push('Picture frame: <strong>' + pfBoards + '</strong> solid edge board' + (pfBoards !== 1 ? 's' : '') + ' (' + (pfType === 'double' ? 'double' : 'single') + ')');
        }

        var bbCheck = document.getElementById('breaker-board');
        if (bbCheck && bbCheck.checked) {
            var bbCoverage = result.coverageFt;
            var bbBoardLen = bbCoverage <= 12 ? 12 : bbCoverage <= 16 ? 16 : 20;
            var bbBoardCount = Math.ceil(bbCoverage / bbBoardLen);
            additionalItems.push('Breaker board: <strong>' + bbBoardCount + '</strong> solid edge board' + (bbBoardCount !== 1 ? 's' : ''));
        }

        var stCheck = document.getElementById('stairs');
        if (stCheck && stCheck.checked) {
            var steps = parseInt((document.getElementById('stair-steps') || {}).value) || 1;
            var treadsPerStep = parseInt((document.getElementById('stair-treads') || {}).value) || 1;
            var treadBoards = steps * treadsPerStep;
            var hasRisers = document.getElementById('stair-risers') && document.getElementById('stair-risers').checked;
            var riserBoards = hasRisers ? steps : 0;
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

        // Cut Guide — only for polygon mode
        if (result.isPolygon && result.cutSummary && result.cutDetails) {
            var cs = result.cutSummary;
            var cd = result.cutDetails;
            html += '<div style="margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid #fde68a">' +
                '<strong>\u2702\uFE0F Cut Guide:</strong><br>';
            if (cs.straightRows > 0) {
                html += '\u2022 ' + cs.straightRows + ' board' + (cs.straightRows !== 1 ? 's' : '') + ': Straight cuts only (square ends)<br>';
            }
            if (cs.angledRows > 0) {
                var angleDesc = cs.uniqueAngles.join('\u00B0/') + '\u00B0';
                var hasStartAngle = cd.some(function(c) { return c.startAngle > 0; });
                var hasEndAngle = cd.some(function(c) { return c.endAngle > 0; });
                var sideStr = [];
                if (hasStartAngle) sideStr.push('house-side');
                if (hasEndAngle) sideStr.push('yard-side');
                html += '\u2022 ' + cs.angledRows + ' board' + (cs.angledRows !== 1 ? 's' : '') + ': ' + angleDesc + ' angle cut on ' + sideStr.join(' and ') + ' end<br>';
            }
            html += '<span style="font-size:0.8rem;color:#6b7280">Angled cuts add ~5% waste. Set your miter saw to the angles shown above.</span>';

            // === Cut List Optimization ===
            var cutList = generateCutList(result.cutDetails, opt.length);

            // Build a row→boardNum lookup for the detail table
            var rowBoardMap = {};
            for (var bli = 0; bli < cutList.boards.length; bli++) {
                var brd = cutList.boards[bli];
                for (var bci = 0; bci < brd.cuts.length; bci++) {
                    rowBoardMap[brd.cuts[bci].row] = brd.boardNum;
                }
            }

            // Summary stats
            html += '<div style="margin-top:0.6rem;padding:0.5rem 0.75rem;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:0.85rem">' +
                '<strong>Cut Plan for ' + opt.length + '\' boards:</strong><br>' +
                '\u2022 Purchase: <strong>' + cutList.totalBoardsPurchased + ' boards</strong> (' + opt.length + '\')<br>' +
                '\u2022 ' + cutList.reuseNote + '<br>' +
                '\u2022 Total waste: <strong>' + fmtFtIn(cutList.totalWasteFt) + '</strong> (' + cutList.wastePct + '%)<br>' +
                '<span style="font-size:0.75rem;color:#6b7280">\u2702 Kerf allowance: \u00BC" per cut (saw blade width)</span>' +
                '<br><button type="button" class="btn btn-outline btn-sm" onclick="printCutPlan()" style="margin-top:0.5rem">Print Cut Plan</button>' +
                '</div>';

            // Visual board bars
            html += '<details style="margin-top:0.5rem">' +
                '<summary style="cursor:pointer;font-size:0.82rem;color:#2563eb">Visual board plan</summary>' +
                '<div style="margin-top:0.5rem">';
            for (var vbi = 0; vbi < cutList.boards.length; vbi++) {
                var vb = cutList.boards[vbi];
                html += '<div style="display:flex;align-items:center;margin-bottom:3px;font-size:0.72rem">' +
                    '<span style="width:52px;flex-shrink:0;color:#374151;font-weight:600">#' + vb.boardNum + '</span>' +
                    '<div style="flex:1;display:flex;height:22px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden">';
                for (var vci = 0; vci < vb.cuts.length; vci++) {
                    var vc = vb.cuts[vci];
                    var pct = (vc.cutLength / vb.boardLength * 100).toFixed(1);
                    var bgColor = vc.isReuse ? '#bbf7d0' : '#dbeafe';
                    var borderRight = 'border-right:1px solid rgba(0,0,0,0.15);';
                    var angleTag = vc.angle > 0 ? ' \u2220' + vc.angle + '\u00B0' : '';
                    html += '<div style="flex:0 0 ' + pct + '%;background:' + bgColor + ';' + borderRight +
                        'display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;padding:0 3px" ' +
                        'title="Row ' + vc.row + ': ' + fmtFtIn(vc.cutLength) + angleTag + (vc.isReuse ? ' (reused offcut)' : '') + '">' +
                        '<span style="color:#1e3a5f;font-size:0.65rem">R' + vc.row + ': ' + fmtFtIn(vc.cutLength) + '</span></div>';
                }
                // Waste segment
                if (vb.wasteLength > 0.01) {
                    var wastePct = (vb.wasteLength / vb.boardLength * 100).toFixed(1);
                    var wasteColor = vb.wasteLength < MIN_REUSABLE_FT ? '#fecaca' : '#fee2e2';
                    html += '<div style="flex:0 0 ' + wastePct + '%;background:' + wasteColor +
                        ';display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;padding:0 2px" ' +
                        'title="Waste: ' + fmtFtIn(vb.wasteLength) + '">' +
                        '<span style="color:#991b1b;font-size:0.6rem">' + fmtFtIn(vb.wasteLength) + '</span></div>';
                }
                html += '</div></div>';
            }
            // Legend
            html += '<div style="display:flex;gap:12px;margin-top:4px;font-size:0.7rem;color:#6b7280">' +
                '<span><span style="display:inline-block;width:10px;height:10px;background:#dbeafe;border:1px solid #93c5fd;border-radius:2px;vertical-align:middle"></span> Primary cut</span>' +
                '<span><span style="display:inline-block;width:10px;height:10px;background:#bbf7d0;border:1px solid #86efac;border-radius:2px;vertical-align:middle"></span> Reused offcut</span>' +
                '<span><span style="display:inline-block;width:10px;height:10px;background:#fecaca;border:1px solid #fca5a5;border-radius:2px;vertical-align:middle"></span> Waste</span>' +
                '</div></div></details>';

            // Board-by-board text detail
            html += '<details style="margin-top:0.5rem">' +
                '<summary style="cursor:pointer;font-size:0.82rem;color:#2563eb">Board-by-board cutting instructions</summary>' +
                '<div style="max-height:260px;overflow-y:auto;margin-top:0.5rem;font-size:0.78rem">';
            for (var tbi = 0; tbi < cutList.boards.length; tbi++) {
                var tb = cutList.boards[tbi];
                html += '<div style="margin-bottom:4px;padding:3px 6px;background:' + (tbi % 2 === 0 ? '#fff' : '#f9fafb') + ';border-radius:3px">' +
                    '<strong>Board #' + tb.boardNum + '</strong> (' + opt.length + '\'):&nbsp; ';
                for (var tci = 0; tci < tb.cuts.length; tci++) {
                    var tc = tb.cuts[tci];
                    if (tci > 0) html += ' &rarr; ';
                    var cutStyle = tc.isReuse ? 'color:#15803d' : '';
                    var angleNote = tc.angle > 0 ? ' <span style="color:#d97706">[' + tc.angle + '\u00B0]</span>' : ' [straight]';
                    html += '<span style="' + cutStyle + '">Row ' + tc.row + ': cut ' + fmtFtIn(tc.cutLength) + angleNote + '</span>';
                    if (tc.isReuse) html += ' <span style="font-size:0.7rem;color:#16a34a">(from offcut)</span>';
                }
                if (tb.wasteLength > 0.01) {
                    html += ' | <span style="color:#dc2626">Waste: ' + fmtFtIn(tb.wasteLength) + '</span>';
                }
                html += '</div>';
            }
            html += '</div></details>';

            // Expandable row-by-row detail table with Board # column
            html += '<details style="margin-top:0.5rem">' +
                '<summary style="cursor:pointer;font-size:0.82rem;color:#2563eb">View row-by-row cut details</summary>' +
                '<div style="max-height:200px;overflow-y:auto;margin-top:0.5rem">' +
                '<table style="width:100%;font-size:0.78rem;border-collapse:collapse">' +
                '<thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left">' +
                '<th style="padding:2px 6px">Row</th>' +
                '<th style="padding:2px 6px">Board\u00A0#</th>' +
                '<th style="padding:2px 6px">Position</th>' +
                '<th style="padding:2px 6px">Length</th>' +
                '<th style="padding:2px 6px">Start</th>' +
                '<th style="padding:2px 6px">End</th>' +
                '</tr></thead><tbody>';
            for (var ri = 0; ri < cd.length; ri++) {
                var row = cd[ri];
                var startLabel = row.startAngle > 0 ? row.startAngle + '\u00B0' : 'straight';
                var endLabel = row.endAngle > 0 ? row.endAngle + '\u00B0' : 'straight';
                var rowBg = ri % 2 === 0 ? '' : ' style="background:#f9fafb"';
                var boardRef = rowBoardMap[row.row] || '—';
                html += '<tr' + rowBg + '>' +
                    '<td style="padding:2px 6px">' + row.row + '</td>' +
                    '<td style="padding:2px 6px">' + boardRef + '</td>' +
                    '<td style="padding:2px 6px">' + fmtFtIn(row.positionFt) + '</td>' +
                    '<td style="padding:2px 6px">' + fmtFtIn(row.lengthFt) + '</td>' +
                    '<td style="padding:2px 6px">' + startLabel + '</td>' +
                    '<td style="padding:2px 6px">' + endLabel + '</td>' +
                    '</tr>';
            }
            html += '</tbody></table></div></details></div>';
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

        // Use polygon-aware calculation when a closed polygon shape exists
        var polyIndicator = document.getElementById('polygon-active-indicator');
        if (polyState.closed && polyState.vertices.length >= 3) {
            var gs = 30; // getGridSize() inside polygon tool
            var scaleInput = document.getElementById('polygon-scale');
            var polyScale = scaleInput ? (parseFloat(scaleInput.value) || 2) : 2;
            currentCalcResult = computePolygonBoards(polyState.vertices, gs, polyScale, orientation, wastePct, joistSpacing);
            if (polyIndicator) polyIndicator.style.display = '';
        } else {
            currentCalcResult = optimizeBoards(alongHouse, fromHouse, orientation, wastePct, joistSpacing);
            if (polyIndicator) polyIndicator.style.display = 'none';
        }

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
        // Read directly from DOM so it works even if the quote hasn't been saved yet
        var pfCheckbox = document.getElementById('pic-frame');
        var pfOpt = pfCheckbox && pfCheckbox.checked ? {
            enabled: true,
            type: (document.getElementById('pf-type') || {}).value || 'single',
            color: (document.getElementById('pf-color-swatches') || {}).dataset && document.getElementById('pf-color-swatches').dataset.selected || null
        } : null;
        if (pfOpt && pfOpt.enabled) {
            // Picture frame runs around the full perimeter. Use the longest side
            // to pick board length so boards cover any side without butt joints.
            var pfLongSide = Math.max(currentCalcResult.coverageFt, currentCalcResult.spanFt);
            var pfBoardLen = pfLongSide <= 12 ? 12 : pfLongSide <= 16 ? 16 : 20;
            // Calculate boards per side, then total for all 4 sides
            var boardsAlongSpan = Math.ceil(currentCalcResult.spanFt / pfBoardLen) * 2;  // 2 sides
            var boardsAlongCoverage = Math.ceil(currentCalcResult.coverageFt / pfBoardLen) * 2;  // 2 sides
            var pfBoards = boardsAlongSpan + boardsAlongCoverage;
            if (pfOpt.type === 'double') pfBoards = pfBoards * 2;
            var pfColor = pfOpt.color || color;
            var perimeterFt = 2 * (currentCalcResult.coverageFt + currentCalcResult.spanFt);

            window.currentQuote.lineItems.push({
                type: 'solid',
                color: pfColor,
                length: pfBoardLen,
                customLength: null,
                qty: pfBoards,
                customDesc: '',
                customUnitPrice: 0,
                _source: 'calculator',
                _sourceNote: 'Picture frame (' + (pfOpt.type === 'double' ? 'double' : 'single') + '): ' + Math.round(perimeterFt) + ' LF perimeter, ' + pfBoardLen + "' boards"
            });
            itemsAdded.push(pfBoards + ' solid edge boards (picture frame, ' + (pfOpt.type === 'double' ? 'double' : 'single') + ')');
        }

        // 5. Breaker board
        // Read directly from DOM
        var bbCheckbox = document.getElementById('breaker-board');
        var bbOpt = bbCheckbox && bbCheckbox.checked ? {
            enabled: true,
            position: (document.getElementById('breaker-position') || {}).value || 'center',
            customOffset: (document.getElementById('breaker-position') || {}).value === 'custom' ? (parseFloat((document.getElementById('breaker-offset') || {}).value) || null) : null,
            color: (document.getElementById('breaker-color-swatches') || {}).dataset && document.getElementById('breaker-color-swatches').dataset.selected || null
        } : null;
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
        // Read directly from DOM
        var stCheckbox = document.getElementById('stairs');
        var stOpt = stCheckbox && stCheckbox.checked ? {
            enabled: true,
            steps: parseInt((document.getElementById('stair-steps') || {}).value) || 1,
            treadsPerStep: parseInt((document.getElementById('stair-treads') || {}).value) || 1,
            risers: !!(document.getElementById('stair-risers') && document.getElementById('stair-risers').checked),
            color: (document.getElementById('stair-color-swatches') || {}).dataset && document.getElementById('stair-color-swatches').dataset.selected || null,
            stairWidth: parseFloat((document.getElementById('stair-width') || {}).value) || null
        } : null;
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

        // 7. Save cut plan data with quote (polygon only)
        if (currentCalcResult.isPolygon && currentCalcResult.cutDetails) {
            var cpCutList = generateCutList(currentCalcResult.cutDetails, opt.length);
            window.currentQuote.cutPlan = {
                generatedAt: new Date().toISOString(),
                boardLength: opt.length,
                boardType: boardType,
                color: color,
                deckArea: currentCalcResult.deckAreaSqFt || null,
                coverageFt: currentCalcResult.coverageFt,
                spanFt: currentCalcResult.spanFt,
                isPolygon: true,
                cutList: cpCutList,
                cutSummary: currentCalcResult.cutSummary,
                cutDetails: currentCalcResult.cutDetails,
                materialSummary: {
                    deckBoards: { qty: opt.totalBoards, length: opt.length, type: boardType, color: color },
                    screwBoxes: fasteners.screwBoxes,
                    plugBoxes: fasteners.plugBoxes
                }
            };
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

        // Live feet-inches conversion displays next to inputs
        var deckLenInput = document.getElementById('deck-len');
        var deckWidInput = document.getElementById('deck-wid');
        var lenFtIn = document.getElementById('deck-len-ftin');
        var widFtIn = document.getElementById('deck-wid-ftin');
        var dimAlongLabel = document.querySelector('.dim-along .dim-label-bg');
        var dimFromLabel = document.querySelector('.dim-out .dim-label-bg');

        if (deckLenInput && lenFtIn) {
            deckLenInput.addEventListener('input', function () {
                var val = parseFloat(this.value);
                lenFtIn.textContent = val > 0 ? '= ' + fmtFtIn(val) : '';
                if (dimAlongLabel) {
                    dimAlongLabel.textContent = val > 0 ? fmtFtIn(val) + ' Along House' : 'Along House';
                }
            });
        }
        if (deckWidInput && widFtIn) {
            deckWidInput.addEventListener('input', function () {
                var val = parseFloat(this.value);
                widFtIn.textContent = val > 0 ? '= ' + fmtFtIn(val) : '';
                if (dimFromLabel) {
                    dimFromLabel.textContent = val > 0 ? fmtFtIn(val) + ' From House' : 'From House';
                }
            });
        }

        // === Polygon-clear confirmation when manually changing dimensions ===
        // Track previous values so we can revert on cancel
        var prevDeckLen = deckLenInput ? deckLenInput.value : '';
        var prevDeckWid = deckWidInput ? deckWidInput.value : '';
        // Pending change info stored while modal is open
        var pendingDimChange = null;

        function hasActivePolygon() {
            return polyState.closed && polyState.vertices.length >= 3;
        }

        function showPolygonClearModal(inputEl, prevVal) {
            var modal = document.getElementById('polygonClearModal');
            if (!modal) return false;
            pendingDimChange = { input: inputEl, prevValue: prevVal };
            modal.classList.add('active');
            return true;
        }

        function revertPendingChange() {
            if (!pendingDimChange) return;
            var info = pendingDimChange;
            pendingDimChange = null;
            info.input.value = info.prevValue;
            info.input.dispatchEvent(new Event('input'));
        }

        function confirmClearPolygon() {
            pendingDimChange = null;
            // Clear the polygon by triggering the clear button
            var clearBtn = document.getElementById('polygon-clear-btn');
            if (clearBtn) clearBtn.click();
            // Update stored previous values to current
            prevDeckLen = deckLenInput ? deckLenInput.value : '';
            prevDeckWid = deckWidInput ? deckWidInput.value : '';
        }

        // Save value on focus so we know what to revert to
        if (deckLenInput) {
            deckLenInput.addEventListener('focus', function () {
                prevDeckLen = this.value;
            });
            deckLenInput.addEventListener('change', function () {
                if (hasActivePolygon()) {
                    if (!showPolygonClearModal(this, prevDeckLen)) {
                        // Modal not found, fall back to native confirm
                        if (!confirm('You have a custom shape drawn. Clear the polygon and use entered dimensions instead?')) {
                            this.value = prevDeckLen;
                            this.dispatchEvent(new Event('input'));
                            return;
                        }
                        var clearBtn = document.getElementById('polygon-clear-btn');
                        if (clearBtn) clearBtn.click();
                    }
                    return;
                }
                prevDeckLen = this.value;
            });
        }
        if (deckWidInput) {
            deckWidInput.addEventListener('focus', function () {
                prevDeckWid = this.value;
            });
            deckWidInput.addEventListener('change', function () {
                if (hasActivePolygon()) {
                    if (!showPolygonClearModal(this, prevDeckWid)) {
                        if (!confirm('You have a custom shape drawn. Clear the polygon and use entered dimensions instead?')) {
                            this.value = prevDeckWid;
                            this.dispatchEvent(new Event('input'));
                            return;
                        }
                        var clearBtn = document.getElementById('polygon-clear-btn');
                        if (clearBtn) clearBtn.click();
                    }
                    return;
                }
                prevDeckWid = this.value;
            });
        }

        // Wire up the polygon-clear modal buttons
        var pcModal = document.getElementById('polygonClearModal');
        if (pcModal) {
            var pcConfirm = document.getElementById('polygon-clear-confirm');
            var pcCancel = document.getElementById('polygon-clear-cancel');
            var pcClose = document.getElementById('polygon-clear-modal-close');

            function dismissPolygonModal() {
                pcModal.classList.remove('active');
                revertPendingChange();
            }

            if (pcConfirm) {
                pcConfirm.addEventListener('click', function () {
                    pcModal.classList.remove('active');
                    confirmClearPolygon();
                });
            }
            if (pcCancel) pcCancel.addEventListener('click', dismissPolygonModal);
            if (pcClose) pcClose.addEventListener('click', dismissPolygonModal);

            // Backdrop click = cancel
            pcModal.addEventListener('click', function (e) {
                if (e.target === pcModal) dismissPolygonModal();
            });
        }

        console.log('[DeckCalc] Ready. Board width: ' + BOARD_WIDTH_INCH + '"  Gap: ' + GAP_INCH + '"  Effective: ' + EFFECTIVE_FT.toFixed(6) + ' ft/board');
    }

    // === POLYGON DRAWING TOOL ===
    var polyState = { vertices: [], scale: 2, closed: false, mousePos: null };
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
        var undoBtn = document.getElementById('polygon-undo-btn');
        var snapToggle = document.getElementById('polygon-snap-toggle');
        var dimsDiv = document.getElementById('polygon-dimensions');
        var alongSpan = document.getElementById('polygon-along');
        var fromSpan = document.getElementById('polygon-from');

        var SNAP_RADIUS = 10;
        var ALIGN_THRESHOLD = 6;

        // Returns alignment snap info for a cursor position against all existing vertices.
        // Returns { x, y, alignedVerts } where alignedVerts contains { vert, axis } entries.
        function alignToVertices(cursor, verts) {
            var result = { x: cursor.x, y: cursor.y, alignedVerts: [] };
            var bestDx = ALIGN_THRESHOLD + 1;
            var bestDy = ALIGN_THRESHOLD + 1;
            for (var i = 0; i < verts.length; i++) {
                var dx = Math.abs(cursor.x - verts[i].x);
                var dy = Math.abs(cursor.y - verts[i].y);
                if (dx <= ALIGN_THRESHOLD && dx < bestDx) {
                    bestDx = dx;
                    result.x = verts[i].x;
                    // Remove any previous x-aligned entry
                    result.alignedVerts = result.alignedVerts.filter(function(a) { return a.axis !== 'x'; });
                    result.alignedVerts.push({ vert: verts[i], axis: 'x' });
                }
                if (dy <= ALIGN_THRESHOLD && dy < bestDy) {
                    bestDy = dy;
                    result.y = verts[i].y;
                    result.alignedVerts = result.alignedVerts.filter(function(a) { return a.axis !== 'y'; });
                    result.alignedVerts.push({ vert: verts[i], axis: 'y' });
                }
            }
            return result;
        }
        var ANGLE_SNAP_THRESHOLD = 8; // degrees — how close to a snap angle before it locks

        function getScale() {
            return parseFloat(scaleInput.value) || 2;
        }

        // Snap a point to 0/45/90/135/180/225/270/315 degree angles relative to an anchor
        function snapAngle(anchor, pt) {
            var dx = pt.x - anchor.x;
            var dy = pt.y - anchor.y;
            var distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 5) return pt; // too close to snap meaningfully

            var angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180
            var snapAngles = [0, 45, 90, 135, 180, -180, -135, -90, -45];
            var closest = null;
            var closestDiff = Infinity;

            for (var i = 0; i < snapAngles.length; i++) {
                var diff = Math.abs(angle - snapAngles[i]);
                if (diff > 180) diff = 360 - diff;
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closest = snapAngles[i];
                }
            }

            if (closestDiff <= ANGLE_SNAP_THRESHOLD) {
                var rad = closest * (Math.PI / 180);
                return {
                    x: anchor.x + distance * Math.cos(rad),
                    y: anchor.y + distance * Math.sin(rad),
                    snapped: true,
                    snapAngle: closest
                };
            }

            return pt;
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
            ctx.fillText(fmtFtIn(len), mx, my - 5);
            ctx.textAlign = 'left';
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawGrid();

            var verts = polyState.vertices;
            if (verts.length === 0 && !polyState.mousePos) return;

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

            // Live rubber-band line from last vertex to cursor
            if (!polyState.closed && verts.length > 0 && polyState.mousePos) {
                var lastVert = verts[verts.length - 1];

                // Vertex alignment guides (always active, independent of angle snap)
                var aligned = alignToVertices(polyState.mousePos, verts);
                var cursorPos = { x: aligned.x, y: aligned.y };

                // Draw alignment guide lines and indicators
                if (aligned.alignedVerts.length > 0) {
                    ctx.save();
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = 'rgba(220, 38, 38, 0.3)';
                    ctx.lineWidth = 1;
                    for (var ai = 0; ai < aligned.alignedVerts.length; ai++) {
                        var av = aligned.alignedVerts[ai];
                        ctx.beginPath();
                        if (av.axis === 'x') {
                            ctx.moveTo(av.vert.x, 0);
                            ctx.lineTo(av.vert.x, canvas.height);
                        } else {
                            ctx.moveTo(0, av.vert.y);
                            ctx.lineTo(canvas.width, av.vert.y);
                        }
                        ctx.stroke();
                        // Diamond indicator on the aligned vertex
                        ctx.fillStyle = 'rgba(220, 38, 38, 0.5)';
                        ctx.beginPath();
                        ctx.moveTo(av.vert.x, av.vert.y - 5);
                        ctx.lineTo(av.vert.x + 5, av.vert.y);
                        ctx.lineTo(av.vert.x, av.vert.y + 5);
                        ctx.lineTo(av.vert.x - 5, av.vert.y);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.restore();
                }

                // Angle snap (takes priority over alignment when both active)
                var snappedMouse = (snapToggle && snapToggle.checked) ? snapAngle(lastVert, cursorPos) : cursorPos;

                // Draw snap guide line (extended faint line showing the snap axis)
                if (snappedMouse.snapped) {
                    var rad = snappedMouse.snapAngle * (Math.PI / 180);
                    var guideLen = Math.max(canvas.width, canvas.height);
                    ctx.save();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = 'rgba(37, 99, 235, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(lastVert.x - guideLen * Math.cos(rad), lastVert.y - guideLen * Math.sin(rad));
                    ctx.lineTo(lastVert.x + guideLen * Math.cos(rad), lastVert.y + guideLen * Math.sin(rad));
                    ctx.stroke();
                    ctx.restore();
                }

                // Rubber-band line
                ctx.save();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = snappedMouse.snapped ? '#16a34a' : (aligned.alignedVerts.length > 0 ? '#dc2626' : '#93c5fd');
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(lastVert.x, lastVert.y);
                ctx.lineTo(snappedMouse.x, snappedMouse.y);
                ctx.stroke();
                ctx.restore();

                // Live dimension label on the rubber-band line
                var liveLen = edgeLengthFt(lastVert, snappedMouse);
                var mx = (lastVert.x + snappedMouse.x) / 2;
                var my = (lastVert.y + snappedMouse.y) / 2;

                // Background pill for readability
                var labelText = fmtFtIn(liveLen);
                if (snappedMouse.snapped) {
                    var snapDeg = ((snappedMouse.snapAngle % 360) + 360) % 360;
                    labelText += ' (' + snapDeg + '\u00B0)';
                }
                ctx.font = 'bold 11px sans-serif';
                var textWidth = ctx.measureText(labelText).width;
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillRect(mx - textWidth / 2 - 4, my - 18, textWidth + 8, 16);
                ctx.fillStyle = snappedMouse.snapped ? '#16a34a' : (aligned.alignedVerts.length > 0 ? '#dc2626' : '#1e40af');
                ctx.textAlign = 'center';
                ctx.fillText(labelText, mx, my - 5);
                ctx.textAlign = 'left';

                // Draw a small dot at the snapped cursor position
                ctx.beginPath();
                ctx.arc(snappedMouse.x, snappedMouse.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = snappedMouse.snapped ? '#16a34a' : (aligned.alignedVerts.length > 0 ? '#dc2626' : '#93c5fd');
                ctx.fill();
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
            alongSpan.textContent = fmtFtIn(alongFt);
            alongSpan.dataset.rawFt = alongFt;
            fromSpan.textContent = fmtFtIn(fromFt);
            fromSpan.dataset.rawFt = fromFt;
            // Show true polygon area
            var areaSpan = document.getElementById('polygon-area');
            if (areaSpan) {
                var trueArea = Math.round(polygonAreaSqFt(verts, gs, scale) * 10) / 10;
                areaSpan.textContent = trueArea + ' sq ft';
                areaSpan.parentElement.style.display = '';
            }
            dimsDiv.style.display = '';
            useBtn.style.display = '';
        }

        function updateUndoBtn() {
            if (undoBtn) undoBtn.style.display = polyState.vertices.length > 0 ? '' : 'none';
        }

        function clearPoly() {
            polyState.vertices = [];
            polyState.closed = false;
            polyState.mousePos = null;
            dimsDiv.style.display = 'none';
            useBtn.style.display = 'none';
            var indicator = document.getElementById('polygon-active-indicator');
            if (indicator) indicator.style.display = 'none';
            var areaEl = document.getElementById('polygon-area');
            if (areaEl) areaEl.parentElement.style.display = 'none';
            updateUndoBtn();
            draw();
        }

        // Track mouse movement for live preview and angle snapping
        canvas.addEventListener('mousemove', function (e) {
            if (polyState.closed) return;
            polyState.mousePos = canvasCoords(e);
            draw();
        });

        canvas.addEventListener('mouseleave', function () {
            polyState.mousePos = null;
            draw();
        });

        canvas.addEventListener('click', function (e) {
            if (polyState.closed) return;
            var pt = canvasCoords(e);
            var verts = polyState.vertices;

            // Apply vertex alignment snapping (always active)
            if (verts.length > 0) {
                var aligned = alignToVertices(pt, verts);
                pt = { x: aligned.x, y: aligned.y };
            }

            // Apply angle snapping if there's a previous vertex and toggle is checked
            if (verts.length > 0 && snapToggle && snapToggle.checked) {
                pt = snapAngle(verts[verts.length - 1], pt);
            }

            // Snap to first vertex to close
            if (verts.length >= 3) {
                if (dist(pt, verts[0]) < SNAP_RADIUS) {
                    polyState.closed = true;
                    polyState.mousePos = null;
                    draw();
                    computeBoundingBox();
                    return;
                }
            }

            verts.push({ x: pt.x, y: pt.y });
            updateUndoBtn();
            draw();
        });

        canvas.addEventListener('dblclick', function (e) {
            e.preventDefault();
            if (polyState.closed || polyState.vertices.length < 3) return;
            polyState.closed = true;
            polyState.mousePos = null;
            draw();
            computeBoundingBox();
        });

        clearBtn.addEventListener('click', clearPoly);

        if (undoBtn) {
            undoBtn.addEventListener('click', function () {
                if (polyState.vertices.length === 0) return;
                polyState.vertices.pop();
                polyState.closed = false;
                updateUndoBtn();
                draw();
                computeBoundingBox();
            });
        }

        useBtn.addEventListener('click', function () {
            var along = parseFloat(alongSpan.dataset.rawFt) || 0;
            var from = parseFloat(fromSpan.dataset.rawFt) || 0;
            if (along > 0 && from > 0) {
                var lenInput = document.getElementById('deck-len');
                var widInput = document.getElementById('deck-wid');
                lenInput.value = along;
                widInput.value = from;
                lenInput.dispatchEvent(new Event('input'));
                widInput.dispatchEvent(new Event('input'));
            }
            // Show polygon active indicator when polygon is closed
            var indicator = document.getElementById('polygon-active-indicator');
            if (indicator && polyState.closed && polyState.vertices.length >= 3) {
                indicator.style.display = '';
            }
        });

        scaleInput.addEventListener('change', function () {
            polyState.scale = getScale();
            draw();
            computeBoundingBox();
        });

        draw();
    };

    // === PRINT CUT PLAN ===
    function printCutPlan() {
        if (!currentCalcResult || selectedOptionIndex === null) {
            alert('Please calculate a deck first.');
            return;
        }
        var opt = currentCalcResult.options[selectedOptionIndex];
        if (!opt) return;

        if (!currentCalcResult.isPolygon || !currentCalcResult.cutDetails) {
            alert('Cut plan is only available for polygon decks.');
            return;
        }

        var boardTypeEl = document.getElementById('calc-board-type');
        var boardType = boardTypeEl ? boardTypeEl.value : 'system';
        var color = getActiveColor();
        var pricePerFt = boardType === 'system' ? 8 : 6;
        var solidPricePerFt = 6;
        var boardTypeLabel = boardType === 'system' ? 'AmeriDex System'
                           : boardType === 'grooved' ? 'Grooved' : 'Solid Edge';
        var fasteners = calculateFasteners(opt.boardRows, currentCalcResult.joistCount);
        var cutList = generateCutList(currentCalcResult.cutDetails, opt.length);
        var cs = currentCalcResult.cutSummary;
        var cd = currentCalcResult.cutDetails;

        var quoteId = (window.currentQuote && window.currentQuote.quoteId) ? window.currentQuote.quoteId : '';
        var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        function pm(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

        var phtml = '<!DOCTYPE html><html><head><title>AmeriDex Cut Plan</title>' +
            '<style>body{font-family:Arial,sans-serif;padding:20px;margin:0;color:#1f2937}' +
            'h1{color:#2563eb;margin:0 0 5px}h2{color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;margin-top:20px}' +
            'table{width:100%;border-collapse:collapse;font-size:0.9rem}td,th{padding:4px 8px;text-align:left}' +
            '.board-bar{display:flex;height:22px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;margin:2px 0}' +
            '.cut-seg{display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;padding:0 3px;font-size:0.7rem;border-right:1px solid rgba(0,0,0,0.15)}' +
            '.primary{background:#dbeafe;color:#1e3a5f}.reuse{background:#bbf7d0;color:#15803d}.waste{background:#fecaca;color:#991b1b}' +
            '@media print{body{padding:0}}</style></head><body>';

        // Header
        phtml += '<h1>AmeriDex Cut Plan</h1>';
        phtml += '<p style="color:#666;margin:2px 0">Generated: ' + today + '</p>';
        if (quoteId) phtml += '<p style="color:#1e40af;font-weight:bold;margin:2px 0">Quote #: ' + quoteId + '</p>';
        phtml += '<p style="margin:2px 0">Deck area: ' + (currentCalcResult.deckAreaSqFt ? currentCalcResult.deckAreaSqFt + ' sq ft' : fmtFtIn(currentCalcResult.coverageFt) + ' x ' + fmtFtIn(currentCalcResult.spanFt)) + '</p>';

        // Material Shopping List
        phtml += '<h2>Material Shopping List</h2>';
        var deckBoardPrice = opt.totalBoards * opt.length * pricePerFt;
        var estimatedTotal = deckBoardPrice;
        phtml += '<table>';
        phtml += '<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="font-weight:600">DECKING</td></tr>';
        phtml += '<tr><td>' + opt.totalBoards + 'x ' + boardTypeLabel + ', ' + opt.length + '\', ' + color + '</td><td style="text-align:right">' + pm(deckBoardPrice) + '</td></tr>';
        phtml += '<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="font-weight:600;padding-top:8px">FASTENERS</td></tr>';
        var screwCost = fasteners.screwBoxes * 37;
        var plugCost = fasteners.plugBoxes * 33.79;
        estimatedTotal += screwCost + plugCost;
        phtml += '<tr><td>' + fasteners.screwBoxes + 'x Screw box (375/box)</td><td style="text-align:right">' + pm(screwCost) + '</td></tr>';
        phtml += '<tr><td>' + fasteners.plugBoxes + 'x Plug box (375/box)</td><td style="text-align:right">' + pm(plugCost) + '</td></tr>';

        // Solid edge items
        var pfChk = document.getElementById('pic-frame');
        var bbChk = document.getElementById('breaker-board');
        var stChk = document.getElementById('stairs');
        var hasSolid = (pfChk && pfChk.checked) || (bbChk && bbChk.checked) || (stChk && stChk.checked);
        if (hasSolid) {
            phtml += '<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="font-weight:600;padding-top:8px">SOLID EDGE BOARDS</td></tr>';
            if (pfChk && pfChk.checked) {
                var pfT = (document.getElementById('pf-type') || {}).value || 'single';
                var pfLS = Math.max(currentCalcResult.coverageFt, currentCalcResult.spanFt);
                var pfBL = pfLS <= 12 ? 12 : pfLS <= 16 ? 16 : 20;
                var pfB = Math.ceil(currentCalcResult.spanFt / pfBL) * 2 + Math.ceil(currentCalcResult.coverageFt / pfBL) * 2;
                if (pfT === 'double') pfB = pfB * 2;
                var pfC = ((document.getElementById('pf-color-swatches') || {}).dataset && document.getElementById('pf-color-swatches').dataset.selected) || color;
                var pfP = pfB * pfBL * solidPricePerFt;
                estimatedTotal += pfP;
                phtml += '<tr><td>' + pfB + 'x Solid Edge, ' + pfBL + '\', ' + pfC + ' (picture frame)</td><td style="text-align:right">' + pm(pfP) + '</td></tr>';
            }
            if (bbChk && bbChk.checked) {
                var bbC = currentCalcResult.coverageFt;
                var bbBL = bbC <= 12 ? 12 : bbC <= 16 ? 16 : 20;
                var bbBC = Math.ceil(bbC / bbBL);
                var bbCol = ((document.getElementById('breaker-color-swatches') || {}).dataset && document.getElementById('breaker-color-swatches').dataset.selected) || color;
                var bbP = bbBC * bbBL * solidPricePerFt;
                estimatedTotal += bbP;
                phtml += '<tr><td>' + bbBC + 'x Solid Edge, ' + bbBL + '\', ' + bbCol + ' (breaker board)</td><td style="text-align:right">' + pm(bbP) + '</td></tr>';
            }
            if (stChk && stChk.checked) {
                var stSt = parseInt((document.getElementById('stair-steps') || {}).value) || 1;
                var stTr = parseInt((document.getElementById('stair-treads') || {}).value) || 1;
                var stTB = stSt * stTr;
                var stHR = document.getElementById('stair-risers') && document.getElementById('stair-risers').checked;
                var stRB = stHR ? stSt : 0;
                var stW = parseFloat((document.getElementById('stair-width') || {}).value) || currentCalcResult.coverageFt;
                var stBL = stW <= 12 ? 12 : stW <= 16 ? 16 : 20;
                var stCol = ((document.getElementById('stair-color-swatches') || {}).dataset && document.getElementById('stair-color-swatches').dataset.selected) || color;
                var stTP = stTB * stBL * solidPricePerFt;
                estimatedTotal += stTP;
                phtml += '<tr><td>' + stTB + 'x Solid Edge, ' + stBL + '\', ' + stCol + ' (stair treads)</td><td style="text-align:right">' + pm(stTP) + '</td></tr>';
                if (stRB > 0) {
                    var stRP = stRB * stBL * solidPricePerFt;
                    estimatedTotal += stRP;
                    phtml += '<tr><td>' + stRB + 'x Solid Edge, ' + stBL + '\', ' + stCol + ' (stair risers)</td><td style="text-align:right">' + pm(stRP) + '</td></tr>';
                }
            }
        }
        phtml += '<tr style="border-top:2px solid #1e40af"><td style="font-weight:700;color:#1e40af">ESTIMATED TOTAL</td><td style="text-align:right;font-weight:700;color:#1e40af;font-size:1.1rem">' + pm(estimatedTotal) + '</td></tr>';
        phtml += '</table>';

        // Cut angle summary
        if (cs) {
            phtml += '<h2>Cut Angle Summary</h2>';
            if (cs.straightRows > 0) {
                phtml += '<p>' + cs.straightRows + ' board' + (cs.straightRows !== 1 ? 's' : '') + ': Straight cuts only (square ends)</p>';
            }
            if (cs.angledRows > 0) {
                var aDesc = cs.uniqueAngles.join('\u00B0/') + '\u00B0';
                phtml += '<p>' + cs.angledRows + ' board' + (cs.angledRows !== 1 ? 's' : '') + ': ' + aDesc + ' angle cuts</p>';
            }
        }

        // Cut plan summary
        phtml += '<h2>Cut Plan (' + opt.length + '\' boards)</h2>';
        phtml += '<p>Purchase: <strong>' + cutList.totalBoardsPurchased + ' boards</strong> | ' +
            cutList.reuseNote + ' | Total waste: <strong>' + fmtFtIn(cutList.totalWasteFt) + '</strong> (' + cutList.wastePct + '%)</p>';

        // Board-by-board with visual bars
        for (var bi = 0; bi < cutList.boards.length; bi++) {
            var brd = cutList.boards[bi];
            phtml += '<div style="margin-bottom:6px">';
            phtml += '<strong>Board #' + brd.boardNum + '</strong> (' + opt.length + '\'): ';
            for (var ci = 0; ci < brd.cuts.length; ci++) {
                var c = brd.cuts[ci];
                if (ci > 0) phtml += ' &rarr; ';
                var aNote = c.angle > 0 ? ' [' + c.angle + '\u00B0]' : ' [straight]';
                phtml += 'Row ' + c.row + ': ' + fmtFtIn(c.cutLength) + aNote;
                if (c.isReuse) phtml += ' (offcut)';
            }
            if (brd.wasteLength > 0.01) {
                phtml += ' | Waste: ' + fmtFtIn(brd.wasteLength);
            }

            // Visual bar
            phtml += '<div class="board-bar">';
            for (var vc = 0; vc < brd.cuts.length; vc++) {
                var seg = brd.cuts[vc];
                var pct = (seg.cutLength / brd.boardLength * 100).toFixed(1);
                var cls = seg.isReuse ? 'reuse' : 'primary';
                phtml += '<div class="cut-seg ' + cls + '" style="flex:0 0 ' + pct + '%">R' + seg.row + ': ' + fmtFtIn(seg.cutLength) + '</div>';
            }
            if (brd.wasteLength > 0.01) {
                var wPct = (brd.wasteLength / brd.boardLength * 100).toFixed(1);
                phtml += '<div class="cut-seg waste" style="flex:0 0 ' + wPct + '%">' + fmtFtIn(brd.wasteLength) + '</div>';
            }
            phtml += '</div></div>';
        }

        phtml += '</body></html>';

        var printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(phtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(function () { printWindow.print(); printWindow.close(); }, 250);
    }
    window.printCutPlan = printCutPlan;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 50);
        });
    } else {
        setTimeout(init, 50);
    }
})();
