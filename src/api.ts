import axios, { AxiosError, AxiosRequestConfig } from "axios";

const CREDENTIAL_MANAGER_REQUEST_PREFIX = process.env.CREDENTIAL_MANAGER_REQUEST_PREFIX || "";
if (!CREDENTIAL_MANAGER_REQUEST_PREFIX && process.env.NODE_ENV === "production") {
  throw new Error("CREDENTIAL_MANAGER_REQUEST_PREFIX is empty");
}
export const getApiUrl = (cdsName: string, path: string) =>
  `${CREDENTIAL_MANAGER_REQUEST_PREFIX.replace("$CDS_NAME", cdsName)}api.twitter.com/${path}`;
export const apiCall = async <T>(
  cdsName: string,
  authToken: string,
  path: string,
  { headers, ...config }: AxiosRequestConfig = {}
) =>
  (
    await axios({
      method: "get",
      url: getApiUrl(cdsName, path),
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(headers || {}),
      },
      ...(config || {}),
    })
  ).data as T;
export async function apiCall429Aware<T>(
  cdsName: string,
  authToken: string,
  path: string,
  config: AxiosRequestConfig = {}
) {
  for (;;) {
    try {
      return await apiCall<T>(cdsName, path, authToken, config);
    } catch (e) {
      const axiosError = e as AxiosError;
      if (axiosError.status !== 429) {
        throw e;
      }
      const retryAfter = parseInt(
        axiosError.response?.headers["retry-after"] || axiosError.response?.headers["x-rate-limit-reset"],
        10
      );
      if (retryAfter) {
        const ts = retryAfter * 1000;
        const diff = ts - Date.now();
        if (diff < 0) {
          console.warn("Got Retry-After in the past: " + retryAfter);
        }
        console.log(`[${path}] Got 429, waiting until ${ts} (${new Date(ts).toISOString()})`);
        await new Promise((res) => setTimeout(res, diff));
      }
    }
  }
}
