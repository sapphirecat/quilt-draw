"use strict";

/*
 * QuiltDraw - Quarter-Square Triangle Designer
 * Copyright (C) 2020 sapphirecat <devel@sapphirepaw.org>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


/**
 * @typedef {Object} Cell
 * @property {Array<number>} colors Palette indices of the colors of the cell
 */

/**
 * @typedef {Object} BlockInfo
 * @property {Array<Cell>} cells
 * @property {number} size
 */

/**
 * @typedef {Array<string>} Palette
 */

/**
 * @typedef {object} SashInfo
 * @property {number} levels
 * @property {Palette} colors
 */

/**
 * @typedef {object} Border
 * @property {number} cellWidth
 * @property {string} color
 */

/**
 * @typedef {object} Quilt
 * @property {number} size
 * @property {Array<Border>} borders
 * @property {Palette} colorSet
 * @property {SashInfo} sash
 * @property {BlockInfo} block
 * @property {BlockInfo} savedBlock
 */

/**
 * @typedef {[number, number]} Point
 */

/**
 * @typedef {object} RectSize
 * @property {number} w Width
 * @property {number} h Height
 */

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');

const EDITOR_MAX_WIDTH = editor.width;
// no EDITOR_MAX_HEIGHT: it is square.
const PREVIEW_MAX_WIDTH = preview.width;
const PREVIEW_MAX_HEIGHT = preview.height;

const BLOCKS_HORIZ = 4; // number of block copies across the preview
const BLOCKS_VERT = 5; // number of block copies down the preview

const BORDER_LIMIT = 6; // maximum number of borders that may be added
const COLOR_LIMIT = 12; // maximum number of colors in the palette

const SASH_NONE = 0; // sash disabled
const SASH_SINGLE = 1; // all one color
const SASH_DOUBLE = 2; // second color at intersections

const MOVE_IGNORE = 0; // tool does not allow holding mouse down
const MOVE_ALLOW = 1; // tool supports holding mouse down, but handler is inactive
const MOVE_TRACKING = 2; // mouse is down, and event handler is active

const CLICK_ALLOW = 0; // click event should be reacted to
const CLICK_IGNORE = 1; // click event should be suppressed

const TOOL_PAINT = 'paint'; // set color of tiles
const TOOL_SPIN = 'spin'; // turn tiles

// Lookup table for calculating cell hits. A = top/right side, B = bottom/left;
// X = bottom/right, Y = top/left.  AY = intersect(A, Y) = top.
const CELL_QUADRANTS = {
    "AY": 0,
    "AX": 1,
    "BX": 2,
    "BY": 3
};

const pickers = {};

/** @type Quilt quilt */
const quilt = newQuilt();

const ui = {
    editorState: 0,
    cellPx: null, // editor cell size in pixels (width & height)
    colorEvents: CLICK_ALLOW,
    colorTemplate: null,
    colorBox: null,
    borderTemplate: null,
    moveStatus: MOVE_ALLOW, // paint (default tool) allows moves
    paintColors: [1, 0], // primary/secondary paint colors
    selectedTool: TOOL_PAINT
};

const view = {
    layout: "",
    editorState: -1,
    quilt: null,
};

/**
 * @return {Quilt}
 */
function newQuilt() {
    return {
        size: 0,
        borders: [],
        colorSet: [],
        sash: {levels: SASH_NONE, colors: []},
        block: {size: 0, cells: []},
        savedBlock: {size: 0, cells: []}
    };
}

/**
 * Update the display of currently-selected paint colors.
 *
 * @param slot
 */
function showActiveColor(slot) {
    const view = document.getElementById(`colorActive${slot}`);
    if (view) {
        const colorIndex = ui.paintColors[slot];
        view.style.backgroundColor = quilt.colorSet[colorIndex];
    } else {
        console.error('No element for #colorActive%d', slot);
    }
}

/**
 * Activate the paint tool with the selected palette entry.
 *
 * @param {number} i Palette index to be set as paint color.
 * @param {number} [slot] A slot number to set, or the primary slot (0) by default.
 */
function setPaintColor(i, slot) {
    if (slot === undefined) {
        slot = 0;
    } else if (slot < 0 || slot > ui.paintColors.length) {
        console.error('invalid slot; paint color %d rejected', slot);
        return;
    }

    const prev = ui.paintColors[slot];

    ui.paintColors[slot] = i;
    showActiveColor(slot);

    // activate the tool
    ui.selectedTool = TOOL_PAINT;
    document.getElementById('tool-paint').checked = true;
    if (ui.moveStatus === MOVE_IGNORE) {
        ui.moveStatus = MOVE_ALLOW;
    }

    // move the selection hint for primary color only
    if (slot === 0 && i !== prev) {
        document.getElementById(`color${prev}`).classList.remove('selected');
        document.getElementById(`color${i}`).classList.add('selected');
    }
}

