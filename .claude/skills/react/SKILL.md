---
name: react
description: React 19 best practices, hooks, state management and data fetching. Use when writing components, hooks, managing state, handling async operations or reviewing React code.
---

# React 19 Best Practices

## When to Apply

Use this skill when:
- Writing or refactoring React components
- Creating custom hooks
- Implementing async operations or form handling
- Reviewing React code for optimization
- Deciding between hooks or patterns

---

## Core Principles

### 1. Don't Over-Memoize

Premature memoization adds complexity without measurable benefit.

**Do:**
- Write simple, readable code first
- Only add memoization after profiling shows a real performance issue
- Trust React's rendering — it's already fast

**Don't:**
- Wrap everything in `React.memo`
- Add `useMemo`/`useCallback` by default
- Optimize before measuring

```tsx
// ❌ Premature optimization
const MemoizedComponent = React.memo(({ data }) => <div>{data}</div>);
const memoizedValue = useMemo(() => compute(data), [data]);
const memoizedFn = useCallback(() => doSomething(), []);

// ✅ Simple and readable — optimize only if profiling shows need
function Component({ data }) {
  const value = compute(data);
  const handleClick = () => doSomething();
  return <div onClick={handleClick}>{value}</div>;
}
```

> **Note:** The React Compiler (experimental, opt-in) can automate memoization, but it's not enabled by default in React 19. This project does not use it. The principle still stands: write simple code first.

### 2. Don't Misuse `useEffect`

Most `useEffect` usage is unnecessary and indicates a design problem.

**Before adding `useEffect`, ask:**
1. Is this derived from props/state? → Compute during render
2. Is this responding to user action? → Handle in event handler
3. Is this data fetching? → Use SWR or similar
4. Is this synchronizing with external system? → Valid use case

**Valid `useEffect` uses:**
- Event listeners (window, document, external elements)
- Subscriptions (WebSocket, external stores)
- Manual DOM manipulation (focus, scroll, measure)
- Third-party library integration
- Cleanup on unmount

**Invalid `useEffect` uses (anti-patterns):**
- Transforming data → compute in render
- Resetting state on prop change → use `key` prop
- Notifying parent of state change → call in event handler
- "Initializing" something once → module-level or ref
- Data fetching → SWR (see Data Fetching section)

```tsx
// ❌ Don't: Derived state in useEffect
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ✅ Do: Compute during render
const fullName = `${firstName} ${lastName}`;

// ❌ Don't: Reset state on prop change
useEffect(() => {
  setSelection(null);
}, [items]);

// ✅ Do: Use key to reset component
<ItemList items={items} key={listId} />

// ✅ Valid: External event listener
useEffect(() => {
  const handleKeyDown = (e) => { /* ... */ };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## New Hooks

### `use()` — Read Promises/Context in Render

Unlike other hooks, works with conditionals and loops.

```tsx
import { use } from 'react';

function Comments({ commentsPromise }) {
  // Can be inside conditions!
  if (!commentsPromise) return null;

  const comments = use(commentsPromise);
  return comments.map(c => <p key={c.id}>{c.text}</p>);
}

// With Suspense
<Suspense fallback={<Loading />}>
  <Comments commentsPromise={fetchComments()} />
</Suspense>
```

> **Note:** `use()` with Suspense works best when a framework manages the promise lifecycle. For client-side SPAs, see the Data Fetching section for practical patterns.

### `useOptimistic()` — Optimistic UI Updates

Show immediate feedback before server confirms.

```tsx
import { useOptimistic } from 'react';

function TodoList({ todos, addTodo }) {
  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (state, newTodo) => [...state, { ...newTodo, pending: true }]
  );

  async function handleAdd(formData) {
    const newTodo = { id: Date.now(), text: formData.get('text') };
    addOptimistic(newTodo);      // Instant UI update
    await addTodo(newTodo);       // Server request
  }

  return (
    <form action={handleAdd}>
      <input name="text" />
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id} style={{ opacity: todo.pending ? 0.5 : 1 }}>
            {todo.text}
          </li>
        ))}
      </ul>
    </form>
  );
}
```

### `useActionState()` — Track Async Action Status

Replaces manual `isPending`, `error`, `data` state.

```tsx
import { useActionState } from 'react';

