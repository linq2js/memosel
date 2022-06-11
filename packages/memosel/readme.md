- [`memosel`](#memosel)
  - [Installation](#installation)
  - [Features](#features)
  - [Recipes](#recipes)
    - [Basic Usage](#basic-usage)
    - [Join similar selectors](#join-similar-selectors)
    - [Avoid selector factories](#avoid-selector-factories)
    - [Creating simple memoized function](#creating-simple-memoized-function)
  - [API references](#api-references)

# `memosel`

A library for creating memoized "selector" functions

## Installation

with NPM

```bash
npm i rtkex --save
```

with YARN

```bash
yarn add rtkex
```

## Features

- Fully Typescript supported
- Multiple keys caching
- Time To Live caching supported
- Structured selector supported

## Recipes

### Basic Usage

```js
import memosel from "memosel";

const selectShopItems = (state) => state.shop.items;
const selectTaxPercent = (state) => state.shop.taxPercent;

const selectSubtotal = memosel()
  // use "input" selector and map it return value to "items" prop of selected value
  .use("items", selectShopItems)
  .build((selected) =>
    selected.items.reduce((subtotal, item) => subtotal + item.value, 0)
  );

const selectTax = memosel()
  .use("subtotal", selectSubtotal)
  .use("taxPercent", selectTaxPercent)
  .build((selected) => selected.subtotal * (selected.taxPercent / 100));

const selectTotal = memosel()
  .use("subttoal", selectSubtotal)
  .use("tax", selectTax)
  .build((selected) => ({ total: selected.subtotal + seleted.tax }));

const exampleState = {
  shop: {
    taxPercent: 8,
    items: [
      { name: "apple", value: 1.2 },
      { name: "orange", value: 0.95 },
    ],
  },
};

console.log(selectSubtotal(exampleState)); // 2.15
console.log(selectTax(exampleState)); // 0.172
console.log(selectTotal(exampleState)); // { total: 2.322 }
```

### Join similar selectors

With reselect

```js
import { createSelector } from reselect;

const getWorldData = state => state.world;

/*
 * Solution 1: one selector for each country
 * Problem: 195 selectors to maintain
 */
const getAfghanistanData = createSelector(
  getWorldData,
  world => extractData(world, 'afghanistan'),
);
// Albania, Algeria, Amer...
const getZimbabweData = createSelector(
  getWorldData,
  world => extractData(world, 'zimbawe'),
);

/*
 * Solution 2: one selector shared by all countries
 * Problem: each call to a different country invalidates
 * the cache of the previous one
 */
const getCountryData = createSelector(
  getWorldData,
  (state, country) => country,
  (world, country) => extractData(world, country),
);

const afghanistan = getCountryData(state, 'afghanistan');
const zimbabwe = getCountryData(state, 'zimbawe');  // Cache invalidated
const afghanistanAgain = getCountryData(state, 'afghanistan');

// afghanistan !== afghanistanAgain

/*
 * Solution 3: use a factory function
 * Problem:
 * - Lost memoization across multiple components
 * - Must call the factory once for each country on each container component
 */
const makeGetCountryData = country => {
  return createSelector(
    getWorldData,
    world => extractData(world, country),
  );
}
```

With re-reselect

```js
import { createCachedSelector } from "re-reselect";

const getWorldData = (state) => state.world;

const getCountryData = createCachedSelector(
  getWorldData,
  (state, country) => country,
  (world, country) => extractData(world, country)
)(
  (state, country) => country // Cache selectors by country name
);

const afghanistan = getCountryData(state, "afghanistan");
const zimbabwe = getCountryData(state, "zimbawe");
const afghanistanAgain = getCountryData(state, "afghanistan");

// No selector factories and memoization is preserved among different components
// afghanistan === afghanistanAgain
```

With memosel

```js
import memosel from "memosel";

const getWorldData = (state) => state.world;
const getCountryData = memosel()
  // create selector factory that use keySelector, the keySelector accepts "country" argument and we use country as the key of selector cache
  // keySelector can accept multiple arguments and the key array can contains multiple items
  .key((country) => [country])
  .use("world", getWorldData)
  // the second and more arguments are the selected keys (they are returned from keySelector of keys())
  .build(({ world }, country) => extractData(world, country));

const afghanistan = getCountryData("vietnam")(state);
const zimbabwe = getCountryData("zimbawe")(state);
const vietnamAgain = getCountryData("vietnam")(state);
// both of vietnam selectors are identical
console.log(getCountryData("vietnam") === getCountryData("vietnam"));
```

### Avoid selector factories

This example shows how re-reselect would solve the scenario described in the [Reselect docs](https://github.com/reduxjs/reselect#sharing-selectors-with-props-across-multiple-component-instances):
how to share a selector across multiple components while passing in props and retaining memoization?

With re-reselect

```js
import { createCachedSelector } from "re-reselect";

const getVisibilityFilter = (state, props) =>
  state.todoLists[props.listId].visibilityFilter;

const getTodos = (state, props) => state.todoLists[props.listId].todos;

const getVisibleTodos = createCachedSelector(
  [getVisibilityFilter, getTodos],
  (visibilityFilter, todos) => {
    switch (visibilityFilter) {
      case "SHOW_COMPLETED":
        return todos.filter((todo) => todo.completed);
      case "SHOW_ACTIVE":
        return todos.filter((todo) => !todo.completed);
      default:
        return todos;
    }
  }
)(
  /*
   * Re-reselect resolver function.
   * Cache/call a new selector for each different "listId"
   */
  (state, props) => props.listId
);

export default getVisibleTodos;
```

With memosel

```js
import memosel from "memosel";

const getVisibilityFilter = (state, listId) =>
  state.todoLists[listId].visibilityFilter;

const getTodos = (state, listId) => state.todoLists[listId].todos;

const getVisibleTodos = memosel()
  // extract listId and use it as selector key
  .key((props) => [props.listId])
  .use("visibilityFilter", getVisibilityFilter)
  .use("todos", getTodos)
  .build(({ visibilityFilter, todos }) => {
    switch (visibilityFilter) {
      case "SHOW_COMPLETED":
        return todos.filter((todo) => todo.completed);
      case "SHOW_ACTIVE":
        return todos.filter((todo) => !todo.completed);
      default:
        return todos;
    }
  });

// usages
const mapStateToProps = (state, props) => {
  return {
    todos: getVisibleTodos(props)(state),
  };
};
```

### Creating simple memoized function

```js
import memosel from "memosel";

const memoizedFunction1 = memosel((x) => ({ result: x * 2 }));
const result1 = memoizedFunction1(1);
const result2 = memoizedFunction1(1);
console.log(result1 === result2); // true

memoizedFunction1(2);
const result3 = memoizedFunction1(1);
console.log(result1 === result3); // false, because memoized function has cache size = 1 by default

// create memoized function with unlimited cache size
const memoizedFunction2 = memosel((x) => ({ result: x * 2 }), { size: 0 });
const result1 = memoizedFunction2(1);
const result2 = memoizedFunction2(2);
const result3 = memoizedFunction2(3);

const result11 = memoizedFunction2(1);
const result22 = memoizedFunction2(2);
const result33 = memoizedFunction2(3);
console.log(result1 === result11); // true
console.log(result2 === result22); // true
console.log(result3 === result33); // true
```

## API references

https://linq2js.github.io/memosel/
