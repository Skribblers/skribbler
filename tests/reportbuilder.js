import { ReportBuilder } from "../src/builders/ReportBuilder.js";

const report = new ReportBuilder();

if(report.toValue() !== 0) {
    throw new Error("ReportBuilder by default should have no report reasons");
}

report.inappropriateBehavior = true;
report.spam = false;
report.cheating = false;

if(report.toValue() !== (1 << 0)) {
    console.log(report.toValue());
    throw new Error("A report reason of Innappropriate Behavior should result in a bitfield of 1");
}

report.inappropriateBehavior = false;
report.spam = true;
report.cheating = true;

if(report.toValue() !== ((1 << 1) | ( 1 << 2))) {
    throw new Error("A report reason of Spam and Cheating should result in a bitfield of 6");
}

// Make sure we can revert all the values back
report.inappropriateBehavior = false;
report.spam = false;
report.cheating = false;

if(report.toValue() !== 0) {
    throw new Error("ReportBuilder failed to revert the bitfield back to 0");
}

console.log("ReportBuilder tests were successful");