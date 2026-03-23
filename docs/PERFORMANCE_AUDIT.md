# MCF Frontend — Performance Audit

> **Snapshot only** — bundle sizes and findings reflect the audit date below; re-run analysis after major dependency or route changes.

**Date:** March 2025  
**Build:** Next.js 14.2.35

---

## 1. Bundle Analysis

### Current Bundle Sizes (First Load JS)

| Route | Page Size | First Load JS |
|-------|-----------|---------------|
| `/` | 2.89 kB | 197 kB |
| `/dashboard` | 6.48 kB | 191 kB |
| `/how-it-works` | 1.12 kB | 149 kB |
| Shared chunks | — | 87.7 kB |

### Findings

| Issue | Severity | Location |
|-------|----------|----------|
| **Duplicate toast libraries** | High | `sonner` (providers) + `react-hot-toast` (dashboard) — both in bundle |
| **Unused framer-motion** | Medium | `package.json` line 20 — never imported |
| **Heavy recharts** | Low | Lazy-loaded via `LazyDashboardCharts` ✓ |
| **Lazy tabs with no fallback** | Low | `page.tsx` lines 18–26 — `loading: () => null` |

---

## 2. Re-render Triggers

### Inline Functions (new reference every render)

| File | Line | Pattern | Fix |
|------|------|---------|-----|
| `frontend/app/page.tsx` | 179 | `onUploadClick={() => fileInputRef.current?.click?.()}` | `useCallback` |
| `frontend/app/page.tsx` | 227 | `onClick={() => setTab(id)}` | Extract handler or use `useCallback` with `id` in deps |
| `frontend/app/components/ResumeTab.tsx` | 341 | `onInteraction={(uuid, type) => rate(uuid, type as ...)}` | Wrap `rate` in `useCallback` |
| `frontend/app/components/ResumeTab.tsx` | 348 | `onClick={() => loadJobs(true)}` | `useCallback` |
| `frontend/app/components/TasteTab.tsx` | 228 | `onInteraction={handleInteraction}` | Wrap `handleInteraction` in `useCallback` |
| `frontend/app/dashboard/page.tsx` | 229 | `onClick={() => setLimitDays(value)}` | Inline in map — consider extracting |
| `frontend/app/dashboard/DashboardCharts.tsx` | 178, 193, 224 | `onClick={() => onCategorySelect(...)}` | Pass stable callback |
| `frontend/app/components/layout/Layout.tsx` | 31 | `onToggle={() => setMobileMenuOpen((o) => !o)}` | `useCallback` |

### Missing Memoization

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `frontend/app/components/JobCard.tsx` | 51 | `MatchCard` re-renders with parent | Wrap in `React.memo` |
| `frontend/app/components/ResumeTab.tsx` | 106 | `rate` not memoized | `useCallback(rate, [loadJobs, loadStats])` |
| `frontend/app/components/TasteTab.tsx` | 85 | `handleInteraction` not memoized | `useCallback` |
| `frontend/app/dashboard/page.tsx` | 152–157 | `employmentData`, `positionData`, `salaryData` recomputed every render | `useMemo` |
| `frontend/app/dashboard/DashboardCharts.tsx` | 106, 208, 299 | `margin={{ top: 8, right: 8, ... }}` — new object each render | Define `CHART_MARGIN` constant |

---

## 3. Images

- **No images** in app components — no `next/image` or `<img>` usage.
- **Recommendation:** When adding images (logos, avatars, etc.), use `next/image` with `priority` for above-fold assets and `loading="lazy"` for below-fold.

---

## 4. Async / Loading States

### Current Implementation ✓

| Location | Implementation |
|----------|----------------|
| `ResumeTab.tsx` 282–284 | `LoadingState variant="matches" count={5}` |
| `TasteTab.tsx` 229 | Same |
| `dashboard/page.tsx` 243–244 | `LoadingState variant="dashboard"` |
| `DashboardCharts.tsx` 247–250, 287–288 | Category detail skeletons |
| `AuthDashboardPreview.tsx` 44–53 | Skeleton when loading |

### Gaps

| Issue | Location | Fix |
|-------|----------|-----|
| Lazy tabs show blank | `page.tsx` 18–21, 23–26 | Add `loading: () => <LoadingState variant="matches" count={3} />` |
| Profile load blocks header | `page.tsx` 49 | Return skeleton instead of `null` for `MatchesHeaderActions` |

---

## 5. Expensive Operations

