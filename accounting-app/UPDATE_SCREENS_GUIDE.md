# Update COA & Update Transactions Screens - User Guide

## Overview
Two new screens have been added to the Web Accounting System:
1. **Update COA (Chart of Accounts)** - Edit and manage your chart of accounts
2. **Update Transactions** - Edit and manage your transactions with account filters

---

## Update COA Screen

### Purpose
The Update COA screen allows you to view and edit all accounts in your Chart of Accounts with validation and export capabilities.

### Features

#### 1. Editable Table View
- **Short Code**: Unique account identifier (non-editable)
- **Name**: Account name
- **Full Account Name**: Hierarchical account path
- **Description**: Account description
- **Type**: Account type (Asset, Liability, Equity, Income, Expense)
- **Parent Short Code**: Parent account reference
- **Opening Date**: Date account was opened (format: dd-mmm-yyyy)
- **Opening Balance**: Starting balance for the account

#### 2. Validation Rules
When saving changes, the system validates:

- **Account Type Change**: When you change an account type, it must be one of the valid types:
  - Asset
  - Liability
  - Equity
  - Income
  - Expense

- **Parent Account Change**: When you change the parent account:
  - The new parent must exist in the system
  - Changes must not create circular references (A cannot be parent of B if B is parent of A)

- **Date Format**: Opening dates must be in `dd-mmm-yyyy` format (e.g., `20-Apr-2026`)

#### 3. Save and Export
- **Save Changes Button**: Validates all entries and saves to IndexedDB
- **Download COA (XLS)**: Exports all accounts in XLS format matching the upload format:
  - Opening Date
  - Account Name
  - Description
  - Account ShortCode
  - Full Account Name
  - Account Type
  - Opening Balance

### Workflow
1. Navigate to "Update COA" tab
2. Edit desired fields in the table
3. Click "Save Changes" to validate and save
4. Use "Download COA (XLS)" to export the data in upload format
5. Status messages show success or validation errors

---

## Update Transactions Screen

### Purpose
The Update Transactions screen allows you to filter transactions by main account and edit their details with full validation.

### Features

#### 1. Account Filter
- Dropdown to filter transactions by main account
- Select "All Accounts" to view all transactions
- Filtered view updates instantly

#### 2. Editable Transaction Fields
- **Main Account**: The primary account involved in the transaction
- **Transaction Date**: When the transaction occurred (dd-mmm-yyyy)
- **Value Date**: Value date for the transaction (dd-mmm-yyyy)
- **Description**: Transaction description
- **Comments 1**: First comment field
- **Comments 2**: Second comment field
- **Deposit Amount**: Amount deposited (automatically converted to absolute value)
- **Withdrawal Amount**: Amount withdrawn (automatically converted to absolute value)
- **Target Account**: Linked account with real-time name display

#### 3. Target Account Display
- Shows the target account code and name in real-time
- Helps you verify the linked account is correct
- Displays format: "SHORTCODE → Account Name"

#### 4. Validation Rules
When saving changes, the system validates:

- **Main Account Required**: Every transaction must have a main account
- **At Least One Amount**: Either deposit or withdrawal amount must be specified
- **Valid Target Account**: If a target account is specified, it must exist in the system
- **Amount Conversion**: Amounts are automatically converted to absolute values (no negatives)

#### 5. Save and Export
- **Save Changes Button**: Validates visible rows and saves to IndexedDB
- **Download Transactions (XLS)**: Exports transactions in XLS format matching the upload format:
  - Main Account
  - Transaction Date
  - Value Date
  - Description
  - Comments1
  - Comments2
  - Deposit Amount
  - Withdrawal Amount
  - Target Account

### Workflow
1. Navigate to "Update Transactions" tab
2. (Optional) Use filter dropdown to select a specific account
3. Edit transaction details as needed
4. Click "Save Changes" to validate and save (only visible rows are saved)
5. Use "Download Transactions (XLS)" to export in upload format
6. Status messages show success or validation errors

---

## Data Format Specifications

### Export File Formats
Both screens export data in XLS format (HTML-based) compatible with:
- Microsoft Excel
- Google Sheets
- LibreOffice Calc

The export format matches the import format, allowing you to:
1. Export data using these screens
2. Modify in spreadsheet software
3. Re-import using the "Import / Backup" tab

### Date Format
Always use: **dd-mmm-yyyy** format
Examples:
- 20-Apr-2026
- 01-Jan-2026
- 31-Mar-2026

Month abbreviations: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec

### Amount Formats
- Use decimal numbers (e.g., 1000.50, 500, 0.99)
- Commas are automatically removed during processing
- Negative signs are ignored (absolute values used)

---

## Best Practices

### For Update COA:
1. **Backup First**: Export your COA before making large changes
2. **Validate Parents**: Ensure parent accounts exist before changing them
3. **Type Changes**: Be careful changing account types as it affects balance calculations
4. **Test First**: Change a few accounts and verify results before large batch updates

### For Update Transactions:
1. **Use Filters**: Filter by account to focus on related transactions
2. **Verify Target Accounts**: Check the real-time display to ensure correct accounts are linked
3. **Save Frequently**: Save after making changes to each account
4. **Export for Verification**: Export and review in spreadsheet before re-importing elsewhere

---

## Troubleshooting

### "Parent account does not exist" Error
- Verify the parent account short code is spelled correctly
- Check that the parent account exists in the system
- Parent account must be created before setting it as parent

### "Would create a circular reference" Error
- You're trying to set an account as parent of its own ancestor
- Review the account hierarchy before saving

### "Invalid account type" Error
- Type must be one of: Asset, Liability, Equity, Income, Expense
- Check spelling and capitalization

### "Target Account does not exist" Error
- The account code in Target Account field doesn't exist
- Leave blank if no target account, or use correct account code

### Data not saving
- Check for validation errors in the status message
- Ensure all required fields are filled
- Look for duplicate errors or invalid formats

---

## Technical Notes
- Changes are saved to IndexedDB (browser local storage)
- Filtered rows are not saved when using filters
- Export maintains the original data format for re-import compatibility
- All operations are performed locally in the browser

