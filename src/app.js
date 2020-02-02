"use strict";

/**
 * @typedef {Object} Cell
 * @property {Array<number>} colors
 * @property {number} angle
 */

/**
 * @typedef {Array<Cell>} Block
 */

/**
 * @typedef {Array<string>} Palette
 */

/**
 * @typedef {object} BlockStructure
 * @property {number} size
 * @property {number} borderSize
 * @property {Palette} colorSet
 * @property {Block} block
 */

/**
 * @typedef {[number, number]} Point
 */

    //** @type {HTMLCanvasElement} editor */
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 480;

// TOP = color 0 in the top-left; color 1 in the bottom-right (seam rising)
// RIGHT = color 0 in the top-right; color 1 in the bottom-left (seam falling)
// BOTTOM = color 0 in the bottom-right; color 1 in the top-left (seam rising)
// LEFT = color 0 in the bottom-left; color 1 in the top-right (seam falling)
// Thus, TOP/BOTTOM are color-swaps of each other, as are RIGHT/LEFT.
const ANGLE_TOP = 0;
const ANGLE_RIGHT = 1;
const ANGLE_BOTTOM = 2;
const ANGLE_LEFT = 3;
const ANGLES = [ANGLE_TOP, ANGLE_RIGHT, ANGLE_BOTTOM, ANGLE_LEFT];

const TOOL_PAINT = 'paint';
const TOOL_SPIN = 'spin';

const pickers = [];

/** @type BlockStructure quilt */
const quilt = {
    size: 0,
    borderSize: 0,
    colorSet: [],
    block: []
};

const ui = {
    colorTemplate: null,
    colorBox: null,
    selectedColor: 2,
    selectedTool: TOOL_PAINT
};

function setPaintColor(i) {
    ui.selectedColor = i;
    ui.selectedTool = TOOL_PAINT;
    document.getElementById(`color${i}`).checked = true
}

function initJs() {
    // set up UI
    initColors();
    initTools();

    // generate a random initial quilt
    initQuiltBlock();

    // un-hide JS content
    document.getElementById('app').className = '';
}

function initQuiltBlock() {
    const angleCount = Math.floor(ANGLES.length);
    const colorCount = Math.floor(quilt.colorSet.length) - 1;

    // generate a random size from 3 to 5 cells
    quilt.size = 3 + Math.floor(Math.random() * 3.0);

    for (let column = 0; column < quilt.size; column++) {
        for (let row = 0; row < quilt.size; row++) {
            // Pick a random direction
            const angle = ANGLES[Math.floor(Math.random() * angleCount)];
            const color1 = 1 + Math.floor(Math.random() * colorCount);
            const color2 = 1 + Math.floor(Math.random() * colorCount);

            quilt.block.push(cell2(angle, color1, color2));
        }
    }

    // choose a random border size
    const borderControl = document.getElementById('border-width');
    const step = parseInt(borderControl.getAttribute('step') || '1', 10);
    const maxBase = parseInt(borderControl.getAttribute('max')) / step;
    const width = step + Math.floor(Math.random() * (maxBase + 1));

    borderControl.value = width;
    quilt.borderSize = width;
}

function initTools() {
    // connect events
    editor.addEventListener('click', onEditorClick);
    document.getElementById('controls').addEventListener('click', onControlClick);
    document.getElementById('border-width').addEventListener('input', onBorderSize);
}

function initColors() {
    // set up global data for addColor
    ui.colorTemplate = document.getElementById('color-item');
    ui.colorBox = document.getElementById('colors');

    // double-check that our requirements are fulfilled
    if (!(ui.colorTemplate && ui.colorBox)) {
        console.error("Invalid HTML: missing template#color-item or #colors");
        return;
    }

    // parse the initial palette data
    const colorText = ui.colorBox.getAttribute('data-initial-palette') || '#ff00ff';
    const colors = colorText.split(',');

    // create Pickr UI for each initial palette entry
    colors.forEach(addColor);

    // set the radio state to reflect the selected JS color
    const colorIndex = Math.min(ui.selectedColor, quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).checked = true;
    }

    // set up "New Color" button
    document.getElementById('color-new').addEventListener('click', createColor);
}