### No Debouncing

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `ResumeTab.tsx` | 254 | Range slider `minSimilarity` — updates state on every change; `loadJobs` runs via `useEffect` on filter change | Debounce filter updates (300ms) before `loadJobs` |
| `ResumeTab.tsx` | 267 | Number input `maxDaysOld` — same | Debounce or use "Apply" button |
| `TasteTab.tsx` | 154, 167, 182 | Filter inputs — `findMatches` only on button click ✓ | No change needed |

### Debounce Implementation

```tsx
// ResumeTab.tsx — add debounced filters
const [localFilters, setLocalFilters] = useState(filters)
const debouncedFilters = useDebouncedValue(localFilters, 300)
useEffect(() => {
  setFilters(debouncedFilters)
}, [debouncedFilters])
// Use localFilters for controlled inputs, debouncedFilters for loadJobs
```

---

## 6. Code Splitting & Lazy Loading

### Current ✓

| Component | Lazy? | Fallback |
|-----------|-------|----------|
| ResumeTab | Yes | None |
| TasteTab | Yes | None |
| DashboardCharts | Yes | Custom skeleton |
| AuthDashboardPreview | Yes | Custom skeleton |

### Recommendations

1. **Unify toast library** — Remove `react-hot-toast`, use `sonner` everywhere.
2. **Remove framer-motion** — `npm uninstall framer-motion` if not used.
3. **Add loading fallbacks** for `LazyResumeTab` and `LazyTasteTab`.

---

## 7. Suggested Fixes (Prioritized)

### High Priority

1. **Consolidate toast libraries**  
   - **File:** `frontend/app/dashboard/page.tsx` line 19  
   - **Change:** `import toast from 'react-hot-toast'` → `import { toast } from 'sonner'`  
   - **File:** `frontend/package.json`  
   - **Change:** Remove `react-hot-toast` dependency

2. **Remove unused framer-motion**  
   - **File:** `frontend/package.json` line 20  
   - **Change:** Remove `"framer-motion": "^12.36.0"`

### Medium Priority

3. **Memoize MatchCard**  
   - **File:** `frontend/app/components/JobCard.tsx` line 51  
   - **Change:** `export const MatchCard = React.memo(function MatchCard(...) { ... })`

4. **Wrap rate in useCallback (ResumeTab)**  
   - **File:** `frontend/app/components/ResumeTab.tsx` lines 106–134  
   - **Change:** Wrap `rate` in `useCallback` with `[loadJobs, loadStats]` deps

5. **Wrap handleInteraction in useCallback (TasteTab)**  
   - **File:** `frontend/app/components/TasteTab.tsx` lines 85–105  
   - **Change:** Wrap in `useCallback` with `[loadStats]` deps

6. **Debounce filter inputs (ResumeTab)**  
   - **File:** `frontend/app/components/ResumeTab.tsx` lines 33, 254, 267  
   - **Change:** Add `useDebouncedValue` hook; debounce `minSimilarity` and `maxDaysOld` before triggering `loadJobs`

### Low Priority

7. **Memoize dashboard derived data**  
   - **File:** `frontend/app/dashboard/page.tsx` lines 152–157  
   - **Change:** `const employmentData = useMemo(() => ..., [selectedCategory, categoryStats, jobsByEmploymentType])`

8. **Chart margin constants**  
   - **File:** `frontend/app/dashboard/DashboardCharts.tsx`  
   - **Change:** `const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 }` at top of file

9. **Lazy tab loading fallbacks**  
   - **File:** `frontend/app/page.tsx` lines 18–26  
   - **Change:** `loading: () => <LoadingState variant="matches" count={3} />`

10. **onUploadClick useCallback**  
    - **File:** `frontend/app/page.tsx` line 179  
    - **Change:** `const onUploadClick = useCallback(() => fileInputRef.current?.click?.(), [])`

---

## 8. Checklist Summary

| Category | Status |
|----------|--------|
| Blocking renders on initial load | Skeleton states present; profile load returns null |
| Skeleton/loading for async content | ✓ Present in ResumeTab, TasteTab, Dashboard |
| Debouncing for expensive ops | ✗ ResumeTab filters need debounce |
| Code splitting | ✓ Lazy tabs, lazy charts |
| Duplicate dependencies | ✗ Two toast libs, unused framer-motion |
| Memoization | ✗ MatchCard, rate, handleInteraction, dashboard data |
| Image optimization | N/A — no images |
