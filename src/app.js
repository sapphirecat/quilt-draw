"use strict";

/**
 * @typedef {Object} Cell
 * @property {Array<number>} colors
 * @property {number} shape
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

const SHAPE_RISING = 1;
const SHAPE_FALLING = 2;
const SHAPES = [SHAPE_RISING, SHAPE_FALLING];

const TOOL_PAINT = 'paint';
const TOOL_FLIP = 'flip';
const TOOLS = [TOOL_PAINT, TOOL_FLIP];

const pickers = [];

/** @type BlockStructure quilt */
const quilt = {
    size: 0,
    colorSet: [],
    block: []
};

const ui = {
    colorTemplate: null,
    colorBox: null,
    selectedColor: 1,
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
    const shapeCount = Math.floor(SHAPES.length);
    const colorCount = Math.floor(quilt.colorSet.length);

    // generate a random size from 3 to 5 cells
    quilt.size = 3 + Math.floor(Math.random() * 2.0);

    for (let column = 0; column < quilt.size; column++) {
        for (let row = 0; row < quilt.size; row++) {
            // Pick a random direction
            const shape = SHAPES[Math.floor(Math.random() * shapeCount)];
            const color1 = Math.floor(Math.random() * colorCount);
            const color2 = Math.floor(Math.random() * colorCount);

            quilt.block.push(cell2(shape, color1, color2));
        }
    }
}

function initTools() {
    // connect events
    editor.addEventListener('click', onEditorClick);

    // obvious improvement: learn what jQuery.on() does under the hood, and do that
    for (const tool of TOOLS) {
        const button = document.getElementById(`tool-${tool}`);
        if (!button) {
            continue;
        }

        button.addEventListener('click', onToolChange);
    }

    const colorRadios = ui.colorBox.querySelectorAll('.color-active');
    for (const radio of colorRadios) {
        radio.addEventListener('click', onColorRadioClick);
    }
}

function initColors() {
    // set up global data for addColor
    ui.colorTemplate = document.getElementById('color-item');
    ui.colorBox = document.getElementById('controls');

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

    dataNode.setAttribute('data-color-id', i);
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
 * @param {number} shape
 * @param {number} topColor
 * @param {number} bottomColor
 * @returns {Cell}
 */
function cell2(shape, topColor, bottomColor) {
    return {
        shape: shape,
        colors: [topColor, bottomColor],
    };
}


/**
 * @param {number} shape
 * @returns {number}
 */
function flipShape(shape) {
    switch (shape) {
    case SHAPE_FALLING:
        return SHAPE_RISING;
    case SHAPE_RISING:
        return SHAPE_FALLING;
    default:
        console.error("invalid shape %d", shape);
        return shape;
    }
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
        // we need to find what sub-shape was hit
        const top = _(index / sz) * cH;
        const left = _(index % sz) * cW;
        const cX = x - left; // cX/cY = cell-relative coordinates
        const cY = y - top;
        let colorIndex = 0; // assume top section

        // if it's actually the bottom section, change index
        if (cell.shape === SHAPE_FALLING && cX < cY) {
            colorIndex = 1;
        }
        if (cell.shape === SHAPE_RISING && cX > (cH - cY)) {
            colorIndex = 1;
        }

        // apply color to the index that was hit
        cell.colors[colorIndex] = ui.selectedColor;

        break;
    case TOOL_FLIP:
        cell.shape = flipShape(cell.shape);
        break;
    default:
        console.error("Unknown tool selected: %s", ui.selectedTool)
    }

    updateView();
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

    switch (cell.shape) {
    case SHAPE_RISING:
        drawTriangle(ctx, [tr, br, bl], palette[cell.colors[1]]);
        break;
    case SHAPE_FALLING:
        drawTriangle(ctx, [tl, bl, br], palette[cell.colors[1]]);
        break;
    default:
        console.error("Unknown shape");
    }
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

function updatePreview(source, borderColor) {
    const ctx = preview.getContext('2d');
    // save and restore the state, or else scale() accumulates
    ctx.save();

    // Preview will be 5x4 blocks (rows x columns), plus 1 block for border.
    const bSize = Math.min(preview.height / 6, preview.width / 5);
    const padSize = bSize / 2.0; // half a block on each side
    const scale = bSize / source.width; // convert to scaling factor
    const antiScale = source.width / bSize; // reversed scaling factor

    // fill the border (and everything else) with the base color
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, preview.width, preview.height);
    ctx.scale(scale, scale); // set the scale factor on the canvas

    // draw the 5x4 blocks, inset by the half-block padSize
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
    updatePreview(editor, quilt.colorSet[0]);
}

if (editor && preview) {
    initJs();
    updateView();
} else {
    console.error("Can't get editor and preview; doing nothing.");
}