function SaveButton() {
  const [error, submitAction, isPending] = useActionState(
    async (previousState, formData) => {
      const result = await saveData(formData);
      if (result.error) return result.error;
      return null;
    },
    null
  );

  return (
    <form action={submitAction}>
      <input name="title" />
      <button disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </form>
  );
}
```

### `useFormStatus()` — Read Parent Form Status

No prop drilling needed for submit button state.

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, method } = useFormStatus();
  return (
    <button disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  );
}

// Use in any form — no props needed
<form action={serverAction}>
  <input name="email" />
  <SubmitButton />
</form>
```

---

## Actions Pattern

### With `useTransition`

For non-blocking async updates. React 19 supports async functions in `startTransition`:

```tsx
import { useState, useTransition } from 'react';

function SearchResults() {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSearch(e) {
    const value = e.target.value;
    setQuery(value);  // Urgent: update input immediately

    startTransition(async () => {
      await updateResults(value);  // Non-urgent: can be interrupted
    });
  }

  return (
    <>
      <input onChange={handleSearch} />
      {isPending && <Spinner />}
      <Results query={query} />
    </>
  );
}
```

### Form Actions

Pass async functions directly to forms:

```tsx
async function createPost(formData) {
  'use server';  // For Server Actions (RSC frameworks)
  await db.posts.create({ title: formData.get('title') });
}

<form action={createPost}>
  <input name="title" />
  <button type="submit">Create</button>
</form>
```

---

## Data Fetching

### For Client-Side SPAs: Use SWR

For Tauri/Vite apps without RSC, SWR handles the hard parts:

```tsx
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then(r => r.json());

function UserProfile({ userId }) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/users/${userId}`,
    fetcher
  );

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  return <div>{data.name}</div>;
}
```

**What SWR provides:**
- Automatic caching and deduplication
- Revalidation on focus/reconnect
- Cache invalidation via `mutate()`
- Error retry with exponential backoff
- Request deduplication
- Optimistic updates

### For Tauri Commands

Wrap Tauri's invoke in SWR:

```tsx
import useSWR from 'swr';
import { invoke } from '@tauri-apps/api/core';

function useApps() {
  return useSWR('apps', () => invoke<App[]>('get_applications'));
}

function AppGrid() {
  const { data: apps, isLoading } = useApps();
  // ...
}
```

### When `use()` + Suspense Makes Sense

The `use()` hook with Suspense is ideal when:
- A framework manages promise lifecycle (Next.js, Remix with RSC)
- Data is passed as a promise prop from a parent
- You want streaming/progressive rendering

```tsx
// Parent creates the promise
const dataPromise = fetchData();

// Child consumes with Suspense
<Suspense fallback={<Loading />}>
  <DataDisplay dataPromise={dataPromise} />
</Suspense>

function DataDisplay({ dataPromise }) {
  const data = use(dataPromise);
  return <div>{data.value}</div>;
}
```

### Avoid: Naive Module-Level Singletons

```tsx
// ⚠️ Problematic pattern
let dataPromise = null;

export function getDataPromise() {
  if (!dataPromise) {
    dataPromise = fetch('/api/data').then(r => r.json());
  }
  return dataPromise;  // Cached forever!
}
```

**Problems with this pattern:**
- No cache invalidation — data is stale forever
- No error recovery — failed promise stays failed
- No refetch on param changes
- No AbortController for cleanup

Only use module-level fetches for truly static data (config loaded once at startup).

---

## Simplified Patterns

### Refs as Props (No `forwardRef`)

React 19 allows `ref` as a regular prop:

```tsx
// Before (React 18)
const Input = forwardRef((props, ref) => (
  <input ref={ref} {...props} />
));

