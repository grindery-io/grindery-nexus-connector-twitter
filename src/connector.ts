import { ConnectorDefinition } from "grindery-nexus-common-utils";
import { NewFollowerTrigger } from "./triggers/newFollower";
import { NewLikeTrigger } from "./triggers/newLike";

export const CONNECTOR_DEFINITION: ConnectorDefinition = {
  actions: {},
  triggers: { NewFollowerTrigger, NewLikeTrigger },
  webhooks: {},
};
