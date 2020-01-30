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

const pickers = [];

/** @type BlockStructure quilt */
const quilt = {
    size: 0,
    colorSet: [],
    block: []
};

function initJs() {
    // connect events
    editor.addEventListener('click', onEditorClick);

    // set up color pickers
    initColors();

    // generate a random initial quilt
    initQuiltBlock();

    // un-hide JS content
    document.getElementById('app').className = '';
}

function initQuiltBlock() {
    const shapes = [SHAPE_FALLING, SHAPE_RISING];
    const shapeCount = Math.floor(shapes.length);
    const colorCount = Math.floor(quilt.colorSet.length);

    // generate a random size from 3 to 5 cells
    quilt.size = 3 + Math.floor(Math.random() * 2.0);

    for (let column = 0; column < quilt.size; column++) {
        for (let row = 0; row < quilt.size; row++) {
            // Pick a random direction
            const shape = shapes[Math.floor(Math.random() * shapeCount)];
            const color1 = Math.floor(Math.random() * colorCount);
            const color2 = Math.floor(Math.random() * colorCount);

            quilt.block.push(cell2(shape, color1, color2));
        }
    }
}

function initColors() {
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
 * Solid cell constructor
 * @param {number} color
 * @returns Cell
 */
function cellSolid(color) {
    return cell2(SHAPE_RISING, color, color);
}


/**
 * Find which cell in the quilt block was clicked
 *
 * @param {number} x X-coordinate
 * @param {number} y Y-coordinate
 * @returns {number}
 */
function getCellIndex(x, y) {
    const _ = Math.floor;
    const cW = _(editor.width / quilt.size);
    const cH = _(editor.height / quilt.size);

    return _(x / cW) + (quilt.size * _(y / cH));
}

/**
 * @param {MouseEvent} ev
 */
function onEditorClick(ev) {
    const rect = editor.getBoundingClientRect();
    const cell = getCellIndex(ev.clientX - rect.left, ev.clientY - rect.top);
    quilt.block[cell] = cellSolid(1);
    updateView();
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
