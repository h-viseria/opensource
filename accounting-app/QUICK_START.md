# Quick Start Guide: Update COA & Update Transactions

## What's New?

Two powerful new screens have been added to the Web Accounting System:

1. **Update COA** - Edit your Chart of Accounts in a tabular view with validation
2. **Update Transactions** - Edit transactions with account filters and real-time account name display

---

## Where to Find Them

In the main navigation, you'll see new tabs:
- **Update COA** - Located between "Import / Backup" and "Rules" tabs
- **Update Transactions** - Located right after "Update COA" tab

---

## Update COA - Quick Guide

### Step 1: Open the Tab
Click the **"Update COA"** tab in the navigation

### Step 2: You'll See
- A table with all your accounts
- Editable fields for each account
- Save and Download buttons

### Step 3: Make Changes
Click on any field to edit:
- Account Name
- Full Account Name
- Description
- Type (dropdown)
- Parent Short Code
- Opening Date
- Opening Balance

### Step 4: Save Your Changes
Click **"Save Changes"** button
- ✅ System validates all changes
- ✅ Shows error messages if something is wrong
- ✅ Saves to database on success

### Step 5: Download Your Data
Click **"Download COA (XLS)"** to export your accounts
- Excel/Sheets compatible format
- Same format as upload, so you can re-import if needed

### Tips:
- Date format must be: **dd-mmm-yyyy** (e.g., 20-Apr-2026)
- Account Type must be: Asset, Liability, Equity, Income, or Expense
- Parent account must exist in the system
- No circular references allowed (A can't be parent of B if B is parent of A)

---

## Update Transactions - Quick Guide

### Step 1: Open the Tab
Click the **"Update Transactions"** tab in the navigation

### Step 2: You'll See
- A dropdown to filter by account
- A table with all transactions (or filtered ones)
- Save and Download buttons

### Step 3: Filter (Optional)
Use the **"Select Main Account"** dropdown to see only transactions for that account
- Select an account → see only its transactions
- Select "-- All Accounts --" → see all transactions

### Step 4: Make Changes
Click on any field to edit:
- Main Account
- Transaction Date
- Value Date
- Description
- Comments 1 & 2
- Deposit Amount
- Withdrawal Amount
- Target Account

### Step 5: Watch Account Names
As you type in the Target Account field, the system shows you the account name:
- Example: "CASH → Cash Account"
- Helps verify you've entered the correct account

### Step 6: Save Your Changes
Click **"Save Changes"** button
- ✅ System validates only visible rows
- ✅ If you filtered, only those filtered rows are saved
- ✅ Shows error messages if something is wrong
- ✅ Saves to database on success

### Step 7: Download Your Data
Click **"Download Transactions (XLS)"** to export your transactions
- Excel/Sheets compatible format
- Same format as upload

### Tips:
- Filter first to focus on specific accounts
- Check the account name display to verify target accounts
- At least one of Deposit or Withdrawal amount is required
- Amounts are automatically converted to positive values
- Filtered data is saved separately from all data

---

## Common Tasks

### Task 1: Update Account Details
1. Go to "Update COA" tab
2. Find your account row
3. Edit the fields you need to change
4. Click "Save Changes"
5. See confirmation message

### Task 2: Change Account Parent
1. Go to "Update COA" tab
2. Find the account to update
3. Enter parent account code in "Parent Short Code" column
4. Click "Save Changes"
5. System validates parent exists

### Task 3: Filter and Update Transactions for One Account
1. Go to "Update Transactions" tab
2. Select account from dropdown
3. Table shows only that account's transactions
4. Edit the transaction details
5. Click "Save Changes" (only filtered rows saved)

### Task 4: Export and Backup Data
1. Go to "Update COA" tab, click "Download COA (XLS)"
2. Go to "Update Transactions" tab, click "Download Transactions (XLS)"
3. Files are ready in your Downloads folder
4. Can be re-imported or used as backup

### Task 5: Fix Linked Account References
1. Go to "Update Transactions" tab
2. Scroll to the "Target Account" column
3. Type the account code
4. Watch for account name to appear
5. If you see the name, it means the account exists
6. Save when all accounts are correct

---

## Error Messages You Might See

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid account type" | Typed wrong account type | Use one of: Asset, Liability, Equity, Income, Expense |
| "Parent account does not exist" | Parent code doesn't match any account | Check parent account code spelling |
| "Would create a circular reference" | Setting parent would create a loop | Choose a different parent |
| "Opening Date must be in dd-mmm-yyyy format" | Wrong date format | Use format like: 20-Apr-2026 |
| "Target Account does not exist" | Account code invalid | Check account code or leave blank |
| "Either Deposit Amount or Withdrawal Amount must be specified" | Both amounts are zero | Enter at least one amount |
| "Main Account is required" | No main account | Enter a valid main account code |

---

## Data Validation Summary

### What Gets Validated?

**When Saving COA Changes:**
- ✓ Account Type is valid
- ✓ Parent account exists
- ✓ No circular references
- ✓ Date format is correct

**When Saving Transactions:**
- ✓ Main account is required
- ✓ At least one amount exists
- ✓ Target account exists (if provided)
- ✓ Amounts are positive

---

## Import/Export Format

Both screens export data in a format compatible with the "Import / Backup" tab.

This means you can:
1. Export from these screens → "Download as XLS"
2. Edit in Excel/Sheets
3. Import back using "Import / Backup" tab
4. Or use as backup

---

## Keyboard Tips

### In Table Cells
- **Tab** - Move to next cell
- **Shift+Tab** - Move to previous cell
- **Enter** - Move to next row (in some browsers)
- **Escape** - Discard changes to that cell

### Dropdowns
- **Arrow keys** - Navigate options
- **Enter** - Select option

---

## Browser Support

Works in:
- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ✅ Any modern browser with ES6 modules support

---

## Performance Notes

- Works smoothly with 1000+ accounts
- Works smoothly with 10000+ transactions
- All operations are instant (local browser storage)
- No internet connection needed

---

## Frequently Asked Questions

**Q: Can I undo changes?**
A: Currently no. Backup your data before making changes using the "Download" buttons.

**Q: What happens if I only change some rows?**
A: Only the visible (unfiltered) rows are saved.

**Q: Can I delete accounts or transactions?**
A: These screens only support editing. To delete, use "Import / Backup" tab with a new file.

**Q: Do changes sync across devices?**
A: No, all data is local to this browser. Use "Export JSON Backup" in Import tab to transfer between devices.

**Q: Can I sort the tables?**
A: Currently no. Tables show data in the order from the database.

**Q: What's the date format again?**
A: dd-mmm-yyyy (day-month-year). Examples: 20-Apr-2026, 01-Jan-2026, 31-Mar-2026

---

## Getting Help

If something doesn't work:
1. Check the error message
2. Look up the error in the table above
3. Try again with the suggested fix
4. Export your data as backup before making changes

---

## Quick Reference

### Valid Account Types
- Asset
- Liability
- Equity
- Income
- Expense

### Date Format
dd-mmm-yyyy
- 20-Apr-2026 ✓
- 20/04/2026 ✗
- 04-20-2026 ✗

### Required Fields
**For Accounts:**
- Short Code (read-only)
- Type

**For Transactions:**
- Main Account
- At least one Amount (Deposit or Withdrawal)

---

## Summary

You now have two powerful tools to manage your accounting data:
1. **Update COA** - Keep your chart of accounts clean and organized
2. **Update Transactions** - Maintain accurate transaction records

Both screens include validation to prevent mistakes and export to standard formats for backup or re-import.

**Happy accounting! 📊**