// After (React 19) — ref is just a prop
function Input({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}

// Usage
<Input ref={myRef} placeholder="Type here" />
```

### Context as Provider

```tsx
// Before
<ThemeContext.Provider value="dark">
  {children}
</ThemeContext.Provider>

// After (React 19)
<ThemeContext value="dark">
  {children}
</ThemeContext>
```

### Ref Cleanup Functions

```tsx
<div ref={(node) => {
  // Setup
  node.addEventListener('scroll', handleScroll);

  // Cleanup (return a function)
  return () => {
    node.removeEventListener('scroll', handleScroll);
  };
}} />
```

### `useDeferredValue` with Initial Value

```tsx
const deferredQuery = useDeferredValue(query, '');  // '' is initial value
```

---

## Document Metadata

Render anywhere — React 19 hoists to `<head>`:

```tsx
function BlogPost({ post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.summary} />
      <meta name="author" content={post.author} />
      <link rel="canonical" href={post.url} />

      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

---

## Stylesheets & Scripts

### Stylesheet with Precedence

```tsx
<link rel="stylesheet" href="base.css" precedence="default" />
<link rel="stylesheet" href="theme.css" precedence="high" />
```

### Async Scripts (Auto-deduplicated)

```tsx
<script async src="analytics.js" />
```

---

## Resource Preloading

```tsx
import { prefetchDNS, preconnect, preload, preinit } from 'react-dom';

function App() {
  // Preload critical resources
  preinit('https://cdn.example.com/script.js', { as: 'script' });
  preload('https://cdn.example.com/font.woff2', { as: 'font' });
  preconnect('https://api.example.com');
  prefetchDNS('https://images.example.com');

  return <Main />;
}
```

---

## State Management Guidelines

| Situation | Approach |
|-----------|----------|
| Component-specific data | Local `useState` |
| Shared between siblings | Lift to nearest common parent |
| App-wide (theme, auth, locale) | Context |
| Complex state logic | `useReducer` |
| Remote/async data | SWR |
| Optimistic updates | `useOptimistic` |

**Avoid:**
- Lifting state unnecessarily
- Putting frequently-changing data in context
- Global state for component-local concerns

---

## Error Handling

### Error Boundary Options

```tsx
createRoot(document.getElementById('root'), {
  onCaughtError: (error) => {
    // Error caught by Error Boundary
    console.error('Caught:', error);
  },
  onUncaughtError: (error) => {
    // Uncaught error
    console.error('Uncaught:', error);
  },
  onRecoverableError: (error) => {
    // Auto-recovered error
    console.warn('Recovered:', error);
  },
}).render(<App />);
```

---

## Hydration Improvements

React 19 provides:
- **Partial hydration**: Only hydrate necessary parts
- **Better streaming**: Improved handling of streamed HTML
- **Clear error diffs**: Shows exactly what mismatched

```
Uncaught Error: Hydration failed...
<App>
  <span>
  + Client
  - Server
```

---

## Custom Elements (Web Components)

Full support for custom elements:

```tsx
<custom-button label="Click Me" onClick={handleClick} />
```

- SSR: Primitive types → attributes
- CSR: Properties assigned correctly

---

## Code Quality

### Never Use `eslint-disable` Comments

Don't suppress linter warnings with comments like `// eslint-disable-next-line`. Fix the underlying issue instead.

**If you encounter a linter warning:**
1. Understand why the rule exists
2. Refactor the code to satisfy the rule
3. If the rule is fundamentally wrong for the project, disable it in the ESLint config (not inline)

```tsx
// ❌ Don't suppress warnings inline
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { ... }, []);

// ✅ Fix the actual issue or configure ESLint properly
useEffect(() => { ... }, [dependency]);
```

---

## Code Review Checklist

When reviewing React code:

- [ ] No `eslint-disable` comments — fix issues properly
- [ ] No premature `React.memo`, `useMemo`, `useCallback`
- [ ] Every `useEffect` is justified (syncing with external systems only)
- [ ] Data fetching uses SWR (not `useEffect`)
- [ ] Using appropriate React 19 hooks where beneficial
- [ ] Actions used for async mutations
- [ ] State kept local where possible
- [ ] Refs passed as props (no `forwardRef` needed)
- [ ] Context used only for truly global state
- [ ] Suspense boundaries for async loading
- [ ] `startTransition` for non-urgent updates