function randomColor() {
    const hue = Math.floor(Math.random() * 360);
    const sat = 45 + Math.floor(Math.random() * 35);
    const lns = 35 + Math.floor(Math.random() * 40);
    return `hsla(${hue}, ${sat}%, ${lns}%, 1.0)`;
}

/**
 * Generate a random cell structure.
 *
 * @returns {Cell}
 */
function randomCell() {
    const colorCount = Math.floor(quilt.colorSet.length);

    return {
        colors: [
            (Math.floor(Math.random() * colorCount)),
            (Math.floor(Math.random() * colorCount)),
            (Math.floor(Math.random() * colorCount)),
            (Math.floor(Math.random() * colorCount))
        ]
    };
}

function getPalette(element) {
    if (!element) {
        return ['#00ccff'];
    }

    const colorText = element.getAttribute('data-initial-palette') || '#ff00ff';
    return colorText.split(/,\s*/);
}

/**
 * Rotate array elements "leftward": all indices down one, 0 to last position.
 *
 * No effect if the array length is less than 2.
 *
 * @param {Array<number>} ary
 * @return void Operation is destructive, to limit GC pressure.
 */
function rotateLeft(ary) {
    if (ary.length > 1) {
        ary.push(ary.shift());
    }
}

/**
 * Rotate array elements "rightward": all indices up one, last position to 0.
 *
 * No effect if the array length is less than 2.
 *
 * @param {Array<number>} ary
 * @return void Operation is destructive, to limit GC pressure.
 */
function rotateRight(ary) {
    if (ary.length > 1) {
        ary.unshift(ary.pop());
    }
}

/**
 * @param {string} id Element ID
 * @return {boolean} Whether the element is present and checked.
 */
function isChecked(id) {
    const node = document.getElementById(id);
    return node && node.checked;
}

function initJs() {
    // set up UI
    initColors();
    initBorders();
    initTools();

    // generate a random initial quilt
    initQuiltBlock();

    // un-hide JS content
    document.getElementById('app').className = '';
}

function initQuiltBlock() {
    // get initial size from the HTML
    const sizeInput = document.getElementById('cell-size');
    const size = sizeInput && sizeInput instanceof HTMLInputElement ?
        parseInt(sizeInput.value, 10) :
        5;
    const cells = [];

    for (let column = 0; column < size; column++) {
        for (let row = 0; row < size; row++) {
            cells.push(randomCell());
        }
    }

    quilt.savedBlock = {cells, size};
    quilt.block = quilt.savedBlock;
}

function initTools() {
    // connect editor events
    editor.addEventListener('mousedown', onEditorMouse);
    editor.addEventListener('mouseup', onEditorMouseRelease);
    editor.addEventListener('contextmenu', (ev) => ev.preventDefault());

    // set up main controls
    // since mousedown can't prevent a click event, we use ui.colorEvents to
    // ignore a click following a mousedown we took responsibility for.
    const colorItems = document.getElementById('color-items');
    colorItems.addEventListener('mousedown', onPaletteDown, {capture: true});
    colorItems.addEventListener('click', onPaletteClick, {capture: true});
    colorItems.addEventListener('contextmenu', (ev) => ev.preventDefault());

    document.getElementById('tool-paint').checked = true;
    for (const node of document.querySelectorAll('.controls')) {
        node.addEventListener('click', onControlClick);
    }
    for (const node of document.querySelectorAll('#transforms input[type=range]')) {
        node.addEventListener('input', onControlClick);
    }

    // set up sashing colors
    initSashColors();
    if (isChecked('sash-on')) {
        quilt.sash.levels = isChecked('sash-cross-on') ? SASH_DOUBLE : SASH_SINGLE;
    }
}

function initBorders() {
    // create the default border
    ui.borderTemplate = document.getElementById('border-item');
    getPalette(ui.borderTemplate).forEach(addBorder);

    // set up events
    const root = ui.borderTemplate.parentElement;
    root.addEventListener('input', onBorderSize);

    const newBorder = () => {
        addBorder();
        updatePreview(editor, quilt);
        if (quilt.borders.length >= BORDER_LIMIT) {
            document.getElementById('border-new').classList.add('hide');
        }
    };
    document.getElementById('border-new').addEventListener('click', newBorder);
}

