import { TriggerBase } from "grindery-nexus-common-utils";
import { getPoller } from "../poller";

type NewLikeTriggerFields = {
  url: string;
};
type NewLikeTriggerInitStates = {
  lastLikerIds: string[];
  tweetId: string;
};
export class NewLikeTrigger extends TriggerBase<NewLikeTriggerFields, unknown, NewLikeTriggerInitStates> {
  async main() {
    if (!this.input.authentication) {
      throw new Error("No auth token");
    }
    if (!this.fields.url) {
      throw new Error("URL not provided");
    }
    const m = /^https?:\/\/twitter\.com\/(?:#!\/)?\w+\/status(?:es)?\/(\d+)$/.exec(this.fields.url);
    if (!m) {
      throw new Error("Invalid tweet URL");
    }
    const tweetId = m[1];
    const poller = await getPoller<{ data: { id: string }[] }>({
      numRequestsPerWindow: 5,
      windowMs: 15 * 1000 * 60,
      pathTemplate:
        "2/tweets/%s/liking_users?user.fields=created_at,description,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,verified_type,withheld",
      cdsName: this.input.cdsName,
      authToken: this.input.authentication,
    });
    let lastLikerIds = new Set(
      this.state.tweetId && this.state.tweetId !== tweetId ? [] : this.state.lastLikerIds || []
    );
    console.log(
      `NewLikeTrigger: @${this.fields.url} -> ${tweetId}, ${lastLikerIds.size} likes restored from state`
    );
    let noLikeInLastCheck = false;
    const unregister = poller.register(tweetId, async (resp) => {
      if (!this.isRunning) {
        unregister();
        return;
      }
      if (noLikeInLastCheck || resp.data.some((x) => lastLikerIds.has(x.id))) {
        for (const user of resp.data) {
          if (lastLikerIds.has(user.id)) {
            break;
          }
          this.sendNotification(user);
        }
      } else {
        console.log(`[NewLikeTrigger/${tweetId}] Skipping round`);
      }

      noLikeInLastCheck = !resp.data.length;
      const ids = resp.data.map((x) => x.id);
      lastLikerIds = new Set(ids);
      await this.updateState({ lastLikerIds: ids, tweetId });
    });
    try {
      await this.waitForStop();
    } finally {
      unregister();
    }
  }
}
