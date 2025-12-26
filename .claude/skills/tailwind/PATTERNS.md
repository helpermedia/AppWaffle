# Tailwind CSS v4 Patterns & Migration Guide

## Migration from v3 to v4

### Pattern 1: Configuration File to CSS

```js
// v3: tailwind.config.js (DELETE THIS)
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: '#3b82f6',
        surface: '#f8fafc',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
      },
    },
  },
};
```

```css
/* v4: index.css */
@import "tailwindcss";

@theme {
  --color-brand: #3b82f6;
  --color-surface: #f8fafc;
  --font-sans: "Inter", sans-serif;
  --spacing-18: 4.5rem;
}
```

### Pattern 2: Directives to Import

```css
/* v3 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* v4 */
@import "tailwindcss";
```

### Pattern 3: PostCSS to Vite Plugin

```js
// v3: postcss.config.js (can be removed)
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

```ts
// v4: vite.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
});
```

### Pattern 4: Plugin Configuration

```js
// v3: tailwind.config.js with plugins
module.exports = {
  plugins: [require('@tailwindcss/typography')],
};
```

```css
/* v4: CSS import */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

---

## The `cn()` Utility

### Setup

```ts
// src/utils/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Basic Usage

```tsx
import { cn } from "../utils/cn";

// Simple conditional
<div className={cn("p-4", isActive && "bg-blue-500")} />

// Multiple conditions
<div className={cn(
  "rounded-lg border",
  isError && "border-red-500",
  isSuccess && "border-green-500",
  !isError && !isSuccess && "border-gray-200"
)} />

// With objects (clsx syntax)
<div className={cn("p-4", {
  "bg-blue-500": isActive,
  "opacity-50": isDisabled,
})} />

// With arrays
<div className={cn(["p-4", "rounded"], isLarge && "text-lg")} />
```

### Component with className Prop

```tsx
interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}

const variants = {
  primary: "bg-blue-500 text-white hover:bg-blue-600",
  secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300",
  ghost: "bg-transparent hover:bg-gray-100",
};

const sizes = {
  sm: "px-2 py-1 text-sm",
  md: "px-4 py-2",
  lg: "px-6 py-3 text-lg",
};

function Button({
  variant = "primary",
  size = "md",
  className,
  children,
}: ButtonProps) {
  return (
    <button
      className={cn(
        // Base styles
        "rounded-lg font-medium transition-colors",
        // Variant styles
        variants[variant],
        // Size styles
        sizes[size],
        // Allow overrides via className prop
        className
      )}
    >
      {children}
    </button>
  );
}

// Usage: className prop can override any default
<Button className="bg-purple-500 hover:bg-purple-600">Custom</Button>
```

### Conflict Resolution

tailwind-merge intelligently resolves conflicting classes:

```tsx
// Padding conflicts: last wins
cn("px-4 py-2", "p-6")
// → "p-6"

// Color conflicts: last wins
cn("text-red-500", "text-blue-500")
// → "text-blue-500"

// Specific beats general
cn("p-4", "px-2")
// → "p-4 px-2" (px-2 overrides only horizontal)

// Responsive variants respected
cn("p-4", "md:p-6", "p-2")
// → "md:p-6 p-2" (base p-2, but md:p-6 preserved)
```

---

## Common Component Patterns

### Card Component

```tsx
function Card({ children, className = "" }) {
  return (
    <div
      className={`
        rounded-xl p-6
        bg-white dark:bg-gray-800
        shadow-sm hover:shadow-md
        border border-gray-200 dark:border-gray-700
        transition-shadow duration-200
        ${className}
      `}
    >
      {children}
    </div>
  );
}
```

### Button Variants

```tsx
const buttonVariants = {
  primary: "bg-blue-500 text-white hover:bg-blue-600",
  secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white",
  ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
  danger: "bg-red-500 text-white hover:bg-red-600",
};