function createColor() {
    const hue = Math.floor(Math.random() * 360);
    const sat = 55 + Math.floor(Math.random() * 25);
    const i = addColor(`hsla(${hue}, ${sat}%, 60%, 1.0)`);
    setPaintColor(i);
}

function addColor(value) {
    const i = quilt.colorSet.length;
    const item = ui.colorTemplate.content.cloneNode(true);

    // configure sub-DOM
    const dataNode = item.querySelector('.color-active');
    const button = item.querySelector('.color-button');
    if (!(dataNode && button)) {
        console.error("Cannot find '.color-active' and '.color-button' in ui.colorTemplate");
        return;
    }

    dataNode.setAttribute('data-color-id', `${i}`);
    dataNode.id = `color${i}`;

    // define the color
    quilt.colorSet[i] = value;

    // activate the picker
    const picker = Pickr.create({
        el: button,
        theme: 'nano',
        lockOpacity: true,
        default: value,
        defaultRepresentation: 'HSLA',
        adjustableNumbers: true,

        components: {
            preview: true,
            hue: true,
            interaction: {
                hex: true,
                hsla: true,
                hsva: false,
                rgba: false,
                cmyk: false,

                input: true,
                cancel: true,
                save: false,
                clear: false
            }
        },

        strings: {
            cancel: "Reset"
        }
    });

    // set up events
    picker.on('change', newValue => onColorChanged(i, newValue));
    picker.on('hide', () => onColorPickerHide(i));
    picker.on('cancel', () => onColorReset(i));

    // insert the whole template into the DOM
    ui.colorBox.appendChild(item);

    // save the picker for future interaction
    pickers[i] = {
        handle: picker,
        saved: value,
    };

    return i;
}

function onColorPickerHide(i) {
    pickers[i].saved = quilt.colorSet[i]; // save color for next cancel button click
    pickers[i].handle.applyColor(true); // save color to button, without firing a save event
    setPaintColor(i);
}

function onColorChanged(i, value) {
    quilt.colorSet[i] = value.toHSLA().toString();
    updateView();
}

function onColorReset(i) {
    quilt.colorSet[i] = pickers[i].saved;
    updateView();
}

/**
 * Cell constructor
 *
 * @param {number} angle
 * @param {number} topColor
 * @param {number} bottomColor
 * @returns {Cell}
 */
function cell2(angle, topColor, bottomColor) {
    return {
        angle: angle,
        colors: [topColor, bottomColor],
    };
}


/**
 * @param {number} angle
 * @returns {number}
 */
function spinCell(angle) {
    return (angle + 1) % ANGLES.length;
}

/**
 * @param {MouseEvent} ev
 */
function onEditorClick(ev) {
    const rect = editor.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;

    // calculate hit positions
    const sz = quilt.size;
    const cW = _(editor.width / sz);
    const cH = _(editor.height / sz);

    const index = _(x / cW) + (sz * _(y / cH));
    const cell = quilt.block[index];

    // act on the hit
    switch (ui.selectedTool) {
    case TOOL_PAINT:
        // translate coordinates to cell-relative
        const top = _(index / sz) * cH;
        const left = _(index % sz) * cW;
        const hitX = x - left;
        const hitY = y - top;
        let colorIndex;

        // determine which color of the cell was hit
        switch (cell.angle) {
        case ANGLE_TOP:
            colorIndex = hitX < (cH - hitY) ? 0 : 1;
            break;
        case ANGLE_BOTTOM:
            colorIndex = hitX > (cH - hitY) ? 0 : 1;
            break;
        case ANGLE_LEFT:
            colorIndex = (hitX < hitY) ? 0 : 1;
            break;
        case ANGLE_RIGHT:
            colorIndex = (hitX > hitY) ? 0 : 1;
            break;
        default:
            console.error("Unknown angle %d", cell.angle);
            colorIndex = 0;
        }

        // apply color to the index that was hit
        cell.colors[colorIndex] = ui.selectedColor;

        break;
    case TOOL_SPIN:
        cell.angle = spinCell(cell.angle);
        break;
    default:
        console.error("Unknown tool selected: %s", ui.selectedTool)
    }

    updateView();
}

