import { AxiosError } from "axios";
import { TriggerBase } from "grindery-nexus-common-utils";
import { getUserIdByHandle } from "../userId";
import { getPoller } from "../poller";

type NewFollowerTriggerFields = {
  handle: string;
};
type NewFollowerTriggerInitStates = {
  lastFollowerIds: string[];
  userId: string;
};
export class NewFollowerTrigger extends TriggerBase<NewFollowerTriggerFields, unknown, NewFollowerTriggerInitStates> {
  async main() {
    if (!this.input.authentication) {
      throw new Error("No auth token");
    }
    if (!this.fields.handle) {
      throw new Error("Handle not provided");
    }
    let userId: string;
    try {
      userId = await getUserIdByHandle(this.input.cdsName, this.input.authentication, this.fields.handle);
    } catch (e) {
      console.error(`Error when getting ID for @${this.fields.handle}`, (e as AxiosError).response?.data || e);
      throw new Error(`Error when getting ID for @${this.fields.handle}`);
    }
    const poller = await getPoller<{ users: { id_str: string }[] }>({
      numRequestsPerWindow: 15,
      windowMs: 15 * 1000 * 60,
      pathTemplate: "1.1/followers/list.json?user_id=%s&count=200&skip_status=true",
      cdsName: this.input.cdsName,
      authToken: this.input.authentication,
    });
    let lastFollowerIds = new Set(
      this.state.userId && this.state.userId !== userId ? [] : this.state.lastFollowerIds || []
    );
    console.log(
      `NewFollowerTrigger: @${this.fields.handle} -> ${userId}, ${lastFollowerIds.size} followers restored from state`
    );
    let noFollowerInLastCheck = false;
    const unregister = poller.register(userId, async (resp) => {
      if (!this.isRunning) {
        unregister();
        return;
      }
      if (noFollowerInLastCheck || resp.users.some((x) => lastFollowerIds.has(x.id_str))) {
        for (const user of resp.users) {
          if (lastFollowerIds.has(user.id_str)) {
            break;
          }
          this.sendNotification(user);
        }
      } else {
        console.log(`[NewFollowerTrigger/${this.fields.handle}] Skipping round`);
      }

      noFollowerInLastCheck = !resp.users.length;
      const ids = resp.users.map((x) => x.id_str);
      lastFollowerIds = new Set(ids);
      await this.updateState({ lastFollowerIds: ids, userId });
    });
    try {
      await this.waitForStop();
    } finally {
      unregister();
    }
  }
}
