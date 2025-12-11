const { ReportBuilder } = require("../src/builders/ReportBuilder.js");

const report = new ReportBuilder();

if(report.toValue() !== 0) {
    console.error("ReportBuilder by default should have no report reasons");
    process.exit(1);
}

report.inappropriateBehavior = true;
report.spam = false;
report.cheating = false;

if(report.toValue() !== (1 << 0)) {
    console.error("A report reason of Innappropriate Behavior should result in a bitfield of 1");
    console.log(report.toValue());
    process.exit(1);
}

report.inappropriateBehavior = false;
report.spam = true;
report.cheating = true;

if(report.toValue() !== ((1 << 1) | ( 1 << 2))) {
    console.error("A report reason of Spam and Cheating should result in a bitfield of 6");
    process.exit(1);
}

// Make sure we can revert all the values back
report.inappropriateBehavior = false;
report.spam = false;
report.cheating = false;

if(report.toValue() !== 0) {
    console.error("ReportBuilder failed to revert the bitfield back to 0");
    process.exit(1);
}

console.log("ReportBuilder tests were successful");