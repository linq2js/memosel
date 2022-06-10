export interface Selector<P, R> extends Function {
  (param: P): R;
  /**
   * clear cached value
   */
  clear(): void;
}

export interface FamilySelector<F extends any[], P, R> extends Function {
  (...args: F): Selector<P, R>;
  /**
   * clear all cached values of the family
   */
  clear(): void;
}

export interface SelectorBuilder<
  TParam = {},
  TSelected = {},
  TFamily = void,
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
    TFamily,
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
  ): SelectorBuilder<TParam & P, TSelected & { [key in N]: R }, TFamily, TKey>;
  /**
   * use 'input' selector that uses to select a pie of value from input param
   * @param selector
   */
  use<P = TParam, R extends Record<string, any> = any>(
    selector: (param: P, ...args: TKey) => R
  ): SelectorBuilder<TParam & P, TSelected & R, TFamily, TKey>;
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
   * create a family selector that accepts single argument with type P
   */
  family<P = any>(): SelectorBuilder<TParam, TSelected, [P], [P]>;
  /**
   * create a family selector with keySelector, the family selector accepts all arguments of keySelector.
   * The keySelector returns a list of key, those keys will be use for caching the result selector
   * @param keySelector
   */
  family<P extends any[], K extends any[]>(
    keySelector: (...args: P) => K
  ): SelectorBuilder<TParam, TSelected, P, K>;
  /**
   * build the memozied structured selector
   */
  build(): TFamily extends any[]
    ? FamilySelector<TFamily, TParam, TSelected>
    : Selector<TParam, TSelected>;
  /**
   * build the memoized selector with 'result' selector
   * @param resultSelector
   */
  build<R>(
    resultSelector: (selected: TSelected, ...args: TKey) => R
  ): TFamily extends any[]
    ? FamilySelector<TFamily, TParam, R>
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
  <TParam>(): SelectorBuilder<TParam>;
};

const defaultKeySelector = (...args: any[]) => args;
const strictEqual = (a: any, b: any) => a === b;

const memosel: Memosel = (): SelectorBuilder => {
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
          if (resultCache.length > size) resultCache.pop();
        }

        if (!entry.selected || entry.expiry < now) {
          entry.expiry = ttl ? now + ttl : Number.MAX_VALUE;
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

  return {
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
    family(selector?: Function): any {
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
};

export default memosel;
