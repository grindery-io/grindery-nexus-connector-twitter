import axios, { AxiosError } from "axios";
import _ from "lodash";
import { getApiUrl } from "./api";
import { createCache } from "./cache";
import { getApiUserId } from "./userId";

type Callback<T> = (data: T) => Promise<void>;
class FairPoller<T> {
  private serial = 0;
  private requestTime = 0;
  private readonly requestInterval: number;
  private readonly windowMs: number;
  private readonly pathTemplate: string;
  private readonly cdsName: string;
  private readonly authToken: string;
  private callbacks = new Map<string, Map<number, Callback<T>>>();
  private workerRunning = false;
  constructor({
    numRequestsPerWindow,
    windowMs,
    pathTemplate,
    cdsName,
    authToken,
  }: {
    numRequestsPerWindow: number;
    windowMs: number;
    pathTemplate: string;
    cdsName: string;
    authToken: string;
  }) {
    this.requestInterval = windowMs / numRequestsPerWindow;
    this.pathTemplate = pathTemplate;
    this.windowMs = windowMs;
    this.cdsName = cdsName;
    this.authToken = authToken;
  }
  private async pollItem(item: string) {
    let waitTime = this.requestTime - Date.now();
    if (waitTime > -1000 && waitTime < 1000) {
      waitTime = 1000;
    }
    if (waitTime > 0) {
      await new Promise((res) => setTimeout(res, waitTime));
    }
    const callbacks = this.callbacks.get(item);
    if (!callbacks?.size) {
      this.callbacks.delete(item);
      return;
    }
    let data: T;
    try {
      data = await this.request(item);
    } catch (e) {
      const axiosError = e as AxiosError;
      console.error(
        `[${this.pathTemplate.replace("%s", "<param>")} / ${item}] Request error ${
          axiosError.isAxiosError ? axiosError.status || axiosError.message || "<unknown>" : e?.toString()
        }`,
        axiosError?.response ? _.pick(axiosError?.response || {}, ["config", "headers", "data"]) : e
      );
      if (axiosError.status === 429) {
        const retryAfter = parseInt(
          axiosError.response?.headers["retry-after"] || axiosError.response?.headers["x-rate-limit-reset"],
          10
        );
        if (retryAfter) {
          const ts = retryAfter * 1000;
          const diff = ts - Date.now();
          if (diff < 0) {
            console.warn("Got Retry-After in the past: " + retryAfter);
          } else if (diff > this.windowMs) {
            console.warn("Got unexpectedly large Retry-After: " + retryAfter);
          }
          this.requestTime = ts;
        }
      }
      return;
    }
    for (const id of callbacks.keys()) {
      await callbacks
        .get(id)?.(data)
        ?.catch((e) => console.warn(`[${this.pathTemplate} / ${item}] Error in callback`, e));
    }
    if (!callbacks.size) {
      this.callbacks.delete(item);
    }
  }
  private async worker() {
    if (this.workerRunning) {
      return;
    }
    this.workerRunning = true;
    try {
      for (;;) {
        const items = Array.from(this.callbacks.keys());
        if (!items.length) {
          return;
        }
        for (const item of items) {
          await this.pollItem(item);
        }
      }
    } catch (e) {
      console.error("FairPoller: Unexpected error:", e);
      setTimeout(this.worker, 1000);
      return;
    } finally {
      this.workerRunning = false;
    }
  }
  private async request(param: string): Promise<T> {
    this.requestTime = Date.now() + this.requestInterval;
    const resp = await axios.get(getApiUrl(this.cdsName, this.pathTemplate.replace("%s", param)), {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });
    return resp.data;
  }
  register(param: string, callback: Callback<T>) {
    const id = this.serial++;
    if (!this.callbacks.has(param)) {
      this.callbacks.set(param, new Map());
    }
    this.callbacks.get(param)?.set(id, callback);
    this.worker();
    return () => this.unregister(param, id);
  }
  private unregister(param: string, id: number) {
    this.callbacks.get(param)?.delete?.(id);
  }
}
const pollerCache = createCache<FairPoller<unknown>>();
export async function getPoller<T>(config: ConstructorParameters<typeof FairPoller<unknown>>[0]) {
  const userId = await getApiUserId(config.cdsName, config.authToken);
  return (await pollerCache(`${userId}/${config.pathTemplate.replace(/\?.*$/g, "")}`, async function () {
    console.log(`Creating poller: ${userId}/${config.pathTemplate}/${config.numRequestsPerWindow}/${config.windowMs}`);
    return new FairPoller(config);
  })) as FairPoller<T>;
}
