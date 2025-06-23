import { startStream } from "../src/api/birdeyeAPI.startStream";
import { scoreOpportunity } from "../src/utils/opportunityScorer";

startStream((snapshot: any) => {
  if (scoreOpportunity(snapshot).score >= 60) console.log("🔥", snapshot);
});
