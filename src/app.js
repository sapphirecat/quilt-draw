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

const SHAPE_SOLID = 0;
const SHAPE_RISING = 1;
const SHAPE_FALLING = 2;

/** @type BlockStructure quilt */
const quilt = {
    size: 3,
    colorSet: [
        '#40aa80',
        '#0066cc'
    ],
    block: [
        cellSolid(0),
        cellRising(0, 1),
        cellFalling(0, 1),

        cellRising(0, 1),
        cellFalling(0, 1),
        cellSolid(0),

        cellFalling(0, 1),
        cellSolid(0),
        cellRising(0, 1)
    ]
};

function initJs() {
    // un-hide JS content
    document.getElementById('app').className = '';
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
    return {
        shape: SHAPE_SOLID,
        colors: [color],
    }
}

/**
 * Rising cell constructor
 * @param {number} topColor
 * @param {number} bottomColor
 * @returns Cell
 */
function cellRising(topColor, bottomColor) {
    return cell2(SHAPE_RISING, topColor, bottomColor);
}

/**
 * Falling cell constructor
 * @param {number} topColor
 * @param {number} bottomColor
 * @returns Cell
 */
function cellFalling(topColor, bottomColor) {
    return cell2(SHAPE_FALLING, topColor, bottomColor);
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

    if (cell.shape === SHAPE_SOLID) {
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
    for (let cX = 0; cX < quilt.size; ++cX) {
        oX = cX * cW;
        for (let cY = 0; cY < quilt.size; ++cY) {
            oY = cY * cH;
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