/**
 * @param {InputEvent} ev
 */
function onBorderSize(ev) {
    quilt.borderSize = parseInt(ev.target.value, 10);
    updatePreview(editor, quilt.colorSet[0], quilt.borderSize);
}

/**
 * Delegating event handler for control input-radio clicks
 *
 * @param {MouseEvent} ev
 */
function onControlClick(ev) {
    const target = ev.target;
    if (!target.tagName.toLowerCase().match(/^(?:button|input)$/)) {
        return;
    }

    const classes = target.classList;
    if (classes.contains('color-active')) {
        onColorRadioClick(ev);
    } else if (classes.contains('tool-active')) {
        onToolChange(ev);
    } else if (classes.contains('roll')) {
        onRollerClick(ev);
    }
}

/**
 * @param {MouseEvent} ev
 */
function onToolChange(ev) {
    const node = ev.target;
    ui.selectedTool = node.id.replace(/^tool-/, '');
}

/**
 * @param {MouseEvent} ev
 */
function onColorRadioClick(ev) {
    const node = ev.target;
    const colorIndex = parseInt(node.getAttribute('data-color-id'), 10);
    setPaintColor(colorIndex);
}

/**
 * Roll the quilt block in some direction.
 *
 * @param {MouseEvent} ev
 */
function onRollerClick(ev) {
    const movers = {
        "roll-up": rollUp,
        "roll-down": rollDown,
        "roll-left": rollLeft,
        "roll-right": rollRight
    };

    const callback = movers[ev.target.id];
    if (callback) {
        quilt.block = callback(quilt.block);
        updateView();
    }
}


function rollCore(block, mappingFn) {
    const rolled = new Array(block.length);
    const size = Math.sqrt(block.length);

    // walk across rolled. ask the mapping function where the data for the
    // row/column of rolled is located in block, by row/column.
    let i = 0;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const [readRow, readCol] = mappingFn(row, col, size);
            rolled[i++] = block[readCol + (readRow * size)];
        }
    }

    return rolled;
}

/**
 * Move all cells to the left, wrapping the leftmost column to the right
 *
 * @param {Block} block
 * @returns {Block}
 */
function rollLeft(block) {
    return rollCore(block, function (row, col, size) {
        return [row, (col + 1) % size];
    });
}

/**
 * Move all cells to the right, wrapping the rightmost column to the left.
 *
 * @param {Block} block
 * @returns {Block}
 */
function rollRight(block) {
    return rollCore(block, function (row, col, size) {
        return [row, col ? col - 1 : size - 1];
    });
}

/**
 * Move all cells down, wrapping the bottommost row to the top.
 *
 * @param {Block} block
 * @returns {Block}
 */
function rollDown(block) {
    return rollCore(block, function (row, col, size) {
        return [row ? row - 1 : size - 1, col];
    });
}

/**
 * Move all cells up, wrapping the topmost row to the bottom.
 *
 * @param {Block} block
 * @returns {Block}
 */
function rollUp(block) {
    return rollCore(block, function (row, col, size) {
        return [(row + 1) % size, col];
    });
}


/**
 * Draw a triangle at coordinates on the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Point>} points
 * @param {string} fillStyle
 */
function drawTriangle(ctx, points, fillStyle) {
    ctx.beginPath();

    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);

    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

/**
 * Draw a cell into a coordinate on the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} oX
 * @param {number} oY
 * @param {number} cW
 * @param {number} cH
 * @param {Palette} palette
 * @param {Cell} cell
 */
