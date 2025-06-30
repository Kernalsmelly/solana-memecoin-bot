"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const birdeyeAPI_startStream_1 = require("../src/api/birdeyeAPI.startStream");
const opportunityScorer_1 = require("../src/utils/opportunityScorer");
(0, birdeyeAPI_startStream_1.startStream)((snapshot) => {
    if ((0, opportunityScorer_1.scoreOpportunity)(snapshot).score >= 60)
        console.log("🔥", snapshot);
});
//# sourceMappingURL=smokeTest.js.map