function initSashColors() {
    const colors = getPalette(document.getElementById('sashing'));
    const targets = ['main-sash-color', 'cross-sash-color'];
    if (colors.length !== targets.length) {
        console.error("Sash palette length %d does not match UI element count %d",
            colors.length, targets.length);
        return;
    }

    for (let i = 0; i < targets.length; i++) {
        const node = document.getElementById(targets[i]);
        if (!node) {
            console.error(`Target element id=${targets[i]} not found`);
            break; // fail somewhat gracefully
        }
        addSashColor(i, node, colors[i]);
    }
}

function initColors() {
    // set up global data for addColor
    ui.colorTemplate = document.getElementById('color-item');
    ui.colorBox = document.getElementById('color-items');

    // double-check that our requirements are fulfilled
    if (!(ui.colorTemplate && ui.colorBox)) {
        console.error("Invalid HTML: missing template#color-item or #colors");
        return;
    }


    // parse the initial palette data and create Pickr UI
    // create Pickr UI for each initial palette entry
    getPalette(ui.colorBox).forEach(addColor);

    // set the radio state to reflect the selected JS color
    const colorIndex = Math.min(ui.paintColors[0], quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).classList.add('selected');
        showActiveColor(0);
    }

    showActiveColor(1);

    // set up "New Color" button
    document.getElementById('color-new').addEventListener('click', createColor);
}

function createColor() {
    if (quilt.colorSet.length >= COLOR_LIMIT) {
        alert("That's just too many colors.");
        return;
    }

    const i = addColor(randomColor());
    setPaintColor(i);

    if (i + 1 >= COLOR_LIMIT) {
        document.getElementById('color-new').classList.add('hide');
    }
}

