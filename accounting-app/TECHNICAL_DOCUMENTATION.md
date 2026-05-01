# Technical Documentation: Update Screens Module

## Module Architecture

### Module Dependencies

#### ui-update-coa.js Dependencies
```javascript
import { getAll, bulkInsert } from './db.js';
import { buildAccountTree } from './accounts.js';
import { ACCOUNT_TYPES, formatDate, parseDate } from './models.js';
```

- **db.js**: Provides `getAll()` and `bulkInsert()` for IndexedDB operations
- **accounts.js**: Provides `buildAccountTree()` for parent-child validation
- **models.js**: Provides constants and utility functions

#### ui-update-transactions.js Dependencies
```javascript
import { getAll, bulkInsert } from './db.js';
import { buildAccountTree } from './accounts.js';
import { formatDate, toFloat } from './models.js';
```

---

## Data Structures

### Account Object (from COA)
```javascript
{
    shortCode: String,              // Unique identifier (e.g., "ACC001")
    name: String,                   // Account name
    fullAccountName: String,        // Hierarchical path (e.g., "Assets:Current:Cash")
    description: String,            // Account description
    type: String,                   // One of: Asset, Liability, Equity, Income, Expense
    parentShortCode: String,        // Reference to parent account
    openingDate: String,            // Format: dd-mmm-yyyy
    openingBalance: Number,         // Starting balance
    balance: Number                 // Computed current balance (from accounts.js)
}
```

### Transaction Object
```javascript
{
    id: Number,                     // Auto-increment ID (from IndexedDB)
    mainAccount: String,            // Short code of main account
    transactionDate: String,        // Format: dd-mmm-yyyy
    valueDate: String,              // Format: dd-mmm-yyyy
    description: String,            // Transaction description
    comments1: String,              // First comment
    comments2: String,              // Second comment
    depositAmount: Number,          // Absolute value, >= 0
    withdrawalAmount: Number,       // Absolute value, >= 0
    targetAccount: String           // Short code of linked account
}
```

---

## Function Reference

### ui-update-coa.js

#### `renderUpdateCoaTab()`
**Purpose**: Main entry point for rendering the Update COA screen

**Parameters**: None

**Returns**: Promise<void>

**Process**:
1. Queries IndexedDB for all accounts
2. Builds account tree for circular reference detection
3. Creates account map for parent validation
4. Generates HTML table with editable rows
5. Attaches event listeners for buttons

**Side Effects**: 
- Modifies DOM (fills update-coa-root element)
- Attaches click handlers to buttons

#### `saveCoaChanges(accMap)`
**Purpose**: Validates and saves account changes

**Parameters**:
- `accMap` (Object): Map of shortCode → account node for validation

**Returns**: Promise<void>

**Validation Steps**:
1. Reads all table rows
2. For each row:
   - Validates account type is valid
   - Validates parent exists (if changed)
   - Checks for circular references
   - Validates date format
3. Throws error if any validation fails
4. Saves valid accounts to IndexedDB

**Throws**: Error with validation messages

#### `isCircularReference(shortCode, parentShortCode, accMap, visited)`
**Purpose**: Detects circular parent-child relationships

**Parameters**:
- `shortCode` (String): Current account code
- `parentShortCode` (String): Parent to check
- `accMap` (Object): Account map
- `visited` (Set): Visited accounts (for recursion)

**Returns**: Boolean

**Algorithm**:
1. Check if parent already visited (cycle detected)
2. Check if trying to make account parent of itself
3. Recursively check parent's parent
4. Return true if cycle detected

#### `isValidDateFormat(dateStr)`
**Purpose**: Validates dd-mmm-yyyy date format

**Parameters**:
- `dateStr` (String): Date string to validate

**Returns**: Boolean

**Validation**: Regex pattern `/^\d{1,2}-[A-Za-z]{3}-\d{4}$/`

#### `exportCoaAsXls(accounts)`
**Purpose**: Exports accounts to XLS format

**Parameters**:
- `accounts` (Array): Array of account objects

**Returns**: Promise<void>

**Process**:
1. Creates HTML table with account data
2. Creates Blob from HTML
3. Downloads file with timestamp-based name
4. Shows success status

