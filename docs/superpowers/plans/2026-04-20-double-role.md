# Double Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permanent double-role support (e.g., Technician + Admin) so a user can have clinical executor rights AND system admin rights simultaneously without requiring shift-based elevation.

**Architecture:** Add `secondary_role` column to DB. Update role resolution to compute `effectiveRole` as the higher of the two roles (when no active shift). Update `isAdmin` to check either role. Add secondary role selector to admin UI. Medication creation safety contract (vet-only) is unchanged — no secondary role combination can produce `effectiveRole = "vet"`.

**Tech Stack:** React 18, TypeScript, Express/Node, Drizzle ORM, PostgreSQL

---

## File Map

| File | Change |
|------|--------|
| `migrations/049_add_secondary_role.sql` | Add `secondary_role` column |
| `server/db.ts` | Add `secondaryRole` field to Drizzle schema |
| `server/middleware/auth.ts` | Add `secondaryRole` to `AuthUser`, update `isAdmin` bypass, include in SELECT |
| `server/lib/role-resolution.ts` | Accept `secondaryRole` param, compute effectiveRole as max of both |
| `server/routes/users.ts` | Include `secondaryRole` in responses; add PATCH `/api/users/:id/secondary-role` |
| `server/routes/appointments.ts` | Include secondary-role users in `technicians` query |
| `src/hooks/use-auth.tsx` | Add `secondaryRole` to `AuthState`, update `isAdmin` |
| `src/pages/admin.tsx` | Add secondary role selector to user edit form |

---

### Task 1: DB migration

**Files:**
- Create: `migrations/049_add_secondary_role.sql`

- [ ] **Step 1: Create the migration file**

  ```sql
  -- Add optional secondary role to support double-role users (e.g. Technician + Admin).
  -- Valid values are restricted to non-physician roles to preserve the medication creation
  -- safety contract (vet-only creation rights cannot be granted via secondary role).
  ALTER TABLE vt_users
    ADD COLUMN IF NOT EXISTS secondary_role VARCHAR(20)
      CHECK (secondary_role IN ('technician', 'senior_technician', 'admin') OR secondary_role IS NULL);
  ```

