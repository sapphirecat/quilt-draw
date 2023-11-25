# Plans and Ideas for Quilt Draw

What could be next?  Anything!
But something from this document is more likely than the alternatives.

## Tools

### Move Tool

Instead of the 4-way buttons in a 3×3 grid,
have a move tool (a hand?) that allows dragging the canvas.

### Floating Tool Preview

Highlight the cell or block to be affected by the current tool.

### Block-Level Tools

Spin and Flip are relevant operations for the entire block,
not only cells.

### More Flexible Guides

Instead of off/solid, add "dots" (cell corners only, like PikoPixel)
and "dashed" line modes.

Is there a reason we didn't use Pickr to select the guide color?
Like so:

    ✅ Guides 🟦

### Left-handed switch

Potentially obsolete: the swatches are stacked _vertically_ now,
in an attempt to eliminate the left/right confusion with left-handed mousing.

## General/Tabs

### Multiple Blocks

The Blocks tab should let the user add more than one block.
The Quilt tab would then have a way to associate blocks,
whether that's a simple A/B checkerboard (and 2-block limit) at first,
or a complete set of tools for putting blocks on the preview.

### Resizable Preview

A new quilt setting would allow resizing the quilt,
instead of hard-coding 4x5 blocks.

### Print Tab

With tabs and especially multiple blocks,
"just hit Print" is not as helpful as it could be.
We should have a dedicated tab with all of the blocks in view,
and no cruft to hide with `@print` rules.

### On-the-Point Mode

Add a "quilt background color,"
and paint blocks rotated at 45° on the preview.

## Load/Save

As quilts get more complex,
it would be nice to be able to save and restore them.