**File Format**: HTML table that opens as XLS in Excel/Sheets

---

### ui-update-transactions.js

#### `renderUpdateTransactionsTab()`
**Purpose**: Main entry point for rendering the Update Transactions screen

**Parameters**: None

**Returns**: Promise<void>

**Process**:
1. Queries IndexedDB for transactions and accounts
2. Creates account map for name lookup
3. Generates filter dropdown with unique main accounts
4. Creates editable table rows
5. Attaches filter and button event listeners

**Side Effects**: 
- Modifies DOM (fills update-tx-root element)
- Attaches event listeners

#### `createTransactionRow(tx, idx, accountMap)`
**Purpose**: Creates HTML for a single transaction row

**Parameters**:
- `tx` (Object): Transaction object
- `idx` (Number): Row index
- `accountMap` (Object): Map for account name lookup

**Returns**: String (HTML)

**Features**:
- All fields are editable inputs/textareas
- Target account displays with real-time name
- Format: "SHORTCODE → Account Name"

#### `saveTransactionChanges(accountMap)`
**Purpose**: Validates and saves transaction changes

**Parameters**:
- `accountMap` (Object): Map of shortCode → account for validation

**Returns**: Promise<void>

**Validation Steps**:
1. Reads visible table rows only (respects filter)
2. For each row:
   - Validates main account is specified
   - Validates at least one amount is present
   - Validates target account exists (if specified)
3. Throws error if validation fails
4. Saves to IndexedDB with original IDs

**Behavior**: Only saves rows that are currently visible (not filtered out)

**Throws**: Error with validation messages

#### `exportTransactionsAsXls(transactions)`
**Purpose**: Exports transactions to XLS format

**Parameters**:
- `transactions` (Array): Array of transaction objects

**Returns**: Promise<void>

**Process**:
1. Creates HTML table with transaction data
2. Creates Blob from HTML
3. Downloads file with timestamp-based name
4. Shows success status

**File Format**: HTML table that opens as XLS in Excel/Sheets

---

## Helper Functions

### `showStatus(id, type, message)`
**Purpose**: Updates status message display

**Parameters**:
- `id` (String): Element ID for status div
- `type` (String): 'success', 'error', 'info', or ''
- `message` (String): Message text

**Behavior**: Sets class and text content of status element

### `escHtml(str)`
**Purpose**: Escapes HTML special characters

**Parameters**:
- `str` (String): String to escape

**Returns**: String

**Escaping**: 
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`

---

## Database Operations

### Accounts Store Operations
```javascript
// Get all accounts
const accounts = await getAll('accounts');

// Save updated accounts
await bulkInsert('accounts', updatedArray);
```

### Transactions Store Operations
```javascript
// Get all transactions
const transactions = await getAll('transactions');

// Save updated transactions
await bulkInsert('transactions', updatedArray);
```

**Note**: IndexedDB keyPath handling:
- Accounts: keyPath is 'shortCode' (string key)
- Transactions: keyPath is 'id' (auto-increment)

---

## Event Handling

### Update COA Events
1. **Filter Change**: Not implemented for COA (shows all accounts)
2. **Save Button**: Triggers validation and save
3. **Export Button**: Triggers XLS download

### Update Transactions Events
1. **Filter Dropdown**: Hides/shows rows based on main account selection
2. **Save Button**: Triggers validation and save (visible rows only)
3. **Export Button**: Triggers XLS download

---

## HTML Structure

### Update COA Container
```html
<section id="tab-update-coa" class="tab-content">
    <div id="update-coa-root"></div>
</section>
```

### Generated Content Structure
```html
<div class="panel">
    <h2>Update Chart of Accounts</h2>
    <p class="hint">...</p>
    <div class="button-row">
        <button id="btn-save-coa-changes" class="btn">Save Changes</button>
        <button id="btn-export-coa-xls" class="btn">Download COA (XLS)</button>
    </div>
    <div id="coa-update-status" class="status-msg"></div>
    <div class="table-scroll">
        <table class="edit-table" id="coa-edit-table">
            <!-- Dynamic rows -->
        </table>
    </div>
</div>
```

### Update Transactions Container
```html
<section id="tab-update-transactions" class="tab-content">
    <div id="update-tx-root"></div>
