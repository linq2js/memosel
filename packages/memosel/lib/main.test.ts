import memosel from "./main";
import { test, expect } from "vitest";

test("factory", () => {
  type Todo = { id: number; completed: boolean };
  type TodoList = { filter: "all" | "completed" | "active"; todos: Todo[] };
  type State = {
    todoLists: Record<number, TodoList>;
  };
  type Props = { listId: number };
  const todos = [
    { id: 1, completed: false },
    { id: 2, completed: true },
    { id: 3, completed: true },
  ];

  let runCount = 0;
  const state: State = {
    todoLists: {
      1: { filter: "all", todos },
      2: { filter: "completed", todos },
      3: { filter: "active", todos },
    },
  };

  const getFilter = (state: State, listId: number) =>
    state.todoLists[listId].filter;

  const filterTodos = ({ filter, todos }: TodoList) =>
    filter === "all"
      ? todos
      : filter === "completed"
      ? todos.filter((x) => x.completed)
      : todos.filter((x) => !x.completed);

  const getTodos = (state: State, listId: number) =>
    state.todoLists[listId].todos;

  const getVisibleTodos = memosel()
    .key((props: Props) => [props.listId])
    .use("filter", getFilter)
    .use("todos", getTodos)
    .build((selected) => {
      runCount++;
      return filterTodos(selected);
    });

  expect(getVisibleTodos({ listId: 1 })(state)).toEqual(
    filterTodos({ filter: "all", todos })
  );
  expect(getVisibleTodos({ listId: 1 })(state)).toEqual(
    filterTodos({ filter: "all", todos })
  );

  expect(runCount).toBe(1);

  expect(getVisibleTodos({ listId: 2 })(state)).toEqual(
    filterTodos({ filter: "completed", todos })
  );
  expect(getVisibleTodos({ listId: 2 })(state)).toEqual(
    filterTodos({ filter: "completed", todos })
  );

  expect(runCount).toBe(2);

  expect(getVisibleTodos({ listId: 3 })(state)).toEqual(
    filterTodos({ filter: "active", todos })
  );
  expect(getVisibleTodos({ listId: 3 })(state)).toEqual(
    filterTodos({ filter: "active", todos })
  );

  expect(runCount).toBe(3);
});

test("structured", () => {
  const selector = memosel()
    .use("a", () => 1)
    .use("b", () => 2)
    .build();
  expect(selector({})).toEqual({ a: 1, b: 2 });
});

test("basic", () => {
  const selector = memosel()
    .use("value", (input: number) => input)
    .build(({ value }) => ({ result: value * 2 }));
  const r1 = selector(1);
  const r2 = selector(1);
  expect(r1).toEqual({ result: 2 });
  expect(r1).toBe(r2);
});

test("cace size", () => {
  const selector = memosel()
    .size(3)
    .use("value", (input: number) => input)
    .build(({ value }) => ({ result: value * 2 }));
  const r1 = selector(1);
  const r2 = selector(2);
  const r3 = selector(3);
  const r11 = selector(1);
  const r22 = selector(2);
  const r33 = selector(3);
  expect(r1).toBe(r11);
  expect(r2).toBe(r22);
  expect(r3).toBe(r33);
});
