export interface Options {
  size?: number;
  ttl?: number;
}

export interface Selector<P, R> extends Function {
  (param: P): R;
  /**
   * clear cached value
   */
  clear(): void;
}

export interface SelectorFactory<F extends any[], P, R> extends Function {
  (...args: F): Selector<P, R>;
  /**
   * clear all cached values of the factory
   */
  clear(): void;
}

export interface SelectorBuilder<
  TParam = {},
  TSelected = {},
  TFactory = void,
  TKey extends any[] = never
> {
  /**
   * use multiple 'input' selectors
   * @param selectors
   */
  use<
    P = TParam,
    S extends { [key: string]: (param: P, ...args: TKey) => any } = any
  >(
    selectors: S
  ): SelectorBuilder<
    TParam & P,
    TSelected & { [key in keyof S]: ReturnType<S[key]> },
    TFactory,
    TKey
  >;
  /**
   * use 'input' selector that uses to select a pie of value from input param
   * @param name
   * @param selector
   */
  use<N extends string = string, P = TParam, R = any>(
    name: N,
    selector: (param: P, ...args: TKey) => R
  ): SelectorBuilder<TParam & P, TSelected & { [key in N]: R }, TFactory, TKey>;
  /**
   * use 'input' selector that uses to select a pie of value from input param
   * @param selector
   */
  use<P = TParam, R extends Record<string, any> = any>(
    selector: (param: P, ...args: TKey) => R
  ): SelectorBuilder<TParam & P, TSelected & R, TFactory, TKey>;
  /**
   * set equalCompareFn, the equalCompareFn uses to compare previous and next param of the selector,
   * if they are identical, the previous selected result will be returned
   * @param equalCompareFn
   */
  compare(equalCompareFn: (a: TParam, b: TParam) => boolean): this;
  /**
   * set cache size, by default, cache size is 1
   * @param value
   */
  size(value: number): this;
  /**
   * configure TTL for cached selected result
   * @param value
   */
  ttl(value: number): this;
  /**
   * create a selector factory that accepts single argument with type P
   */
  key<P = any>(): SelectorBuilder<TParam, TSelected, [P], [P]>;
  /**
   * create a selector factory with keySelector, the selector factory accepts all arguments of keySelector.
   * The keySelector returns a list of key, those keys will be use for caching the result selector
   * @param keySelector
   */
  key<P extends any[], K extends any[]>(
    keySelector: (...args: P) => K
  ): SelectorBuilder<TParam, TSelected, P, K>;
  /**
   * build the memozied structured selector
   */
  build(): TFactory extends any[]
    ? SelectorFactory<TFactory, TParam, TSelected>
    : Selector<TParam, TSelected>;
  /**
   * build the memoized selector with 'result' selector
   * @param resultSelector
   */
  build<R>(
    resultSelector: (selected: TSelected, ...args: TKey) => R
  ): TFactory extends any[]
    ? SelectorFactory<TFactory, TParam, R>
    : Selector<TParam, R>;
}

type SelectorCache = Map<any, SelectorCache> & { selector?: Function };
type ResultCacheEntry = {
  result?: any;
  param: any;
  expiry: number;
  selected?: any;
};

export type Memosel = {
  (): SelectorBuilder;
  <P>(): SelectorBuilder<P>;
  /**
   * create a memoized function
   */
  <P, R>(fn: (param: P) => R, options?: Options): Selector<P, R>;
  /**
   * create memoized function factory
   */
  <F extends any[], R, P, K extends any[]>(
    fn: (param: P, ...args: K) => R,
    key: (...args: F) => K,
    options?: Options
  ): SelectorFactory<F, P, R>;
};

type CacheRemovingEntry = { expiry: number; callback: Function };

const defaultKeySelector = (...args: any[]) => args;
const strictEqual = (a: any, b: any) => a === b;
const enqueue = Promise.resolve(null).then.bind(Promise.resolve(null));
const cacheRemovingQueue: CacheRemovingEntry[] = [];
let caceRemovingEntry: CacheRemovingEntry | undefined;

const startCacheRemovingTask = () => {
  // prev task is running
  if (caceRemovingEntry) return;
  caceRemovingEntry = cacheRemovingQueue.shift();
  // queue is empty
  if (!caceRemovingEntry) return;
  const nextTicks = caceRemovingEntry.expiry - Date.now();
  const performRemoving = () => {
    caceRemovingEntry?.callback();
    caceRemovingEntry = undefined;
    startCacheRemovingTask();
  };
  // expired, remove immediately
  if (nextTicks <= 0) {
    performRemoving();
  } else {
    setTimeout(performRemoving, nextTicks);
  }
};

