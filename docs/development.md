# Development Notes

## Recommended Order (already implemented)

1. ✅ Authentication (Admin)
2. ✅ Database & Models
3. ✅ Chart Creation
4. ✅ Dynamic Member Management
5. ✅ Daily Meal Entry
6. ✅ Row Lock Mechanism
7. ✅ Market Expense Module
8. ✅ Calculator Module
9. ✅ Monthly Summary
10. ✅ Reports & Export
11. ✅ UI/UX (basic styling)
12. ⏭ Deployment (configure hosting)

## Auto-Lock Rules

A row is locked when:

```
date < today
AND
all members have a non-null meal entry for that date
```

The check runs every time `/api/meals/bulk` is called. Admins can force-lock or unlock any date via `/api/meals/lock-row` and `/api/meals/unlock-row`.

## Calculation Formulas

```
Meal Rate     = Total Market ÷ Total Meals
Meal Cost     = Meal Rate × Member Meals
Balance       = Member Market Paid − Meal Cost
                 Positive → Receive
                 Negative → Pay
```

## Local DB Quick Commands

```bash
# Windows
psql -U postgres
CREATE DATABASE mess_management;
\q
```