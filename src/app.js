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
    selectedColor: 1,
    selectedTool: TOOL_PAINT
};

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

    const colors = document.getElementById('colors');
    const colorRadios = colors.getElementsByClassName('color-active');
    for (const radio of colorRadios) {
        radio.addEventListener('click', onColorRadioClick);
    }
}

function initColors() {
    // convert initial buttons to Pickr UI
    const colorBox = document.getElementById('colors');
    const buttonsLive = colorBox.getElementsByClassName('color-button');
    const buttons = [];

    for (let i = 0; i < buttonsLive.length; i++) {
        buttons.push(buttonsLive.item(i));
    }

    let i = 0;
    for (const button of buttons) {
        const value = button.getAttribute('data-initial-color');
        quilt.colorSet[i] = value;

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

        // save the picker for future interaction, because the defaults are strange
        pickers[i] = {
            handle: picker,
            saved: value,
        };

        // allocate a fresh `i` copy for each button
        picker.on('change', (function (i) {
            return (value) => onColorChanged(i, value);
        })(i));
        picker.on('hide', (function (i) {
            return () => onColorPickerHide(i);
        })(i));
        picker.on('cancel', (function (i) {
            return () => onColorReset(i);
        })(i));

        i++;
    }

    // set the radio state to reflect the selected JS color
    const colorIndex = Math.min(ui.selectedColor, quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).checked = true;
    }
}

function onColorPickerHide(i) {
    pickers[i].saved = quilt.colorSet[i]; // save color for next cancel button click
    pickers[i].handle.applyColor(true); // save color to button, without firing a save event
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
        const top = _(index / sz) * cH;
        const left = _(index % sz) * cW;
        const cX = x - left;
        const cY = y - top;
        let colorIndex = 0;

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
    ui.selectedColor = parseInt(node.getAttribute('data-color-id'), 10);
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
    iBlock = 0;
    for (let cY = 0; cY < quilt.size; ++cY) {
        oY = cY * cH;
        for (let cX = 0; cX < quilt.size; ++cX) {
            oX = cX * cW;
            drawCellAt(ctx, oX, oY, cW, cH, quilt.colorSet, block[iBlock++]);
        }
    }
}

function updateView() {
    updateEditor(quilt, quilt.block);
}

if (editor) {
    initJs();
    updateView();
} else {
    console.log("Can't get editor; doing nothing.");
}
