# Admin-Editable Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make crash cart checklist items DB-configurable by admins, and add a formulary management UI within the meds page.

**Architecture:** Two independent features. Part 1: new `vt_crash_cart_items` table + 4 API endpoints + admin Sheet on crash-cart page. Part 2: admin Sheet + Dialog on meds page wiring to existing `/api/formulary` CRUD endpoints (no backend changes needed).

**Tech Stack:** Drizzle ORM, Express, React Query, shadcn/ui (Sheet, Dialog, AlertDialog), sonner toasts, Zod, TypeScript.

---

## File Map

**Create:**
- `migrations/075_crash_cart_items.sql` — new table + seed existing 8 items for all clinics
- `src/components/crash-cart-admin-sheet.tsx` — admin CRUD UI for crash cart items (keeps crash-cart.tsx focused)
- `src/components/formulary-admin-sheet.tsx` — admin CRUD UI for drug formulary (keeps meds.tsx focused)

**Modify:**
- `server/db.ts` — add `crashCartItems` table definition + `CrashCartItem` type export
- `server/routes/crash-cart.ts` — add GET/POST/PATCH/DELETE `/api/crash-cart/items` endpoints
- `src/types/index.ts` — add `CrashCartItem` interface
- `src/lib/api.ts` — add `api.crashCartItems` namespace
- `src/pages/crash-cart.tsx` — replace hardcoded `CART_ITEMS` with DB fetch; add admin gear button
- `src/pages/meds.tsx` — add "Manage Formulary" button + import `FormularyAdminSheet`

---

## Task 1: Migration — create vt_crash_cart_items table

**Files:**
- Create: `migrations/075_crash_cart_items.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- migrations/075_crash_cart_items.sql
-- Creates configurable crash cart checklist items per clinic.
-- Seeds the 8 previously hardcoded items for every existing clinic.

CREATE TABLE IF NOT EXISTS vt_crash_cart_items (
  id              TEXT PRIMARY KEY,
  clinic_id       TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  required_qty    INTEGER NOT NULL DEFAULT 1,
  expiry_warn_days INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_crash_cart_item_key UNIQUE (clinic_id, key)
);

CREATE INDEX IF NOT EXISTS idx_vt_crash_cart_items_clinic
  ON vt_crash_cart_items (clinic_id)
  WHERE active = TRUE;

-- Seed the 8 legacy hardcoded items for every existing clinic.
-- ON CONFLICT DO NOTHING makes this idempotent.
INSERT INTO vt_crash_cart_items (id, clinic_id, key, label, required_qty, sort_order, active)
SELECT
  gen_random_uuid()::text,
  c.id,
  item.key,
  item.label,
  1,
  item.ord,
  TRUE
FROM vt_clinics c
CROSS JOIN (VALUES
  ('defibrillator', 'דפיברילטור — טעון ומוכן',      0),
  ('oxygen',        'חמצן — מחובר ופתוח',             1),
  ('iv_line',       'עירוי IV — מוכן (קו פתוח)',      2),
  ('epinephrine',   'אפינפרין — זמין ולא פג תוקף',   3),
  ('atropine',      'אטרופין — זמין ולא פג תוקף',    4),
  ('vasopressin',   'וזופרסין — זמין ולא פג תוקף',   5),
  ('ambu',          'אמבו — מוכן ונקי',               6),
  ('suction',       'ציוד שאיבה — תקין',              7)
) AS item(key, label, ord)
ON CONFLICT (clinic_id, key) DO NOTHING;
```

- [ ] **Step 2: Verify migration file exists**