</section>
```

### Generated Content Structure
```html
<div class="panel">
    <h2>Update Transactions</h2>
    <p class="hint">...</p>
    <div class="filter-bar">
        <label>Select Main Account:</label>
        <select id="tx-filter-account">
            <!-- Options from unique main accounts -->
        </select>
    </div>
    <div class="button-row">
        <button id="btn-save-tx-changes" class="btn">Save Changes</button>
        <button id="btn-export-tx-xls" class="btn">Download Transactions (XLS)</button>
    </div>
    <div id="tx-update-status" class="status-msg"></div>
    <div class="table-scroll">
        <table class="edit-table" id="tx-edit-table">
            <!-- Dynamic rows -->
        </table>
    </div>
</div>
```

---

## CSS Classes

### Table Styling
- `.edit-table`: Main table styling
- `.edit-table th`: Header styling
- `.edit-table td`: Cell styling
- `.edit-table tbody tr:hover`: Hover state

### Input Styling
- `.cell-input`: Text input styling
- `.cell-select`: Select dropdown styling
- `.cell-input:focus`: Focus state

### Filter Bar
- `.filter-bar`: Container for filter UI
- `.filter-bar select`: Filter dropdown styling

### Special Elements
- `.target-account-cell`: Container with flexbox
- `.target-account-name`: Inline account name display

---

## Performance Considerations

### Memory Usage
- All accounts/transactions loaded into memory
- Tables with 1000+ rows still perform well
- DOM updates only on save/refresh

### Rendering Speed
- HTML generation is string concatenation (fast)
- No virtual scrolling needed (CSS overflow handles large tables)
- Filtering is O(n) but instant for typical datasets

### Database Operations
- All DB operations are async/await
- No blocking operations
- Single transaction per save

---

## Error Handling

### User-Facing Errors
Displayed via `showStatus()` with .error class:
- Invalid account types
- Missing parent accounts
- Circular reference detected
- Invalid date formats
- Missing required fields

### Validation Errors
Collected in array and displayed as multi-line error:
```javascript
errors.push(`Row ${idx + 1}: Description of error`);
// Later displayed as:
throw new Error(errors.join('\n'));
```

---

## Testing Checklist

### Update COA Tests
- [ ] Load with empty database (show message)
- [ ] Load with accounts, display all fields
- [ ] Edit name and save successfully
- [ ] Change parent to valid parent, save
- [ ] Change parent to invalid parent, show error
- [ ] Create circular reference, show error
- [ ] Change to invalid type, show error
- [ ] Export all accounts to XLS
- [ ] Verify XLS format matches import format

### Update Transactions Tests
- [ ] Load with empty database (show message)
- [ ] Load with transactions, display all fields
- [ ] Filter by account, shows filtered transactions
- [ ] Filter "All Accounts", shows all transactions
- [ ] Edit transaction details, save successfully
- [ ] Target account name updates in real-time
- [ ] Save without main account, show error
- [ ] Save without any amount, show error
- [ ] Invalid target account, show error
- [ ] Filter and save, only visible rows saved
- [ ] Export all transactions to XLS
- [ ] Verify XLS format matches import format

---

## Integration Points

### app.js Integration
```javascript
// Imports
import { renderUpdateCoaTab } from './ui-update-coa.js';
import { renderUpdateTransactionsTab } from './ui-update-transactions.js';

// In refreshCurrentView()
case 'tab-update-coa':
    await renderUpdateCoaTab();
    break;
case 'tab-update-transactions':
    await renderUpdateTransactionsTab();
    break;
```

### HTML Integration
Two new tab buttons and content sections added to index.html

### CSS Integration
New classes added to styles.css for table and input styling

---

## Future Extension Points

### Could be Enhanced With:
1. **Undo/Redo**: Store change history
2. **Bulk Operations**: Select multiple rows
3. **Sorting**: Click headers to sort
4. **Advanced Search**: Multi-field search in tables
5. **Drag-and-drop**: Reorder rows or change parents
6. **Batch Import**: Preview before saving
7. **Change Tracking**: Show which fields changed
8. **Diff View**: Compare before/after
9. **Permissions**: Field-level or row-level access control
10. **Audit Log**: Track all changes with timestamp/user