const addToCaceRemovingQueue = (expiry: number, callback: Function) => {
  enqueue(() => {
    cacheRemovingQueue.push({ expiry, callback });
    cacheRemovingQueue.sort((a, b) => a.expiry - b.expiry);
    startCacheRemovingTask();
  });
};

const createBuilder = (): SelectorBuilder => {
  let selectorEntries: [string, Function][];
  let keySelector: Function;
  let resultSelector: Function | undefined;
  let ttl: number;
  let size = 1;
  let equalCompareFn = strictEqual;

  const selectorCache: SelectorCache = new Map();
  const selectorMap: Record<string, Function> = {};
  const selectorList: Function[] = [];
  const clear = () => selectorCache.clear();
  const createSelector = (keys: any[]) => {
    let resultCache: ResultCacheEntry[] = [];

    return Object.assign(
      (param: any) => {
        const now = Date.now();
        let entry = resultCache.find((x) => equalCompareFn(x.param, param));
        if (!entry) {
          entry = { param, expiry: 0 };
          resultCache.unshift(entry);
          // remove last one if the cache has been exceeded
          if (size && resultCache.length > size) {
            resultCache.pop();
          }
        }

        if (!entry.selected || entry.expiry < now) {
          entry.expiry = ttl ? now + ttl : Number.MAX_VALUE;
          if (ttl) {
            addToCaceRemovingQueue(entry.expiry, () => {
              resultCache.length = 0;
            });
          }
          let hasChange = false;
          const nextSelected: Record<string, any> = {};
          selectorEntries.forEach(([key, selector]) => {
            const nextValue = selector(param, ...keys);
            nextSelected[key] = nextValue;
            if (
              !entry?.selected ||
              nextSelected[key] !== entry?.selected[key]
            ) {
              hasChange = true;
            }
          });
          selectorList.forEach((selector) => {
            const nextMap = selector(param, ...keys);
            if (!nextMap) return;
            Object.entries(nextMap).forEach(([key, value]) => {
              nextSelected[key] = value;
              if (
                !entry?.selected ||
                nextSelected[key] !== entry?.selected[key]
              ) {
                hasChange = true;
              }
            });
          });
          if (hasChange) {
            entry.selected = nextSelected;
            entry.result = resultSelector
              ? resultSelector(entry.selected, ...keys)
              : entry.selected;
          }
        }
        return entry.result;
      },
      {
        clear() {
          resultCache.length = 0;
        },
      }
    );
  };
  const defaultSelector = createSelector([]);
  const getSelector = (keys: any[]) => {
    if (!keys.length) return defaultSelector;
    const map = keys.reduce((map: SelectorCache, key) => {
      let m = map.get(key);
      if (!m) {
        m = new Map();
        map.set(key, m);
      }
      return m;
    }, selectorCache);
    if (!map.selector) {
      map.selector = createSelector(keys);
    }
    return map.selector;
  };

  const builder: SelectorBuilder = {
    use(...args: any[]): any {
      // use(selector)
      if (typeof args[0] === "function") {
        selectorList.push(args[0]);
      }
      // use(selectors)
      else if (typeof args[0] === "object" && args.length === 1) {
        Object.assign(selectorMap, args[0]);
      } else {
        // use(name, selector)
        const [name, selector] = args;
        selectorMap[name] = selector;
      }
      return this;
    },
    ttl(value) {
      ttl = value;
      return this;
    },
    size(value) {
      size = value;
      return this;
    },
    key(selector?: Function): any {
      keySelector = selector || defaultKeySelector;
      return this;
    },
    compare(value) {
      equalCompareFn = value;
      return this;
    },
    build(selector?: Function): any {
      selectorEntries = Object.entries(selectorMap);
      resultSelector = selector;
      if (!keySelector) return defaultSelector;
      return Object.assign(
        (...args: any[]) =>
          args.length ? getSelector(keySelector(...args)) : defaultKeySelector,
        { clear }
      );
    },
  };

  return builder;
};

const memosel: Memosel = (...args: any[]): any => {
  // overloads
  if (args.length) {
    let factory: any;
    let selector: any;
    let options: Options | undefined;
    if (typeof args[1] === "function") {
      [selector, factory, options] = args;
    } else {
      [selector, options] = args;
    }
    const { ttl, size } = options || {};
    let builder = createBuilder();
    if (typeof ttl !== "undefined") builder = builder.ttl(ttl);
    if (typeof size !== "undefined") builder = builder.size(size);
    if (factory) builder = builder.key(factory);
    return builder
      .use("param", (x: any) => x)
      .build(({ param }) => selector(param));
  }
  return createBuilder();
};

export default memosel;