- [ ] **Step 2: Run the migration**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && node -e "
    const { db } = require('./server/db.js');
    const fs = require('fs');
    const sql = fs.readFileSync('./migrations/049_add_secondary_role.sql', 'utf8');
    db.execute(sql).then(() => { console.log('Migration OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  " 2>&1
  ```

  If the above doesn't work, apply via psql:
  ```bash
  psql $DATABASE_URL -f migrations/049_add_secondary_role.sql
  ```

  Expected: `Migration OK` or `ALTER TABLE`.

- [ ] **Step 3: Commit**

  ```bash
  git add migrations/049_add_secondary_role.sql
  git commit -m "feat(permissions): add secondary_role column to vt_users"
  ```

---

### Task 2: Update Drizzle schema in server/db.ts

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Add secondaryRole to the users table definition**

  Find the `vt_users` table definition (the `users = pgTable("vt_users", { ... })` block). Add `secondaryRole` after the `role` column:

  ```typescript
  // Find:
  role: varchar("role", { length: 20 }).notNull().default("technician"),
  status: varchar("status", { length: 20 }).notNull().default("active"),

  // Replace with:
  role: varchar("role", { length: 20 }).notNull().default("technician"),
  secondaryRole: varchar("secondary_role", { length: 20 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add server/db.ts
  git commit -m "feat(permissions): add secondaryRole to Drizzle users schema"
  ```

---

### Task 3: Update auth middleware

**Files:**
- Modify: `server/middleware/auth.ts`

- [ ] **Step 1: Add `secondaryRole` to `AuthUser` interface**

  Find (line ~21):
  ```typescript
  export interface AuthUser {
    id: string;
    clerkId: string;
    email: string;
    name: string;
    role: UserRole;
    status: string;
    clinicId: string;
    locale?: string;
  }
  ```

  Replace with:
  ```typescript
  export interface AuthUser {
    id: string;
    clerkId: string;
    email: string;
    name: string;
    role: UserRole;
    secondaryRole?: string | null;
    status: string;
    clinicId: string;
    locale?: string;
  }
  ```

- [ ] **Step 2: Include `secondary_role` in the user SELECT query**

  Find the DB query that selects the user by clerkId (look for `select({ id: users.id, ...` with `users.role`). Add `secondaryRole: users.secondaryRole` to the select object.

- [ ] **Step 3: Update `isAdmin` bypass in `requireEffectiveRole`**

  Find (line ~693):
  ```typescript
  if (req.authUser.role === "admin") {
    return next();
  }
  ```

  Replace with:
  ```typescript
  if (req.authUser.role === "admin" || req.authUser.secondaryRole === "admin") {
    return next();
  }
  ```

- [ ] **Step 4: Pass `secondaryRole` into `resolveCurrentRole` call**

  Find where `resolveCurrentRole` is called in the auth middleware. Update it to pass `secondaryRole`:

  ```typescript
  // Find the resolveCurrentRole call and add secondaryRole:
  const resolved = await resolveCurrentRole({
    clinicId,
    userId: authUser.id,
    userName: authUser.name,
    fallbackRole: authUser.role,
    secondaryRole: authUser.secondaryRole ?? null,  // ADD THIS
  });
  ```

- [ ] **Step 5: Propagate `secondaryRole` in the authUser assignment**

  Find where `req.authUser` is set from the DB result. Ensure `secondaryRole` is included:

  ```typescript
  req.authUser = {
    id: ...,
    role: ...,
    secondaryRole: dbUser.secondaryRole ?? null,  // ADD THIS
    ...
  };
  ```

- [ ] **Step 6: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add server/middleware/auth.ts
  git commit -m "feat(permissions): add secondaryRole to AuthUser and isAdmin check"
  ```

---

### Task 4: Update role-resolution.ts

**Files:**
- Modify: `server/lib/role-resolution.ts`

- [ ] **Step 1: Add `secondaryRole` to `RoleResolutionInput`**

  Find:
  ```typescript
  export interface RoleResolutionInput {
    clinicId: string;
    userId?: string;
    userName: string;
    fallbackRole: PermanentVetTrackRole;
    now?: Date;
  }
  ```

  Replace with:
  ```typescript
  export interface RoleResolutionInput {
    clinicId: string;
    userId?: string;
    userName: string;
    fallbackRole: PermanentVetTrackRole;
    secondaryRole?: string | null;
    now?: Date;
  }
  ```

- [ ] **Step 2: Compute effectiveRole as max of primary and secondary when no shift**

  The hierarchy map is in `auth.ts`. Duplicate the needed subset here:

  Find (line ~137):
  ```typescript
  if (!activeShift) {
    return {
      effectiveRole: input.fallbackRole,
      permanentRole: input.fallbackRole,
      source: "permanent",
      activeShift: null,
      resolvedAt: now,
    };
  }
  ```

  Replace with:
  ```typescript
  if (!activeShift) {
    const ROLE_LEVELS: Record<string, number> = {
      admin: 40, vet: 30, senior_technician: 25, technician: 20, student: 10,
    };
    const primaryLevel = ROLE_LEVELS[input.fallbackRole] ?? 0;
    const secondaryLevel = input.secondaryRole ? (ROLE_LEVELS[input.secondaryRole] ?? 0) : 0;
    const effectiveRole: EffectiveRole =
      secondaryLevel > primaryLevel
        ? (input.secondaryRole as EffectiveRole)
        : input.fallbackRole;
    return {
      effectiveRole,
      permanentRole: input.fallbackRole,
      source: "permanent",
      activeShift: null,
      resolvedAt: now,
    };
  }
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add server/lib/role-resolution.ts
  git commit -m "feat(permissions): resolve effectiveRole as max of primary and secondary"
  ```

---

### Task 5: Update users routes

**Files:**
- Modify: `server/routes/users.ts`

- [ ] **Step 1: Include `secondaryRole` in `GET /api/users/me` response**

  Find the handler for `GET /api/users/me`. In the select or the response body, add `secondaryRole: user.secondaryRole ?? null`.

- [ ] **Step 2: Include `secondaryRole` in `GET /api/users` list response**

  Find the handler for `GET /api/users` (the list endpoint). Add `secondaryRole` to each user in the response.

- [ ] **Step 3: Add `PATCH /api/users/:id/secondary-role` endpoint**

  After the existing `PATCH /:id/role` handler, add a new handler:

  ```typescript
  const VALID_SECONDARY_ROLES = ["technician", "senior_technician", "admin", null] as const;

  const patchSecondaryRoleSchema = z.object({
    secondaryRole: z.enum(["technician", "senior_technician", "admin"]).nullable(),
  });

  router.patch("/:id/secondary-role", requireAuth, requireRole("admin"), async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    const { id } = req.params;
    const parsed = patchSecondaryRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "VALIDATION_FAILED", requestId });
    }
    const { secondaryRole } = parsed.data;
    await db
      .update(users)
      .set({ secondaryRole })
      .where(and(eq(users.id, id), eq(users.clinicId, req.clinicId!)));
    const [updated] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.clinicId, req.clinicId!)))
      .limit(1);
    if (!updated) return res.status(404).json({ code: "USER_NOT_FOUND", requestId });
    return res.json({ user: updated });
  });
  ```

- [ ] **Step 4: Add API function in `src/lib/api.ts`**

  Near the existing `updateRole` function, add:
  ```typescript
  updateSecondaryRole: (id: string, secondaryRole: string | null) =>
    request<{ user: User }>(`/api/users/${id}/secondary-role`, {
      method: "PATCH",
      body: JSON.stringify({ secondaryRole }),
    }),
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add server/routes/users.ts src/lib/api.ts
  git commit -m "feat(permissions): add secondary role to user responses and PATCH endpoint"
  ```

---

### Task 6: Update appointments/meta to include secondary-role technicians

**Files:**
- Modify: `server/routes/appointments.ts`

This task extends Task 1 of the assignable-users-filter plan (or should be applied after it).

- [ ] **Step 1: Read the current clinicTechnicians query**

  Check that the `clinicTechnicians` query from the assignable-users-filter plan is in place.

- [ ] **Step 2: Update technicians query to include secondary-role users**

  Find the `clinicTechnicians` query. Replace the WHERE clause to also include users whose `secondary_role` is 'technician' or 'senior_technician':

  ```typescript
  const clinicTechnicians = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.clinicId, clinicId),
        isNull(users.deletedAt),
        or(
          eq(users.role, "technician"),
          eq(users.role, "senior_technician"),
          eq(users.secondaryRole, "technician"),
          eq(users.secondaryRole, "senior_technician"),
        ),
      ),
    )
    .orderBy(users.displayName, users.name);
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add server/routes/appointments.ts
  git commit -m "feat(permissions): include secondary-role technicians in assignable list"
  ```

---

### Task 7: Update frontend use-auth.tsx

**Files:**
- Modify: `src/hooks/use-auth.tsx`

- [ ] **Step 1: Add `secondaryRole` to `AuthState` interface**

  Find (line ~22):
  ```typescript
  interface AuthState {
    userId: string | null; email: string | null; name: string | null;
    role: UserRole;
    effectiveRole: UserRole | ShiftRole;
    ...
  ```

  Add `secondaryRole: string | null;` to the interface.

- [ ] **Step 2: Add `secondaryRole` to `SyncedUserResponse`**

  Find (line ~40):
  ```typescript
  interface SyncedUserResponse {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    ...
  ```

  Add `secondaryRole?: string | null;` to the interface.

- [ ] **Step 3: Update initial state defaults to include `secondaryRole: null`**

  Find all places where the initial state object is constructed (there are two: the offline snapshot path and the default path). Add `secondaryRole: null` to each.

- [ ] **Step 4: Update `isAdmin` computation**

  Find (line ~200):
  ```typescript
  isAdmin: role === "admin",
  ```

  Replace with:
  ```typescript
  isAdmin: role === "admin" || (data.secondaryRole ?? null) === "admin",
  ```

  Also find the other `isAdmin: role === "admin"` occurrences (in signOut reset state and offline snapshot path) and update them:
  ```typescript
  isAdmin: role === "admin" || secondaryRole === "admin",
  ```
  where `secondaryRole` comes from the snapshot or is null.

- [ ] **Step 5: Forward `secondaryRole` in setState calls**

  In both `syncDevSession` and `syncSession`, add to the `setState` call:
  ```typescript
  secondaryRole: (data.secondaryRole ?? null) as string | null,
  ```

- [ ] **Step 6: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/hooks/use-auth.tsx
  git commit -m "feat(permissions): add secondaryRole to auth state"
  ```

---

### Task 8: Add secondary role selector to admin.tsx

**Files:**
- Modify: `src/pages/admin.tsx`

- [ ] **Step 1: Read the user edit dialog (lines ~940-970)**

  Understand the current role selector structure before adding the secondary role selector.

- [ ] **Step 2: Add state for pending secondary role change**

  Find where `pendingRole` state is declared (used for the role change dialog). Add similar state for secondary role:

  ```typescript
  const [pendingSecondaryRole, setPendingSecondaryRole] = useState<string | null | undefined>(undefined);
  ```

  `undefined` = not editing; `null` = clear secondary role; `"admin"` etc = set secondary role.

- [ ] **Step 3: Add secondary role selector below the primary role selector (line ~963)**

  After the closing of the primary role `<Select>` (around line 963), add:

  ```tsx
  <div className="flex flex-col gap-1.5">
    <Label className="text-sm font-medium">{t.adminPage.secondaryRole ?? "Secondary Role"}</Label>
    <Select
      value={user.secondaryRole ?? "none"}
      onValueChange={(val) => setPendingSecondaryRole(val === "none" ? null : val)}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="senior_technician">Senior Technician</SelectItem>
        <SelectItem value="technician">Technician</SelectItem>
      </SelectContent>
    </Select>
  </div>
  ```

- [ ] **Step 4: Add mutation for secondary role update**

  Near the existing `updateRoleMut` mutation, add:

  ```typescript
  const updateSecondaryRoleMut = useMutation({
    mutationFn: ({ id, secondaryRole }: { id: string; secondaryRole: string | null }) =>
      api.users.updateSecondaryRole(id, secondaryRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setPendingSecondaryRole(undefined);
    },
  });
  ```

- [ ] **Step 5: Wire save button to call mutation when secondary role changed**

  Find the save/confirm handler in the user edit dialog. Add:

  ```typescript
  if (pendingSecondaryRole !== undefined) {
    await updateSecondaryRoleMut.mutateAsync({ id: user.id, secondaryRole: pendingSecondaryRole });
  }
  ```

- [ ] **Step 6: Show secondary role badge in user list**

  Find where each user's role badge is rendered in the user list. After the primary role badge, add:

  ```tsx
  {user.secondaryRole && (
    <Badge variant="outline" className="text-[10px]">+{user.secondaryRole}</Badge>
  )}
  ```

- [ ] **Step 7: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 8: Run tests**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npm test 2>&1 | tail -10
  ```
  Expected: all tests pass.

- [ ] **Step 9: Commit**

  ```bash
  git add src/pages/admin.tsx
  git commit -m "feat(permissions): add secondary role selector to admin user management"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ DB column `secondary_role` added with CHECK constraint (Task 1)
- ✅ Drizzle schema updated (Task 2)
- ✅ AuthUser includes secondaryRole, isAdmin checks both roles (Task 3)
- ✅ effectiveRole = max(primary, secondary) when no active shift (Task 4)
- ✅ Users API includes secondaryRole, PATCH endpoint added (Task 5)
- ✅ Appointments technicians query includes secondary-role users (Task 6)
- ✅ Frontend auth state includes secondaryRole and updated isAdmin (Task 7)
- ✅ Admin UI allows viewing and editing secondary role (Task 8)

**Placeholder scan:** None.

**Type consistency:**
- `secondaryRole` is `string | null` throughout (nullable column, no default)
- `EffectiveRole = PermanentVetTrackRole | ShiftRole` — `secondaryRole` values (`technician`, `senior_technician`, `admin`) are all valid `PermanentVetTrackRole` values, so the cast in Task 4 is safe
- `VALID_SECONDARY_ROLES` in users.ts excludes `vet` and `student` — the safety contract is preserved

**Safety contract:** `server/lib/task-rbac.ts` is not modified. `med.task.create` check remains `role === "vet"`. Since secondary roles are restricted to `technician | senior_technician | admin` and `resolveCurrentRole` only uses shift role (vet is not a valid shift role) OR max(primary, secondary), no code path can produce `effectiveRole === "vet"` for a non-vet primary role.