function Button({ variant = "primary", children, ...props }) {
  return (
    <button
      className={`
        px-4 py-2 rounded-lg font-medium
        transition-colors duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${buttonVariants[variant]}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
```

### Input Field

```tsx
function Input({ label, error, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        className={`
          px-3 py-2 rounded-lg
          bg-white dark:bg-gray-800
          border transition-colors duration-150
          ${error
            ? "border-red-500 focus:ring-red-500"
            : "border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500"
          }
          focus:outline-none focus:ring-2 focus:ring-offset-0
          placeholder:text-gray-400
        `}
        {...props}
      />
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>
  );
}
```

### Modal/Dialog

```tsx
function Modal({ open, onClose, children }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Content */}
      <div
        className="
          relative z-10
          w-full max-w-lg mx-4
          bg-white dark:bg-gray-800
          rounded-2xl shadow-2xl
          animate-scale-in
        "
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

---

## Layout Patterns

### Flex Center

```tsx
{/* Center both axes */}
<div className="flex items-center justify-center">

{/* Center vertically, space between horizontally */}
<div className="flex items-center justify-between">

{/* Stack with gap */}
<div className="flex flex-col gap-4">
```

### Grid Layouts

```tsx
{/* Auto-fit responsive grid */}
<div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-6">

{/* Fixed columns responsive */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

{/* Sidebar layout */}
<div className="grid grid-cols-[250px_1fr] gap-6">
```

### Container Query Layout

```tsx
function ProductCard() {
  return (
    <article className="@container">
      <div className="
        flex flex-col @sm:flex-row
        gap-4 @md:gap-6
        p-4 @lg:p-6
      ">
        <img className="w-full @sm:w-32 @md:w-48 rounded-lg" />
        <div className="flex-1">
          <h3 className="text-lg @md:text-xl font-semibold">Product</h3>
          <p className="hidden @sm:block text-gray-600">Description...</p>
        </div>
      </div>
    </article>
  );
}
```

---

## Animation Patterns

### Fade In

```css
@theme {
  --animate-fade-in: fade-in 0.2s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

```tsx
<div className="animate-fade-in">Fades in</div>
```

### Slide Up

```css
@theme {
  --animate-slide-up: slide-up 0.3s ease-out;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Scale In (Modal/Popover)

```css
@theme {
  --animate-scale-in: scale-in 0.2s ease-out;
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Staggered Children

```tsx
{/* Use animation-delay with inline styles */}
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-fade-in"
    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
  >
    {item.name}
  </div>
))}
```

---

## Dark Mode Patterns

### Component with Dark Variants

```tsx
<div className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-gray-100
  border-gray-200 dark:border-gray-700
">
```

### Semantic Dark Mode Colors

```css
@theme {
  /* Light mode values */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f9fafb;
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-border: #e5e7eb;
}

/* Dark mode overrides using @media */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: #111827;
    --color-bg-secondary: #1f2937;
    --color-text-primary: #f9fafb;
    --color-text-secondary: #9ca3af;
    --color-border: #374151;
  }
}
```

### Forced Dark Mode

```tsx
{/* Force dark mode on specific element */}
<div className="dark">
  <div className="bg-gray-900 text-white">Always dark</div>
</div>
```

---

## Responsive Patterns

### Mobile-First Navigation

```tsx
function Nav() {
  return (
    <nav className="
      fixed bottom-0 left-0 right-0
      md:static md:top-0
      flex md:flex-row
      bg-white dark:bg-gray-800
      border-t md:border-t-0 md:border-b
      border-gray-200 dark:border-gray-700
    ">
      {/* Nav items */}
    </nav>
  );
}
```

### Responsive Typography

```tsx
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
  Responsive Heading
</h1>

<p className="text-sm md:text-base lg:text-lg">
  Responsive body text
</p>
```

### Hide/Show by Breakpoint

```tsx
{/* Show only on mobile */}
<div className="block md:hidden">Mobile only</div>

{/* Show only on desktop */}
<div className="hidden md:block">Desktop only</div>

{/* Different content by breakpoint */}
<span className="md:hidden">Menu</span>
<span className="hidden md:inline">Navigation</span>
```

---

## Transition Patterns

### Hover Transitions

```tsx
<button className="
  bg-blue-500 hover:bg-blue-600
  transform hover:scale-105 hover:-translate-y-0.5
  transition-all duration-200
">
  Hover me
</button>
```

### Focus States

```tsx
<input className="
  border-gray-300
  focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
  transition-colors duration-150
  outline-none
" />
```

### Active/Pressed States

```tsx
<button className="
  bg-blue-500
  hover:bg-blue-600
  active:bg-blue-700 active:scale-95
  transition-all duration-150
">
  Click me
</button>
```

---

## Anti-Patterns to Avoid

### Don't: Redundant Utilities

```tsx
// Redundant - flex defaults to row
<div className="flex flex-row">

// Redundant - items-stretch is default
<div className="flex items-stretch">

// Just use
<div className="flex">
```

### Don't: Over-specify Dark Mode

```tsx
// Unnecessary - gray-900 text on white is readable in both modes
<div className="text-gray-900 dark:text-gray-900">

// Only specify dark: when the value actually changes
<div className="text-gray-900 dark:text-gray-100">
```

### Don't: Inline Styles for Theme Values

```tsx
// Avoid
<div style={{ backgroundColor: '#3b82f6' }}>

// Use Tailwind utilities or CSS variables
<div className="bg-blue-500">
<div className="bg-[--color-brand]">
```

### Don't: Complex @apply Chains

```css
/* Avoid: Hard to read, defeats utility purpose */
.card {
  @apply flex flex-col items-center justify-center p-4 m-2 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-gray-700;
}

/* Better: Use utilities in JSX, or minimal @apply */
.card {
  @apply rounded-lg shadow-md transition-shadow;
}
```

---

## Performance Tips

### 1. Avoid Dynamic Class Generation

```tsx
// Avoid: Classes won't be detected by Tailwind
<div className={`text-${color}-500`}>

// Good: Use complete class names
const colorClasses = {
  red: "text-red-500",
  blue: "text-blue-500",
};
<div className={colorClasses[color]}>
```

### 2. Use CSS Variables for Dynamic Values

```tsx
// For truly dynamic values, use CSS variables
<div
  className="bg-[--dynamic-color]"
  style={{ "--dynamic-color": computedColor }}
>
```

### 3. Prefer Built-in Utilities

```tsx
// Avoid arbitrary values when utilities exist
<div className="w-[100%]">  {/* Use w-full */}
<div className="p-[16px]">  {/* Use p-4 */}
<div className="mt-[0]">    {/* Use mt-0 */}
```
