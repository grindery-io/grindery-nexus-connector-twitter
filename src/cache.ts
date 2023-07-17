export const createCache = <T>() => {
  const cache = {} as { [key: string]: T | Promise<T> };
  return (key: string, generateValue: () => Promise<T>) => {
    if (!cache[key]) {
      cache[key] = (async () => {
        const value = await generateValue();
        cache[key] = value;
        return value;
      })();
    }
    return cache[key];
  };
};
