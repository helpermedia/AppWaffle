---
name: react
description: React 19 best practices, patterns, and guidance. Use when writing components, hooks, managing state, handling async operations, or reviewing React code.
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

### 1. Automatic Memoization (React Compiler)

The React Compiler handles memoization automatically.

**Do:**
- Trust the compiler to optimize renders
- Only add manual memoization after profiling shows a need

**Don't:**
- Wrap everything in `React.memo`
- Add `useMemo`/`useCallback` by default

```tsx
// Before (React 18 habit)
const MemoizedComponent = React.memo(({ data }) => <div>{data}</div>);
const memoizedValue = useMemo(() => compute(data), [data]);
const memoizedFn = useCallback(() => doSomething(), []);

// After (React 19) — just write it simply
function Component({ data }) {
  const value = compute(data);
  const handleClick = () => doSomething();
  return <div onClick={handleClick}>{value}</div>;
}
```

### 2. Think Hard Before Using `useEffect`

Every `useEffect` should be questioned. Most uses are unnecessary in React 19.

**Before adding `useEffect`, ask:**
1. Is this data fetching? → Use `use()` + Suspense instead
2. Is this derived from props/state? → Compute during render instead
3. Is this responding to user action? → Handle in event handler instead
4. Is this synchronizing with external system? → This is a valid use case

**Valid `useEffect` uses:**
- Event listeners (window, document, external elements)
- Subscriptions (WebSocket, external stores)
- Manual DOM manipulation (focus, scroll, measure)
- Third-party library integration
- Cleanup on unmount

**Invalid `useEffect` uses (anti-patterns):**
- Data fetching → `use()` + Suspense
- Transforming data → compute in render
- Resetting state on prop change → use `key` prop
- Notifying parent of state change → call in event handler
- "Initializing" something once → module-level or ref

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

Unlike `useContext`, works with conditionals and loops.

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

For non-blocking async updates:

```tsx
import { useTransition } from 'react';

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
  'use server';  // For Server Actions
  await db.posts.create({ title: formData.get('title') });
}

<form action={createPost}>
  <input name="title" />
  <button type="submit">Create</button>
</form>
```

---

## Data Fetching

### Don't Use `useEffect` for Data Fetching

`useEffect` for data fetching is a React 18 anti-pattern. It causes:
- Waterfalls (fetch after render)
- Race conditions
- No Suspense integration
- Boilerplate for loading/error states

### Use `use()` + Suspense Instead

```tsx
// ❌ Don't: useEffect for fetching
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchUser(userId).then(setUser).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Spinner />;
  return <div>{user.name}</div>;
}

// ✅ Do: use() with Suspense
function UserProfile({ userPromise }) {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

// Wrap in Suspense
<Suspense fallback={<Spinner />}>
  <UserProfile userPromise={fetchUser(userId)} />
</Suspense>
```

### Start Fetching Early (Module-Level)

For data needed at app startup, start fetching immediately:

```tsx
// api.ts — fetch starts when module is imported
let dataPromise: Promise<Data> | null = null;

export function getDataPromise(): Promise<Data> {
  if (!dataPromise) {
    dataPromise = fetch('/api/data').then(r => r.json());
  }
  return dataPromise;
}

// Start immediately
getDataPromise();

// Component.tsx
function Component() {
  const data = use(getDataPromise());
  return <div>{data.value}</div>;
}
```

This pattern ensures:
- Fetching runs parallel with other initialization
- No wasted renders waiting for data
- Clean separation of data fetching from UI

---

## Simplified Patterns

### Refs as Props (No `forwardRef`)

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
| Async data | `use()` + Suspense |
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

## Code Review Checklist

When reviewing React code:

- [ ] No unnecessary `React.memo`, `useMemo`, `useCallback`
- [ ] Every `useEffect` is justified (not for fetching, derived state, or event responses)
- [ ] No `useEffect` for data fetching — use `use()` + Suspense
- [ ] Using appropriate new hooks where beneficial
- [ ] Actions used for async mutations
- [ ] State kept local where possible
- [ ] Refs passed as props (no `forwardRef`)
- [ ] Context used only for truly global state
- [ ] Suspense boundaries for async loading
- [ ] `startTransition` for non-urgent updates
