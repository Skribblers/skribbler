import { DrawBuilder } from "../src/builders/DrawBuilder.js";
import { Tools, Colors, BrushSize } from "../src/constants.js";

const draw = new DrawBuilder();

if(draw.toValue().length !== 0) {
	throw new Error("DrawBuilder by default should have no draw commands");
}

// Check if the fill command results in the predicted value
draw.draw(Colors.DARK_MINT, BrushSize.SMALL, 0, 0, 800, 800);

const actualDraw = draw.toValue()[0];
const expectedDraw = [Tools.PENCIL, Colors.DARK_MINT, BrushSize.SMALL, 0, 0, 800, 800];

for(const i in expectedDraw) {
	if(expectedDraw[i] === actualDraw[i]) continue;

	// If the two arrays do not match, then we know something is up
	throw new Error(`Draw index ${i} does not match between the actual draw command and the expected draw command. ${actualDraw[i]} vs ${expectedDraw[i]}`);
}

// Check if the fill command results in the predicted value
draw.fill(Colors.DARK_GREEN, 50, 50);

const actualFill = draw.toValue()[1];
const expectedFill = [Tools.FILL, Colors.DARK_GREEN, 50, 50];

for(const i in expectedFill) {
	if(expectedFill[i] === actualFill[i]) continue;

	// If the two arrays do not match, then we know something is up
	throw new Error(`Fill index ${i} does not match between the actual fill command and the expected draw command. ${actualFill[i]} vs ${expectedFill[i]}`);
}

console.log("DrawBuilder tests were successful");