function drawCellAt(ctx, oX, oY, cW, cH, palette, cell) {
    // basic fill: draw a full rectangle here, if it's not the background color already
    if (cell.colors[0] !== 0) {
        ctx.fillStyle = palette[cell.colors[0]];
        ctx.fillRect(oX, oY, cW, cH);
    }

    if (cell.colors[1] === cell.colors[0]) {
        return; // that was all for a solid square
    }

    const tl = [oX, oY];
    const tr = [oX + cW, oY];
    const bl = [oX, oY + cH];
    const br = [oX + cW, oY + cH];
    let coordinates;

    // coordinates here are clockwise, hypotenuse last. this makes the values
    // flow through the arrays in order (each literal shares two of the
    // previous angle's coordinates, in the same order.)
    switch (cell.angle) {
    case ANGLE_TOP:
        coordinates = [tr, br, bl];
        break;
    case ANGLE_RIGHT:
        coordinates = [br, bl, tl];
        break;
    case ANGLE_BOTTOM:
        coordinates = [bl, tl, tr];
        break;
    case ANGLE_LEFT:
        coordinates = [tl, tr, br];
        break;
    default:
        console.error("[render] Unknown angle %d", cell.angle);
        return;
    }

    drawTriangle(ctx, coordinates, palette[cell.colors[1]]);
}

/**
 * Draw a block into the editor area of the canvas.
 *
 * @param {BlockStructure} quilt
 * @param {Block} block
 */
function updateEditor(quilt, block) {
    // cell width and height
    const cW = Math.floor(editor.width / quilt.size);
    const cH = Math.floor(editor.height / quilt.size);

    // cell origin and current block index
    let oX, oY, iBlock;

    // canvas 2D context
    const ctx = editor.getContext('2d');
    ctx.fillStyle = quilt.colorSet[0];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // process cells
    iBlock = 0; // index into block array
    for (let cY = 0; cY < quilt.size; ++cY) {
        oY = cY * cH; // Y-origin = cell Y-index (row) times cell height
        for (let cX = 0; cX < quilt.size; ++cX) {
            oX = cX * cW;
            drawCellAt(ctx, oX, oY, cW, cH, quilt.colorSet, block[iBlock++]);
        }
    }
}

function updatePreview(source, borderColor, borderSize) {
    const ctx = preview.getContext('2d');
    // save and restore the state, or else scale() accumulates
    ctx.save();

    // Size border to user request (values of 0-1 block, by steps of 2)
    const padSize = borderSize / 2.0; // half on each side
    // Determine the block size within the remaining area
    const bSize = Math.min((preview.height - borderSize) / 5, (preview.width - borderSize) / 4);
    const scale = bSize / source.width; // convert to scaling factor
    const antiScale = source.width / bSize; // reversed scaling factor

    if (!borderSize) {
        // no border: hide all traces of the color
        ctx.clearRect(0, 0, preview.width, preview.height);
    } else {
        // determine the draw width/height
        const dW = 4 * bSize + borderSize;
        const dH = 5 * bSize + borderSize;

        // clear out-of-bounds
        if (dW < preview.width) {
            ctx.clearRect(dW, 0, preview.width - dW, preview.height);
        }
        if (dH < preview.height) {
            ctx.clearRect(0, dH, preview.width, dH - preview.height);
        }

        // fill the border (and everything else) with the base color
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, dW, dH);
    }

    ctx.scale(scale, scale); // set the scale factor on the canvas

    // draw the 5x4 blocks, inset by the half-border-width padSize
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 5; row++) {
            // determine the current block's origin X/Y in unscaled space
            const oX = padSize + (col * bSize);
            const oY = padSize + (row * bSize);
            // reverse the scaling on the coordinates to draw where intended
            ctx.drawImage(source, oX * antiScale, oY * antiScale);
        }
    }

    ctx.restore();
}

function updateView() {
    updateEditor(quilt, quilt.block);
    updatePreview(editor, quilt.colorSet[0], quilt.borderSize);
}

if (editor && preview) {
    initJs();
    updateView();
} else {
    console.error("Can't get editor and preview; doing nothing.");
}
