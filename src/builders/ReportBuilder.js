const { ReportReasons } = require("../constants.js");

class ReportBuilder {
    bitfield = 0;

    get inappropriateBehavior() {
        return (this.bitfield & ReportReasons.INAPPROPRIATE_BEHAVIOR) === ReportReasons.INAPPROPRIATE_BEHAVIOR;
    }

    set inappropriateBehavior(bool) {
        if(bool) {
            this.bitfield |= ReportReasons.INAPPROPRIATE_BEHAVIOR;
        } else {
            this.bitfield ^= ReportReasons.INAPPROPRIATE_BEHAVIOR;
        }
    }

    get spam() {
        return (this.bitfield & ReportReasons.SPAM) === ReportReasons.SPAM;
    }

    set spam(bool) {
        if(bool) {
            this.bitfield |= ReportReasons.SPAM;
        } else {
            this.bitfield ^= ReportReasons.SPAM;
        }
    }

    get cheating() {
        return (this.bitfield & ReportReasons.CHEATING) === ReportReasons.CHEATING;
    }

    set cheating(bool) {
        if(bool) {
            this.bitfield |= ReportReasons.CHEATING;
        } else {
            this.bitfield ^= ReportReasons.CHEATING;
        }
    }

    toValue() {
        return this.bitfield;
    }
}

module.exports = {
    ReportBuilder
}