function newColorPicker(button, value) {
    return Pickr.create({
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
}

function addColor(value) {
    const i = quilt.colorSet.length;
    const item = ui.colorTemplate.content.cloneNode(true);

    // configure sub-DOM
    const button = item.querySelector('.color-button');
    if (!button) {
        console.error("Cannot find '.color-button' in ui.colorTemplate");
        return;
    }

    const dataNode = button.parentElement; // label.color-item
    dataNode.setAttribute('data-color-id', `${i}`);
    dataNode.id = `color${i}`;

    // define the color
    quilt.colorSet[i] = value;

    // activate the picker
    const picker = newColorPicker(button, value);

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
    document.getElementById('color-items').focus({preventScroll: true});
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

function onSashColorPickerHide(i) {
    pickers[`sash.${i}`].saved = quilt.sash.colors[i]; // save color for next cancel button click
    pickers[`sash.${i}`].handle.applyColor(true); // save color to button, without firing a save event
}

function onSashColorChanged(i, value) {
    quilt.sash.colors[i] = value.toHSLA().toString();
    updatePreview(editor, quilt);
}

function onSashColorReset(i) {
    quilt.sash.colors[i] = pickers[`sash.${i}`].saved;
    updatePreview(editor, quilt);
}

function addSashColor(i, button, value) {
    const picker = newColorPicker(button, value);

    picker.on('change', newValue => onSashColorChanged(i, newValue));
    picker.on('hide', () => onSashColorPickerHide(i));
    picker.on('cancel', () => onSashColorReset(i));

    pickers[`sash.${i}`] = {handle: picker, saved: value};
    quilt.sash.colors[i] = value;
}

function onBorderColorPickerHide(i) {
    pickers[`border.${i}`].saved = quilt.borders[i].color; // save color for next cancel button click
    pickers[`border.${i}`].handle.applyColor(true); // save color to button, without firing a save event
}

function onBorderColorChanged(i, value) {
    quilt.borders[i].color = value.toHSLA().toString();
    updatePreview(editor, quilt);
}

function onBorderColorReset(i) {
    quilt.borders[i].color = pickers[i].saved;
    updatePreview(editor, quilt);
}


/**
 * Add another border layer
 * @param {string} [color]
 */
function addBorder(color) {
    if (quilt.borders.length >= BORDER_LIMIT) {
        return;
    }

    const i = quilt.borders.length;
    const item = ui.borderTemplate.content.cloneNode(true);
    const range = item.querySelector("input[type=range]");
    const width = 1 + Math.floor(Math.random() * 3);
    const border = {cellWidth: width, color: color || randomColor()};

    item.querySelector('p').appendChild(document.createTextNode(`${i + 1}`));

    range.id = `borderWidth${i}`;
    range.setAttribute('data-border-index', `${i}`);
    range.value = border.cellWidth;

    const picker = newColorPicker(item.querySelector(".color-button"), border.color);
    // set up events
    picker.on('change', newValue => onBorderColorChanged(i, newValue));
    picker.on('hide', () => onBorderColorPickerHide(i));
    picker.on('cancel', () => onBorderColorReset(i));

    // commit changes
    quilt.borders[i] = border;
    pickers[`border.${i}`] = {handle: picker, saved: border.color};
    ui.borderTemplate.parentElement.appendChild(item);
}


/**
 * @param {MouseEvent} ev
 * @return {boolean}
 */
function isButtonRelevant(ev) {
    return !!(ev.buttons && ev.buttons < 3);
}

/**
 * @param {MouseEvent} ev
 * @return {boolean}
 */
function isPrimaryButton(ev) {
    return ev.buttons === 1;
}

/**
 * @param {MouseEvent} ev
 * @return {boolean}
 */
function isSecondaryButton(ev) {
    return ev.buttons === 2;
}

function editorClearMoveHandler() {
    editor.removeEventListener('mousemove', onEditorMouse);
    ui.moveStatus = MOVE_ALLOW;
}

function editorSetMoveHandler() {
    ui.moveStatus = MOVE_TRACKING;
    editor.addEventListener('mousemove', onEditorMouse);
}

function onEditorMouseRelease(ev) {
    ev.preventDefault();
    if (ui.moveStatus) {
        editorClearMoveHandler();
    }
}

/**
 * @param {MouseEvent} ev
 */
function onEditorMouse(ev) {
    // if multiple buttons or a higher (aux etc.) button was pressed, ignore
    // everything. don't even prevent default.
    if (ev.buttons && !isButtonRelevant(ev)) {
        return;
    }

    // we are taking responsibility for this event
    ev.preventDefault();

    // if the mouse was released out-of-canvas, cancel ourselves
    if (!ev.buttons) {
        editorClearMoveHandler();
        return;
    }

    // if this is the first mousedown, set us up to be called on move
    if (ui.moveStatus === MOVE_ALLOW) {
        editorSetMoveHandler();
    }

    const rect = editor.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;

    // calculate hit positions
    const sz = quilt.block.size;
    const index = _(x / ui.cellPx) + (sz * _(y / ui.cellPx));
    const cell = quilt.block.cells[index];

    // act on the hit
    const isSecondaryClick = isSecondaryButton(ev);
    switch (ui.selectedTool) {
    case TOOL_PAINT:
        // translate coordinates to cell-relative
        const top = _(index / sz) * ui.cellPx;
        const left = _(index % sz) * ui.cellPx;
        const hitX = x - left;
        const hitY = y - top;

        // determine which quadrant of the cell was hit
        const quadrantKey = `${hitX > hitY ? "A" : "B"}${hitX > (ui.cellPx - hitY) ? "X" : "Y"}`;
        const colorIndex = CELL_QUADRANTS[quadrantKey];

        // apply color to the index that was hit
        const colorChosen = ui.paintColors[isSecondaryClick ? 1 : 0];
        if (cell.colors[colorIndex] === colorChosen) {
            return; // painted same color, no updates needed
        }
        cell.colors[colorIndex] = colorChosen;

        break;
    case TOOL_SPIN:
        const fn = isSecondaryClick ? rotateLeft : rotateRight;
        fn(cell.colors);
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
    if (!(ev.target instanceof HTMLInputElement)) {
        return;
    }

    const i = parseInt(ev.target.getAttribute('data-border-index') || '0', 10) || 0;
    quilt.borders[i].cellWidth = parseInt(ev.target.value, 10);
    updatePreview(editor, quilt);
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
    if (classes.contains('resize')) {
        onResizeInput(ev);
    } else if (classes.contains('sash-select')) {
        onSashChange(ev);
    } else if (classes.contains('tool-active')) {
        onToolChange(ev);
    } else if (classes.contains('roll')) {
        onRollerClick(ev);
    } else if (classes.contains('download')) {
        onDownload(ev);
    }
}

/**
 * Capturing event handler for palette
 *
 * @param ev
 */
function onPaletteDown(ev) {
    ui.colorEvents = CLICK_ALLOW; // by default, we do not have full responsibility
    if (!isButtonRelevant(ev)) {
        return; // we don't handle this button/combo
    }

    // walk up the DOM until we find the label.color-item
    let node = ev.target;
    let found = false;
    while (node !== this && !found) {
        if (node.tagName === 'LABEL' && node.classList.contains('color-item')) {
            found = true;
        } else {
            node = node.parentElement;
        }
    }
    if (!found) {
        console.error("label element not found in event stack");
        return;
    }

    const colorIndex = parseInt(node.getAttribute('data-color-id'), 10);

    // if this is a PRIMARY click on a SELECTED color, pass the event through
    // to Pickr. we'll update the color when the picker is closed.
    if (isPrimaryButton(ev) && colorIndex === ui.paintColors[0]) {
        return;
    }

    // SECONDARY click or NON-SELECTED color. Take over the event ourselves.
    ev.preventDefault();
    ev.stopPropagation();
    ui.colorEvents = CLICK_IGNORE; // reject a 'click' if it is also generated
    setPaintColor(colorIndex, isSecondaryButton(ev) ? 1 : 0);
}

/**
 * @param {MouseEvent} ev
 */
function onPaletteClick(ev) {
    if (ui.colorEvents === CLICK_IGNORE) {
        ev.stopPropagation();
        ev.preventDefault();
    }

    ui.colorEvents = CLICK_ALLOW;
}

/**
 * @param {MouseEvent} ev
 */
function onToolChange(ev) {
    const node = ev.target;
    ui.selectedTool = node.id.replace(/^tool-/, '');

    // update movement state
    if (ui.moveStatus === MOVE_TRACKING) {
        editorClearMoveHandler();
    }
    ui.moveStatus = node.getAttribute('data-move-tracking') === '1' ? MOVE_ALLOW : MOVE_IGNORE;
}

/**
 * @param {MouseEvent} ev
 */
function onSashChange(ev) {
    const main = document.getElementById('sash-on');
    const cross = document.getElementById('sash-cross-on');

    quilt.sash.levels = main.checked ? (cross.checked ? SASH_DOUBLE : SASH_SINGLE) : SASH_NONE;
    updatePreview(editor, quilt);
}

/**
 * @param {MouseEvent} ev
 */
function onDownload(ev) {
    const node = ev.target;
    ev.preventDefault();

    if (!(node instanceof HTMLButtonElement)) {
        return;
    }

    // figure out what we're downloading
    const isPreview = node.id === 'download-preview';
    const source = isPreview ? preview : editor;
    const basename = isPreview ? 'quilt' : 'block';

    // generate download
    const link = document.createElement('a');
    link.href = source.toDataURL('image/png');
    link.download = `${basename}.png`;
    link.click();
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

    if (!(ev.target instanceof Element)) {
        return;
    }

    const callback = movers[ev.target.id];
    if (callback) {
        // Rolling is very unintuitive if we bring invisible parts into view.
        // Shrink-wrap the block before rolling.
        if (quilt.savedBlock.size > quilt.block.size) {
            quilt.savedBlock = quilt.block;
        }

        quilt.savedBlock = callback(quilt.savedBlock);
        quilt.block = quilt.savedBlock;
        updateView();
    }
}

/**
 * Resize the quilt's cells-per-block.
 *
 * @param {MouseEvent} ev
 */
function onResizeInput(ev) {
    const node = ev.target;
    if (!(node instanceof HTMLInputElement)) {
        return;
    }

    // perform the resizing operation
    const saved = quilt.savedBlock;
    const newSize = parseInt(node.value, 10);

    // decide how we need to resize the saved block
    if (newSize > saved.size) {
        // if we need to expand it, save it back to ui.savedBlock
        quilt.block = blockResizeUp(saved, newSize);
        quilt.savedBlock = quilt.block;
    } else if (newSize < saved.size) {
        // if we're going down, shrink our max-sized block
        quilt.block = blockResizeDown(saved, newSize);
    } else if (newSize === saved.size) {
        // going nowhere, use the max-sized block as-is
        quilt.block = quilt.savedBlock;
    }

    // update the view
    updateView();
}

/**
 * Resize a block to be larger.
 *
 * New rows/columns will be filled with random colors and shapes.
 *
 * @param {BlockInfo} block
 * @param {number} newSize
 * @return {BlockInfo}
 */
function blockResizeUp(block, newSize) {
    const currentSize = block.size;
    const output = new Array(newSize * newSize);

    let i = 0;
    let row, col;
    // copy the cells across, into the top-left
    for (row = 0; row < currentSize; row++) {
        for (col = 0; col < currentSize; col++) {
            output[i++] = block.cells[row * currentSize + col];
        }
        // finish out the remaining columns with random cells
        for (; col < newSize; col++) {
            output[i++] = randomCell();
        }
    }
    // finish out the remaining rows with random cells
    for (; row < newSize; row++) {
        for (col = 0; col < newSize; col++) {
            output[i++] = randomCell();
        }
    }

    return {cells: output, size: newSize};
}

/**
 * Resize a block to be smaller.
 *
 * @param {BlockInfo} block
 * @param {number} newSize
 * @return {BlockInfo}
 */
function blockResizeDown(block, newSize) {
    const currentSize = block.size;
    const output = new Array(newSize * newSize);

    let i = 0;
    for (let row = 0; row < newSize; row++) {
        for (let col = 0; col < newSize; col++) {
            output[i++] = block.cells[row * currentSize + col];
        }
    }

    return {cells: output, size: newSize};
}


/**
 *
 * @param {BlockInfo} block
 * @param mappingFn
 * @return {BlockInfo}
 */
function blockTransform(block, mappingFn) {
    const output = new Array(block.cells.length);
    const size = block.size;

    // walk across output in order. ask the mapping function where the data
    // for the row/column of output is located in the source, by row/column.
    let i = 0;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const [readRow, readCol] = mappingFn(row, col);
            output[i++] = block.cells[readCol + (readRow * size)];
        }
    }

    return {cells: output, size: size};
}

/**
 * Move all cells to the left, wrapping the leftmost column to the right
 *
 * @param {BlockInfo} block
 * @returns {BlockInfo}
 */
function rollLeft(block) {
    return blockTransform(block, function (row, col) {
        return [row, (col + 1) % block.size];
    });
}

/**
 * Move all cells to the right, wrapping the rightmost column to the left.
 *
 * @param {BlockInfo} block
 * @returns {BlockInfo}
 */
function rollRight(block) {
    return blockTransform(block, function (row, col) {
        return [row, col ? col - 1 : block.size - 1];
    });
}

/**
 * Move all cells down, wrapping the bottommost row to the top.
 *
 * @param {BlockInfo} block
 * @returns {BlockInfo}
 */
function rollDown(block) {
    return blockTransform(block, function (row, col) {
        return [row ? row - 1 : block.size - 1, col];
    });
}

/**
 * Move all cells up, wrapping the topmost row to the bottom.
 *
 * @param {BlockInfo} block
 * @returns {BlockInfo}
 */
function rollUp(block) {
    return blockTransform(block, function (row, col) {
        return [(row + 1) % block.size, col];
    });
}


function sizeCanvasTo(canvas, width, height) {
    const DPR = Math.max(window.devicePixelRatio, 1);
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = "${width}px";
    canvas.style.height = "${height}px";
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
 * Draw a polygon at coordinates on the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Point>} points Vertices of the polygon
 * @param {string} fillStyle Fill color for the polygon
 */
function drawPoly(ctx, points, fillStyle) {
    ctx.beginPath();

    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
    }

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
 * @param {number} cellPx
 * @param {Palette} palette
 * @param {Cell} cell
 */
function drawCellAt(ctx, oX, oY, cellPx, palette, cell) {
    // Determine all coordinates we can draw from: top/left/bottom/right pairs, and center
    const tl = [oX, oY];
    const tr = [oX + cellPx, oY];
    const bl = [oX, oY + cellPx];
    const br = [oX + cellPx, oY + cellPx];
    const c = [oX + cellPx / 2, oY + cellPx / 2];

    // Draw all four triangles into place, but eliminate seams by drawing the
    // top and bottom first, but bigger.
    // top-left, top-right, 1px down, 1px right-of-center, 1px left-of-center, 1px below top-left
    drawPoly(ctx, [tl, tr, [tr[0], tr[1] + 1], [c[0] + 1, c[1]], [c[0] - 1, c[1]], [tl[0], tl[1] + 1]], palette[cell.colors[0]]);
    // bot-left, bot-right, 1px up, 1px right-of-center, 1px left-of-center, 1px above bot-left
    drawPoly(ctx, [bl, br, [br[0], br[1] - 1], [c[0] + 1, c[1]], [c[0] - 1, c[1]], [bl[0], bl[1] - 1]], palette[cell.colors[2]]);
    // draw left/right triangles over the edges of the polygons
    drawTriangle(ctx, [c, tr, br], palette[cell.colors[1]]);
    drawTriangle(ctx, [c, bl, tl], palette[cell.colors[3]]);
}

/**
 * Draw a block into the editor area of the canvas.
 *
 * @param {Palette} colors
 * @param {BlockInfo} block
 */
function updateEditor(colors, block) {
    const cells = block.cells;
    const size = block.size;
    ui.editorState += 1;

    // Resize editor if needed, assuming square
    const cW = 2 * Math.floor(EDITOR_MAX_WIDTH / block.size / 2);
    if (cW !== ui.cellPx || editor.style.width === "") {
        const blockSize = cW * block.size;
        ui.cellPx = cW;
        sizeCanvasTo(editor, blockSize, blockSize);
    }

    // cell origin and current block index
    let oX, oY, iBlock;

    // canvas 2D context
    const ctx = editor.getContext('2d', {alpha: false});

    // process cells
    iBlock = 0; // index into block array
    for (let cY = 0; cY < size; ++cY) {
        oY = cY * ui.cellPx; // Y-origin = cell Y-index (row) times cell height
        for (let cX = 0; cX < size; ++cX) {
            oX = cX * ui.cellPx;
            drawCellAt(ctx, oX, oY, ui.cellPx, colors, cells[iBlock++]);
        }
    }
}

function deepCopy(x) {
    return JSON.parse(JSON.stringify(x));
}

function drawPreviewBlocks(source, ctx, blockSize, padSize, sashSize) {
    // first, scale the block to an offscreen canvas...
    const scaled = document.createElement('canvas');
    scaled.width = blockSize;
    scaled.height = blockSize;
    scaled.getContext('2d', {alpha: false}).drawImage(source, 0, 0, blockSize, blockSize);

    // now draw from the scaled rather than the source
    for (let col = 0; col < BLOCKS_HORIZ; col++) {
        for (let row = 0; row < BLOCKS_VERT; row++) {
            // determine the current block's origin X/Y
            const oX = padSize + (col * blockSize) + (sashSize * col);
            const oY = padSize + (row * blockSize) + (sashSize * row);
            // draw at the un-rounded origin, but using rounded-up size
            ctx.drawImage(scaled, oX, oY, blockSize, blockSize);
        }
    }
}

/**
 *
 * @param {Border} a
 * @param {Border} b
 * @return boolean
 */
function isBorderSame(a, b) {
    return a.cellWidth === b.cellWidth && a.color === b.color;
}

/**
 *
 * @param prevState
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cellSize
 * @param {RectSize} canvasSize
 */
function drawPreviewBorders(prevState, ctx, cellSize, canvasSize) {
    let oX = 0;
    let oY = 0;
    let w = canvasSize.w;
    let h = canvasSize.h;

    const borders = quilt.borders;
    for (let i = 0; i < borders.length; i++) {
        const border = borders[i];
        const viewBorder = prevState && i < prevState.length ? prevState[i] : null;

        // skip everything if this border is not visible
        if (border.cellWidth === 0) {
            continue;
        }

        // determine the border sizes
        const delta = border.cellWidth * cellSize; // full border space
        const strip = delta / 2; // space of one strip of the border

        // if this is a full redraw or the border has changed, repaint it
        if (!(viewBorder && isBorderSame(border, viewBorder))) {
            // draw an outer edge, then inner edge, then fill even-odd so that
            // only the actual border pixels get painted. overdraws vastly
            // fewer pixels than our old fillRect() code.
            ctx.beginPath();
            ctx.rect(oX, oY, w, h);
            ctx.rect(oX + strip, oY + strip, w - delta, h - delta);
            ctx.closePath();

            ctx.fillStyle = border.color;
            ctx.fill("evenodd");
        }

        // adjust next drawing area
        oX += strip;
        oY += strip;
        w -= delta;
        h -= delta;
    }
}

/**
 *
 * @param {SashInfo|null} vs
 * @param {CanvasRenderingContext2D} ctx
 * @param {SashInfo} sash
 * @param {number} padSize
 * @param {number} blockSize
 * @param {number} sashSpacing
 * @param {RectSize} canvasSize
 */
function drawPreviewSash(vs, ctx, sash, padSize, blockSize, sashSpacing, canvasSize) {
    if (sash.levels === SASH_NONE) {
        return;
    }

    const borderSize = 2 * padSize;
    const viewColors = vs && vs.levels === sash.levels ? vs.colors : [];
    const drawMain = !(vs && viewColors && viewColors[0] === sash.colors[0]);

    // draw main sashing
    if (drawMain) {
        ctx.fillStyle = sash.colors[0];
        for (let col = 1; col < BLOCKS_HORIZ; col++) {
            const oX = padSize + (col * blockSize) + (sashSpacing * col);
            ctx.fillRect(oX - sashSpacing, padSize, sashSpacing, canvasSize.h - borderSize);
        }
        for (let row = 1; row < BLOCKS_VERT; row++) {
            const oY = padSize + (row * blockSize) + (sashSpacing * row);
            ctx.fillRect(padSize, oY - sashSpacing, canvasSize.w - borderSize, sashSpacing);
        }
    }

    // draw cross sashing, if applicable
    if (sash.levels !== SASH_DOUBLE) {
        return;
    } else if (!drawMain && viewColors && viewColors[1] === sash.colors[1]) {
        // cross sashing neither changed nor drawn over
        return;
    }
    ctx.fillStyle = sash.colors[1];
    for (let col = 1; col < BLOCKS_HORIZ; col++) {
        for (let row = 1; row < BLOCKS_VERT; row++) {
            const oX = padSize + (col * blockSize) + (sashSpacing * col);
            const oY = padSize + (row * blockSize) + (sashSpacing * row);
            // draw cross sash: above left
            ctx.fillRect(oX - sashSpacing, oY - sashSpacing, sashSpacing, sashSpacing);
        }
    }
}

/**
 * @param {HTMLElement} source
 * @param {Quilt} quilt
 */
function updatePreview(source, quilt) {
    if (!(source instanceof HTMLCanvasElement)) {
        return;
    }

    // shorten some names
    const sash = quilt.sash;

    // calculate draw dimensions
    const DPR = Math.max(window.devicePixelRatio, 1.0);
    const hasSash = sash.levels !== SASH_NONE;
    const blockCells = quilt.block.size;
    let borderUnits = 0;

    for (const border of quilt.borders) {
        borderUnits += border.cellWidth;
    }

    // "Border units" is in half-cells, so figure out the pixel size based on blockSize.
    // Determine the number of cells horizontally and vertically.  This is determining the total
    // border: borderUnits=1 means 1/2 cell * 2 sides.  Sashing goes between blocks only, and it
    // is a fixed 1-cell width for the moment.  Thus, it adds blocks-1 cells to each dimension
    // when present.
    const cHoriz = (blockCells * BLOCKS_HORIZ + borderUnits + (hasSash ? BLOCKS_HORIZ - 1 : 0));
    const cVert = (blockCells * BLOCKS_VERT + borderUnits + (hasSash ? BLOCKS_VERT - 1 : 0));
    // PREVIEW_MAX_WIDTH/HEIGHT were set before we ever looked at DPR.
    const cellSize = DPR * Math.floor(Math.min(PREVIEW_MAX_WIDTH / cHoriz, PREVIEW_MAX_HEIGHT / cVert) / 2) * 2;
    let fullRedraw = (view.quilt === null);

    if (view.quilt == null) {
        view.quilt = newQuilt();
    }

    // resize the canvas to the draw dimensions if needed
    const layout = `${cellSize},${cHoriz},${cVert},${hasSash ? 'sash' : 'noSash'}`;
    if (layout !== view.layout) {
        view.layout = layout;
        sizeCanvasTo(preview, cellSize * cHoriz, cellSize * cVert);
        fullRedraw = true; // resizing clears the canvas, so we need to paint everything
    }

    // start drawing
    const ctx = preview.getContext('2d', {alpha: false});
    const canvasSize = {w: preview.width, h: preview.height};

    // Size border to user request
    const padSize = cellSize * borderUnits / 2.0; // half on each side
    // Determine the block size within the remaining area
    const blockSize = cellSize * quilt.block.size;

    // draw changes to borders
    drawPreviewBorders(fullRedraw ? null : view.quilt.borders, ctx, cellSize, canvasSize);
    view.quilt.borders = deepCopy(quilt.borders);

    // draw the 5x4 blocks, inset by the half-border-width padSize, and offset
    // by sashing if specified
    if (fullRedraw || ui.editorState !== view.editorState) {
        drawPreviewBlocks(source, ctx, blockSize, padSize, hasSash ? cellSize : 0);
        view.editorState = ui.editorState;
    }

    // draw main sashing, if applicable
    if (hasSash) {
        drawPreviewSash(fullRedraw ? null : view.quilt.sash, ctx, sash, padSize, blockSize, cellSize, canvasSize);
        view.quilt.sash = deepCopy(sash);
    } else if (view.quilt.sash.levels !== SASH_NONE) {
        view.quilt.sash = {levels: SASH_NONE, colors: []};
    }
}

function updateView() {
    updateEditor(quilt.colorSet, quilt.block);
    updatePreview(editor, quilt);
}

if (editor && preview) {
    initJs();
    updateView();
} else {
    console.error("Can't get editor and preview; doing nothing.");
}