```bash
ls migrations/075_crash_cart_items.sql
```
Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add migrations/075_crash_cart_items.sql
git commit -m "feat(crash-cart): add vt_crash_cart_items migration with seed"
```

---

## Task 2: Drizzle schema + type export

**Files:**
- Modify: `server/db.ts` (after line 922, the `crashCartChecks` block)

- [ ] **Step 1: Add the table definition and type export**

In `server/db.ts`, after the `crashCartChecks` table block and before `export type CrashCartCheck`, insert:

```typescript
export const crashCartItems = pgTable(
  "vt_crash_cart_items",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    requiredQty: integer("required_qty").notNull().default(1),
    expiryWarnDays: integer("expiry_warn_days"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (table) => ({
    clinicActiveIdx: index("idx_vt_crash_cart_items_clinic").on(table.clinicId),
  }),
);

export type CrashCartItem = typeof crashCartItems.$inferSelect;
```

Also add `CrashCartItem` to the existing type export block (line ~924):

```typescript
export type CrashCartCheck = typeof crashCartChecks.$inferSelect;
// CrashCartItem is exported directly above with its table definition
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors relating to `crashCartItems` or `CrashCartItem`.

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat(crash-cart): add crashCartItems drizzle table + CrashCartItem type"
```

---

## Task 3: Frontend type + API client

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add CrashCartItem interface to types**

In `src/types/index.ts`, after the `CrashCartCheck`-related types (or near the end of the file before the last export), add:

```typescript
export interface CrashCartItem {
  id: string;
  clinicId: string;
  key: string;
  label: string;
  requiredQty: number;
  expiryWarnDays: number | null;
  sortOrder: number;
  active: boolean;
}

export interface CreateCrashCartItemRequest {
  key: string;
  label: string;
  requiredQty?: number;
  expiryWarnDays?: number | null;
}

export interface UpdateCrashCartItemRequest {
  label?: string;
  requiredQty?: number;
  expiryWarnDays?: number | null;
  sortOrder?: number;
}
```

- [ ] **Step 2: Add API client namespace**

In `src/lib/api.ts`, after the `formulary` namespace (around line 970), add:

```typescript
  crashCartItems: {
    list: () => request<CrashCartItem[]>("/api/crash-cart/items"),
    create: (data: CreateCrashCartItemRequest) =>
      request<CrashCartItem>("/api/crash-cart/items", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateCrashCartItemRequest) =>
      request<CrashCartItem>(`/api/crash-cart/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<void>(`/api/crash-cart/items/${id}`, { method: "DELETE" }),
  },
```

Also add the import of `CrashCartItem`, `CreateCrashCartItemRequest`, and `UpdateCrashCartItemRequest` to the type imports at the top of `src/lib/api.ts` (find the existing import from `@/types` and add them).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/api.ts
git commit -m "feat(crash-cart): add CrashCartItem types + api.crashCartItems client"
```

---

## Task 4: Backend — crash cart items endpoints

**Files:**
- Modify: `server/routes/crash-cart.ts`

- [ ] **Step 1: Add import and Zod schemas**

At the top of `server/routes/crash-cart.ts`, add to existing imports:

```typescript
import { crashCartItems } from "../db.js";
import { asc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
```

Then add Zod schemas after the existing `submitCheckSchema`:

```typescript
const createItemSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "key must be lowercase alphanumeric with underscores"),
  label: z.string().min(1).max(300),
  requiredQty: z.number().int().min(1).optional().default(1),
  expiryWarnDays: z.number().int().min(1).optional().nullable(),
});

const updateItemSchema = z.object({
  label: z.string().min(1).max(300).optional(),
  requiredQty: z.number().int().min(1).optional(),
  expiryWarnDays: z.number().int().min(1).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});
```

- [ ] **Step 2: Add GET /api/crash-cart/items**

```typescript
// GET /api/crash-cart/items — list active items for clinic
router.get("/items", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;

    // Auto-seed if no items exist yet for this clinic
    const existing = await db
      .select()
      .from(crashCartItems)
      .where(eq(crashCartItems.clinicId, clinicId))
      .limit(1);

    if (existing.length === 0) {
      const DEFAULT_ITEMS = [
        { key: "defibrillator", label: "דפיברילטור — טעון ומוכן",    sortOrder: 0 },
        { key: "oxygen",        label: "חמצן — מחובר ופתוח",          sortOrder: 1 },
        { key: "iv_line",       label: "עירוי IV — מוכן (קו פתוח)",   sortOrder: 2 },
        { key: "epinephrine",   label: "אפינפרין — זמין ולא פג תוקף", sortOrder: 3 },
        { key: "atropine",      label: "אטרופין — זמין ולא פג תוקף",  sortOrder: 4 },
        { key: "vasopressin",   label: "וזופרסין — זמין ולא פג תוקף", sortOrder: 5 },
        { key: "ambu",          label: "אמבו — מוכן ונקי",            sortOrder: 6 },
        { key: "suction",       label: "ציוד שאיבה — תקין",           sortOrder: 7 },
      ];
      await db.insert(crashCartItems).values(
        DEFAULT_ITEMS.map((item) => ({
          id: randomUUID(),
          clinicId,
          key: item.key,
          label: item.label,
          requiredQty: 1,
          expiryWarnDays: null,
          sortOrder: item.sortOrder,
          active: true,
        }))
      ).onConflictDoNothing();
    }

    const items = await db
      .select()
      .from(crashCartItems)
      .where(and(eq(crashCartItems.clinicId, clinicId), eq(crashCartItems.active, true)))
      .orderBy(asc(crashCartItems.sortOrder));

    res.json(items);
  } catch (err) {
    console.error("[crash-cart] list items failed", err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "LIST_ITEMS_FAILED", message: "Failed to list items", requestId }));
  }
});
```

- [ ] **Step 3: Add POST /api/crash-cart/items**

```typescript
// POST /api/crash-cart/items — create a new item (admin only)
router.post("/items", requireAuth, requireAdmin, validateBody(createItemSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const body = req.body as z.infer<typeof createItemSchema>;

    // Determine next sort_order
    const rows = await db
      .select({ sortOrder: crashCartItems.sortOrder })
      .from(crashCartItems)
      .where(eq(crashCartItems.clinicId, clinicId))
      .orderBy(desc(crashCartItems.sortOrder))
      .limit(1);
    const nextOrder = rows.length > 0 ? rows[0].sortOrder + 1 : 0;

    const id = randomUUID();
    const [created] = await db.insert(crashCartItems).values({
      id,
      clinicId,
      key: body.key,
      label: body.label,
      requiredQty: body.requiredQty ?? 1,
      expiryWarnDays: body.expiryWarnDays ?? null,
      sortOrder: nextOrder,
      active: true,
    }).returning();

    res.status(201).json(created);
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes("uq_crash_cart_item_key")) {
      return res.status(409).json(apiError({ code: "KEY_EXISTS", reason: "KEY_EXISTS", message: "An item with that key already exists", requestId }));
    }
    console.error("[crash-cart] create item failed", err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "CREATE_ITEM_FAILED", message: "Failed to create item", requestId }));
  }
});
```

- [ ] **Step 4: Add PATCH /api/crash-cart/items/:id**

```typescript
// PATCH /api/crash-cart/items/:id — update item (admin only)
router.patch("/items/:id", requireAuth, requireAdmin, validateBody(updateItemSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { id } = req.params;
    const body = req.body as z.infer<typeof updateItemSchema>;

    const [updated] = await db
      .update(crashCartItems)
      .set({
        ...(body.label !== undefined && { label: body.label }),
        ...(body.requiredQty !== undefined && { requiredQty: body.requiredQty }),
        ...(body.expiryWarnDays !== undefined && { expiryWarnDays: body.expiryWarnDays }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      })
      .where(and(eq(crashCartItems.id, id), eq(crashCartItems.clinicId, clinicId)))
      .returning();

    if (!updated) {
      return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ITEM_NOT_FOUND", message: "Item not found", requestId }));
    }
    res.json(updated);
  } catch (err) {
    console.error("[crash-cart] update item failed", err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "UPDATE_ITEM_FAILED", message: "Failed to update item", requestId }));
  }
});
```

- [ ] **Step 5: Add DELETE /api/crash-cart/items/:id**

Add `desc` to the drizzle import at the top, then:

```typescript
// DELETE /api/crash-cart/items/:id — soft-delete item (admin only)
router.delete("/items/:id", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { id } = req.params;

    const [deactivated] = await db
      .update(crashCartItems)
      .set({ active: false })
      .where(and(eq(crashCartItems.id, id), eq(crashCartItems.clinicId, clinicId)))
      .returning();

    if (!deactivated) {
      return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ITEM_NOT_FOUND", message: "Item not found", requestId }));
    }
    res.status(204).send();
  } catch (err) {
    console.error("[crash-cart] delete item failed", err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "DELETE_ITEM_FAILED", message: "Failed to delete item", requestId }));
  }
});
```

- [ ] **Step 6: Update the existing import line at top of crash-cart.ts**

The existing import is:
```typescript
import { db, crashCartChecks, hospitalizations, animals } from "../db.js";
import { eq, and, desc, sql } from "drizzle-orm";
```

Update to:
```typescript
import { db, crashCartChecks, crashCartItems, hospitalizations, animals } from "../db.js";
import { eq, and, desc, asc, sql } from "drizzle-orm";
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server/routes/crash-cart.ts
git commit -m "feat(crash-cart): add GET/POST/PATCH/DELETE /api/crash-cart/items endpoints"
```

---

## Task 5: CrashCartAdminSheet component

**Files:**
- Create: `src/components/crash-cart-admin-sheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/crash-cart-admin-sheet.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { type CrashCartItem } from "@/types";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ItemForm = { key: string; label: string; requiredQty: number; expiryWarnDays: string };
const BLANK_FORM: ItemForm = { key: "", label: "", requiredQty: 1, expiryWarnDays: "" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CrashCartAdminSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CrashCartItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrashCartItem | null>(null);
  const [form, setForm] = useState<ItemForm>(BLANK_FORM);

  const itemsQ = useQuery({
    queryKey: ["/api/crash-cart/items"],
    queryFn: () => api.crashCartItems.list(),
    enabled: open,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.crashCartItems.create({
        key: form.key.trim(),
        label: form.label.trim(),
        requiredQty: form.requiredQty,
        expiryWarnDays: form.expiryWarnDays ? parseInt(form.expiryWarnDays) : null,
      }),
    onSuccess: () => {
      toast.success("פריט נוסף");
      qc.invalidateQueries({ queryKey: ["/api/crash-cart/items"] });
      setFormOpen(false);
    },
    onError: (err: unknown) => {
      const msg = String((err as { message?: string })?.message ?? "");
      if (msg.includes("409") || msg.includes("KEY_EXISTS")) toast.error("מפתח כבר קיים — בחר מפתח אחר");
      else toast.error("שגיאה בהוספת פריט");
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      api.crashCartItems.update(editTarget!.id, {
        label: form.label.trim(),
        requiredQty: form.requiredQty,
        expiryWarnDays: form.expiryWarnDays ? parseInt(form.expiryWarnDays) : null,
      }),
    onSuccess: () => {
      toast.success("פריט עודכן");
      qc.invalidateQueries({ queryKey: ["/api/crash-cart/items"] });
      setFormOpen(false);
    },
    onError: () => toast.error("שגיאה בעדכון פריט"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.crashCartItems.remove(id),
    onSuccess: () => {
      toast.success("פריט הוסר");
      qc.invalidateQueries({ queryKey: ["/api/crash-cart/items"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("שגיאה בהסרת פריט"),
  });

  function openCreate() {
    setEditTarget(null);
    setForm(BLANK_FORM);
    setFormOpen(true);
  }

  function openEdit(item: CrashCartItem) {
    setEditTarget(item);
    setForm({
      key: item.key,
      label: item.label,
      requiredQty: item.requiredQty,
      expiryWarnDays: item.expiryWarnDays != null ? String(item.expiryWarnDays) : "",
    });
    setFormOpen(true);
  }

  function handleSave() {
    if (editTarget) updateMut.mutate();
    else createMut.mutate();
  }

  const isPending = editTarget ? updateMut.isPending : createMut.isPending;
  const items = itemsQ.data ?? [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[80dvh] flex flex-col p-0" dir="rtl">
          <SheetHeader className="px-4 pt-5 pb-3 border-b">
            <SheetTitle>הגדרת עגלת החייאה</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {itemsQ.isPending ? (
              <p className="text-sm text-muted-foreground p-4">טוען...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">אין פריטים — הוסף ראשון</p>
            ) : (
              <div className="divide-y">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.key} · כמות: {item.requiredQty}{item.expiryWarnDays ? ` · אזהרת תוקף: ${item.expiryWarnDays}ד` : ""}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <Button onClick={openCreate} className="w-full" size="sm">
              <Plus className="h-4 w-4 ml-1" />
              הוסף פריט
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editTarget ? "ערוך פריט" : "פריט חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>מפתח (אנגלית, ללא רווחים)</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                disabled={!!editTarget}
                placeholder="epinephrine"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>תווית</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="אפינפרין — זמין ולא פג תוקף"
              />
            </div>
            <div className="space-y-1">
              <Label>כמות נדרשת</Label>
              <Input
                type="number"
                min={1}
                value={form.requiredQty}
                onChange={(e) => setForm((f) => ({ ...f, requiredQty: Math.max(1, parseInt(e.target.value) || 1) }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>אזהרת תוקף (ימים, אופציונלי)</Label>
              <Input
                type="number"
                min={1}
                value={form.expiryWarnDays}
                onChange={(e) => setForm((f) => ({ ...f, expiryWarnDays: e.target.value }))}
                placeholder="30"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} disabled={isPending || !form.label.trim() || !form.key.trim()}>
              {isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>הסר פריט?</AlertDialogTitle>
            <AlertDialogDescription>
              האם להסיר את <strong>{deleteTarget?.label}</strong> מרשימת הבדיקה?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              הסר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/crash-cart-admin-sheet.tsx
git commit -m "feat(crash-cart): add CrashCartAdminSheet component"
```

---

## Task 6: Update crash-cart page to use DB items

**Files:**
- Modify: `src/pages/crash-cart.tsx`

- [ ] **Step 1: Replace hardcoded array + add admin gear button**

Replace the entire file content with the updated version:

```tsx
// src/pages/crash-cart.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, AlertTriangle, Clock, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/error-card";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CrashCartAdminSheet } from "@/components/crash-cart-admin-sheet";
import type { CrashCartItem } from "@/types";

interface CartCheckData {
  latest: { performedAt: string; allPassed: boolean; performedByName: string } | null;
  checkedToday: boolean;
  recentChecks: Array<{ id: string; performedAt: string; allPassed: boolean; performedByName: string }>;
  criticalPatients: Array<{
    hospitalizationId: string;
    animalName: string;
    species: string;
    weightKg: number | null;
    ward: string | null;
    bay: string | null;
  }>;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}שע׳ ${m}ד׳`;
  return `${m}ד׳`;
}

export default function CrashCartCheckPage() {
  const { userId, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);

  const itemsQ = useQuery({
    queryKey: ["/api/crash-cart/items"],
    queryFn: () => api.crashCartItems.list(),
    enabled: !!userId,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const cartItems: CrashCartItem[] = itemsQ.data ?? [];

  const allChecked = cartItems.length > 0 && cartItems.every((i) => checked[i.id]);

  const latestQ = useQuery<CartCheckData>({
    queryKey: ["/api/crash-cart/checks/latest"],
    queryFn: async () => {
      const res = await authFetch("/api/crash-cart/checks/latest");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!userId,
    refetchOnWindowFocus: false,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const items = cartItems.map((i) => ({ key: i.key, label: i.label, checked: !!checked[i.id] }));
      const res = await authFetch("/api/crash-cart/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error("submit failed");
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/crash-cart/checks/latest"] });
    },
    onError: () => {
      toast.error("שגיאה בשמירת הבדיקה — נסה שנית");
    },
  });

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const criticalPatients = latestQ.data?.criticalPatients ?? [];
  const recentChecks = latestQ.data?.recentChecks ?? [];

  if (latestQ.isError) {
    return (
      <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
        <ErrorCard message="שגיאה בטעינת נתוני עגלת ההחייאה" onRetry={() => latestQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <CheckCircle2 className="h-6 w-6 text-green-500" />
        <h1 className="text-xl font-bold flex-1">בדיקת עגלת החייאה יומית</h1>
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => setAdminSheetOpen(true)}
            aria-label="הגדרות עגלה"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Last check status */}
      {latestQ.data && (
        <div className={cn(
          "rounded-lg border p-3 mb-4 text-sm",
          latestQ.data.checkedToday
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : "border-amber-500/30 bg-amber-500/10 text-amber-400",
        )}>
          {latestQ.data.checkedToday && latestQ.data.latest ? (
            <span>✓ נבדקה לפני {formatRelativeTime(latestQ.data.latest.performedAt)} ע״י {latestQ.data.latest.performedByName}</span>
          ) : (
            <span>⚠ העגלה לא נבדקה היום</span>
          )}
        </div>
      )}

      {/* High-risk patients */}
      {criticalPatients.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-4">
          <div className="flex items-center gap-2 mb-2 text-red-400 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" />
            מטופלים בסיכון גבוה — {criticalPatients.length}
          </div>
          <div className="flex flex-col gap-1">
            {criticalPatients.map((p) => (
              <div key={p.hospitalizationId} className="text-xs text-zinc-300 flex gap-2">
                <span className="font-medium">{p.animalName}</span>
                <span className="text-zinc-500">{p.species}{p.weightKg ? ` · ${p.weightKg} ק״ג` : ""}</span>
                {(p.ward || p.bay) && <span className="text-zinc-500">· {[p.ward, p.bay].filter(Boolean).join(" / ")}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist */}
      {itemsQ.isPending ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
          <p className="text-sm text-zinc-500">טוען פריטים...</p>
        </div>
      ) : !submitted ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">פריטים לבדיקה</h2>
          <div className="flex flex-col gap-3">
            {cartItems.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={!!checked[item.id]}
                onClick={() => toggle(item.id)}
                className={cn(
                  "flex items-center gap-3 text-right p-2 rounded-lg border transition-colors",
                  checked[item.id]
                    ? "border-green-500/40 bg-green-500/10 text-green-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600",
                )}
              >
                {checked[item.id]
                  ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  : <Circle className="h-5 w-5 text-zinc-600 shrink-0" />
                }
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </div>

          {!allChecked && (
            <textarea
              className="mt-3 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-zinc-200 placeholder-zinc-500"
              placeholder="הערות על פריטים חסרים..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          )}

          <Button
            className="mt-4 w-full"
            variant={allChecked ? "default" : "outline"}
            onClick={() => submit.mutate()}
            disabled={submit.isPending || cartItems.length === 0}
          >
            {allChecked ? "✓ כל הפריטים תקינים — שמור" : "שמור (עם פריטים חסרים)"}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 mb-4 text-center text-green-400">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
          <p className="font-semibold">הבדיקה נשמרה</p>
        </div>
      )}

      {/* Recent history */}
      {recentChecks.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> היסטוריית בדיקות
          </h2>
          <div className="flex flex-col gap-2">
            {recentChecks.map((check) => (
              <div key={check.id} className="flex justify-between items-center text-xs text-zinc-400">
                <span>{new Date(check.performedAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-zinc-500">{check.performedByName}</span>
                <span className={check.allPassed ? "text-green-400" : "text-red-400"}>
                  {check.allPassed ? "✓ תקין" : "⚠ חסר"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <CrashCartAdminSheet open={adminSheetOpen} onOpenChange={setAdminSheetOpen} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/crash-cart.tsx
git commit -m "feat(crash-cart): replace hardcoded items with DB fetch + admin gear button"
```

---

## Task 7: FormularyAdminSheet component

**Files:**
- Create: `src/components/formulary-admin-sheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/formulary-admin-sheet.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { type DrugFormularyEntry, type CreateDrugFormularyRequest } from "@/types";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DrugForm = {
  name: string;
  genericName: string;
  brandNames: string;       // comma-separated
  targetSpecies: string;    // comma-separated
  category: string;
  dosageNotes: string;
  concentrationMgMl: string;
  standardDose: string;
  minDose: string;
  maxDose: string;
  doseUnit: "mg_per_kg" | "mcg_per_kg" | "mEq_per_kg" | "tablet";
  defaultRoute: string;
  unitType: "vial" | "ampule" | "tablet" | "capsule" | "bag" | "";
  unitVolumeMl: string;
};

const BLANK_FORM: DrugForm = {
  name: "", genericName: "", brandNames: "", targetSpecies: "",
  category: "", dosageNotes: "", concentrationMgMl: "", standardDose: "",
  minDose: "", maxDose: "", doseUnit: "mg_per_kg", defaultRoute: "",
  unitType: "", unitVolumeMl: "",
};

function formToRequest(form: DrugForm): CreateDrugFormularyRequest {
  return {
    name: form.name.trim(),
    genericName: form.genericName.trim(),
    brandNames: form.brandNames ? form.brandNames.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    targetSpecies: form.targetSpecies ? form.targetSpecies.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    category: form.category.trim() || null,
    dosageNotes: form.dosageNotes.trim() || null,
    concentrationMgMl: parseFloat(form.concentrationMgMl),
    standardDose: parseFloat(form.standardDose),
    minDose: form.minDose ? parseFloat(form.minDose) : null,
    maxDose: form.maxDose ? parseFloat(form.maxDose) : null,
    doseUnit: form.doseUnit,
    defaultRoute: form.defaultRoute.trim() || null,
    unitType: (form.unitType || null) as CreateDrugFormularyRequest["unitType"],
    unitVolumeMl: form.unitVolumeMl ? parseFloat(form.unitVolumeMl) : null,
  };
}

function entryToForm(entry: DrugFormularyEntry): DrugForm {
  return {
    name: entry.name,
    genericName: entry.genericName,
    brandNames: (entry.brandNames ?? []).join(", "),
    targetSpecies: (entry.targetSpecies ?? []).join(", "),
    category: entry.category ?? "",
    dosageNotes: entry.dosageNotes ?? "",
    concentrationMgMl: String(entry.concentrationMgMl),
    standardDose: String(entry.standardDose),
    minDose: entry.minDose != null ? String(entry.minDose) : "",
    maxDose: entry.maxDose != null ? String(entry.maxDose) : "",
    doseUnit: entry.doseUnit,
    defaultRoute: entry.defaultRoute ?? "",
    unitType: entry.unitType ?? "",
    unitVolumeMl: entry.unitVolumeMl != null ? String(entry.unitVolumeMl) : "",
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FormularyAdminSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DrugFormularyEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrugFormularyEntry | null>(null);
  const [form, setForm] = useState<DrugForm>(BLANK_FORM);

  const formularyQ = useQuery({
    queryKey: ["/api/formulary"],
    queryFn: () => api.formulary.list(),
    enabled: open,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const filtered = (formularyQ.data ?? []).filter(
    (d) =>
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.genericName.toLowerCase().includes(search.toLowerCase()),
  );

  const createMut = useMutation({
    mutationFn: () => api.formulary.upsert(formToRequest(form)),
    onSuccess: () => {
      toast.success("תרופה נוספה");
      qc.invalidateQueries({ queryKey: ["/api/formulary"] });
      setFormOpen(false);
    },
    onError: () => toast.error("שגיאה בהוספת תרופה"),
  });

  const updateMut = useMutation({
    mutationFn: () => api.formulary.update(editTarget!.id, formToRequest(form)),
    onSuccess: () => {
      toast.success("תרופה עודכנה");
      qc.invalidateQueries({ queryKey: ["/api/formulary"] });
      setFormOpen(false);
    },
    onError: () => toast.error("שגיאה בעדכון תרופה"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.formulary.remove(id),
    onSuccess: () => {
      toast.success("תרופה הוסרה");
      qc.invalidateQueries({ queryKey: ["/api/formulary"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("שגיאה בהסרת תרופה"),
  });

  function openCreate() {
    setEditTarget(null);
    setForm(BLANK_FORM);
    setFormOpen(true);
  }

  function openEdit(entry: DrugFormularyEntry) {
    setEditTarget(entry);
    setForm(entryToForm(entry));
    setFormOpen(true);
  }

  function handleSave() {
    if (editTarget) updateMut.mutate();
    else createMut.mutate();
  }

  const isPending = editTarget ? updateMut.isPending : createMut.isPending;
  const isFormValid = form.name.trim() && form.genericName.trim() &&
    parseFloat(form.concentrationMgMl) > 0 && parseFloat(form.standardDose) > 0;

  function f(key: keyof DrugForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-4 pt-5 pb-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle>ניהול פורמולריום</SheetTitle>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                הוסף תרופה
              </Button>
            </div>
            <div className="relative mt-2">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש שם תרופה..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ps-9"
              />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto divide-y">
            {formularyQ.isPending ? (
              <p className="text-sm text-muted-foreground p-4">טוען...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">אין תרופות — הוסף ראשון</p>
            ) : (
              filtered.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.genericName} · {entry.concentrationMgMl} mg/ml · {entry.standardDose} {entry.doseUnit.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "ערוך תרופה" : "תרופה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>שם תרופה *</Label>
                <Input value={form.name} onChange={f("name")} placeholder="Propofol" />
              </div>
              <div className="space-y-1">
                <Label>שם גנרי *</Label>
                <Input value={form.genericName} onChange={f("genericName")} placeholder="Propofol" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>שמות מסחריים (פסיק מפריד)</Label>
              <Input value={form.brandNames} onChange={f("brandNames")} placeholder="Diprivan, Fresofol" />
            </div>
            <div className="space-y-1">
              <Label>מינים (פסיק מפריד)</Label>
              <Input value={form.targetSpecies} onChange={f("targetSpecies")} placeholder="dog, cat" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>קטגוריה</Label>
                <Input value={form.category} onChange={f("category")} placeholder="Anesthetic" />
              </div>
              <div className="space-y-1">
                <Label>נתיב מתן</Label>
                <Input value={form.defaultRoute} onChange={f("defaultRoute")} placeholder="IV" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ריכוז (mg/ml) *</Label>
                <Input type="number" min={0.001} step="any" value={form.concentrationMgMl} onChange={f("concentrationMgMl")} placeholder="10" />
              </div>
              <div className="space-y-1">
                <Label>מינון סטנדרטי *</Label>
                <Input type="number" min={0.001} step="any" value={form.standardDose} onChange={f("standardDose")} placeholder="6" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>מינון מינימום</Label>
                <Input type="number" min={0} step="any" value={form.minDose} onChange={f("minDose")} placeholder="4" />
              </div>
              <div className="space-y-1">
                <Label>מינון מקסימום</Label>
                <Input type="number" min={0} step="any" value={form.maxDose} onChange={f("maxDose")} placeholder="8" />
              </div>
              <div className="space-y-1">
                <Label>יחידת מינון</Label>
                <Select
                  value={form.doseUnit}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, doseUnit: v as DrugForm["doseUnit"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mg_per_kg">mg/kg</SelectItem>
                    <SelectItem value="mcg_per_kg">mcg/kg</SelectItem>
                    <SelectItem value="mEq_per_kg">mEq/kg</SelectItem>
                    <SelectItem value="tablet">tablet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>סוג אריזה</Label>
                <Select
                  value={form.unitType || "__none__"}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, unitType: v === "__none__" ? "" : v as DrugForm["unitType"] }))}
                >
                  <SelectTrigger><SelectValue placeholder="— ללא —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— ללא —</SelectItem>
                    <SelectItem value="vial">Vial</SelectItem>
                    <SelectItem value="ampule">Ampule</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="capsule">Capsule</SelectItem>
                    <SelectItem value="bag">Bag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>נפח יחידה (ml)</Label>
                <Input type="number" min={0} step="any" value={form.unitVolumeMl} onChange={f("unitVolumeMl")} placeholder="20" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>הערות מינון</Label>
              <Textarea value={form.dosageNotes} onChange={f("dosageNotes")} placeholder="הוראות מינון מיוחדות..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} disabled={isPending || !isFormValid}>
              {isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>הסר תרופה?</AlertDialogTitle>
            <AlertDialogDescription>
              האם להסיר את <strong>{deleteTarget?.name}</strong> מהפורמולריום?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              הסר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/formulary-admin-sheet.tsx
git commit -m "feat(formulary): add FormularyAdminSheet component"
```

---

## Task 8: Wire FormularyAdminSheet into meds page

**Files:**
- Modify: `src/pages/meds.tsx`

- [ ] **Step 1: Add imports and state**

In `src/pages/meds.tsx`, line 1 currently reads:
```typescript
import { useCallback, useMemo, useRef } from "react";
```
Replace it with:
```typescript
import { useCallback, useMemo, useRef, useState } from "react";
```

Then add to the lucide import block (`{ Beaker, Loader2, Pill, Syringe }` → add `FlaskConical`):
```typescript
import { Beaker, FlaskConical, Loader2, Pill, Syringe } from "lucide-react";
```

Add at the end of the imports section:
```typescript
import { FormularyAdminSheet } from "@/components/formulary-admin-sheet";
```

- [ ] **Step 2: Add isAdmin + state in MedicationHubPage**

In `MedicationHubPage`, find:
```typescript
const { userId, role, effectiveRole, isLoaded } = useAuth();
```
Replace with:
```typescript
const { userId, role, effectiveRole, isLoaded, isAdmin } = useAuth();
```

Add state after the existing `useMemo`:
```typescript
const [formularySheetOpen, setFormularySheetOpen] = useState(false);
```

- [ ] **Step 3: Add button to header**

Find the header block in the JSX (around the `<h1>` with `t.medsPage.title`):

```tsx
<div className="space-y-1">
  <h1 className="text-2xl font-bold flex items-center gap-2">
    <Pill className="h-6 w-6 text-primary" />
    {t.medsPage.title}
  </h1>
  <p className="text-sm text-muted-foreground">
    {canExecuteTask ? t.medsPage.executeDesc : t.medsPage.prescribeDesc}
  </p>
</div>
```

Replace with:
```tsx
<div className="space-y-1">
  <div className="flex items-center justify-between">
    <h1 className="text-2xl font-bold flex items-center gap-2">
      <Pill className="h-6 w-6 text-primary" />
      {t.medsPage.title}
    </h1>
    {isAdmin && (
      <Button
        variant="outline"
        size="sm"
        className="h-9 text-xs"
        onClick={() => setFormularySheetOpen(true)}
      >
        <FlaskConical className="h-4 w-4 mr-1" />
        ניהול פורמולריום
      </Button>
    )}
  </div>
  <p className="text-sm text-muted-foreground">
    {canExecuteTask ? t.medsPage.executeDesc : t.medsPage.prescribeDesc}
  </p>
</div>
```

- [ ] **Step 4: Mount the sheet at end of return JSX**

Before the closing `</Layout>` tag, add:

```tsx
{isAdmin && (
  <FormularyAdminSheet
    open={formularySheetOpen}
    onOpenChange={setFormularySheetOpen}
  />
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/meds.tsx
git commit -m "feat(formulary): add Manage Formulary button + sheet to meds page"
```

---

## Task 9: Register crash-cart items route in server

**Files:**
- Modify: `server/index.ts` (or wherever crash-cart route is registered)

- [ ] **Step 1: Check if crash-cart route is already mounted**

```bash
grep -n "crash-cart\|crashCart" server/index.ts
```

If the crash-cart router is already mounted (e.g., `app.use("/api/crash-cart", crashCartRouter)`), no change is needed — the new `/items` sub-routes are already inside that router.

If it is not mounted, add:
```typescript
import crashCartRouter from "./routes/crash-cart.js";
// ...
app.use("/api/crash-cart", crashCartRouter);
```

- [ ] **Step 2: Commit if changed**

```bash
git add server/index.ts
git commit -m "feat(crash-cart): ensure crash-cart router is mounted"
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] `GET /api/crash-cart/items` returns items for the clinic (test with a real browser session)
- [ ] Admin user sees gear icon on `/crash-cart` page; non-admin does not
- [ ] Admin can add a new crash cart item; it immediately appears in the daily checklist
- [ ] Admin can edit label/qty/expiry on an existing item
- [ ] Admin can delete an item (it disappears from checklist)
- [ ] Daily check submission still works using DB items (not hardcoded keys)
- [ ] Admin user sees "ניהול פורמולריום" button on `/meds` page; non-admin does not
- [ ] Admin can add, edit, and delete drugs in the formulary sheet
- [ ] Migration `075_crash_cart_items.sql` seeds correctly on a fresh DB (idempotent)
- [ ] `npx tsc --noEmit` passes with no errors
